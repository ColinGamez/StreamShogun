// ── HLS-capable video player component ────────────────────────────────
//
// • Auto-detect: native HLS (Safari) → <video src>; otherwise → hls.js
// • Exponential-backoff retry (max 4 retries)
// • Overlay: channel name, resolution, buffering spinner
// • Cleanly destroys old hls.js instance on channel switch
// • Exposes no hls.js details to the parent (fully encapsulated)

import { useRef, useEffect, useState, useCallback, type RefObject } from "react";
import Hls, { type ErrorData, type Events, type HlsConfig } from "hls.js";

// ── Public interface ──────────────────────────────────────────────────

export interface HlsPlayerProps {
  /** Stream URL (.m3u8), plain video URL, or empty string. */
  src: string;
  /** Channel name shown in overlay. */
  channelName?: string;
  /** Channel logo URL for overlay. */
  channelLogo?: string;
  /** Fired when the player encounters a fatal error it can't recover from. */
  onFatalError?: (message: string) => void;
  /** Externally supplied ref so parent can access the <video> element. */
  videoRef?: RefObject<HTMLVideoElement>;
  /** Auto-play when source changes. @default true */
  autoPlay?: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────

const MAX_RETRIES = 4;
const BASE_BACKOFF_MS = 1_000;
const OVERLAY_HIDE_DELAY_MS = 4_000;

// ── Helpers ───────────────────────────────────────────────────────────

function isHlsUrl(url: string): boolean {
  try {
    const pathname = new URL(url, "http://localhost").pathname;
    return pathname.endsWith(".m3u8");
  } catch {
    return url.includes(".m3u8");
  }
}

// ── Component ─────────────────────────────────────────────────────────

export function HlsPlayer({
  src,
  channelName,
  channelLogo,
  onFatalError,
  videoRef: externalRef,
  autoPlay = true,
}: HlsPlayerProps) {
  const internalRef = useRef<HTMLVideoElement>(null);
  const videoEl = externalRef ?? internalRef;

  // ── State ───────────────────────────────────────────────────────────
  const [buffering, setBuffering] = useState(false);
  const [resolution, setResolution] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [overlayVisible, setOverlayVisible] = useState(true);

  // Track retry state across re-renders without triggering them
  const retryCount = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const overlayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Overlay auto-hide ───────────────────────────────────────────────
  const flashOverlay = useCallback(() => {
    setOverlayVisible(true);
    if (overlayTimer.current) clearTimeout(overlayTimer.current);
    overlayTimer.current = setTimeout(() => setOverlayVisible(false), OVERLAY_HIDE_DELAY_MS);
  }, []);

  // Show overlay on mouse movement or channel change
  const handleMouseMove = useCallback(() => {
    flashOverlay();
  }, [flashOverlay]);

  // ── Core attach / cleanup ───────────────────────────────────────────
  useEffect(() => {
    const video = videoEl.current;
    if (!video || !src) {
      // No source → clear everything
      setResolution("");
      setErrorMsg("");
      setBuffering(false);
      return;
    }

    // Reset per-source state
    retryCount.current = 0;
    setErrorMsg("");
    setResolution("");
    setBuffering(true);
    flashOverlay();

    // ── Abort helper (for async cleanup) ──────────────────────────────
    let destroyed = false;

    const clearRetryTimer = () => {
      if (retryTimer.current) {
        clearTimeout(retryTimer.current);
        retryTimer.current = null;
      }
    };

    // ── Destroy previous hls instance ─────────────────────────────────
    const destroyHls = () => {
      clearRetryTimer();
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };

    // ── Track resolution from <video> events ──────────────────────────
    const onResize = () => {
      if (video.videoWidth && video.videoHeight) {
        setResolution(`${video.videoWidth}×${video.videoHeight}`);
      }
    };

    const onPlaying = () => {
      setBuffering(false);
      onResize();
    };
    const onWaiting = () => setBuffering(true);
    const onCanPlay = () => setBuffering(false);

    video.addEventListener("resize", onResize);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("canplay", onCanPlay);

    // ── Strategy: native HLS (Safari) or hls.js ──────────────────────
    if (isHlsUrl(src) && Hls.isSupported()) {
      // Use hls.js
      const hlsConfig: Partial<HlsConfig> = {
        enableWorker: true,
        lowLatencyMode: false,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
      };

      const hls = new Hls(hlsConfig);
      hlsRef.current = hls;

      // ── hls.js level-loaded → resolution from manifest ─────────────
      hls.on(Hls.Events.LEVEL_LOADED, () => {
        const level = hls.levels[hls.currentLevel];
        if (level?.width && level?.height) {
          setResolution(`${level.width}×${level.height}`);
        }
      });

      // ── hls.js error handling with retry ────────────────────────────
      hls.on(Hls.Events.ERROR, (_event: Events.ERROR, data: ErrorData) => {
        if (!data.fatal) return;

        if (data.type === Hls.ErrorTypes.NETWORK_ERROR && retryCount.current < MAX_RETRIES) {
          retryCount.current += 1;
          const delay = BASE_BACKOFF_MS * 2 ** (retryCount.current - 1);
          setErrorMsg(
            `Network error – retry ${retryCount.current}/${MAX_RETRIES} in ${(delay / 1000).toFixed(0)}s…`,
          );
          clearRetryTimer();
          retryTimer.current = setTimeout(() => {
            if (destroyed) return;
            setErrorMsg("");
            hls.startLoad();
          }, delay);
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR && retryCount.current < MAX_RETRIES) {
          retryCount.current += 1;
          setErrorMsg(`Media error – recovering (${retryCount.current}/${MAX_RETRIES})…`);
          hls.recoverMediaError();
        } else {
          // Fatal & out of retries
          const msg = `Playback failed: ${data.type} / ${data.details}`;
          setErrorMsg(msg);
          onFatalError?.(msg);
        }
      });

      hls.attachMedia(video);
      hls.loadSource(src);

      if (autoPlay) {
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play().catch(() => {
            /* ignore */
          });
        });
      }
    } else {
      // Native playback (Safari HLS or plain mp4/ts URL)
      video.src = src;
      if (autoPlay) {
        video.play().catch(() => {
          /* ignore */
        });
      }

      // Basic retry for native errors
      const onNativeError = () => {
        if (destroyed) return;
        if (retryCount.current < MAX_RETRIES) {
          retryCount.current += 1;
          const delay = BASE_BACKOFF_MS * 2 ** (retryCount.current - 1);
          setErrorMsg(
            `Playback error – retry ${retryCount.current}/${MAX_RETRIES} in ${(delay / 1000).toFixed(0)}s…`,
          );
          clearRetryTimer();
          retryTimer.current = setTimeout(() => {
            if (destroyed) return;
            setErrorMsg("");
            video.src = src;
            if (autoPlay)
              video.play().catch(() => {
                /* ignore */
              });
          }, delay);
        } else {
          setErrorMsg("Playback failed after maximum retries.");
          onFatalError?.("Playback failed after maximum retries.");
        }
      };
      video.addEventListener("error", onNativeError);

      // Cleanup additions for native path
      return () => {
        destroyed = true;
        destroyHls();
        video.removeEventListener("resize", onResize);
        video.removeEventListener("playing", onPlaying);
        video.removeEventListener("waiting", onWaiting);
        video.removeEventListener("canplay", onCanPlay);
        video.removeEventListener("error", onNativeError);
        video.removeAttribute("src");
        video.load(); // release buffers
      };
    }

    // Cleanup for hls.js path
    return () => {
      destroyed = true;
      destroyHls();
      video.removeEventListener("resize", onResize);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("canplay", onCanPlay);
      video.removeAttribute("src");
      video.load();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  // Cleanup overlay timer on unmount
  useEffect(() => {
    return () => {
      if (overlayTimer.current) clearTimeout(overlayTimer.current);
    };
  }, []);

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div className="hls-player" onMouseMove={handleMouseMove}>
      <video ref={videoEl} className="hls-player-video" controls playsInline />

      {/* ── Overlay ────────────────────────────────────── */}
      <div className={`hls-overlay${overlayVisible || buffering || errorMsg ? " visible" : ""}`}>
        {/* Top bar: channel info + resolution */}
        <div className="hls-overlay-top">
          <div className="hls-overlay-channel">
            {channelLogo && (
              <img
                className="hls-overlay-logo"
                src={channelLogo}
                alt=""
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            )}
            {channelName && <span className="hls-overlay-name">{channelName}</span>}
          </div>
          {resolution && <span className="hls-overlay-res">{resolution}</span>}
        </div>

        {/* Centre: buffering spinner */}
        {buffering && !errorMsg && (
          <div className="hls-spinner-wrap">
            <div className="hls-spinner" />
          </div>
        )}

        {/* Error message */}
        {errorMsg && <div className="hls-error-banner">{errorMsg}</div>}
      </div>
    </div>
  );
}

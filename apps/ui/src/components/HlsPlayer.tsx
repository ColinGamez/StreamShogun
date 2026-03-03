// ── HLS-capable video player component ────────────────────────────────
//
// • Auto-detect: native HLS (Safari) → <video src>; otherwise → hls.js
// • Exponential-backoff retry (max 4 retries)
// • Custom overlay: channel info, resolution, buffering spinner
// • Custom control bar: volume slider, mute, fullscreen, quality picker,
//   audio track selector — replaces inconsistent browser-native controls
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
  /** Optional EPG now-playing line. */
  nowPlaying?: string;
  /** Fired when the player encounters a fatal error it can't recover from. */
  onFatalError?: (message: string) => void;
  /** Externally supplied ref so parent can access the <video> element. */
  videoRef?: RefObject<HTMLVideoElement>;
  /** Auto-play when source changes. @default true */
  autoPlay?: boolean;
}

// ── Types ─────────────────────────────────────────────────────────────

interface QualityLevel {
  index: number;
  label: string;
  width: number;
  height: number;
  bitrate: number;
}

interface AudioTrack {
  id: number;
  label: string;
  lang: string;
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

function formatBitrate(bps: number): string {
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} Mbps`;
  return `${Math.round(bps / 1_000)} kbps`;
}

// ── Component ─────────────────────────────────────────────────────────

export function HlsPlayer({
  src,
  channelName,
  channelLogo,
  nowPlaying,
  onFatalError,
  videoRef: externalRef,
  autoPlay = true,
}: HlsPlayerProps) {
  const internalRef = useRef<HTMLVideoElement>(null);
  const videoEl = externalRef ?? internalRef;
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-focus container so keyboard shortcuts work immediately
  useEffect(() => {
    containerRef.current?.focus({ preventScroll: true });
  }, []);

  // ── State ───────────────────────────────────────────────────────────
  const [buffering, setBuffering] = useState(false);
  const [resolution, setResolution] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [overlayVisible, setOverlayVisible] = useState(true);

  // ── Custom control state ────────────────────────────────────────────
  const [volume, setVolume] = useState(() => {
    try { return parseFloat(localStorage.getItem("shogun:volume") ?? "0.8"); }
    catch { return 0.8; }
  });
  const [muted, setMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [showAudioMenu, setShowAudioMenu] = useState(false);
  const [qualityLevels, setQualityLevels] = useState<QualityLevel[]>([]);
  const [currentQuality, setCurrentQuality] = useState(-1); // -1 = auto
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
  const [currentAudioTrack, setCurrentAudioTrack] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Track retry state across re-renders without triggering them
  const retryCount = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const overlayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Volume persistence ──────────────────────────────────────────────
  useEffect(() => {
    const video = videoEl.current;
    if (video) {
      video.volume = volume;
      video.muted = muted;
    }
    try { localStorage.setItem("shogun:volume", String(volume)); } catch { /* */ }
  }, [volume, muted, videoEl]);

  // ── Overlay auto-hide ───────────────────────────────────────────────
  const flashOverlay = useCallback(() => {
    setOverlayVisible(true);
    if (overlayTimer.current) clearTimeout(overlayTimer.current);
    overlayTimer.current = setTimeout(() => setOverlayVisible(false), OVERLAY_HIDE_DELAY_MS);
  }, []);

  const handleMouseMove = useCallback(() => {
    flashOverlay();
  }, [flashOverlay]);

  // ── Fullscreen helpers ──────────────────────────────────────────────
  const toggleFullscreen = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch { /* not supported */ }
  }, []);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // ── Quality selection ───────────────────────────────────────────────
  const selectQuality = useCallback((levelIndex: number) => {
    const hls = hlsRef.current;
    if (hls) {
      hls.currentLevel = levelIndex; // -1 = auto
      setCurrentQuality(levelIndex);
    }
    setShowQualityMenu(false);
  }, []);

  // ── Audio track selection ───────────────────────────────────────────
  const selectAudioTrack = useCallback((trackId: number) => {
    const hls = hlsRef.current;
    if (hls) {
      hls.audioTrack = trackId;
      setCurrentAudioTrack(trackId);
    }
    setShowAudioMenu(false);
  }, []);

  // ── Play/Pause toggle ──────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    const video = videoEl.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => { /* */ });
    } else {
      video.pause();
    }
  }, [videoEl]);

  // ── Keyboard shortcuts (scoped to player container) ──────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handler = (e: KeyboardEvent) => {
      // Don't capture if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key.toLowerCase()) {
        case "f":
          e.preventDefault();
          toggleFullscreen();
          break;
        case "m":
          e.preventDefault();
          setMuted((prev) => !prev);
          break;
        case " ":
          e.preventDefault();
          togglePlay();
          break;
      }
    };
    container.addEventListener("keydown", handler);
    return () => container.removeEventListener("keydown", handler);
  }, [toggleFullscreen, togglePlay]);

  // ── Core attach / cleanup ───────────────────────────────────────────
  useEffect(() => {
    const video = videoEl.current;
    if (!video || !src) {
      setResolution("");
      setErrorMsg("");
      setBuffering(false);
      setQualityLevels([]);
      setAudioTracks([]);
      return;
    }

    // Reset per-source state
    retryCount.current = 0;
    setErrorMsg("");
    setResolution("");
    setBuffering(true);
    setQualityLevels([]);
    setAudioTracks([]);
    setCurrentQuality(-1);
    flashOverlay();

    let destroyed = false;

    const clearRetryTimer = () => {
      if (retryTimer.current) {
        clearTimeout(retryTimer.current);
        retryTimer.current = null;
      }
    };

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

    const onPlaying = () => { setBuffering(false); setIsPlaying(true); onResize(); };
    const onWaiting = () => setBuffering(true);
    const onCanPlay = () => setBuffering(false);
    const onPause = () => setIsPlaying(false);
    const onPlay = () => setIsPlaying(true);

    video.addEventListener("resize", onResize);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("play", onPlay);

    // Apply persisted volume
    video.volume = volume;
    video.muted = muted;

    const cleanup = () => {
      destroyed = true;
      destroyHls();
      video.removeEventListener("resize", onResize);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("play", onPlay);
      video.removeAttribute("src");
      video.load();
    };

    if (isHlsUrl(src) && Hls.isSupported()) {
      const hlsConfig: Partial<HlsConfig> = {
        enableWorker: true,
        lowLatencyMode: false,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
      };

      const hls = new Hls(hlsConfig);
      hlsRef.current = hls;

      // ── Populate quality levels ─────────────────────────────────────
      hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
        if (destroyed) return;
        const levels: QualityLevel[] = data.levels.map((lvl, i) => ({
          index: i,
          label: lvl.height ? `${lvl.height}p` : `Level ${i}`,
          width: lvl.width,
          height: lvl.height,
          bitrate: lvl.bitrate,
        }));
        // Sort by height descending
        levels.sort((a, b) => b.height - a.height);
        setQualityLevels(levels);

        // Populate audio tracks
        if (hls.audioTracks.length > 1) {
          const tracks: AudioTrack[] = hls.audioTracks.map((t, i) => ({
            id: i,
            label: t.name || t.lang || `Track ${i + 1}`,
            lang: t.lang || "",
          }));
          setAudioTracks(tracks);
        }

        if (autoPlay) {
          video.play().catch(() => { /* */ });
        }
      });

      hls.on(Hls.Events.LEVEL_LOADED, () => {
        const level = hls.levels[hls.currentLevel];
        if (level?.width && level?.height) {
          setResolution(`${level.width}×${level.height}`);
        }
      });

      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
        if (hls.audioTracks.length > 1) {
          const tracks: AudioTrack[] = hls.audioTracks.map((t, i) => ({
            id: i,
            label: t.name || t.lang || `Track ${i + 1}`,
            lang: t.lang || "",
          }));
          setAudioTracks(tracks);
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
          const msg = `Playback failed: ${data.type} / ${data.details}`;
          setErrorMsg(msg);
          onFatalError?.(msg);
        }
      });

      hls.attachMedia(video);
      hls.loadSource(src);
    } else {
      // Native playback (Safari HLS or plain mp4/ts URL)
      video.src = src;
      if (autoPlay) {
        video.play().catch(() => { /* */ });
      }

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
            if (autoPlay) video.play().catch(() => { /* */ });
          }, delay);
        } else {
          setErrorMsg("Playback failed after maximum retries.");
          onFatalError?.("Playback failed after maximum retries.");
        }
      };
      video.addEventListener("error", onNativeError);

      return () => {
        cleanup();
        video.removeEventListener("error", onNativeError);
      };
    }

    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  // Cleanup overlay timer on unmount
  useEffect(() => {
    return () => {
      if (overlayTimer.current) clearTimeout(overlayTimer.current);
    };
  }, []);

  // Close menus when clicking elsewhere
  useEffect(() => {
    if (!showQualityMenu && !showAudioMenu) return;
    const handler = () => { setShowQualityMenu(false); setShowAudioMenu(false); };
    window.addEventListener("click", handler, { once: true });
    return () => window.removeEventListener("click", handler);
  }, [showQualityMenu, showAudioMenu]);

  // ── Volume icon ─────────────────────────────────────────────────────
  const volumeIcon = muted || volume === 0 ? "🔇" : volume < 0.5 ? "🔉" : "🔊";

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      className={`hls-player${isFullscreen ? " hls-fullscreen" : ""}`}
      tabIndex={-1}
      onMouseMove={handleMouseMove}
      onDoubleClick={toggleFullscreen}
    >
      <video ref={videoEl} className="hls-player-video" playsInline onClick={togglePlay} />

      {/* ── Overlay (auto-hides) ──────────────────────── */}
      <div className={`hls-overlay${overlayVisible || buffering || errorMsg ? " visible" : ""}`}>
        {/* Top bar: channel info + resolution + now playing */}
        <div className="hls-overlay-top">
          <div className="hls-overlay-channel">
            {channelLogo && (
              <img
                className="hls-overlay-logo"
                src={channelLogo}
                alt=""
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            )}
            <div className="hls-overlay-text">
              {channelName && <span className="hls-overlay-name">{channelName}</span>}
              {nowPlaying && <span className="hls-overlay-now">{nowPlaying}</span>}
            </div>
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

        {/* ── Custom control bar (bottom) ───────────────── */}
        <div className="hls-controls" onClick={(e) => e.stopPropagation()}>
          {/* Play / Pause */}
          <button className="hls-ctrl-btn" onClick={togglePlay} title={isPlaying ? "Pause (Space)" : "Play (Space)"}>
            {isPlaying ? "⏸" : "▶"}
          </button>

          {/* Volume */}
          <button className="hls-ctrl-btn" onClick={() => setMuted((p) => !p)} title={`${muted ? "Unmute" : "Mute"} (M)`}>
            {volumeIcon}
          </button>
          <input
            className="hls-volume-slider"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={muted ? 0 : volume}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              setVolume(v);
              if (v > 0 && muted) setMuted(false);
            }}
            title={`Volume: ${Math.round((muted ? 0 : volume) * 100)}%`}
          />

          {/* Spacer */}
          <div className="hls-ctrl-spacer" />

          {/* Audio track selector */}
          {audioTracks.length > 1 && (
            <div className="hls-ctrl-menu-wrap">
              <button
                className="hls-ctrl-btn"
                onClick={(e) => { e.stopPropagation(); setShowAudioMenu((p) => !p); setShowQualityMenu(false); }}
                title="Audio track"
              >
                🎧
              </button>
              {showAudioMenu && (
                <div className="hls-ctrl-menu" onClick={(e) => e.stopPropagation()}>
                  <div className="hls-ctrl-menu-title">Audio</div>
                  {audioTracks.map((track) => (
                    <button
                      key={track.id}
                      className={`hls-ctrl-menu-item${track.id === currentAudioTrack ? " active" : ""}`}
                      onClick={() => selectAudioTrack(track.id)}
                    >
                      {track.label}{track.lang ? ` (${track.lang})` : ""}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Quality selector */}
          {qualityLevels.length > 1 && (
            <div className="hls-ctrl-menu-wrap">
              <button
                className="hls-ctrl-btn"
                onClick={(e) => { e.stopPropagation(); setShowQualityMenu((p) => !p); setShowAudioMenu(false); }}
                title="Quality"
              >
                ⚙️
              </button>
              {showQualityMenu && (
                <div className="hls-ctrl-menu" onClick={(e) => e.stopPropagation()}>
                  <div className="hls-ctrl-menu-title">Quality</div>
                  <button
                    className={`hls-ctrl-menu-item${currentQuality === -1 ? " active" : ""}`}
                    onClick={() => selectQuality(-1)}
                  >
                    Auto
                  </button>
                  {qualityLevels.map((lvl) => (
                    <button
                      key={lvl.index}
                      className={`hls-ctrl-menu-item${lvl.index === currentQuality ? " active" : ""}`}
                      onClick={() => selectQuality(lvl.index)}
                    >
                      {lvl.label}
                      <span className="hls-ctrl-bitrate">{formatBitrate(lvl.bitrate)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Fullscreen */}
          <button className="hls-ctrl-btn" onClick={toggleFullscreen} title="Fullscreen (F)">
            {isFullscreen ? "⊡" : "⛶"}
          </button>
        </div>
      </div>
    </div>
  );
}

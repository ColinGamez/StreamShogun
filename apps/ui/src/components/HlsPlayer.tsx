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
import {
  classifyPlaybackSource,
  normalizePlaybackVolume,
  isPlayableMediaUrl,
} from "../lib/playback-policy";
import { createPlaybackSession } from "../lib/playback-session";

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
  videoRef?: RefObject<HTMLVideoElement | null>;
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

const OVERLAY_HIDE_DELAY_MS = 4_000;

// ── Helpers ───────────────────────────────────────────────────────────

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
  const [terminalError, setTerminalError] = useState(false);
  const [retryGeneration, setRetryGeneration] = useState(0);
  const manualRetrySource = useRef<string | null>(null);
  const [overlayVisible, setOverlayVisible] = useState(true);

  // ── Custom control state ────────────────────────────────────────────
  const [volume, setVolume] = useState(() => {
    try {
      return normalizePlaybackVolume(localStorage.getItem("shogun:volume"));
    } catch {
      return 0.8;
    }
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
  const hlsRef = useRef<Hls | null>(null);
  const overlayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Volume persistence ──────────────────────────────────────────────
  useEffect(() => {
    const video = videoEl.current;
    if (video) {
      video.volume = volume;
      video.muted = muted;
    }
    try {
      localStorage.setItem("shogun:volume", String(volume));
    } catch {
      /* */
    }
  }, [volume, muted, videoEl]);

  // ── Overlay auto-hide ───────────────────────────────────────────────
  const flashOverlay = useCallback(() => {
    setOverlayVisible(true);
    if (overlayTimer.current) clearTimeout(overlayTimer.current);
    overlayTimer.current = setTimeout(() => setOverlayVisible(false), OVERLAY_HIDE_DELAY_MS);
  }, []);

  // Latest values for the [src] attach effect below: retries and timers must
  // observe current prefs/callbacks, not the render that started the stream.
  const latest = useRef({ volume, muted, autoPlay, onFatalError, flashOverlay });
  latest.current = { volume, muted, autoPlay, onFatalError, flashOverlay };

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
    } catch {
      /* not supported */
    }
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
      video.play().catch(() => {
        /* */
      });
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
    setResolution("");
    setErrorMsg("");
    setTerminalError(false);
    setIsPlaying(false);
    setQualityLevels([]);
    setAudioTracks([]);
    setCurrentQuality(-1);
    setCurrentAudioTrack(0);
    setShowQualityMenu(false);
    setShowAudioMenu(false);
    if (!video || !src) {
      setBuffering(false);
      return;
    }
    if (!isPlayableMediaUrl(src)) {
      const message = "This stream protocol is not supported in the desktop player.";
      setBuffering(false);
      setErrorMsg(message);
      latest.current.onFatalError?.(message);
      return;
    }
    flashOverlay();
    let hls: Hls | null = null;
    const destroyHls = () => {
      const instance = hls;
      hls = null;
      hlsRef.current = null;
      instance?.destroy();
    };
    const playVideo = () => {
      void video.play().catch((error: unknown) => {
        if (session.active && error instanceof Error && error.name === "NotAllowedError") {
          session.pause(); // Browser autoplay policy leaves the manual Play control available.
        }
      });
    };
    const retryRequested = manualRetrySource.current === src;
    manualRetrySource.current = null;
    const session = createPlaybackSession({
      video,
      autoPlay: latest.current.autoPlay || retryRequested,
      recover: (failure) => {
        setErrorMsg("");
        if (hls) {
          if (failure.kind === "media") {
            hls.recoverMediaError();
            playVideo();
          } else {
            if (failure.reloadSource) hls.loadSource(src);
            hls.startLoad();
          }
        } else {
          video.src = src;
          video.load();
          playVideo();
        }
      },
      stop: () => {
        destroyHls();
        video.pause();
        video.removeAttribute("src");
        video.load();
      },
      onBuffering: setBuffering,
      onPlaying: (playing) => {
        setIsPlaying(playing);
        setErrorMsg("");
      },
      onRetry: (attempt, delayMs) => {
        setErrorMsg(`Stream interrupted. Retrying ${attempt}/4 in ${delayMs / 1000}s...`);
      },
      onFailure: (message) => {
        setErrorMsg(message);
        setTerminalError(true);
        latest.current.onFatalError?.(message);
      },
    });
    const onResize = () => {
      if (session.active && video.videoWidth && video.videoHeight) {
        setResolution(`${video.videoWidth}x${video.videoHeight}`);
      }
    };
    video.addEventListener("resize", onResize);
    video.addEventListener("playing", onResize);
    video.volume = latest.current.volume;
    video.muted = latest.current.muted;
    const onNativeError = () => {
      if (session.active && video.error?.code !== 1) {
        session.requestRecovery({ kind: "native", mediaCode: video.error?.code });
      }
    };
    // Native source assignment can synchronously raise an error.
    video.addEventListener("error", onNativeError);
    const cleanup = () => {
      session.dispose();
      video.removeEventListener("resize", onResize);
      video.removeEventListener("playing", onResize);
      video.removeEventListener("error", onNativeError);
      destroyHls();
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
    if (classifyPlaybackSource(src) === "hls" && Hls.isSupported()) {
      // HLS owns media error interpretation; avoid duplicate native recovery.
      video.removeEventListener("error", onNativeError);
      const hlsConfig: Partial<HlsConfig> = {
        enableWorker: true,
        lowLatencyMode: false,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
      };
      const instance = new Hls(hlsConfig);
      hls = instance;
      hlsRef.current = instance;
      const updateAudioTracks = () => {
        if (!session.active) return;
        setAudioTracks(
          instance.audioTracks.map((track, index) => ({
            id: index,
            label: track.name || track.lang || `Track ${index + 1}`,
            lang: track.lang || "",
          })),
        );
        setCurrentAudioTrack(instance.audioTrack);
      };
      instance.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
        if (!session.active) return;
        const levels: QualityLevel[] = data.levels.map((level, index) => ({
          index,
          label: level.height ? `${level.height}p` : `Level ${index}`,
          width: level.width,
          height: level.height,
          bitrate: level.bitrate,
        }));
        setQualityLevels(levels.sort((a, b) => b.height - a.height));
        updateAudioTracks();
        if (session.wantsPlayback) playVideo();
      });
      instance.on(Hls.Events.LEVEL_LOADED, () => {
        if (!session.active) return;
        const level = instance.levels[instance.currentLevel];
        if (level?.width && level?.height) setResolution(`${level.width}x${level.height}`);
      });
      instance.on(Hls.Events.AUDIO_TRACKS_UPDATED, updateAudioTracks);
      instance.on(Hls.Events.ERROR, (_event: Events.ERROR, data: ErrorData) => {
        if (!session.active || !data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          const status = data.response?.code;
          // A missing live segment can recover; a missing manifest cannot.
          const manifestError =
            data.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR ||
            data.details === Hls.ErrorDetails.MANIFEST_LOAD_TIMEOUT;
          session.requestRecovery({
            kind: "network",
            reloadSource: manifestError,
            status: status === 401 || status === 403 || manifestError ? status : undefined,
          });
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          session.requestRecovery({ kind: "media" });
        } else {
          session.requestRecovery({ kind: "native", mediaCode: 4 });
        }
      });
      instance.attachMedia(video);
      instance.loadSource(src);
    } else {
      video.src = src;
      if (session.wantsPlayback) playVideo();
    }
    return cleanup;
  }, [src, videoEl, flashOverlay, retryGeneration]);

  // Cleanup overlay timer on unmount
  useEffect(() => {
    return () => {
      if (overlayTimer.current) clearTimeout(overlayTimer.current);
    };
  }, []);

  // Close menus when clicking elsewhere
  useEffect(() => {
    if (!showQualityMenu && !showAudioMenu) return;
    const handler = () => {
      setShowQualityMenu(false);
      setShowAudioMenu(false);
    };
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
      tabIndex={0}
      role="region"
      aria-label={channelName ? `Video player — ${channelName}` : "Video player"}
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
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
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
        {errorMsg && (
          <div className="hls-error-banner" role="alert">
            {errorMsg}
            {terminalError && (
              <button
                className="btn-secondary btn-sm"
                onClick={() => {
                  manualRetrySource.current = src;
                  setRetryGeneration((generation) => generation + 1);
                }}
              >
                Retry stream
              </button>
            )}
          </div>
        )}

        {/* ── Custom control bar (bottom) ───────────────── */}
        <div className="hls-controls" onClick={(e) => e.stopPropagation()}>
          {/* Play / Pause */}
          <button
            className="hls-ctrl-btn"
            onClick={togglePlay}
            title={isPlaying ? "Pause (Space)" : "Play (Space)"}
            aria-label={isPlaying ? "Pause (Space)" : "Play (Space)"}
          >
            {isPlaying ? "⏸" : "▶"}
          </button>

          {/* Volume */}
          <button
            className="hls-ctrl-btn"
            onClick={() => setMuted((p) => !p)}
            title={`${muted ? "Unmute" : "Mute"} (M)`}
            aria-label={`${muted ? "Unmute" : "Mute"} (M)`}
          >
            {volumeIcon}
          </button>
          <input
            className="hls-volume-slider"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={muted ? 0 : volume}
            aria-label="Volume"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round((muted ? 0 : volume) * 100)}
            aria-valuetext={`${Math.round((muted ? 0 : volume) * 100)}%`}
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
                onClick={(e) => {
                  e.stopPropagation();
                  setShowAudioMenu((p) => !p);
                  setShowQualityMenu(false);
                }}
                title="Audio track"
                aria-label="Audio track"
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
                      {track.label}
                      {track.lang ? ` (${track.lang})` : ""}
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
                onClick={(e) => {
                  e.stopPropagation();
                  setShowQualityMenu((p) => !p);
                  setShowAudioMenu(false);
                }}
                title="Quality"
                aria-label="Quality"
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
          <button
            className="hls-ctrl-btn"
            onClick={toggleFullscreen}
            title="Fullscreen (F)"
            aria-label="Fullscreen (F)"
          >
            {isFullscreen ? "⊡" : "⛶"}
          </button>
        </div>
      </div>
    </div>
  );
}

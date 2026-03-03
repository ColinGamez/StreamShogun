import { useMemo, useCallback, useEffect, useState, useRef } from "react";
import type { Channel, Programme } from "@stream-shogun/core";
import { useAppStore } from "../stores/app-store";
import { t } from "../lib/i18n";
import { HlsPlayer } from "../components/HlsPlayer";
import { showToast } from "../components/Toast";
import * as bridge from "../lib/bridge";

// ── Constants ─────────────────────────────────────────────────────────

const OSD_DISPLAY_MS = 3_000;
const NUMERIC_TIMEOUT_MS = 1_500;

// ── Types ─────────────────────────────────────────────────────────────

interface PlayerPageProps {
  onNavigate: (page: "channels") => void;
  pipUrl?: string;
  pipName?: string;
}

export function PlayerPage({ onNavigate, pipUrl, pipName }: PlayerPageProps) {
  const locale = useAppStore((s) => s.locale);
  const currentChannel = useAppStore((s) => s.currentChannel);
  const channels = useAppStore((s) => s.channels);
  const setCurrentChannel = useAppStore((s) => s.setCurrentChannel);
  const epgIndex = useAppStore((s) => s.epgIndex);
  const saveWatch = useAppStore((s) => s.saveWatch);
  const settings = useAppStore((s) => s.settings);

  const [copied, setCopied] = useState(false);

  // ── OSD state ───────────────────────────────────────────────────────
  const [osd, setOsd] = useState<{ num: number; name: string; logo?: string } | null>(null);
  const osdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Numeric channel entry ───────────────────────────────────────────
  const [numericInput, setNumericInput] = useState("");
  const numericTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Watch history refs (BUG-3 fix: store full prev channel object) ─
  const watchStartRef = useRef<number>(Date.now());
  const prevChannelObjRef = useRef<Channel | null>(null);

  // Use PIP override if provided
  const effectiveChannel = useMemo(
    () =>
      pipUrl
        ? { name: pipName || "PIP", url: pipUrl, tvgId: "", tvgName: "", tvgLogo: "", groupTitle: "", duration: -1, extras: {} as Record<string, string> }
        : currentChannel,
    [pipUrl, pipName, currentChannel],
  );

  // ── Show OSD banner ─────────────────────────────────────────────────
  const showOsd = useCallback((channelIndex: number, ch: Channel) => {
    if (osdTimer.current) clearTimeout(osdTimer.current);
    setOsd({ num: channelIndex + 1, name: ch.name, logo: ch.tvgLogo || undefined });
    osdTimer.current = setTimeout(() => setOsd(null), OSD_DISPLAY_MS);
  }, []);

  // ── Watch history tracking (BUG-3 FIXED) ───────────────────────────
  useEffect(() => {
    if (!effectiveChannel) return;

    const prevObj = prevChannelObjRef.current;
    const startedAt = watchStartRef.current;

    // If channel changed, save the previous watch session using the stored object
    if (prevObj && prevObj.url !== effectiveChannel.url) {
      const stoppedAt = Date.now();
      const durationSec = Math.round((stoppedAt - startedAt) / 1000);
      if (durationSec >= 5) {
        saveWatch(
          prevObj.url,
          prevObj.name,
          prevObj.tvgLogo || "",
          prevObj.groupTitle || "",
          startedAt,
          stoppedAt,
          durationSec,
        ).catch(() => { /* best-effort */ });
      }
    }

    prevChannelObjRef.current = effectiveChannel;
    watchStartRef.current = Date.now();

    // Save on unmount
    return () => {
      const stoppedAt = Date.now();
      const dur = Math.round((stoppedAt - watchStartRef.current) / 1000);
      if (dur >= 5 && effectiveChannel) {
        saveWatch(
          effectiveChannel.url,
          effectiveChannel.name,
          effectiveChannel.tvgLogo || "",
          effectiveChannel.groupTitle || "",
          watchStartRef.current,
          stoppedAt,
          dur,
        ).catch(() => { /* best-effort on unmount */ });
      }
    };
  }, [effectiveChannel?.url]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Discord Rich Presence ───────────────────────────────────────────
  useEffect(() => {
    if (!effectiveChannel || settings.discordRpcEnabled !== "true") return;
    bridge.discordSetActivity(
      `Watching ${effectiveChannel.name}`,
      effectiveChannel.groupTitle || "Live TV",
      Math.floor(Date.now() / 1000),
    ).catch(() => { /* best-effort */ });

    return () => {
      bridge.discordClearActivity().catch(() => { /* best-effort */ });
    };
  }, [effectiveChannel?.url, settings.discordRpcEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Current channel index for zapping ───────────────────────────────
  const currentIndex = useMemo(() => {
    if (!effectiveChannel) return -1;
    return channels.findIndex((ch) => ch.url === effectiveChannel.url);
  }, [effectiveChannel, channels]);

  const zap = useCallback(
    (delta: number) => {
      if (channels.length === 0) return;
      const next = (currentIndex + delta + channels.length) % channels.length;
      const ch = channels[next];
      setCurrentChannel(ch);
      showOsd(next, ch);
    },
    [currentIndex, channels, setCurrentChannel, showOsd],
  );

  // ── Jump to channel by number ───────────────────────────────────────
  const jumpToChannel = useCallback(
    (num: number) => {
      const idx = num - 1; // channels are 1-indexed for user
      if (idx >= 0 && idx < channels.length) {
        const ch = channels[idx];
        setCurrentChannel(ch);
        showOsd(idx, ch);
      }
    },
    [channels, setCurrentChannel, showOsd],
  );

  // ── Now / Next ──────────────────────────────────────────────────────
  const { nowProg, nextProg } = useMemo(() => {
    if (!effectiveChannel) return { nowProg: null, nextProg: null };
    const progs: Programme[] = epgIndex[effectiveChannel.tvgId] ?? [];
    const now = Date.now();
    let nowProg: Programme | null = null;
    let nextProg: Programme | null = null;
    for (let i = 0; i < progs.length; i++) {
      const p = progs[i];
      if (p.start <= now && (p.stop === 0 || p.stop > now)) {
        nowProg = p;
        nextProg = progs[i + 1] ?? null;
        break;
      }
    }
    return { nowProg, nextProg };
  }, [effectiveChannel, epgIndex]);

  // ── Keyboard navigation + numeric entry ─────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't capture if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case "ArrowUp":
        case "PageUp":
          e.preventDefault();
          zap(-1);
          break;
        case "ArrowDown":
        case "PageDown":
          e.preventDefault();
          zap(1);
          break;
        case "Escape":
          e.preventDefault();
          if (numericInput) {
            setNumericInput("");
            if (numericTimer.current) clearTimeout(numericTimer.current);
          } else {
            onNavigate("channels");
          }
          break;
        default:
          // Numeric channel entry: type digits to jump to channel N
          if (/^[0-9]$/.test(e.key)) {
            e.preventDefault();
            const newInput = numericInput + e.key;
            setNumericInput(newInput);
            if (numericTimer.current) clearTimeout(numericTimer.current);
            numericTimer.current = setTimeout(() => {
              const num = parseInt(newInput, 10);
              if (num > 0) jumpToChannel(num);
              setNumericInput("");
            }, NUMERIC_TIMEOUT_MS);
          }
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [zap, onNavigate, numericInput, jumpToChannel]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (osdTimer.current) clearTimeout(osdTimer.current);
      if (numericTimer.current) clearTimeout(numericTimer.current);
    };
  }, []);

  // ── Copy stream URL ─────────────────────────────────────────────────
  const handleCopyUrl = useCallback(async () => {
    if (!effectiveChannel) return;
    try {
      await navigator.clipboard.writeText(effectiveChannel.url);
      setCopied(true);
      showToast("Stream URL copied to clipboard", "success");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast("Failed to copy URL", "error");
    }
  }, [effectiveChannel]);

  // ── Empty state ─────────────────────────────────────────────────────
  if (!effectiveChannel) {
    return (
      <div className="page page-player">
        <div className="empty-state">
          <span className="empty-icon">▶️</span>
          <p>{t("player.noChannel", locale)}</p>
          <button onClick={() => onNavigate("channels")}>{t("player.goToChannels", locale)}</button>
        </div>
      </div>
    );
  }

  const handlePip = async () => {
    const isOpen = await bridge.pipIsOpen();
    if (isOpen.ok && isOpen.data) {
      await bridge.pipClose();
    } else {
      await bridge.pipOpen(effectiveChannel.url, effectiveChannel.name);
    }
  };

  // Now-playing text line for the HLS overlay
  const nowPlayingText = nowProg ? `${nowProg.titles[0] ?? ""}${nowProg.subtitle ? ` — ${nowProg.subtitle}` : ""}` : undefined;

  return (
    <div className="page page-player">
      {/* ── Video area (HLS-capable) ───────────────────── */}
      <div className="player-video-wrap">
        <HlsPlayer
          src={effectiveChannel.url}
          channelName={effectiveChannel.name}
          channelLogo={effectiveChannel.tvgLogo || undefined}
          nowPlaying={nowPlayingText}
          onFatalError={(msg) => showToast(msg, "error")}
        />

        {/* ── Channel OSD (transient on-screen display) ── */}
        {osd && (
          <div className="player-osd">
            {osd.logo && <img className="player-osd-logo" src={osd.logo} alt="" />}
            <div className="player-osd-text">
              <span className="player-osd-num">{osd.num}</span>
              <span className="player-osd-name">{osd.name}</span>
            </div>
          </div>
        )}

        {/* ── Numeric entry indicator ──────────────────── */}
        {numericInput && (
          <div className="player-numeric-input">
            <span>{numericInput}_</span>
          </div>
        )}
      </div>

      {/* ── Info bar ────────────────────────────────────── */}
      <div className="player-info">
        <div className="player-channel-row">
          {effectiveChannel.tvgLogo && (
            <img
              className="player-ch-logo"
              src={effectiveChannel.tvgLogo}
              alt=""
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          )}
          <div className="player-ch-text">
            <span className="player-ch-name">{effectiveChannel.name}</span>
            {effectiveChannel.groupTitle && (
              <span className="player-ch-group">{effectiveChannel.groupTitle}</span>
            )}
          </div>

          {/* PIP button */}
          {!pipUrl && (
            <button
              className="btn-pip"
              onClick={handlePip}
              title={t("pip.open", locale)}
              aria-label={t("pip.open", locale)}
            >
              🖼️ PIP
            </button>
          )}

          {/* Copy stream URL */}
          <button
            className="btn-copy-url"
            onClick={handleCopyUrl}
            title="Copy stream URL"
            aria-label="Copy stream URL"
          >
            {copied ? "✓ Copied" : "🔗 Copy URL"}
          </button>

          <div className="player-zap">
            <button
              onClick={() => zap(-1)}
              title="Previous channel (↑)"
              aria-label="Previous channel"
            >
              ▲
            </button>
            <span className="player-ch-num">
              {currentIndex + 1}/{channels.length}
            </span>
            <button onClick={() => zap(1)} title="Next channel (↓)" aria-label="Next channel">
              ▼
            </button>
          </div>
        </div>

        {/* ── Now / Next ─────────────────────────────────── */}
        {nowProg && (
          <div className="player-now-next">
            <div className="player-now">
              <span className="label">{t("player.now", locale)}</span>
              <span className="title">{nowProg.titles[0] ?? ""}</span>
              {nowProg.subtitle && <span className="sub">{nowProg.subtitle}</span>}
            </div>
            {nextProg && (
              <div className="player-next">
                <span className="label">{t("player.next", locale)}</span>
                <span className="title">{nextProg.titles[0] ?? ""}</span>
              </div>
            )}
          </div>
        )}

        {/* Keyboard hints */}
        <div className="player-hotkeys">
          <kbd>↑</kbd><kbd>↓</kbd> zap &nbsp;
          <kbd>0–9</kbd> go to channel &nbsp;
          <kbd>F</kbd> fullscreen &nbsp;
          <kbd>M</kbd> mute &nbsp;
          <kbd>Space</kbd> pause &nbsp;
          <kbd>Esc</kbd> back
        </div>
      </div>
    </div>
  );
}

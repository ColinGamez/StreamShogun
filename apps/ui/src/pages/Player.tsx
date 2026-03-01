import { useMemo, useCallback, useEffect, useState, useRef } from "react";
import type { Programme } from "@stream-shogun/core";
import { useAppStore } from "../stores/app-store";
import { t } from "../lib/i18n";
import { HlsPlayer } from "../components/HlsPlayer";
import { showToast } from "../components/Toast";
import * as bridge from "../lib/bridge";

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
  const watchStartRef = useRef<number>(Date.now());
  const prevChannelRef = useRef<string | null>(null);

  // Use PIP override if provided
  const effectiveChannel = useMemo(
    () =>
      pipUrl
        ? { name: pipName || "PIP", url: pipUrl, tvgId: "", tvgName: "", tvgLogo: "", groupTitle: "", duration: -1, extras: {} as Record<string, string> }
        : currentChannel,
    [pipUrl, pipName, currentChannel],
  );

  // ── Watch history tracking ──────────────────────────────────────────
  useEffect(() => {
    if (!effectiveChannel) return;

    const prevUrl = prevChannelRef.current;
    const startedAt = watchStartRef.current;

    // If channel changed, save the previous watch session
    if (prevUrl && prevUrl !== effectiveChannel.url) {
      const stoppedAt = Date.now();
      const durationSec = Math.round((stoppedAt - startedAt) / 1000);
      if (durationSec >= 5) {
        // Only save if watched for at least 5 seconds
        // We can't easily get prev channel details, but we track the URL at minimum
        saveWatch(prevUrl, prevChannelRef.current || "", "", "", startedAt, stoppedAt, durationSec);
      }
    }

    prevChannelRef.current = effectiveChannel.url;
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
        );
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
    );

    return () => {
      bridge.discordClearActivity();
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
      setCurrentChannel(channels[next]);
    },
    [currentIndex, channels, setCurrentChannel],
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

  // ── Keyboard navigation ─────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
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
          onNavigate("channels");
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [zap, onNavigate]);

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

  return (
    <div className="page page-player">
      {/* ── Video area (HLS-capable) ───────────────────── */}
      <div className="player-video-wrap">
        <HlsPlayer
          src={effectiveChannel.url}
          channelName={effectiveChannel.name}
          channelLogo={effectiveChannel.tvgLogo || undefined}
          onFatalError={(msg) => showToast(msg, "error")}
        />
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
          <kbd>↑</kbd>
          <kbd>↓</kbd> zap &nbsp;
          <kbd>Esc</kbd> back
        </div>
      </div>
    </div>
  );
}

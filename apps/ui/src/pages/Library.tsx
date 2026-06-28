import { useState, useMemo } from "react";
import type { MasterSourceDTO } from "@stream-shogun/shared";
import type { Playlist } from "@stream-shogun/core";
import type { EpgLoadResult, MasterSourceLoadResult } from "../vite-env";
import { useAppStore, type PlaylistEntry, type EpgEntry } from "../stores/app-store";
import { t } from "../lib/i18n";
import {
  loadPlaylistFromUrl,
  loadPlaylistFromFile,
  loadEpgFromUrl,
  loadEpgFromFile,
  masterSourcesFetch,
  masterSourceLoad,
} from "../lib/bridge";
import { showToast } from "../components/Toast";
import { EPG_PRESETS } from "../lib/epg-presets";
import { isMasterEmail } from "../lib/master-profile";

/** Open a native file dialog (Electron) or an HTML <input type="file"> fallback. */
function pickFilePath(accept: string): Promise<string | null> {
  return new Promise((resolve) => {
    // Electron exposes a file dialog via IPC – prefer it when available
    if (
      typeof window !== "undefined" &&
      (window as unknown as Record<string, unknown>).__electron_bridge
    ) {
      // bridge.openFileDialog already returns the path; caller handles it
    }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      // webkitRelativePath is empty for single picks; use .name as fallback
      const path = (file as unknown as { path?: string }).path || file.name;
      resolve(path);
    };
    // User cancelled the dialog
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
}

function resolvePlaylistData(data: Playlist | MasterSourceLoadResult): Playlist | null {
  if ("source" in data) return data.playlist ?? null;
  return data;
}

function resolveEpgData(data: EpgLoadResult | MasterSourceLoadResult): EpgLoadResult | null {
  if ("source" in data) return data.epg ?? null;
  return data;
}

export function LibraryPage() {
  const locale = useAppStore((s) => s.locale);
  const playlistEntries = useAppStore((s) => s.playlistEntries);
  const epgEntries = useAppStore((s) => s.epgEntries);
  const channels = useAppStore((s) => s.channels);
  const favorites = useAppStore((s) => s.favorites);
  const addPlaylist = useAppStore((s) => s.addPlaylist);
  const removePlaylist = useAppStore((s) => s.removePlaylist);
  const addEpg = useAppStore((s) => s.addEpg);
  const removeEpg = useAppStore((s) => s.removeEpg);
  const authUser = useAppStore((s) => s.authUser);

  const [playlistUrl, setPlaylistUrl] = useState("");
  const [epgUrl, setEpgUrl] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [masterSources, setMasterSources] = useState<MasterSourceDTO[]>([]);

  const isMaster = isMasterEmail(authUser?.email);

  // ── Computed stats ──────────────────────────────────────────────────
  const stats = useMemo(() => {
    const groups = new Set(channels.map((ch) => ch.groupTitle).filter(Boolean));
    const totalProgrammes = epgEntries.reduce((sum, e) => sum + (e.programmeCount || 0), 0);
    return {
      channelCount: channels.length,
      groupCount: groups.size,
      favoriteCount: favorites.size,
      epgSourceCount: epgEntries.length,
      programmeCount: totalProgrammes,
    };
  }, [channels, favorites, epgEntries]);

  // ── Playlist loading ────────────────────────────────────────────────
  const handleAddPlaylistUrl = async () => {
    if (!playlistUrl.trim()) return;
    setLoading("playlist-url");
    try {
      const res = await loadPlaylistFromUrl(playlistUrl.trim());
      if (res.ok) {
        const entry: PlaylistEntry = {
          id: "",
          name: playlistUrl.split("/").pop() ?? "Playlist",
          location: playlistUrl.trim(),
          type: "url",
          channelCount: res.data.channels.length,
          addedAt: Date.now(),
        };
        addPlaylist(entry, res.data.channels);
        showToast(
          `${t("library.playlistAdded", locale)} (${res.data.channels.length} ch)`,
          "success",
        );
        setPlaylistUrl("");
      } else {
        showToast(res.error, "error");
      }
    } catch (err) {
      showToast(String(err), "error");
    } finally {
      setLoading(null);
    }
  };

  const handleAddPlaylistFile = async () => {
    setLoading("playlist-file");
    try {
      // Use a file picker input for cross-platform compatibility
      const path = await pickFilePath(".m3u,.m3u8,.txt");
      if (!path) {
        setLoading(null);
        return;
      }
      const res = await loadPlaylistFromFile(path);
      if (res.ok) {
        const entry: PlaylistEntry = {
          id: "",
          name: path.split(/[/\\]/).pop() ?? "Playlist",
          location: path,
          type: "file",
          channelCount: res.data.channels.length,
          addedAt: Date.now(),
        };
        addPlaylist(entry, res.data.channels);
        showToast(
          `${t("library.playlistAdded", locale)} (${res.data.channels.length} ch)`,
          "success",
        );
      } else {
        showToast(res.error, "error");
      }
    } catch (err) {
      showToast(String(err), "error");
    } finally {
      setLoading(null);
    }
  };

  // ── EPG loading ─────────────────────────────────────────────────────
  const handleAddEpgUrl = async () => {
    if (!epgUrl.trim()) return;
    setLoading("epg-url");
    try {
      const res = await loadEpgFromUrl(epgUrl.trim());
      if (res.ok) {
        const entry: EpgEntry = {
          id: "",
          name: epgUrl.split("/").pop() ?? "EPG",
          location: epgUrl.trim(),
          type: "url",
          programmeCount: res.data.programmes.length,
          channelCount: res.data.channels.length,
          addedAt: Date.now(),
        };
        addEpg(entry, res.data.programmes, res.data.index);
        showToast(
          `${t("library.epgAdded", locale)} (${res.data.programmes.length} ${t("library.programmes_count", locale)})`,
          "success",
        );
        setEpgUrl("");
      } else {
        showToast(res.error, "error");
      }
    } catch (err) {
      showToast(String(err), "error");
    } finally {
      setLoading(null);
    }
  };

  const handleAddEpgFile = async () => {
    setLoading("epg-file");
    try {
      const path = await pickFilePath(".xml,.xmltv,.gz");
      if (!path) {
        setLoading(null);
        return;
      }
      const res = await loadEpgFromFile(path);
      if (res.ok) {
        const entry: EpgEntry = {
          id: "",
          name: path.split(/[/\\]/).pop() ?? "EPG",
          location: path,
          type: "file",
          programmeCount: res.data.programmes.length,
          channelCount: res.data.channels.length,
          addedAt: Date.now(),
        };
        addEpg(entry, res.data.programmes, res.data.index);
        showToast(
          `${t("library.epgAdded", locale)} (${res.data.programmes.length} ${t("library.programmes_count", locale)})`,
          "success",
        );
      } else {
        showToast(res.error, "error");
      }
    } catch (err) {
      showToast(String(err), "error");
    } finally {
      setLoading(null);
    }
  };

  const handleLoadPreset = async (presetId: string) => {
    const preset = EPG_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    // Don't re-add if already loaded
    if (epgEntries.some((e) => e.location === preset.url)) {
      showToast(t("library.alreadyLoaded", locale, { name: preset.name }), "error");
      return;
    }
    setLoading(`preset-${presetId}`);
    try {
      const res = await loadEpgFromUrl(preset.url);
      if (res.ok) {
        const entry: EpgEntry = {
          id: "",
          name: preset.name,
          location: preset.url,
          type: "url",
          programmeCount: res.data.programmes.length,
          channelCount: res.data.channels.length,
          addedAt: Date.now(),
        };
        addEpg(entry, res.data.programmes, res.data.index);
        showToast(
          `${t("library.epgAdded", locale)} — ${preset.name} (${res.data.channels.length} ch, ${res.data.programmes.length} prog)`,
          "success",
        );
      } else {
        showToast(res.error, "error");
      }
    } catch (err) {
      showToast(String(err), "error");
    } finally {
      setLoading(null);
    }
  };

  const handleLoadMasterSources = async () => {
    setLoading("master-sources");
    try {
      const sourcesRes = await masterSourcesFetch();
      if (!sourcesRes.ok) {
        showToast(sourcesRes.error, "error");
        return;
      }

      const sources = sourcesRes.data.sources;
      setMasterSources(sources);

      if (sources.length === 0) {
        showToast("No Master sources configured yet", "error");
        return;
      }

      const loadedPlaylistUrls = new Set(playlistEntries.map((entry) => entry.location));
      const loadedEpgUrls = new Set(epgEntries.map((entry) => entry.location));
      let loadedCount = 0;
      let skippedCount = 0;
      let failedCount = 0;

      for (const source of sources) {
        const sourceLocation = source.url ?? `master://${source.id}`;

        if (source.kind === "playlist") {
          if (loadedPlaylistUrls.has(sourceLocation)) {
            skippedCount++;
            continue;
          }

          const res =
            source.loadMode === "api"
              ? await masterSourceLoad(source.id)
              : source.url
                ? await loadPlaylistFromUrl(source.url)
                : { ok: false as const, error: "Master playlist source has no URL" };

          const playlist = res.ok ? resolvePlaylistData(res.data) : null;

          if (res.ok && playlist) {
            const entry: PlaylistEntry = {
              id: "",
              name: source.name,
              location: sourceLocation,
              type: "url",
              channelCount: playlist.channels.length,
              addedAt: Date.now(),
            };
            addPlaylist(entry, playlist.channels);
            loadedPlaylistUrls.add(sourceLocation);
            loadedCount++;
          } else {
            failedCount++;
          }
          continue;
        }

        if (loadedEpgUrls.has(sourceLocation)) {
          skippedCount++;
          continue;
        }

        const res =
          source.loadMode === "api"
            ? await masterSourceLoad(source.id)
            : source.url
              ? await loadEpgFromUrl(source.url)
              : { ok: false as const, error: "Master guide source has no URL" };

        const epg = res.ok ? resolveEpgData(res.data) : null;

        if (res.ok && epg) {
          const entry: EpgEntry = {
            id: "",
            name: source.name,
            location: sourceLocation,
            type: "url",
            programmeCount: epg.programmes.length,
            channelCount: epg.channels.length,
            addedAt: Date.now(),
          };
          addEpg(entry, epg.programmes, epg.index);
          loadedEpgUrls.add(sourceLocation);
          loadedCount++;
        } else {
          failedCount++;
        }
      }

      const detail = [
        `${loadedCount} loaded`,
        skippedCount ? `${skippedCount} already loaded` : "",
        failedCount ? `${failedCount} failed` : "",
      ]
        .filter(Boolean)
        .join(", ");

      showToast(`Master sources: ${detail}`, failedCount ? "error" : "success");
    } catch (err) {
      showToast(String(err), "error");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="page page-library">
      <h1 className="page-title">{t("nav.library", locale)}</h1>

      {isMaster && (
        <section className="card master-sources-card">
          <div className="master-sources-header">
            <div className="source-info">
              <h2>Master Profile</h2>
              <span className="source-meta">
                {masterSources.length
                  ? `${masterSources.length} private source${masterSources.length === 1 ? "" : "s"}`
                  : "Private sources"}
              </span>
            </div>
            <button className="btn-primary" onClick={handleLoadMasterSources} disabled={!!loading}>
              {loading === "master-sources" ? "Loading..." : "Load Private Sources"}
            </button>
          </div>

          {masterSources.length > 0 && (
            <ul className="source-list master-source-list">
              {masterSources.map((source) => (
                <li key={source.id} className="source-item">
                  <div className="source-info">
                    <span className="source-name">{source.name}</span>
                    <span className="source-meta">
                      {source.kind === "playlist" ? "Playlist" : "Guide"}
                      {source.loadMode === "api" ? " - Master API" : ""}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ── Library Stats Dashboard ──────────────────────── */}
      {(stats.channelCount > 0 || stats.epgSourceCount > 0) && (
        <section className="library-stats">
          <div className="library-stat-card">
            <span className="library-stat-icon">📡</span>
            <span className="library-stat-value">{stats.channelCount}</span>
            <span className="library-stat-label">{t("nav.channels", locale)}</span>
          </div>
          <div className="library-stat-card">
            <span className="library-stat-icon">📂</span>
            <span className="library-stat-value">{stats.groupCount}</span>
            <span className="library-stat-label">{t("library.groups", locale)}</span>
          </div>
          <div className="library-stat-card">
            <span className="library-stat-icon">★</span>
            <span className="library-stat-value">{stats.favoriteCount}</span>
            <span className="library-stat-label">{t("channels.favorites", locale)}</span>
          </div>
          <div className="library-stat-card">
            <span className="library-stat-icon">📅</span>
            <span className="library-stat-value">{stats.programmeCount.toLocaleString()}</span>
            <span className="library-stat-label">{t("library.programmes", locale)}</span>
          </div>
        </section>
      )}

      {/* ── Add Playlist ─────────────────────────────────── */}
      <section className="card">
        <h2>{t("library.addPlaylist", locale)}</h2>
        <div className="input-row">
          <input
            className="text-input"
            placeholder={t("library.playlistUrl", locale)}
            aria-label={t("library.playlistUrl", locale)}
            value={playlistUrl}
            onChange={(e) => setPlaylistUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddPlaylistUrl()}
            disabled={loading === "playlist-url"}
          />
          <button onClick={handleAddPlaylistUrl} disabled={!!loading || !playlistUrl.trim()}>
            {loading === "playlist-url" ? "…" : t("common.add", locale)}
          </button>
        </div>
        <button className="btn-secondary" onClick={handleAddPlaylistFile} disabled={!!loading}>
          {loading === "playlist-file" ? "…" : t("library.loadFile", locale)}
        </button>
      </section>

      {/* ── Playlist sources ─────────────────────────────── */}
      {playlistEntries.length > 0 && (
        <section className="card">
          <h2>{t("library.playlists", locale)}</h2>
          <ul className="source-list">
            {playlistEntries.map((p) => (
              <li key={p.id} className="source-item">
                <div className="source-info">
                  <span className="source-name">{p.name}</span>
                  <span className="source-meta">
                    {p.type === "url" ? "🌐" : "📁"} {p.channelCount} ch •{" "}
                    {new Date(p.addedAt).toLocaleDateString()}
                  </span>
                </div>
                <button
                  className="btn-danger btn-sm"
                  onClick={() => {
                    if (window.confirm(t("library.confirmRemove", locale))) removePlaylist(p.id);
                  }}
                >
                  {t("common.remove", locale)}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Add EPG ──────────────────────────────────────── */}
      <section className="card">
        <h2>{t("library.addEpg", locale)}</h2>

        {/* ── EPG Presets ── */}
        <div className="epg-presets">
          <h3 className="presets-label">{t("library.epgPresets", locale)}</h3>
          <p className="presets-hint">{t("library.epgPresetsHint", locale)}</p>
          <div className="preset-grid">
            {EPG_PRESETS.map((preset) => {
              const alreadyLoaded = epgEntries.some((e) => e.location === preset.url);
              const isLoading = loading === `preset-${preset.id}`;
              return (
                <button
                  key={preset.id}
                  className={`preset-btn${alreadyLoaded ? " preset-loaded" : ""}`}
                  disabled={!!loading || alreadyLoaded}
                  onClick={() => handleLoadPreset(preset.id)}
                  title={preset.url}
                >
                  <span className="preset-flag">{preset.flag}</span>
                  <span className="preset-name">{isLoading ? "…" : preset.name}</span>
                  <span className="preset-region">{preset.region}</span>
                  {alreadyLoaded && <span className="preset-check">✓</span>}
                </button>
              );
            })}
          </div>
        </div>

        <hr className="card-divider" />

        {/* ── Manual URL / File ── */}
        <div className="input-row">
          <input
            className="text-input"
            placeholder={t("library.epgUrl", locale)}
            aria-label={t("library.epgUrl", locale)}
            value={epgUrl}
            onChange={(e) => setEpgUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddEpgUrl()}
            disabled={loading === "epg-url"}
          />
          <button onClick={handleAddEpgUrl} disabled={!!loading || !epgUrl.trim()}>
            {loading === "epg-url" ? "…" : t("common.add", locale)}
          </button>
        </div>
        <button className="btn-secondary" onClick={handleAddEpgFile} disabled={!!loading}>
          {loading === "epg-file" ? "…" : t("library.loadFile", locale)}
        </button>
      </section>

      {/* ── EPG sources ──────────────────────────────────── */}
      {epgEntries.length > 0 && (
        <section className="card">
          <h2>{t("library.epgSources", locale)}</h2>
          <ul className="source-list">
            {epgEntries.map((e) => (
              <li key={e.id} className="source-item">
                <div className="source-info">
                  <span className="source-name">{e.name}</span>
                  <span className="source-meta">
                    {e.type === "url" ? "🌐" : "📁"} {e.programmeCount} prog • {e.channelCount} ch •{" "}
                    {new Date(e.addedAt).toLocaleDateString()}
                  </span>
                </div>
                <button
                  className="btn-danger btn-sm"
                  onClick={() => {
                    if (window.confirm(t("library.confirmRemove", locale))) removeEpg(e.id);
                  }}
                >
                  {t("common.remove", locale)}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Empty state ──────────────────────────────────── */}
      {playlistEntries.length === 0 && epgEntries.length === 0 && (
        <div className="empty-state">
          <span className="empty-icon">📚</span>
          <p>{t("library.empty", locale)}</p>
        </div>
      )}
    </div>
  );
}

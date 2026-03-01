import { useState } from "react";
import { useAppStore, type PlaylistEntry, type EpgEntry } from "../stores/app-store";
import { t } from "../lib/i18n";
import {
  loadPlaylistFromUrl,
  loadPlaylistFromFile,
  loadEpgFromUrl,
  loadEpgFromFile,
} from "../lib/bridge";
import { showToast } from "../components/Toast";
import { EPG_PRESETS } from "../lib/epg-presets";

export function LibraryPage() {
  const locale = useAppStore((s) => s.locale);
  const playlistEntries = useAppStore((s) => s.playlistEntries);
  const epgEntries = useAppStore((s) => s.epgEntries);
  const addPlaylist = useAppStore((s) => s.addPlaylist);
  const removePlaylist = useAppStore((s) => s.removePlaylist);
  const addEpg = useAppStore((s) => s.addEpg);
  const removeEpg = useAppStore((s) => s.removeEpg);

  const [playlistUrl, setPlaylistUrl] = useState("");
  const [epgUrl, setEpgUrl] = useState("");
  const [loading, setLoading] = useState<string | null>(null);

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
      // In Electron, we'd open a file dialog. For now, prompt for path.
      const path = prompt(t("library.enterFilePath", locale));
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
          `${t("library.epgAdded", locale)} (${res.data.programmes.length} programmes)`,
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
      const path = prompt(t("library.enterFilePath", locale));
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
          `${t("library.epgAdded", locale)} (${res.data.programmes.length} programmes)`,
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
      showToast(`${preset.name} is already loaded`, "error");
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

  return (
    <div className="page page-library">
      <h1 className="page-title">{t("nav.library", locale)}</h1>

      {/* ── Add Playlist ─────────────────────────────────── */}
      <section className="card">
        <h2>{t("library.addPlaylist", locale)}</h2>
        <div className="input-row">
          <input
            className="text-input"
            placeholder={t("library.playlistUrl", locale)}
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
                <button className="btn-danger btn-sm" onClick={() => removePlaylist(p.id)}>
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
                <button className="btn-danger btn-sm" onClick={() => removeEpg(e.id)}>
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

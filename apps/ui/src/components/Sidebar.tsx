import { useAppStore } from "../stores/app-store";
import { t } from "../lib/i18n";

const APP_VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "0.1.0";

export type Page = "library" | "channels" | "guide" | "player" | "settings" | "history" | "support";

interface SidebarProps {
  current: Page;
  onChange: (page: Page) => void;
}

const NAV: { page: Page; icon: string; labelKey: string }[] = [
  { page: "library", icon: "📚", labelKey: "nav.library" },
  { page: "channels", icon: "📡", labelKey: "nav.channels" },
  { page: "guide", icon: "📅", labelKey: "nav.guide" },
  { page: "player", icon: "▶️", labelKey: "nav.player" },
  { page: "history", icon: "🕒", labelKey: "nav.history" },
  { page: "support", icon: "🎌", labelKey: "nav.support" },
  { page: "settings", icon: "⚙️", labelKey: "nav.settings" },
];

export function Sidebar({ current, onChange }: SidebarProps) {
  const locale = useAppStore((s) => s.locale);
  const setLocale = useAppStore((s) => s.setLocale);
  const channelCount = useAppStore((s) => s.channels.length);
  const lastWatched = useAppStore((s) => s.lastWatched);
  const favoriteCount = useAppStore((s) => s.favorites.size);

  return (
    <aside className="sidebar" role="navigation" aria-label="Main navigation">
      <div className="sidebar-brand">
        <span className="sidebar-logo">⚔️</span>
        <span className="sidebar-title">StreamShōgun</span>
      </div>

      <nav className="sidebar-nav">
        {NAV.map((item) => (
          <button
            key={item.page}
            className={`sidebar-btn${current === item.page ? " active" : ""}`}
            onClick={() => onChange(item.page)}
            tabIndex={0}
            aria-current={current === item.page ? "page" : undefined}
          >
            <span className="sidebar-icon">{item.icon}</span>
            <span className="sidebar-label">{t(item.labelKey, locale)}</span>
            {item.page === "channels" && channelCount > 0 && (
              <span className="sidebar-badge">{channelCount}</span>
            )}
            {item.page === "channels" && favoriteCount > 0 && (
              <span
                className="sidebar-badge sidebar-badge-fav"
                title={t("channels.favorites", locale)}
              >
                ★ {favoriteCount}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* ── Recently Watched quick access ─────────────────── */}
      {lastWatched && (
        <div
          className="sidebar-recent"
          onClick={() => onChange("player")}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onChange("player");
            }
          }}
          role="button"
          tabIndex={0}
          aria-label={`Continue watching ${lastWatched.channelName}`}
          title={`Continue: ${lastWatched.channelName}`}
        >
          <span className="sidebar-recent-icon">▶</span>
          <div className="sidebar-recent-info">
            <span className="sidebar-recent-name">{lastWatched.channelName}</span>
            <span className="sidebar-recent-label">{t("sidebar.continueWatching", locale)}</span>
          </div>
        </div>
      )}

      <div className="sidebar-footer">
        <div className="sidebar-stat">
          <span className="sidebar-stat-value">{channelCount}</span>
          <span className="sidebar-stat-label">{t("nav.channels", locale)}</span>
        </div>

        <select
          className="locale-select"
          value={locale}
          onChange={(e) => setLocale(e.target.value as "en" | "es" | "ja")}
          aria-label="Language"
        >
          <option value="en">EN</option>
          <option value="es">ES</option>
          <option value="ja">JA</option>
        </select>
      </div>

      <div className="sidebar-version">
        <span>v{APP_VERSION}</span>
      </div>
    </aside>
  );
}

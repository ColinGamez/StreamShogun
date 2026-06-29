import { useAppStore } from "../stores/app-store";
import { t } from "../lib/i18n";

const APP_VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "0.1.0";

export type Page = "library" | "channels" | "guide" | "player" | "settings" | "history" | "support";

interface SidebarProps {
  current: Page;
  onChange: (page: Page) => void;
}

type NavIcon = "library" | "channels" | "guide" | "player" | "history" | "support" | "settings";

const NAV: { page: Page; icon: NavIcon; labelKey: string }[] = [
  { page: "library", icon: "library", labelKey: "nav.library" },
  { page: "channels", icon: "channels", labelKey: "nav.channels" },
  { page: "guide", icon: "guide", labelKey: "nav.guide" },
  { page: "player", icon: "player", labelKey: "nav.player" },
  { page: "history", icon: "history", labelKey: "nav.history" },
  { page: "support", icon: "support", labelKey: "nav.support" },
  { page: "settings", icon: "settings", labelKey: "nav.settings" },
];

function Icon({ name }: { name: NavIcon }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (name) {
    case "library":
      return (
        <svg {...common}>
          <path d="M4 5.5h6.5v13H4z" />
          <path d="M13.5 5.5H20v13h-6.5z" />
          <path d="M7 8.5h.5M7 11.5h.5M16.5 8.5h.5M16.5 11.5h.5" />
        </svg>
      );
    case "channels":
      return (
        <svg {...common}>
          <path d="M5 19h14" />
          <path d="M7 16l5-9 5 9" />
          <path d="M9.5 12.5h5" />
          <path d="M12 7V4" />
        </svg>
      );
    case "guide":
      return (
        <svg {...common}>
          <path d="M6 4v3M18 4v3" />
          <path d="M4.5 8h15" />
          <rect x="4.5" y="5.5" width="15" height="14" rx="2" />
          <path d="M8 12h3M13 12h3M8 15.5h3M13 15.5h3" />
        </svg>
      );
    case "player":
      return (
        <svg {...common}>
          <rect x="4" y="5" width="16" height="14" rx="2" />
          <path d="M10 9.5v5l4.5-2.5z" fill="currentColor" stroke="none" />
        </svg>
      );
    case "history":
      return (
        <svg {...common}>
          <path d="M5 7v5h5" />
          <path d="M5.7 12a6.5 6.5 0 1 0 1.7-4.4L5 10" />
          <path d="M12 8.5V12l2.5 1.5" />
        </svg>
      );
    case "support":
      return (
        <svg {...common}>
          <path d="M5 8.5a7 7 0 0 1 14 0v3a4 4 0 0 1-4 4h-2" />
          <path d="M5 10.5h3v5H5zM16 10.5h3v5h-3z" />
          <path d="M10.5 18h3" />
        </svg>
      );
    case "settings":
      return (
        <svg {...common}>
          <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z" />
          <path d="M12 3.8v2M12 18.2v2M4.9 6.9l1.4 1.4M17.7 15.7l1.4 1.4M3.8 12h2M18.2 12h2M4.9 17.1l1.4-1.4M17.7 8.3l1.4-1.4" />
        </svg>
      );
  }
}

export function Sidebar({ current, onChange }: SidebarProps) {
  const locale = useAppStore((s) => s.locale);
  const setLocale = useAppStore((s) => s.setLocale);
  const channelCount = useAppStore((s) => s.channels.length);
  const lastWatched = useAppStore((s) => s.lastWatched);
  const favoriteCount = useAppStore((s) => s.favorites.size);

  return (
    <aside className="sidebar" role="navigation" aria-label="Main navigation">
      <div className="sidebar-brand">
        <span className="sidebar-logo" aria-hidden="true">
          S
        </span>
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
            <span className="sidebar-icon">
              <Icon name={item.icon} />
            </span>
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

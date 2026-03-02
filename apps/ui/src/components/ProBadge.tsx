// ── ProBadge — small inline badge for gated Pro features ──────────────
//
// Renders a clickable "⭐ Pro" tag next to disabled controls.
// Clicking opens the upgrade modal via the supplied `onClick`.

interface ProBadgeProps {
  /** Called when the user clicks the badge (typically `requestUpgrade`). */
  onClick?: () => void;
  /** Optional extra class name. */
  className?: string;
}

export function ProBadge({ onClick, className }: ProBadgeProps) {
  return (
    <span
      className={`pro-badge${className ? ` ${className}` : ""}`}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
      title="Pro feature — click to upgrade"
    >
      ⭐ Pro
    </span>
  );
}

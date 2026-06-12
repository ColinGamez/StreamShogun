// ── Skeleton – animated loading placeholder ──────────────────────────

export function Skeleton({ width, height }: { width?: string; height?: string }) {
  return (
    <div
      className="skeleton"
      style={{ width: width ?? "100%", height: height ?? "1em" }}
      aria-hidden="true"
    />
  );
}

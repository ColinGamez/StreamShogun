export interface WindowPlacement {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized?: boolean;
}

interface WorkArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Keep valid multi-monitor placement; recover inaccessible saved title bars. */
export function recoverWindowPlacement(
  saved: WindowPlacement,
  workAreas: WorkArea[],
  primary: WorkArea,
): WindowPlacement {
  if (saved.x === undefined || saved.y === undefined) return saved;
  const x = saved.x;
  const y = saved.y;
  const accessible = workAreas.some(
    (area) =>
      Math.min(x + saved.width, area.x + area.width) - Math.max(x, area.x) >= 80 &&
      y >= area.y &&
      y + 32 <= area.y + area.height,
  );
  if (accessible) return saved;
  const width = Math.max(800, Math.min(saved.width, primary.width));
  const height = Math.max(600, Math.min(saved.height, primary.height));
  return {
    ...saved,
    width,
    height,
    x: primary.x + Math.max(0, Math.floor((primary.width - width) / 2)),
    y: primary.y + Math.max(0, Math.floor((primary.height - height) / 2)),
  };
}

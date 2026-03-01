// ── useVirtualRows – lightweight row-virtualisation hook ──────────────
//
// Given a scrollable container ref, total row count, and row height,
// returns the range [startIdx, endIdx) that should be rendered plus an
// offsetY to apply to the rows container.
//
// Zero dependencies. Works by measuring scrollTop / clientHeight on a
// rAF-debounced scroll listener.

import { useState, useEffect, useCallback, type RefObject } from "react";

export interface VirtualRange {
  /** First visible row index (inclusive). */
  start: number;
  /** Last visible row index (exclusive). */
  end: number;
  /** CSS top offset (px) to position the rendered slice. */
  offsetY: number;
  /** Total virtual height (px) = rowCount * rowHeight. */
  totalHeight: number;
}

const OVERSCAN = 6; // extra rows above/below viewport

export function useVirtualRows(
  containerRef: RefObject<HTMLElement | null>,
  rowCount: number,
  rowHeight: number,
): VirtualRange {
  const [range, setRange] = useState<VirtualRange>({
    start: 0,
    end: Math.min(30, rowCount),
    offsetY: 0,
    totalHeight: rowCount * rowHeight,
  });

  const recalc = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const scrollTop = el.scrollTop;
    const viewH = el.clientHeight;

    const first = Math.floor(scrollTop / rowHeight);
    const visible = Math.ceil(viewH / rowHeight);
    const start = Math.max(0, first - OVERSCAN);
    const end = Math.min(rowCount, first + visible + OVERSCAN);

    setRange({
      start,
      end,
      offsetY: start * rowHeight,
      totalHeight: rowCount * rowHeight,
    });
  }, [containerRef, rowCount, rowHeight]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(recalc);
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    recalc(); // initial

    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [containerRef, recalc]);

  // Re-calc when rowCount changes (e.g. new EPG loaded)
  useEffect(() => {
    recalc();
  }, [rowCount, recalc]);

  return range;
}

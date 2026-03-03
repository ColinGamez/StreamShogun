// ── Focus Trap Hook ────────────────────────────────────────────────────
//
// Traps Tab/Shift+Tab focus within a container element, preventing
// keyboard users from accidentally tabbing out of modal dialogs.
// Also restores focus to the previously focused element on unmount.

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "textarea:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

/**
 * Trap keyboard focus within the referenced element.
 *
 * @param containerRef - ref to the dialog/modal container
 * @param active - whether the trap is currently active
 */
export function useFocusTrap(containerRef: RefObject<HTMLElement | null>, active: boolean): void {
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;

    // Remember what was focused before the trap activated
    previousFocusRef.current = document.activeElement as HTMLElement | null;

    const container = containerRef.current;
    if (!container) return;

    // Move focus into the container
    const focusables = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    if (focusables.length > 0) {
      setTimeout(() => focusables[0].focus(), 50);
    }

    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key !== "Tab" || !container) return;

      const nodes = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (nodes.length === 0) return;

      const first = nodes[0];
      const last = nodes[nodes.length - 1];

      if (e.shiftKey) {
        // Shift+Tab: if focus is on first element, wrap to last
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        // Tab: if focus is on last element, wrap to first
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      // Restore previously focused element
      previousFocusRef.current?.focus();
    };
  }, [containerRef, active]);
}

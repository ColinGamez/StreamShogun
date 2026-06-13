// ── Keyboard Shortcuts Overlay (Ctrl+/ or ?) ─────────────────────────

import { useState, useEffect, useCallback, useRef } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";

interface ShortcutGroup {
  title: string;
  shortcuts: { keys: string[]; description: string }[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "Navigation",
    shortcuts: [
      { keys: ["Alt", "1"], description: "Go to Library" },
      { keys: ["Alt", "2"], description: "Go to Channels" },
      { keys: ["Alt", "3"], description: "Go to Guide" },
      { keys: ["Alt", "4"], description: "Go to Player" },
      { keys: ["Alt", "5"], description: "Go to History" },
      { keys: ["Alt", "6"], description: "Go to Support" },
      { keys: ["Alt", "7"], description: "Go to Settings" },
    ],
  },
  {
    title: "Player",
    shortcuts: [
      { keys: ["↑"], description: "Previous channel" },
      { keys: ["↓"], description: "Next channel" },
      { keys: ["0–9"], description: "Jump to channel number" },
      { keys: ["F"], description: "Toggle fullscreen" },
      { keys: ["M"], description: "Toggle mute" },
      { keys: ["Space"], description: "Pause / resume" },
      { keys: ["Esc"], description: "Back to Channels" },
    ],
  },
  {
    title: "General",
    shortcuts: [
      { keys: ["Ctrl", "/"], description: "Show this help" },
      { keys: ["/"], description: "Focus search (Profile page)" },
      { keys: ["Esc"], description: "Close overlay / cancel" },
    ],
  },
];

export function KeyboardShortcuts() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, open);

  const handleClose = useCallback(() => setOpen(false), []);

  // Listen for Ctrl+/ or ? to toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (
        (e.ctrlKey && e.key === "/") ||
        (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey)
      ) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  if (!open) return null;

  return (
    <div className="shortcuts-backdrop" onClick={handleClose}>
      <div
        className="shortcuts-panel"
        ref={panelRef}
        role="dialog"
        aria-label="Keyboard shortcuts"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shortcuts-header">
          <h2>⌨️ Keyboard Shortcuts</h2>
          <button className="shortcuts-close" onClick={handleClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="shortcuts-body">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title} className="shortcuts-group">
              <h3 className="shortcuts-group-title">{group.title}</h3>
              <div className="shortcuts-list">
                {group.shortcuts.map((s, i) => (
                  <div key={i} className="shortcuts-row">
                    <span className="shortcuts-keys">
                      {s.keys.map((k, j) => (
                        <span key={j}>
                          <kbd className="shortcuts-kbd">{k}</kbd>
                          {j < s.keys.length - 1 && <span className="shortcuts-plus">+</span>}
                        </span>
                      ))}
                    </span>
                    <span className="shortcuts-desc">{s.description}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="shortcuts-footer">
          <span className="shortcuts-hint">
            Press <kbd>Ctrl</kbd>+<kbd>/</kbd> or <kbd>?</kbd> to toggle
          </span>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback, useRef } from "react";

export interface ToastMessage {
  id: number;
  text: string;
  type: "info" | "success" | "error";
  exiting?: boolean;
}

let nextId = 1;
let _addToast: ((msg: Omit<ToastMessage, "id">) => void) | null = null;

/** Imperative helper – call from anywhere. */
export function showToast(text: string, type: ToastMessage["type"] = "info") {
  _addToast?.({ text, type });
}

/** Duration in ms by toast type. Errors persist longer so users can read them. */
function durationFor(type: ToastMessage["type"]): number {
  return type === "error" ? 8000 : 4000;
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    // Clear auto-dismiss timer
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(id);
    }
    // Start exit animation, then remove
    setToasts((prev) =>
      prev.map((toast) => (toast.id === id ? { ...toast, exiting: true } : toast)),
    );
    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 200); // matches toastOut animation
  }, []);

  const add = useCallback(
    (msg: Omit<ToastMessage, "id">) => {
      const id = nextId++;
      setToasts((prev) => [...prev, { ...msg, id }]);
      const timer = setTimeout(() => dismiss(id), durationFor(msg.type));
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  useEffect(() => {
    _addToast = add;
    return () => {
      _addToast = null;
    };
  }, [add]);

  // Cleanup all timers on unmount
  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((t) => clearTimeout(t));
    };
  }, []);

  if (!toasts.length) return null;

  return (
    <div className="toast-container" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast toast-${t.type}${t.exiting ? " toast-exiting" : ""}`}
          role={t.type === "error" ? "alert" : "status"}
        >
          <span className="toast-text">{t.text}</span>
          <button className="toast-dismiss" onClick={() => dismiss(t.id)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

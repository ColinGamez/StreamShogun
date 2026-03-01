import { useState, useEffect, useCallback } from "react";

export interface ToastMessage {
  id: number;
  text: string;
  type: "info" | "success" | "error";
}

let nextId = 1;
let _addToast: ((msg: Omit<ToastMessage, "id">) => void) | null = null;

/** Imperative helper – call from anywhere. */
export function showToast(text: string, type: ToastMessage["type"] = "info") {
  _addToast?.({ text, type });
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const add = useCallback((msg: Omit<ToastMessage, "id">) => {
    const id = nextId++;
    setToasts((prev) => [...prev, { ...msg, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  useEffect(() => {
    _addToast = add;
    return () => {
      _addToast = null;
    };
  }, [add]);

  if (!toasts.length) return null;

  return (
    <div className="toast-container" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

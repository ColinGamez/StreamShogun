// ── Persistence abstraction ───────────────────────────────────────────
//
// localStorage adapter today; swap to SQLite-via-IPC by implementing
// the same PersistenceAdapter interface and passing it to createStore.

export interface PersistenceAdapter {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

/** Default adapter: browser localStorage. */
export const localStorageAdapter: PersistenceAdapter = {
  getItem: (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* quota exceeded – silently drop */
    }
  },
  removeItem: (key) => {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

/** Load a JSON value from the adapter, with a fallback default.
 *  Note: the `as T` cast is intentionally unchecked — localStorage values
 *  are written by our own `saveJson` and schema drift is non-critical.
 *  If stricter validation is needed, pass a Zod schema as a 4th parameter.
 */
export function loadJson<T>(adapter: PersistenceAdapter, key: string, fallback: T): T {
  const raw = adapter.getItem(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Save a JSON-serialisable value through the adapter. */
export function saveJson<T>(adapter: PersistenceAdapter, key: string, value: T): void {
  adapter.setItem(key, JSON.stringify(value));
}

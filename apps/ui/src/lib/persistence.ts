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
 *
 *  Corrupt hand-edited storage must not poison the stores: when no explicit
 *  `validate` predicate is given, the parsed value is still shape-checked
 *  against the fallback (arrays stay arrays, objects stay objects,
 *  primitives keep their type) and the fallback wins on mismatch.
 */
export function loadJson<T>(
  adapter: PersistenceAdapter,
  key: string,
  fallback: T,
  validate?: (value: unknown) => value is T,
): T {
  const raw = adapter.getItem(key);
  if (raw === null) return fallback;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (validate) return validate(parsed) ? parsed : fallback;
    return matchesFallbackShape(parsed, fallback) ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

function matchesFallbackShape<T>(parsed: unknown, fallback: T): boolean {
  if (Array.isArray(fallback)) return Array.isArray(parsed);
  if (fallback !== null && typeof fallback === "object") {
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed);
  }
  if (fallback === null || fallback === undefined) {
    return parsed === null || parsed === undefined || typeof parsed === "object";
  }
  return typeof parsed === typeof fallback;
}

/** Save a JSON-serialisable value through the adapter. */
export function saveJson<T>(adapter: PersistenceAdapter, key: string, value: T): void {
  adapter.setItem(key, JSON.stringify(value));
}

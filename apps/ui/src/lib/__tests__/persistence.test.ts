import { describe, expect, it } from "vitest";
import { loadJson, localStorageAdapter, saveJson, type PersistenceAdapter } from "../persistence";

// In-memory adapter for deterministic tests.
function memAdapter(initial: Record<string, string> = {}): PersistenceAdapter & {
  map: Map<string, string>;
} {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

describe("loadJson / saveJson round-trip", () => {
  it("returns the fallback when the key is absent", () => {
    const a = memAdapter();
    expect(loadJson(a, "missing", { x: 1 })).toEqual({ x: 1 });
    expect(loadJson(a, "missing", 42)).toBe(42);
  });

  it("round-trips objects, arrays, and primitives", () => {
    const a = memAdapter();
    saveJson(a, "obj", { a: [1, 2] });
    saveJson(a, "arr", ["x"]);
    saveJson(a, "num", 7);
    saveJson(a, "nil", null);
    expect(loadJson(a, "obj", {})).toEqual({ a: [1, 2] });
    expect(loadJson(a, "arr", [])).toEqual(["x"]);
    expect(loadJson(a, "num", 0)).toBe(7);
    expect(loadJson(a, "nil", null)).toBeNull();
  });
});

describe("loadJson corrupt-storage guards", () => {
  it("falls back on unparseable JSON", () => {
    const a = memAdapter({ bad: "{not json" });
    expect(loadJson(a, "bad", "safe")).toBe("safe");
  });

  it("arrays stay arrays: an object under an array key is rejected", () => {
    const a = memAdapter({ k: JSON.stringify({ not: "array" }) });
    expect(loadJson<string[]>(a, "k", [])).toEqual([]);
  });

  it("objects stay objects: an array under an object key is rejected", () => {
    const a = memAdapter({ k: JSON.stringify([1, 2, 3]) });
    expect(loadJson(a, "k", { ok: true })).toEqual({ ok: true });
  });

  it("primitives keep their type: a string under a number key is rejected", () => {
    const a = memAdapter({ k: JSON.stringify("seven") });
    expect(loadJson(a, "k", 7)).toBe(7);
  });

  it("null fallback accepts null and objects but rejects primitives", () => {
    expect(loadJson(memAdapter({ k: "null" }), "k", null)).toBeNull();
    expect(loadJson(memAdapter({ k: '{"a":1}' }), "k", null)).toEqual({ a: 1 });
    expect(loadJson(memAdapter({ k: '"text"' }), "k", null)).toBeNull();
  });

  it("an explicit validate predicate replaces the shape heuristic", () => {
    const nonEmptyStrings = (v: unknown): v is string[] => Array.isArray(v) && v.length > 0;

    // Shape matches (array) but the predicate rejects → fallback.
    const a1 = memAdapter({ empty: "[]" });
    expect(loadJson(a1, "empty", ["fallback"], nonEmptyStrings)).toEqual(["fallback"]);

    // Shape mismatches (string under a number fallback) but the predicate
    // accepts → the predicate wins over the heuristic.
    const a2 = memAdapter({ k: '"text"' });
    expect(
      loadJson<string | number>(a2, "k", 0, (v): v is string | number => typeof v === "string"),
    ).toBe("text");
  });
});

describe("localStorageAdapter resilience", () => {
  // Node test env has no localStorage global: every method hits the catch
  // path. The adapter must degrade quietly rather than crash the stores.
  it("degrades to no-op when localStorage is unavailable", () => {
    expect(localStorageAdapter.getItem("k")).toBeNull();
    expect(() => localStorageAdapter.setItem("k", "v")).not.toThrow();
    expect(() => localStorageAdapter.removeItem("k")).not.toThrow();
    expect(loadJson(localStorageAdapter, "k", { safe: true })).toEqual({ safe: true });
  });
});

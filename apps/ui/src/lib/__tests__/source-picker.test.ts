import { afterEach, describe, expect, it, vi } from "vitest";
import { pickSourceFile } from "../bridge";

afterEach(() => vi.unstubAllGlobals());

describe("native source picker bridge", () => {
  it("preserves the full selected path for playlist and guide imports", async () => {
    const path = "C:\\Users\\Streamer\\My Sources\\channels.m3u";
    const pick = vi.fn(async () => ({ ok: true, data: path }));
    vi.stubGlobal("window", { shogun: { pickSourceFile: pick } });
    expect(await pickSourceFile("playlist")).toEqual({ ok: true, data: path });
    expect(await pickSourceFile("epg")).toEqual({ ok: true, data: path });
    expect(pick.mock.calls).toEqual([["playlist"], ["epg"]]);
  });
  it("preserves cancellation and dialog errors", async () => {
    const pick = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, data: null })
      .mockResolvedValueOnce({ ok: false, error: "Dialog unavailable" });
    vi.stubGlobal("window", { shogun: { pickSourceFile: pick } });
    expect(await pickSourceFile("playlist")).toEqual({ ok: true, data: null });
    expect(await pickSourceFile("epg")).toEqual({ ok: false, error: "Dialog unavailable" });
  });
  it("explains desktop-only file importing in the browser", async () => {
    vi.stubGlobal("window", {});
    expect(await pickSourceFile("playlist")).toMatchObject({ ok: false });
  });
});

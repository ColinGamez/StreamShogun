import { describe, expect, it } from "vitest";
import { recoverWindowPlacement } from "../window-placement";

const primary = { x: 0, y: 24, width: 1440, height: 850 };
describe("saved window recovery", () => {
  it("recovers a disconnected-monitor window within the primary work area", () => {
    expect(
      recoverWindowPlacement(
        { x: 2500, y: 100, width: 1800, height: 1200, maximized: true },
        [primary],
        primary,
      ),
    ).toEqual({ x: 0, y: 24, width: 1440, height: 850, maximized: true });
  });
  it("preserves valid placement on a monitor with negative coordinates", () => {
    const secondary = { x: -1920, y: 0, width: 1920, height: 1080 };
    const saved = { x: -1800, y: 100, width: 1200, height: 800 };
    expect(recoverWindowPlacement(saved, [primary, secondary], primary)).toEqual(saved);
  });
  it("recovers a titlebar hidden above the menu bar without losing normal dimensions", () => {
    expect(
      recoverWindowPlacement({ x: 100, y: -800, width: 1000, height: 700 }, [primary], primary),
    ).toEqual({ x: 220, y: 99, width: 1000, height: 700 });
  });
  it("lets Electron center a new window without saved coordinates", () => {
    expect(recoverWindowPlacement({ width: 1200, height: 800 }, [primary], primary)).toEqual({
      width: 1200,
      height: 800,
    });
  });
});

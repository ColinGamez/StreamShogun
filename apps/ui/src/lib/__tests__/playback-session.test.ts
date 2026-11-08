import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPlaybackSession } from "../playback-session";

function fixture(autoPlay = true, video = new EventTarget()) {
  const callbacks = {
    recover: vi.fn(),
    stop: vi.fn(),
    onBuffering: vi.fn(),
    onPlaying: vi.fn(),
    onRetry: vi.fn(),
    onFailure: vi.fn(),
  };
  const session = createPlaybackSession({ video, autoPlay, ...callbacks });
  const emit = (event: string) => video.dispatchEvent(new Event(event));
  return { session, video, emit, ...callbacks };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("playback session lifecycle", () => {
  it("ends a silent startup after 30 seconds and stops the backend exactly once", () => {
    const f = fixture();
    vi.advanceTimersByTime(30_000);
    expect(f.onBuffering).toHaveBeenLastCalledWith(false);
    expect(f.onFailure).toHaveBeenCalledWith(expect.stringContaining("stopped responding"));
    expect(f.stop).toHaveBeenCalledTimes(1);
    f.session.requestRecovery({ kind: "network" });
    f.emit("play");
    f.emit("waiting");
    vi.advanceTimersByTime(100_000);
    expect(f.stop).toHaveBeenCalledTimes(1);
    expect(f.recover).not.toHaveBeenCalled();
  });

  it("does not let repeated waiting or canplay events postpone a stalled stream deadline", () => {
    const f = fixture();
    f.emit("playing");
    f.emit("waiting");
    vi.advanceTimersByTime(20_000);
    f.emit("waiting");
    f.emit("canplay");
    vi.advanceTimersByTime(10_000);
    expect(f.onFailure).toHaveBeenCalledTimes(1);
  });

  it("offers explicit retry after a no-autoplay preload failure without starting recovery", () => {
    const f = fixture(false);
    f.session.requestRecovery({ kind: "network" });
    expect(f.onFailure).toHaveBeenCalledTimes(1);
    expect(f.stop).toHaveBeenCalledTimes(1);
    expect(f.onRetry).not.toHaveBeenCalled();
    expect(f.recover).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100_000);
    expect(f.recover).not.toHaveBeenCalled();
  });

  it("does not time out no-autoplay streams, and watches a subsequent manual play", () => {
    const f = fixture(false);
    f.emit("waiting");
    vi.advanceTimersByTime(100_000);
    expect(f.onFailure).not.toHaveBeenCalled();
    expect(f.onBuffering).toHaveBeenLastCalledWith(false);
    f.emit("play");
    vi.advanceTimersByTime(30_000);
    expect(f.onFailure).toHaveBeenCalledTimes(1);
  });

  it.each(["pause", "ended"])("cancels pending recovery and watchdog on %s", (event) => {
    const f = fixture();
    f.session.requestRecovery({ kind: "native", mediaCode: 2 });
    f.emit(event);
    vi.advanceTimersByTime(100_000);
    expect(f.recover).not.toHaveBeenCalled();
    expect(f.onFailure).not.toHaveBeenCalled();
    expect(f.onBuffering).toHaveBeenLastCalledWith(false);
    f.emit("play");
    vi.advanceTimersByTime(2_000);
    expect(f.recover).toHaveBeenCalledTimes(1);
  });

  it("clears obsolete recovery when playback resumes before the retry timer", () => {
    const f = fixture();
    f.session.requestRecovery({ kind: "network" });
    f.emit("playing");
    vi.advanceTimersByTime(100_000);
    expect(f.recover).not.toHaveBeenCalled();
    expect(f.onFailure).not.toHaveBeenCalled();
    expect(f.onPlaying).toHaveBeenLastCalledWith(true);
  });

  it("queues recovery instead of recursively calling a synchronously failing media backend", () => {
    const f = fixture();
    f.recover.mockImplementation(() => f.session.requestRecovery({ kind: "media" }));
    f.session.requestRecovery({ kind: "media" });
    f.session.requestRecovery({ kind: "media" });
    expect(f.recover).not.toHaveBeenCalled();
    expect(f.onRetry).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(15_000);
    expect(f.recover).toHaveBeenCalledTimes(4);
    expect(f.stop).toHaveBeenCalledTimes(1);
    expect(f.onFailure).toHaveBeenCalledTimes(1);
    expect(f.onBuffering).toHaveBeenLastCalledWith(false);
    vi.advanceTimersByTime(100_000);
    expect(f.recover).toHaveBeenCalledTimes(4);
  });

  it("rearms the watchdog after a backend reset emits pause followed by resumed play", () => {
    const f = fixture();
    f.recover.mockImplementation(() => {
      f.emit("pause");
      f.emit("play");
    });
    f.session.requestRecovery({ kind: "media" });
    vi.advanceTimersByTime(1_000);
    expect(f.recover).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(30_000);
    expect(f.onFailure).toHaveBeenCalledTimes(1);
    expect(f.stop).toHaveBeenCalledTimes(1);
  });

  it("preserves a manifest reload instruction through deferred network recovery", () => {
    const f = fixture();
    f.session.requestRecovery({ kind: "network", status: 503, reloadSource: true });
    vi.advanceTimersByTime(1_000);
    expect(f.recover).toHaveBeenCalledWith({ kind: "network", status: 503, reloadSource: true });
  });

  it.each([
    { kind: "network", status: 403 },
    { kind: "network", status: 404 },
    { kind: "native", mediaCode: 4 },
  ] as const)("terminates permanent failure without automatic retries: %j", (failure) => {
    const f = fixture();
    f.session.requestRecovery(failure);
    expect(f.stop).toHaveBeenCalledTimes(1);
    expect(f.onFailure).toHaveBeenCalledTimes(1);
    expect(f.onRetry).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100_000);
    expect(f.recover).not.toHaveBeenCalled();
  });

  it("disposes old timers and video listeners before a new session starts on the same video", () => {
    const f = fixture();
    f.session.requestRecovery({ kind: "network" });
    f.session.dispose();
    const next = fixture(true, f.video);
    f.emit("play");
    f.emit("waiting");
    f.emit("playing");
    f.session.requestRecovery({ kind: "media" });
    vi.advanceTimersByTime(1_000);
    expect(f.recover).not.toHaveBeenCalled();
    expect(f.onFailure).not.toHaveBeenCalled();
    expect(f.session.active).toBe(false);
    next.session.requestRecovery({ kind: "media" });
    vi.advanceTimersByTime(1_000);
    expect(next.recover).toHaveBeenCalledTimes(1);
    expect(next.onRetry).toHaveBeenCalledWith(1, 1_000);
  });
});

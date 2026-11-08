import {
  describePlaybackFailure,
  shouldRetryPlaybackFailure,
  nextPlaybackRetry,
  type PlaybackFailure,
} from "./playback-policy";

/** Owns one source attachment's recovery budget and video event lifetime. */
export function createPlaybackSession({
  video,
  autoPlay,
  recover,
  stop,
  onBuffering,
  onPlaying,
  onRetry,
  onFailure,
  timeoutMs = 30_000,
}: {
  video: EventTarget;
  autoPlay: boolean;
  recover: (failure: PlaybackFailure & { reloadSource?: boolean }) => void;
  stop: () => void;
  onBuffering: (value: boolean) => void;
  onPlaying: (value: boolean) => void;
  onRetry: (attempt: number, delayMs: number) => void;
  onFailure: (message: string) => void;
  timeoutMs?: number;
}) {
  let closed = false;
  let failed = false;
  let wantsPlayback = autoPlay;
  let attempts = 0;
  let pending: (PlaybackFailure & { reloadSource?: boolean }) | null = null;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  const clearTimers = () => {
    clearTimeout(watchdog);
    clearTimeout(retryTimer);
    watchdog = retryTimer = undefined;
  };
  const terminal = (failure: PlaybackFailure) => {
    if (closed || failed) return;
    failed = true;
    clearTimers();
    pending = null;
    onBuffering(false);
    onPlaying(false);
    stop();
    onFailure(describePlaybackFailure(failure));
  };
  const armWatchdog = () => {
    if (closed || failed || !wantsPlayback || watchdog !== undefined || retryTimer !== undefined)
      return;
    watchdog = setTimeout(() => {
      watchdog = undefined;
      terminal({ kind: "timeout" });
    }, timeoutMs);
  };
  const scheduleRecovery = () => {
    if (closed || failed || !wantsPlayback || !pending || retryTimer !== undefined) return;
    const decision = nextPlaybackRetry(attempts);
    if (!decision.retry) {
      terminal(pending);
      return;
    }
    attempts = decision.attempt;
    onRetry(attempts, decision.delayMs);
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      if (closed || failed || !wantsPlayback || !pending) return;
      const failure = pending;
      pending = null;
      // Arm before backend recovery: it can synchronously emit another error.
      armWatchdog();
      try {
        recover(failure);
      } catch {
        requestRecovery(failure);
      }
    }, decision.delayMs);
  };
  function requestRecovery(failure: PlaybackFailure & { reloadSource?: boolean }) {
    if (closed || failed) return;
    if (!shouldRetryPlaybackFailure(failure)) {
      terminal(failure);
      return;
    }
    // A preload failure cannot rely on a later play event: video.play() may
    // reject before emitting one. Offer explicit retry without starting audio.
    if (!wantsPlayback) {
      terminal(failure);
      return;
    }
    if (pending) return; // Duplicate backend events cannot consume the budget.
    clearTimeout(watchdog);
    watchdog = undefined;
    pending = failure;
    onBuffering(wantsPlayback);
    scheduleRecovery();
  }
  const pause = () => {
    if (closed || failed) return;
    wantsPlayback = false;
    clearTimers();
    onBuffering(false);
    onPlaying(false);
  };
  const play = () => {
    if (closed || failed) return;
    wantsPlayback = true;
    onBuffering(true);
    if (pending) scheduleRecovery();
    else armWatchdog();
  };
  const playing = () => {
    if (closed || failed) return;
    wantsPlayback = true;
    pending = null;
    clearTimers();
    onBuffering(false);
    onPlaying(true);
  };
  const waiting = () => {
    if (closed || failed || !wantsPlayback) return;
    onBuffering(true);
    armWatchdog(); // Repeated waiting must not postpone the deadline.
  };
  const canPlay = () => {
    if (!closed && !failed) onBuffering(false);
  };
  const listeners = { play, playing, pause, waiting, canplay: canPlay, ended: pause };
  for (const [event, handler] of Object.entries(listeners)) video.addEventListener(event, handler);
  onBuffering(autoPlay);
  armWatchdog();
  return {
    requestRecovery,
    pause,
    get wantsPlayback() {
      return wantsPlayback && !closed && !failed;
    },
    get active() {
      return !closed && !failed;
    },
    dispose() {
      if (closed) return;
      closed = true;
      clearTimers();
      for (const [event, handler] of Object.entries(listeners))
        video.removeEventListener(event, handler);
    },
  };
}

"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { Timer, X, Plus } from "lucide-react";

interface RestTimerProps {
  onTimerEnd?: () => void;
}

const STORAGE_KEY = "diet_rest_timer_state";

/* ── The chime runs on the audio clock, not on a page timer ────────────────
   A rest timer is used with the phone face-down, the screen off, or the user
   in another app — which is exactly when the page's own timers stop being
   trustworthy. A hidden tab has `setInterval`/`setTimeout` clamped to about
   one tick a minute, and a frozen one gets none at all, so a chime fired from
   a tick arrived up to a minute late or never.

   The Web Audio clock runs on the audio thread and is not throttled, so the
   note is queued the moment the timer starts, for the exact instant it must
   sound. One context per page, opened inside the tap that starts a timer:
   autoplay policy unlocks a context only on a user gesture, and one opened
   later — on a hidden page, or from a restored timer — stays suspended and
   silent.

   The audio clock is not the wall clock, though: when the platform suspends
   the context (iOS does on screen lock), `currentTime` stops, and a note
   queued against it slips by however long the phone was locked. So the queue
   is re-anchored whenever the page comes back, and a note that still has not
   sounded by the end of the rest is replaced by one sounded now. */
let audioContext: AudioContext | null = null;
let scheduledChime: {
  /** `Date.now()` stamp the note is meant for. */
  at: number;
  /** Audio-clock time the note is actually queued for. */
  startAt: number;
  ctx: AudioContext;
  cancel: () => void;
} | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!audioContext || audioContext.state === "closed") audioContext = new AudioContextClass();
    // A context is suspended — or, on iOS, "interrupted" — by the platform
    // whenever the app goes to the background; resuming a running one is a no-op.
    if (audioContext.state !== "running") {
      void audioContext.resume().catch(() => {});
    }
    return audioContext;
  } catch {
    return null;
  }
}

function cancelScheduledChime() {
  if (!scheduledChime) return;
  scheduledChime.cancel();
  scheduledChime = null;
}

/**
 * Queues the two-note chime for `targetTime` (a `Date.now()` stamp, which may
 * be now). Returns false when Web Audio is unavailable, so the caller can fall
 * back to sounding it from the tick that notices the timer ended.
 */
function scheduleChime(targetTime: number): boolean {
  cancelScheduledChime();
  const ctx = getAudioContext();
  if (!ctx) return false;

  try {
    const startAt = ctx.currentTime + Math.max(0, (targetTime - Date.now()) / 1000);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, startAt); // D5
    osc.frequency.setValueAtTime(880, startAt + 0.15); // A5

    gain.gain.setValueAtTime(0.15, startAt);
    gain.gain.exponentialRampToValueAtTime(0.001, startAt + 0.6);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startAt);
    osc.stop(startAt + 0.6);

    const entry = {
      at: targetTime,
      startAt,
      ctx,
      cancel: () => {
        try {
          // Stopping before the scheduled start silences a note that has been
          // queued but has not sounded yet.
          osc.stop(ctx.currentTime);
        } catch {}
        try {
          osc.disconnect();
          gain.disconnect();
        } catch {}
      },
    };
    osc.onended = () => {
      if (scheduledChime === entry) scheduledChime = null;
    };
    scheduledChime = entry;
    return true;
  } catch {
    return false;
  }
}

/** Seconds of audio time a queued note may trail its wall-clock moment before it counts as slipped. */
const CHIME_SLIP_SECONDS = 0.25;

/** The queued note has not started, and its audio time is behind where the wall clock says it should be. */
function chimeHasSlipped(): boolean {
  const entry = scheduledChime;
  if (!entry || entry.ctx.currentTime >= entry.startAt) return false;
  const soundsAt = Date.now() + (entry.startAt - entry.ctx.currentTime) * 1000;
  return soundsAt - entry.at > CHIME_SLIP_SECONDS * 1000;
}

/* ── One timer per page, outside React ─────────────────────────────────────
   The timer sits inside WorkoutCard, which is keyed by date and remounts on
   every day change, tab switch and loading skeleton — and DayTransition keeps
   a second copy of the outgoing card mounted while it slides out. Held in
   component state, each mount had its own countdown: two could finish the same
   rest (a doubled toast and buzz), and a rest that ended while no copy was
   mounted was never finished at all. The countdown now lives here, once, and
   every mounted RestTimer only renders it. */

interface TimerSnapshot {
  /** `Date.now()` stamp the rest ends at; null when idle or complete. */
  target: number | null;
  /** Length of the rest in seconds; null when idle. */
  total: number | null;
  remaining: number;
}

const IDLE: TimerSnapshot = { target: null, total: null, remaining: 0 };

let timer: TimerSnapshot = IDLE;
let hydrated = false;
let chimeQueued = false;
let stopWatching: (() => void) | null = null;
const listeners = new Set<() => void>();
const endHandlers = new Set<{ current?: () => void }>();

function secondsLeft(target: number) {
  return Math.max(0, Math.ceil((target - Date.now()) / 1000));
}

function setTimer(next: TimerSnapshot) {
  timer = next;
  try {
    if (next.target !== null && next.total !== null) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ target: next.target, total: next.total }));
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch {}
  listeners.forEach((listener) => listener());
}

function unwatch() {
  stopWatching?.();
  stopWatching = null;
}

// Every reading is taken from the wall clock, so a throttled or skipped tick
// costs nothing but a repaint.
function watch(target: number) {
  unwatch();

  const tick = () => {
    if (timer.target === null) return;
    const remaining = secondsLeft(timer.target);
    if (remaining <= 0) finishTimer();
    else if (remaining !== timer.remaining) setTimer({ ...timer, remaining });
  };

  const onReturn = () => {
    if (document.visibilityState === "visible" && chimeHasSlipped() && timer.target !== null) {
      chimeQueued = scheduleChime(timer.target);
    }
    tick();
  };

  // Three ways to notice, because a background tab defeats any one of them:
  // the interval paints the count while the page is on screen; the timeout
  // aims at the end of the rest itself, so completion does not wait for the
  // next quarter-second tick; and the page-visible handlers re-read the clock
  // the instant the app comes back, which is what turns a stale countdown into
  // a finished one on return.
  const interval = window.setInterval(tick, 250);
  const timeout = window.setTimeout(tick, Math.max(0, target - Date.now()) + 30);
  document.addEventListener("visibilitychange", onReturn);
  window.addEventListener("focus", onReturn);
  window.addEventListener("pageshow", onReturn);

  stopWatching = () => {
    window.clearInterval(interval);
    window.clearTimeout(timeout);
    document.removeEventListener("visibilitychange", onReturn);
    window.removeEventListener("focus", onReturn);
    window.removeEventListener("pageshow", onReturn);
  };
}

function startTimer(seconds: number) {
  const target = Date.now() + seconds * 1000;
  chimeQueued = scheduleChime(target);
  setTimer({ target, total: seconds, remaining: seconds });
  watch(target);
}

function addSeconds(sec: number) {
  if (timer.target === null) return;
  const target = timer.target + sec * 1000;
  // The queued note is pinned to the old moment, so it is re-queued rather
  // than left to sound 30 seconds early — and the end-of-rest timeout is
  // re-aimed with it, rather than firing at the old end.
  chimeQueued = scheduleChime(target);
  setTimer({ target, total: (timer.total ?? 0) + sec, remaining: secondsLeft(target) });
  watch(target);
}

function dismissTimer() {
  unwatch();
  cancelScheduledChime();
  chimeQueued = false;
  setTimer(IDLE);
}

function finishTimer() {
  if (timer.target === null) return;
  unwatch();

  // Only when Web Audio could not take the note ahead of time, or the note it
  // took has slipped behind a suspended audio clock — otherwise it has already
  // sounded, on the beat, however late this tick is.
  if (!chimeQueued || chimeHasSlipped()) scheduleChime(Date.now());
  chimeQueued = false;

  setTimer({ target: null, total: timer.total, remaining: 0 });

  try {
    // Vibration is ignored while the page is hidden, so it lands here, on the
    // tick that notices, rather than with the queued note.
    navigator.vibrate?.([150, 80, 150]);
  } catch {}

  // Every mounted copy passes the same handler, so exactly one of them runs.
  for (const handler of endHandlers) {
    if (handler.current) {
      handler.current();
      break;
    }
  }
}

function hydrate() {
  if (hydrated) return;
  hydrated = true;

  // Listen for global custom event to trigger timer from set completion
  window.addEventListener("start-rest-timer", (e: Event) => {
    const customEvent = e as CustomEvent<{ seconds?: number }>;
    startTimer(customEvent.detail?.seconds ?? 90);
  });

  // Restore a timer that was running before a reload.
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    const { target, total } = JSON.parse(stored);
    if (typeof target !== "number" || typeof total !== "number") {
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }

    const left = secondsLeft(target);
    if (left > 0) {
      // No note is queued: a context opened outside a user gesture would be
      // suspended and silent, so the chime falls back to the finishing tick.
      chimeQueued = false;
      setTimer({ target, total, remaining: left });
      watch(target);
    } else {
      // It ran out while the page was away. Report it finished instead of
      // discarding it silently — an empty preset row reads as "the timer
      // never ran", which is the opposite of what happened.
      setTimer({ target: null, total, remaining: 0 });
    }
  } catch {}
}

function subscribe(listener: () => void) {
  hydrate();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => timer;
const getServerSnapshot = () => IDLE;

export default function RestTimer({ onTimerEnd }: RestTimerProps) {
  const { target, total: totalSeconds, remaining: remainingSeconds } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  // The parent passes an inline arrow, so its identity changes on every render
  // of WorkoutCard; the store reads it through a ref instead.
  const onTimerEndRef = useRef(onTimerEnd);
  useEffect(() => {
    onTimerEndRef.current = onTimerEnd;
  }, [onTimerEnd]);
  useEffect(() => {
    endHandlers.add(onTimerEndRef);
    return () => {
      endHandlers.delete(onTimerEndRef);
    };
  }, []);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const PRESETS = [60, 90, 120, 180];

  if (totalSeconds === null) {
    return (
      <div
        className="motion-state-enter flex items-center justify-between border-t px-3 py-2 text-2xs"
        style={{ borderColor: "var(--line)", background: "var(--panel-2)" }}
      >
        <div className="flex items-center gap-1.5 text-ink-faint">
          <Timer size={14} className="text-ink-dim" aria-hidden="true" />
          <span className="font-semibold tracking-wider uppercase text-2xs">Rest Timer</span>
        </div>
        <div className="flex items-center gap-1">
          {PRESETS.map((sec) => (
            <button
              key={sec}
              type="button"
              onClick={() => startTimer(sec)}
              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded px-2.5 py-1 text-xs text-ink-dim hover:text-ink transition-colors"
              style={{ background: "var(--panel)", border: "1px solid var(--line)" }}
              aria-label={`Start ${sec < 60 ? `${sec} seconds` : `${sec / 60} minutes`} rest`}
            >
              <span className="num">{sec < 60 ? `${sec}s` : `${sec / 60}m`}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const progress = totalSeconds > 0 ? (remainingSeconds / totalSeconds) * 100 : 0;
  const isComplete = target === null;

  return (
    <div
      role="timer"
      aria-live="polite"
      aria-atomic="true"
      className="motion-state-enter relative flex items-center justify-between overflow-hidden border-t px-3 py-2.5 text-xs transition-colors"
      style={{
        borderColor: "var(--line)",
        background: isComplete ? "var(--panel-2)" : "var(--panel)",
      }}
    >
      {/* Background progress track */}
      <div
        className="absolute bottom-0 left-0 top-0 w-full origin-left opacity-15 transition-transform duration-300 pointer-events-none"
        style={{
          transform: `scaleX(${progress / 100})`,
          background: isComplete ? "var(--ok)" : "var(--accent)",
        }}
      />

      <div className="relative z-10 flex items-center gap-2">
        <Timer
          size={16}
          className={isComplete ? "text-ok" : "text-accent"}
          aria-hidden="true"
        />
        {isComplete ? (
          <span className="text-xs font-semibold tracking-wide" style={{ color: "var(--ok)" }}>
            Rest Complete
          </span>
        ) : (
          // Hidden from the live region: a figure that changes every second
          // would have a screen reader read the whole bar out once a second.
          // The region then has exactly one thing to announce — the end of the
          // rest — which is the part a user cannot see coming.
          <span
            aria-hidden="true"
            className="num text-sm font-semibold tracking-tight text-ink"
          >
            {formatTime(remainingSeconds)}
          </span>
        )}
      </div>

      <div className="relative z-10 flex items-center gap-1">
        {!isComplete && (
          <button
            type="button"
            onClick={() => addSeconds(30)}
            className="min-h-[36px] flex items-center gap-1 rounded px-2 py-1 text-2xs text-ink-dim hover:text-ink transition-colors"
            style={{ background: "var(--panel-2)", border: "1px solid var(--line)" }}
            aria-label="Add 30 seconds to rest"
          >
            <Plus size={12} aria-hidden="true" />
            <span className="num font-medium">30s</span>
          </button>
        )}
        <button
          type="button"
          onClick={dismissTimer}
          aria-label="Dismiss timer"
          className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded p-1 text-ink-faint hover:text-ink transition-colors"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState, useRef, useCallback } from "react";
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
   silent. */
let audioContext: AudioContext | null = null;
let scheduledChime: { at: number; cancel: () => void } | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!audioContext) audioContext = new AudioContextClass();
    // A context can be suspended by the platform whenever the app goes to the
    // background; resuming is a no-op while it is already running.
    if (audioContext.state === "suspended") {
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

export default function RestTimer({ onTimerEnd }: RestTimerProps) {
  const [totalSeconds, setTotalSeconds] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const targetTimeRef = useRef<number | null>(null);
  // One completion per timer, whoever notices it first — the interval, the
  // end-of-rest timeout, or the resync when the page comes back on screen.
  const endedRef = useRef<boolean>(false);
  const chimeQueuedRef = useRef<boolean>(false);

  // The parent passes an inline arrow, so its identity changes on every render
  // of WorkoutCard. Held in a ref, it cannot become an effect dependency and
  // tear the running countdown down and rebuild it on each keystroke.
  const onTimerEndRef = useRef(onTimerEnd);
  useEffect(() => {
    onTimerEndRef.current = onTimerEnd;
  }, [onTimerEnd]);

  const persistState = (target: number | null, total: number | null) => {
    try {
      if (target && total) {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ target, total }));
      } else {
        sessionStorage.removeItem(STORAGE_KEY);
      }
    } catch {}
  };

  const startTimer = useCallback((seconds: number) => {
    const target = Date.now() + seconds * 1000;
    targetTimeRef.current = target;
    endedRef.current = false;
    chimeQueuedRef.current = scheduleChime(target);
    setTotalSeconds(seconds);
    setRemainingSeconds(seconds);
    setIsRunning(true);
    persistState(target, seconds);
  }, []);

  const addSeconds = useCallback((sec: number) => {
    if (!targetTimeRef.current) return;
    const newTarget = targetTimeRef.current + sec * 1000;
    targetTimeRef.current = newTarget;
    // The queued note is pinned to the old moment, so it is re-queued rather
    // than left to sound 30 seconds early.
    chimeQueuedRef.current = scheduleChime(newTarget);
    setTotalSeconds((prev) => {
      const nextTotal = (prev ?? 0) + sec;
      persistState(newTarget, nextTotal);
      return nextTotal;
    });
    setRemainingSeconds((prev) => prev + sec);
  }, []);

  const cancelTimer = useCallback(() => {
    targetTimeRef.current = null;
    endedRef.current = true;
    cancelScheduledChime();
    setIsRunning(false);
    setTotalSeconds(null);
    setRemainingSeconds(0);
    persistState(null, null);
  }, []);

  const finishTimer = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    targetTimeRef.current = null;
    setIsRunning(false);
    setRemainingSeconds(0);
    persistState(null, null);

    // Only when Web Audio could not take the note ahead of time — otherwise it
    // has already sounded, on the beat, however late this tick is.
    if (!chimeQueuedRef.current) scheduleChime(Date.now());
    chimeQueuedRef.current = false;

    try {
      // Vibration is ignored while the page is hidden, so it lands here, on
      // the tick that notices, rather than with the queued note.
      navigator.vibrate?.([150, 80, 150]);
    } catch {}

    onTimerEndRef.current?.();
  }, []);

  // Restore an active timer from sessionStorage if present
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (!stored) return;
      const { target, total } = JSON.parse(stored);
      if (typeof target !== "number" || typeof total !== "number") {
        sessionStorage.removeItem(STORAGE_KEY);
        return;
      }

      const left = Math.max(0, Math.ceil((target - Date.now()) / 1000));
      if (left > 0) {
        targetTimeRef.current = target;
        endedRef.current = false;
        // The rest keeps running while this component is unmounted (a tab
        // switch), so its note is usually still queued. Queue one only when
        // it is not, and never open a fresh context here: outside a user
        // gesture it would be suspended and silent anyway.
        chimeQueuedRef.current =
          scheduledChime?.at === target || (audioContext !== null && scheduleChime(target));
        setTotalSeconds(total);
        setRemainingSeconds(left);
        setIsRunning(true);
      } else {
        // It ran out while the page was away. Report it finished instead of
        // discarding it silently — an empty preset row reads as "the timer
        // never ran", which is the opposite of what happened.
        endedRef.current = true;
        sessionStorage.removeItem(STORAGE_KEY);
        setTotalSeconds(total);
        setRemainingSeconds(0);
        setIsRunning(false);
      }
    } catch {}
  }, []);

  // Listen for global custom event to trigger timer from set completion
  useEffect(() => {
    const handleTrigger = (e: Event) => {
      const customEvent = e as CustomEvent<{ seconds?: number }>;
      const sec = customEvent.detail?.seconds ?? 90;
      startTimer(sec);
    };

    window.addEventListener("start-rest-timer", handleTrigger);
    return () => window.removeEventListener("start-rest-timer", handleTrigger);
  }, [startTimer]);

  // Main countdown. Every reading is taken from the wall clock, so a throttled
  // or skipped tick costs nothing but a repaint.
  useEffect(() => {
    if (!isRunning) return;

    const tick = () => {
      const target = targetTimeRef.current;
      if (target === null) return;
      const left = Math.max(0, Math.ceil((target - Date.now()) / 1000));
      setRemainingSeconds(left);
      if (left <= 0) finishTimer();
    };

    // Three ways to notice, because a background tab defeats any one of them:
    // the interval paints the count while the page is on screen; the timeout
    // aims at the end of the rest itself, so completion does not wait for the
    // next quarter-second tick; and the page-visible handlers re-read the
    // clock the instant the app comes back, which is what turns a stale
    // countdown into a finished one on return.
    const interval = setInterval(tick, 250);
    const timeout = setTimeout(tick, Math.max(0, (targetTimeRef.current ?? 0) - Date.now()) + 30);

    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    window.addEventListener("pageshow", tick);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
      window.removeEventListener("pageshow", tick);
    };
  }, [isRunning, finishTimer]);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const PRESETS = [60, 90, 120, 180];

  if (!isRunning && totalSeconds === null) {
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

  const progress = totalSeconds && totalSeconds > 0 ? (remainingSeconds / totalSeconds) * 100 : 0;
  const isComplete = remainingSeconds === 0;

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
          onClick={cancelTimer}
          aria-label="Dismiss timer"
          className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded p-1 text-ink-faint hover:text-ink transition-colors"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

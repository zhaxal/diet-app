"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Timer, X, Plus } from "lucide-react";

interface RestTimerProps {
  onTimerEnd?: () => void;
}

const STORAGE_KEY = "diet_rest_timer_state";

function playChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15); // A5

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.6);

    if (navigator.vibrate) {
      navigator.vibrate([150, 80, 150]);
    }
  } catch {
    // AudioContext may be restricted by autoplay policy until user gesture
  }
}

export default function RestTimer({ onTimerEnd }: RestTimerProps) {
  const [totalSeconds, setTotalSeconds] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const targetTimeRef = useRef<number | null>(null);

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
    setTotalSeconds(seconds);
    setRemainingSeconds(seconds);
    setIsRunning(true);
    persistState(target, seconds);
  }, []);

  const addSeconds = useCallback((sec: number) => {
    if (!targetTimeRef.current) return;
    const newTarget = targetTimeRef.current + sec * 1000;
    targetTimeRef.current = newTarget;
    setTotalSeconds((prev) => {
      const nextTotal = (prev ?? 0) + sec;
      persistState(newTarget, nextTotal);
      return nextTotal;
    });
    setRemainingSeconds((prev) => prev + sec);
  }, []);

  const cancelTimer = useCallback(() => {
    targetTimeRef.current = null;
    setIsRunning(false);
    setTotalSeconds(null);
    setRemainingSeconds(0);
    persistState(null, null);
  }, []);

  // Restore active timer from sessionStorage if present
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        const { target, total } = JSON.parse(stored);
        const left = Math.max(0, Math.ceil((target - Date.now()) / 1000));
        if (left > 0) {
          targetTimeRef.current = target;
          setTotalSeconds(total);
          setRemainingSeconds(left);
          setIsRunning(true);
        } else {
          sessionStorage.removeItem(STORAGE_KEY);
        }
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

  // Main countdown interval (timestamp delta)
  useEffect(() => {
    if (!isRunning || !targetTimeRef.current) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const left = Math.max(0, Math.ceil((targetTimeRef.current! - now) / 1000));
      setRemainingSeconds(left);

      if (left <= 0) {
        clearInterval(interval);
        setIsRunning(false);
        persistState(null, null);
        playChime();
        onTimerEnd?.();
      }
    }, 250);

    return () => clearInterval(interval);
  }, [isRunning, onTimerEnd]);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const PRESETS = [60, 90, 120, 180];

  if (!isRunning && totalSeconds === null) {
    return (
      <div
        className="flex items-center justify-between border-t px-3 py-2 text-2xs"
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
      className="relative flex items-center justify-between overflow-hidden border-t px-3 py-2.5 text-xs transition-colors"
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
          <span className="num text-sm font-semibold tracking-tight text-ink">
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

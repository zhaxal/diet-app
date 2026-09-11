"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  FileText,
  Layers,
  Copy,
  Plus,
  Check,
  History,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import {
  api,
  type ClientWorkout,
  type ExerciseStats,
} from "@/lib/api-client";
import {
  parseWorkoutNote,
  formatWorkoutNote,
} from "@/lib/workout-parser";
import RestTimer from "./RestTimer";
import ExerciseHistoryModal from "./ExerciseHistoryModal";

interface WorkoutCardProps {
  date: string;
  weightUnit: string;
  onToast: (msg: string) => void;
}

type ViewMode = "note" | "cards";

export default function WorkoutCard({ date, weightUnit, onToast }: WorkoutCardProps) {
  const [workout, setWorkout] = useState<ClientWorkout | null>(null);
  const [title, setTitle] = useState<string>("Workout");
  const [rawNote, setRawNote] = useState<string>("");
  const [exerciseStats, setExerciseStats] = useState<Record<string, ExerciseStats>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const [viewMode, setViewMode] = useState<ViewMode>("note");
  const [activeExerciseId, setActiveExerciseId] = useState<string | null>(null);
  const [suggestedExercises, setSuggestedExercises] = useState<Array<{ id: string; name: string; normalized: string }>>([]);
  const [showAddMenu, setShowAddMenu] = useState<boolean>(false);
  const [completedSets, setCompletedSets] = useState<Record<string, boolean>>({});

  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Local storage keys
  const draftKey = `workout_draft_${date}`;
  const completedKey = `workout_completed_${date}`;

  // Restore completed sets from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(completedKey);
      if (stored) {
        setCompletedSets(JSON.parse(stored));
      } else {
        setCompletedSets({});
      }
    } catch {
      setCompletedSets({});
    }
  }, [completedKey]);

  // Fetch workout on date change
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    api
      .getWorkout(date)
      .then((res) => {
        if (cancelled) return;
        if (res.workout) {
          setWorkout(res.workout);
          setTitle(res.workout.title);
          setRawNote(res.workout.rawNote);
          setExerciseStats(res.exerciseStats || {});
          setSaveStatus("saved");
        } else {
          // Check local storage draft
          const localDraft = localStorage.getItem(draftKey);
          if (localDraft) {
            try {
              const d = JSON.parse(localDraft);
              setTitle(d.title || "Workout");
              setRawNote(d.rawNote || "");
              setSaveStatus("unsaved");
            } catch {
              setTitle("Workout");
              setRawNote("");
            }
          } else {
            setWorkout(null);
            setTitle("Workout");
            setRawNote("");
            setSaveStatus("saved");
          }
          setExerciseStats(res.exerciseStats || {});
        }
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Failed to load workout", err);
        setLoading(false);
      });

    // Load suggested exercises for autocomplete
    api.searchExercises().then((res) => {
      if (!cancelled && res.exercises) {
        setSuggestedExercises(res.exercises);
      }
    }).catch(() => {});

    return () => {
      cancelled = true;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [date, draftKey]);

  // Save workout to backend
  const persistWorkout = useCallback(
    async (noteToSave: string, titleToSave: string) => {
      setSaveStatus("saving");
      try {
        const res = await api.saveWorkout({
          date,
          title: titleToSave,
          rawNote: noteToSave,
          source: "ui",
        });
        setWorkout(res.workout);
        setExerciseStats(res.exerciseStats || {});
        setSaveStatus("saved");
        localStorage.removeItem(draftKey);
      } catch (err) {
        console.error("Failed to save workout", err);
        setSaveStatus("unsaved");
        onToast("Could not save workout to server — preserved in draft");
      }
    },
    [date, draftKey, onToast],
  );

  // Debounced auto-save on change
  const handleNoteChange = (newText: string) => {
    setRawNote(newText);
    setSaveStatus("unsaved");

    // Save to local storage immediately
    try {
      localStorage.setItem(draftKey, JSON.stringify({ title, rawNote: newText }));
    } catch {}

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      persistWorkout(newText, title);
    }, 1200);
  };

  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    setSaveStatus("unsaved");
    try {
      localStorage.setItem(draftKey, JSON.stringify({ title: newTitle, rawNote }));
    } catch {}

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      persistWorkout(rawNote, newTitle);
    }, 1200);
  };

  // Smart markdown Enter continuation for bullets
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const { selectionStart, selectionEnd, value } = textarea;
      if (selectionStart !== selectionEnd) return;

      // Find start of current line
      const lastNewline = value.lastIndexOf("\n", selectionStart - 1);
      const lineStart = lastNewline === -1 ? 0 : lastNewline + 1;
      const currentLine = value.substring(lineStart, selectionStart);

      // Check if line begins with a bullet
      const bulletMatch = currentLine.match(/^(\s*[-*•]\s+)/);
      if (bulletMatch) {
        const bullet = bulletMatch[1];
        const textAfterBullet = currentLine.substring(bullet.length);

        if (textAfterBullet.trim().length === 0) {
          // Empty bullet: remove it on Enter
          e.preventDefault();
          const before = value.substring(0, lineStart);
          const after = value.substring(selectionStart);
          const nextValue = before + after;
          handleNoteChange(nextValue);

          setTimeout(() => {
            textarea.selectionStart = lineStart;
            textarea.selectionEnd = lineStart;
          }, 0);
        } else {
          // Line has text: auto-continue bullet
          e.preventDefault();
          const before = value.substring(0, selectionStart);
          const after = value.substring(selectionStart);
          const nextValue = before + "\n- " + after;
          handleNoteChange(nextValue);

          const newPos = selectionStart + 3;
          setTimeout(() => {
            textarea.selectionStart = newPos;
            textarea.selectionEnd = newPos;
          }, 0);
        }
      }
    }
  };

  // Toggle set completion, persist to localStorage, and auto-start rest timer
  const handleToggleSet = (setKey: string) => {
    setCompletedSets((prev) => {
      const nextDone = !prev[setKey];
      const nextState = { ...prev, [setKey]: nextDone };
      try {
        localStorage.setItem(completedKey, JSON.stringify(nextState));
      } catch {}

      if (nextDone) {
        window.dispatchEvent(
          new CustomEvent("start-rest-timer", { detail: { seconds: 90 } }),
        );
      }
      return nextState;
    });
  };

  // One-tap format
  const handleFormatNote = () => {
    const parsed = parseWorkoutNote(rawNote, weightUnit as "kg" | "lb");
    const formatted = formatWorkoutNote(parsed);
    handleNoteChange(formatted);
    onToast("Note formatted");
  };

  // One-tap copy last workout
  const handleCopyLast = async () => {
    try {
      // Find previous workout
      const res = await api.searchExercises();
      if (!res.exercises || res.exercises.length === 0) {
        onToast("No previous workouts found");
        return;
      }

      // Pre-fill with common exercises
      const sample = `# Push Day\n\nBench Press\n- 80${weightUnit} x 8\n- 80${weightUnit} x 8\n- 80${weightUnit} x 8\n\nIncline Dumbbell Press\n- 28${weightUnit} x 10\n- 28${weightUnit} x 10\n\nTricep Pushdown\n- 30${weightUnit} x 12\n- 30${weightUnit} x 12\n`;
      handleNoteChange(sample);
      setTitle("Push Day");
      onToast("Copied template note");
    } catch {
      onToast("Could not copy last workout");
    }
  };

  // Append exercise from autocomplete chip
  const handleInsertExercise = (exName: string) => {
    const addition = `\n\n${exName}\n- `;
    const updated = rawNote ? rawNote + addition : `${exName}\n- `;
    handleNoteChange(updated);
    setShowAddMenu(false);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  // Parse current exercises for live badge preview
  const parsedPreview = parseWorkoutNote(rawNote, weightUnit as "kg" | "lb");

  return (
    <div
      className="flex flex-col rounded border overflow-hidden transition-colors"
      style={{ background: "var(--panel)", borderColor: "var(--line)" }}
    >
      {/* Top Bar: Title & Save State */}
      <div
        className="flex items-center justify-between border-b px-3.5 py-2.5"
        style={{ borderColor: "var(--line)", background: "var(--panel-2)" }}
      >
        <input
          type="text"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="Workout name (e.g. Push Day)"
          aria-label="Workout title"
          className="flex-1 bg-transparent text-sm font-bold tracking-tight text-ink placeholder:text-ink-faint focus:outline-none"
        />

        <div className="flex items-center gap-2">
          {/* Mode Switcher */}
          <div
            className="flex items-center rounded border p-0.5"
            style={{ borderColor: "var(--line)", background: "var(--panel)" }}
          >
            <button
              type="button"
              onClick={() => setViewMode("note")}
              aria-label="Obsidian Note Mode"
              aria-pressed={viewMode === "note"}
              className={`min-h-[32px] flex items-center gap-1 rounded px-2.5 py-1 text-2xs transition-colors ${
                viewMode === "note"
                  ? "bg-ink text-panel font-medium"
                  : "text-ink-faint hover:text-ink"
              }`}
            >
              <FileText size={12} aria-hidden="true" />
              Note
            </button>
            <button
              type="button"
              onClick={() => setViewMode("cards")}
              aria-label="Interactive Cards Mode"
              aria-pressed={viewMode === "cards"}
              className={`min-h-[32px] flex items-center gap-1 rounded px-2.5 py-1 text-2xs transition-colors ${
                viewMode === "cards"
                  ? "bg-ink text-panel font-medium"
                  : "text-ink-faint hover:text-ink"
              }`}
            >
              <Layers size={12} aria-hidden="true" />
              Cards
            </button>
          </div>

          {/* Save Status badge */}
          <span
            className="text-2xs font-medium uppercase tracking-wider px-2 py-0.5 rounded"
            style={{
              color: saveStatus === "saved" ? "var(--ok)" : "var(--warn)",
              background:
                saveStatus === "saved"
                  ? "color-mix(in srgb, var(--ok) 10%, transparent)"
                  : "color-mix(in srgb, var(--warn) 10%, transparent)",
            }}
          >
            {saveStatus === "saving" ? "saving…" : saveStatus === "saved" ? "saved" : "draft"}
          </span>
        </div>
      </div>

      {/* Main Body */}
      {viewMode === "note" ? (
        <div className="flex flex-col flex-1 p-3 space-y-2.5">
          {/* Exercise Recognized Chips & "Last Time" Badges */}
          {parsedPreview.exercises.length > 0 && (
            <div
              className="flex flex-wrap gap-1.5 pb-2 border-b"
              style={{ borderColor: "var(--line-soft)" }}
            >
              {parsedPreview.exercises.map((ex, idx) => {
                const stat = exerciseStats[ex.normalized];
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      if (stat?.exerciseId) {
                        setActiveExerciseId(stat.exerciseId);
                      } else {
                        const found = suggestedExercises.find(
                          (s) => s.normalized === ex.normalized,
                        );
                        if (found) setActiveExerciseId(found.id);
                      }
                    }}
                    aria-label={`View history for ${ex.name}`}
                    className="min-h-[32px] flex items-center gap-1.5 rounded px-2.5 py-1 text-2xs border text-left transition-colors hover:border-accent"
                    style={{ background: "var(--panel-2)", borderColor: "var(--line)" }}
                  >
                    <span className="font-semibold text-ink">{ex.name}</span>
                    {stat?.lastPerformance && (
                      <span
                        className="text-ink-dim border-l pl-1.5 font-mono"
                        style={{ borderColor: "var(--line)" }}
                      >
                        Last: {stat.lastPerformance}
                      </span>
                    )}
                    {stat && stat.bestWeightKg > 0 && (
                      <span className="num text-2xs font-semibold text-accent ml-0.5">
                        PR
                      </span>
                    )}
                    <ChevronRight size={10} className="text-ink-faint" aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          )}

          {/* Textarea (Obsidian Note Feel) */}
          <div className="relative flex-1">
            <textarea
              ref={textareaRef}
              rows={12}
              value={rawNote}
              onChange={(e) => handleNoteChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Bench Press&#10;- 80kg x 8&#10;- 80kg x 8&#10;- 85kg x 6&#10;&#10;Incline DB Press&#10;- 30kg x 10&#10;- 30kg x 8"
              aria-label="Workout note markdown"
              className="w-full h-full resize-y rounded bg-transparent p-3 font-mono text-xs leading-relaxed text-ink placeholder:text-ink-faint/60 focus:outline-none"
              style={{
                background: "var(--panel-2)",
                border: "1px solid var(--line-soft)",
              }}
            />
          </div>

          {/* Quick Toolbar */}
          <div className="flex items-center justify-between pt-1 text-2xs">
            <div className="flex items-center gap-2">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowAddMenu(!showAddMenu)}
                  aria-expanded={showAddMenu}
                  aria-label="Add exercise from recent list"
                  className="min-h-[36px] flex items-center gap-1.5 rounded px-2.5 py-1 border font-medium text-ink-dim hover:text-ink transition-colors"
                  style={{ background: "var(--panel-2)", borderColor: "var(--line)" }}
                >
                  <Plus size={12} aria-hidden="true" />
                  Add Exercise
                </button>

                {showAddMenu && (
                  <div
                    className="absolute left-0 bottom-10 z-30 w-56 rounded border max-h-48 overflow-y-auto"
                    style={{ background: "var(--panel)", borderColor: "var(--line)" }}
                  >
                    <div className="p-2 text-2xs font-semibold uppercase tracking-wider text-ink-faint">
                      Recent Exercises
                    </div>
                    {suggestedExercises.length > 0 ? (
                      suggestedExercises.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => handleInsertExercise(s.name)}
                          className="min-h-[36px] w-full text-left px-3 py-1.5 text-xs text-ink hover:bg-ink hover:text-panel transition-colors flex items-center"
                        >
                          {s.name}
                        </button>
                      ))
                    ) : (
                      <div className="p-3 text-2xs text-ink-faint">
                        Type an exercise in your note to start tracking!
                      </div>
                    )}
                  </div>
                )}
              </div>

              {!rawNote && (
                <button
                  type="button"
                  onClick={handleCopyLast}
                  className="min-h-[36px] flex items-center gap-1.5 rounded px-2.5 py-1 border font-medium text-ink-dim hover:text-ink transition-colors"
                  style={{ background: "var(--panel-2)", borderColor: "var(--line)" }}
                >
                  <Copy size={12} aria-hidden="true" />
                  Sample Template
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={handleFormatNote}
              aria-label="Clean up note formatting"
              className="min-h-[36px] px-2 flex items-center gap-1 text-ink-faint hover:text-ink transition-colors"
            >
              <Sparkles size={12} aria-hidden="true" />
              Format
            </button>
          </div>
        </div>
      ) : (
        /* Cards Mode */
        <div className="p-3 space-y-3">
          {parsedPreview.exercises.length === 0 ? (
            <div className="py-8 text-center text-xs text-ink-faint">
              No exercises parsed yet. Switch to Note mode to write down your workout!
            </div>
          ) : (
            parsedPreview.exercises.map((ex, exIdx) => {
              const stat = exerciseStats[ex.normalized];
              return (
                <div
                  key={exIdx}
                  className="rounded border overflow-hidden"
                  style={{ background: "var(--panel-2)", borderColor: "var(--line)" }}
                >
                  {/* Exercise Header */}
                  <div
                    className="flex items-center justify-between px-3.5 py-2.5 border-b"
                    style={{ borderColor: "var(--line)" }}
                  >
                    <div>
                      <button
                        type="button"
                        onClick={() => {
                          if (stat?.exerciseId) setActiveExerciseId(stat.exerciseId);
                        }}
                        aria-label={`View history for ${ex.name}`}
                        className="font-bold text-xs text-ink hover:text-accent flex items-center gap-1.5 transition-colors"
                      >
                        {ex.name}
                        <History size={12} className="text-ink-faint" aria-hidden="true" />
                      </button>
                      {stat?.lastPerformance && (
                        <div className="text-2xs font-mono text-ink-faint mt-0.5">
                          Last session: {stat.lastPerformance}
                        </div>
                      )}
                    </div>

                    {stat?.bestWeightKg ? (
                      <span className="flex items-center gap-1 text-2xs text-accent font-semibold">
                        <span className="num uppercase tracking-wider">PR</span>
                        <span className="num text-ink">{stat.bestWeightKg}{weightUnit}</span>
                      </span>
                    ) : null}
                  </div>

                  {/* Sets List */}
                  <div className="divide-y" style={{ borderColor: "var(--line-soft)" }}>
                    {ex.sets.map((set, setIdx) => {
                      const setKey = `${ex.name}_${set.setNumber}`;
                      const isDone = completedSets[setKey] ?? false;

                      return (
                        <div
                          key={setIdx}
                          className="flex items-center justify-between px-3.5 py-1.5 text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleToggleSet(setKey)}
                              aria-label={`Mark set ${set.setNumber} complete`}
                              aria-pressed={isDone}
                              className="min-h-[44px] min-w-[44px] -ml-2.5 flex items-center justify-center transition-colors"
                            >
                              <span
                                className={`flex items-center justify-center h-5 w-5 rounded border transition-colors ${
                                  isDone
                                    ? "bg-ok border-ok text-panel"
                                    : "border-ink-faint hover:border-accent"
                                }`}
                              >
                                {isDone && <Check size={12} strokeWidth={3} aria-hidden="true" />}
                              </span>
                            </button>
                            <span className="num text-2xs text-ink-faint w-5">
                              #{set.setNumber}
                            </span>
                            <span
                              className={`num text-xs font-semibold ${
                                isDone ? "line-through text-ink-faint" : "text-ink"
                              }`}
                            >
                              {set.isBodyweight
                                ? set.weight > 0
                                  ? `+${set.weight}${weightUnit} × ${set.reps}`
                                  : set.weight < 0
                                    ? `${set.weight}${weightUnit} × ${set.reps}`
                                    : `BW × ${set.reps}`
                                : `${set.weight}${weightUnit} × ${set.reps}`}
                            </span>
                            {set.isWarmup && (
                              <span
                                className="text-2xs text-ink-faint bg-panel px-1.5 py-0.5 rounded border"
                                style={{ borderColor: "var(--line)" }}
                              >
                                Warmup
                              </span>
                            )}
                          </div>

                          {set.rpe && (
                            <span className="num text-2xs text-ink-faint">
                              @{set.rpe}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Embedded Rest Timer */}
      <RestTimer onTimerEnd={() => onToast("Rest time is up! Ready for next set.")} />

      {/* Exercise History Modal */}
      {activeExerciseId && (
        <ExerciseHistoryModal
          exerciseId={activeExerciseId}
          onClose={() => setActiveExerciseId(null)}
          unit={weightUnit}
        />
      )}
    </div>
  );
}

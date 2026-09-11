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
  Download,
  UploadCloud,
  Search,
  X,
} from "lucide-react";
import {
  api,
  type ClientWorkout,
  type ExerciseStats,
} from "@/lib/api-client";
import {
  parseWorkoutNote,
  formatWorkoutNote,
  calculateSessionStats,
} from "@/lib/workout-parser";
import {
  MUSCLE_GROUPS,
  type MuscleGroupFilter,
} from "@/lib/default-exercises";
import RestTimer from "./RestTimer";
import ExerciseHistoryModal from "./ExerciseHistoryModal";
import WorkoutImportModal from "./WorkoutImportModal";

interface WorkoutCardProps {
  date: string;
  weightUnit: string;
  onToast: (msg: string) => void;
  onWorkoutSaved?: () => void;
}

type ViewMode = "note" | "cards";

export default function WorkoutCard({
  date,
  weightUnit,
  onToast,
  onWorkoutSaved,
}: WorkoutCardProps) {
  const [workout, setWorkout] = useState<ClientWorkout | null>(null);
  const [title, setTitle] = useState<string>("Workout");
  const [rawNote, setRawNote] = useState<string>("");
  const [exerciseStats, setExerciseStats] = useState<Record<string, ExerciseStats>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const [viewMode, setViewMode] = useState<ViewMode>("note");
  const [activeExerciseId, setActiveExerciseId] = useState<string | null>(null);
  const [suggestedExercises, setSuggestedExercises] = useState<
    Array<{ id: string; name: string; normalized: string; muscleGroup?: string }>
  >([]);
  const [showAddMenu, setShowAddMenu] = useState<boolean>(false);
  const [selectedMuscleGroup, setSelectedMuscleGroup] = useState<MuscleGroupFilter>("All");
  const [exerciseSearchQuery, setExerciseSearchQuery] = useState<string>("");
  const [searchingExercises, setSearchingExercises] = useState<boolean>(false);
  const [showImportModal, setShowImportModal] = useState<boolean>(false);
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

  // Load workout from server or local draft
  const loadWorkout = useCallback(() => {
    setLoading(true);
    api
      .getWorkout(date)
      .then((res) => {
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
        console.error("Failed to load workout", err);
        setLoading(false);
      });
  }, [date, draftKey]);

  useEffect(() => {
    loadWorkout();
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [loadWorkout]);

  // Search/filter exercises when menu is opened or query/muscle changes
  useEffect(() => {
    if (!showAddMenu) return;
    let cancelled = false;
    setSearchingExercises(true);
    const timer = setTimeout(() => {
      api
        .searchExercises(exerciseSearchQuery, selectedMuscleGroup)
        .then((res) => {
          if (!cancelled && res.exercises) {
            setSuggestedExercises(res.exercises);
          }
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setSearchingExercises(false);
        });
    }, 120);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [showAddMenu, exerciseSearchQuery, selectedMuscleGroup]);

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
        onWorkoutSaved?.();
      } catch (err) {
        console.error("Failed to save workout", err);
        setSaveStatus("unsaved");
        onToast("Could not save workout to server — preserved in draft");
      }
    },
    [date, draftKey, onToast, onWorkoutSaved],
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

  // One-tap insert sample template note
  const handleInsertSample = () => {
    const sample = `# Push Day\n\nBench Press\n- 80${weightUnit} x 8\n- 80${weightUnit} x 8\n- 80${weightUnit} x 8\n\nIncline Dumbbell Press\n- 28${weightUnit} x 10\n- 28${weightUnit} x 10\n\nTricep Pushdown\n- 30${weightUnit} x 12\n- 30${weightUnit} x 12\n`;
    handleNoteChange(sample);
    setTitle("Push Day");
    onToast("Inserted sample template");
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

  // Parse current exercises for live badge preview and session volume stats
  const parsedPreview = parseWorkoutNote(rawNote, weightUnit as "kg" | "lb");
  const sessionStats = calculateSessionStats(parsedPreview.exercises);

  return (
    <div
      className="flex flex-col rounded border overflow-hidden transition-colors"
      style={{ background: "var(--panel)", borderColor: "var(--line)" }}
    >
      {/* Top Bar: Title & Save State */}
      <div
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b px-3.5 py-2.5"
        style={{ borderColor: "var(--line)", background: "var(--panel-2)" }}
      >
        <input
          type="text"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="Workout name (e.g. Push Day)"
          aria-label="Workout title"
          className="flex-1 min-w-0 bg-transparent text-base sm:text-sm font-bold tracking-tight text-ink placeholder:text-ink-faint focus:outline-none"
        />

        <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
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
            className="text-2xs font-medium uppercase tracking-wider px-2 py-0.5 rounded shrink-0 whitespace-nowrap"
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

      {/* Live Session Instrument Bar & Vault Actions */}
      <div
        className="flex flex-wrap items-center justify-between gap-2 border-b px-3.5 py-1.5 text-2xs"
        style={{ borderColor: "var(--line)", background: "var(--panel)" }}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <span className="uppercase tracking-wider text-ink-faint">Vol</span>
            <span className="num font-semibold text-ink">
              {sessionStats.totalVolume.toLocaleString()}
            </span>
            <span className="text-ink-faint">{weightUnit}</span>
          </div>
          <span className="text-ink-faint/30">|</span>
          <div className="flex items-center gap-1">
            <span className="uppercase tracking-wider text-ink-faint">Sets</span>
            <span className="num font-semibold text-ink">{sessionStats.totalSets}</span>
          </div>
          <span className="text-ink-faint/30">|</span>
          <div className="flex items-center gap-1">
            <span className="uppercase tracking-wider text-ink-faint">Reps</span>
            <span className="num font-semibold text-ink">{sessionStats.totalReps}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setShowImportModal(true)}
            aria-label="Import workouts from Markdown"
            className="min-h-[32px] flex items-center gap-1.5 rounded border px-2.5 py-1 font-medium uppercase tracking-wider text-ink-dim hover:text-ink transition-colors"
            style={{ borderColor: "var(--line)", background: "var(--panel-2)" }}
          >
            <UploadCloud size={12} aria-hidden="true" />
            <span>Import</span>
          </button>
          <a
            href="/api/workouts/export?format=markdown"
            download={`workouts-vault-${date}.md`}
            aria-label="Export workouts to Obsidian markdown"
            className="min-h-[32px] flex items-center gap-1.5 rounded border px-2.5 py-1 font-medium uppercase tracking-wider text-ink-dim hover:text-ink transition-colors"
            style={{ borderColor: "var(--line)", background: "var(--panel-2)" }}
          >
            <Download size={12} aria-hidden="true" />
            <span>Export</span>
          </a>
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
              className="w-full h-full resize-y rounded bg-transparent p-3 font-mono text-base sm:text-xs leading-relaxed text-ink placeholder:text-ink-faint/60 focus:outline-none"
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
                  aria-label="Add exercise from database"
                  className="min-h-[36px] flex items-center gap-1.5 rounded px-2.5 py-1 border font-medium text-ink-dim hover:text-ink transition-colors"
                  style={{ background: "var(--panel-2)", borderColor: "var(--line)" }}
                >
                  <Plus size={12} aria-hidden="true" />
                  Add Exercise
                </button>

                {showAddMenu && (
                  <>
                    <div
                      className="fixed inset-0 z-20"
                      onClick={() => {
                        setShowAddMenu(false);
                        setExerciseSearchQuery("");
                      }}
                      aria-hidden="true"
                    />
                    <div
                      className="absolute left-0 bottom-10 z-30 w-[290px] sm:w-[330px] rounded border shadow-lg flex flex-col max-h-[340px] overflow-hidden"
                      style={{ background: "var(--panel)", borderColor: "var(--line)" }}
                    >
                      {/* Search Bar */}
                      <div
                        className="p-2 border-b flex items-center gap-2"
                        style={{ borderColor: "var(--line)", background: "var(--panel-2)" }}
                      >
                        <Search size={13} className="text-ink-faint shrink-0" aria-hidden="true" />
                        <input
                          type="text"
                          value={exerciseSearchQuery}
                          onChange={(e) => setExerciseSearchQuery(e.target.value)}
                          placeholder="Search 65+ exercises..."
                          aria-label="Search exercises"
                          autoFocus
                          className="flex-1 min-w-0 bg-transparent text-base sm:text-xs text-ink placeholder:text-ink-faint focus:outline-none"
                        />
                        {exerciseSearchQuery && (
                          <button
                            type="button"
                            onClick={() => setExerciseSearchQuery("")}
                            aria-label="Clear search"
                            className="p-1 text-ink-faint hover:text-ink"
                          >
                            <X size={12} aria-hidden="true" />
                          </button>
                        )}
                      </div>

                      {/* Muscle Group Pills */}
                      <div
                        className="flex items-center gap-1 px-2 py-1.5 overflow-x-auto border-b scrollbar-none"
                        style={{ borderColor: "var(--line-soft)", background: "var(--panel)" }}
                      >
                        {MUSCLE_GROUPS.map((m) => {
                          const active = selectedMuscleGroup === m;
                          return (
                            <button
                              key={m}
                              type="button"
                              onClick={() => setSelectedMuscleGroup(m)}
                              className={`px-2 py-0.5 rounded text-2xs uppercase tracking-wider shrink-0 transition-colors ${
                                active
                                  ? "bg-ink text-panel font-medium"
                                  : "text-ink-dim hover:text-ink bg-panel-2 border border-line-soft"
                              }`}
                            >
                              {m}
                            </button>
                          );
                        })}
                      </div>

                      {/* Exercises Scroll List */}
                      <div className="overflow-y-auto divide-y max-h-56" style={{ borderColor: "var(--line-soft)" }}>
                        {suggestedExercises.length > 0 ? (
                          suggestedExercises.map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => {
                                handleInsertExercise(s.name);
                                setExerciseSearchQuery("");
                              }}
                              className="min-h-[36px] w-full text-left px-3 py-2 text-xs text-ink hover:bg-ink hover:text-panel transition-colors flex items-center justify-between group"
                            >
                              <div className="truncate mr-2">
                                <div className="font-medium truncate">{s.name}</div>
                              </div>
                              <span className="text-2xs uppercase tracking-wider opacity-60 shrink-0 font-mono">
                                {s.muscleGroup || "Other"}
                              </span>
                            </button>
                          ))
                        ) : (
                          <div className="p-4 text-center text-2xs text-ink-faint">
                            {searchingExercises ? "Searching catalog…" : "No matching exercises found."}
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {!rawNote && (
                <button
                  type="button"
                  onClick={handleInsertSample}
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
                      <span className="flex items-center gap-1 text-2xs text-accent font-semibold shrink-0 whitespace-nowrap">
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

          {parsedPreview.exercises.length > 0 && (
            <div className="pt-1 flex justify-start">
              <button
                type="button"
                onClick={() => setViewMode("note")}
                className="min-h-[36px] flex items-center gap-1.5 rounded px-3 py-1.5 border text-xs font-medium text-ink-dim hover:text-ink transition-colors"
                style={{ background: "var(--panel-2)", borderColor: "var(--line)" }}
              >
                <Plus size={13} aria-hidden="true" />
                Add More Exercises
              </button>
            </div>
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

      {/* Workout Import Modal */}
      {showImportModal && (
        <WorkoutImportModal
          weightUnit={weightUnit}
          onClose={() => setShowImportModal(false)}
          onSuccess={(count) => {
            onToast(`Successfully imported ${count} workout${count === 1 ? "" : "s"}`);
            setShowImportModal(false);
            loadWorkout();
            onWorkoutSaved?.();
          }}
        />
      )}
    </div>
  );
}

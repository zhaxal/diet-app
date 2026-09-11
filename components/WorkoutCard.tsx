"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  Copy,
  Plus,
  Check,
  History,
  ChevronRight,
  Search,
  X,
  Dumbbell,
  AlertCircle,
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
  normalizeExerciseName,
} from "@/lib/workout-parser";
import {
  MUSCLE_GROUPS,
  type MuscleGroupFilter,
  lookupMuscleGroup,
} from "@/lib/default-exercises";
import { WORKOUT_TEMPLATES } from "@/lib/workout-templates";
import { prettyDate } from "@/lib/time-client";
import RestTimer from "./RestTimer";
import ExerciseHistoryModal from "./ExerciseHistoryModal";

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
  const [completedSets, setCompletedSets] = useState<Record<string, boolean>>({});
  const [confirmDelete, setConfirmDelete] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<boolean>(false);
  const [lastSessionInfo, setLastSessionInfo] = useState<{ date: string; title: string } | null>(null);

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

  // Load previous session metadata for quick "Copy from last session"
  useEffect(() => {
    let cancelled = false;
    api
      .getWorkoutDates()
      .then((res) => {
        if (!cancelled && res.sessions && res.sessions.length > 0) {
          const previous = res.sessions.find((s) => s.date < date);
          if (previous) {
            setLastSessionInfo({ date: previous.date, title: previous.title });
          } else {
            setLastSessionInfo(null);
          }
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [date]);

  // Load workout from server or local draft
  const loadWorkout = useCallback(() => {
    setLoading(true);
    setConfirmDelete(false);
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
      if (!noteToSave.trim()) return;
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

  // Delete Workout
  const handleDeleteWorkout = async () => {
    setDeleting(true);
    try {
      if (workout?.id) {
        await api.deleteWorkout({ id: workout.id, date });
      } else {
        await api.deleteWorkout({ date });
      }
    } catch (err) {
      console.warn("Server delete returned error or already gone", err);
    }

    try {
      localStorage.removeItem(draftKey);
      localStorage.removeItem(completedKey);
    } catch {}

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    setWorkout(null);
    setTitle("Workout");
    setRawNote("");
    setCompletedSets({});
    setSaveStatus("saved");
    setConfirmDelete(false);
    setDeleting(false);
    onToast("Workout deleted");
    onWorkoutSaved?.();
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

  // Append exercise from autocomplete chip
  const handleInsertExercise = (exName: string) => {
    const addition = `\n\n${exName}\n- `;
    const updated = rawNote ? rawNote.trimEnd() + addition : `${exName}\n- `;
    handleNoteChange(updated);
    setShowAddMenu(false);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  // One-tap apply starter routine template
  const handleApplyTemplate = (templateId: string) => {
    const tmpl = WORKOUT_TEMPLATES.find((t) => t.id === templateId);
    if (!tmpl) return;
    const content = tmpl.rawNote(weightUnit);
    setTitle(tmpl.name);
    handleNoteChange(content);
    onToast(`Loaded ${tmpl.name} template`);
    setViewMode("note");
  };

  // One-tap copy last session
  const handleCopyLastSession = async () => {
    if (!lastSessionInfo) return;
    setLoading(true);
    try {
      const res = await api.getWorkout(lastSessionInfo.date);
      if (res.workout?.rawNote) {
        setTitle(res.workout.title || "Workout");
        handleNoteChange(res.workout.rawNote);
        onToast(`Copied ${res.workout.title || "workout"} from ${lastSessionInfo.date}`);
        setViewMode("note");
      }
    } catch {
      onToast("Could not copy previous workout");
    } finally {
      setLoading(false);
    }
  };

  // Quick "+ Set" action inside Cards Mode
  const handleAddSetToExercise = (exerciseName: string, currentSets: Array<{ weight: number; reps: number; unit: string }>) => {
    const lastSet = currentSets.length > 0 ? currentSets[currentSets.length - 1] : null;
    const w = lastSet ? lastSet.weight : 0;
    const r = lastSet ? lastSet.reps : 10;
    const u = lastSet ? lastSet.unit : weightUnit;
    const setLine = `- ${w}${u} x ${r}`;

    const lines = rawNote.split("\n");
    let exIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i].trim();
      if (normalizeExerciseName(l) === normalizeExerciseName(exerciseName)) {
        exIdx = i;
        break;
      }
    }

    if (exIdx !== -1) {
      let insertIdx = exIdx + 1;
      while (
        insertIdx < lines.length &&
        (lines[insertIdx].trim().startsWith("-") ||
          lines[insertIdx].trim().startsWith("*") ||
          lines[insertIdx].trim().length === 0)
      ) {
        if (
          lines[insertIdx].trim().length === 0 &&
          insertIdx + 1 < lines.length &&
          !lines[insertIdx + 1].trim().startsWith("-") &&
          !lines[insertIdx + 1].trim().startsWith("*")
        ) {
          break;
        }
        insertIdx++;
      }
      lines.splice(insertIdx, 0, setLine);
      handleNoteChange(lines.join("\n"));
    } else {
      const updated = rawNote.trimEnd() ? `${rawNote.trimEnd()}\n\n${exerciseName}\n${setLine}` : `${exerciseName}\n${setLine}`;
      handleNoteChange(updated);
    }
    onToast(`Added set to ${exerciseName}`);
  };

  // Parse current exercises for live badge preview and session volume stats
  const parsedPreview = parseWorkoutNote(rawNote, weightUnit as "kg" | "lb");
  const sessionStats = calculateSessionStats(parsedPreview.exercises);

  // Collect muscle groups targeted in this session
  const sessionMuscles = Array.from(
    new Set(
      parsedPreview.exercises.map((ex) => lookupMuscleGroup(ex.normalized)),
    ),
  );

  const hasContent = rawNote.trim().length > 0 || workout !== null;

  // ── First-Class Empty State ──────────────────────────────
  if (!loading && !hasContent) {
    return (
      <div
        className="panel p-4 space-y-3 transition-colors"
        style={{ background: "var(--panel)", borderColor: "var(--line)" }}
      >
        <div
          className="flex items-baseline justify-between border-b pb-2"
          style={{ borderColor: "var(--line-soft)" }}
        >
          <span className="text-2xs font-semibold uppercase tracking-wider text-ink-dim">
            No workout logged
          </span>
          <span className="text-2xs uppercase tracking-wider text-ink-faint">
            {prettyDate(date).toLowerCase()}
          </span>
        </div>

        {/* Routine Starters */}
        <div className="space-y-2">
          <span className="text-2xs font-semibold uppercase tracking-wider text-ink-faint block">
            Choose a routine starter
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {WORKOUT_TEMPLATES.map((tmpl) => (
              <button
                key={tmpl.id}
                type="button"
                onClick={() => handleApplyTemplate(tmpl.id)}
                className="p-2 rounded border text-left transition-colors hover:border-accent group"
                style={{ background: "var(--panel-2)", borderColor: "var(--line)" }}
              >
                <div className="text-xs font-bold text-ink group-hover:text-accent transition-colors truncate">
                  {tmpl.name}
                </div>
                <div className="text-2xs text-ink-faint truncate mt-0.5">
                  {tmpl.subtitle}
                </div>
              </button>
            ))}
          </div>

          {/* Quick Copy from previous session */}
          {lastSessionInfo && (
            <button
              type="button"
              onClick={handleCopyLastSession}
              className="w-full mt-2 p-2 rounded border flex items-center justify-between text-xs text-ink hover:border-accent transition-colors"
              style={{ background: "var(--panel-2)", borderColor: "var(--line)" }}
            >
              <div className="flex items-center gap-2 truncate">
                <Copy size={12} className="text-ink-faint shrink-0" aria-hidden="true" />
                <span className="font-semibold truncate">
                  Repeat last: {lastSessionInfo.title}
                </span>
                <span className="num text-2xs text-ink-faint">({lastSessionInfo.date})</span>
              </div>
              <span className="text-2xs font-semibold text-accent uppercase tracking-wider shrink-0 ml-2">
                Copy
              </span>
            </button>
          )}

          <div className="pt-1 text-center">
            <button
              type="button"
              onClick={() => {
                setRawNote("Bench Press\n- ");
                handleNoteChange("Bench Press\n- ");
                setViewMode("note");
              }}
              className="btn btn-ghost text-xs text-ink-dim hover:text-ink"
            >
              Start blank workout note
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Active Workout View ─────────────────────────────────
  return (
    <div
      className="flex flex-col rounded border overflow-hidden transition-colors"
      style={{ background: "var(--panel)", borderColor: "var(--line)" }}
    >
      {/* Top Bar: Title, Mode Switcher, Save State & Delete Action */}
      <div
        className="flex items-center justify-between gap-2 border-b px-3 py-2"
        style={{ borderColor: "var(--line)", background: "var(--panel-2)" }}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <input
            type="text"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Workout name"
            aria-label="Workout title"
            className="flex-1 min-w-0 bg-transparent text-sm font-bold tracking-tight text-ink placeholder:text-ink-faint focus:outline-none truncate"
          />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Mode Switcher */}
          <div
            className="flex items-center rounded border p-0.5"
            style={{ borderColor: "var(--line)", background: "var(--panel)" }}
          >
            <button
              type="button"
              onClick={() => setViewMode("note")}
              aria-label="Markdown Note Mode"
              aria-pressed={viewMode === "note"}
              className={`rounded px-2 py-0.5 text-2xs uppercase tracking-wider transition-colors ${
                viewMode === "note"
                  ? "bg-ink text-panel font-semibold"
                  : "text-ink-faint hover:text-ink"
              }`}
            >
              Note
            </button>
            <button
              type="button"
              onClick={() => setViewMode("cards")}
              aria-label="Interactive Cards Mode"
              aria-pressed={viewMode === "cards"}
              className={`rounded px-2 py-0.5 text-2xs uppercase tracking-wider transition-colors ${
                viewMode === "cards"
                  ? "bg-ink text-panel font-semibold"
                  : "text-ink-faint hover:text-ink"
              }`}
            >
              Cards
            </button>
          </div>

          {/* Save Status telemetry */}
          <span
            className="num text-2xs font-mono uppercase tracking-wider shrink-0 whitespace-nowrap"
            style={{
              color: saveStatus === "saved" ? "var(--ink-faint)" : "var(--warn)",
            }}
          >
            {saveStatus === "saving" ? "· saving…" : saveStatus === "saved" ? "· saved" : "· draft"}
          </span>

          {/* Delete Workout Action */}
          {confirmDelete ? (
            <div className="flex items-center gap-1 shrink-0" role="group" aria-label="Confirm workout deletion">
              <button
                type="button"
                onClick={handleDeleteWorkout}
                disabled={deleting}
                className="px-2 py-0.5 rounded text-2xs font-semibold text-over border border-over hover:bg-over/10 transition-colors"
              >
                {deleting ? "…" : "delete"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="px-2 py-0.5 rounded text-2xs text-ink-faint border border-line hover:text-ink"
              >
                cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              aria-label="Delete this workout"
              title="Delete this workout"
              className="glyph-btn text-2xs text-ink-faint hover:text-over transition-colors"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Session Instrument Metrics Bar */}
      {parsedPreview.exercises.length > 0 && (
        <div
          className="flex items-center justify-between gap-2 border-b px-3 py-1.5 text-2xs"
          style={{ borderColor: "var(--line)", background: "var(--panel)" }}
        >
          <div className="flex items-center gap-2 num text-ink-dim overflow-x-auto no-scrollbar">
            <span>
              <strong className="text-ink">{sessionStats.totalVolume.toLocaleString()}</strong> {weightUnit}
            </span>
            <span className="text-ink-faint/40">·</span>
            <span>
              <strong className="text-ink">{sessionStats.totalSets}</strong> sets
            </span>
            <span className="text-ink-faint/40">·</span>
            <span>
              <strong className="text-ink">{sessionStats.totalReps}</strong> reps
            </span>
          </div>

          {/* Targeted muscle groups */}
          {sessionMuscles.length > 0 && (
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar shrink-0">
              {sessionMuscles.slice(0, 3).map((m) => (
                <span
                  key={m}
                  className="px-1 py-0.5 rounded text-2xs uppercase tracking-wider font-mono text-ink-faint"
                  style={{ background: "var(--panel-2)" }}
                >
                  {m}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main Body */}
      {viewMode === "note" ? (
        <div className="flex flex-col flex-1 p-3 space-y-2.5">
          {/* Exercise Badges in single horizontal scroll strip */}
          {parsedPreview.exercises.length > 0 && (
            <div
              className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1.5 border-b"
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
                    className="flex items-center gap-1 rounded px-2 py-0.5 text-2xs border shrink-0 text-left transition-colors hover:border-accent"
                    style={{ background: "var(--panel-2)", borderColor: "var(--line)" }}
                  >
                    <span className="font-semibold text-ink">{ex.name}</span>
                    <span
                      className={`num border-l pl-1 text-2xs ${
                        ex.sets.length > 0 ? "text-ink-dim" : "text-warn font-semibold"
                      }`}
                      style={{ borderColor: "var(--line)" }}
                    >
                      {ex.sets.length > 0
                        ? `${ex.sets.length} set${ex.sets.length === 1 ? "" : "s"}`
                        : "0 sets"}
                    </span>
                    {stat?.lastPerformance && (
                      <span
                        className="text-ink-dim border-l pl-1 font-mono text-2xs"
                        style={{ borderColor: "var(--line)" }}
                      >
                        {stat.lastPerformance}
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

          {/* Inline syntax reassurance when raw note has text but no exercises parsed */}
          {rawNote.trim().length > 0 && parsedPreview.exercises.length === 0 && (
            <div
              className="flex items-center justify-between gap-2 rounded px-2.5 py-1.5 text-2xs border"
              style={{ background: "var(--panel-2)", borderColor: "var(--line)" }}
            >
              <span className="text-warn">
                No exercises parsed yet. Format lines as: <span className="font-mono text-ink">Exercise Name</span> then <span className="font-mono text-ink">- 80kg x 8</span>
              </span>
              <button
                type="button"
                onClick={handleFormatNote}
                className="font-semibold text-accent uppercase tracking-wider shrink-0 hover:underline"
              >
                Auto-format
              </button>
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
                  <span>Add Exercise</span>
                </button>

                {showAddMenu && (
                  <>
                    <div
                      className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px] sm:bg-transparent sm:backdrop-blur-none"
                      onClick={() => {
                        setShowAddMenu(false);
                        setExerciseSearchQuery("");
                      }}
                      aria-hidden="true"
                    />
                    <div
                      className="fixed inset-x-3 bottom-20 z-50 sm:absolute sm:inset-auto sm:left-0 sm:bottom-10 sm:w-[330px] rounded border shadow-lg flex flex-col max-h-[360px] overflow-hidden"
                      style={{ background: "var(--panel)", borderColor: "var(--line)" }}
                    >
                      {/* Search Bar & Mobile Header */}
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
                        <button
                          type="button"
                          onClick={() => {
                            setShowAddMenu(false);
                            setExerciseSearchQuery("");
                          }}
                          aria-label="Close exercise picker"
                          className="glyph-btn text-ink-faint hover:text-ink sm:hidden -mr-1"
                        >
                          ✕
                        </button>
                      </div>

                      {/* Muscle Group Filter Strip */}
                      <div
                        className="flex items-center gap-1 px-2 py-1.5 overflow-x-auto border-b no-scrollbar"
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
                              className="min-h-[38px] w-full text-left px-3 py-2 text-xs text-ink hover:bg-ink hover:text-panel transition-colors flex items-center justify-between group"
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
            </div>

            <div className="flex items-center gap-2">
              {parsedPreview.exercises.length > 0 && (
                <span className="num text-2xs text-ink-faint">
                  {parsedPreview.exercises.length} ex · {sessionStats.totalSets} set{sessionStats.totalSets === 1 ? "" : "s"}
                </span>
              )}
              <button
                type="button"
                onClick={handleFormatNote}
                aria-label="Clean up note formatting"
                className="min-h-[36px] px-2 flex items-center text-2xs uppercase tracking-wider text-ink-faint hover:text-ink transition-colors"
              >
                Format note
              </button>
            </div>
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

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-2xs uppercase tracking-wider font-mono opacity-60 text-ink">
                        {lookupMuscleGroup(ex.normalized)}
                      </span>
                      {stat?.bestWeightKg ? (
                        <span className="flex items-center gap-1 text-2xs text-accent font-semibold whitespace-nowrap">
                          <span className="num uppercase tracking-wider">PR</span>
                          <span className="num text-ink">{stat.bestWeightKg}{weightUnit}</span>
                        </span>
                      ) : null}
                    </div>
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
                              className="min-h-[40px] min-w-[40px] -ml-2 flex items-center justify-center transition-colors"
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

                  {/* Add Set Quick Button directly on Card */}
                  <button
                    type="button"
                    onClick={() => handleAddSetToExercise(ex.name, ex.sets)}
                    className="w-full py-1.5 px-3 flex items-center justify-center gap-1 text-2xs font-medium text-ink-dim hover:text-ink hover:bg-panel transition-colors border-t"
                    style={{ borderColor: "var(--line-soft)" }}
                  >
                    <Plus size={11} aria-hidden="true" />
                    <span>Add Set</span>
                  </button>
                </div>
              );
            })
          )}

          <div className="pt-1 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setViewMode("note")}
              className="btn btn-ghost text-xs text-ink-dim hover:text-ink"
            >
              Edit Note
            </button>
          </div>
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

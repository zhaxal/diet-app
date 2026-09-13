"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  Copy,
  Plus,
  ChevronRight,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import {
  api,
  type ClientWorkout,
  type ExerciseStats,
} from "@/lib/api-client";
import { parseWorkoutNote, formatWorkoutNote, calculateSessionStats } from "@/lib/workout-parser";
import {
  MUSCLE_GROUPS,
  type MuscleGroupFilter,
  lookupMuscleGroup,
} from "@/lib/default-exercises";
import { WORKOUT_TEMPLATES } from "@/lib/workout-templates";
import { prettyDate } from "@/lib/time-client";
import RestTimer from "./RestTimer";
import ExerciseHistoryModal from "./ExerciseHistoryModal";
import { AlertDialog, Dialog } from "./Dialog";
import { WorkoutDaySkeleton } from "./DayLoadingSkeleton";

interface WorkoutCardProps {
  date: string;
  weightUnit: string;
  onToast: (msg: string) => void;
  onWorkoutSaved?: () => void;
}

export interface CachedWorkoutSession {
  workout: ClientWorkout | null;
  title: string;
  rawNote: string;
  exerciseStats: Record<string, ExerciseStats>;
  saveStatus: "saved" | "saving" | "unsaved";
}

export const workoutSessionCache = new Map<string, CachedWorkoutSession>();

export default function WorkoutCard({
  date,
  weightUnit,
  onToast,
  onWorkoutSaved,
}: WorkoutCardProps) {
  const cached = workoutSessionCache.get(date);
  const [workout, setWorkout] = useState<ClientWorkout | null>(cached ? cached.workout : null);
  const [title, setTitle] = useState<string>(cached ? cached.title : "Workout");
  const [rawNote, setRawNote] = useState<string>(cached ? cached.rawNote : "");
  const [exerciseStats, setExerciseStats] = useState<Record<string, ExerciseStats>>(cached ? cached.exerciseStats : {});
  const [loading, setLoading] = useState<boolean>(!cached);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">(cached ? cached.saveStatus : "saved");
  const [activeExerciseId, setActiveExerciseId] = useState<string | null>(null);

  // Grace period before displaying skeleton: if data arrives within 100ms,
  // do not flash an abrupt skeleton mid-transition.
  const [showSkeleton, setShowSkeleton] = useState(false);

  useEffect(() => {
    if (loading) {
      const timer = setTimeout(() => setShowSkeleton(true), 100);
      return () => clearTimeout(timer);
    } else {
      setShowSkeleton(false);
    }
  }, [loading]);
  const [suggestedExercises, setSuggestedExercises] = useState<
    Array<{ id: string; name: string; normalized: string; muscleGroup?: string }>
  >([]);
  const [showAddMenu, setShowAddMenu] = useState<boolean>(false);
  const [selectedMuscleGroup, setSelectedMuscleGroup] = useState<MuscleGroupFilter>("All");
  const [exerciseSearchQuery, setExerciseSearchQuery] = useState<string>("");
  const [searchingExercises, setSearchingExercises] = useState<boolean>(false);
  const [confirmDelete, setConfirmDelete] = useState<boolean>(false);
  const [showDetails, setShowDetails] = useState<boolean>(false);
  const [copyingLastSession, setCopyingLastSession] = useState(false);
  const [lastSessionInfo, setLastSessionInfo] = useState<{ date: string; title: string } | null>(null);

  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const exerciseSearchRef = useRef<HTMLInputElement | null>(null);

  // Local storage keys
  const draftKey = `workout_draft_${date}`;

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
    if (!workoutSessionCache.has(date)) {
      setLoading(true);
    }
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
          workoutSessionCache.set(date, {
            workout: res.workout,
            title: res.workout.title,
            rawNote: res.workout.rawNote,
            exerciseStats: res.exerciseStats || {},
            saveStatus: "saved",
          });
        } else {
          // Check local storage draft
          let nextTitle = "Workout";
          let nextNote = "";
          let nextStatus: "saved" | "saving" | "unsaved" = "saved";
          const localDraft = localStorage.getItem(draftKey);
          if (localDraft) {
            try {
              const d = JSON.parse(localDraft);
              nextTitle = d.title || "Workout";
              nextNote = d.rawNote || "";
              nextStatus = "unsaved";
            } catch {}
          }
          setWorkout(null);
          setTitle(nextTitle);
          setRawNote(nextNote);
          setSaveStatus(nextStatus);
          setExerciseStats(res.exerciseStats || {});
          workoutSessionCache.set(date, {
            workout: null,
            title: nextTitle,
            rawNote: nextNote,
            exerciseStats: res.exerciseStats || {},
            saveStatus: nextStatus,
          });
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
        workoutSessionCache.set(date, {
          workout: res.workout,
          title: titleToSave,
          rawNote: noteToSave,
          exerciseStats: res.exerciseStats || {},
          saveStatus: "saved",
        });
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
    } catch {}

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    setWorkout(null);
    setTitle("Workout");
    setRawNote("");
    setSaveStatus("saved");
    workoutSessionCache.delete(date);
    setConfirmDelete(false);
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
  };

  // One-tap copy last session
  const handleCopyLastSession = async () => {
    if (!lastSessionInfo) return;
    setCopyingLastSession(true);
    try {
      const res = await api.getWorkout(lastSessionInfo.date);
      if (res.workout?.rawNote) {
        setTitle(res.workout.title || "Workout");
        handleNoteChange(res.workout.rawNote);
        onToast(`Copied ${res.workout.title || "workout"} from ${lastSessionInfo.date}`);
      }
    } catch {
      onToast("Could not copy previous workout");
    } finally {
      setCopyingLastSession(false);
    }
  };

  // Parse current exercises for live badge preview and session volume stats
  const parsedPreview = parseWorkoutNote(rawNote, weightUnit as "kg" | "lb");
  const sessionStats = calculateSessionStats(parsedPreview.exercises);

  // Collect muscle groups targeted in this session
  const sessionMuscles = Array.from(
    new Set(
      parsedPreview.exercises
        .map((ex) => lookupMuscleGroup(ex.normalized))
        .filter((muscle): muscle is string => Boolean(muscle)),
    ),
  );

  const hasContent = rawNote.trim().length > 0 || workout !== null;

  if (loading && showSkeleton) {
    return <WorkoutDaySkeleton date={date} />;
  }

  // ── First-Class Empty State ──────────────────────────────
  if (!hasContent) {
    return (
      <div
        key={`${date}:empty`}
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
              disabled={copyingLastSession}
              className="mt-2 flex w-full items-center justify-between rounded border p-2 text-xs text-ink transition-colors hover:border-accent disabled:cursor-wait disabled:opacity-60"
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
                {copyingLastSession ? "Copying…" : "Copy"}
              </span>
            </button>
          )}

          <div className="pt-1 text-center">
            <button
              type="button"
              onClick={() => {
                setRawNote("Bench Press\n- ");
                handleNoteChange("Bench Press\n- ");
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
      key={`${date}:ready`}
      className="motion-day-surface flex flex-col overflow-hidden rounded border transition-colors"
      style={{ background: "var(--panel)", borderColor: "var(--line)" }}
    >
      {/* Top Bar: Title, Save State & Delete Action */}
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
          {/* Save Status telemetry. `relative top-px`: the monospace face
              sits ~1px higher than the sans-serif "Details" label beside it
              at matching box heights — same font size, different ascent —
              so a centered flex row leaves them a pixel out of true. */}
          <span
            className="num relative top-px text-2xs font-mono uppercase tracking-wider shrink-0 whitespace-nowrap"
            style={{
              color: saveStatus === "saved" ? "var(--ink-faint)" : "var(--warn)",
            }}
          >
            {saveStatus === "saving" ? "· saving…" : saveStatus === "saved" ? "· saved" : "· draft"}
          </span>

          {parsedPreview.exercises.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setShowDetails(true)}
                aria-label="Session details: sets, reps, volume, muscle groups, PRs"
                title="Session details"
                className="glyph-btn flex items-center gap-1 text-2xs text-ink-faint hover:text-ink transition-colors"
              >
                <SlidersHorizontal size={12} aria-hidden="true" />
                <span className="uppercase tracking-wider">Details</span>
              </button>
              {/* Hairline separation between safe Details and destructive delete,
                  matching EntryRow's copy/delete divider — prevents tap collisions
                  on a pair of adjacent glyph buttons. */}
              <span className="w-px h-3.5 bg-line shrink-0" aria-hidden="true" />
            </>
          )}

          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            aria-label="Delete this workout"
            title="Delete this workout"
            className="glyph-btn text-2xs text-ink-faint hover:text-over transition-colors"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Main Body. Deliberately uneven rhythm, not a repeated gap: the
          chips/warning banner are a live reflection of the note below them
          and sit close to it (hair), while the toolbar is a new zone —
          actions on the note, not more of it — and gets a wider gap (base). */}
      <div className="flex flex-1 flex-col p-3">
          {/* Exercise Badges in single horizontal scroll strip */}
          {parsedPreview.exercises.length > 0 && (
            <div
              className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-fade-x pb-1.5 border-b"
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
                    <span
                      className={`font-semibold ${ex.sets.length > 0 ? "text-ink" : "text-warn"}`}
                    >
                      {ex.name}
                    </span>
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
          <div className="relative flex-1 mt-1">
            <textarea
              ref={textareaRef}
              rows={12}
              value={rawNote}
              onChange={(e) => handleNoteChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Bench Press&#10;- 80kg x 8&#10;- 80kg x 8 // prev: 75kg x8&#10;- 85kg x 6&#10;&#10;Incline DB Press&#10;- 30kg x 10&#10;- 30kg x 8"
              aria-label="Workout note markdown"
              className="w-full h-full resize-y rounded bg-transparent p-3 font-mono text-base sm:text-xs leading-relaxed text-ink placeholder:text-ink-faint/60 focus:outline-none"
              style={{
                background: "var(--panel-2)",
                border: "1px solid var(--line-soft)",
              }}
            />
          </div>

          {/* Quick Toolbar */}
          <div className="flex items-center justify-between mt-2 text-2xs">
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

                {/* Always rendered (not gated on showAddMenu) so closing it
                    animates out — conditionally mounting would remove
                    Dialog from the tree before it gets a frame to exit. */}
                <Dialog
                    open={showAddMenu}
                    onClose={() => {
                      setShowAddMenu(false);
                      setExerciseSearchQuery("");
                    }}
                    title="Add Exercise"
                    description="Search the exercise catalog"
                    size="md"
                    initialFocusRef={exerciseSearchRef}
                    bodyClassName="p-0"
                  >
                    <div
                      className="flex min-h-0 flex-col overflow-hidden"
                      style={{ background: "var(--panel)" }}
                    >
                      {/* Search Bar */}
                      <div
                        className="p-2 border-b flex items-center gap-2"
                        style={{ borderColor: "var(--line)", background: "var(--panel-2)" }}
                      >
                        <Search size={13} className="text-ink-faint shrink-0" aria-hidden="true" />
                        <input
                          ref={exerciseSearchRef}
                          type="text"
                          value={exerciseSearchQuery}
                          onChange={(e) => setExerciseSearchQuery(e.target.value)}
                          placeholder="Search 65+ exercises..."
                          aria-label="Search exercises"
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

                      {/* Muscle Group Filter Strip */}
                      <div
                        className="flex items-center gap-1 px-2 py-1.5 overflow-x-auto border-b no-scrollbar scroll-fade-x"
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
                      <div className="max-h-[55dvh] overflow-y-auto divide-y" style={{ borderColor: "var(--line-soft)" }}>
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
                  </Dialog>
              </div>
            </div>

            <div className="flex items-center gap-2">
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

      {/* Embedded Rest Timer */}
      <RestTimer onTimerEnd={() => onToast("Rest time is up! Ready for next set.")} />

      <AlertDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete workout?"
        description={`Delete ${title || "this workout"} from ${prettyDate(date).toLowerCase()}? This removes the entire session and cannot be undone.`}
        confirmLabel="Delete workout"
        onConfirm={handleDeleteWorkout}
      />

      {/* Session Details Modal: volume, sets, reps, muscle groups, PRs.
          Always rendered (not gated on showDetails) so closing it animates
          out — conditionally mounting would remove Dialog from the tree
          before it gets a frame to exit. */}
      <Dialog
          open={showDetails}
          onClose={() => setShowDetails(false)}
          title="Session Details"
          description={prettyDate(date)}
          size="md"
        >
          <div
            className="grid grid-cols-3 gap-px overflow-hidden rounded border border-line"
            style={{ background: "var(--line)" }}
          >
            <div className="p-2.5 text-left" style={{ background: "var(--panel-2)" }}>
              <div className="text-2xs text-ink-faint uppercase tracking-wider">Volume</div>
              <div className="num text-sm font-bold text-ink mt-0.5">
                {sessionStats.totalVolume.toLocaleString()}
                <span className="text-2xs font-normal text-ink-faint ml-0.5">{weightUnit}</span>
              </div>
            </div>
            <div className="p-2.5 text-left" style={{ background: "var(--panel-2)" }}>
              <div className="text-2xs text-ink-faint uppercase tracking-wider">Sets</div>
              <div className="num text-sm font-bold text-ink mt-0.5">{sessionStats.totalSets}</div>
            </div>
            <div className="p-2.5 text-left" style={{ background: "var(--panel-2)" }}>
              <div className="text-2xs text-ink-faint uppercase tracking-wider">Reps</div>
              <div className="num text-sm font-bold text-ink mt-0.5">{sessionStats.totalReps}</div>
            </div>
          </div>

          {sessionMuscles.length > 0 && (
            <div className="mt-3">
              <div className="text-2xs text-ink-faint uppercase tracking-wider mb-1.5">
                Muscle Groups
              </div>
              <div className="flex flex-wrap gap-1">
                {sessionMuscles.map((m) => (
                  <span
                    key={m}
                    className="px-1.5 py-0.5 rounded text-2xs uppercase tracking-wider font-mono text-ink-dim"
                    style={{ background: "var(--panel-2)", border: "1px solid var(--line)" }}
                  >
                    {m}
                  </span>
                ))}
              </div>
            </div>
          )}

          {parsedPreview.exercises.length > 0 && (
            <div className="mt-3">
              <div className="text-2xs text-ink-faint uppercase tracking-wider mb-1.5">
                Exercises
              </div>
              <div className="divide-y rounded border" style={{ borderColor: "var(--line)" }}>
                {parsedPreview.exercises.map((ex, idx) => {
                  const stat = exerciseStats[ex.normalized];
                  return (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-2 px-2.5 py-2 text-xs"
                      style={{ borderColor: "var(--line-soft)" }}
                    >
                      <span className="font-semibold text-ink truncate">{ex.name}</span>
                      <div className="flex items-center gap-2 shrink-0 num text-2xs text-ink-dim">
                        <span className={ex.sets.length > 0 ? "" : "text-warn font-semibold"}>
                          {ex.sets.length} set{ex.sets.length === 1 ? "" : "s"}
                        </span>
                        {stat?.lastPerformance && (
                          <span className="font-mono text-ink-faint">{stat.lastPerformance}</span>
                        )}
                        {stat && stat.bestWeightKg > 0 && (
                          <span className="font-semibold text-accent">PR</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Dialog>

      {/* Exercise History Modal. Always rendered (not gated on
          activeExerciseId) — ExerciseHistoryModal retains the last id it
          was given so its own Dialog can animate out on close. */}
      <ExerciseHistoryModal
        exerciseId={activeExerciseId}
        onClose={() => setActiveExerciseId(null)}
        unit={weightUnit}
      />
    </div>
  );
}

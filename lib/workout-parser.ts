import { toKg, fromKg, type WeightUnit } from "./units";

export interface ParsedSet {
  setNumber: number;
  weight: number; // As entered
  unit: WeightUnit;
  reps: number;
  isWarmup: boolean;
  isBodyweight: boolean;
  rpe?: number;
  notes?: string;
}

export interface ParsedExercise {
  name: string;
  normalized: string;
  notes?: string;
  sets: ParsedSet[];
  unparsedLines?: string[];
}

export interface ParsedWorkout {
  title: string;
  notes?: string;
  exercises: ParsedExercise[];
  rawNote: string;
}

/** Normalize exercise name for matching: trim, lower-case, collapse spaces */
export function normalizeExerciseName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^#+\s*/, "") // remove leading markdown headers
    .replace(/^[-*•]\s*/, "") // remove list bullets
    .replace(/:+$/, "") // remove trailing colons
    .replace(/\s+/g, " ");
}

/** Calculate Estimated 1RM using Epley formula: weight * (1 + reps/30). For reps=1, returns weight. */
export function calculate1RM(weight: number, reps: number): number {
  if (reps <= 0 || weight <= 0) return 0;
  if (reps === 1) return Math.round(weight * 10) / 10;
  if (reps > 15) {
    // 1RM formulas break down past 12-15 reps; cap scaling
    return Math.round(weight * 1.5 * 10) / 10;
  }
  const est = weight * (1 + reps / 30);
  return Math.round(est * 10) / 10;
}

/** Check if a line is a set specification or an exercise name / note */
const SET_PATTERN = /(?:(?:(\+|-)?\s*(\d+(?:\.\d+)?)\s*(kg|lbs?|lb)?)|\b(bw|bodyweight)\b|\bbody\s*weight\b)?\s*(?:[xX*@×]\s*(\d+))(?:\s*reps?)?/i;
const REPS_ONLY_PATTERN = /^[-*•\s]*(\d+)\s*(?:reps?|r)\b/i;

interface ExtractedSetItem {
  weight: number;
  unit: WeightUnit;
  reps: number;
  isWarmup: boolean;
  isBodyweight: boolean;
  rpe?: number;
  notes?: string;
}

/**
 * Attempts to parse a set string.
 * Supports:
 * - "80kg x 8" or "80 x 8" or "80kg * 8"
 * - "+15kg x 6" (weighted bodyweight)
 * - "-20kg x 8" (assisted)
 * - "BW x 10" or "Bodyweight x 12"
 * - "10 reps"
 * - "80kg x 8 (warmup)" or "80kg x 8 @8.5"
 */
function tryParseSet(
  line: string,
  defaultUnit: WeightUnit,
  currentWeight?: { weight: number; unit: WeightUnit; isBodyweight: boolean },
): ExtractedSetItem | null {
  const clean = line.replace(/^(?:[-*•]|\d+[.)])\s+/, "").trim();
  if (!clean) return null;

  const isWarmup = /\b(?:warmup|warm-up|w)\b/i.test(clean) || /\(w\)/i.test(clean);
  const rpeMatch = clean.match(/(?:@|rpe\s*:?)\s*(\d+(?:\.\d+)?)/i);
  const rpe = rpeMatch ? parseFloat(rpeMatch[1]) : undefined;

  // Pattern: "10 reps" or "12 rep"
  const repsOnly = clean.match(REPS_ONLY_PATTERN);
  if (repsOnly) {
    const reps = parseInt(repsOnly[1], 10);
    if (reps > 0 && reps <= 200) {
      return {
        weight: currentWeight ? currentWeight.weight : 0,
        unit: currentWeight ? currentWeight.unit : defaultUnit,
        reps,
        isWarmup,
        isBodyweight: currentWeight ? currentWeight.isBodyweight : true,
        rpe: rpe && rpe >= 1 && rpe <= 10 ? rpe : undefined,
      };
    }
  }

  // Check for standard weight x reps
  // E.g.: "80kg x 8", "+15kg x 6", "BW x 10", "80 x 8", "BW + 15kg x 6"
  const match = clean.match(
    /(?:(bw|bodyweight)\s*\+?\s*)?(?:(\+|-)?\s*(\d+(?:\.\d+)?)\s*(kg|lbs?|lb)?)?(?:^|\s*)(bw|bodyweight)?\s*(?:[xX*×@]\s*(\d+))(?:\s*reps?)?/i,
  );

  if (match) {
    const preBw = match[1];
    const sign = match[2];
    const weightValStr = match[3];
    const unitStr = match[4]?.toLowerCase();
    const postBw = match[5];
    const repsStr = match[6];

    if (repsStr) {
      const reps = parseInt(repsStr, 10);
      if (reps > 0 && reps <= 200) {
        const hasBw = Boolean(preBw || postBw || sign === "+" || sign === "-");
        let isBodyweight = hasBw || (!weightValStr && Boolean(currentWeight?.isBodyweight));
        let unit: WeightUnit = unitStr?.startsWith("lb") ? "lb" : unitStr === "kg" ? "kg" : defaultUnit;
        let weight = 0;

        if (weightValStr) {
          weight = parseFloat(weightValStr);
          if (sign === "-") weight = -weight;
          // Sanity upper bound
          if (Math.abs(weight) > 600) return null;
        } else if (currentWeight && !preBw && !postBw) {
          weight = currentWeight.weight;
          unit = currentWeight.unit;
          isBodyweight = currentWeight.isBodyweight;
        }

        return {
          weight,
          unit,
          reps,
          isWarmup,
          isBodyweight,
          rpe: rpe && rpe >= 1 && rpe <= 10 ? rpe : undefined,
        };
      }
    }
  }

  // Check for bare numbers list e.g. "8, 8, 7" when currentWeight is active
  if (currentWeight) {
    const bareReps = clean.match(/^(\d+)(?:\s*reps?)?$/);
    if (bareReps) {
      const reps = parseInt(bareReps[1], 10);
      if (reps > 0 && reps <= 200) {
        return {
          weight: currentWeight.weight,
          unit: currentWeight.unit,
          reps,
          isWarmup,
          isBodyweight: currentWeight.isBodyweight,
          rpe: rpe && rpe >= 1 && rpe <= 10 ? rpe : undefined,
        };
      }
    }
  }

  return null;
}

/**
 * Parses multi-rep shorthand like "30kg x 12, 12, 10" or "80kg x 8, 80kg x 8, 85kg x 6"
 */
function tryParseCommaSets(
  segment: string,
  defaultUnit: WeightUnit,
): ExtractedSetItem[] | null {
  const parts = segment.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return null;

  const results: ExtractedSetItem[] = [];
  let lastWeightInfo: { weight: number; unit: WeightUnit; isBodyweight: boolean } | undefined;

  for (const part of parts) {
    const item = tryParseSet(part, defaultUnit, lastWeightInfo);
    if (!item) return null; // not a comma-separated set sequence
    lastWeightInfo = { weight: item.weight, unit: item.unit, isBodyweight: item.isBodyweight };
    results.push(item);
  }

  return results.length > 0 ? results : null;
}

/**
 * Main parser: takes a raw markdown text note and returns structured workout data.
 * Zero crashes, preserves raw text, tolerant of comments and notes.
 */
export function parseWorkoutNote(
  rawNote: string,
  defaultUnit: WeightUnit = "kg",
): ParsedWorkout {
  const lines = rawNote.split("\n");
  let title = "Workout";
  let titleFound = false;

  const exercises: ParsedExercise[] = [];
  let currentExercise: ParsedExercise | null = null;
  const generalNotes: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const originalLine = lines[i];
    const trimmed = originalLine.trim();

    if (!trimmed) {
      continue;
    }

    // 1. Check for document title: e.g. "# Push Day", "Title: Push Day", or first non-set heading
    if (!titleFound) {
      const h1Match = trimmed.match(/^#\s+(.+)$/);
      const titlePropMatch = trimmed.match(/^(?:workout|title)\s*:\s*(.+)$/i);
      if (h1Match) {
        title = h1Match[1].trim();
        titleFound = true;
        continue;
      }
      if (titlePropMatch) {
        title = titlePropMatch[1].trim();
        titleFound = true;
        continue;
      }
    }

    // 2. Check for inline colon format: "Bench Press: 80kg x 8, 80kg x 8, 85kg x 6"
    const colonIndex = trimmed.indexOf(":");
    if (colonIndex > 0 && !trimmed.startsWith("-") && !trimmed.startsWith("*")) {
      const candidateName = trimmed.slice(0, colonIndex).replace(/^#+\s*/, "").trim();
      const rest = trimmed.slice(colonIndex + 1).trim();

      const commaSets = tryParseCommaSets(rest, defaultUnit);
      if (commaSets && commaSets.length > 0) {
        const norm = normalizeExerciseName(candidateName);
        const ex: ParsedExercise = {
          name: candidateName,
          normalized: norm,
          sets: commaSets.map((s, idx) => ({ ...s, setNumber: idx + 1 })),
        };
        exercises.push(ex);
        currentExercise = ex;
        continue;
      }
    }

    // 3. Check if this line is a set belonging to the current exercise
    if (currentExercise) {
      // Check for comma sets on a single line: "- 80kg x 8, 80kg x 8"
      const cleanLine = trimmed.replace(/^(?:[-*•]|\d+[.)])\s+/, "").trim();
      const commaSets = tryParseCommaSets(cleanLine, defaultUnit);
      if (commaSets && commaSets.length > 0) {
        for (const s of commaSets) {
          currentExercise.sets.push({
            ...s,
            setNumber: currentExercise.sets.length + 1,
          });
        }
        continue;
      }

      // Check for single set: "- 80kg x 8"
      const singleSet = tryParseSet(trimmed, defaultUnit);
      if (singleSet) {
        currentExercise.sets.push({
          ...singleSet,
          setNumber: currentExercise.sets.length + 1,
        });
        continue;
      }
    }

    // 4. If line starts with a list bullet, but wasn't a set, and we have an exercise:
    // It's an exercise note or comment (e.g. "- left elbow felt sore")
    if (currentExercise && (trimmed.startsWith("-") || trimmed.startsWith("*") || trimmed.startsWith("•"))) {
      const noteContent = trimmed.replace(/^[-*•\s]+/, "");
      currentExercise.notes = currentExercise.notes
        ? `${currentExercise.notes}\n${noteContent}`
        : noteContent;
      continue;
    }

    // 5. If it's a heading (e.g. "## Incline Bench") or looks like an exercise name
    const headingMatch = trimmed.match(/^#{1,4}\s+(.+)$/);
    const exerciseNameCandidate = headingMatch ? headingMatch[1].trim() : trimmed;

    // Reject if it's clearly a set line (e.g. "80kg x 8") that had no parent exercise
    const orphanedSet = tryParseSet(exerciseNameCandidate, defaultUnit);
    if (orphanedSet) {
      // Create a fallback "Exercise" if none exists
      if (!currentExercise) {
        currentExercise = {
          name: "Exercise",
          normalized: "exercise",
          sets: [],
        };
        exercises.push(currentExercise);
      }
      currentExercise.sets.push({
        ...orphanedSet,
        setNumber: currentExercise.sets.length + 1,
      });
      continue;
    }

    // Otherwise, this line begins a new exercise!
    const norm = normalizeExerciseName(exerciseNameCandidate);
    currentExercise = {
      name: exerciseNameCandidate,
      normalized: norm,
      sets: [],
    };
    exercises.push(currentExercise);
  }

  return {
    title: title || "Workout",
    notes: generalNotes.length > 0 ? generalNotes.join("\n") : undefined,
    exercises: exercises.filter((e) => e.sets.length > 0 || e.notes),
    rawNote,
  };
}

/**
 * Converts structured workout data back into clean Obsidian markdown format.
 */
export function formatWorkoutNote(workout: {
  title?: string;
  notes?: string;
  exercises: {
    name: string;
    notes?: string;
    sets: {
      weight: number;
      unit?: string;
      reps: number;
      isWarmup?: boolean;
      isBodyweight?: boolean;
      rpe?: number;
    }[];
  }[];
}): string {
  const parts: string[] = [];
  if (workout.title) {
    parts.push(`# ${workout.title}\n`);
  }

  for (const ex of workout.exercises) {
    parts.push(ex.name);
    if (ex.notes) {
      parts.push(`> ${ex.notes}`);
    }
    for (const s of ex.sets) {
      let setStr = "";
      if (s.isBodyweight) {
        if (s.weight > 0) {
          setStr = `+${s.weight}${s.unit || "kg"} x ${s.reps}`;
        } else if (s.weight < 0) {
          setStr = `${s.weight}${s.unit || "kg"} x ${s.reps}`;
        } else {
          setStr = `BW x ${s.reps}`;
        }
      } else {
        setStr = `${s.weight}${s.unit || "kg"} x ${s.reps}`;
      }

      if (s.isWarmup) {
        setStr += " (warmup)";
      }
      if (s.rpe) {
        setStr += ` @${s.rpe}`;
      }
      parts.push(`- ${setStr}`);
    }
    parts.push(""); // empty line between exercises
  }

  if (workout.notes) {
    parts.push(`\n## Notes\n${workout.notes}`);
  }

  return parts.join("\n").trim();
}

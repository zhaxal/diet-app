import test from "node:test";
import assert from "node:assert/strict";
import {
  parseWorkoutNote,
  formatWorkoutNote,
  calculate1RM,
  normalizeExerciseName,
  parseMultiWorkoutMarkdown,
  generateObsidianExport,
  calculateSessionStats,
} from "../lib/workout-parser";

test("parses standard Obsidian bullet format with title", () => {
  const note = `# Push Day - Chest & Triceps

Bench Press
- 80kg x 8
- 80kg x 8
- 85kg x 6

Incline DB Press
- 30kg x 10
- 30kg x 8
`;

  const parsed = parseWorkoutNote(note, "kg");
  assert.equal(parsed.title, "Push Day - Chest & Triceps");
  assert.equal(parsed.exercises.length, 2);

  assert.equal(parsed.exercises[0].name, "Bench Press");
  assert.equal(parsed.exercises[0].normalized, "bench press");
  assert.equal(parsed.exercises[0].sets.length, 3);
  assert.equal(parsed.exercises[0].sets[0].weight, 80);
  assert.equal(parsed.exercises[0].sets[0].reps, 8);
  assert.equal(parsed.exercises[0].sets[2].weight, 85);
  assert.equal(parsed.exercises[0].sets[2].reps, 6);

  assert.equal(parsed.exercises[1].name, "Incline DB Press");
  assert.equal(parsed.exercises[1].sets.length, 2);
  assert.equal(parsed.exercises[1].sets[0].weight, 30);
  assert.equal(parsed.exercises[1].sets[0].reps, 10);
});

test("parses inline colon format and comma-separated sets", () => {
  const note = `
Bench Press: 80kg x 8, 80kg x 8, 85kg x 6
Tricep Pushdown: 30kg x 12, 12, 10
`;

  const parsed = parseWorkoutNote(note, "kg");
  assert.equal(parsed.exercises.length, 2);

  const bench = parsed.exercises[0];
  assert.equal(bench.name, "Bench Press");
  assert.equal(bench.sets.length, 3);
  assert.equal(bench.sets[2].weight, 85);

  const tricep = parsed.exercises[1];
  assert.equal(tricep.name, "Tricep Pushdown");
  assert.equal(tricep.sets.length, 3);
  assert.equal(tricep.sets[0].weight, 30);
  assert.equal(tricep.sets[0].reps, 12);
  assert.equal(tricep.sets[1].weight, 30);
  assert.equal(tricep.sets[1].reps, 12);
  assert.equal(tricep.sets[2].weight, 30);
  assert.equal(tricep.sets[2].reps, 10);
});

test("handles bodyweight, weighted bodyweight, assisted, and warmup sets", () => {
  const note = `
Pull-ups
- BW x 10
- +15kg x 6
- 8 reps

Dips
- -10kg x 8 (assisted)

Squat
- 40kg x 10 (warmup)
- 100kg x 5 @8.5
`;

  const parsed = parseWorkoutNote(note, "kg");
  assert.equal(parsed.exercises.length, 3);

  const pullups = parsed.exercises[0];
  assert.equal(pullups.sets[0].isBodyweight, true);
  assert.equal(pullups.sets[0].weight, 0);
  assert.equal(pullups.sets[0].reps, 10);

  assert.equal(pullups.sets[1].isBodyweight, true);
  assert.equal(pullups.sets[1].weight, 15);
  assert.equal(pullups.sets[1].reps, 6);

  assert.equal(pullups.sets[2].isBodyweight, true);
  assert.equal(pullups.sets[2].reps, 8);

  const dips = parsed.exercises[1];
  assert.equal(dips.sets[0].weight, -10);
  assert.equal(dips.sets[0].reps, 8);

  const squat = parsed.exercises[2];
  assert.equal(squat.sets[0].isWarmup, true);
  assert.equal(squat.sets[1].isWarmup, false);
  assert.equal(squat.sets[1].rpe, 8.5);
});

test("resilient to gibberish and extracts exercise comments without crashing", () => {
  const note = `
Push Day
asodijfaoweijfawef 12398471298347

Bench Press
- 80kg x 8
- felt some left elbow soreness here
- 80kg x 8
gibberish line that should not crash the parser
`;

  const parsed = parseWorkoutNote(note, "kg");
  assert.equal(parsed.exercises.length, 1);
  assert.equal(parsed.exercises[0].name, "Bench Press");
  assert.equal(parsed.exercises[0].sets.length, 2);
  assert.equal(parsed.exercises[0].notes, "felt some left elbow soreness here");
  assert.equal(parsed.rawNote, note);
});

test("// comments never become sets or exercises, even when they look like one", () => {
  const note = `
// felt sluggish warming up today
Bench Press
- 80kg x 8
// prev: 75kg x8, felt heavier today
- 82.5kg x 6
`;

  const parsed = parseWorkoutNote(note, "kg");
  assert.equal(parsed.notes, "felt sluggish warming up today");
  assert.equal(parsed.exercises.length, 1);
  assert.equal(parsed.exercises[0].sets.length, 2);
  assert.equal(parsed.exercises[0].notes, "prev: 75kg x8, felt heavier today");
});

test("a bare 'previous: 70kg x8' line without // still creates a real exercise (regression guard)", () => {
  // Documents the pre-existing colon-shorthand behavior a // comment is meant to avoid:
  // typing reference info without the marker is still read as "Exercise Name: sets".
  const note = `previous: 70kg x8`;
  const parsed = parseWorkoutNote(note, "kg");
  assert.equal(parsed.exercises.length, 1);
  assert.equal(parsed.exercises[0].name, "previous");
});

test("trailing // comment on a set line attaches to that set without corrupting weight/reps", () => {
  const note = `
Squat
- 100kg x 5 // prev: 95kg x5
- 102.5kg x 5 @8 // matched a PR
`;
  const parsed = parseWorkoutNote(note, "kg");
  const squat = parsed.exercises[0];
  assert.equal(squat.sets[0].weight, 100);
  assert.equal(squat.sets[0].reps, 5);
  assert.equal(squat.sets[0].notes, "prev: 95kg x5");
  assert.equal(squat.sets[1].rpe, 8);
  assert.equal(squat.sets[1].notes, "matched a PR");
});

test("a ## Notes section captures workout-level notes instead of becoming a bogus exercise", () => {
  const note = `
Bench Press
- 80kg x 8

## Notes
Slept badly, cut the session short.
`;
  const parsed = parseWorkoutNote(note, "kg");
  assert.equal(parsed.exercises.length, 1);
  assert.equal(parsed.notes, "Slept badly, cut the session short.");
});

test("formatWorkoutNote round-trips exercise and set comments through //", () => {
  const structured = {
    title: "Push Day",
    notes: "Deload week.",
    exercises: [
      {
        name: "Bench Press",
        notes: "left shoulder felt tight",
        sets: [
          { weight: 80, unit: "kg", reps: 8, notes: "prev: 75kg x8" },
        ],
      },
    ],
  };

  const formatted = formatWorkoutNote(structured);
  const reparsed = parseWorkoutNote(formatted, "kg");

  assert.equal(reparsed.exercises.length, 1);
  assert.equal(reparsed.exercises[0].name, "Bench Press");
  assert.equal(reparsed.exercises[0].notes, "left shoulder felt tight");
  assert.equal(reparsed.exercises[0].sets[0].notes, "prev: 75kg x8");
  assert.equal(reparsed.notes, "Deload week.");
});

test("calculates estimated 1RM accurately", () => {
  // 1 rep max of 100kg for 1 rep is 100kg
  assert.equal(calculate1RM(100, 1), 100);
  // 100kg for 10 reps = 100 * (1 + 10/30) = 133.3kg
  assert.equal(calculate1RM(100, 10), 133.3);
  // 80kg for 8 reps = 80 * (1 + 8/30) = 101.3kg
  assert.equal(calculate1RM(80, 8), 101.3);
});

test("formats parsed workout back to clean markdown", () => {
  const structured = {
    title: "Upper Day",
    exercises: [
      {
        name: "Barbell Bench Press",
        sets: [
          { weight: 80, unit: "kg", reps: 8 },
          { weight: 85, unit: "kg", reps: 6, rpe: 9 },
        ],
      },
      {
        name: "Pull-ups",
        sets: [
          { weight: 0, reps: 10, isBodyweight: true },
          { weight: 15, unit: "kg", reps: 5, isBodyweight: true },
        ],
      },
    ],
  };

  const md = formatWorkoutNote(structured);
  assert.match(md, /# Upper Day/);
  assert.match(md, /Barbell Bench Press/);
  assert.match(md, /- 80kg x 8/);
  assert.match(md, /- 85kg x 6 @9/);
  assert.match(md, /- BW x 10/);
  assert.match(md, /- \+15kg x 5/);
});

test("parses multi-day Obsidian journal files and generates Obsidian vault export", () => {
  const multiDayNote = `
# 2026-09-08 Push Day
Bench Press
- 80kg x 8
- 82.5kg x 8

Incline DB
- 28kg x 10

---

## 2026-09-10 · Pull Day
Pullups
- BW x 10
- +10kg x 6

Barbell Row
- 70kg x 8
`;

  const parsed = parseMultiWorkoutMarkdown(multiDayNote, "kg");
  assert.equal(parsed.length, 2);

  assert.equal(parsed[0].date, "2026-09-08");
  assert.equal(parsed[0].title, "Push Day");
  assert.equal(parsed[0].parsed.exercises.length, 2);
  assert.equal(parsed[0].parsed.exercises[0].name, "Bench Press");
  assert.equal(parsed[0].parsed.exercises[0].sets.length, 2);

  assert.equal(parsed[1].date, "2026-09-10");
  assert.equal(parsed[1].title, "Pull Day");
  assert.equal(parsed[1].parsed.exercises.length, 2);
  assert.equal(parsed[1].parsed.exercises[0].name, "Pullups");

  const exported = generateObsidianExport(
    parsed.map((p) => ({ date: p.date, title: p.title, rawNote: p.rawNote })),
  );
  assert.match(exported, /# Workout Vault Export/);
  assert.match(exported, /## 2026-09-10 · Pull Day/);
  assert.match(exported, /## 2026-09-08 · Push Day/);
});

test("calculateSessionStats calculates volume, sets, and reps correctly excluding warmups", () => {
  const note = `Bench Press
- 40kg x 10 (warmup)
- 80kg x 8
- 80kg x 6
`;
  const parsed = parseWorkoutNote(note, "kg");
  const stats = calculateSessionStats(parsed.exercises);
  assert.equal(stats.totalSets, 2); // 1 warmup excluded
  assert.equal(stats.totalReps, 14); // 8 + 6
  assert.equal(stats.totalVolume, 80 * 8 + 80 * 6); // 640 + 480 = 1120
  assert.equal(stats.exerciseCount, 1);
});



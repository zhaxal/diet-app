import test from "node:test";
import assert from "node:assert/strict";
import {
  parseWorkoutNote,
  formatWorkoutNote,
  calculate1RM,
  normalizeExerciseName,
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

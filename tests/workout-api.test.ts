import test from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { parseWorkoutNote } from "../lib/workout-parser";
import { toKg } from "../lib/units";
import { getExerciseSummary, getExerciseFullHistory } from "../lib/workout-stats";

test("workout database pipeline: creates exercises, logs sets, and computes progression stats", async () => {
  // 1. Create or get demo user
  const user = await prisma.user.upsert({
    where: { email: "test-gym@example.com" },
    update: {},
    create: {
      email: "test-gym@example.com",
      passwordHash: "dummy",
      weightUnit: "kg",
    },
  });

  // Clean up any previous test runs
  await prisma.workout.deleteMany({ where: { userId: user.id } });
  await prisma.exercise.deleteMany({ where: { userId: user.id } });

  // 2. Session 1: Last week
  const date1 = new Date("2026-09-01T12:00:00.000Z");
  const note1 = `# Push Day\n\nBench Press\n- 80kg x 8\n- 80kg x 8\n- 80kg x 7\n`;
  const parsed1 = parseWorkoutNote(note1, "kg");

  const workout1 = await prisma.workout.create({
    data: {
      userId: user.id,
      date: date1,
      title: parsed1.title,
      rawNote: note1,
      source: "ui",
    },
  });

  const exBench = await prisma.exercise.create({
    data: {
      userId: user.id,
      name: parsed1.exercises[0].name,
      normalized: parsed1.exercises[0].normalized,
    },
  });

  const we1 = await prisma.workoutExercise.create({
    data: {
      workoutId: workout1.id,
      exerciseId: exBench.id,
      order: 0,
    },
  });

  await prisma.workoutSet.createMany({
    data: parsed1.exercises[0].sets.map((s) => ({
      workoutExerciseId: we1.id,
      setNumber: s.setNumber,
      weight: toKg(s.weight, s.unit),
      unit: s.unit,
      reps: s.reps,
      isWarmup: s.isWarmup,
      isBodyweight: s.isBodyweight,
    })),
  });

  // Check stats immediately after session 1 (viewed before session 2)
  const summaryBeforeSession2 = await getExerciseSummary(user.id, exBench.id, new Date("2026-09-08T12:00:00.000Z"), "kg");
  assert.ok(summaryBeforeSession2);
  assert.equal(summaryBeforeSession2.bestWeightKg, 80);
  assert.equal(summaryBeforeSession2.lastPerformance, "80kg × 8, 8, 7");

  // 3. Session 2: Progressive overload hit 85kg!
  const date2 = new Date("2026-09-08T12:00:00.000Z");
  const note2 = `# Push Day\n\nBench Press\n- 80kg x 8\n- 82.5kg x 8\n- 85kg x 6\n`;
  const parsed2 = parseWorkoutNote(note2, "kg");

  const workout2 = await prisma.workout.create({
    data: {
      userId: user.id,
      date: date2,
      title: parsed2.title,
      rawNote: note2,
      source: "ui",
    },
  });

  const we2 = await prisma.workoutExercise.create({
    data: {
      workoutId: workout2.id,
      exerciseId: exBench.id,
      order: 0,
    },
  });

  await prisma.workoutSet.createMany({
    data: parsed2.exercises[0].sets.map((s) => ({
      workoutExerciseId: we2.id,
      setNumber: s.setNumber,
      weight: toKg(s.weight, s.unit),
      unit: s.unit,
      reps: s.reps,
      isWarmup: s.isWarmup,
      isBodyweight: s.isBodyweight,
    })),
  });

  // Check stats now (today)
  const summaryNow = await getExerciseSummary(user.id, exBench.id, new Date(), "kg");
  assert.ok(summaryNow);
  assert.equal(summaryNow.bestWeightKg, 85);
  assert.equal(summaryNow.lastPerformance, "80kg × 8, 82.5kg × 8, 85kg × 6");

  // Full progression history
  const fullHistory = await getExerciseFullHistory(user.id, exBench.id, "kg");
  assert.ok(fullHistory);
  assert.equal(fullHistory.lifetime.bestWeight, 85);
  assert.equal(fullHistory.lifetime.totalSessions, 2);
  assert.equal(fullHistory.sessions.length, 2);
  assert.equal(fullHistory.sessions[0].topWeight, 80);
  assert.equal(fullHistory.sessions[1].topWeight, 85);

  // 4. Test Workout Deletion & Cascade
  const deleteTargetWorkout = await prisma.workout.create({
    data: {
      userId: user.id,
      date: new Date("2026-09-10T12:00:00.000Z"),
      title: "To Delete",
      rawNote: "Squat\n- 100kg x 5\n",
      source: "ui",
    },
  });
  const weDelete = await prisma.workoutExercise.create({
    data: {
      workoutId: deleteTargetWorkout.id,
      exerciseId: exBench.id,
      order: 0,
    },
  });
  await prisma.workoutSet.create({
    data: {
      workoutExerciseId: weDelete.id,
      setNumber: 1,
      weight: 100,
      unit: "kg",
      reps: 5,
    },
  });

  // Verify created
  assert.equal(await prisma.workout.count({ where: { id: deleteTargetWorkout.id } }), 1);
  assert.equal(await prisma.workoutExercise.count({ where: { workoutId: deleteTargetWorkout.id } }), 1);
  assert.equal(await prisma.workoutSet.count({ where: { workoutExerciseId: weDelete.id } }), 1);

  // Delete workout
  await prisma.workout.delete({ where: { id: deleteTargetWorkout.id } });

  // Verify cascaded deletion
  assert.equal(await prisma.workout.count({ where: { id: deleteTargetWorkout.id } }), 0);
  assert.equal(await prisma.workoutExercise.count({ where: { workoutId: deleteTargetWorkout.id } }), 0);
  assert.equal(await prisma.workoutSet.count({ where: { workoutExerciseId: weDelete.id } }), 0);

  // Clean up
  await prisma.workout.deleteMany({ where: { userId: user.id } });
  await prisma.exercise.deleteMany({ where: { userId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
});

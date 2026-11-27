import test from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { parseWorkoutNote } from "../lib/workout-parser";
import { toKg } from "../lib/units";
import { getExerciseSummary, getExerciseFullHistory } from "../lib/workout-stats";
import { todayInTz } from "../lib/time";
import {
  GET as getWorkout,
  POST as saveWorkout,
  DELETE as deleteWorkout,
} from "../app/api/workouts/route";
import { POST as importWorkouts } from "../app/api/workouts/import/route";
import { GET as exportWorkouts } from "../app/api/workouts/export/route";
import { GET as getWorkoutSummary } from "../app/api/workouts/summary/route";
import { GET as listExercises } from "../app/api/exercises/route";
import { GET as getExerciseHistory } from "../app/api/exercises/[id]/history/route";
import { createUser, request, withId } from "./helpers";

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
  const note1 = `# Push Day\n\nBench Press\n- 80kg x 8\n- 80kg x 8\n- 80kg x 7 // felt heavy, cut it short\n`;
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
      notes: s.notes,
    })),
  });

  // Check stats immediately after session 1 (viewed before session 2)
  const summaryBeforeSession2 = await getExerciseSummary(user.id, exBench.id, new Date("2026-09-08T12:00:00.000Z"), "kg");
  assert.ok(summaryBeforeSession2);
  assert.equal(summaryBeforeSession2.bestWeightKg, 80);
  assert.equal(summaryBeforeSession2.lastPerformance, "80kg × 8, 8, 7");

  // The trailing // comment on the last set was parsed onto that set and
  // actually persisted, not silently dropped by workoutSet.createMany.
  const persistedSets = await prisma.workoutSet.findMany({
    where: { workoutExerciseId: we1.id },
    orderBy: { setNumber: "asc" },
  });
  assert.equal(persistedSets[0].notes, null);
  assert.equal(persistedSets[2].notes, "felt heavy, cut it short");

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

test("REST workout lifecycle: POST/GET/DELETE preserves omitted source and returns 404 on missing delete", async () => {
  const user = await createUser("workout-rest@example.com");
  const date = "2026-10-05";

  const createRes = await saveWorkout(
    request("POST", "/api/workouts", {
      token: user.token,
      body: {
        date,
        title: "MCP Session",
        rawNote: "Bench Press\n- 80kg x 5",
        source: "mcp",
      },
    }),
  );
  assert.equal(createRes.status, 200);
  const created = await createRes.json();
  assert.equal(created.workout.source, "mcp");

  // Updating without specifying source must preserve existing source ("mcp")
  const updateRes = await saveWorkout(
    request("POST", "/api/workouts", {
      token: user.token,
      body: {
        date,
        title: "MCP Session Edited",
        rawNote: "Bench Press\n- 82.5kg x 5",
      },
    }),
  );
  assert.equal(updateRes.status, 200);
  const updated = await updateRes.json();
  assert.equal(updated.workout.source, "mcp");

  const getRes = await getWorkout(
    request("GET", `/api/workouts?date=${date}`, { token: user.token }),
  );
  assert.equal(getRes.status, 200);
  const fetched = await getRes.json();
  assert.equal(fetched.workout.title, "MCP Session Edited");
  assert.ok(fetched.exerciseStats["bench press"]);

  const delRes = await deleteWorkout(
    request("DELETE", `/api/workouts?date=${date}`, { token: user.token }),
  );
  assert.equal(delRes.status, 200);

  const missingDelRes = await deleteWorkout(
    request("DELETE", `/api/workouts?date=${date}`, { token: user.token }),
  );
  assert.equal(missingDelRes.status, 404);
});

test("REST workouts import, export validation, summary clamp, and exercises endpoints", async () => {
  const user = await createUser("workout-tools@example.com");
  const today = todayInTz("UTC");

  // Invalid import payload rejected
  const badImport = await importWorkouts(
    request("POST", "/api/workouts/import", {
      token: user.token,
      body: {},
    }),
  );
  assert.equal(badImport.status, 422);

  // Dry run followed by real markdown import including assisted negative set + Arm exercise
  const md = `# ${today} Arms & Dips
Close-Grip Bench Press
- 70kg x 8

Assisted Dips
- -20kg x 10
`;
  const dryRes = await importWorkouts(
    request("POST", "/api/workouts/import", {
      token: user.token,
      body: { markdown: md, dryRun: true },
    }),
  );
  assert.equal(dryRes.status, 200);
  const dryJson = await dryRes.json();
  assert.equal(dryJson.dryRun, true);
  assert.equal(dryJson.totalWorkouts, 1);

  const impRes = await importWorkouts(
    request("POST", "/api/workouts/import", {
      token: user.token,
      body: { markdown: md },
    }),
  );
  assert.equal(impRes.status, 200);
  const impJson = await impRes.json();
  assert.equal(impJson.created, 1);

  // Summary clamps negative assisted weight so volume equals 70 * 8 = 560
  const sumRes = await getWorkoutSummary(
    request("GET", "/api/workouts/summary?days=7", { token: user.token }),
  );
  assert.equal(sumRes.status, 200);
  const { summary } = await sumRes.json();
  assert.equal(summary.totalWorkouts, 1);
  assert.equal(summary.totalVolume, 560);

  // Export date validation + valid markdown export
  const badExport = await exportWorkouts(
    request("GET", "/api/workouts/export?startDate=2026-02-30", { token: user.token }),
  );
  assert.equal(badExport.status, 422);

  const invertedExport = await exportWorkouts(
    request("GET", "/api/workouts/export?startDate=2026-10-10&endDate=2026-10-01", { token: user.token }),
  );
  assert.equal(invertedExport.status, 422);

  const okExport = await exportWorkouts(
    request("GET", "/api/workouts/export?format=markdown", { token: user.token }),
  );
  assert.equal(okExport.status, 200);
  const exportText = await okExport.text();
  assert.match(exportText, /Close-Grip Bench Press/);

  // Exercises endpoint filters muscle=Arms cleanly and links today's morning/current workout
  const exRes = await listExercises(
    request("GET", "/api/exercises?muscle=Arms", { token: user.token }),
  );
  assert.equal(exRes.status, 200);
  const { exercises } = (await exRes.json()) as {
    exercises: Array<{ id: string; name: string; muscleGroup: string }>;
  };
  const closeGrip = exercises.find((e) => e.name === "Close-Grip Bench Press");
  assert.ok(closeGrip);
  assert.equal(closeGrip.muscleGroup, "Arms");

  const histRes = await getExerciseHistory(
    request("GET", `/api/exercises/${closeGrip.id}/history`, { token: user.token }),
    withId(closeGrip.id),
  );
  assert.equal(histRes.status, 200);
  const hist = await histRes.json();
  assert.equal(hist.lifetime.bestWeight, 70);

  const unknownHist = await getExerciseHistory(
    request("GET", "/api/exercises/missing-id/history", { token: user.token }),
    withId("missing-id"),
  );
  assert.equal(unknownHist.status, 404);
});

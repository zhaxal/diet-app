export interface DefaultExercise {
  name: string;
  normalized: string;
  muscleGroup: "Chest" | "Back" | "Legs" | "Shoulders" | "Arms" | "Core";
  equipment?: "Barbell" | "Dumbbell" | "Cable" | "Machine" | "Bodyweight";
}

export const DEFAULT_EXERCISES: DefaultExercise[] = [
  // ── Chest ──────────────────────────────────────────────────────────
  { name: "Bench Press", normalized: "bench press", muscleGroup: "Chest", equipment: "Barbell" },
  { name: "Incline Bench Press", normalized: "incline bench press", muscleGroup: "Chest", equipment: "Barbell" },
  { name: "Dumbbell Bench Press", normalized: "dumbbell bench press", muscleGroup: "Chest", equipment: "Dumbbell" },
  { name: "Incline Dumbbell Press", normalized: "incline dumbbell press", muscleGroup: "Chest", equipment: "Dumbbell" },
  { name: "Decline Bench Press", normalized: "decline bench press", muscleGroup: "Chest", equipment: "Barbell" },
  { name: "Cable Flyes", normalized: "cable flyes", muscleGroup: "Chest", equipment: "Cable" },
  { name: "Incline Cable Flyes", normalized: "incline cable flyes", muscleGroup: "Chest", equipment: "Cable" },
  { name: "Chest Dips", normalized: "chest dips", muscleGroup: "Chest", equipment: "Bodyweight" },
  { name: "Push-ups", normalized: "push-ups", muscleGroup: "Chest", equipment: "Bodyweight" },
  { name: "Pec Deck Fly", normalized: "pec deck fly", muscleGroup: "Chest", equipment: "Machine" },
  { name: "Chest Press Machine", normalized: "chest press machine", muscleGroup: "Chest", equipment: "Machine" },

  // ── Back ───────────────────────────────────────────────────────────
  { name: "Pullups", normalized: "pullups", muscleGroup: "Back", equipment: "Bodyweight" },
  { name: "Chin-ups", normalized: "chin-ups", muscleGroup: "Back", equipment: "Bodyweight" },
  { name: "Barbell Row", normalized: "barbell row", muscleGroup: "Back", equipment: "Barbell" },
  { name: "Deadlift", normalized: "deadlift", muscleGroup: "Back", equipment: "Barbell" },
  { name: "Romanian Deadlift", normalized: "romanian deadlift", muscleGroup: "Back", equipment: "Barbell" },
  { name: "Lat Pulldown", normalized: "lat pulldown", muscleGroup: "Back", equipment: "Cable" },
  { name: "Seated Cable Row", normalized: "seated cable row", muscleGroup: "Back", equipment: "Cable" },
  { name: "Dumbbell Row", normalized: "dumbbell row", muscleGroup: "Back", equipment: "Dumbbell" },
  { name: "T-Bar Row", normalized: "t-bar row", muscleGroup: "Back", equipment: "Barbell" },
  { name: "Face Pulls", normalized: "face pulls", muscleGroup: "Back", equipment: "Cable" },
  { name: "Chest Supported Row", normalized: "chest supported row", muscleGroup: "Back", equipment: "Machine" },
  { name: "Straight Arm Pulldown", normalized: "straight arm pulldown", muscleGroup: "Back", equipment: "Cable" },

  // ── Legs ───────────────────────────────────────────────────────────
  { name: "Barbell Back Squat", normalized: "barbell back squat", muscleGroup: "Legs", equipment: "Barbell" },
  { name: "Front Squat", normalized: "front squat", muscleGroup: "Legs", equipment: "Barbell" },
  { name: "Leg Press", normalized: "leg press", muscleGroup: "Legs", equipment: "Machine" },
  { name: "Hack Squat", normalized: "hack squat", muscleGroup: "Legs", equipment: "Machine" },
  { name: "Bulgarian Split Squat", normalized: "bulgarian split squat", muscleGroup: "Legs", equipment: "Dumbbell" },
  { name: "Walking Lunges", normalized: "walking lunges", muscleGroup: "Legs", equipment: "Dumbbell" },
  { name: "Leg Extension", normalized: "leg extension", muscleGroup: "Legs", equipment: "Machine" },
  { name: "Lying Leg Curl", normalized: "lying leg curl", muscleGroup: "Legs", equipment: "Machine" },
  { name: "Seated Leg Curl", normalized: "seated leg curl", muscleGroup: "Legs", equipment: "Machine" },
  { name: "Standing Calf Raise", normalized: "standing calf raise", muscleGroup: "Legs", equipment: "Machine" },
  { name: "Seated Calf Raise", normalized: "seated calf raise", muscleGroup: "Legs", equipment: "Machine" },
  { name: "Hip Thrust", normalized: "hip thrust", muscleGroup: "Legs", equipment: "Barbell" },
  { name: "Goblet Squat", normalized: "goblet squat", muscleGroup: "Legs", equipment: "Dumbbell" },

  // ── Shoulders ──────────────────────────────────────────────────────
  { name: "Overhead Press (OHP)", normalized: "overhead press ohp", muscleGroup: "Shoulders", equipment: "Barbell" },
  { name: "Dumbbell Shoulder Press", normalized: "dumbbell shoulder press", muscleGroup: "Shoulders", equipment: "Dumbbell" },
  { name: "Lateral Raise", normalized: "lateral raise", muscleGroup: "Shoulders", equipment: "Dumbbell" },
  { name: "Cable Lateral Raise", normalized: "cable lateral raise", muscleGroup: "Shoulders", equipment: "Cable" },
  { name: "Rear Delt Fly", normalized: "rear delt fly", muscleGroup: "Shoulders", equipment: "Dumbbell" },
  { name: "Arnold Press", normalized: "arnold press", muscleGroup: "Shoulders", equipment: "Dumbbell" },
  { name: "Upright Row", normalized: "upright row", muscleGroup: "Shoulders", equipment: "Barbell" },
  { name: "Machine Shoulder Press", normalized: "machine shoulder press", muscleGroup: "Shoulders", equipment: "Machine" },
  { name: "Shrugs", normalized: "shrugs", muscleGroup: "Shoulders", equipment: "Dumbbell" },

  // ── Arms (Biceps & Triceps) ────────────────────────────────────────
  { name: "Tricep Pushdown", normalized: "tricep pushdown", muscleGroup: "Arms", equipment: "Cable" },
  { name: "Skull Crushers", normalized: "skull crushers", muscleGroup: "Arms", equipment: "Barbell" },
  { name: "Overhead Tricep Extension", normalized: "overhead tricep extension", muscleGroup: "Arms", equipment: "Cable" },
  { name: "Close-Grip Bench Press", normalized: "close-grip bench press", muscleGroup: "Arms", equipment: "Barbell" },
  { name: "Tricep Dips", normalized: "tricep dips", muscleGroup: "Arms", equipment: "Bodyweight" },
  { name: "Barbell Curl", normalized: "barbell curl", muscleGroup: "Arms", equipment: "Barbell" },
  { name: "Incline Dumbbell Curl", normalized: "incline dumbbell curl", muscleGroup: "Arms", equipment: "Dumbbell" },
  { name: "Hammer Curl", normalized: "hammer curl", muscleGroup: "Arms", equipment: "Dumbbell" },
  { name: "Preacher Curl", normalized: "preacher curl", muscleGroup: "Arms", equipment: "Barbell" },
  { name: "Concentration Curl", normalized: "concentration curl", muscleGroup: "Arms", equipment: "Dumbbell" },
  { name: "Cable Bicep Curl", normalized: "cable bicep curl", muscleGroup: "Arms", equipment: "Cable" },

  // ── Core ───────────────────────────────────────────────────────────
  { name: "Hanging Leg Raise", normalized: "hanging leg raise", muscleGroup: "Core", equipment: "Bodyweight" },
  { name: "Cable Crunch", normalized: "cable crunch", muscleGroup: "Core", equipment: "Cable" },
  { name: "Ab Wheel Rollout", normalized: "ab wheel rollout", muscleGroup: "Core", equipment: "Bodyweight" },
  { name: "Plank", normalized: "plank", muscleGroup: "Core", equipment: "Bodyweight" },
  { name: "Russian Twists", normalized: "russian twists", muscleGroup: "Core", equipment: "Bodyweight" },
  { name: "Decline Sit-up", normalized: "decline sit-up", muscleGroup: "Core", equipment: "Bodyweight" },
];

export const MUSCLE_GROUPS = ["All", "Chest", "Back", "Legs", "Shoulders", "Arms", "Core"] as const;
export type MuscleGroupFilter = typeof MUSCLE_GROUPS[number];

/** Find muscle group for any exercise name */
export function lookupMuscleGroup(exerciseName: string): string | undefined {
  const norm = exerciseName.toLowerCase().replace(/[^a-z0-9]/g, "");
  const found = DEFAULT_EXERCISES.find(
    (e) => e.normalized.replace(/[^a-z0-9]/g, "") === norm || norm.includes(e.normalized.replace(/[^a-z0-9]/g, "")),
  );
  return found?.muscleGroup;
}

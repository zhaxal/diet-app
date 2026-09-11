export interface WorkoutTemplate {
  id: string;
  name: string;
  subtitle: string;
  rawNote: (unit: string) => string;
}

export const WORKOUT_TEMPLATES: WorkoutTemplate[] = [
  {
    id: "push",
    name: "Push Day",
    subtitle: "Chest, Delts, Triceps",
    rawNote: (unit) => `# Push Day

Bench Press
- 80${unit} x 8
- 80${unit} x 8
- 80${unit} x 7

Incline Dumbbell Press
- 28${unit} x 10
- 28${unit} x 10
- 28${unit} x 9

Dumbbell Lateral Raise
- 12${unit} x 12
- 12${unit} x 12
- 12${unit} x 12

Tricep Pushdown
- 30${unit} x 12
- 30${unit} x 12
- 30${unit} x 10
`,
  },
  {
    id: "pull",
    name: "Pull Day",
    subtitle: "Back, Biceps, Rear Delts",
    rawNote: (unit) => `# Pull Day

Barbell Row
- 70${unit} x 8
- 70${unit} x 8
- 70${unit} x 8

Lat Pulldown
- 65${unit} x 10
- 65${unit} x 10
- 65${unit} x 9

Seated Cable Row
- 60${unit} x 12
- 60${unit} x 12

Face Pull
- 25${unit} x 15
- 25${unit} x 15

Bicep Curl
- 16${unit} x 10
- 16${unit} x 10
`,
  },
  {
    id: "legs",
    name: "Leg Day",
    subtitle: "Quads, Hamstrings, Calves",
    rawNote: (unit) => `# Leg Day

Barbell Squat
- 100${unit} x 6
- 100${unit} x 6
- 100${unit} x 6

Romanian Deadlift
- 90${unit} x 8
- 90${unit} x 8

Leg Press
- 160${unit} x 10
- 160${unit} x 10

Standing Calf Raise
- 60${unit} x 15
- 60${unit} x 15
`,
  },
  {
    id: "upper",
    name: "Upper Body",
    subtitle: "Press, Row, Pull-up, Arms",
    rawNote: (unit) => `# Upper Body

Bench Press
- 80${unit} x 8
- 80${unit} x 8

Barbell Row
- 70${unit} x 8
- 70${unit} x 8

Overhead Press
- 50${unit} x 8
- 50${unit} x 8

Pull-ups
- BW x 8
- BW x 8

Dumbbell Bicep Curl
- 16${unit} x 10
- 16${unit} x 10
`,
  },
  {
    id: "lower",
    name: "Lower Body",
    subtitle: "Squat, Hinge, Single Leg",
    rawNote: (unit) => `# Lower Body

Barbell Squat
- 100${unit} x 6
- 100${unit} x 6

Romanian Deadlift
- 90${unit} x 8
- 90${unit} x 8

Bulgarian Split Squat
- 20${unit} x 10
- 20${unit} x 10

Standing Calf Raise
- 50${unit} x 15
- 50${unit} x 15
`,
  },
  {
    id: "full",
    name: "Full Body",
    subtitle: "Compound Essentials",
    rawNote: (unit) => `# Full Body

Barbell Squat
- 90${unit} x 8
- 90${unit} x 8

Bench Press
- 75${unit} x 8
- 75${unit} x 8

Barbell Row
- 65${unit} x 8
- 65${unit} x 8

Overhead Press
- 45${unit} x 10
- 45${unit} x 10
`,
  },
];

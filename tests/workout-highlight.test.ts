import test from "node:test";
import assert from "node:assert/strict";
import { highlightWorkoutNote, type NoteToken } from "../lib/workout-highlight";

/** The token types covering a piece of text, in order of appearance. */
function typesOf(tokens: NoteToken[]): string[] {
  return tokens.map((t) => t.type);
}

function typeOf(tokens: NoteToken[], text: string): string | undefined {
  return tokens.find((t) => t.text === text)?.type;
}

function textOf(tokens: NoteToken[]): string {
  return tokens.map((t) => t.text).join("");
}

test("reassembles every line character for character", () => {
  const note = `# Push Day

Bench Press
- 80kg x 8
-  85kg  x  6 (warmup) @8.5   // felt heavy
    indented prose

Pull Ups: BW x 10, 8, 7

## Notes
Slept badly. // not a comment line, notes take the whole line
`;

  const lines = highlightWorkoutNote(note, "kg");
  assert.equal(lines.length, note.split("\n").length);
  assert.equal(lines.map(textOf).join("\n"), note);
});

test("marks the first h1 as the title and later headings as exercises", () => {
  const [title, , heading] = highlightWorkoutNote("# Push Day\n\n## Incline Bench", "kg");

  assert.equal(typeOf(title, "# "), "marker");
  assert.equal(typeOf(title, "Push Day"), "heading");
  assert.equal(typeOf(heading, "## "), "marker");
  assert.equal(typeOf(heading, "Incline Bench"), "exercise");
});

test("reads a Title: property as the title", () => {
  const [line] = highlightWorkoutNote("Title: Leg Day", "kg");
  assert.equal(typeOf(line, "Title:"), "marker");
  assert.equal(typeOf(line, " Leg Day"), "heading");
});

test("separates the load, its unit, the separator and the reps", () => {
  const [, set] = highlightWorkoutNote("Bench Press\n- 80kg x 8", "kg");

  assert.deepEqual(typesOf(set), ["marker", "weight", "unit", "text", "marker", "text", "reps"]);
  assert.equal(typeOf(set, "80"), "weight");
  assert.equal(typeOf(set, "kg"), "unit");
  assert.equal(typeOf(set, "8"), "reps");
});

test("reads a bare figure after a comma as reps, not as a load", () => {
  const [, set] = highlightWorkoutNote("Squat\n- 30kg x 12, 12, 10", "kg");

  const figures = set.filter((t) => t.type === "weight" || t.type === "reps");
  assert.deepEqual(
    figures.map((t) => [t.text, t.type]),
    [
      ["30", "weight"],
      ["12", "reps"],
      ["12", "reps"],
      ["10", "reps"],
    ],
  );
  assert.equal(set.filter((t) => t.text === ",").every((t) => t.type === "marker"), true);
});

test("colours bodyweight, assisted and weighted loads as loads", () => {
  const [, bw, weighted, assisted] = highlightWorkoutNote(
    "Pull Ups\n- BW x 10\n- +15kg x 6\n- -20kg x 8",
    "kg",
  );

  assert.equal(typeOf(bw, "BW"), "weight");
  assert.equal(typeOf(weighted, "+15"), "weight");
  assert.equal(typeOf(assisted, "-20"), "weight");
  assert.equal(typeOf(weighted, "6"), "reps");
});

test("colours RPE and a warmup tag as annotations", () => {
  const [, set] = highlightWorkoutNote("Deadlift\n- 100kg x 5 (warmup) @8.5", "kg");

  assert.equal(typeOf(set, "(warmup)"), "tag");
  assert.equal(typeOf(set, "@8.5"), "rpe");
});

test("a trailing comment is a comment, never a set", () => {
  const [, set] = highlightWorkoutNote("Bench Press\n- 80kg x 8 // prev: 70kg x8", "kg");

  assert.equal(typeOf(set, "// prev: 70kg x8"), "comment");
  // The figures inside the comment stay inside it.
  assert.equal(set.filter((t) => t.type === "weight").length, 1);
});

test("splits the inline colon form into a name and its sets", () => {
  const [line] = highlightWorkoutNote("Bench Press: 80kg x 8, 85kg x 6", "kg");

  assert.equal(typeOf(line, "Bench Press"), "exercise");
  assert.equal(typeOf(line, ":"), "marker");
  assert.equal(typeOf(line, "85"), "weight");
  assert.equal(line.filter((t) => t.type === "reps").length, 2);
});

test("a bullet under an exercise is prose, and above one is a name", () => {
  const [, note] = highlightWorkoutNote("Bench Press\n- left elbow sore", "kg");
  assert.equal(typeOf(note, "left elbow sore"), "note");

  const [orphan] = highlightWorkoutNote("- left elbow sore", "kg");
  assert.equal(typeOf(orphan, "left elbow sore"), "exercise");
});

test("everything below a Notes heading is note prose", () => {
  const lines = highlightWorkoutNote("Bench Press\n- 80kg x 8\n## Notes\n80kg x 8 felt fine", "kg");
  const [, , heading, body] = lines;

  assert.equal(typeOf(heading, "Notes"), "heading");
  assert.deepEqual(typesOf(body), ["note"]);
});

test("keeps indentation out of the coloured tokens", () => {
  const [, set] = highlightWorkoutNote("Bench Press\n    - 80kg x 8", "kg");

  assert.equal(set[0].text, "    ");
  assert.equal(set[0].type, "text");
  assert.equal(set[1].text, "- ");
  assert.equal(set[1].type, "marker");
});

test("leaves a half-typed line intact", () => {
  const lines = highlightWorkoutNote("Bench Press\n- 80kg x", "kg");
  assert.equal(textOf(lines[1]), "- 80kg x");
});

test("reads lb notes in lb", () => {
  const [, set] = highlightWorkoutNote("Bench Press\n- 185lbs x 5", "lb");
  assert.equal(typeOf(set, "185"), "weight");
  assert.equal(typeOf(set, "lbs"), "unit");
  assert.equal(typeOf(set, "5"), "reps");
});

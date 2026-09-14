import { isNotesHeading, isSetLine } from "./workout-parser";
import type { WeightUnit } from "./units";

/**
 * Token kinds the workout note editor paints. They are roles in the note, not
 * colours: the stylesheet decides that a weight is ink and a unit is faint, and
 * the two-value colour rule keeps both honest in either theme.
 */
export type NoteTokenType =
  | "heading" // the note title, or a "## Notes" section heading
  | "exercise" // a line that names an exercise
  | "weight" // the load: 80, +15, -20, BW
  | "unit" // kg / lb / "reps" — the annotation on a figure
  | "reps" // the rep count
  | "marker" // bullets, # glyphs, the x separator, commas, a name's colon
  | "rpe" // @8.5, RPE 8
  | "tag" // (warmup)
  | "comment" // // felt heavy today
  | "note" // prose the parser keeps as a note rather than data
  | "text"; // whitespace and anything unclassified

export interface NoteToken {
  text: string;
  type: NoteTokenType;
}

/**
 * Scans the inside of one set: "+15kg x 6 (warmup) @8.5". Whatever it does not
 * recognise stays `text`, so a half-typed line is never mangled — the caller
 * reassembles the line from these tokens verbatim.
 */
const SET_SCANNER = new RegExp(
  [
    "(?<tag>\\((?:w|warm-?up)\\)|\\bwarm-?up\\b)",
    "(?<rpe>(?:@|\\brpe\\s*:?\\s*)\\d+(?:\\.\\d+)?)",
    "(?<bw>\\bbody\\s*weight\\b|\\b(?:bw|bodyweight)\\b)",
    "(?<num>[+-]?\\d+(?:\\.\\d+)?)(?<unit>\\s*(?:kgs?|lbs?))?",
    "(?<sep>[xX*×])",
    "(?<repword>\\breps?\\b)",
  ].join("|"),
  "gi",
);

/** A bullet, or an ordered-list marker, exactly as the parser strips it. */
const BULLET_PREFIX = /^(?:[-*•]|\d+[.)])\s+/;
const HEADING_PREFIX = /^#{1,4}\s+/;
const TITLE_PROPERTY = /^(?:workout|title)\s*:\s*\S/i;

class TokenLine {
  readonly tokens: NoteToken[] = [];

  push(text: string, type: NoteTokenType): void {
    if (!text) return;
    const last = this.tokens[this.tokens.length - 1];
    if (last && last.type === type) {
      last.text += text;
      return;
    }
    this.tokens.push({ text, type });
  }
}

/**
 * One comma-separated segment: "80kg x 8", "8", "BW x 12 @9".
 *
 * Which side of the `x` a figure sits on is what makes it a load or a rep
 * count — "80kg x 8" and "8" carry the same digit in different roles. A
 * segment with no separator at all is a bare rep continuation ("30kg x 12, 12,
 * 10"), unless the figure names its own unit.
 */
function tokenizeSetSegment(segment: string, line: TokenLine): void {
  const separatorIndex = segment.search(/[xX*×]/);
  let cursor = 0;

  for (const match of segment.matchAll(SET_SCANNER)) {
    const index = match.index ?? 0;
    if (index > cursor) line.push(segment.slice(cursor, index), "text");
    const groups = match.groups ?? {};

    if (groups.num !== undefined) {
      const isReps =
        separatorIndex === -1 ? !groups.unit : index > separatorIndex;
      line.push(groups.num, isReps ? "reps" : "weight");
      if (groups.unit) line.push(groups.unit, "unit");
    } else if (groups.bw !== undefined) {
      line.push(match[0], "weight");
    } else if (groups.sep !== undefined) {
      line.push(match[0], "marker");
    } else if (groups.rpe !== undefined) {
      line.push(match[0], "rpe");
    } else if (groups.tag !== undefined) {
      line.push(match[0], "tag");
    } else if (groups.repword !== undefined) {
      line.push(match[0], "unit");
    } else {
      line.push(match[0], "text");
    }

    cursor = index + match[0].length;
  }

  if (cursor < segment.length) line.push(segment.slice(cursor), "text");
}

/** "80kg x 8, 8, 7" — each segment scanned on its own, commas kept as markers. */
function tokenizeSets(body: string, line: TokenLine): void {
  const segments = body.split(",");
  segments.forEach((segment, index) => {
    if (index > 0) line.push(",", "marker");
    tokenizeSetSegment(segment, line);
  });
}

/**
 * Paints one line of note body — everything after any heading glyph and before
 * any trailing comment. `hasExercise` mirrors the parser's open-exercise state,
 * which is what decides whether a bullet of prose is a note on the exercise
 * above it or the start of a new one.
 */
function tokenizeBody(
  body: string,
  line: TokenLine,
  unit: WeightUnit,
  hasExercise: boolean,
): { startsExercise: boolean } {
  const trimmed = body.trim();
  if (!trimmed) {
    line.push(body, "text");
    return { startsExercise: false };
  }

  const bullet = body.match(BULLET_PREFIX);

  // "Bench Press: 80kg x 8, 85kg x 6" — a name and its sets on one line. The
  // parser tests this before it tests the line as a set, and so must this: the
  // set patterns are unanchored, so "Bench Press: 80kg x 8" matches both.
  const colonIndex = body.indexOf(":");
  // The parser rules out a dash or star line here, and only those two.
  const ruledOutOfColonForm = body.startsWith("-") || body.startsWith("*");
  if (!ruledOutOfColonForm && colonIndex > 0 && isSetLine(body.slice(colonIndex + 1), unit)) {
    line.push(body.slice(0, colonIndex), "exercise");
    line.push(":", "marker");
    tokenizeSets(body.slice(colonIndex + 1), line);
    return { startsExercise: true };
  }

  if (isSetLine(body, unit)) {
    if (bullet) line.push(bullet[0], "marker");
    tokenizeSets(bullet ? body.slice(bullet[0].length) : body, line);
    return { startsExercise: false };
  }

  if (bullet) {
    line.push(bullet[0], "marker");
    // A bullet that is not a set is prose — an observation on the exercise
    // above it. With no exercise open the parser has nowhere to hang it and
    // makes it an exercise instead, and the colour says so rather than
    // pretending the line is a note.
    line.push(body.slice(bullet[0].length), hasExercise ? "note" : "exercise");
    return { startsExercise: !hasExercise };
  }

  line.push(body, "exercise");
  return { startsExercise: true };
}

/**
 * Tokenises a raw workout note for display, line by line.
 *
 * The tokens of a line always reassemble to that line character for character,
 * including its whitespace — the editor paints them underneath a transparent
 * textarea, so a single added or dropped character would shift every glyph
 * after it out of register with the text the user is typing.
 */
export function highlightWorkoutNote(
  rawNote: string,
  defaultUnit: WeightUnit = "kg",
): NoteToken[][] {
  const lines = rawNote.split("\n");
  const painted: NoteToken[][] = [];

  let titleFound = false;
  let inNotesSection = false;
  let hasExercise = false;

  for (const raw of lines) {
    const line = new TokenLine();
    painted.push(line.tokens);

    // Everything below a "## Notes" heading is workout-level prose, to the end
    // of the note.
    if (inNotesSection) {
      line.push(raw, "note");
      continue;
    }
    if (isNotesHeading(raw)) {
      inNotesSection = true;
      const marker = raw.match(/^\s*#{0,4}\s*/)?.[0] ?? "";
      line.push(marker, "marker");
      line.push(raw.slice(marker.length), "heading");
      continue;
    }

    // A comment runs from the first "//" to the end of the line and is never
    // anything else — "// prev: 70kg x8" must not read as a set.
    const commentIndex = raw.indexOf("//");
    const head = commentIndex === -1 ? raw : raw.slice(0, commentIndex);
    const comment = commentIndex === -1 ? "" : raw.slice(commentIndex);

    const indent = head.match(/^\s*/)?.[0] ?? "";
    let body = head.slice(indent.length);
    line.push(indent, "text");

    const headingPrefix = body.match(HEADING_PREFIX);
    if (headingPrefix) {
      line.push(headingPrefix[0], "marker");
      body = body.slice(headingPrefix[0].length);

      // The first "# " line is the note's title; deeper or later headings are
      // just another way to write an exercise name.
      if (!titleFound && headingPrefix[0].trimEnd() === "#") {
        titleFound = true;
        line.push(body, "heading");
        line.push(comment, "comment");
        continue;
      }
    } else if (!titleFound && TITLE_PROPERTY.test(body)) {
      const colonIndex = body.indexOf(":");
      titleFound = true;
      line.push(body.slice(0, colonIndex + 1), "marker");
      line.push(body.slice(colonIndex + 1), "heading");
      line.push(comment, "comment");
      continue;
    }

    const { startsExercise } = tokenizeBody(body, line, defaultUnit, hasExercise);
    if (startsExercise) hasExercise = true;
    line.push(comment, "comment");
  }

  return painted;
}

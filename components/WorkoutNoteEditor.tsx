"use client";

import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { highlightWorkoutNote } from "@/lib/workout-highlight";
import type { WeightUnit } from "@/lib/units";

interface WorkoutNoteEditorProps {
  value: string;
  onChange: (next: string) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  weightUnit: WeightUnit;
  placeholder?: string;
  rows?: number;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}

/**
 * The workout note, painted.
 *
 * The note is plain text and stays plain text: this is a real `<textarea>`
 * with the caret, selection, undo stack, autocorrect and every platform
 * keyboard behaviour the browser gives it. Only its glyphs are transparent —
 * the coloured copy is a `<pre>` directly underneath, re-tokenised on each
 * keystroke and scrolled in lockstep. Nothing here can change what is typed,
 * which is the point: the note round-trips to Obsidian byte for byte.
 *
 * The two layers must agree on every metric that decides where a glyph lands —
 * font, size, line height, padding, border width, wrapping and the scrollbar
 * gutter — so those are declared once, together, in `.note-editor__*` in
 * app/globals.css rather than per layer here.
 */
export default function WorkoutNoteEditor({
  value,
  onChange,
  onKeyDown,
  weightUnit,
  placeholder,
  rows = 12,
  textareaRef,
}: WorkoutNoteEditorProps) {
  const highlightRef = useRef<HTMLPreElement | null>(null);

  const lines = useMemo(
    () => highlightWorkoutNote(value, weightUnit),
    [value, weightUnit],
  );

  const syncScroll = useCallback(() => {
    const input = textareaRef.current;
    const highlight = highlightRef.current;
    if (!input || !highlight) return;
    highlight.scrollTop = input.scrollTop;
    highlight.scrollLeft = input.scrollLeft;
  }, [textareaRef]);

  // Typing at the bottom edge scrolls the textarea without always firing a
  // scroll event, so the layers are re-aligned on every value change too.
  useLayoutEffect(syncScroll, [value, syncScroll]);

  return (
    <div className="note-editor relative flex-1 mt-1">
      <pre className="note-editor__highlight" aria-hidden="true" ref={highlightRef}>
        {lines.map((tokens, lineIndex) => (
          <span key={lineIndex}>
            {tokens.map((token, tokenIndex) => (
              <span key={tokenIndex} className={`syn-${token.type}`}>
                {token.text}
              </span>
            ))}
            {"\n"}
          </span>
        ))}
        {/* A <pre> drops its last newline, so the trailing blank line of the
            note would collapse and every wrapped line below the fold would sit
            one row high of the text it belongs to. */}
        {"\n"}
      </pre>
      <textarea
        ref={textareaRef}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onScroll={syncScroll}
        placeholder={placeholder}
        spellCheck={false}
        aria-label="Workout note markdown"
        className="note-editor__input w-full h-full resize-y"
      />
    </div>
  );
}

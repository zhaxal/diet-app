---
target: components/WorkoutCard.tsx
total_score: 18
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 5
target_identity: "file:/Users/zhakhangiranuarbek/Documents/Projects/diet-app/components/WorkoutCard.tsx"
target_fingerprint: "sha256:d716d7f490b666b7a49e9e87e9fc643c8ce90835619f38c3601379a9b2e1505d"
target_path: /Users/zhakhangiranuarbek/Documents/Projects/diet-app/components/WorkoutCard.tsx
timestamp: 2026-09-11T13-19-03Z
slug: components-workoutcard-tsx
---
Method: dual-agent (A: 208551df-3adf-413f-8560-409679e88b89 · B: 2dba0747-b603-44fa-9374-efe539592ce9)

### Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2/4 | Save status is shown, but completed checkmarks and rest timer state vanish on tab switch or reload. |
| 2 | Match System / Real World | 2/4 | Checking off a set does not automatically start or suggest the rest timer; toast notification blocks view. |
| 3 | User Control and Freedom | 1/4 | History modal lacks Esc dismiss, click-outside, or focus trap. Cards mode has no inline editing. |
| 4 | Consistency and Standards | 1/4 | Hardcoded colors (`amber-500`, `text-white`), forbidden drop shadows (`shadow-lg`, `shadow-2xl`), active day cell styling diverges from Today. |
| 5 | Error Prevention | 2/4 | Draft saves to localStorage, but "Sample Template" can overwrite text without undo; formatting runs without diff preview. |
| 6 | Recognition Rather Than Recall | 3/4 | Contextual "Last time" ghost performance chips excel, but history progression chart lacks dates and baseline ticks. |
| 7 | Flexibility and Efficiency | 2/4 | Excellent markdown speed on desktop, but mobile lacks Enter list bullet continuation and touch targets are sub-24px. |
| 8 | Aesthetic and Minimalist Design | 1/4 | Violates Creative North Star ("reports, does not celebrate") with trophy icons; illegal box shadows break flat terminal aesthetic. |
| 9 | Error Recovery | 2/4 | Parser tolerates unparsed lines, but provides no subtle inline linting when a set syntax is slightly mistyped. |
| 10 | Help and Documentation | 2/4 | Placeholder vanishes on typing; no persistent syntax hints for advanced tokens (`@RPE`, `(w)`, `BW + 15kg`). |
| **Total** | | **18/40** | **Poor (Major overhaul required for design system compliance and mobile ergonomics)** |

---

### Design Specificity Verdict

**LLM Assessment**: The core concept is deeply tailored to this self-hosted, personal ecosystem — specifically bridging Obsidian markdown note-taking with local-first, offline-capable SQLite storage and native Web Audio oscillators. However, the visual presentation suffered from severe design system drift, borrowing generic mobile fitness app tropes (trophy icons, heavy drop shadows, rounded pill badges, colored backgrounds) directly at odds with the app's established "Terminal Readout / Instrument Panel" identity.

**Deterministic Scan**: The automated detector uncovered **28 concrete issues** across 4 modified files (`WorkoutCard.tsx`, `RestTimer.tsx`, `ExerciseHistoryModal.tsx`, `app/page.tsx`):
- 6 hardcoded colors (`text-white`, `text-amber-500`, `bg-black/60`)
- 2 illegal box shadows (`shadow-lg`, `shadow-2xl` violating the Float-Only rule)
- 6 sub-44px touch targets (notably `h-5 w-5` on primary set completion buttons)
- 6 measurement rule violations (ad-hoc `font-mono` on prose strings like `"saved"` and `"draft"`)
- 3 signal & number rule violations (amber used on numbers and background toggles)
- 2 design system divergences (Workout week strip active cell uses `bg-panel-2` instead of `bg-ink text-panel`)
- 6 accessibility failures (missing dialog semantics, lack of focus traps, missing form labels)
`components/BottomNav.tsx` was completely clean and adhered to all design tokens.

---

### Overall Impression
The feature provides powerful, resilient functionality (the parser, stats engine, and MCP surface are rock-solid), but the UI layer feels like an imported foreign component rather than a native part of Diet Tracker's instrument panel. A focused refactor will bring it to full system compliance while vastly improving one-handed mobile gym ergonomics.

---

### What's Working
1. **Obsidian-Compatible Plain Text Engine**: The note parser in `lib/workout-parser.ts` is resilient, zero-dependency, and preserves user notes byte-for-byte.
2. **Contextual "Last Time" Badges**: Live extraction of exercise stats right above the editor (`Last: 80kg × 8, 8, 7`) eliminates searching through old logs.
3. **Zero-CDN Native Audio & Haptics**: Synth chimes and vibration without external audio files preserve the single-container deployment guarantee.

---

### Priority Issues (P0–P3)

#### [P0] Ephemeral Set State & Missing Rest Timer Automation
- **Why it matters**: Lifters in the gym rely on checked sets to know their progress. Wiping checks on tab switch causes disorientation; having to manually find and start the rest timer adds high friction.
- **Fix**: Persist set completion state in `localStorage` keyed by date; automatically trigger or prompt the rest timer when a set is checked; remove the distracting toast alert.
- **Suggested command**: `/impeccable harden`

#### [P0] Accessibility & Keyboard Trap in ExerciseHistoryModal
- **Why it matters**: The modal lacks `role="dialog"`, `aria-modal="true"`, focus trapping, click-outside dismissal, and `Escape` key handling, trapping keyboard and screen-reader users.
- **Fix**: Add dialog semantics, outside click listener, and `Escape` key handler.
- **Suggested command**: `/impeccable harden`

#### [P1] Touch Target Floor Violation (44×44px)
- **Why it matters**: Set checkmark buttons are `20×20px` (`h-5 w-5`) and timer preset chips are tiny, making them nearly impossible to tap with sweaty thumbs between sets.
- **Fix**: Enforce 44×44px minimum touch targets using `.glyph-btn` or padded bounding boxes.
- **Suggested command**: `/impeccable adapt`

#### [P1] Design System Token & Rule Compliance
- **Why it matters**: Mode toggle uses `bg-accent text-white`, modal uses `shadow-2xl`, dropdown uses `shadow-lg`, and container uses `rounded-md`. This directly breaches the Float-Only Rule (toasts only), Shape Rules (max 4px), and One Signal Rule.
- **Fix**: Replace shadows with 1px `var(--line)` borders, active toggle with `bg-ink text-panel`, and containers with `.panel`.
- **Suggested command**: `/impeccable distill`

#### [P1] Week Strip Parity & Workout Date Navigation
- **Why it matters**: The Workout week strip active cell diverges from Today (`bg-panel-2` vs `bg-ink text-panel`), lacks dividing borders, and has no date picker for navigating past weeks.
- **Fix**: Harmonize the week strip to use identical tokens as Today and include a date input / "Today" shortcut.
- **Suggested command**: `/impeccable layout`

#### [P2] Eliminate Gamification Icons
- **Why it matters**: Trophy icons (`<Trophy>`) in `amber-500` violate the Creative North Star ("an app that reports, does not celebrate or congratulate").
- **Fix**: Replace trophies with tabular monospace `PR` labels.
- **Suggested command**: `/impeccable distill`

#### [P2] Smart Markdown List Continuation
- **Why it matters**: Pressing `Enter` on mobile forces manual typing of `- ` for every set.
- **Fix**: Intercept `Enter` in `onKeyDown` to auto-continue list bullets.
- **Suggested command**: `/impeccable polish`

---

### Persona Red Flags
- **Casey (Distracted Mobile Lifter)**: Misses the 20px set check button with sweaty thumb. Switches to Today tab to check water; returns to find the Rest Timer was canceled.
- **Alex (Power User)**: Annoyed that pressing Enter doesn't continue the `- ` bullet list. Trapped in `ExerciseHistoryModal` because pressing `Escape` doesn't close it.
- **Sam (Accessibility)**: Screen reader does not announce `ExerciseHistoryModal` as a dialog; workout title input lacks an accessible label.

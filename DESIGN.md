---
name: Diet Tracker
description: A terminal readout for the day you ate — hairline panels, tabular numerals, one amber signal.
colors:
  bg: "#eceef1"
  panel: "#ffffff"
  panel-2: "#f6f7f9"
  line: "#d5dae1"
  line-soft: "#e7eaef"
  ink: "#11151b"
  ink-dim: "#58616f"
  ink-faint: "#636c7a"
  accent: "#b45309"
  ok: "#15803d"
  warn: "#b45309"
  over: "#b91c1c"
typography:
  display:
    fontFamily: "ui-monospace, SFMono-Regular, SF Mono, Menlo, Cascadia Mono, Segoe UI Mono, Consolas, Liberation Mono, monospace"
    fontSize: "2.25rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.01em"
    fontFeature: "tnum 1"
  headline:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: "1.25rem"
    letterSpacing: "0.1em"
  title:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    lineHeight: "0.875rem"
    letterSpacing: "0.05em"
  body:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.25rem"
    letterSpacing: "normal"
  label:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 400
    lineHeight: "0.875rem"
    letterSpacing: "0.05em"
  data:
    fontFamily: "ui-monospace, SFMono-Regular, SF Mono, Menlo, Cascadia Mono, Segoe UI Mono, Consolas, Liberation Mono, monospace"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: "1.25rem"
    letterSpacing: "-0.01em"
    fontFeature: "tnum 1"
  field-touch:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "1.5rem"
    letterSpacing: "normal"
rounded:
  sm: "2px"
  base: "4px"
  md: "5px"
  lg: "6px"
spacing:
  hair: "4px"
  tight: "6px"
  base: "8px"
  panel: "12px"
  nav-clear: "96px"
components:
  panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.base}"
    padding: "{spacing.panel}"
  panel-header:
    backgroundColor: "{colors.panel-2}"
    textColor: "{colors.ink-dim}"
    typography: "{typography.title}"
    padding: "6px 12px"
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.panel}"
    typography: "{typography.title}"
    rounded: "{rounded.base}"
    padding: "6px 12px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-dim}"
    typography: "{typography.title}"
    rounded: "{rounded.base}"
    padding: "6px 12px"
  button-ghost-hover:
    textColor: "{colors.ink}"
  field:
    backgroundColor: "{colors.panel-2}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.base}"
    padding: "6px 8px"
  meter-track:
    backgroundColor: "{colors.line-soft}"
    rounded: "{rounded.sm}"
    height: "4px"
  meter-fill:
    backgroundColor: "{colors.accent}"
    height: "4px"
  meter-fill-over:
    backgroundColor: "{colors.over}"
    height: "4px"
  day-cell:
    backgroundColor: "transparent"
    textColor: "{colors.ink-dim}"
    padding: "6px 0"
  day-cell-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.panel}"
    padding: "6px 0"
  chip-recent:
    backgroundColor: "{colors.panel-2}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.base}"
    padding: "4px 10px"
  chip-favorite:
    backgroundColor: "{colors.panel-2}"
    textColor: "{colors.accent}"
    typography: "{typography.body}"
    rounded: "{rounded.base}"
    padding: "4px 10px"
  nav-item:
    textColor: "{colors.ink-faint}"
    typography: "{typography.label}"
  nav-item-active:
    textColor: "{colors.accent}"
    typography: "{typography.label}"
  toast-success:
    backgroundColor: "{colors.accent}"
    textColor: "#ffffff"
    rounded: "{rounded.base}"
    padding: "10px 16px"
  toast-error:
    backgroundColor: "{colors.over}"
    textColor: "#ffffff"
    rounded: "{rounded.base}"
    padding: "10px 16px"
  toast-info:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.panel}"
    rounded: "{rounded.base}"
    padding: "10px 16px"
---

# Design System: Diet Tracker

## Overview

**Creative North Star: "The Terminal Readout"**

This is an app that reports. It does not congratulate, encourage, or celebrate. A day of
eating is a set of measured quantities against a set of targets, and the interface's whole
job is to put those quantities in front of a competent daily user as fast and as densely as
a phone screen allows. Everything reads on a grid: hairline-divided cells, right-aligned
figures in tabular monospace, uppercase labels at the smallest legible size, and a
near-monochrome field carrying exactly one signal colour. Density is the virtue. Whitespace
is not added to seem friendly.

The palette is a full light/dark pair defined wholesale in `app/globals.css` — every token
has two values and nothing is theme-conditional beyond those definitions. Dark is the app's
home ground (it is the PWA's declared `theme_color`), and light is the same instrument under
daylight rather than a different design. Surfaces are flat: separation comes from a 1px rule
and a half-step of tonal shift, never from a shadow. Corners are barely rounded — 4px is the
house radius, enough to avoid looking broken, too little to read as soft.

The single amber accent is a **signal, not warmth**. It marks progress inside a goal and the
few pieces of text that act on something. It is not there to make the app feel friendly, and
it must never be spent on decoration; when a number goes over its target the fill turns red
and the amber's absence is the message. The system is deliberately unfashionable — no
gradients, no glass, no glow, no illustration — because it is meant to look the same in five
years as it does today.

**Key Characteristics:**
- Monospace tabular numerals for every measured quantity; system sans for everything else
- 1px hairline borders and tonal panel layering as the only separation devices
- One amber signal colour, with green and red reserved strictly for goal state
- 11px uppercase 0.05em labels as the universal annotation voice
- Flat by default; shadow permitted only on elements that overlay the page
- A 672px maximum column, tuned for one-handed portrait use with a fixed bottom nav

## Colors

A near-monochrome field of cool greys carrying a single amber signal, with green and red held
in reserve for goal state alone. Every token is defined for light and overridden wholesale for
dark in `app/globals.css`; the frontmatter records the light value as canonical, and the dark
counterpart lives in `.impeccable/design.json`.

### Primary
- **Signal Amber** (`--accent`): The system's only accent. It fills a progress bar while the
  value is still inside its goal, marks the active tab in the bottom nav, and colours the
  handful of inline text actions that create something (`★ favorite`, `⬚ product`,
  `API docs ↗`). It is also the focus border on every input. Nothing else may use it. Burnt
  amber in light, lifted to a brighter amber in dark so it holds against the near-black field.

### Secondary
- **Goal Green** (`--ok`): Used in exactly one place — the "left" figure on the calorie
  readout, meaning you are still under target. It is a state report, not a reward.
- **Over Red** (`--over`): The counterpart. Turns the calorie figure and any meter fill red
  once its goal is exceeded, and colours destructive affordances on hover (delete, remove
  favourite, regenerate key). Red always means either "past the target" or "this destroys
  something".

### Neutral
- **Field Grey** (`--bg`): The page ground the panels sit on. Cool light grey; near-black
  (`#090c11`) in dark.
- **Panel White** (`--panel`): The surface of every bordered region. Pure white in light, a
  slightly-lifted blue-black (`#10151c`) in dark. Also serves as the *text* colour on inverted
  elements (primary buttons, the active day cell).
- **Sunken Panel** (`--panel-2`): A half-step from the panel, for inset areas that recede —
  input interiors, panel header strips, chips, an entry row in edit mode.
- **Rule** (`--line`): The 1px border on every panel, field, chip, and divider. The single
  most-used non-text token in the system.
- **Soft Rule** (`--line-soft`): The lighter divider between list rows, and the empty track
  behind every progress bar.
- **Ink** (`--ink`): Primary text and figures. Also the *background* of inverted elements.
- **Dim Ink** (`--ink-dim`): Section headings, secondary figures, ghost button text.
- **Faint Ink** (`--ink-faint`): Labels, units, counts, placeholders — the annotation layer.
- **Grid** (`--grid`): A 4.5%-black (3.5%-white in dark) hairline used only for the 16px
  measurement grid behind the calorie readout.

### Named Rules

**The One Signal Rule.** Amber means "measured progress, still in range" or "this text
performs an action". It is never a background for a large area, never a decorative highlight,
never applied to a heading, and never used to make something look important. If a screen has
more than a few percent amber on it, the rule is broken.

**The Three-State Number Rule.** A figure is neutral ink by default, green only when it
reports remaining headroom, and red only when it has passed its target. There is no fourth
colour for numbers, and no colour that means "good job".

**The Two-Value Rule.** Every colour is defined once in `:root` and once in `.dark`, both in
`app/globals.css`. No component may hardcode a hex, and no component may branch on theme — if
a value needs to differ between themes, it becomes a token.

## Typography

**Display / Data Font:** system monospace stack (`ui-monospace` → `SFMono-Regular` / `SF Mono`
on Apple, `Cascadia Mono` / `Consolas` on Windows, `Menlo`, `Liberation Mono`)
**Body Font:** system sans stack (`ui-sans-serif`, `system-ui`, `-apple-system`, `Segoe UI`,
`Roboto`, `Helvetica`)

No webfont is loaded, by product constraint: the app ships as a single self-hosted container
and pulls nothing from a CDN. Both stacks resolve to the platform's own faces, which is also
why the readout looks native inside the installed PWA.

**Character:** Two voices with a hard division of labour. Monospace, tabular-figured and
tightened by -0.01em, speaks for anything that was measured — calories, grams, dates, timezone
strings, the connector URL. System sans speaks for everything a person wrote — food names,
help text, errors. The contrast between them is the primary way the interface signals what
kind of thing you are looking at, which is why it must not be diluted.

### Hierarchy
- **Display** (mono, 700, 2.25rem, line-height 1): The day's calorie total, and nothing else.
  It is the single largest object on the screen by a wide margin — the one figure the app
  exists to show.
- **Headline** (sans, 600, 0.875rem, 0.1em, uppercase): Tab titles — "Trends", "Weight",
  "Settings". Deliberately small: a heading here is a location marker, not a banner.
- **Title** (sans, 600, 0.6875rem, 0.05em, uppercase): Every panel header and meal-group
  header ("Add food", "breakfast", "Claude connector").
- **Body** (sans, 400, 0.875rem, line-height 1.25rem): Food names, input values, prose. The
  only size at which real sentences are set.
- **Label** (sans, 400, 0.6875rem, 0.05em, uppercase, faint ink): The annotation layer —
  metric names, units, entry counts, hints, "over" / "left".
- **Field (touch)** (sans, 400, 16px): Every form control on a coarse pointer. Not a design
  choice — the iOS zoom floor. See The Touch Floor below.
- **Data** (mono, 600, 0.875rem, tabular): Inline measured values — an entry's calories, its
  P/C/F triplet, a meter's value/goal pair. Scales down to 0.6875rem for secondary figures
  without changing character.

### Named Rules

**The Measurement Rule.** Monospace and tabular figures are reserved for quantities that were
measured or recorded. Prose never takes mono, and a number never takes sans. This split is
what makes the numerals mean something — if everything were mono, nothing would read as data.
Apply it with the `.num` class, never with an ad-hoc font-family.

**The Touch Floor.** On a coarse pointer every form control is 16px, overriding the
0.875rem body size. This is not a stylistic choice: iOS Safari zooms the entire viewport when a
focused field's text is under 16px and never zooms back, so at 14px every tap into every field
left the page magnified. `maximum-scale=1` would suppress it only by disabling pinch-zoom, which
this app deliberately keeps. The desktop is unaffected and stays at 14px. Fields get taller on a
phone, which also lifts them off the 32–34px they used to sit at, under the 44px a thumb needs.

**The Small Caps Rule.** Every label in the system is the same object: 0.6875rem, uppercase,
0.05em tracking, faint ink. Labels do not vary in size, weight, or colour between panels.
Their uniformity is what lets the eye skip them and land on the figures.

**The No Column Rule.** Right-aligned figures with tabular numerals do the aligning; the system
never adds a border, a background, or extra tracking to make a column line up.

## Layout

A single centred column, maximum 672px (`max-w-2xl`), with 12px side padding and a fixed bottom
navigation. Everything below is padded clear with a 96px bottom inset (`pb-24`), and
`env(safe-area-inset-bottom)` is honoured on both `body` and the nav so the readout never
slides under a home indicator. Portrait phone is the design target; the desktop browser simply
gets the same column centred in more grey.

Vertical rhythm is tight and uniform: panels are separated by 8px, padded 12px inside, and
their internal rows use 6px gaps. There is no large spacing step in the system — the biggest
gap between two adjacent elements on the Today screen is 8px. This is intentional, and it is
the main reason the screen carries a full day of nutrition with very little scrolling.

The Today screen is a fixed vertical sequence, densest at the top: seven-day strip → the
calorie readout → a three-column grid of six macro meters → the meal selector → quick-add
chips → one collapsible Add food panel → entries grouped by meal. Everything optional
collapses; the day's numbers never do.

There used to be three panels below the chips — Products, Add food, and Copy & templates —
which is three places to answer one question. Products was a second logging surface for one
kind of source; templates and day-copy were a surface of their own for repeating a day. Both
are now inputs to Add food, which is the single place an entry is composed, and the catalog
itself moved to Settings where a reference table belongs.

The Trends screen is the same instrument over a window instead of a day, in five panels at the
same 8px separation: coverage (days logged, average calories, weight delta) → the metric chart
with its goal rule, two date ticks and min/median/max → goal adherence, one cell per day in
range/over/unlogged → the average day, using the same seven meters Today uses → the meal split.
It reports what the range *was*; it does not project, streak, or congratulate.

The window is 7, 30 or 90 days, or the whole record. Two of those panels change shape rather
than shrink, because a year does not fit in the space a week does:

- **The chart buckets.** Past 92 days one bar is a week, past 400 one bar is a month, and a
  bucket carries the **average of its logged days** — never the sum, because the dashed rule it
  is read against is a daily goal. The caption names the bucket, and says that the
  min/median/max below remain per day.
- **The adherence strip folds.** Up to 31 days it is one flush row of full-height cells. Past
  that it becomes seven weekday rows by columns of weeks — a calendar, scrolled to the most
  recent week, with a legend — so every day keeps a cell you can actually see. A 365-cell row
  is a third of a pixel per day, which is a texture, not a measurement.

Responsive behaviour is deliberately minimal — the column has one width rule and the macro
grid stays three columns at every size. There are no breakpoint-specific layouts, because
there is no layout here that would benefit from one.

**Safe areas.** `viewport-fit: cover` extends the web view into all four insets, so `body` pads
all four with `env(safe-area-inset-*)`. Only the bottom one was padded originally, which put the
top of every screen under the notch and the Dynamic Island in the installed PWA. A full-height
screen uses `.min-h-safe` rather than `min-h-screen`: `100vh` inside an already-padded body
overflows by exactly the inset. The status bar style is `default`, not `black-translucent` —
translucent forces white glyphs, which vanish on the light theme — and the strip behind it takes
its colour from a single `theme-color` meta kept in step with the `.dark` class, not from a
`prefers-color-scheme` media query the class can contradict.

### Named Rules

**The One Column Rule.** There is exactly one content column at every viewport. Extra
horizontal space becomes margin, never a second column or a sidebar. Anything that needs
horizontal room scrolls inside its own row (`.no-scrollbar`), as the favourite and recent chips
already do.

**The Reachable Nav Rule.** Primary navigation stays fixed at the bottom within thumb reach,
and no primary action may live in a top bar.

## Elevation & Depth

The system is flat. Depth is expressed entirely by two devices: a 1px `--line` border, and a
half-step tonal shift between `--panel` and `--panel-2`. A panel is a bordered region, not a
floating card. There is no shadow scale, no elevation ramp, and no hover lift.

The one permitted exception is genuine overlay: an element that sits on top of page content
rather than in the flow may separate itself from what it covers. Two elements qualify — the
toast stack and the fixed bottom navigation — and both use it minimally.

### Shadow Vocabulary
- **Overlay** (`box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)`):
  Toasts only. The sole shadow in the application.
- **Overlay Veil** (`backdrop-filter: blur(16px)` over `color-mix(in srgb, var(--panel) 88%, transparent)`):
  The bottom navigation, so content scrolling beneath it stays perceptible without competing.

### Named Rules

**The Float-Only Rule.** Shadow and blur are permitted only on elements that overlay page
content. Anything in the document flow — panels, cards, rows, inputs, chips, buttons — is flat,
at rest and on hover, without exception.

## Shapes

Square-leaning, hairline-bounded rectangles. The house radius is 4px, with 5px and 6px
available for slightly larger containers and 2px for progress bars; nothing in the system is
more rounded than 6px, and nothing is a circle or a pill. The radius exists to keep corners
from looking accidentally broken, not to soften anything.

Borders carry the form language. A 1px `--line` rule defines every panel, field, chip, and
header strip; a lighter `--line-soft` rule divides rows inside a list. Grouped controls — the
seven-day strip, the meal-group list — share borders rather than sitting apart, so a group
reads as one bordered instrument rather than a row of separate objects.

The only texture in the system is a 16px two-axis measurement grid (`.gridlines`) drawn at 4.5%
opacity behind the calorie readout, and only there. It marks that panel as the primary
instrument face.

### Named Rules

**The Hairline Rule.** One pixel, `--line`, is the system's separator. Do not reach for a
thicker border, a coloured border, a double rule, or a shadow to separate two regions.

**The Nothing-Is-Round Rule.** No pills, no circles, no fully-rounded controls. Segmented
controls and toggles are square-cornered like everything else.

## Components

### Buttons
- **Shape:** Barely-rounded rectangle (4px), no border on primary, 1px `--line` on ghost.
- **Primary:** Inverted — ink background, panel-coloured text, 6px/12px padding, 0.6875rem
  uppercase 600 with 0.05em tracking. Disabled drops to 45% opacity rather than changing colour.
- **Ghost:** Transparent with a hairline border and dim ink text; on hover the text goes full
  ink and the border lifts to `--ink-faint`. Used for secondary and paired actions (Cancel, Log
  out, JSON/CSV export).
- **Hover / Focus:** Colour transitions only (`transition-colors`). No lift, no scale, no shadow.
- **Inline text actions:** A third, deliberately un-button-like variant — 0.6875rem amber text
  that underlines on hover, for actions attached to a form rather than concluding it
  (`★ favorite`, `⬚ product`).

### Chips
- **Style:** Sunken panel background, 1px `--line` border, 4px radius, 4px/10px padding,
  monospace value trailing the name. They scroll horizontally in a single hidden-scrollbar row
  rather than wrapping.
- **State:** Favourites carry amber text and a `★`, plus a faint `×` that turns red on hover to
  remove. Recent items are plain ink and hover to an `--ink-faint` border. Both drop to 50%
  opacity while their log request is in flight.

### Cards / Containers
- **Corner Style:** 4px.
- **Background:** `--panel`, with header strips and inset regions on `--panel-2`.
- **Shadow Strategy:** None. See Elevation & Depth.
- **Border:** 1px `--line` on all sides.
- **Internal Padding:** 12px; header strips use 6px/12px.
- **Collapsible variant:** A header row with an uppercase title, an optional faint hint on the
  right, and a monospace `+` / `−` glyph as the only disclosure indicator. The open state adds a
  top border above the body. Rotating chevrons are not part of this system.

### Inputs / Fields
- **Style:** `--panel-2` interior, 1px `--line` border, 4px radius, 6px/8px padding, 0.875rem
  body text. Numeric fields add `.num` and right-align, so a row of four inputs reads as a
  column of figures.
- **Focus:** The border alone changes to amber. No ring, no glow, no shadow, no background change.
- **Size:** 0.875rem, raised to **16px under `@media (pointer: coarse)`** — see The Touch Floor.
  A control sized in a fixed-width box must be measured at 16px, not 14px, or it truncates on the
  device the app is actually used on.
- **Label:** a persistent 11px uppercase label sits above the field. A placeholder is a hint,
  never the label — it disappears exactly when the value most needs identifying.
- **Disabled:** 50% opacity and `not-allowed`. The colour does not change.
- **Native chrome:** the browser draws a spinner, a select arrow and a calendar button in its
  own language — three metaphors at three weights, two of which stay light in dark mode. All
  three are brought onto the system's terms in `app/globals.css`: number spinners are removed
  outright (arrow keys and the numeric keyboard still work), the select arrow is suppressed and
  replaced by one masked chevron in `--ink-faint` at the icon set's stroke weight, and the
  calendar button is opacity-tuned and inverted in dark. The controls themselves stay native —
  the date picker, the option list and the numeric keyboard are the platform's.
- **`Select`** (`components/Select.tsx`) owns that chevron. Use it rather than a bare `<select>`.

### Icons

**Lucide** (`lucide-react`), bundled through npm. It is not a CDN asset: it ships inside the
container like any other module, so the self-hosting constraint holds. It replaced four
hand-written paths that came from three different grids — a 20-vertex gear that went muddy at
22px, a stroked-but-closed weight silhouette that read as filled, and a house, which means
"home" and not "today".

- One family, no mixing. A glyph the set does not have is a reason to pick a different glyph,
  not to hand-draw one beside it.
- 22px in the bottom nav, 13px inline. Stroke 1.75 at rest, 2.25 when active — the same pair
  everywhere, so "active" looks identical in the nav and in the theme toggle.
- Icons are decoration-free labels for a destination or a mode. They never replace a figure,
  never carry colour of their own, and never appear inside a panel of numbers.
- The typographic marks the system already uses — `+` / `−` for disclosure, `✕`, `★`, `↻`, `→` —
  are **not** icons and stay as they are. They are set in the text, at text weight.

### App icon

Three meter bars — the system's signature component, and the structure of the Today screen at a
glance — in `--accent` against `--line-soft` tracks on the `--bg` dark ground, which is also the
manifest's `theme_color`. Square-cornered and full-bleed: iOS and Android apply their own masks,
and a radius baked into the artwork fights them.

It replaced an emerald gradient progress ring, which broke six rules at once — a colour outside
the palette (and the last place `#10b981` survived), a gradient, a circle, a progress ring, a
22% corner radius against a 2% system, and no relationship to anything on screen.

Every file is generated from one geometry definition by `scripts/generate-icons.mjs`
(`npm run icons`), so the SVG and the PNGs cannot drift. The script has no image dependency: the
mark is axis-aligned rectangles, so it rasterises exactly, and it asserts that the maskable
variant fits inside the 80%-diameter safe circle before writing. Regenerating the icons means
bumping `VERSION` in `public/sw.js` — the icons are cache-first and are not content-hashed.

- **`icon.svg` / `icon-192.png` / `icon-512.png`** — `purpose: any`, mark at 76% of the canvas.
- **`icon-maskable.svg` / `icon-maskable-512.png`** — `purpose: maskable`, mark at 54%.
- **`apple-touch-icon.png`** — 180×180. **PNG, never SVG:** iOS ignores an SVG apple-touch-icon
  and falls back to a screenshot of the page.

### Navigation
- **Bottom nav:** Four fixed tabs, each a 22px lucide glyph over a 0.6875rem label —
  `CalendarDays` (a day is the unit, and the week strip above it is a calendar), `ChartColumn`
  (the tab's own chart is a bar chart), `Scale`, and `Settings2` (sliders, echoing the meter
  tracks that make up most of what it opens). The four silhouettes — frame, bars, balance,
  sliders — are distinct enough to scan before the labels are read. The active tab is amber at
  stroke 2.25; inactive tabs are faint ink at 1.75. There is no indicator bar, pill, or
  underline — weight and colour carry the state.
- **Week strip:** Seven equal cells sharing vertical hairlines, each showing a narrow weekday
  initial over a monospace date. The selected day inverts to an ink block with panel-coloured
  text — the same inversion the primary button uses.

### Quick add

A filter field over two strips of chips — the fastest capture path in the product, and the most
used. One tap logs; there is nothing else to decide.

- **Favorites** are pinned by hand: amber, `★`-prefixed, with a `×` behind a hairline divider to
  unpin. Order is when they were pinned.
- **Recent** is derived from the last 30 days and **ranked, not listed**. `lib/quick-add-rank.ts`
  scores each food by how often it was eaten, weighted by the share of its occurrences that fell
  on the meal currently selected, and decayed on a 14-day half-life with a floor — so a habit
  fades rather than vanishing. The strip therefore answers a different question at 8am than at
  7pm, from the same payload and with no round trip, which is why the API returns per-meal counts
  instead of a sorted list.
- **Nothing appears twice.** A pinned food is excluded from Recent; the strip is what you eat but
  have not pinned, which is also what makes `★` worth offering.
- **A chip is a name and a figure.** It used to carry a second metadata line (`12× · 2d · 250g`),
  a caption explaining its own sort order, and a `⋯` editor for amount and pinning. All three
  were explanation and adjustment sitting on the one path that exists to avoid both. Amount and
  pinning belong to Add food, which is where an entry is composed; the ranking is still there,
  and is still invisible, which is the point.
- **The filter is always present**, because the strips scroll: most of what is in them is
  off-screen, so "what have I got" is not a question the chips can answer. Typing collapses both
  strips into one list of matches, and `Search all foods →` hands the same query to Add food,
  which reaches past what you have already eaten.
- Every log offers Undo, and carries the amount the food was logged at last time — product or
  not, since the chip logs last time's figures unscaled.

### Add food

The one place an entry is composed, from whichever of five sources has it. A single search field
(with the barcode control beside it) queries the copy tray, the saved catalog, favorites and
recents, and Open Food Facts at once, and returns them in four labelled bands inside one bordered
list — each row a name, its amount or basis, and its calories.

The composer beneath it is the whole point. Every food arrives **quoted against something**, and
naming that reference is what lets one amount field mean two different things without ever
guessing which:

- **per** — a label quotes per 100 g/ml; a copied row quotes the 250 g that was eaten. The amount
  rescales the figures, and only compatible units are offered (`lib/units.ts` refuses to invent a
  density). Changing the unit **restates** the amount — 241 g becomes 8.5 oz — rather than
  reinterpreting the number in the box. The exception is hand-typed values, where nothing has been
  read off a label yet: all four mass and volume units stay open and the basis follows whichever
  is chosen, so picking millilitres declares a liquid and the toggle reads `PER 100 ML`. Narrowing
  that list to the incumbent dimension made per-100-ml reachable only by choosing the unit
  *before* tapping `PER 100` — one form, two outcomes, decided by tap order and signposted
  nowhere.
- **portion** — hand-typed values that are the entry. The amount is recorded on the row and does
  not multiply anything, and the preview says so.
- **unitless** — a copy of a row that never recorded an amount. Only a count of helpings can move
  it, and no amount is written back, because the original never claimed one.

A hand-typed entry chooses between the first two with one segmented control, `AS EATEN` / `PER
100 G`, whose label follows the unit's own dimension. Above the seven numeric fields sits either
that control or, when something was picked, a provenance line naming the source and its basis with
a `clear` beside it. Below them, the preview states the row that will be written before it is
written, and `★ favorite` / `⬚ save label` are offered only when the current values can honestly
be turned into one.

### Copy

`⧉` on an entry row, and `copy all` on a meal-group header. Copying writes nothing: it puts the
row on a device-local tray (`lib/copied.ts`, localStorage, scoped to the account and cleared on
logout) and opens Add food, where the amount is set before anything is recorded. Eating the same
thing twice rarely means eating the same amount of it, so a duplicate that lands before you can
say otherwise is a figure you then have to go and correct.

### Meter

The system's signature component and the reason it reads as an instrument. A label row
(uppercase faint label left; `value/goal` and unit right, the value bolding and turning red when
over) sits above a 4px track in `--line-soft` carrying an amber fill that animates its width
over 500ms with an ease-out curve. A large variant at 6px height and 13px figures backs the
calorie readout's 8px bar. Six of these in a three-column grid account for the entire macro
display; they pack far more per screen than rings and read left-to-right like a scale.

### Toasts

Centred above the bottom nav, 4px radius, 10px/16px padding, 0.875rem medium sans with a single
leading glyph (`✓` / `!` / `ℹ`). Success is amber, error is red, info is inverted ink. They
enter with an 8px rise over 250ms and dismiss themselves after 2.8 seconds. This is the only
place the system uses a shadow, and the only place amber is used as a large fill.

## Do's and Don'ts

### Do:
- **Do** put every colour in `app/globals.css` as a token with both a `:root` and a `.dark`
  value, and consume it via the Tailwind alias (`text-ink-faint`) or `var(--token)`.
- **Do** apply `.num` to every measured quantity, and right-align it. A figure that is not
  tabular monospace is a bug.
- **Do** set labels at 0.6875rem uppercase with 0.05em tracking in `--ink-faint`, always.
- **Do** separate regions with a single 1px `--line` border and, where a region should recede,
  a shift to `--panel-2`.
- **Do** keep the accent for in-range progress, the active nav tab, focus borders, and inline
  creating actions — and nothing else.
- **Do** let a progress fill turn `--over` red the moment its value passes its goal, in both the
  meter and the calorie bar.
- **Do** collapse anything optional behind a `Panel` with a `+` / `−` glyph, so the day's figures
  stay above it.
- **Do** keep new panels at 12px padding and 8px separation; match the existing rhythm rather
  than introducing a larger step.

### Don't:
- **Don't** hardcode a hex value in a component. Charts take `--accent`, with `--ink-dim` and
  `--ink-faint` for additional series; the system has one signal colour and data visualisation is
  not an exemption. (`MiniChart` defaulted to emerald `#10b981` and `TrendsCard` passed indigo
  `#6366f1`; both now read tokens.)
- **Don't** use round or pill shapes, and don't use emoji anywhere in the interface. A segmented
  control here is square-cornered with lucide glyphs. (`ThemeToggle` was `rounded-full` pills
  with ☀️/🌙; `FoodSearch` carried a 🔍 in its placeholder. Both are corrected.)
- **Don't** use the older auth-screen language. The field, button, and type scale defined here
  are the system, and the login screen is not exempt.
- **Don't** grow a touch target by projecting an invisible box from a glyph. A `.hit`-style
  44×44 pseudo-element cast from an 8px glyph inside a 24px chip overhung the control beside it,
  so a tap meant for "log this favorite" could land on "delete it". Use `.glyph-btn`: real
  padding on a real flex box, which cannot overlap a sibling.
- **Don't** rely on a `placeholder` as a field's only label. It disappears the moment the field
  is populated, which is exactly when the value most needs identifying. Persistent 11px
  uppercase labels above the field, as in `GoalsCard`, `EntryRow` and the Add form.
- **Don't** render a goal rail, a chart, or an average when the underlying figure is unset or
  unlogged. An empty track reads as "you have eaten nothing", not "no goal set"; four zeroed
  averages read as a measurement rather than an absence. Say what is missing, and link to where
  it is set.
- **Don't** rank a list of the user's own habits by recency alone. One meal eaten yesterday is
  not more relevant than the one eaten every morning for a month, and the strip where this
  matters most is the one used most.
- **Don't** drop provenance on a re-log. Re-logging from Recent must carry the `productId`,
  `quantity` and `quantityUnit` of the occurrence it copies, or the fastest path in the app is
  also the one that quietly degrades the record.
- **Don't** state a denominator the figure was not computed over. Averages here are over
  *logged* days, and the caption says so; "average over 30 days" when 12 of them were never
  logged is a different number and a false one.
- **Don't** draw a mark that a stretched chart cannot render. `MiniChart` fills its container
  with `preserveAspectRatio="none"`, so only rects and `vector-effect="non-scaling-stroke"`
  strokes survive: a corner radius became six times wider than tall, and the line's point
  circles rendered as flat ellipses. Points are zero-length round-capped strokes instead.
- **Don't** stretch an SVG on one axis only. `w-full` with a 100:80 viewBox gave the chart its
  height from its own ratio — about 350px inside a 112px `overflow-hidden` frame — so it was
  cropped to its top third and only bars near the maximum were visible at all. Every other day
  rendered below the fold of its own panel, silently, for as long as the panel existed. Both
  axes, always: `block h-full w-full`.
- **Don't** change a unit without restating the amount. Switching 241 g to ounces and leaving
  "241" in the field logs four kilos of porridge with every arithmetic step correct. The unit
  control converts; only the person types a new number.
- **Don't** drop an amount on a re-log because the row has no `productId`. A quick-add chip logs
  last time's figures unscaled, so last time's amount is this entry's amount whether a saved
  label was involved or not.
- **Don't** add a shadow to anything that sits in the document flow, including on hover.
- **Don't** introduce a webfont or any CDN-hosted asset. The app ships self-contained. An icon
  set is permitted *because* it bundles: lucide is an npm dependency inside the container, not a
  fetch. A second icon set is not — see Icons.
- **Don't** add gradients, glass or translucency (outside the nav's existing veil), glow,
  illustration, or decorative imagery. The system is intentionally unfashionable.
- **Don't** use green or red for anything except goal state and destructive intent. Neither
  colour may be used to praise, congratulate, or mark a streak.
- **Don't** widen past the 672px column or add a second column, sidebar, or top navigation bar on
  any surface.
- **Don't** set prose in monospace or figures in sans. The split is the system's primary semantic
  signal.

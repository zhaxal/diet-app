// Browser-side day helpers. The server owns timezone-correct day boundaries;
// these only format and stamp what the user is looking at right now.

export const todayStr = () => {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
};

/**
 * Entries logged through the assistant carry real times; stamping the UI's at
 * noon made an 8am coffee sort above an 8pm dinner and left every UI entry tied
 * at the same instant. Use the actual clock for today, and keep noon as the
 * neutral anchor only for a backdated day.
 */
export function consumedAtFor(date: string): string {
  if (date === todayStr()) return new Date().toISOString();
  return new Date(`${date}T12:00:00`).toISOString();
}

/** "14:32" in the viewer's own locale. */
export function clockTime(value: string | number | Date = new Date()): string {
  return new Date(value).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** The seven days ending on `end`, for the header strip. */
export function weekEnding(end: string): string[] {
  const [y, m, d] = end.split("-").map(Number);
  const out: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const dt = new Date(Date.UTC(y, m - 1, d - i));
    out.push(dt.toISOString().slice(0, 10));
  }
  return out;
}

export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * The last day of the seven-day strip containing `date`, clamped to `today`
 * so the header never shows future empty columns.
 */
export function stripEnding(date: string, today: string): string {
  const forward = shiftDate(date, 3);
  return forward > today ? today : forward;
}

export function prettyDate(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  if (date === todayStr()) return "Today";
  if (date === shiftDate(todayStr(), -1)) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}


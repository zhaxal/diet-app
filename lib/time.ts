// Timezone-aware date helpers built on the Intl API (no dependency, DST-safe).
//
// The app defines "a day" as midnight→midnight in the *user's* timezone, but
// stores every timestamp as a real UTC instant. These helpers convert between
// the two so summaries, lists, trends, and the date picker all agree on which
// calendar day an instant belongs to.

/**
 * Offset in milliseconds such that: localWallClock = utcInstant + offset.
 * Computed at the given instant, so it's correct across DST transitions.
 */
function tzOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  // `hour` can come back as "24" at midnight in some environments.
  const hour = map.hour === "24" ? 0 : Number(map.hour);
  const asUTC = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    hour,
    Number(map.minute),
    Number(map.second),
  );
  return asUTC - date.getTime();
}

/**
 * The UTC instant corresponding to a local wall-clock time in a timezone.
 * Two-pass to resolve the offset at the *target* instant (handles DST).
 */
export function zonedWallToUtc(
  dateStr: string,
  timeStr: string,
  timeZone: string,
): Date {
  const naive = new Date(`${dateStr}T${timeStr}Z`).getTime();
  const off1 = tzOffsetMs(new Date(naive), timeZone);
  let utc = naive - off1;
  const off2 = tzOffsetMs(new Date(utc), timeZone);
  if (off2 !== off1) utc = naive - off2;
  return new Date(utc);
}

/**
 * [start, end) UTC instants bounding the local calendar day `dateStr`
 * (YYYY-MM-DD) in `timeZone`.
 */
export function dayBoundsInTz(
  dateStr: string,
  timeZone: string,
): { start: Date; end: Date } {
  const start = zonedWallToUtc(dateStr, "00:00:00.000", timeZone);
  const endDate = new Date(`${dateStr}T00:00:00.000Z`);
  endDate.setUTCDate(endDate.getUTCDate() + 1);
  const nextDayStr = endDate.toISOString().slice(0, 10);
  const end = zonedWallToUtc(nextDayStr, "00:00:00.000", timeZone);
  return { start, end };
}

/** The YYYY-MM-DD calendar date that `date` falls on in `timeZone`. */
export function localDateInTz(date: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Today's YYYY-MM-DD in `timeZone`. */
export function todayInTz(timeZone: string): string {
  return localDateInTz(new Date(), timeZone);
}

/** True if `tz` is a valid IANA timezone name. */
export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

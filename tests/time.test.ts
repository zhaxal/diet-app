import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dayBoundsInTz,
  isValidCalendarDate,
  isValidTimeZone,
  localDateInTz,
  localTimeInTz,
  shiftCalendarDate,
  zonedWallToUtc,
} from "../lib/time";

// Every expectation below is worked out by hand from the zone's UTC offset on
// that date, not computed with the helpers under test.

const iso = (d: Date) => d.toISOString();

test("a day in a zone without DST is the 24 hours from local midnight", () => {
  // Tokyo is UTC+9 all year.
  const { start, end } = dayBoundsInTz("2026-11-16", "Asia/Tokyo");
  assert.equal(iso(start), "2026-11-15T15:00:00.000Z");
  assert.equal(iso(end), "2026-11-16T15:00:00.000Z");
});

test("a day in a half-hour zone starts on the half hour", () => {
  // Kolkata is UTC+5:30.
  const { start, end } = dayBoundsInTz("2026-06-10", "Asia/Kolkata");
  assert.equal(iso(start), "2026-06-09T18:30:00.000Z");
  assert.equal(iso(end), "2026-06-10T18:30:00.000Z");
});

test("the day clocks spring forward is 23 hours long", () => {
  // New York, 8 March 2026: midnight is still EST (UTC-5), the next midnight is
  // EDT (UTC-4).
  const { start, end } = dayBoundsInTz("2026-03-08", "America/New_York");
  assert.equal(iso(start), "2026-03-08T05:00:00.000Z");
  assert.equal(iso(end), "2026-03-09T04:00:00.000Z");
});

test("the day clocks fall back is 25 hours long", () => {
  // New York, 1 November 2026: midnight is EDT (UTC-4), the next is EST (UTC-5).
  const { start, end } = dayBoundsInTz("2026-11-01", "America/New_York");
  assert.equal(iso(start), "2026-11-01T04:00:00.000Z");
  assert.equal(iso(end), "2026-11-02T05:00:00.000Z");
});

test("a day at a month boundary ends at the first of the next month", () => {
  const { start, end } = dayBoundsInTz("2026-02-28", "UTC");
  assert.equal(iso(start), "2026-02-28T00:00:00.000Z");
  assert.equal(iso(end), "2026-03-01T00:00:00.000Z");
});

test("an instant belongs to the local day, not the UTC day", () => {
  // 15:00Z on the 15th is already midnight on the 16th in Tokyo.
  assert.equal(localDateInTz(new Date("2026-11-15T14:59:59.999Z"), "Asia/Tokyo"), "2026-11-15");
  assert.equal(localDateInTz(new Date("2026-11-15T15:00:00.000Z"), "Asia/Tokyo"), "2026-11-16");
  // 03:59Z on the 9th is still 23:59 on the 8th in New York (EDT).
  assert.equal(localDateInTz(new Date("2026-03-09T03:59:59.000Z"), "America/New_York"), "2026-03-08");
  assert.equal(localDateInTz(new Date("2026-03-09T04:00:00.000Z"), "America/New_York"), "2026-03-09");
});

test("a wall-clock time resolves with the offset in force on that date", () => {
  // London is UTC+1 in July and UTC+0 in January.
  assert.equal(
    iso(zonedWallToUtc("2026-07-01", "12:00:00.000", "Europe/London")),
    "2026-07-01T11:00:00.000Z",
  );
  assert.equal(
    iso(zonedWallToUtc("2026-01-15", "12:00:00.000", "Europe/London")),
    "2026-01-15T12:00:00.000Z",
  );
});

test("a time shortly after a clock change uses the new offset, not the old one", () => {
  // New York springs forward at 07:00Z on 8 March 2026. 03:30 that morning is
  // already EDT (UTC-4), although 03:30Z itself still falls in EST.
  assert.equal(
    iso(zonedWallToUtc("2026-03-08", "03:30:00.000", "America/New_York")),
    "2026-03-08T07:30:00.000Z",
  );
  // It falls back at 06:00Z on 1 November 2026. 03:00 that morning is EST (UTC-5).
  assert.equal(
    iso(zonedWallToUtc("2026-11-01", "03:00:00.000", "America/New_York")),
    "2026-11-01T08:00:00.000Z",
  );
});

test("local time of day keeps milliseconds and writes midnight as 00, not 24", () => {
  assert.equal(localTimeInTz(new Date("2026-11-15T15:00:00.123Z"), "Asia/Tokyo"), "00:00:00.123");
  assert.equal(localTimeInTz(new Date("2026-11-15T23:12:30.000Z"), "Asia/Tokyo"), "08:12:30.000");
});

test("only real IANA zone names are accepted", () => {
  assert.equal(isValidTimeZone("Asia/Tokyo"), true);
  assert.equal(isValidTimeZone("Mars/Olympus_Mons"), false);
  assert.equal(isValidTimeZone(""), false);
});

test("isValidCalendarDate rejects impossible dates like Feb 30", () => {
  assert.equal(isValidCalendarDate("2024-02-29"), true);
  assert.equal(isValidCalendarDate("2026-02-29"), false);
  assert.equal(isValidCalendarDate("2026-02-30"), false);
  assert.equal(isValidCalendarDate("2026-13-01"), false);
  assert.equal(isValidCalendarDate("2026-1-1"), false);
});

test("shiftCalendarDate shifts across month and year boundaries safely", () => {
  assert.equal(shiftCalendarDate("2026-03-01", -1), "2026-02-28");
  assert.equal(shiftCalendarDate("2024-03-01", -1), "2024-02-29");
  assert.equal(shiftCalendarDate("2026-12-31", 1), "2027-01-01");
});

test("zonedWallToUtc preserves sub-second precision across millisecond instants", () => {
  const utc = zonedWallToUtc("2026-07-01", "12:34:56.789", "Asia/Tokyo");
  assert.equal(utc.toISOString(), "2026-07-01T03:34:56.789Z");
});

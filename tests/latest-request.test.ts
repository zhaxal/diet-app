import { test } from "node:test";
import assert from "node:assert/strict";
import { createLatestRequest } from "../lib/latest-request";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test("an old day arriving after a newer day cannot replace its record", async () => {
  let day = "2026-09-05";
  const reads = createLatestRequest(() => day);
  const old = deferred<string>();
  const next = deferred<string>();
  const displayed: string[] = [];
  const failures: unknown[] = [];
  const a = reads.run(day, () => old.promise, (v) => displayed.push(v), (e) => failures.push(e));
  day = "2026-09-06";
  const b = reads.run(day, () => next.promise, (v) => displayed.push(v), (e) => failures.push(e));
  next.resolve("today"); await b;
  old.resolve("yesterday"); await a;
  assert.deepEqual(displayed, ["today"]);
  assert.deepEqual(failures, []);
});
test("a superseded failure cannot replace current content with an error", async () => {
  const reads = createLatestRequest(() => "today");
  const old = deferred<string>();
  const seen: string[] = [];
  const a = reads.run("today", () => old.promise, (v) => seen.push(v), () => seen.push("error"));
  await reads.run("today", async () => "fresh", (v) => seen.push(v), () => seen.push("error"));
  old.reject(new Error("offline")); await a;
  assert.deepEqual(seen, ["fresh"]);
});
test("selection changes invalidate results even before the next read starts", async () => {
  let day = "today";
  const reads = createLatestRequest(() => day);
  const pending = deferred<string>();
  let committed = false;
  const job = reads.run(day, () => pending.promise, () => { committed = true; }, () => { committed = true; });
  day = "yesterday";
  pending.resolve("today"); await job;
  assert.equal(committed, false);
});
test("old-day mutation callbacks do not invalidate the selected day's pending read", async () => {
  const reads = createLatestRequest(() => "today");
  const pending = deferred<string>();
  const seen: string[] = [];
  const job = reads.run("today", () => pending.promise, (v) => seen.push(v), () => {});
  await reads.run("yesterday", async () => "wrong", (v) => seen.push(v), () => {});
  pending.resolve("right"); await job;
  assert.deepEqual(seen, ["right"]);
});
test("unmount cancels commits, while an active failure reaches recovery", async () => {
  const reads = createLatestRequest(() => "today");
  const pending = deferred<string>();
  const seen: string[] = [];
  const job = reads.run("today", () => pending.promise, (v) => seen.push(v), () => seen.push("error"));
  reads.invalidate(); pending.resolve("old"); await job;
  await reads.run("today", async () => { throw new Error("offline"); }, () => {}, () => seen.push("recover"));
  assert.deepEqual(seen, ["recover"]);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { clientIp, createRateLimiter } from "../lib/rate-limit";
import { request } from "./helpers";

const MINUTE = 60_000;

function limiterAt(start: number, limit = 3, windowMs = 15 * MINUTE) {
  const clock = { now: start };
  const limiter = createRateLimiter({ limit, windowMs, now: () => clock.now });
  return { clock, limiter };
}

test("a key is allowed until it has failed as many times as the limit", () => {
  const { limiter } = limiterAt(0);
  limiter.hit("a");
  limiter.hit("a");
  assert.equal(limiter.check("a").allowed, true);
  limiter.hit("a");
  assert.equal(limiter.check("a").allowed, false);
});

test("a blocked key is told how long until its window ends", () => {
  const { clock, limiter } = limiterAt(1_000_000);
  limiter.hit("a");
  limiter.hit("a");
  limiter.hit("a");
  clock.now += 5 * MINUTE;
  // The window opened with the first failure and lasts 15 minutes.
  assert.deepEqual(limiter.check("a"), { allowed: false, retryAfterSec: 600 });
});

test("failures stop counting once the window has passed", () => {
  const { clock, limiter } = limiterAt(0);
  limiter.hit("a");
  limiter.hit("a");
  limiter.hit("a");
  clock.now += 15 * MINUTE;
  assert.deepEqual(limiter.check("a"), { allowed: true, retryAfterSec: 0 });
  // And the old failures are gone, not merely hidden: two more are still fine.
  limiter.hit("a");
  limiter.hit("a");
  assert.equal(limiter.check("a").allowed, true);
});

test("keys are counted separately", () => {
  const { limiter } = limiterAt(0);
  limiter.hit("a");
  limiter.hit("a");
  limiter.hit("a");
  assert.equal(limiter.check("b").allowed, true);
});

test("a reset forgives a key's earlier failures", () => {
  const { limiter } = limiterAt(0);
  limiter.hit("a");
  limiter.hit("a");
  limiter.hit("a");
  limiter.reset("a");
  assert.equal(limiter.check("a").allowed, true);
});

test("expired keys are dropped rather than kept forever", () => {
  const { clock, limiter } = limiterAt(0);
  for (let i = 0; i < 500; i++) limiter.hit(`ip-${i}`);
  assert.equal(limiter.size(), 500);
  clock.now += 15 * MINUTE;
  limiter.hit("fresh");
  assert.equal(limiter.size(), 1);
});

test("a flood of distinct keys cannot grow the table without bound", () => {
  const clock = { now: 0 };
  const limiter = createRateLimiter({
    limit: 3,
    windowMs: 15 * MINUTE,
    maxKeys: 100,
    now: () => clock.now,
  });
  for (let i = 0; i < 1000; i++) limiter.hit(`ip-${i}`);
  assert.ok(limiter.size() <= 100, `table holds ${limiter.size()} keys`);
});

test("the client address is the one the nearest proxy reported", () => {
  // A proxy appends the address it saw; anything before it is the client's claim.
  assert.equal(
    clientIp(request("GET", "/", { headers: { "x-forwarded-for": "6.6.6.6, 203.0.113.7" } })),
    "203.0.113.7",
  );
  assert.equal(
    clientIp(request("GET", "/", { headers: { "x-forwarded-for": "203.0.113.7" } })),
    "203.0.113.7",
  );
  assert.equal(clientIp(request("GET", "/")), "unknown");
});

test("maxKeys eviction drops only the oldest key and preserves active ones", () => {
  const clock = { now: 0 };
  const limiter = createRateLimiter({
    limit: 2,
    windowMs: 15 * MINUTE,
    maxKeys: 3,
    now: () => clock.now,
  });
  limiter.hit("k1");
  limiter.hit("k2");
  limiter.hit("k2");
  limiter.hit("k3");
  assert.equal(limiter.check("k2").allowed, false);
  // Adding k4 evicts k1 (oldest), preserving k2 and k3.
  limiter.hit("k4");
  assert.equal(limiter.size(), 3);
  assert.equal(limiter.check("k2").allowed, false);
  assert.equal(limiter.check("k1").allowed, true);
});

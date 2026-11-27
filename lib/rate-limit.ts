// A small in-memory limiter for failed sign-in style attempts.
//
// In memory is the right size for this app: it runs as one container with one
// process (see PRODUCT.md), so there is no second instance to share counts
// with, and a restart forgiving everyone is an acceptable way to fail.
//
// Only failures are counted. A caller that keeps succeeding is never slowed
// down, which matters because the assistant and the visual tests both sign in
// far more often than a person does.

import type { NextRequest } from "next/server";

export interface RateLimiter {
  /** Whether `key` may try again now, and if not, how long until it may. */
  check(key: string): { allowed: boolean; retryAfterSec: number };
  /** Record one failed attempt against `key`. */
  hit(key: string): void;
  /** Forget `key`'s failures, e.g. after it finally succeeds. */
  reset(key: string): void;
  /** Number of keys currently tracked. */
  size(): number;
}

interface Entry {
  count: number;
  /** Epoch ms at which this key's window ends and its failures are forgotten. */
  resetAt: number;
}

export function createRateLimiter(opts: {
  limit: number;
  windowMs: number;
  /** Upper bound on tracked keys, so a flood of distinct keys cannot eat memory. */
  maxKeys?: number;
  now?: () => number;
}): RateLimiter {
  const { limit, windowMs } = opts;
  const maxKeys = opts.maxKeys ?? 50_000;
  const now = opts.now ?? Date.now;
  const entries = new Map<string, Entry>();
  let nextSweepAt = 0;

  function live(key: string, t: number): Entry | undefined {
    const entry = entries.get(key);
    if (entry && entry.resetAt <= t) {
      entries.delete(key);
      return undefined;
    }
    return entry;
  }

  function sweep(t: number) {
    for (const [key, entry] of entries) {
      if (entry.resetAt <= t) entries.delete(key);
    }
    nextSweepAt = t + windowMs;
  }

  return {
    check(key) {
      const t = now();
      const entry = live(key, t);
      if (!entry || entry.count < limit) return { allowed: true, retryAfterSec: 0 };
      return { allowed: false, retryAfterSec: Math.ceil((entry.resetAt - t) / 1000) };
    },

    hit(key) {
      const t = now();
      const entry = live(key, t);
      if (entry) {
        entry.count += 1;
        return;
      }
      if (t >= nextSweepAt) sweep(t);
      // Still full after dropping everything expired: this is a flood of
      // distinct keys. Evict only the oldest entry so active lockouts survive.
      if (entries.size >= maxKeys) {
        const oldest = entries.keys().next().value;
        if (oldest !== undefined) entries.delete(oldest);
      }
      entries.set(key, { count: 1, resetAt: t + windowMs });
    },

    reset(key) {
      entries.delete(key);
    },

    size() {
      return entries.size;
    },
  };
}

/**
 * The caller's address, for bucketing attempts.
 *
 * Behind a reverse proxy the socket address is the proxy's, so the address has
 * to come from `X-Forwarded-For`. The *last* entry is used: that is the one the
 * nearest proxy wrote from the connection it actually saw, whereas everything
 * before it arrived from the client and can say anything.
 */
export function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const last = forwarded?.split(",").pop()?.trim();
  return last || "unknown";
}

const FIFTEEN_MINUTES = 15 * 60 * 1000;

/** Failed attempts from one address, across sign-in, invite codes and API keys. */
export const clientFailures = createRateLimiter({ limit: 30, windowMs: FIFTEEN_MINUTES });

/** Failed password attempts from one address against one account. */
export const loginFailures = createRateLimiter({ limit: 10, windowMs: FIFTEEN_MINUTES });

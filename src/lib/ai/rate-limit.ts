// Simple in-memory, per-user rate limiter for AI write-features.
//
// This intentionally avoids a new integration (Redis/KV) to keep cost and
// setup to zero. Tradeoff: the counter lives in the server process memory, so
// it resets on deploy and is per-instance rather than globally shared. That is
// acceptable as a first guardrail against runaway cost / accidental abuse. If
// usage grows, swap the Map for Upstash Redis behind the same interface.

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

// Number of AI actions allowed per user within the rolling window.
const DEFAULT_DAILY_LIMIT = 40;
const WINDOW_MS = 24 * 60 * 60 * 1000;

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
};

export function checkAiRateLimit(
  userId: string,
  limit = DEFAULT_DAILY_LIMIT,
): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(userId);

  if (!existing || now > existing.resetAt) {
    const resetAt = now + WINDOW_MS;
    buckets.set(userId, { count: 1, resetAt });
    return { allowed: true, limit, remaining: limit - 1, resetAt };
  }

  if (existing.count >= limit) {
    return { allowed: false, limit, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count += 1;
  return {
    allowed: true,
    limit,
    remaining: Math.max(0, limit - existing.count),
    resetAt: existing.resetAt,
  };
}

// Occasionally purge expired buckets so the Map does not grow unbounded.
export function pruneExpiredBuckets() {
  const now = Date.now();
  for (const [key, bucket] of buckets.entries()) {
    if (now > bucket.resetAt) {
      buckets.delete(key);
    }
  }
}

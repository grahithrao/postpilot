/**
 * Minimal in-memory token bucket. Enough to stop a runaway client from
 * hammering the (potentially paid) generation endpoint in a single-node
 * deployment. Swap for Redis/Upstash when running more than one instance.
 */
type Bucket = { tokens: number; updatedAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitResult = { ok: boolean; remaining: number; retryAfterMs: number };

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const refillRate = limit / windowMs;
  const existing = buckets.get(key) ?? { tokens: limit, updatedAt: now };
  const refilled = Math.min(limit, existing.tokens + (now - existing.updatedAt) * refillRate);

  if (refilled < 1) {
    buckets.set(key, { tokens: refilled, updatedAt: now });
    return { ok: false, remaining: 0, retryAfterMs: Math.ceil((1 - refilled) / refillRate) };
  }

  buckets.set(key, { tokens: refilled - 1, updatedAt: now });
  return { ok: true, remaining: Math.floor(refilled - 1), retryAfterMs: 0 };
}

// Keep the map from growing without bound in long-lived processes.
if (typeof setInterval !== "undefined") {
  const timer = setInterval(
    () => {
      const cutoff = Date.now() - 10 * 60_000;
      for (const [k, v] of buckets) if (v.updatedAt < cutoff) buckets.delete(k);
    },
    5 * 60_000,
  );
  timer.unref?.();
}

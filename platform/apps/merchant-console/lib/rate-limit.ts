export type RateLimit = Readonly<{ limit: number; windowMs: number }>;

/**
 * Fixed-window limiter with a bounded key count.
 * ponytail: counts live in this process and reset on restart; N instances allow N times the limit.
 * Upgrade to a shared store keyed the same way before running more than one instance.
 */
export function createRateLimiter({ limit, windowMs }: RateLimit, maxKeys = 10_000, now: () => number = Date.now) {
  const windows = new Map<string, { count: number; resetAt: number }>();
  return Object.freeze({
    /** Counts one attempt; returns 0 when allowed, otherwise the seconds until the window resets. */
    retryAfterSeconds(key: string): number {
      const time = now();
      const current = windows.get(key);
      if (current && current.resetAt > time) {
        if (current.count >= limit) return Math.ceil((current.resetAt - time) / 1_000);
        current.count += 1;
        return 0;
      }
      windows.delete(key);
      if (windows.size >= maxKeys) {
        for (const [candidate, window] of windows) if (window.resetAt <= time) windows.delete(candidate);
        if (windows.size >= maxKeys) windows.delete(windows.keys().next().value as string);
      }
      windows.set(key, { count: 1, resetAt: time + windowMs });
      return 0;
    },
  });
}

import "server-only";

const hits = new Map<string, number[]>();

/** Fixed-window in-memory limiter; good enough for a single-instance tool, not for a fleet of servers. */
export function allow(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  hits.set(key, [...recent, now]);
  return true;
}

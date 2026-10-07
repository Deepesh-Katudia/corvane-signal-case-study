import "server-only";

const MAX_KEYS = 5_000;
const hits = new Map<string, number[]>();

/**
 * Sliding-window in-memory limiter. On serverless hosts each instance keeps its own window, so this is a
 * speed bump, not a guarantee; a shared store (e.g. Upstash) is the upgrade path noted in the README.
 */
export function allow(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  if (hits.size > MAX_KEYS) {
    for (const [k, ts] of hits) if (!ts.some((t) => now - t < windowMs)) hits.delete(k);
    if (hits.size > MAX_KEYS) hits.clear();
  }
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  hits.set(key, [...recent, now]);
  return true;
}

/** Client IP from headers the platform sets (not the client-controlled first X-Forwarded-For entry). */
export function clientIp(req: Request): string {
  const h = req.headers;
  const forwarded = h.get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean);
  return h.get("x-vercel-forwarded-for") ?? h.get("x-real-ip") ?? forwarded?.at(-1) ?? "local";
}

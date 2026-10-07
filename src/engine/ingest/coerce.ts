const NULLISH_STRINGS = new Set(["", "none", "null", "nil", "undefined", "n/a", "na", "nan"]);

export function isNullish(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "string" && NULLISH_STRINGS.has(v.trim().toLowerCase()));
}

export function toInt(v: unknown): number | null {
  if (isNullish(v)) return null;
  if (typeof v === "number") return Number.isFinite(v) ? Math.trunc(v) : null;
  if (typeof v === "string") {
    const m = v.match(/-?\d+/);
    return m ? parseInt(m[0], 10) : null;
  }
  return null;
}

export function toText(v: unknown): string {
  if (isNullish(v)) return "";
  return String(v);
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

/** Decode the handful of HTML entities exports leak into answer text (e.g. "&amp;"). */
export function decodeEntities(s: string): string {
  return s.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (whole, code: string) => {
    const lower = code.toLowerCase();
    if (lower in ENTITIES) return ENTITIES[lower];
    if (lower.startsWith("#x")) return String.fromCodePoint(parseInt(lower.slice(2), 16));
    if (lower.startsWith("#")) return String.fromCodePoint(parseInt(lower.slice(1), 10));
    return whole;
  });
}

/** Citations arrive as arrays, JSON strings ("[]"), "None", objects with url fields, or delimited strings. */
export function toCitations(v: unknown): string[] {
  if (isNullish(v)) return [];
  if (Array.isArray(v)) {
    return v
      .map((item) => {
        if (typeof item === "string") return item.trim();
        if (item && typeof item === "object") {
          const o = item as Record<string, unknown>;
          return toText(o.url ?? o.link ?? o.href ?? o.source).trim();
        }
        return "";
      })
      .filter(Boolean);
  }
  if (typeof v === "string") {
    const s = v.trim();
    if (s.startsWith("[")) {
      try {
        return toCitations(JSON.parse(s));
      } catch {
        /* fall through to delimiter split */
      }
    }
    return s
      .split(/[\s,;|]+/)
      .map((x) => x.trim())
      .filter((x) => /^https?:\/\/|\.[a-z]{2,}/i.test(x));
  }
  return [];
}

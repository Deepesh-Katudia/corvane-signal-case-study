export interface ParsedDate {
  iso: string | null;
  /** Both day-first and month-first readings are valid, e.g. "07/09/2026". */
  ambiguous: boolean;
  alternatives: string[];
}

const SLASH = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;

function build(y: number, mo: number, d: number, h = 0, mi = 0, s = 0): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  if (date.getUTCMonth() !== mo - 1) return null;
  return date.toISOString();
}

export function parseDate(v: unknown): ParsedDate {
  if (v === null || v === undefined || v === "") return { iso: null, ambiguous: false, alternatives: [] };
  if (typeof v === "number") {
    const ms = v > 1e12 ? v : v * 1000;
    return { iso: new Date(ms).toISOString(), ambiguous: false, alternatives: [] };
  }
  const s = String(v).trim();
  const m = s.match(SLASH);
  if (m) {
    const [a, b, y, h, mi, sec] = [m[1], m[2], m[3], m[4], m[5], m[6]].map((x) => (x ? parseInt(x, 10) : 0));
    const dayFirst = build(y, b, a, h, mi, sec);
    const monthFirst = build(y, a, b, h, mi, sec);
    const alternatives = [dayFirst, monthFirst].filter((x): x is string => !!x);
    const unique = [...new Set(alternatives)];
    return { iso: dayFirst ?? monthFirst, ambiguous: unique.length > 1, alternatives: unique };
  }
  const t = Date.parse(s);
  return { iso: Number.isNaN(t) ? null : new Date(t).toISOString(), ambiguous: false, alternatives: [] };
}

/** Pick the reading closest to a reference date (e.g. the date implied by the week number). */
export function resolveAmbiguous(parsed: ParsedDate, referenceMs: number | null): string | null {
  if (!parsed.ambiguous || referenceMs === null) return parsed.iso;
  return parsed.alternatives.reduce((best, cur) =>
    Math.abs(Date.parse(cur) - referenceMs) < Math.abs(Date.parse(best) - referenceMs) ? cur : best,
  );
}

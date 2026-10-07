import { editDistance, fuzzyThreshold, type BrandMatcher } from "./aliases";

export interface Token {
  text: string;
  lower: string;
  start: number;
  end: number;
}

export interface EntitySpan {
  /** Brand key, or `excluded:<brand>` for look-alikes such as "Corvane Logistics". */
  entity: string;
  brand: string | null;
  start: number;
  end: number;
  text: string;
  match: "exact" | "fuzzy" | "excluded";
}

const STOPWORDS = new Set(["the", "and", "for", "but", "with", "you", "are", "its", "our", "has", "was", "not", "can", "all", "any", "one", "per"]);
const TLDS = new Set(["com", "io", "net", "org", "co", "ai", "app", "us", "uk"]);
const MAX_JOIN = 3;

export function tokenizeText(text: string): Token[] {
  return [...text.matchAll(/[A-Za-z0-9]+/g)].map((m) => ({
    text: m[0],
    lower: m[0].toLowerCase(),
    start: m.index!,
    end: m.index! + m[0].length,
  }));
}

/**
 * Tokens i..j may be read as one name ("Route Lyne", "Corvane-Fleet") only when separated by a single
 * space/hyphen and every piece is a capitalised word. This stops "fleet or a" being read as "fleetora".
 */
function joinable(text: string, tokens: Token[], i: number, j: number): boolean {
  for (let k = i + 1; k <= j; k++) {
    const sep = text.slice(tokens[k - 1].end, tokens[k].start);
    if (!/^[ \-]$/.test(sep)) return false;
  }
  return tokens
    .slice(i, j + 1)
    .every((t) => t.lower.length >= 3 && !STOPWORDS.has(t.lower) && /^[A-Z0-9]/.test(t.text));
}

/** Extend a match over a trailing ".com" / ".io" so a website mention highlights as a whole. */
function extendOverDomain(text: string, tokens: Token[], j: number): number {
  const next = tokens[j + 1];
  if (next && TLDS.has(next.lower) && text.slice(tokens[j].end, next.start) === ".") return next.end;
  return tokens[j].end;
}

function matchExclusion(tokens: Token[], i: number, matcher: BrandMatcher): number {
  for (const ex of matcher.exclusions) {
    if (i + ex.length > tokens.length) continue;
    const head = tokens[i].lower;
    const headOk = head === ex[0] || editDistance(head, ex[0], 2) <= fuzzyThreshold(ex[0].length);
    if (headOk && ex.slice(1).every((t, k) => tokens[i + 1 + k].lower === t)) return i + ex.length - 1;
  }
  return -1;
}

interface Candidate {
  brand: string;
  endToken: number;
  match: "exact" | "fuzzy" | "excluded";
}

function bestCandidateAt(text: string, tokens: Token[], i: number, matchers: BrandMatcher[]): Candidate | null {
  for (const m of matchers) {
    const exEnd = matchExclusion(tokens, i, m);
    if (exEnd >= 0) return { brand: m.brand, endToken: exEnd, match: "excluded" };
  }
  let best: Candidate | null = null;
  for (let j = Math.min(tokens.length - 1, i + MAX_JOIN - 1); j >= i; j--) {
    if (j > i && !joinable(text, tokens, i, j)) continue;
    const joined = tokens.slice(i, j + 1).map((t) => t.lower).join("");
    for (const m of matchers) {
      if (m.exact.has(joined)) return { brand: m.brand, endToken: j, match: "exact" };
      if (best || joined.length < 6) continue;
      const hit = m.fuzzyTargets.some(
        (target) => target[0] === joined[0] && editDistance(joined, target) <= fuzzyThreshold(Math.min(target.length, joined.length)),
      );
      if (hit) best = { brand: m.brand, endToken: j, match: "fuzzy" };
    }
  }
  return best;
}

/** Find every brand (and look-alike) reference in answer text, left to right, without overlaps. */
export function findEntitySpans(text: string, matchers: BrandMatcher[]): EntitySpan[] {
  const tokens = tokenizeText(text);
  const spans: EntitySpan[] = [];
  let i = 0;
  while (i < tokens.length) {
    const c = bestCandidateAt(text, tokens, i, matchers);
    if (!c) {
      i++;
      continue;
    }
    const start = tokens[i].start;
    const end = c.match === "excluded" ? tokens[c.endToken].end : extendOverDomain(text, tokens, c.endToken);
    spans.push({
      entity: c.match === "excluded" ? `excluded:${c.brand}` : c.brand,
      brand: c.match === "excluded" ? null : c.brand,
      start,
      end,
      text: text.slice(start, end),
      match: c.match,
    });
    i = c.endToken + 1;
  }
  return spans;
}

/** Position = order in which each brand is first named (1-based). Look-alikes are ignored. */
export function brandPositions(spans: EntitySpan[]): Map<string, number> {
  const order = new Map<string, number>();
  for (const s of spans) {
    if (s.brand && !order.has(s.brand)) order.set(s.brand, order.size + 1);
  }
  return order;
}

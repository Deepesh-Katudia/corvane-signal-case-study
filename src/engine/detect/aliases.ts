import type { BrandConfig } from "../types";
import { coreName } from "../config/brandKeys";

export const squashText = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export interface BrandMatcher {
  brand: string;
  /** Squashed spellings that count as an exact match ("routelyne", "corvanefleet", ...). */
  exact: Set<string>;
  /** Squashed spellings long enough to be safe for fuzzy (misspelling) matching. */
  fuzzyTargets: string[];
  /** Phrases that look like this brand but are a different company, as lowercase token lists. */
  exclusions: string[][];
}

const tokenize = (s: string): string[] => s.toLowerCase().match(/[a-z0-9]+/g) ?? [];

function domainStem(website: string): string {
  const host = website.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  return host.split(".")[0] ?? host;
}

/** Every variant we accept for a brand: full name, short name, website stem and configured extras. */
export function brandVariants(brand: BrandConfig): string[] {
  const base = [brand.name, coreName(brand.name), domainStem(brand.website), ...brand.aliases];
  return [...new Set(base.map(squashText).filter((v) => v.length >= 4))];
}

export function buildMatchers(brands: BrandConfig[]): BrandMatcher[] {
  return brands.map((b) => {
    const variants = brandVariants(b);
    return {
      brand: b.key,
      exact: new Set(variants),
      fuzzyTargets: variants.filter((v) => v.length >= 6),
      exclusions: b.exclusions.map(tokenize).filter((t) => t.length > 0),
    };
  });
}

/** Optimal string alignment distance (Damerau-Levenshtein with adjacent transpositions). */
export function editDistance(a: string, b: string, max = 3): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** Allowed misspelling distance grows with name length so short names stay strict. */
export function fuzzyThreshold(length: number): number {
  if (length >= 10) return 2;
  if (length >= 6) return 1;
  return 0;
}

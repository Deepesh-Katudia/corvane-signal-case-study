import type { ScoringConfig } from "../types";
import { mean, weightedScore, type Cell } from "./visibility";

export type Movement = "real_gain" | "real_drop" | "normal_variation" | "no_baseline";

export interface WeekComparison {
  brand: string;
  week: number;
  previousWeek: number | null;
  /** Scores on the question/engine pairs both weeks have (like-for-like). */
  current: number;
  previous: number | null;
  delta: number | null;
  /** Half-width of the band of changes that run-to-run variation alone produces (95%). */
  noiseBand: number | null;
  pValue: number | null;
  movement: Movement;
  matchedCells: number;
}

/** Small deterministic PRNG so the same data always gives the same verdict. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Merge several weeks into one pseudo-week: each question/engine pair keeps every run from those weeks. */
export function poolCells(cells: Cell[], weeks: number[], asWeek: number): Cell[] {
  const pooled = new Map<string, Cell>();
  for (const c of cells.filter((x) => weeks.includes(x.week))) {
    const prev = pooled.get(c.key);
    const runs = prev
      ? Object.fromEntries(Object.keys(c.runs).map((b) => [b, [...(prev.runs[b] ?? []), ...c.runs[b]]]))
      : { ...c.runs };
    pooled.set(c.key, { ...c, week: asWeek, runs, responseIds: [...(prev?.responseIds ?? []), ...c.responseIds] });
  }
  return [...pooled.values()];
}

export function matchCells(current: Cell[], previous: Cell[]): Array<[Cell, Cell]> {
  const prev = new Map(previous.map((c) => [c.key, c]));
  return current.filter((c) => prev.has(c.key)).map((c) => [c, prev.get(c.key)!]);
}

/**
 * Week-on-week change for one brand, measured only on question/engine pairs present in both weeks
 * (so a missing engine cannot look like a drop). To tell real movement from noise we repeatedly shuffle
 * the two weeks' runs within each pair: if the real change is larger than 95% of shuffled changes,
 * it is real.
 */
export function compareWeeks(brand: string, week: number, current: Cell[], previousWeek: number | null, previous: Cell[], scoring: ScoringConfig, seed = 7): WeekComparison {
  const pairs = matchCells(current, previous);
  const base = { brand, week, previousWeek };
  if (previousWeek === null || !pairs.length) {
    return { ...base, current: weightedScore(current, brand), previous: null, delta: null, noiseBand: null, pValue: null, movement: "no_baseline", matchedCells: 0 };
  }
  const total = pairs.reduce((s, [c]) => s + c.priority, 0);
  const deltaOf = (split: Array<[number[], number[]]>) =>
    split.reduce((s, [cur, prev], i) => s + pairs[i][0].priority * (mean(cur) - mean(prev)), 0) / total;

  const observedSplit = pairs.map(([c, p]) => [c.runs[brand], p.runs[brand]] as [number[], number[]]);
  const observed = deltaOf(observedSplit);
  const rng = mulberry32(seed + week * 101 + brand.length);
  const nulls: number[] = [];
  for (let i = 0; i < scoring.noiseIterations; i++) {
    const shuffled = observedSplit.map(([cur, prev]) => {
      const pool = [...cur, ...prev];
      for (let j = pool.length - 1; j > 0; j--) {
        const k = Math.floor(rng() * (j + 1));
        [pool[j], pool[k]] = [pool[k], pool[j]];
      }
      return [pool.slice(0, cur.length), pool.slice(cur.length)] as [number[], number[]];
    });
    nulls.push(Math.abs(deltaOf(shuffled)));
  }
  nulls.sort((a, b) => a - b);
  const noiseBand = nulls[Math.min(nulls.length - 1, Math.floor(scoring.confidence * nulls.length))];
  const pValue = (nulls.filter((n) => n >= Math.abs(observed) - 1e-9).length + 1) / (nulls.length + 1);
  const significant = pValue < 1 - scoring.confidence && Math.abs(observed) > 0;
  return {
    ...base,
    current: weightedScore(pairs.map(([c]) => c), brand),
    previous: weightedScore(pairs.map(([, p]) => p), brand),
    delta: observed,
    noiseBand,
    pValue,
    movement: significant ? (observed > 0 ? "real_gain" : "real_drop") : "normal_variation",
    matchedCells: pairs.length,
  };
}

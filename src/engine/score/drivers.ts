import { cellValue, type Cell } from "./visibility";
import { matchCells } from "./compare";

export interface CellChange {
  promptId: string;
  engine: string;
  priority: number;
  before: number;
  after: number;
  /** This pair's share of the overall score change, in score points. */
  contribution: number;
}

export interface Taker {
  brand: string;
  /** Points this brand gained on the pairs where the focus brand lost ground. */
  gained: number;
  promptIds: string[];
}

export interface Drivers {
  brand: string;
  changes: CellChange[]; // sorted by absolute contribution, largest first
  byPrompt: Array<{ promptId: string; contribution: number }>;
  byEngine: Array<{ engine: string; contribution: number }>;
  takers: Taker[];
}

function sumBy<T>(items: T[], key: (t: T) => string, val: (t: T) => number): Array<{ key: string; value: number }> {
  const m = new Map<string, number>();
  for (const it of items) m.set(key(it), (m.get(key(it)) ?? 0) + val(it));
  return [...m].map(([k, v]) => ({ key: k, value: v })).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
}

/** Why a brand's score moved: which questions and engines drove it, and who gained where it lost. */
export function explainChange(brand: string, current: Cell[], previous: Cell[], allBrands: string[]): Drivers {
  const pairs = matchCells(current, previous);
  const total = pairs.reduce((s, [c]) => s + c.priority, 0) || 1;
  const changes: CellChange[] = pairs
    .map(([c, p]) => {
      const before = cellValue(p, brand);
      const after = cellValue(c, brand);
      return { promptId: c.promptId, engine: c.engine, priority: c.priority, before, after, contribution: (c.priority * (after - before)) / total };
    })
    .filter((x) => Math.abs(x.contribution) > 1e-9)
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

  const losses = new Set(changes.filter((c) => c.contribution < 0).map((c) => `${c.promptId}|${c.engine}`));
  const takers: Taker[] = allBrands
    .filter((b) => b !== brand)
    .map((other) => {
      const gains = pairs
        .filter(([c]) => losses.has(c.key))
        .map(([c, p]) => ({ promptId: c.promptId, gain: (c.priority * (cellValue(c, other) - cellValue(p, other))) / total }))
        .filter((g) => g.gain > 0);
      return { brand: other, gained: gains.reduce((s, g) => s + g.gain, 0), promptIds: [...new Set(gains.map((g) => g.promptId))] };
    })
    .filter((t) => t.gained > 0)
    .sort((a, b) => b.gained - a.gained);

  return {
    brand,
    changes,
    byPrompt: sumBy(changes, (c) => c.promptId, (c) => c.contribution).map(({ key, value }) => ({ promptId: key, contribution: value })),
    byEngine: sumBy(changes, (c) => c.engine, (c) => c.contribution).map(({ key, value }) => ({ engine: key, contribution: value })),
    takers,
  };
}

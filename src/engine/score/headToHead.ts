import type { AnalyzedResponse } from "../types";
import { cellValue, type Cell } from "./visibility";

export interface CellWinner {
  week: number;
  promptId: string;
  engine: string;
  /** Brands tied for the highest points (empty when nobody scored). */
  winners: string[];
  points: Record<string, number>;
}

export interface Replacement {
  week: number;
  promptId: string;
  engine: string;
  dropped: string;
  /** Brands newly present in this pair (or the new winner if nobody is new). */
  replacedBy: string[];
}

export function cellWinners(cells: Cell[], brands: string[]): CellWinner[] {
  return cells.map((c) => {
    const points = Object.fromEntries(brands.map((b) => [b, cellValue(c, b)]));
    const top = Math.max(...Object.values(points));
    return { week: c.week, promptId: c.promptId, engine: c.engine, winners: top > 0 ? brands.filter((b) => points[b] === top) : [], points };
  });
}

/** For each brand that appeared in a question/engine pair last week but not this week, who appeared instead. */
export function replacements(responses: AnalyzedResponse[], weeks: number[], brands: string[], winners: CellWinner[]): Replacement[] {
  const present = new Map<string, Set<string>>();
  for (const r of responses) {
    if (!r.ok) continue;
    const id = `${r.week}|${r.promptId}|${r.engine}`;
    const set = present.get(id) ?? new Set<string>();
    for (const m of r.mentions) if (m.mentioned) set.add(m.brand);
    present.set(id, set);
  }
  const winnerOf = new Map(winners.map((w) => [`${w.week}|${w.promptId}|${w.engine}`, w.winners]));
  const out: Replacement[] = [];
  for (let i = 1; i < weeks.length; i++) {
    const [prevW, curW] = [weeks[i - 1], weeks[i]];
    for (const [id, cur] of present) {
      const [w, promptId, engine] = id.split("|");
      if (Number(w) !== curW) continue;
      const prev = present.get(`${prevW}|${promptId}|${engine}`);
      if (!prev) continue; // pair missing last week: no comparison, no false "drop"
      const newcomers = brands.filter((b) => cur.has(b) && !prev.has(b));
      for (const dropped of brands.filter((b) => prev.has(b) && !cur.has(b))) {
        out.push({ week: curW, promptId, engine, dropped, replacedBy: newcomers.length ? newcomers : (winnerOf.get(id) ?? []) });
      }
    }
  }
  return out;
}

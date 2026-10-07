import type { AnalyzedResponse, Prompt, ScoringConfig } from "../types";

/** One question asked to one engine in one week; holds every run's points per brand. */
export interface Cell {
  key: string; // `${promptId}|${engine}`
  week: number;
  promptId: string;
  engine: string;
  priority: number;
  /** brand -> points of each run (0-100). */
  runs: Record<string, number[]>;
  responseIds: string[];
}

/**
 * Points one answer gives a brand: recommended 100, neutral 50, negative 25, not recommended or absent 0,
 * scaled by how early the brand is named (1st x1.0, 2nd x0.85, 3rd and later x0.7).
 */
export function answerPoints(r: AnalyzedResponse, brand: string, scoring: ScoringConfig): number {
  const m = r.mentions.find((x) => x.brand === brand);
  if (!m || !m.mentioned || !m.tone || m.position === null) return 0;
  const factors = scoring.positionFactors;
  const factor = factors[Math.min(m.position, factors.length) - 1];
  return scoring.tonePoints[m.tone] * factor;
}

export function buildCells(responses: AnalyzedResponse[], prompts: Prompt[], brands: string[], scoring: ScoringConfig): Cell[] {
  const priority = new Map(prompts.map((p) => [p.id, p.priority]));
  const cells = new Map<string, Cell>();
  for (const r of responses) {
    if (!r.ok) continue;
    const id = `${r.week}|${r.promptId}|${r.engine}`;
    const cell =
      cells.get(id) ??
      ({ key: `${r.promptId}|${r.engine}`, week: r.week, promptId: r.promptId, engine: r.engine, priority: priority.get(r.promptId) ?? 1, runs: Object.fromEntries(brands.map((b) => [b, []])), responseIds: [] } as Cell);
    for (const b of brands) cell.runs[b] = [...cell.runs[b], answerPoints(r, b, scoring)];
    cell.responseIds = [...cell.responseIds, r.responseId];
    cells.set(id, cell);
  }
  return [...cells.values()];
}

export const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export const cellValue = (cell: Cell, brand: string): number => mean(cell.runs[brand] ?? []);

/** Priority-weighted average of cell values: the Visibility Score (0-100). */
export function weightedScore(cells: Cell[], brand: string, value: (c: Cell) => number = (c) => cellValue(c, brand)): number {
  const total = cells.reduce((s, c) => s + c.priority, 0);
  return total ? cells.reduce((s, c) => s + c.priority * value(c), 0) / total : 0;
}

import type { AnalyzedResponse, AppConfig, BrandConfig, FactClaim, IngestIssue, Prompt } from "./types";
import type { Dataset } from "./ingest/loadDataset";
import { analyzeResponse, createContext } from "./analyzeResponse";
import { buildCells, mean, weightedScore, type Cell } from "./score/visibility";
import { compareWeeks, poolCells, type WeekComparison } from "./score/compare";
import { explainChange, type Drivers } from "./score/drivers";
import { cellWinners, replacements, type CellWinner, type Replacement } from "./score/headToHead";
import { sourceStats, type SourceStat } from "./score/sources";

export interface WeekSummary {
  week: number;
  answers: number;
  failed: number;
  engines: string[];
  missingEngines: string[];
  cells: number;
  expectedCells: number;
  coverage: number;
  partial: boolean;
  firstCollected: string | null;
  lastCollected: string | null;
}

export interface BrandWeek {
  brand: string;
  week: number;
  /** Visibility Score on everything collected that week. */
  score: number;
  mentionRate: number;
  recommendRate: number;
  avgPosition: number | null;
  answers: number;
}

export interface AnalysisResult {
  generatedAt: string;
  perspective: string;
  brands: BrandConfig[];
  engines: Array<{ canonical: string; label: string }>;
  prompts: Prompt[];
  weeks: WeekSummary[];
  latestWeek: number | null;
  previousWeek: number | null;
  responses: AnalyzedResponse[];
  brandWeeks: BrandWeek[];
  comparisons: WeekComparison[];
  /** Longer view: the latest weeks pooled against the same number of weeks before them. */
  trend: { recentWeeks: number[]; earlierWeeks: number[]; comparisons: WeekComparison[] } | null;
  /** Why each brand moved between the previous and latest week. */
  drivers: Record<string, Drivers>;
  winners: CellWinner[];
  replacements: Replacement[];
  sources: SourceStat[];
  wrongFacts: FactClaim[];
  unverifiedClaims: FactClaim[];
  issues: IngestIssue[];
  files: string[];
}

function summarizeWeeks(responses: AnalyzedResponse[], cells: Cell[], prompts: Prompt[], config: AppConfig): WeekSummary[] {
  const allEngines = [...new Set(responses.map((r) => r.engine))].sort();
  const promptCount = prompts.length || new Set(responses.map((r) => r.promptId)).size;
  const expected = promptCount * allEngines.length;
  const weeks = [...new Set(responses.map((r) => r.week))].sort((a, b) => a - b);
  return weeks.map((week) => {
    const rs = responses.filter((r) => r.week === week);
    const weekCells = cells.filter((c) => c.week === week);
    const engines = [...new Set(weekCells.map((c) => c.engine))].sort();
    const dates = rs.map((r) => r.collectedAt).filter((d): d is string => !!d).sort();
    const coverage = expected ? weekCells.length / expected : 0;
    const missingEngines = allEngines.filter((e) => !engines.includes(e));
    return {
      week,
      answers: rs.length,
      failed: rs.filter((r) => !r.ok).length,
      engines,
      missingEngines,
      cells: weekCells.length,
      expectedCells: expected,
      coverage,
      partial: coverage < config.scoring.partialWeekCoverage || missingEngines.length > 0,
      firstCollected: dates[0] ?? null,
      lastCollected: dates[dates.length - 1] ?? null,
    };
  });
}

function brandWeekStats(responses: AnalyzedResponse[], cells: Cell[], brand: string, week: number): BrandWeek {
  const rs = responses.filter((r) => r.week === week && r.ok);
  const ms = rs.map((r) => r.mentions.find((m) => m.brand === brand)!).filter(Boolean);
  const mentioned = ms.filter((m) => m.mentioned);
  return {
    brand,
    week,
    score: weightedScore(cells.filter((c) => c.week === week), brand),
    mentionRate: rs.length ? mentioned.length / rs.length : 0,
    recommendRate: rs.length ? mentioned.filter((m) => m.tone === "recommended").length / rs.length : 0,
    avgPosition: mentioned.length ? mean(mentioned.map((m) => m.position!)) : null,
    answers: rs.length,
  };
}

const TREND_WINDOW = 3;

function trendComparisons(cells: Cell[], weekNums: number[], brands: string[], config: AppConfig): AnalysisResult["trend"] {
  const size = Math.min(TREND_WINDOW, Math.floor(weekNums.length / 2));
  if (size < 1) return null;
  const recentWeeks = weekNums.slice(-size);
  const earlierWeeks = weekNums.slice(-2 * size, -size);
  const latest = recentWeeks[recentWeeks.length - 1];
  const earlierEnd = earlierWeeks[earlierWeeks.length - 1];
  const recent = poolCells(cells, recentWeeks, latest);
  const earlier = poolCells(cells, earlierWeeks, earlierEnd);
  return { recentWeeks, earlierWeeks, comparisons: brands.map((b) => compareWeeks(b, latest, recent, earlierEnd, earlier, config.scoring)) };
}

export function runAnalysis(dataset: Dataset, config: AppConfig): AnalysisResult {
  const ctx = createContext(config);
  const responses = dataset.responses.map((r) => analyzeResponse(r, ctx));
  const brandKeys = config.brands.map((b) => b.key);
  const cells = buildCells(responses, dataset.prompts, brandKeys, config.scoring);
  const weeks = summarizeWeeks(responses, cells, dataset.prompts, config);
  const weekNums = weeks.filter((w) => w.cells > 0).map((w) => w.week);
  const cellsOf = (w: number) => cells.filter((c) => c.week === w);

  const comparisons = weekNums.flatMap((w, i) =>
    brandKeys.map((b) => compareWeeks(b, w, cellsOf(w), i > 0 ? weekNums[i - 1] : null, i > 0 ? cellsOf(weekNums[i - 1]) : [], config.scoring)),
  );
  const latestWeek = weekNums[weekNums.length - 1] ?? null;
  const previousWeek = weekNums.length > 1 ? weekNums[weekNums.length - 2] : null;
  const drivers =
    latestWeek !== null && previousWeek !== null
      ? Object.fromEntries(brandKeys.map((b) => [b, explainChange(b, cellsOf(latestWeek), cellsOf(previousWeek), brandKeys)]))
      : {};
  const trend = trendComparisons(cells, weekNums, brandKeys, config);
  const winners = cellWinners(cells, brandKeys);
  const tracked = new Set(config.brands.filter((b) => b.tier !== "other").map((b) => b.key));
  const claims = responses.flatMap((r) => r.claims);

  return {
    generatedAt: new Date().toISOString(),
    perspective: config.perspective,
    brands: config.brands,
    engines: config.engines.map(({ canonical, label }) => ({ canonical, label })),
    prompts: dataset.prompts,
    weeks,
    latestWeek,
    previousWeek,
    responses,
    brandWeeks: weekNums.flatMap((w) => brandKeys.map((b) => brandWeekStats(responses, cells, b, w))),
    comparisons,
    trend,
    drivers,
    winners,
    replacements: replacements(responses, weekNums, brandKeys, winners),
    sources: sourceStats(responses, config.brands),
    wrongFacts: claims.filter((c) => c.verdict === "wrong" && tracked.has(c.brand)),
    unverifiedClaims: claims.filter((c) => c.verdict === "unverified" && tracked.has(c.brand)),
    issues: dataset.issues,
    files: dataset.files,
  };
}

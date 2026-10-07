import type { AnalysisResult } from "../pipeline";
import type { WeekComparison } from "../score/compare";
import { groupAlerts, type FactAlert } from "./alerts";
import { buildActions, type Action } from "./actions";
import { factTopic, listJoin, possessive, questionHref, weekSpan } from "./labels";

export { factLabel, truthText, possessive } from "./labels";
export type { FactAlert } from "./alerts";
export type { Action } from "./actions";

export interface ScoreCard {
  brand: string;
  name: string;
  isFocus: boolean;
  score: number | null;
  weekly: WeekComparison | null;
  trend: WeekComparison | null;
  series: Array<{ week: number; score: number; partial: boolean }>;
}

export interface Movement {
  direction: "up" | "down";
  text: string;
  href: string;
}

export interface ExecLine {
  label: "Visibility" | "Watch" | "This week";
  text: string;
  href?: string;
}

export interface MondayBrief {
  focus: string;
  focusName: string;
  latestWeek: number | null;
  previousWeek: number | null;
  /** One sentence: where we stand, and whether the latest change is confirmed. */
  status: string;
  /** Visibility / Watch / This week. */
  execLines: ExecLine[];
  /** "Latest data: Sep 28–30 · 89 usable answers out of 90 · 3 engines · from week7_answers.xlsx" */
  dataLine: string;
  partialNote: string | null;
  cards: ScoreCard[];
  whyMoved: Movement[];
  /** Which comparison "whyMoved" explains, e.g. "week 7 vs week 6". */
  whyMovedWindow: string | null;
  /** Caveat shown when the change being explained is itself within normal noise. */
  whyMovedNote: string | null;
  takers: Array<{ brand: string; name: string; gained: number; questions: string[] }>;
  alerts: FactAlert[];
  competitorAlerts: FactAlert[];
  actions: Action[];
}

const isReal = (c: WeekComparison | null | undefined): boolean => c?.movement === "real_gain" || c?.movement === "real_drop";

/** "Up 8.9 points since last week, not yet confirmed" — a rise is a rise; the badge says whether it is beyond noise. */
export function changeText(c: WeekComparison | null, period: string): string {
  if (!c || c.delta === null) return `no earlier ${period} to compare`;
  const size = Math.abs(c.delta).toFixed(1);
  const dir = c.delta > 0.05 ? `up ${size} points` : c.delta < -0.05 ? `down ${size} points` : "unchanged";
  if (c.movement === "real_gain" || c.movement === "real_drop") return `${dir} ${period}, a confirmed change`;
  return `${dir} ${period}, within normal variation (not yet confirmed)`;
}

function statusSentence(focusName: string, focusCard: ScoreCard, leader: ScoreCard): string {
  const position = leader.brand === focusCard.brand ? `${focusName} leads this week.` : `${focusName} trails ${leader.name} this week.`;
  const w = focusCard.weekly;
  if (!w || w.delta === null) return position;
  if (w.movement === "real_gain") return `${position} The rise since last week is confirmed.`;
  if (w.movement === "real_drop") return `${position} The fall since last week is confirmed.`;
  if (w.delta > 0.5) return `${position} Improvement is not yet confirmed.`;
  if (w.delta < -0.5) return `${position} The dip is not yet confirmed.`;
  return `${position} No clear change.`;
}

interface Periods {
  /** "weeks 5–7 compared with weeks 2–4" */
  trend: string | null;
  /** "week 7 compared with week 6" */
  weekly: string | null;
}

const signedPts = (d: number) => `${d > 0 ? "+" : "−"}${Math.abs(d).toFixed(1)} points`;

/** Says exactly which periods are compared, so "+5.8 points" is not read as a start-to-end increase. */
function watchLine(focusName: string, focusCard: ScoreCard, cards: ScoreCard[], periods: Periods): ExecLine {
  const t = focusCard.trend;
  if (t?.movement === "real_drop" && t.delta !== null && periods.trend) {
    return { label: "Watch", text: `${possessive(focusName)} longer-term decline (${signedPts(t.delta)}: ${periods.trend}, confirmed).` };
  }
  const risers = cards
    .filter((c) => !c.isFocus)
    .flatMap((c) => [
      c.trend?.movement === "real_gain" && periods.trend ? { c, delta: c.trend.delta ?? 0, what: "longer-term rise", period: periods.trend } : null,
      c.weekly?.movement === "real_gain" && periods.weekly ? { c, delta: c.weekly.delta ?? 0, what: "jump this week", period: periods.weekly } : null,
    ])
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.delta - a.delta);
  if (risers[0]) {
    const r = risers[0];
    return { label: "Watch", text: `${possessive(r.c.name)} ${r.what} (${signedPts(r.delta)}: ${r.period}, confirmed).` };
  }
  if (t?.movement === "real_gain" && t.delta !== null && periods.trend) {
    return { label: "Watch", text: `${possessive(focusName)} longer-term rise (${signedPts(t.delta)}: ${periods.trend}, confirmed): keep doing what works.` };
  }
  return { label: "Watch", text: "Nothing beyond normal variation in recent weeks." };
}

function thisWeekLine(alerts: FactAlert[], actions: Action[]): ExecLine {
  const fresh = alerts.filter((a) => a.thisWeek);
  if (fresh.length) {
    const topics = [...new Set(fresh.map((a) => factTopic(a.factKey)))].slice(0, 3);
    return { label: "This week", text: `Investigate incorrect ${listJoin(topics)} claims (${fresh.reduce((s, a) => s + a.thisWeekCount, 0)} answers).`, href: `/facts#${fresh[0].id}` };
  }
  const top = actions[0];
  return top ? { label: "This week", text: top.title, href: top.evidence.href } : { label: "This week", text: "No new problems found." };
}

function dataLine(result: AnalysisResult, engineName: (e: string) => string): string {
  const w = result.weeks.find((x) => x.week === result.latestWeek);
  if (!w) return "No data loaded yet.";
  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "?");
  return [
    `Latest data: ${fmt(w.firstCollected)}–${fmt(w.lastCollected)}`,
    `${w.answers - w.failed} usable answers out of ${w.answers}`,
    `${w.engines.length} engine${w.engines.length === 1 ? "" : "s"}${w.missingEngines.length ? ` (missing ${w.missingEngines.map(engineName).join(", ")})` : ""}`,
    `from ${w.files.join(", ")}`,
  ].join(" · ");
}

export function buildBrief(result: AnalysisResult, focus = result.perspective): MondayBrief {
  const tracked = result.brands.filter((b) => b.tier !== "other");
  const name = (k: string) => result.brands.find((b) => b.key === k)?.name ?? k;
  const question = (id: string) => result.prompts.find((p) => p.id === id)?.question ?? id;
  const engineName = (e: string) => result.engines.find((x) => x.canonical === e)?.label ?? e;
  const latest = result.latestWeek;
  const partialWeeks = new Set(result.weeks.filter((w) => w.partial).map((w) => w.week));

  const cards: ScoreCard[] = tracked.map((b) => ({
    brand: b.key,
    name: b.name,
    isFocus: b.key === focus,
    score: result.brandWeeks.find((x) => x.brand === b.key && x.week === latest)?.score ?? null,
    weekly: result.comparisons.find((c) => c.brand === b.key && c.week === latest) ?? null,
    trend: result.trend?.comparisons.find((c) => c.brand === b.key) ?? null,
    series: result.brandWeeks.filter((x) => x.brand === b.key).map((x) => ({ week: x.week, score: x.score, partial: partialWeeks.has(x.week) })),
  }));
  const focusCard = cards.find((c) => c.brand === focus)!;
  const leader = [...cards].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];

  const latestSummary = result.weeks.find((w) => w.week === latest);
  const prevSummary = result.weeks.find((w) => w.week === result.previousWeek);
  const partialNote =
    [latestSummary, prevSummary]
      .filter((w) => w?.partial)
      .map((w) => `Week ${w!.week} is incomplete (no ${w!.missingEngines.map(engineName).join(", ") || "full question set"} answers), so changes are measured only on questions and engines collected in both weeks.`)
      .join(" ") || null;

  // Explain the 3-week trend when it is confirmed (a steadier signal); otherwise explain last week's change.
  const useTrend = !!result.trend && isReal(focusCard.trend);
  const drivers = useTrend ? result.trend!.drivers[focus] : result.drivers[focus];
  const confirmed = useTrend || isReal(focusCard.weekly);
  const whyMovedWindow: string | null = useTrend
    ? `weeks ${result.trend!.recentWeeks.join(", ")} vs ${result.trend!.earlierWeeks.join(", ")}`
    : result.previousWeek !== null
      ? `week ${latest} vs week ${result.previousWeek}`
      : null;
  const whyMovedNote = confirmed
    ? null
    : "Overall, last week's change is within normal variation, so these are the biggest swings to watch, not confirmed trends.";
  // The two periods the movement compares, so links open exactly those weeks side by side.
  const compareWeeks: number[] = useTrend
    ? [...result.trend!.earlierWeeks, ...result.trend!.recentWeeks]
    : result.previousWeek !== null && latest !== null
      ? [result.previousWeek, latest]
      : [];
  const whyMoved: Movement[] = (drivers?.changes ?? []).slice(0, 4).map((c) => {
    const lost = c.contribution < 0;
    const gainers = lost ? c.gainers.slice(0, 2).map(name) : [];
    return {
      direction: lost ? "down" : "up",
      text: `${lost ? "Lost" : "Gained"} ground on "${question(c.promptId)}" in ${engineName(c.engine)} (${c.before.toFixed(0)} → ${c.after.toFixed(0)} points)${gainers.length ? `; ${listJoin(gainers)} gained there` : ""}.`,
      href: questionHref(c.promptId, c.engine, compareWeeks),
    };
  });

  const takers = (drivers?.takers ?? []).slice(0, 3).map((t) => ({ brand: t.brand, name: name(t.brand), gained: t.gained, questions: t.promptIds.map(question) }));
  const alerts = groupAlerts(result.wrongFacts.filter((f) => f.brand === focus), result);
  const competitorAlerts = groupAlerts(result.wrongFacts.filter((f) => f.brand !== focus), result);
  const actions = buildActions(result, focus, alerts, competitorAlerts, drivers, confirmed, compareWeeks);

  const visibility: ExecLine = {
    label: "Visibility",
    text: `${focusCard.score?.toFixed(0) ?? "n/a"}/100 · ${changeText(focusCard.weekly, "since last week")}${
      leader.brand !== focus ? ` · ${leader.name} leads at ${leader.score?.toFixed(0)}` : ""
    }.`,
  };

  return {
    focus,
    focusName: name(focus),
    latestWeek: latest,
    previousWeek: result.previousWeek,
    status: statusSentence(name(focus), focusCard, leader),
    execLines: [visibility, watchLine(name(focus), focusCard, cards, {
        trend: result.trend ? `${weekSpan(result.trend.recentWeeks)} compared with ${weekSpan(result.trend.earlierWeeks)}` : null,
        weekly: result.previousWeek !== null ? `week ${latest} compared with week ${result.previousWeek}` : null,
      }), thisWeekLine(alerts, actions)],
    dataLine: dataLine(result, engineName),
    partialNote,
    cards,
    whyMoved,
    whyMovedWindow,
    whyMovedNote,
    takers,
    alerts,
    competitorAlerts,
    actions,
  };
}

import type { AnalysisResult } from "../pipeline";
import type { FactClaim } from "../types";
import type { WeekComparison } from "../score/compare";
import type { Drivers } from "../score/drivers";
import { competitorOnlySources, domainOf, underIndexedSources } from "../score/sources";

export interface ScoreCard {
  brand: string;
  name: string;
  isFocus: boolean;
  score: number | null;
  weekly: WeekComparison | null;
  trend: WeekComparison | null;
  series: Array<{ week: number; score: number; partial: boolean }>;
}

export interface FactAlert {
  brand: string;
  factKey: string;
  claimedValue: string;
  expectedValue: string | null;
  example: string;
  count: number;
  engines: string[];
  weeks: number[];
  newThisWeek: boolean;
  responseIds: string[];
  sources: string[];
}

export interface Action {
  priority: 1 | 2 | 3;
  title: string;
  detail: string;
  kind: "fix_fact" | "win_question" | "get_listed" | "fix_perception" | "sales_brief";
}

export interface MondayBrief {
  focus: string;
  focusName: string;
  latestWeek: number | null;
  previousWeek: number | null;
  headline: string;
  partialNote: string | null;
  cards: ScoreCard[];
  whyMoved: string[];
  /** Which comparison "whyMoved" explains, e.g. "weeks 4-6 vs 1-3". */
  whyMovedWindow: string | null;
  takers: Array<{ brand: string; name: string; gained: number; questions: string[] }>;
  alerts: FactAlert[];
  competitorAlerts: FactAlert[];
  actions: Action[];
}

const FACT_LABELS: Record<string, string> = {
  starting_price_usd: "starting price",
  hq: "headquarters",
  founded: "founding year",
  integrations: "integrations",
  "features.eld_compliance": "ELD compliance",
  "features.dashcams": "dashcams",
  "features.gps_tracking": "GPS tracking",
  "features.fuel_card_integration": "fuel card integration",
  "features.maintenance_alerts": "maintenance alerts",
  "features.driver_app": "driver app",
  "features.payroll": "payroll",
};
export const factLabel = (k: string): string => FACT_LABELS[k] ?? k.replace(/^features\./, "").replace(/_/g, " ");

/** "false" for a feature reads as "it does not offer ELD compliance". */
export function truthText(factKey: string, expected: string | null): string {
  if (expected === null) return "not covered by facts.json";
  if (factKey.startsWith("features.")) return expected === "true" ? `it does offer ${factLabel(factKey)}` : `it does not offer ${factLabel(factKey)}`;
  if (factKey === "integrations") return `its integrations are ${expected}`;
  return expected;
}

const THEMES: Array<[string, RegExp]> = [
  ["slow customer support", /slow customer support|support complaints/i],
  ["outages and slow fixes", /outages|slow fixes/i],
  ["slow setup", /setup .*longer/i],
  ["limited reporting", /reporting is limited/i],
  ["seen as expensive", /expensive/i],
  ["contract terms", /contract terms/i],
  ["billing complaints", /billing complaints/i],
  ["clunky mobile app", /clunky mobile app/i],
];

const fmt = (n: number) => (n > 0 ? `+${n.toFixed(1)}` : n.toFixed(1));

function groupAlerts(claims: FactClaim[], result: AnalysisResult): FactAlert[] {
  const byId = new Map(result.responses.map((r) => [r.responseId, r]));
  const groups = new Map<string, FactClaim[]>();
  for (const c of claims) {
    const k = `${c.brand}|${c.factKey}|${c.claimedValue}`;
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  return [...groups.values()]
    .map((cs) => {
      const rs = cs.map((c) => byId.get(c.responseId)!).filter(Boolean);
      const weeks = [...new Set(rs.map((r) => r.week))].sort((a, b) => a - b);
      return {
        brand: cs[0].brand,
        factKey: cs[0].factKey,
        claimedValue: cs[0].claimedValue,
        expectedValue: cs[0].expectedValue,
        example: cs[cs.length - 1].claimText,
        count: cs.length,
        engines: [...new Set(rs.map((r) => r.engine))],
        weeks,
        newThisWeek: weeks.length === 1 && weeks[0] === result.latestWeek,
        responseIds: cs.map((c) => c.responseId),
        sources: [...new Set(rs.flatMap((r) => r.citations.map(domainOf).filter((d): d is string => !!d)))],
      };
    })
    .sort((a, b) => Number(b.weeks.includes(result.latestWeek ?? -1)) - Number(a.weeks.includes(result.latestWeek ?? -1)) || b.count - a.count);
}

function movementWords(c: WeekComparison | null): string {
  if (!c || c.delta === null) return "no comparison yet";
  if (c.movement === "real_gain") return `a real gain of ${fmt(c.delta)}`;
  if (c.movement === "real_drop") return `a real drop of ${fmt(c.delta)}`;
  return `${fmt(c.delta)}, within normal week-to-week variation (±${(c.noiseBand ?? 0).toFixed(0)})`;
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
  const bestTrend = [...cards].filter((c) => c.trend?.movement === "real_gain").sort((a, b) => (b.trend?.delta ?? 0) - (a.trend?.delta ?? 0))[0];

  const winning = focusCard.trend?.movement === "real_gain" || (leader?.brand === focus && focusCard.trend?.movement !== "real_drop");
  const losing = focusCard.trend?.movement === "real_drop";
  const headline = [
    `${name(focus)} ${losing ? "is losing ground" : winning ? "is winning" : "is holding steady"} in AI answers.`,
    `Score ${focusCard.score?.toFixed(0) ?? "n/a"}/100 in week ${latest}${leader && leader.brand !== focus ? ` (leader: ${leader.name} at ${leader.score?.toFixed(0)})` : " (top of the tracked group)"}.`,
    result.trend ? `Over weeks ${result.trend.recentWeeks.join("-")} vs ${result.trend.earlierWeeks.join("-")}: ${movementWords(focusCard.trend)}.` : "",
    bestTrend && bestTrend.brand !== focus ? `${bestTrend.name} is the one gaining (${movementWords(bestTrend.trend)}).` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const latestSummary = result.weeks.find((w) => w.week === latest);
  const prevSummary = result.weeks.find((w) => w.week === result.previousWeek);
  const partialNote = [latestSummary, prevSummary]
    .filter((w) => w?.partial)
    .map((w) => `Week ${w!.week} is incomplete (no ${w!.missingEngines.map(engineName).join(", ") || "full question set"} answers), so changes are measured only on questions and engines collected in both weeks.`)
    .join(" ") || null;

  // Explain the 3-week trend when it is real (a steadier signal); otherwise explain last week's change.
  const useTrend = !!result.trend && focusCard.trend?.movement !== "normal_variation" && focusCard.trend?.movement !== "no_baseline";
  const drivers = useTrend ? result.trend!.drivers[focus] : result.drivers[focus];
  const whyMovedWindow = useTrend
    ? `weeks ${result.trend!.recentWeeks.join(", ")} vs ${result.trend!.earlierWeeks.join(", ")}`
    : result.previousWeek !== null
      ? `week ${latest} vs week ${result.previousWeek}`
      : null;
  const whyMoved = drivers
    ? drivers.changes.slice(0, 4).map((c) => {
        const dir = c.contribution < 0 ? "lost" : "gained";
        const takers = c.contribution < 0 ? c.gainers : [];
        return `${dir === "lost" ? "Lost" : "Gained"} ground on "${question(c.promptId)}" in ${engineName(c.engine)} (${c.before.toFixed(0)} → ${c.after.toFixed(0)} points)${takers.length ? `; ${takers.slice(0, 2).map((t) => name(t)).join(" and ")} gained there` : ""}.`;
      })
    : [];

  const takers = (drivers?.takers ?? []).slice(0, 3).map((t) => ({ brand: t.brand, name: name(t.brand), gained: t.gained, questions: t.promptIds.map(question) }));
  const alerts = groupAlerts(result.wrongFacts.filter((f) => f.brand === focus), result);
  const competitorAlerts = groupAlerts(result.wrongFacts.filter((f) => f.brand !== focus), result);

  return {
    focus,
    focusName: name(focus),
    latestWeek: latest,
    previousWeek: result.previousWeek,
    headline,
    partialNote,
    cards,
    whyMoved,
    whyMovedWindow,
    takers,
    alerts,
    competitorAlerts,
    actions: buildActions(result, focus, alerts, competitorAlerts, drivers),
  };
}

function buildActions(result: AnalysisResult, focus: string, alerts: FactAlert[], competitorAlerts: FactAlert[], drivers: Drivers | undefined): Action[] {
  const name = (k: string) => result.brands.find((b) => b.key === k)?.name ?? k;
  const website = result.brands.find((b) => b.key === focus)?.website ?? "your website";
  const engineName = (e: string) => result.engines.find((x) => x.canonical === e)?.label ?? e;
  const actions: Action[] = [];

  for (const a of alerts.slice(0, 2)) {
    const outreachKinds = new Set(["review_site", "media", "forum"]);
    const thirdParty = a.sources.filter((d) => outreachKinds.has(result.sources.find((s) => s.domain === d)?.kind ?? "")).slice(0, 2);
    actions.push({
      priority: 1,
      kind: "fix_fact",
      title: `Correct the ${factLabel(a.factKey)} claim (${a.count} answer${a.count > 1 ? "s" : ""})`,
      detail: `AI says "${a.example}" but in fact ${truthText(a.factKey, a.expectedValue)}. Seen on ${a.engines.map(engineName).join(", ")}. Make the correct ${factLabel(a.factKey)} explicit on ${website} (About/Pricing page and structured data)${thirdParty.length ? ` and ask ${thirdParty.join(", ")} to update their listing` : ""}. Brief sales so they can correct it in calls.`,
    });
  }

  const worst = drivers?.changes.find((c) => c.contribution < 0);
  if (worst) {
    const q = result.prompts.find((p) => p.id === worst.promptId)?.question ?? worst.promptId;
    const taker = worst.gainers[0];
    actions.push({
      priority: 2,
      kind: "win_question",
      title: `Win back "${q}"`,
      detail: `Your points on this question in ${engineName(worst.engine)} fell from ${worst.before.toFixed(0)} to ${worst.after.toFixed(0)}${taker ? ` while ${name(taker)} gained` : ""}. Publish a page that answers this question directly (comparison table, pricing, who it's for) so AI engines have something to quote.`,
    });
  }

  const recentWeeks = result.weeks.map((w) => w.week).slice(-3);
  const gaps = result.prompts
    .filter((p) => p.priority >= 3)
    .map((p) => {
      const rs = result.responses.filter((r) => r.ok && r.promptId === p.id && recentWeeks.includes(r.week));
      const rate = rs.length ? rs.filter((r) => r.mentions.find((m) => m.brand === focus)?.mentioned).length / rs.length : 0;
      return { p, rate };
    })
    .filter((g) => g.rate < 0.34)
    .sort((a, b) => a.rate - b.rate);
  if (gaps[0]) {
    actions.push({
      priority: 2,
      kind: "win_question",
      title: `Get into answers for "${gaps[0].p.question}"`,
      detail: `A top-priority buyer question where ${name(focus)} appears in only ${(gaps[0].rate * 100).toFixed(0)}% of recent answers.`,
    });
  }

  const competitors = result.brands.filter((b) => b.tier === "tracked" && b.key !== focus).map((b) => b.key);
  const outreach = competitorOnlySources(result.sources, focus, competitors).filter((s) => s.kind !== "government").slice(0, 3);
  const underIndexed = underIndexedSources(result.sources, focus, competitors).filter((g) => g.kind !== "government" && g.gap >= 0.1).slice(0, 2);
  if (outreach.length) {
    actions.push({
      priority: 2,
      kind: "get_listed",
      title: `Get covered by ${outreach.map((s) => s.domain).join(", ")}`,
      detail: `AI engines cite these sites in answers that name competitors but never ${name(focus)}. A review, listing or guest guide there gives the engines a reason to include you.`,
    });
  } else if (underIndexed.length) {
    actions.push({
      priority: 3,
      kind: "get_listed",
      title: `Strengthen your presence on ${underIndexed.map((g) => g.domain).join(" and ")}`,
      detail: underIndexed
        .map((g) => `Answers citing ${g.domain} name ${name(g.leader)} ${(g.leaderRate * 100).toFixed(0)}% of the time vs ${name(focus)} ${(g.focusRate * 100).toFixed(0)}%.`)
        .join(" ") + " Fresh reviews and an up-to-date profile there feed what the engines repeat.",
    });
  }

  const evidence = result.responses.flatMap((r) => r.mentions.filter((m) => m.brand === focus && m.tone === "negative" && m.toneEvidence).map((m) => m.toneEvidence!));
  const themes = THEMES.map(([label, re]) => ({ label, n: evidence.filter((e) => re.test(e)).length })).filter((t) => t.n > 0).sort((a, b) => b.n - a.n);
  if (themes[0]) {
    actions.push({
      priority: 3,
      kind: "fix_perception",
      title: `Counter the "${themes[0].label}" story`,
      detail: `AI answers repeat it ${themes[0].n} times when describing ${name(focus)} negatively. Publish recent evidence (support response times, customer quotes) and push fresh reviews on the sites engines cite.`,
    });
  }

  const comp = competitorAlerts[0];
  if (comp) {
    actions.push({
      priority: 3,
      kind: "sales_brief",
      title: `Brief sales: AI gets ${name(comp.brand)}'s ${factLabel(comp.factKey)} wrong`,
      detail: `${comp.count} answers say "${comp.example}" (in fact ${truthText(comp.factKey, comp.expectedValue)}). Useful when prospects compare you.`,
    });
  }
  return actions.sort((a, b) => a.priority - b.priority).slice(0, 5);
}

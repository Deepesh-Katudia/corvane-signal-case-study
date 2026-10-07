import type { AnalysisResult } from "../pipeline";
import type { Drivers } from "../score/drivers";
import { competitorOnlySources, underIndexedSources } from "../score/sources";
import type { FactAlert } from "./alerts";
import { factLabel, possessive, questionHref, truthText } from "./labels";

export type Priority = "High" | "Medium" | "Low";

/** Scannable in three lines: problem (title) → next step → evidence; `why` is the expandable detail. */
export interface Action {
  priority: Priority;
  /** The problem, in a few words. */
  title: string;
  /** The single next step. */
  next: string;
  /** Longer explanation, shown on demand. */
  why: string;
  /** Who would normally own this at Corvane. */
  owner: string;
  evidence: { label: string; href: string };
  kind: "fix_fact" | "win_question" | "watch_question" | "get_listed" | "fix_perception" | "sales_brief";
}

const PRIORITY_RANK: Record<Priority, number> = { High: 0, Medium: 1, Low: 2 };
const OUTREACH_KINDS = new Set(["review_site", "media", "forum"]);

const THEMES: Array<[string, RegExp, string]> = [
  ["slow customer support", /slow customer support|support complaints/i, "Publish current support response times and customer quotes about support."],
  ["outages and slow fixes", /outages|slow fixes/i, "Publish an uptime/status page and recent reliability figures."],
  ["slow setup", /setup .*longer/i, "Publish a typical onboarding timeline with a customer example."],
  ["limited reporting", /reporting is limited/i, "Show the reporting features on the website with a sample report."],
  ["seen as expensive", /expensive/i, "Make the starting price and what it includes easy to find."],
  ["contract terms", /contract terms/i, "State contract terms plainly on the pricing page."],
  ["billing complaints", /billing complaints/i, "Explain billing clearly on the pricing page."],
  ["clunky mobile app", /clunky mobile app/i, "Show recent driver-app updates and app-store ratings."],
];

interface Ctx {
  result: AnalysisResult;
  focus: string;
  name: (k: string) => string;
  engineName: (e: string) => string;
}

function factActions(ctx: Ctx, alerts: FactAlert[]): Action[] {
  const website = ctx.result.brands.find((b) => b.key === ctx.focus)?.website ?? "your website";
  return alerts.slice(0, 2).map((a) => {
    const cited = a.sources.filter((d) => OUTREACH_KINDS.has(ctx.result.sources.find((s) => s.domain === d)?.kind ?? "")).slice(0, 2);
    const impact =
      a.impact === "high"
        ? "Business impact: high. A wrong price or a missing feature can knock you off a shortlist."
        : a.impact === "medium"
          ? "Business impact: medium."
          : "Business impact: lower, mostly a credibility issue.";
    const when = a.thisWeek ? `${a.thisWeekCount} answer${a.thisWeekCount === 1 ? "" : "s"} this week` : `last seen week ${a.lastSeenWeek}`;
    return {
      priority: a.impact === "high" ? "High" : a.thisWeek ? "Medium" : "Low",
      kind: "fix_fact",
      owner: "Marketing (website) + Sales",
      title: `Wrong ${factLabel(a.factKey)}: "${a.claimedValue}" (${when})`,
      next: `State the correct ${factLabel(a.factKey)} plainly on ${website}${cited.length ? ", then check the pages the answers cited" : ""}.`,
      why: `AI says "${a.example}" but in fact ${truthText(a.factKey, a.expectedValue)}. ${impact}${
        cited.length ? ` The answers cited ${cited.join(", ")}; check those pages, and if their information is wrong, request a correction.` : ""
      } Add structured data (About/Pricing) so engines can read the fact, and brief sales so they can answer it in calls.`,
      evidence: { label: `See the ${a.count} answer${a.count === 1 ? "" : "s"}`, href: `/facts#${a.id}` },
    };
  });
}

/** Lost ground on a question: "win back" only when the movement is confirmed; otherwise "watch". */
function questionAction(ctx: Ctx, drivers: Drivers | undefined, confirmed: boolean, compareWeeks: number[]): Action | null {
  const worst = drivers?.changes.find((c) => c.contribution < 0);
  if (!worst) return null;
  const q = ctx.result.prompts.find((p) => p.id === worst.promptId)?.question ?? worst.promptId;
  const taker = worst.gainers[0];
  const where = `${ctx.engineName(worst.engine)}: ${worst.before.toFixed(0)} → ${worst.after.toFixed(0)} points${taker ? `, ${ctx.name(taker)} gained there` : ""}`;
  const periods = compareWeeks.length === 2 ? `week ${compareWeeks[0]} and week ${compareWeeks[1]}` : "the compared weeks";
  const evidence = { label: `Compare ${periods} side by side`, href: questionHref(worst.promptId, worst.engine, compareWeeks) };
  if (confirmed) {
    return {
      priority: "Medium",
      kind: "win_question",
      owner: "Content marketing",
      title: `Lost ground on "${q}" (${where})`,
      next: "Publish a page that answers this question directly.",
      why: "Part of a confirmed decline. A page with a comparison table, pricing and who it's for gives AI engines something to quote.",
      evidence,
    };
  }
  return {
    priority: "Low",
    kind: "watch_question",
    owner: "Marketing",
    title: `Watch "${q}" (${where})`,
    next: "Check whether this drop repeats next week.",
    why: "This is the biggest single drop this week, but the overall change is not yet confirmed, so it may be normal variation. If it repeats, publish a page that answers this question directly.",
    evidence,
  };
}

function coverageGapAction(ctx: Ctx): Action | null {
  const recentWeeks = ctx.result.weeks.map((w) => w.week).slice(-3);
  const gaps = ctx.result.prompts
    .filter((p) => p.priority >= 3)
    .map((p) => {
      const rs = ctx.result.responses.filter((r) => r.ok && r.promptId === p.id && recentWeeks.includes(r.week));
      return { p, rate: rs.length ? rs.filter((r) => r.mentions.find((m) => m.brand === ctx.focus)?.mentioned).length / rs.length : 0 };
    })
    .filter((g) => g.rate < 0.34)
    .sort((a, b) => a.rate - b.rate);
  const g = gaps[0];
  if (!g) return null;
  return {
    priority: "Medium",
    kind: "win_question",
    owner: "Content marketing",
    title: `Rarely mentioned for "${g.p.question}" (${(g.rate * 100).toFixed(0)}% of answers)`,
    next: "Publish content that answers this question directly.",
    why: `A top-priority buyer question where ${ctx.name(ctx.focus)} appears in only ${(g.rate * 100).toFixed(0)}% of answers over the last 3 weeks.`,
    evidence: { label: "See these answers", href: questionHref(g.p.id, undefined, recentWeeks) },
  };
}

function sourcesAction(ctx: Ctx): Action | null {
  const competitors = ctx.result.brands.filter((b) => b.tier === "tracked" && b.key !== ctx.focus).map((b) => b.key);
  const never = competitorOnlySources(ctx.result.sources, ctx.focus, competitors).filter((s) => s.kind !== "government").slice(0, 3);
  const evidence = { label: "See which sites the answers cite", href: "/sources" };
  if (never.length) {
    return {
      priority: "Medium",
      kind: "get_listed",
      owner: "Marketing (reviews & PR)",
      title: `Answers citing ${never.map((s) => s.domain).join(", ")} never mention ${ctx.name(ctx.focus)}`,
      next: "Check whether these sites cover you; if not, seek a review or listing.",
      why: "These sites are cited in answers that mention competitors but never you. That does not prove the sites favour competitors, but being covered there gives engines more to draw on.",
      evidence,
    };
  }
  const under = underIndexedSources(ctx.result.sources, ctx.focus, competitors).filter((g) => g.kind !== "government" && g.gap >= 0.1).slice(0, 2);
  if (!under.length) return null;
  return {
    priority: "Low",
    kind: "get_listed",
    owner: "Marketing (reviews & PR)",
    title: `Less often mentioned in answers citing ${under.map((g) => g.domain).join(" and ")}`,
    next: `Check your profile and recent reviews on ${under[0].domain}.`,
    why: `${under
      .map((g) => `Answers citing ${g.domain} mention ${ctx.name(g.leader)} ${(g.leaderRate * 100).toFixed(0)}% of the time vs ${ctx.name(ctx.focus)} ${(g.focusRate * 100).toFixed(0)}%.`)
      .join(" ")} This shows who appears next to the citation, not what the site itself says.`,
    evidence,
  };
}

function perceptionAction(ctx: Ctx): Action | null {
  const evidence = ctx.result.responses.flatMap((r) => r.mentions.filter((m) => m.brand === ctx.focus && m.tone === "negative" && m.toneEvidence).map((m) => m.toneEvidence!));
  const themes = THEMES.map(([label, re, advice]) => ({ label, advice, n: evidence.filter((e) => re.test(e)).length }))
    .filter((t) => t.n > 0)
    .sort((a, b) => b.n - a.n);
  const t = themes[0];
  if (!t) return null;
  return {
    priority: "Low",
    kind: "fix_perception",
    owner: "Customer success + Marketing",
    title: `Recurring criticism: "${t.label}" (${t.n} answers, all weeks)`,
    next: t.advice,
    why: `AI answers repeat this when describing ${ctx.name(ctx.focus)} negatively. Publishing current evidence, then encouraging fresh reviews on the sites the answers cite, gives engines a newer picture to pick up.`,
    evidence: { label: "See answers mentioning you", href: `/questions?week=all&company=${ctx.focus}` },
  };
}

function salesAction(ctx: Ctx, competitorAlerts: FactAlert[]): Action | null {
  const c = competitorAlerts[0];
  if (!c) return null;
  return {
    priority: "Low",
    kind: "sales_brief",
    owner: "Sales",
    title: `AI gets ${possessive(ctx.name(c.brand))} ${factLabel(c.factKey)} wrong (${c.count} answers)`,
    next: "Add the correct figure to the sales battlecard.",
    why: `Answers say "${c.example}" but in fact ${truthText(c.factKey, c.expectedValue)}. Useful when prospects compare you.`,
    evidence: { label: "See competitor errors", href: `/facts#${c.id}` },
  };
}

/**
 * Up to five actions, most important first. `confirmed` = the movement being explained is real, not
 * noise; `compareWeeks` = the periods behind it, so evidence links open exactly those weeks.
 */
export function buildActions(
  result: AnalysisResult,
  focus: string,
  alerts: FactAlert[],
  competitorAlerts: FactAlert[],
  drivers: Drivers | undefined,
  confirmed: boolean,
  compareWeeks: number[] = [],
): Action[] {
  const ctx: Ctx = {
    result,
    focus,
    name: (k) => result.brands.find((b) => b.key === k)?.name ?? k,
    engineName: (e) => result.engines.find((x) => x.canonical === e)?.label ?? e,
  };
  const all = [
    ...factActions(ctx, alerts),
    questionAction(ctx, drivers, confirmed, compareWeeks),
    coverageGapAction(ctx),
    sourcesAction(ctx),
    perceptionAction(ctx),
    salesAction(ctx, competitorAlerts),
  ].filter((a): a is Action => a !== null);
  return all.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]).slice(0, 5);
}

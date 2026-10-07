import type { AnalysisResult } from "../pipeline";
import type { Drivers } from "../score/drivers";
import { competitorOnlySources, underIndexedSources } from "../score/sources";
import type { FactAlert } from "./alerts";
import { factLabel, possessive, questionHref, truthText } from "./labels";

export type Priority = "High" | "Medium" | "Low";

export interface Action {
  priority: Priority;
  title: string;
  detail: string;
  /** Who would normally own this at Corvane. */
  owner: string;
  evidence: { label: string; href: string };
  kind: "fix_fact" | "win_question" | "watch_question" | "get_listed" | "fix_perception" | "sales_brief";
}

const PRIORITY_RANK: Record<Priority, number> = { High: 0, Medium: 1, Low: 2 };
const OUTREACH_KINDS = new Set(["review_site", "media", "forum"]);

const THEMES: Array<[string, RegExp, string]> = [
  ["slow customer support", /slow customer support|support complaints/i, "Publish current support response times and recent customer quotes about support."],
  ["outages and slow fixes", /outages|slow fixes/i, "Publish an uptime/status page and recent reliability figures."],
  ["slow setup", /setup .*longer/i, "Publish a typical onboarding timeline (e.g. 'live in N days') with a customer example."],
  ["limited reporting", /reporting is limited/i, "Show the reporting features on the website with screenshots and a sample report."],
  ["seen as expensive", /expensive/i, "Make the starting price and what it includes easy to find."],
  ["contract terms", /contract terms/i, "State contract terms plainly (length, cancellation) on the pricing page."],
  ["billing complaints", /billing complaints/i, "Explain billing clearly on the pricing page and address recent billing reviews."],
  ["clunky mobile app", /clunky mobile app/i, "Show recent app updates and app-store ratings for the driver app."],
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
    const when = a.thisWeek ? `${a.thisWeekCount} answer${a.thisWeekCount === 1 ? "" : "s"} this week` : `${a.count} answers, last seen week ${a.lastSeenWeek}`;
    return {
      priority: a.impact === "high" ? "High" : a.thisWeek ? "Medium" : "Low",
      kind: "fix_fact",
      owner: "Marketing (website) + Sales",
      title: `Correct the ${factLabel(a.factKey)} claim (${when})`,
      detail: `AI says "${a.example}" but in fact ${truthText(a.factKey, a.expectedValue)}. ${impact} State the correct ${factLabel(a.factKey)} plainly on ${website} (About/Pricing page and structured data).${
        cited.length ? ` Check the pages these answers cited (${cited.join(", ")}); if their information is wrong, request a correction.` : ""
      } Brief sales so they can answer it in calls.`,
      evidence: { label: `See the ${a.count} answer${a.count === 1 ? "" : "s"}`, href: `/facts#${a.id}` },
    };
  });
}

/** Lost ground on a question: "win back" only when the movement is confirmed; otherwise "watch". */
function questionAction(ctx: Ctx, drivers: Drivers | undefined, confirmed: boolean): Action | null {
  const worst = drivers?.changes.find((c) => c.contribution < 0);
  if (!worst) return null;
  const q = ctx.result.prompts.find((p) => p.id === worst.promptId)?.question ?? worst.promptId;
  const taker = worst.gainers[0];
  const where = `in ${ctx.engineName(worst.engine)} (${worst.before.toFixed(0)} → ${worst.after.toFixed(0)} points${taker ? `; ${ctx.name(taker)} gained there` : ""})`;
  const evidence = { label: "Compare the answers week by week", href: questionHref(worst.promptId, worst.engine) };
  if (confirmed) {
    return {
      priority: "Medium",
      kind: "win_question",
      owner: "Content marketing",
      title: `Win back "${q}"`,
      detail: `Part of a confirmed decline ${where}. Publish a page that answers this question directly (comparison table, pricing, who it's for) so AI engines have something to quote.`,
      evidence,
    };
  }
  return {
    priority: "Low",
    kind: "watch_question",
    owner: "Marketing",
    title: `Watch "${q}"`,
    detail: `The biggest drop this week ${where}, but the overall change is not yet confirmed. Check whether it repeats next week; if it does, publish a page that answers this question directly.`,
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
    title: `Get into answers for "${g.p.question}"`,
    detail: `A top-priority buyer question where ${ctx.name(ctx.focus)} appears in only ${(g.rate * 100).toFixed(0)}% of answers over the last 3 weeks.`,
    evidence: { label: "See these answers", href: questionHref(g.p.id) },
  };
}

function sourcesAction(ctx: Ctx): Action | null {
  const competitors = ctx.result.brands.filter((b) => b.tier === "tracked" && b.key !== ctx.focus).map((b) => b.key);
  const never = competitorOnlySources(ctx.result.sources, ctx.focus, competitors).filter((s) => s.kind !== "government").slice(0, 3);
  const evidence = { label: "See which sites engines cite", href: "/sources" };
  if (never.length) {
    return {
      priority: "Medium",
      kind: "get_listed",
      owner: "Marketing (reviews & PR)",
      title: `Get covered by ${never.map((s) => s.domain).join(", ")}`,
      detail: `AI engines cite these sites in answers that name competitors but never ${ctx.name(ctx.focus)}. A review, listing or guest guide there gives the engines a reason to include you.`,
      evidence,
    };
  }
  const under = underIndexedSources(ctx.result.sources, ctx.focus, competitors).filter((g) => g.kind !== "government" && g.gap >= 0.1).slice(0, 2);
  if (!under.length) return null;
  return {
    priority: "Low",
    kind: "get_listed",
    owner: "Marketing (reviews & PR)",
    title: `Strengthen your presence on ${under.map((g) => g.domain).join(" and ")}`,
    detail: `${under
      .map((g) => `Answers citing ${g.domain} name ${ctx.name(g.leader)} ${(g.leaderRate * 100).toFixed(0)}% of the time vs ${ctx.name(ctx.focus)} ${(g.focusRate * 100).toFixed(0)}%.`)
      .join(" ")} Fresh reviews and an up-to-date profile there feed what the engines repeat.`,
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
    title: `Counter the "${t.label}" story`,
    detail: `AI answers repeat it ${t.n} times when describing ${ctx.name(ctx.focus)} negatively. ${t.advice} Then encourage fresh reviews on the sites the engines cite, so the newer picture gets picked up.`,
    evidence: { label: "See critical answers", href: `/questions?week=all&company=${ctx.focus}` },
  };
}

function salesAction(ctx: Ctx, competitorAlerts: FactAlert[]): Action | null {
  const c = competitorAlerts[0];
  if (!c) return null;
  return {
    priority: "Low",
    kind: "sales_brief",
    owner: "Sales",
    title: `Brief sales: AI gets ${possessive(ctx.name(c.brand))} ${factLabel(c.factKey)} wrong`,
    detail: `${c.count} answers say "${c.example}" (in fact ${truthText(c.factKey, c.expectedValue)}). Useful when prospects compare you.`,
    evidence: { label: "See competitor errors", href: `/facts#${c.id}` },
  };
}

/** Up to five actions, most important first. `confirmed` = the movement being explained is real, not noise. */
export function buildActions(
  result: AnalysisResult,
  focus: string,
  alerts: FactAlert[],
  competitorAlerts: FactAlert[],
  drivers: Drivers | undefined,
  confirmed: boolean,
): Action[] {
  const ctx: Ctx = {
    result,
    focus,
    name: (k) => result.brands.find((b) => b.key === k)?.name ?? k,
    engineName: (e) => result.engines.find((x) => x.canonical === e)?.label ?? e,
  };
  const all = [
    ...factActions(ctx, alerts),
    questionAction(ctx, drivers, confirmed),
    coverageGapAction(ctx),
    sourcesAction(ctx),
    perceptionAction(ctx),
    salesAction(ctx, competitorAlerts),
  ].filter((a): a is Action => a !== null);
  return all.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]).slice(0, 5);
}

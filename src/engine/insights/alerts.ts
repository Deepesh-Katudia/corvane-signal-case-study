import type { AnalysisResult } from "../pipeline";
import type { FactClaim } from "../types";
import { domainOf } from "../score/sources";

export type Impact = "high" | "medium" | "low";

export interface FactAlert {
  /** Stable id, used as the anchor on the Wrong facts page. */
  id: string;
  brand: string;
  factKey: string;
  claimedValue: string;
  expectedValue: string | null;
  example: string;
  count: number;
  engines: string[];
  weeks: number[];
  /** Seen in the latest week. */
  thisWeek: boolean;
  thisWeekCount: number;
  lastSeenWeek: number;
  /** Only ever seen in the latest week. */
  newThisWeek: boolean;
  impact: Impact;
  responseIds: string[];
  sources: string[];
}

/**
 * How much a wrong claim can cost: a wrong price or a missing feature can knock you off a shortlist;
 * a wrong headquarters or founding year is mostly a credibility issue.
 */
export function factImpact(factKey: string, claimedValue: string): Impact {
  if (factKey === "starting_price_usd") return "high";
  if (factKey.startsWith("features.")) return /not have/.test(claimedValue) ? "high" : "medium";
  if (factKey === "integrations") return claimedValue.startsWith("no integration") ? "high" : "medium";
  return "low";
}

const IMPACT_RANK: Record<Impact, number> = { high: 0, medium: 1, low: 2 };

export const alertId = (brand: string, factKey: string, value: string): string =>
  `alert-${brand}-${factKey}-${value}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "");

/** Group identical wrong claims; order: seen this week first, then business impact, then how often. */
export function groupAlerts(claims: FactClaim[], result: AnalysisResult): FactAlert[] {
  const byId = new Map(result.responses.map((r) => [r.responseId, r]));
  const latest = result.latestWeek ?? -1;
  const groups = new Map<string, FactClaim[]>();
  for (const c of claims) {
    const k = `${c.brand}|${c.factKey}|${c.claimedValue}`;
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  return [...groups.values()]
    .map((cs): FactAlert => {
      const rs = cs.map((c) => byId.get(c.responseId)!).filter(Boolean);
      const weeks = [...new Set(rs.map((r) => r.week))].sort((a, b) => a - b);
      const first = cs[0];
      return {
        id: alertId(first.brand, first.factKey, first.claimedValue),
        brand: first.brand,
        factKey: first.factKey,
        claimedValue: first.claimedValue,
        expectedValue: first.expectedValue,
        example: cs[cs.length - 1].claimText,
        count: cs.length,
        engines: [...new Set(rs.map((r) => r.engine))],
        weeks,
        thisWeek: weeks.includes(latest),
        thisWeekCount: rs.filter((r) => r.week === latest).length,
        lastSeenWeek: weeks[weeks.length - 1] ?? 0,
        newThisWeek: weeks.length === 1 && weeks[0] === latest,
        impact: factImpact(first.factKey, first.claimedValue),
        responseIds: cs.map((c) => c.responseId),
        sources: [...new Set(rs.flatMap((r) => r.citations.map(domainOf).filter((d): d is string => !!d)))],
      };
    })
    .sort((a, b) => Number(b.thisWeek) - Number(a.thisWeek) || IMPACT_RANK[a.impact] - IMPACT_RANK[b.impact] || b.lastSeenWeek - a.lastSeenWeek || b.count - a.count);
}

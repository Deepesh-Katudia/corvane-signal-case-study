import type { AnalyzedResponse, BrandConfig } from "../types";

export interface SourceStat {
  domain: string;
  citations: number;
  answers: number;
  /** Answers citing this domain that mention each brand. */
  brandAnswers: Record<string, number>;
  /** Brand whose own website this is, if any. */
  ownedBy: string | null;
  kind: "brand_site" | "review_site" | "forum" | "media" | "government" | "other";
}

const KINDS: Array<[SourceStat["kind"], RegExp]> = [
  ["review_site", /g2\.com|capterra|trustradius|getapp|softwareadvice|trustpilot|gartner/],
  ["forum", /reddit|quora|forum|community|stackexchange/],
  ["government", /\.gov$|fmcsa|dot\.gov/],
  ["media", /fleetowner|ttnews|freightwaves|forbes|techradar|pcmag|news|magazine|blog/],
];

export function domainOf(url: string): string | null {
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return u.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

const siteOf = (website: string) => website.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];

export function sourceStats(responses: AnalyzedResponse[], brands: BrandConfig[]): SourceStat[] {
  const stats = new Map<string, SourceStat>();
  for (const r of responses) {
    if (!r.ok) continue;
    const mentioned = r.mentions.filter((m) => m.mentioned).map((m) => m.brand);
    const domains = r.citations.map(domainOf).filter((d): d is string => !!d);
    for (const d of new Set(domains)) {
      const owner = brands.find((b) => d === siteOf(b.website) || d.endsWith(`.${siteOf(b.website)}`));
      const s =
        stats.get(d) ??
        ({
          domain: d,
          citations: 0,
          answers: 0,
          brandAnswers: Object.fromEntries(brands.map((b) => [b.key, 0])),
          ownedBy: owner?.key ?? null,
          kind: owner ? "brand_site" : (KINDS.find(([, re]) => re.test(d))?.[0] ?? "other"),
        } as SourceStat);
      s.citations += domains.filter((x) => x === d).length;
      s.answers += 1;
      for (const b of mentioned) s.brandAnswers[b] = (s.brandAnswers[b] ?? 0) + 1;
      stats.set(d, s);
    }
  }
  return [...stats.values()].sort((a, b) => b.answers - a.answers);
}

/** Third-party sources that feed answers naming competitors but never the focus brand: outreach targets. */
export function competitorOnlySources(stats: SourceStat[], focus: string, competitors: string[]): SourceStat[] {
  return stats.filter((s) => s.ownedBy === null && (s.brandAnswers[focus] ?? 0) === 0 && competitors.some((c) => (s.brandAnswers[c] ?? 0) > 0));
}

export interface SourceGap {
  domain: string;
  kind: SourceStat["kind"];
  answers: number;
  focusRate: number;
  leader: string;
  leaderRate: number;
  gap: number;
}

/**
 * Third-party sources where a competitor is named noticeably more often than the focus brand:
 * the softer, more useful version of "cites competitors but never us" when no source ignores us outright.
 */
export function underIndexedSources(stats: SourceStat[], focus: string, competitors: string[], minAnswers = 10): SourceGap[] {
  return stats
    .filter((s) => s.ownedBy === null && s.answers >= minAnswers)
    .map((s) => {
      const leader = [...competitors].sort((a, b) => (s.brandAnswers[b] ?? 0) - (s.brandAnswers[a] ?? 0))[0];
      const focusRate = (s.brandAnswers[focus] ?? 0) / s.answers;
      const leaderRate = (s.brandAnswers[leader] ?? 0) / s.answers;
      return { domain: s.domain, kind: s.kind, answers: s.answers, focusRate, leader, leaderRate, gap: leaderRate - focusRate };
    })
    .filter((g) => g.gap > 0)
    .sort((a, b) => b.gap - a.gap);
}

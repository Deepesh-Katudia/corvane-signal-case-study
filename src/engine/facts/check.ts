import type { BrandFacts, FactClaim } from "../types";
import type { AttributedUnit } from "../detect/attribution";
import { entityAt } from "../detect/attribution";
import { extractAllClaims, type RawClaim } from "./extractors";

const STATES: Record<string, string> = {
  al: "alabama", ak: "alaska", az: "arizona", ar: "arkansas", ca: "california", co: "colorado", ct: "connecticut",
  de: "delaware", fl: "florida", ga: "georgia", hi: "hawaii", id: "idaho", il: "illinois", in: "indiana", ia: "iowa",
  ks: "kansas", ky: "kentucky", la: "louisiana", me: "maine", md: "maryland", ma: "massachusetts", mi: "michigan",
  mn: "minnesota", ms: "mississippi", mo: "missouri", mt: "montana", ne: "nebraska", nv: "nevada", nh: "new hampshire",
  nj: "new jersey", nm: "new mexico", ny: "new york", nc: "north carolina", nd: "north dakota", oh: "ohio",
  ok: "oklahoma", or: "oregon", pa: "pennsylvania", ri: "rhode island", sc: "south carolina", sd: "south dakota",
  tn: "tennessee", tx: "texas", ut: "utah", vt: "vermont", va: "virginia", wa: "washington", wv: "west virginia",
  wi: "wisconsin", wy: "wyoming",
};

const placeParts = (s: string): string[] =>
  s.toLowerCase().replace(/\./g, "").split(",").map((p) => p.trim()).filter(Boolean).map((p) => STATES[p] ?? p);

/** "Columbus, Georgia" contradicts "Columbus, Ohio"; "Ohio" or "Columbus" alone does not. */
export function hqConsistent(claimed: string, actual: string): boolean {
  const truth = placeParts(actual);
  const truthWords = new Set(truth.flatMap((p) => p.split(/\s+/)));
  return placeParts(claimed).every((part) => truth.includes(part) || part.split(/\s+/).every((w) => truthWords.has(STATES[w] ?? w)));
}

const MARKET_WIDE = /\b(?:most|many|some|typical(?:ly)?|usually|on average|average|providers|vendors|tools|options|competitors|the market|the industry)\b/i;

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

interface Judgement {
  verdict: FactClaim["verdict"];
  expected: string | null;
}

export function judgeClaim(claim: RawClaim, facts: BrandFacts | undefined): Judgement {
  if (!facts) return { verdict: "unverified", expected: null };
  switch (true) {
    case claim.factKey === "starting_price_usd": {
      if (facts.starting_price_usd === undefined) break;
      const claimed = Number(claim.value);
      const tolerance = claim.approximate ? Math.max(1, facts.starting_price_usd * 0.05) : 0;
      const ok = Math.abs(claimed - facts.starting_price_usd) <= tolerance;
      return { verdict: ok ? "correct" : "wrong", expected: `$${facts.starting_price_usd} ${facts.price_unit ?? ""}`.trim() };
    }
    case claim.factKey === "hq": {
      if (!facts.hq) break;
      return { verdict: hqConsistent(claim.value, facts.hq) ? "correct" : "wrong", expected: facts.hq };
    }
    case claim.factKey === "founded": {
      if (facts.founded === undefined) break;
      return { verdict: Number(claim.value) === facts.founded ? "correct" : "wrong", expected: String(facts.founded) };
    }
    case claim.factKey.startsWith("features."): {
      const feature = claim.factKey.slice("features.".length);
      const actual = facts.features?.[feature];
      if (actual === undefined) break;
      return { verdict: String(actual) === claim.value ? "correct" : "wrong", expected: String(actual) };
    }
    case claim.factKey === "integrations": {
      if (!facts.integrations) break;
      const positive = claim.value.startsWith("+");
      const name = squash(claim.value.slice(1));
      const listed = facts.integrations.some((i) => squash(i) === name);
      return { verdict: positive === listed ? "correct" : "wrong", expected: facts.integrations.join(", ") || "none" };
    }
  }
  return { verdict: "unverified", expected: null };
}

/** The claim sentence as a reader would quote it: no bullets, bold labels or [n] citation markers. */
export function cleanClaimText(text: string): string {
  return text
    .replace(/^\s*(?:[-*•]|\d+\.)\s+/, "")
    .replace(/\*\*[^*]+\*\*:?\s*/g, "")
    .replace(/\s*\[\d+\]/g, "")
    .trim();
}

function displayValue(claim: RawClaim): string {
  if (claim.factKey === "starting_price_usd") return `$${claim.value}`;
  if (claim.factKey === "integrations") return `${claim.value.startsWith("+") ? "integrates with" : "no integration with"} ${claim.value.slice(1)}`;
  if (claim.factKey.startsWith("features.")) return claim.value === "true" ? "has it" : "does not have it";
  return claim.value;
}

/**
 * Every factual claim in an answer about a brand that has a facts.json entry, judged against it.
 * Claims about look-alikes (Corvane Logistics) or brands without facts are ignored.
 */
export function checkFacts(responseId: string, units: AttributedUnit[], facts: Record<string, BrandFacts>): FactClaim[] {
  const out: FactClaim[] = [];
  const seen = new Set<string>();
  for (const unit of units) {
    for (const claim of extractAllClaims(unit.text)) {
      const entity = entityAt(unit, unit.start + claim.at);
      if (!entity || entity.startsWith("excluded:") || !facts[entity]) continue;
      // "Most providers charge $40..." after a company is a market statement, not a claim about that company.
      if (claim.factKey === "starting_price_usd" && unit.spans.length === 0 && MARKET_WIDE.test(unit.text)) continue;
      const { verdict, expected } = judgeClaim(claim, facts[entity]);
      const claimText = cleanClaimText(unit.text);
      const key = `${entity}|${claim.factKey}|${claim.value}|${claimText}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ responseId, brand: entity, factKey: claim.factKey, claimText, claimedValue: displayValue(claim), expectedValue: expected, verdict });
    }
  }
  return out;
}

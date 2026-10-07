/**
 * Pull typed factual claims out of one sentence. Each claim records where it sits in the sentence so
 * it can be attributed to the right company. Extractors are deliberately conservative: a claim is only
 * read when the sentence asserts it (a verb or "is included"), not when it describes the buyer
 * ("for carriers that need ELD compliance").
 */

export interface RawClaim {
  factKey: string;
  /** Normalised claimed value, e.g. "49", "Columbus, Georgia", "false", "QuickBooks". */
  value: string;
  /** Offset of the claim inside the sentence. */
  at: number;
  /** True for approximate wording ("about $30"), which earns a small tolerance. */
  approximate?: boolean;
}

export const FEATURE_PATTERNS: Record<string, RegExp> = {
  gps_tracking: /\bgps(?: tracking)?\b/gi,
  eld_compliance: /\belds?(?: compliance)?\b|\belectronic logging(?: devices?)?\b|\bhours[- ]of[- ]service\b/gi,
  fuel_card_integration: /\bfuel[- ]cards?(?: integrations?)?\b/gi,
  maintenance_alerts: /\bmaintenance (?:alerts?|reminders?|scheduling|tracking)\b/gi,
  driver_app: /\bdriver (?:mobile )?apps?\b/gi,
  dashcams: /\b(?:ai[- ])?dash ?cams?\b|\bdashboard cameras?\b|\bvideo[- ]based safety\b|\bvideo telematics\b/gi,
  payroll: /\bpayroll\b/gi,
};

const CLAUSE_START = /[;:,.!?]|\b(?:but|so|while|whereas)\b/gi;
const ASSERT_BEFORE = /\b(?:also\s+)?(?:handles?|includes?|offers?|supports?|provides?|has|have|comes with|ships with|features|bundles)\b(?:\s+[\w-]+){0,3}\s*$|\bbuilt[- ]in\s*$|\bnative\s*$/i;
const DENY_BEFORE = /\b(?:doesn'?t|does not|don'?t|do not|cannot|can'?t|won'?t|lacks?|without|no longer)\b(?:\s+[\w-]+){0,3}\s*$|\bno\s+(?:[\w-]+\s+){0,1}$/i;
const ASSERT_AFTER = /^\s*(?:is|are)\s+(?:also\s+)?(?:included|built[- ]in|supported|available|standard)\b/i;
const DENY_AFTER = /^\s*(?:is|are)\s+not\s+(?:included|supported|available)\b|^\s*(?:isn'?t|aren'?t)\s+(?:included|supported|available)\b|^\s*(?:is|are)\s+missing\b/i;
/** "software that supports ...", "if you need ..." describe what the buyer wants, not what a vendor has. */
const BUYER_CONTEXT =
  /\b(?:software|tools?|platforms?|apps?|solutions?|ones?|something|providers?|vendors?|options?|fleets?|carriers?|companies|businesses|teams)\s+(?:that|which|who)\b|\bif you\b|\byou(?:'ll|'d)? (?:need|want)\b|\blooking for\b/i;

function clauseBefore(sentence: string, at: number): string {
  const before = sentence.slice(0, at);
  let cut = 0;
  for (const m of before.matchAll(CLAUSE_START)) cut = m.index! + m[0].length;
  return before.slice(cut);
}

/** Items of one list ("GPS tracking, ELD compliance, and dashcams") share the list's verb. */
const LIST_GAP = /^\s*(?:,\s*)?(?:(?:and|or|&|plus)\s+)?(?:built-in\s+|native\s+|ai\s+)?$/i;
const VERB_AT = /\b(?:handles?|includes?|offers?|supports?|provides?|has|have|comes|ships|features|bundles|doesn|does|don|do|cannot|can|won|lacks?|without|no)\b/i;

function directValue(sentence: string, index: number, length: number): boolean | null | "buyer" {
  const before = clauseBefore(sentence, index);
  const after = sentence.slice(index + length);
  let value: boolean | null = null;
  if (DENY_BEFORE.test(before) || DENY_AFTER.test(after)) value = false;
  else if (ASSERT_BEFORE.test(before) || ASSERT_AFTER.test(after)) value = true;
  if (value === null) return null;
  const verbAt = before.search(VERB_AT);
  return verbAt >= 0 && BUYER_CONTEXT.test(before.slice(0, verbAt)) ? "buyer" : value;
}

export function extractFeatureClaims(sentence: string): RawClaim[] {
  const matches = Object.entries(FEATURE_PATTERNS)
    .flatMap(([feature, pattern]) => [...sentence.matchAll(pattern)].map((m) => ({ feature, index: m.index!, end: m.index! + m[0].length })))
    .sort((a, b) => a.index - b.index);
  const claims: RawClaim[] = [];
  const seen = new Set<string>();
  let prev: { end: number; value: boolean | null } | null = null;
  for (const m of matches) {
    const direct = directValue(sentence, m.index, m.end - m.index);
    let value: boolean | null = direct === "buyer" ? null : direct;
    if (value === null && direct !== "buyer" && prev?.value != null && LIST_GAP.test(sentence.slice(prev.end, m.index))) value = prev.value;
    prev = { end: m.end, value };
    if (value === null || seen.has(m.feature)) continue;
    seen.add(m.feature); // one claim per feature per sentence
    claims.push({ factKey: `features.${m.feature}`, value: String(value), at: m.index });
  }
  return claims;
}

const PRICE = /\$\s?(\d{1,4}(?:\.\d{1,2})?)(\s*(?:-|–|to|and)\s*\$?\s?\d+)?/g;
const PRICE_LEAD = /\b(?:start(?:s|ing)?|from|begin(?:s|ning)?|priced|pricing|price|plans?|costs?|charges?|pay|runs?|is|are|at|for|only|just)\b/i;
const PRICE_UNIT =
  /^\s*(?:\/|per|a|each)\s*(?:vehicle|truck|unit|asset|month|mo)\b|^\s*(?:per|a|each)\s+\w+\s+(?:per|a|each)?\s*(?:month|vehicle)|^\s*(?:monthly|a month|per month|\/mo)\b/i;
const APPROX = /\b(?:about|around|roughly|approximately|approx\.?|~|nearly|close to)\s*$/i;

export function extractPriceClaims(sentence: string): RawClaim[] {
  const claims: RawClaim[] = [];
  for (const m of sentence.matchAll(PRICE)) {
    if (m[2]) continue; // a range ("$15 and $60") describes the market, not one vendor's starting price
    const before = sentence.slice(Math.max(0, m.index! - 45), m.index!);
    const after = sentence.slice(m.index! + m[0].length);
    if (/\bbetween\b/i.test(before) || !PRICE_LEAD.test(before) || !PRICE_UNIT.test(after)) continue;
    claims.push({ factKey: "starting_price_usd", value: m[1], at: m.index!, approximate: APPROX.test(before) });
  }
  return claims;
}

const HQ = /\b(?:(?:based|headquartered|located|hq'?d?)\s+(?:in|out of)|(?:[Hh][Qq]|[Hh]eadquarters|[Hh]ead office)\s+(?:is|are)\s+(?:located\s+)?in)\s+((?:[A-Z][a-zA-Z.'-]+)(?:,?\s+(?:[A-Z][a-zA-Z.'-]+)){0,3})/g;

export function extractHqClaims(sentence: string): RawClaim[] {
  return [...sentence.matchAll(HQ)].map((m) => ({ factKey: "hq", value: m[1].replace(/[.,]+$/, ""), at: m.index! }));
}

const FOUNDED = /\b(?:founded|established|started|launched|incorporated)\s+(?:back\s+)?(?:in\s+)?((?:18|19|20)\d{2})\b|\b(?:around|in business|operating|been operating)\s+since\s+((?:18|19|20)\d{2})\b/gi;

export function extractFoundedClaims(sentence: string): RawClaim[] {
  return [...sentence.matchAll(FOUNDED)].map((m) => ({ factKey: "founded", value: m[1] ?? m[2], at: m.index! }));
}

const INTEGRATES = /\bintegrat(?:es|ion|ions|ed)?\s+(?:directly\s+|natively\s+)?(?:with|into|to)\s+([^.;:]+)/gi;
const NO_INTEGRATION = /\b(?:doesn'?t|does not|don'?t|can'?t|cannot|won'?t|no longer)\s+(?:integrate|connect|sync)\s+(?:directly\s+)?(?:with|to|into)\s+([^.;:]+)/gi;
const NAME_STOP = /^(?:the|your|most|many|other|popular|common|existing|major|all|any|and|or|tools?|software|systems?)$/i;

/** "QuickBooks and WEX fuel cards" -> ["QuickBooks", "WEX"]. Only capitalised product names count. */
export function integrationNames(list: string): string[] {
  return list
    .split(/,|\band\b|&|\bor\b|\bplus\b/i)
    .map((piece) => {
      const words = piece.trim().split(/\s+/).filter((w) => /^[A-Z0-9]/.test(w) && !NAME_STOP.test(w));
      return words.join(" ").replace(/[^\w &.-]/g, "").trim();
    })
    .filter((n) => n.length >= 2);
}

export function extractIntegrationClaims(sentence: string): RawClaim[] {
  const claims: RawClaim[] = [];
  const denied = new Set<number>();
  for (const m of sentence.matchAll(NO_INTEGRATION)) {
    denied.add(m.index!);
    for (const name of integrationNames(m[1])) claims.push({ factKey: "integrations", value: `-${name}`, at: m.index! });
  }
  for (const m of sentence.matchAll(INTEGRATES)) {
    const insideDenial = [...denied].some((d) => m.index! > d && m.index! - d < 40);
    if (insideDenial || BUYER_CONTEXT.test(clauseBefore(sentence, m.index!))) continue;
    for (const name of integrationNames(m[1])) claims.push({ factKey: "integrations", value: `+${name}`, at: m.index! });
  }
  return claims;
}

/** Claims facts.json has no entry for. Shown to users as "unverified", never as wrong. */
const UNVERIFIED: Array<[string, RegExp]> = [
  ["rating", /\b\d(?:\.\d)?[- ]star\b|\brated\s+\d(?:\.\d)?\b/i],
  ["support_hours", /\b24\/7\b|\baround the clock\b/i],
  ["popularity", /\bpopular with\b|\bmost popular\b/i],
  ["customer_count", /\b[\d,]{3,}\+?\s+(?:customers|fleets|users|companies)\b/i],
  ["awards", /\baward/i],
];

export function extractUnverifiedClaims(sentence: string): RawClaim[] {
  return UNVERIFIED.flatMap(([key, re]) => {
    const m = sentence.match(re);
    return m ? [{ factKey: key, value: m[0], at: m.index! }] : [];
  });
}

export function extractAllClaims(sentence: string): RawClaim[] {
  return [
    ...extractPriceClaims(sentence),
    ...extractHqClaims(sentence),
    ...extractFoundedClaims(sentence),
    ...extractFeatureClaims(sentence),
    ...extractIntegrationClaims(sentence),
    ...extractUnverifiedClaims(sentence),
  ];
}

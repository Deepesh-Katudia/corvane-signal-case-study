import type { Tone } from "../types";

/**
 * Phrase lists behind each tone. Checked in this order: advising against beats a recommendation,
 * which beats criticism. Built from the brief's definitions and a full read of the six-week data pack.
 */
export const NOT_RECOMMENDED: RegExp[] = [
  // "avoid" only as advice ("Avoid X if...", "I'd avoid it"), not "helps avoid outages"
  /^\s*avoid\b/,
  /\b(?:i'?d|i would|we'?d|you should|should|better to|recommend you) avoid\b/,
  /\bbest avoided\b/,
  /\b(?:don'?t|do not|never|wouldn'?t)\s+(?:go with|pick|choose|use|buy|consider|bother with)\b/,
  /\bsteer clear\b/,
  /\bwouldn'?t (?:choose|recommend|pick|use|go with|buy)\b/,
  /\b(?:would|will|do|does) not (?:choose|recommend|pick|buy|use)\b/,
  /\b(?:don'?t|can'?t) recommend\b/,
  /\bnot (?:the )?right (?:fit|choice|tool|option)\b/,
  /\bisn'?t (?:the )?right (?:fit|choice|tool|option)\b/,
  /\bnot a (?:good|great) (?:fit|choice|option)\b/,
  /\bnot recommended\b/,
  /\bskip (?:it|this|them|at your size)\b/,
  /\bi'?d skip\b/,
  /\boverkill\b/,
  /\bnot for (?:small|most|you|your|fleets|teams)\b/,
  /\brule (?:it|them) out\b/,
  /\bstay away\b/,
  /\bpass on (?:it|this)\b/,
];

export const RECOMMENDED: RegExp[] = [
  /\bbest overall\b/,
  /\bbest (?:option|choice|fit|pick)\b/,
  /\btop (?:pick|suggestion|choice|recommendation)\b/,
  /\bi'?d start with\b/,
  /\bstart your shortlist with\b/,
  /\bsafest (?:choice|bet|option)\b/,
  /\bif i had to pick\b/,
  /\bthe one i'?d (?:pick|choose|go with)\b/,
  /\bstrong (?:pick|choice|option|contender)\b/,
  /\breliable choice\b/,
  /\bworth shortlisting\b/,
  /\bi(?:'?d| would)? recommend\b/,
  /\bhard to beat\b/,
  /\bone of the better (?:choices|options|picks)\b/,
  /\bgo with\b/,
  /\bmy (?:pick|recommendation)\b/,
  /\bwinner\b/,
  /\bis (?:often |widely |highly )?recommended\b/,
  /\bhighly recommend/,
  /^\s*(?:choose|pick|go with|try)\b/,
  /\bis (?:the )?better\b|\bbetter (?:choice|option|fit|pick)\b/,
  /\bis (?:the )?best\b/,
  /\b(?:great|excellent|ideal|perfect) (?:choice|option|fit|pick)\b/,
];

export const NEGATIVE: RegExp[] = [
  /\bcomplain(?:t|ts|s|ed)?\b/,
  /\bslow\b/,
  /\boutages?\b/,
  /\bclunky\b/,
  /\blimited\b/,
  /\bexpensive\b/,
  /\boverpriced\b/,
  /\btakes? longer\b/,
  /\bcaution\b/,
  /\bmixed reviews\b/,
  /\bbuggy\b|\bbugs\b/,
  /\bdowntime\b/,
  /\bfrustrat/,
  /\bpoor\b/,
  /\bunreliable\b/,
  /\bdrawbacks?\b|\bdownsides?\b/,
  /\bcriticis|\bcriticiz/,
  /\bhidden fees\b/,
  /\bsteep learning curve\b/,
  /\bnot (?:great|good|ideal|impressive)\b/,
  /\bweak\b/,
  /\blacking\b/,
  /\boutdated\b/,
  /\bpricey\b/,
];

/** Words that hand the final say to whatever follows them ("X is good, but ..."). */
export const CONTRAST = /(?:,|;|\s)\s*(?:but|though|although|however|yet)\b|^\s*(?:even so|that said|still)\b/gi;

/** A recommendation phrase that is negated ("not the best option") is criticism, not a recommendation. */
export const NEGATED_RECOMMENDATION: RegExp[] = [
  /\b(?:not|isn'?t|aren'?t|never) (?:the |a |an )?(?:best|top|safest|strongest|ideal|great|strong|reliable)\b/,
  /\bnot (?:really |exactly )?(?:recommended|worth shortlisting|hard to beat)\b/,
];

export function baseTone(text: string): Tone | null {
  const t = text.toLowerCase().replace(/[’‘]/g, "'");
  if (NOT_RECOMMENDED.some((r) => r.test(t))) return "not_recommended";
  if (NEGATED_RECOMMENDATION.some((r) => r.test(t))) return "negative";
  if (RECOMMENDED.some((r) => r.test(t))) return "recommended";
  if (NEGATIVE.some((r) => r.test(t))) return "negative";
  return null;
}

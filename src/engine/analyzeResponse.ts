import type { AnalyzedResponse, AppConfig, Mention, NormalizedResponse } from "./types";
import { buildMatchers, type BrandMatcher } from "./detect/aliases";
import { brandPositions, findEntitySpans } from "./detect/mentions";
import { attributeUnits } from "./detect/attribution";
import { brandTones } from "./tone/tone";
import { checkFacts } from "./facts/check";

export interface AnalysisContext {
  config: AppConfig;
  matchers: BrandMatcher[];
}

export function createContext(config: AppConfig): AnalysisContext {
  return { config, matchers: buildMatchers(config.brands) };
}

/** Mentions (one per configured brand, mentioned or not) and fact claims for a single answer. */
export function analyzeResponse(response: NormalizedResponse, ctx: AnalysisContext): AnalyzedResponse {
  const brandKeys = ctx.config.brands.map((b) => b.key);
  if (!response.ok) {
    const mentions: Mention[] = brandKeys.map((brand) => ({ brand, mentioned: false, position: null, tone: null, spans: [], toneEvidence: null }));
    return { ...response, mentions, claims: [] };
  }
  const spans = findEntitySpans(response.text, ctx.matchers);
  const positions = brandPositions(spans);
  const units = attributeUnits(response.text, spans);
  const tones = brandTones(units, positions.keys());
  const mentions: Mention[] = brandKeys.map((brand) => {
    const position = positions.get(brand) ?? null;
    const verdict = tones.get(brand);
    return {
      brand,
      mentioned: position !== null,
      position,
      tone: position !== null ? (verdict?.tone ?? "neutral") : null,
      spans: spans.filter((s) => s.brand === brand).map(({ start, end, text }) => ({ start, end, text })),
      toneEvidence: verdict?.evidence ?? null,
    };
  });
  return { ...response, mentions, claims: checkFacts(response.responseId, units, ctx.config.facts) };
}

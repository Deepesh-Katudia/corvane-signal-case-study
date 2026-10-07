/** Shared domain types for the Corvane Signal analysis engine. */

export type Tone = "recommended" | "neutral" | "negative" | "not_recommended";

export type Stage = "early_research" | "comparing_options" | "specific_company" | string;

export interface Prompt {
  id: string;
  question: string;
  stage: Stage;
  priority: number;
}

/** One AI answer after normalisation (all schema variants mapped onto this shape). */
export interface NormalizedResponse {
  responseId: string;
  week: number;
  engine: string;
  promptId: string;
  run: number | null;
  collectedAt: string | null; // ISO-8601
  text: string;
  citations: string[];
  /** false when the collector reported an error or returned no text. */
  ok: boolean;
  error: string | null;
  sourceFile: string;
}

export interface BrandConfig {
  key: string;
  name: string;
  website: string;
  tier: "client" | "tracked" | "other";
  aliases: string[];
  exclusions: string[];
}

export interface BrandFacts {
  name?: string;
  website?: string;
  starting_price_usd?: number;
  price_unit?: string;
  hq?: string;
  founded?: number;
  features?: Record<string, boolean>;
  integrations?: string[];
}

export interface EngineConfig {
  canonical: string;
  label: string;
  aliases: string[];
}

export interface ScoringConfig {
  tonePoints: Record<Tone, number>;
  positionFactors: number[]; // index 0 = position 1; last value applies to all later positions
  noiseIterations: number;
  confidence: number;
  partialWeekCoverage: number; // share of expected cells below which a week is "partial"
}

export interface AppConfig {
  brands: BrandConfig[];
  facts: Record<string, BrandFacts>;
  engines: EngineConfig[];
  scoring: ScoringConfig;
  perspective: string; // brand key whose point of view is the default
}

export interface Mention {
  brand: string;
  mentioned: boolean;
  position: number | null;
  tone: Tone | null;
  /** Character spans in the answer text where the brand was matched. */
  spans: Array<{ start: number; end: number; text: string }>;
  /** The sentence that decided the tone (for explainability). */
  toneEvidence: string | null;
}

export interface FactClaim {
  responseId: string;
  brand: string;
  factKey: string;
  claimText: string;
  claimedValue: string;
  expectedValue: string | null;
  verdict: "wrong" | "correct" | "unverified";
}

export interface AnalyzedResponse extends NormalizedResponse {
  mentions: Mention[];
  claims: FactClaim[];
}

export interface IngestIssue {
  kind:
    | "schema_variant"
    | "duplicate"
    | "error_row"
    | "empty_text"
    | "type_coerced"
    | "unknown_engine"
    | "unknown_prompt"
    | "bad_json"
    | "missing_field";
  detail: string;
  responseId?: string;
  sourceFile: string;
  line?: number;
}

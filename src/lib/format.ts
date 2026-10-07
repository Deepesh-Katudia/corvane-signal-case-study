import type { Tone } from "@/engine/types";
import type { Movement } from "@/engine/score/compare";

export const TONE_LABEL: Record<Tone, string> = {
  recommended: "Recommended",
  neutral: "Neutral",
  negative: "Negative",
  not_recommended: "Advised against",
};

export const TONE_VAR: Record<Tone, string> = {
  recommended: "var(--tone-recommended)",
  neutral: "var(--tone-neutral)",
  negative: "var(--tone-negative)",
  not_recommended: "var(--tone-not-recommended)",
};

export const MOVEMENT_LABEL: Record<Movement, string> = {
  real_gain: "Real gain",
  real_drop: "Real drop",
  normal_variation: "Normal variation",
  no_baseline: "No baseline",
};

export const STAGE_LABEL: Record<string, string> = {
  early_research: "Early research",
  comparing_options: "Comparing options",
  specific_company: "Asking about a company",
};

export const signed = (n: number | null | undefined, digits = 1): string =>
  n === null || n === undefined ? "–" : `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n).toFixed(digits)}`;

export const pct = (x: number, digits = 0): string => `${(x * 100).toFixed(digits)}%`;


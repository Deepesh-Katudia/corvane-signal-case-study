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
  real_gain: "Real rise",
  real_drop: "Real fall",
  normal_variation: "No real change",
  no_baseline: "No comparison yet",
};

export const STAGE_LABEL: Record<string, string> = {
  early_research: "Early research",
  comparing_options: "Comparing options",
  specific_company: "Asking about a company",
};

export const signed = (n: number | null | undefined, digits = 1): string =>
  n === null || n === undefined ? "–" : `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n).toFixed(digits)}`;

/** Hover text explaining each movement label in plain English. */
export const MOVEMENT_HELP: Record<Movement, string> = {
  real_gain: "Bigger than the normal ups and downs of AI answers: this rise is real.",
  real_drop: "Bigger than the normal ups and downs of AI answers: this fall is real.",
  normal_variation: "AI answers change every time you ask. This change is within those normal ups and downs, so don't read much into it.",
  no_baseline: "There is no earlier period to compare with yet.",
};

/** "Gridwell Systems" -> "Gridwell Systems'", "Trakvia" -> "Trakvia's". */
export const possessive = (n: string): string => (n.endsWith("s") ? `${n}'` : `${n}'s`);

/** Answer text keeps markdown bold markers; readers should not see the asterisks. */
export const stripMarkdown = (s: string): string => s.replace(/\*\*/g, "");

export const pct = (x: number, digits = 0): string => `${(x * 100).toFixed(digits)}%`;


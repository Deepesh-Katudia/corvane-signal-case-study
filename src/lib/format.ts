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
  real_gain: "Confirmed rise",
  real_drop: "Confirmed fall",
  normal_variation: "Not confirmed",
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
  real_gain: "Confirmed: bigger than the normal variation between repeated AI answers.",
  real_drop: "Confirmed: bigger than the normal variation between repeated AI answers.",
  normal_variation: "No clear evidence of change: AI answers vary every time you ask, and this change is within that normal variation. The score did move, but it may not last.",
  no_baseline: "There is no earlier period to compare with yet.",
};

/** "Gridwell Systems" -> "Gridwell Systems'", "Trakvia" -> "Trakvia's". */
export const possessive = (n: string): string => (n.endsWith("s") ? `${n}'` : `${n}'s`);

/** Answer text keeps markdown bold markers; readers should not see the asterisks. */
export const stripMarkdown = (s: string): string => s.replace(/\*\*/g, "");

export const pct = (x: number, digits = 0): string => `${(x * 100).toFixed(digits)}%`;


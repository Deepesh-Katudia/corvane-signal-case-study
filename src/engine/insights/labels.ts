/** Plain-English labels shared by the brief, the actions and the pages. */

const FACT_LABELS: Record<string, string> = {
  starting_price_usd: "starting price",
  hq: "headquarters",
  founded: "founding year",
  integrations: "integrations",
  "features.eld_compliance": "ELD compliance",
  "features.dashcams": "dashcams",
  "features.gps_tracking": "GPS tracking",
  "features.fuel_card_integration": "fuel card integration",
  "features.maintenance_alerts": "maintenance alerts",
  "features.driver_app": "driver app",
  "features.payroll": "payroll",
};

export const factLabel = (k: string): string => FACT_LABELS[k] ?? k.replace(/^features\./, "").replace(/_/g, " ");

/** Short noun for a one-line summary: "pricing", "headquarters", "ELD compliance". */
export const factTopic = (k: string): string => (k === "starting_price_usd" ? "pricing" : k === "founded" ? "founding-year" : k === "integrations" ? "integration" : factLabel(k));

/** "false" for a feature reads as "it does not offer ELD compliance". */
export function truthText(factKey: string, expected: string | null): string {
  if (expected === null) return "not covered by facts.json";
  if (factKey.startsWith("features.")) return expected === "true" ? `it does offer ${factLabel(factKey)}` : `it does not offer ${factLabel(factKey)}`;
  if (factKey === "integrations") return `its integrations are ${expected}`;
  return expected;
}

/** For display only: drop markdown emphasis markers (the scoring export keeps the verbatim text). */
export const plainText = (s: string): string => s.replace(/\*\*|__/g, "");

/** "Gridwell Systems" -> "Gridwell Systems'", "Trakvia" -> "Trakvia's". */
export const possessive = (n: string): string => (n.endsWith("s") ? `${n}'` : `${n}'s`);

export const listJoin = (xs: string[]): string => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/**
 * Link to the answers for one question (optionally one engine). With `compareWeeks`, the page shows only
 * those weeks side by side (e.g. [6, 7] for "week 7 vs week 6"); otherwise every week.
 */
export const questionHref = (promptId: string, engine?: string, compareWeeks?: number[]): string =>
  `/questions?prompt=${encodeURIComponent(promptId)}${engine ? `&engine=${encodeURIComponent(engine)}` : ""}${
    compareWeeks?.length ? `&weeks=${compareWeeks.join(",")}` : "&week=all"
  }`;

/** "weeks 5–7" / "week 7". */
export const weekSpan = (ws: number[]): string => (ws.length > 1 ? `weeks ${ws[0]}–${ws[ws.length - 1]}` : `week ${ws[0]}`);

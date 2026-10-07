import type { AnalyzedResponse, BrandConfig } from "../types";
import { toCsv } from "./csv";

/** mentions.csv: one row per answer per brand, exactly as the case-study spec requires. */
export function mentionsCsv(responses: AnalyzedResponse[]): string {
  const rows = responses.flatMap((r) =>
    r.mentions.map((m) => [r.responseId, m.brand, m.mentioned ? "true" : "false", m.position ?? "", m.tone ?? ""]),
  );
  return toCsv(["response_id", "brand", "mentioned", "position", "tone"], rows);
}

/** wrong_facts.csv: one row per incorrect claim about the client or a tracked competitor. */
export function wrongFactsCsv(responses: AnalyzedResponse[], brands: BrandConfig[]): string {
  const tracked = new Set(brands.filter((b) => b.tier !== "other").map((b) => b.key));
  const rows = responses.flatMap((r) =>
    r.claims.filter((c) => c.verdict === "wrong" && tracked.has(c.brand)).map((c) => [c.responseId, c.brand, c.factKey, c.claimText]),
  );
  return toCsv(["response_id", "brand", "fact_key", "claim_text"], rows);
}

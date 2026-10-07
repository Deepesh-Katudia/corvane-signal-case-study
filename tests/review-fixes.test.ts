/** Regression tests for issues found in code review (phrasings outside the data pack's templates). */
import { describe, expect, it } from "vitest";
import path from "node:path";
import { loadConfig } from "@/engine/config/loadConfig";
import { analyzeResponse, createContext } from "@/engine/analyzeResponse";
import { parseResponsesFile } from "@/engine/ingest/parseFile";
import { normalizeRecords } from "@/engine/ingest/normalize";
import { canonicalizeKeys } from "@/engine/ingest/fieldAliases";
import type { NormalizedResponse } from "@/engine/types";

const config = loadConfig(path.join(__dirname, "..", "config"));
const ctx = createContext(config);

function analyze(text: string) {
  const r: NormalizedResponse = { responseId: "t", week: 1, engine: "chatgpt", promptId: "P01", run: 1, collectedAt: null, text, citations: [], ok: true, error: null, sourceFile: "t" };
  return analyzeResponse(r, ctx);
}
const tone = (text: string, brand: string) => analyze(text).mentions.find((m) => m.brand === brand)!.tone;
const wrong = (text: string) => analyze(text).claims.filter((c) => c.verdict === "wrong").map((c) => c.factKey);

describe("negated and hedged verdicts", () => {
  it.each([
    ["Corvane is not the best option for small fleets.", "corvane", "negative"],
    ["Don't go with Routelyne.", "routelyne", "not_recommended"],
    ["Don't pick Gridwell for small fleets.", "gridwell", "not_recommended"],
    ["Trakvia helps avoid outages and is the best overall option.", "trakvia", "recommended"],
    ["I'd avoid Gridwell for a 20-truck fleet.", "gridwell", "not_recommended"],
    ["Corvane Fleet is best for compliance-heavy fleets.", "corvane", "recommended"],
    ["Corvane is a great choice.", "corvane", "recommended"],
    ["Routelyne is a weak option for compliance.", "routelyne", "negative"],
  ])("%s", (text, brand, expected) => {
    expect(tone(text, brand)).toBe(expected);
  });
});

describe("fact claims in other wordings", () => {
  it("catches a wrong feature inside a list", () => {
    expect(wrong("Corvane includes GPS tracking, ELD compliance, and dashcams.")).toEqual(["features.dashcams"]);
  });

  it.each(["Corvane is $49 per vehicle per month.", "Corvane Fleet starts at $49 monthly."])("reads the price in %s", (text) => {
    expect(wrong(text)).toEqual(["starting_price_usd"]);
  });

  it("does not pin a market-wide price on the last company named", () => {
    expect(wrong("Corvane Fleet is solid. Most providers charge about $40 per vehicle per month.")).toEqual([]);
  });
});

describe("format tolerance", () => {
  it("prefers the most specific field name when several are present", () => {
    const { fields } = canonicalizeKeys({ id: 17, response_id: "r_real", prompt: "What is…", prompt_id: "P01", text: "x", response_text: "real" });
    expect(fields).toMatchObject({ responseId: "r_real", promptId: "P01", text: "real" });
  });

  function one(row: object) {
    const { records } = parseResponsesFile(JSON.stringify(row), "x.jsonl");
    return normalizeRecords(records, config.engines).responses[0];
  }

  it("treats error: false as no error", () => {
    expect(one({ response_id: "a", week: 1, engine: "chatgpt", prompt_id: "P01", response_text: "Corvane Fleet", error: false }).ok).toBe(true);
  });

  it("reads week labels such as 2026-W03", () => {
    expect(one({ response_id: "a", week: "2026-W03", engine: "chatgpt", prompt_id: "P01", response_text: "x" }).week).toBe(3);
  });

  it("keeps a row with no week or date so it still appears in the export", () => {
    expect(one({ response_id: "a", engine: "chatgpt", prompt_id: "P01", response_text: "x" })).toMatchObject({ responseId: "a", week: 0 });
  });

  it("accepts JSON files wrapped in data/results/items", () => {
    const { records } = parseResponsesFile(JSON.stringify({ data: [{ response_id: "a" }, { response_id: "b" }] }), "x.json");
    expect(records).toHaveLength(2);
  });
});

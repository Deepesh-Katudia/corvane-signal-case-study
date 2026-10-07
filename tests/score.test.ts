import { describe, expect, it } from "vitest";
import path from "node:path";
import { loadConfig } from "@/engine/config/loadConfig";
import { buildDataset, loadDataset } from "@/engine/ingest/loadDataset";
import { runAnalysis } from "@/engine/pipeline";
import { answerPoints, type Cell } from "@/engine/score/visibility";
import { compareWeeks, poolCells } from "@/engine/score/compare";
import { explainChange } from "@/engine/score/drivers";
import { mentionsCsv, wrongFactsCsv } from "@/engine/export/scoringCsv";
import type { AnalyzedResponse, Mention } from "@/engine/types";

const root = path.join(__dirname, "..");
const config = loadConfig(path.join(root, "config"));
const scoring = { ...config.scoring, noiseIterations: 500 };
const dataset = loadDataset(path.join(root, "data"), config.engines);

function cell(week: number, promptId: string, engine: string, runs: Record<string, number[]>, priority = 1): Cell {
  return { key: `${promptId}|${engine}`, week, promptId, engine, priority, runs, responseIds: [] };
}

describe("answer points", () => {
  const mention = (tone: Mention["tone"], position: number | null): AnalyzedResponse =>
    ({ ok: true, mentions: [{ brand: "corvane", mentioned: position !== null, position, tone, spans: [], toneEvidence: null }] }) as unknown as AnalyzedResponse;

  it("weights tone by position", () => {
    expect(answerPoints(mention("recommended", 1), "corvane", scoring)).toBe(100);
    expect(answerPoints(mention("recommended", 2), "corvane", scoring)).toBe(85);
    expect(answerPoints(mention("neutral", 5), "corvane", scoring)).toBe(35);
    expect(answerPoints(mention("negative", 1), "corvane", scoring)).toBe(25);
    expect(answerPoints(mention("not_recommended", 1), "corvane", scoring)).toBe(0);
    expect(answerPoints(mention(null, null), "corvane", scoring)).toBe(0);
  });
});

describe("week-on-week comparison", () => {
  it("flags a large consistent change as real", () => {
    const prev = Array.from({ length: 12 }, (_, i) => cell(1, `P${i}`, "chatgpt", { corvane: [100, 100] }));
    const cur = Array.from({ length: 12 }, (_, i) => cell(2, `P${i}`, "chatgpt", { corvane: [0, 0] }));
    const c = compareWeeks("corvane", 2, cur, 1, prev, scoring);
    expect(c.delta).toBe(-100);
    expect(c.movement).toBe("real_drop");
  });

  it("calls run-to-run wobble normal variation", () => {
    const prev = Array.from({ length: 12 }, (_, i) => cell(1, `P${i}`, "chatgpt", { corvane: i % 2 ? [100, 0] : [0, 100] }));
    const cur = Array.from({ length: 12 }, (_, i) => cell(2, `P${i}`, "chatgpt", { corvane: i % 3 ? [100, 0] : [0, 0] }));
    expect(compareWeeks("corvane", 2, cur, 1, prev, scoring).movement).toBe("normal_variation");
  });

  it("does not report a drop when an engine is missing from the new week", () => {
    const engines = ["chatgpt", "perplexity", "google_ai_overview"];
    const prev = engines.flatMap((e) => Array.from({ length: 5 }, (_, i) => cell(1, `P${i}`, e, { corvane: e === "perplexity" ? [100, 100] : [50, 50] })));
    const cur = prev.filter((c) => c.engine !== "perplexity").map((c) => ({ ...c, week: 2 }));
    const c = compareWeeks("corvane", 2, cur, 1, prev, scoring);
    expect(c.delta).toBe(0);
    expect(c.matchedCells).toBe(10);
    expect(c.movement).toBe("normal_variation");
  });

  it("pools several weeks into one comparison window", () => {
    const cells = [cell(1, "P1", "chatgpt", { corvane: [100, 0] }), cell(2, "P1", "chatgpt", { corvane: [50, 50] })];
    expect(poolCells(cells, [1, 2], 2)[0].runs.corvane).toEqual([100, 0, 50, 50]);
  });

  it("explains a drop by question and names who gained there", () => {
    const prev = [cell(1, "P1", "chatgpt", { corvane: [100, 100], trakvia: [0, 0] }), cell(1, "P2", "chatgpt", { corvane: [50, 50], trakvia: [50, 50] })];
    const cur = [cell(2, "P1", "chatgpt", { corvane: [0, 0], trakvia: [100, 100] }), cell(2, "P2", "chatgpt", { corvane: [50, 50], trakvia: [50, 50] })];
    const d = explainChange("corvane", cur, prev, ["corvane", "trakvia"]);
    expect(d.byPrompt).toEqual([{ promptId: "P1", contribution: -50 }]);
    expect(d.takers).toEqual([{ brand: "trakvia", gained: 50, promptIds: ["P1"] }]);
  });
});

describe("full pipeline on the data pack", () => {
  const result = runAnalysis(dataset, { ...config, scoring });

  it("produces six mention rows per answer, including failed answers", () => {
    const lines = mentionsCsv(result.responses).trim().split("\n");
    expect(lines[0]).toBe("response_id,brand,mentioned,position,tone");
    expect(lines).toHaveLength(1 + 510 * 6);
    const failed = result.responses.find((r) => !r.ok)!;
    expect(lines.filter((l) => l.startsWith(failed.responseId))).toEqual(
      ["corvane", "trakvia", "routelyne", "gridwell", "fleetora", "novahaul"].map((b) => `${failed.responseId},${b},false,,`),
    );
  });

  it("writes wrong facts with the required columns, quoting commas", () => {
    const csv = wrongFactsCsv(result.responses, config.brands);
    expect(csv.split("\n")[0]).toBe("response_id,brand,fact_key,claim_text");
    expect(csv).toContain('r_45e5f1edf3b3,corvane,hq,"It\'s based in Columbus, Georgia."');
  });

  it("marks week 5 as partial (no Perplexity) without inventing a drop", () => {
    const w5 = result.weeks.find((w) => w.week === 5)!;
    expect(w5.partial).toBe(true);
    expect(w5.missingEngines).toEqual(["perplexity"]);
    const cmp = result.comparisons.find((c) => c.brand === "corvane" && c.week === 5)!;
    expect(cmp.matchedCells).toBe(30);
  });

  it("is deterministic", () => {
    const again = runAnalysis(dataset, { ...config, scoring });
    expect(again.comparisons.map((c) => c.pValue)).toEqual(result.comparisons.map((c) => c.pValue));
  });
});

describe("format tolerance", () => {
  it("analyses a new week whose file uses different field names", () => {
    const lines = [{ id: "new1", week_number: "7", model: "Chat GPT", question_id: "p05", attempt: 1, timestamp: "2026-09-28T10:00:00Z", output: "Corvane Fleet is the safest choice. It was founded in 2009.", references: "https://g2.com/x" }];
    const fresh = buildDataset([{ name: "week7.jsonl", content: lines.map((l) => JSON.stringify(l)).join("\n") }], null, config.engines);
    const result = runAnalysis({ ...fresh, prompts: dataset.prompts }, { ...config, scoring });
    expect(result.responses[0]).toMatchObject({ week: 7, engine: "chatgpt", promptId: "P05" });
    expect(result.responses[0].mentions.find((m) => m.brand === "corvane")).toMatchObject({ mentioned: true, position: 1, tone: "recommended" });
    expect(result.wrongFacts.map((f) => f.factKey)).toEqual(["founded"]);
  });
});

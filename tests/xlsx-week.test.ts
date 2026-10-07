import { describe, expect, it } from "vitest";
import path from "node:path";
import ExcelJS from "exceljs";
import { loadConfig } from "@/engine/config/loadConfig";
import { buildDataset, readSourceFile } from "@/engine/ingest/loadDataset";
import { runAnalysis } from "@/engine/pipeline";

const root = path.join(__dirname, "..");
const config = loadConfig(path.join(root, "config"));
const file = path.join(root, "samples", "week7_answers.xlsx");

async function answerKey() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const rows: Array<{ id: string; brand: string; position: number; tone: string; wrong: string }> = [];
  wb.worksheets[1].eachRow((row, n) => {
    if (n === 1) return;
    const [, id, brand, position, tone, wrong] = row.values as unknown[];
    rows.push({ id: String(id), brand: String(brand), position: Number(position), tone: String(tone ?? ""), wrong: String(wrong ?? "") });
  });
  return rows;
}

describe("a new week delivered as an Excel workbook", async () => {
  const source = await readSourceFile(file);
  const dataset = buildDataset([source], null, config.engines);
  const result = runAnalysis(dataset, config);
  const key = await answerKey();

  it("maps the Excel layout (W7, engine labels, lower-case ids, dates, line-separated sources)", () => {
    expect(result.responses).toHaveLength(90);
    expect(new Set(result.responses.map((r) => r.week))).toEqual(new Set([7]));
    expect(new Set(result.responses.map((r) => r.engine))).toEqual(new Set(["chatgpt", "perplexity", "google_ai_overview"]));
    expect(result.responses.every((r) => /^P\d\d$/.test(r.promptId))).toBe(true);
    expect(result.responses.find((r) => r.citations.length > 1)).toBeTruthy();
    expect(result.responses.filter((r) => !r.ok)).toHaveLength(1);
  });

  it("agrees with the generator's answer key on mentions, positions and tones", () => {
    const byId = new Map(result.responses.map((r) => [r.responseId, r]));
    const scored = key.filter((k) => k.brand !== "(collection failed)");
    const misses = scored.filter((k) => {
      const m = byId.get(k.id)!.mentions.find((x) => x.brand === k.brand)!;
      return !m.mentioned || m.position !== k.position || m.tone !== k.tone;
    });
    expect(misses).toEqual([]);
    const extra = result.responses.flatMap((r) => r.mentions.filter((m) => m.mentioned && !scored.some((k) => k.id === r.responseId && k.brand === m.brand)));
    expect(extra).toEqual([]);
  });

  it("finds exactly the wrong facts that were planted", () => {
    const planted = key.flatMap((k) => (k.wrong ? k.wrong.split(", ").map((f) => `${k.id}|${k.brand}|${f}`) : [])).sort();
    const found = result.wrongFacts.map((f) => `${f.responseId}|${f.brand}|${f.factKey}`).sort();
    expect(found).toEqual(planted);
  });
});

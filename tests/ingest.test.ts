import { describe, expect, it } from "vitest";
import path from "node:path";
import fs from "node:fs";
import { loadConfig } from "@/engine/config/loadConfig";
import { parseResponsesFile } from "@/engine/ingest/parseFile";
import { normalizeRecords } from "@/engine/ingest/normalize";
import { toCitations, decodeEntities } from "@/engine/ingest/coerce";
import { parseDate, resolveAmbiguous } from "@/engine/ingest/dates";

const config = loadConfig(path.join(__dirname, "..", "config"));

function normalizeLines(lines: object[]) {
  const { records } = parseResponsesFile(lines.map((l) => JSON.stringify(l)).join("\n"), "test.jsonl");
  return normalizeRecords(records, config.engines);
}

describe("normalizeRecords", () => {
  it("maps the week-4 schema variant onto the standard shape", () => {
    const { responses } = normalizeLines([
      { response_id: "r1", week: 4, engine: "AI Overview", prompt_id: "p01", run_number: 2, collected: "07/09/2026 12:20", answer: "Corvane &amp; Trakvia", sources: [] },
    ]);
    expect(responses[0]).toMatchObject({
      responseId: "r1",
      week: 4,
      engine: "google_ai_overview",
      promptId: "P01",
      run: 2,
      text: "Corvane & Trakvia",
      citations: [],
      ok: true,
    });
  });

  it("canonicalises engine names regardless of case and spacing", () => {
    const { responses } = normalizeLines([
      { response_id: "a", week: 1, engine: "ChatGPT", prompt_id: "P01", run: 1, response_text: "x" },
      { response_id: "b", week: 1, engine: "google_ai_overview", prompt_id: "P01", run: 1, response_text: "x" },
      { response_id: "c", week: 1, engine: "Perplexity", prompt_id: "P01", run: 1, response_text: "x" },
    ]);
    expect(responses.map((r) => r.engine)).toEqual(["chatgpt", "google_ai_overview", "perplexity"]);
  });

  it("drops exact duplicate response ids and reports them", () => {
    const row = { response_id: "dup", week: 2, engine: "chatgpt", prompt_id: "P05", run: 1, response_text: "Hello" };
    const { responses, issues } = normalizeLines([row, row]);
    expect(responses).toHaveLength(1);
    expect(issues.filter((i) => i.kind === "duplicate")).toHaveLength(1);
  });

  it("keeps timed-out rows as failed answers and coerces text-typed fields", () => {
    const { responses, issues } = normalizeLines([
      { response_id: "e", week: "1", engine: "chatgpt", prompt_id: "P03", run: "2", collected_at: "2026-08-17T21:34:00Z", response_text: "", citations: "None", error: "timeout" },
    ]);
    expect(responses[0]).toMatchObject({ week: 1, run: 2, ok: false, error: "timeout", citations: [] });
    expect(issues.some((i) => i.kind === "error_row")).toBe(true);
    expect(issues.some((i) => i.kind === "type_coerced")).toBe(true);
  });

  it("resolves an ambiguous DD/MM date using the dates of neighbouring weeks", () => {
    const { responses } = normalizeLines([
      { response_id: "w3", week: 3, engine: "chatgpt", prompt_id: "P01", run: 1, collected_at: "2026-08-31T10:00:00Z", response_text: "x" },
      { response_id: "w4", week: 4, engine: "chatgpt", prompt_id: "P01", run: 1, collected: "07/09/2026 21:26", answer: "x" },
    ]);
    expect(responses.find((r) => r.responseId === "w4")!.collectedAt).toBe("2026-09-07T21:26:00.000Z");
  });

  it("infers a missing week from the collection date", () => {
    const { responses } = normalizeLines([
      { response_id: "a", week: 1, engine: "chatgpt", prompt_id: "P01", run: 1, collected_at: "2026-08-17T10:00:00Z", response_text: "x" },
      { response_id: "b", engine: "chatgpt", prompt_id: "P01", run: 1, collected_at: "2026-08-24T10:00:00Z", response_text: "x" },
    ]);
    expect(responses.find((r) => r.responseId === "b")!.week).toBe(2);
  });

  it("reports bad JSON lines without failing the whole file", () => {
    const { records, issues } = parseResponsesFile('{"response_id":"a"}\n{not json\n', "x.jsonl");
    expect(records).toHaveLength(1);
    expect(issues[0].kind).toBe("bad_json");
  });

  it("accepts a JSON array file", () => {
    const { records } = parseResponsesFile(JSON.stringify([{ response_id: "a" }, { response_id: "b" }]), "x.json");
    expect(records).toHaveLength(2);
  });
});

describe("coercion helpers", () => {
  it("parses citation lists given as strings, arrays or objects", () => {
    expect(toCitations("[]")).toEqual([]);
    expect(toCitations("None")).toEqual([]);
    expect(toCitations(null)).toEqual([]);
    expect(toCitations(["https://a.com", { url: "https://b.com" }])).toEqual(["https://a.com", "https://b.com"]);
    expect(toCitations('["https://a.com"]')).toEqual(["https://a.com"]);
  });

  it("decodes HTML entities", () => {
    expect(decodeEntities("price &amp; features &#39;ok&#39;")).toBe("price & features 'ok'");
  });

  it("flags ambiguous slash dates and resolves them to the nearest reading", () => {
    const p = parseDate("07/09/2026 12:00");
    expect(p.ambiguous).toBe(true);
    expect(resolveAmbiguous(p, Date.parse("2026-09-05"))).toBe("2026-09-07T12:00:00.000Z");
    expect(resolveAmbiguous(p, Date.parse("2026-07-05"))).toBe("2026-07-09T12:00:00.000Z");
    expect(parseDate("25/09/2026").ambiguous).toBe(false);
  });
});

describe("real data pack", () => {
  it("normalises the shipped file into 507 unique answers with 3 failures", () => {
    const file = path.join(__dirname, "..", "data", "responses.jsonl");
    const { records } = parseResponsesFile(fs.readFileSync(file, "utf8"), "responses.jsonl");
    const { responses } = normalizeRecords(records, config.engines);
    expect(records).toHaveLength(518);
    expect(responses).toHaveLength(510);
    expect(responses.filter((r) => !r.ok)).toHaveLength(3);
    const engines = new Set(responses.map((r) => r.engine));
    expect([...engines].sort()).toEqual(["chatgpt", "google_ai_overview", "perplexity"]);
    expect(responses.filter((r) => r.week === 5 && r.engine === "perplexity")).toHaveLength(0);
  });
});

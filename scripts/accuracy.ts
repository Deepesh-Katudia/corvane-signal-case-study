/**
 * Accuracy check against hand labels.
 *
 *   npm run accuracy -- --sample     print 15 randomly chosen answers (fixed seed) with the tool's output
 *   npm run accuracy                 compare docs/accuracy/hand_labels.json with the tool and print the report
 */
import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "../src/engine/config/loadConfig";
import { loadDataset } from "../src/engine/ingest/loadDataset";
import { analyzeResponse, createContext } from "../src/engine/analyzeResponse";
import { mulberry32 } from "../src/engine/score/compare";
import type { AnalyzedResponse, Tone } from "../src/engine/types";

const SEED = 20260817;
const SAMPLE_SIZE = 15;
const LABELS = path.join("docs", "accuracy", "hand_labels.json");

interface HandLabel {
  responseId: string;
  /** brand -> [position, tone]; brands not listed are "not mentioned". */
  mentions: Record<string, [number, Tone]>;
  wrongFacts: string[]; // "brand:fact_key"
  note?: string;
}

const config = loadConfig();
const ctx = createContext(config);
// Always the official data pack, so the seeded sample never changes when new weeks are added.
const dataset = await loadDataset("data/responses.jsonl", config.engines);
const answered = dataset.responses.filter((r) => r.ok);

function sample(): AnalyzedResponse[] {
  const rng = mulberry32(SEED);
  const pool = [...answered];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, SAMPLE_SIZE).map((r) => analyzeResponse(r, ctx));
}

function printSample(): void {
  for (const r of sample()) {
    const ms = r.mentions.filter((m) => m.mentioned).map((m) => `${m.brand}#${m.position}:${m.tone}`);
    const wf = r.claims.filter((c) => c.verdict === "wrong").map((c) => `${c.brand}:${c.factKey}`);
    process.stdout.write(`\n=== ${r.responseId} (week ${r.week}, ${r.engine}, ${r.promptId})\n${r.text}\n--- tool: ${ms.join(", ") || "none"} | wrong: ${wf.join(", ") || "none"}\n`);
  }
}

function report(): void {
  const labels = JSON.parse(fs.readFileSync(LABELS, "utf8")) as HandLabel[];
  const byId = new Map(sample().map((r) => [r.responseId, r]));
  let mentionRight = 0, mentionTotal = 0, positionRight = 0, toneRight = 0, toneTotal = 0, factRight = 0, factTotal = 0;
  const errors: string[] = [];
  for (const l of labels) {
    const r = byId.get(l.responseId) ?? analyzeResponse(answered.find((a) => a.responseId === l.responseId)!, ctx);
    for (const b of config.brands) {
      const tool = r.mentions.find((m) => m.brand === b.key)!;
      const hand = l.mentions[b.key];
      mentionTotal++;
      if (tool.mentioned === !!hand) mentionRight++;
      else errors.push(`${r.responseId} ${b.key}: mention tool=${tool.mentioned} hand=${!!hand}`);
      if (hand && tool.mentioned) {
        toneTotal++;
        if (tool.position === hand[0]) positionRight++;
        else errors.push(`${r.responseId} ${b.key}: position tool=${tool.position} hand=${hand[0]}`);
        if (tool.tone === hand[1]) toneRight++;
        else errors.push(`${r.responseId} ${b.key}: tone tool=${tool.tone} hand=${hand[1]}`);
      }
    }
    const toolFacts = new Set(r.claims.filter((c) => c.verdict === "wrong").map((c) => `${c.brand}:${c.factKey}`));
    const handFacts = new Set(l.wrongFacts);
    for (const f of new Set([...toolFacts, ...handFacts])) {
      factTotal++;
      if (toolFacts.has(f) && handFacts.has(f)) factRight++;
      else errors.push(`${r.responseId} wrong fact ${f}: tool=${toolFacts.has(f)} hand=${handFacts.has(f)}`);
    }
  }
  const p = (a: number, b: number) => `${a}/${b} (${b ? ((a / b) * 100).toFixed(1) : "n/a"}%)`;
  process.stdout.write(
    [
      `Answers checked: ${labels.length}`,
      `Mention detected correctly (answer x company): ${p(mentionRight, mentionTotal)}`,
      `Position correct (where both agree it is mentioned): ${p(positionRight, toneTotal)}`,
      `Tone correct (where both agree it is mentioned): ${p(toneRight, toneTotal)}`,
      `Wrong-fact flags agreeing: ${p(factRight, factTotal)}`,
      `Disagreements:`,
      ...(errors.length ? errors.map((e) => `  - ${e}`) : ["  none"]),
    ].join("\n") + "\n",
  );
}

if (process.argv.includes("--sample")) printSample();
else report();

/**
 * Corvane Signal analysis CLI.
 *
 *   npm run analyze                               # data/ -> out/
 *   npm run analyze -- --data path/to/new_week.jsonl --out results/
 *   npm run analyze -- --data some/folder --config config/
 *
 * Writes mentions.csv and wrong_facts.csv (the scoring export), analysis.json (used by the web app)
 * and board_report.xlsx.
 */
import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "../src/engine/config/loadConfig";
import { loadDataset } from "../src/engine/ingest/loadDataset";
import { runAnalysis } from "../src/engine/pipeline";
import { mentionsCsv, wrongFactsCsv } from "../src/engine/export/scoringCsv";
import { writeBoardReport } from "../src/engine/export/boardReport";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function main(): Promise<void> {
  const dataPath = path.resolve(arg("data", "data"));
  const outDir = path.resolve(arg("out", "out"));
  const config = loadConfig(path.resolve(arg("config", "config")));
  const dataset = await loadDataset(dataPath, config.engines);
  const result = runAnalysis(dataset, config);

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "mentions.csv"), mentionsCsv(result.responses));
  fs.writeFileSync(path.join(outDir, "wrong_facts.csv"), wrongFactsCsv(result.responses, config.brands));
  fs.writeFileSync(path.join(outDir, "analysis.json"), JSON.stringify(result));
  await writeBoardReport(result, path.join(outDir, "board_report.xlsx"));

  const partial = result.weeks.filter((w) => w.partial).map((w) => `week ${w.week} (missing: ${w.missingEngines.join(", ") || "some questions"})`);
  const lines = [
    `Corvane Signal: analysed ${result.responses.length} answers from ${dataset.files.join(", ")}`,
    `  weeks: ${result.weeks.map((w) => w.week).join(", ")}${partial.length ? `  | partial: ${partial.join("; ")}` : ""}`,
    `  data issues handled: ${result.issues.length}`,
    `  wrong facts found: ${result.wrongFacts.length}`,
    `  wrote ${path.relative(process.cwd(), outDir) || "."}/mentions.csv, wrong_facts.csv, analysis.json, board_report.xlsx`,
  ];
  process.stdout.write(lines.join("\n") + "\n");
}

main().catch((err: unknown) => {
  process.stderr.write(`analyze failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});

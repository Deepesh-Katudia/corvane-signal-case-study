import "server-only";
import path from "node:path";
import { createHash } from "node:crypto";
import { loadConfig } from "@/engine/config/loadConfig";
import { buildDataset, readSourceFiles } from "@/engine/ingest/loadDataset";
import { runAnalysis, type AnalysisResult } from "@/engine/pipeline";
import type { AppConfig } from "@/engine/types";

const ROOT = process.cwd();
export const DATA_DIR = path.join(ROOT, "data");
const CONFIG_DIR = path.join(ROOT, "config");

let cache: { key: string; result: AnalysisResult; config: AppConfig } | null = null;

/** Analysis of every answer file in data/ (including uploaded weeks); recomputed only when the files change. */
export async function getAnalysis(): Promise<{ result: AnalysisResult; config: AppConfig }> {
  const config = loadConfig(CONFIG_DIR);
  const local = await readSourceFiles(DATA_DIR);
  const files = local.responses;
  const key = createHash("sha1")
    .update(JSON.stringify(config))
    .update(files.map((f) => `${f.name}:${f.content.length}:${createHash("sha1").update(f.content).digest("hex")}`).join("|"))
    .digest("hex");
  if (cache?.key === key) return cache;
  const result = runAnalysis(buildDataset(files, local.prompts, config.engines), config);
  cache = { key, result, config };
  return cache;
}

export function invalidateAnalysis(): void {
  cache = null;
}


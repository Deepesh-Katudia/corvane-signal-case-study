import "server-only";
import path from "node:path";
import { createHash } from "node:crypto";
import { loadConfig } from "@/engine/config/loadConfig";
import { buildDataset, readSourceFiles } from "@/engine/ingest/loadDataset";
import { runAnalysis, type AnalysisResult } from "@/engine/pipeline";
import { getUploadStore } from "@/store/uploadStore";
import type { AppConfig } from "@/engine/types";

const ROOT = process.cwd();
export const DATA_DIR = path.join(ROOT, "data");
const CONFIG_DIR = path.join(ROOT, "config");

let cache: { key: string; result: AnalysisResult; config: AppConfig } | null = null;

/** Analysis of bundled data plus any uploaded weeks; recomputed only when the inputs change. */
export async function getAnalysis(): Promise<{ result: AnalysisResult; config: AppConfig }> {
  const config = loadConfig(CONFIG_DIR);
  const local = readSourceFiles(DATA_DIR);
  const uploads = await getUploadStore(DATA_DIR).list();
  const localNames = new Set(local.responses.map((f) => f.name));
  const files = [...local.responses, ...uploads.filter((u) => !localNames.has(u.name))];
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

/** Perspective from ?as=, falling back to the configured client. Unknown values are ignored. */
export function resolvePerspective(result: AnalysisResult, as: string | string[] | undefined): string {
  const v = Array.isArray(as) ? as[0] : as;
  return result.brands.some((b) => b.key === v && b.tier !== "other") ? v! : result.perspective;
}

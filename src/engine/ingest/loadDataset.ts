import fs from "node:fs";
import path from "node:path";
import type { EngineConfig, IngestIssue, NormalizedResponse, Prompt } from "../types";
import { parseResponsesFile, type RawRecord } from "./parseFile";
import { normalizeRecords } from "./normalize";
import { parsePrompts } from "./prompts";

const RESPONSE_FILE = /\.(jsonl|ndjson|json|csv)$/i;
const PROMPTS_FILE = /^prompts?\.csv$/i;

export interface Dataset {
  prompts: Prompt[];
  responses: NormalizedResponse[];
  issues: IngestIssue[];
  files: string[];
}

export interface SourceFile {
  name: string;
  content: string;
}

/** Every responses file in a folder (any name, any supported format); or a single file path. */
export function readSourceFiles(dataPath: string): { responses: SourceFile[]; prompts: SourceFile | null } {
  if (!fs.existsSync(dataPath)) throw new Error(`Data path not found: ${dataPath}`);
  const stat = fs.statSync(dataPath);
  const dir = stat.isDirectory() ? dataPath : path.dirname(dataPath);
  const names = stat.isDirectory() ? fs.readdirSync(dir).sort() : [path.basename(dataPath)];
  const read = (n: string): SourceFile => ({ name: n, content: fs.readFileSync(path.join(dir, n), "utf8") });
  const promptsName = fs.readdirSync(dir).find((n) => PROMPTS_FILE.test(n));
  return {
    responses: names.filter((n) => RESPONSE_FILE.test(n) && !PROMPTS_FILE.test(n)).map(read),
    prompts: promptsName ? read(promptsName) : null,
  };
}

export function buildDataset(files: SourceFile[], promptsFile: SourceFile | null, engines: EngineConfig[]): Dataset {
  const prompts = promptsFile ? parsePrompts(promptsFile.content) : [];
  const records: RawRecord[] = [];
  const issues: IngestIssue[] = [];
  for (const f of files) {
    const parsed = parseResponsesFile(f.content, f.name);
    records.push(...parsed.records);
    issues.push(...parsed.issues);
  }
  const knownPrompts = prompts.length ? new Set(prompts.map((p) => p.id)) : undefined;
  const normalized = normalizeRecords(records, engines, knownPrompts);
  return { prompts, responses: normalized.responses, issues: [...issues, ...normalized.issues], files: files.map((f) => f.name) };
}

export function loadDataset(dataPath: string, engines: EngineConfig[]): Dataset {
  const { responses, prompts } = readSourceFiles(dataPath);
  if (!responses.length) throw new Error(`No responses files (.jsonl/.json/.csv) found in ${dataPath}`);
  return buildDataset(responses, prompts, engines);
}

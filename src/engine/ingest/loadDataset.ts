import fs from "node:fs";
import path from "node:path";
import type { EngineConfig, IngestIssue, NormalizedResponse, Prompt } from "../types";
import { parseResponsesFile, type RawRecord } from "./parseFile";
import { normalizeRecords } from "./normalize";
import { parsePrompts } from "./prompts";
import { isXlsx, xlsxToJson } from "./xlsx";

const RESPONSE_FILE = /\.(jsonl|ndjson|json|csv|xlsx)$/i;
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

/** Reads a file as text; Excel workbooks are converted to a JSON array of rows first. */
export async function readSourceFile(file: string): Promise<SourceFile> {
  const name = path.basename(file);
  const content = isXlsx(name) ? await xlsxToJson(fs.readFileSync(file)) : fs.readFileSync(file, "utf8");
  return { name, content };
}

/** Every responses file in a folder (any name, any supported format); or a single file path. */
export async function readSourceFiles(dataPath: string): Promise<{ responses: SourceFile[]; prompts: SourceFile | null }> {
  if (!fs.existsSync(dataPath)) throw new Error(`Data path not found: ${dataPath}`);
  const stat = fs.statSync(dataPath);
  const dir = stat.isDirectory() ? dataPath : path.dirname(dataPath);
  const names = stat.isDirectory() ? fs.readdirSync(dir).sort() : [path.basename(dataPath)];
  const promptsName = fs.readdirSync(dir).find((n) => PROMPTS_FILE.test(n));
  // "~$name.xlsx" is the lock file Excel leaves next to an open workbook.
  const responseNames = names.filter((n) => RESPONSE_FILE.test(n) && !PROMPTS_FILE.test(n) && !n.startsWith("~$"));
  return {
    responses: await Promise.all(responseNames.map((n) => readSourceFile(path.join(dir, n)))),
    prompts: promptsName ? await readSourceFile(path.join(dir, promptsName)) : null,
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

export async function loadDataset(dataPath: string, engines: EngineConfig[]): Promise<Dataset> {
  const { responses, prompts } = await readSourceFiles(dataPath);
  if (!responses.length) throw new Error(`No responses files (.jsonl/.json/.csv/.xlsx) found in ${dataPath}`);
  return buildDataset(responses, prompts, engines);
}

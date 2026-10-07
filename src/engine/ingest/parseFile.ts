import { parse as parseCsv } from "csv-parse/sync";
import type { IngestIssue } from "../types";

export interface RawRecord {
  raw: Record<string, unknown>;
  sourceFile: string;
  line: number;
}

const WRAPPED = /^\{\s*"(?:responses|data|results|items|answers)"\s*:\s*\[/;

function fromJsonDocument(trimmed: string, sourceFile: string): RawRecord[] | null {
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const container = parsed as Record<string, unknown>;
    const list = Array.isArray(parsed)
      ? parsed
      : (["responses", "data", "results", "items", "answers"].map((k) => container[k]).find(Array.isArray) as unknown[] | undefined) ?? [parsed];
    return list
      .filter((r): r is Record<string, unknown> => !!r && typeof r === "object" && !Array.isArray(r))
      .map((raw, i) => ({ raw, sourceFile, line: i + 1 }));
  } catch {
    return null;
  }
}

/** Accepts JSONL, a JSON array (or {responses:[...]}) or CSV. Bad lines are reported, not fatal. */
export function parseResponsesFile(content: string, sourceFile: string): { records: RawRecord[]; issues: IngestIssue[] } {
  const text = content.replace(/^﻿/, "");
  const trimmed = text.trim();
  const issues: IngestIssue[] = [];
  if (!trimmed) return { records: [], issues };

  if (/\.csv$/i.test(sourceFile)) {
    const rows = parseCsv(text, { columns: true, skip_empty_lines: true, relax_column_count: true }) as Record<string, unknown>[];
    return { records: rows.map((raw, i) => ({ raw, sourceFile, line: i + 2 })), issues };
  }

  if (trimmed.startsWith("[")) {
    const records = fromJsonDocument(trimmed, sourceFile);
    if (records) return { records, issues };
  }

  // A single JSON object wrapping the answers: {"data": [...]}, {"results": [...]}, ...
  if (trimmed.startsWith("{") && WRAPPED.test(trimmed)) {
    const records = fromJsonDocument(trimmed, sourceFile);
    if (records && records.length > 1) return { records, issues };
  }

  const records: RawRecord[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((lineText, i) => {
    const l = lineText.trim();
    if (!l) return;
    try {
      const obj = JSON.parse(l) as unknown;
      if (obj && typeof obj === "object" && !Array.isArray(obj)) {
        records.push({ raw: obj as Record<string, unknown>, sourceFile, line: i + 1 });
      }
    } catch (err) {
      issues.push({ kind: "bad_json", detail: `Line ${i + 1} is not valid JSON (${(err as Error).message})`, sourceFile, line: i + 1 });
    }
  });

  // A pretty-printed single JSON object spans many lines; retry as one document.
  if (!records.length && trimmed.startsWith("{")) {
    const doc = fromJsonDocument(trimmed, sourceFile);
    if (doc) return { records: doc, issues: [] };
  }
  return { records, issues };
}

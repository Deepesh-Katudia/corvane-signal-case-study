import { parse as parseCsv } from "csv-parse/sync";
import type { Prompt } from "../types";

export function parsePrompts(csv: string): Prompt[] {
  const rows = parseCsv(csv.replace(/^﻿/, ""), { columns: true, skip_empty_lines: true, trim: true }) as Record<string, string>[];
  return rows
    .map((r) => ({
      id: (r.prompt_id ?? r.id ?? "").toUpperCase(),
      question: r.question ?? r.prompt ?? "",
      stage: (r.stage ?? "unknown").trim(),
      priority: Number.parseInt(r.priority ?? "1", 10) || 1,
    }))
    .filter((p) => p.id);
}

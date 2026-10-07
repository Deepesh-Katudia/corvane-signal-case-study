import type { EngineConfig, IngestIssue, NormalizedResponse } from "../types";
import { canonicalizeKeys } from "./fieldAliases";
import { decodeEntities, isNoError, toCitations, toInt, toText, toWeek } from "./coerce";
import { parseDate, resolveAmbiguous, type ParsedDate } from "./dates";
import { canonicalEngine } from "./engines";
import type { RawRecord } from "./parseFile";

const WEEK_MS = 7 * 24 * 3600 * 1000;
const STANDARD_SCHEMA = new Set(["response_id", "week", "engine", "prompt_id", "run", "collected_at", "response_text", "citations", "error"]);

interface Draft {
  rec: RawRecord;
  responseId: string;
  week: number | null;
  engine: string;
  promptId: string;
  run: number | null;
  date: ParsedDate;
  text: string;
  citations: string[];
  error: string | null;
}

function toDraft(rec: RawRecord, engines: EngineConfig[], issues: IngestIssue[]): Draft | null {
  const { fields, unknownKeys } = canonicalizeKeys(rec.raw);
  const base = { sourceFile: rec.sourceFile, line: rec.line };
  const responseId = toText(fields.responseId).trim();
  if (!responseId) {
    issues.push({ kind: "missing_field", detail: "Row has no response id; skipped", ...base });
    return null;
  }
  const variantKeys = Object.keys(rec.raw).filter((k) => !STANDARD_SCHEMA.has(k));
  if (variantKeys.length) {
    issues.push({ kind: "schema_variant", detail: `Non-standard field names: ${variantKeys.join(", ")}`, responseId, ...base });
  }
  if (unknownKeys.length) {
    issues.push({ kind: "schema_variant", detail: `Ignored unknown fields: ${unknownKeys.join(", ")}`, responseId, ...base });
  }
  for (const f of ["week", "run"] as const) {
    if (typeof fields[f] === "string") {
      issues.push({ kind: "type_coerced", detail: `${f} given as text "${String(fields[f])}"`, responseId, ...base });
    }
  }
  const rawEngine = toText(fields.engine);
  const { engine, known } = canonicalEngine(rawEngine, engines);
  if (!known) issues.push({ kind: "unknown_engine", detail: `Unrecognised engine "${rawEngine}" kept as "${engine}"`, responseId, ...base });
  return {
    rec,
    responseId,
    week: toWeek(fields.week),
    engine,
    promptId: toText(fields.promptId).trim().toUpperCase(),
    run: toInt(fields.run),
    date: parseDate(fields.collectedAt),
    text: decodeEntities(toText(fields.text)).trim(),
    citations: toCitations(fields.citations),
    error: isNoError(fields.error) ? null : toText(fields.error),
  };
}

/** Median timestamp per week (from unambiguous dates), used to resolve DD/MM vs MM/DD and missing weeks. */
function weekAnchors(drafts: Draft[]): { anchor: (week: number) => number | null; weekOf: (ms: number) => number | null } {
  const byWeek = new Map<number, number[]>();
  for (const d of drafts) {
    if (d.week !== null && d.date.iso && !d.date.ambiguous) {
      byWeek.set(d.week, [...(byWeek.get(d.week) ?? []), Date.parse(d.date.iso)]);
    }
  }
  const medians = [...byWeek.entries()].map(([w, ts]) => [w, [...ts].sort((a, b) => a - b)[Math.floor(ts.length / 2)]] as const);
  if (!medians.length) return { anchor: () => null, weekOf: () => null };
  const [w0, t0] = medians.reduce((a, b) => (a[0] <= b[0] ? a : b));
  const exact = new Map(medians);
  return {
    anchor: (week) => exact.get(week) ?? t0 + (week - w0) * WEEK_MS,
    weekOf: (ms) => w0 + Math.round((ms - t0) / WEEK_MS),
  };
}

function toNormalized(d: Draft, week: number, collectedAt: string | null): NormalizedResponse {
  const ok = !d.error && d.text.length > 0;
  return {
    responseId: d.responseId,
    week,
    engine: d.engine,
    promptId: d.promptId,
    run: d.run,
    collectedAt,
    text: d.text,
    citations: d.citations,
    ok,
    error: d.error ?? (d.text ? null : "empty_text"),
    sourceFile: d.rec.sourceFile,
  };
}

export interface NormalizeResult {
  responses: NormalizedResponse[];
  issues: IngestIssue[];
}

export function normalizeRecords(records: RawRecord[], engines: EngineConfig[], knownPromptIds?: Set<string>): NormalizeResult {
  const issues: IngestIssue[] = [];
  const drafts = records.map((r) => toDraft(r, engines, issues)).filter((d): d is Draft => d !== null);
  const { anchor, weekOf } = weekAnchors(drafts);

  const seen = new Map<string, NormalizedResponse>();
  for (const d of drafts) {
    const base = { sourceFile: d.rec.sourceFile, line: d.rec.line, responseId: d.responseId };
    let week = d.week;
    if (week === null && d.date.iso) {
      week = weekOf(Date.parse(d.date.iso));
      if (week !== null) issues.push({ kind: "missing_field", detail: `Week missing; inferred week ${week} from collection date`, ...base });
    }
    if (week === null) {
      // Still exported (mentions/wrong facts) but left out of weekly scores.
      issues.push({ kind: "missing_field", detail: "No week and no usable date; kept as week 0 (exported, not scored)", ...base });
      week = 0;
    }
    if (knownPromptIds && !knownPromptIds.has(d.promptId)) {
      issues.push({ kind: "unknown_prompt", detail: `Prompt "${d.promptId}" is not in prompts.csv`, ...base });
    }
    if (d.error) issues.push({ kind: "error_row", detail: `Collector error: ${d.error}`, ...base });
    else if (!d.text) issues.push({ kind: "empty_text", detail: "Answer text is empty", ...base });

    const normalized = toNormalized(d, week, resolveAmbiguous(d.date, anchor(week)));
    const prior = seen.get(d.responseId);
    if (prior) {
      // Keep whichever copy actually has an answer; otherwise keep the first.
      const replace = !prior.ok && normalized.ok;
      issues.push({ kind: "duplicate", detail: `Duplicate response_id; ${replace ? "kept the later copy (earlier had no answer)" : "kept the first copy"}`, ...base });
      if (replace) seen.set(d.responseId, normalized);
      continue;
    }
    seen.set(d.responseId, normalized);
  }

  return { responses: assignMissingRuns([...seen.values()]), issues };
}

/** Rows missing a run number get the next free number within their (week, engine, prompt) cell. */
function assignMissingRuns(responses: NormalizedResponse[]): NormalizedResponse[] {
  const used = new Map<string, Set<number>>();
  const cell = (r: NormalizedResponse) => `${r.week}|${r.engine}|${r.promptId}`;
  for (const r of responses) if (r.run !== null) used.set(cell(r), (used.get(cell(r)) ?? new Set<number>()).add(r.run));
  return responses.map((r) => {
    if (r.run !== null) return r;
    const taken = used.get(cell(r)) ?? new Set<number>();
    let n = 1;
    while (taken.has(n)) n++;
    used.set(cell(r), taken.add(n));
    return { ...r, run: n };
  });
}

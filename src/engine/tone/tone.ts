import type { Tone } from "../types";
import type { AttributedUnit } from "../detect/attribution";
import { refersBack } from "../detect/attribution";
import { baseTone, CONTRAST } from "./lexicon";

export interface ToneVerdict {
  tone: Tone;
  evidence: string | null;
}

/** Strip markdown labels such as "**If compliance is your main concern:**" or "**Bottom line:**". */
function stripLabels(text: string): string {
  return text
    .replace(/^\s*(?:[-*•]|\d+\.)\s+/, "")
    .replace(/\*\*[^*]{1,80}?:\*\*\s*/g, "")
    .replace(/\*\*[^*]{1,60}\*\*:\s*/g, "")
    .replace(/\[\d+\]/g, "");
}

/** Tone of one stretch of text; whatever follows the last "but/though/however" has the final say. */
export function classifyText(text: string): Tone | null {
  const clean = stripLabels(text);
  const cuts = [...clean.matchAll(CONTRAST)];
  if (cuts.length) {
    const last = cuts[cuts.length - 1];
    const tail = clean.slice(last.index! + last[0].length);
    const tailTone = baseTone(tail);
    if (tailTone) return tailTone;
  }
  return baseTone(clean);
}

/** For sentences naming several companies, each one is judged on its own stretch of the sentence. */
function windowFor(unit: AttributedUnit, idx: number): string {
  const span = unit.spans[idx];
  const prev = unit.spans.filter((s, i) => i < idx && s.entity !== span.entity).pop();
  const next = unit.spans.find((s, i) => i > idx && s.entity !== span.entity);
  const from = prev ? prev.end : unit.start;
  const to = next ? next.start : unit.end;
  return unit.text.slice(from - unit.start, to - unit.start);
}

function unitVerdicts(unit: AttributedUnit): Array<[string, Tone]> {
  if (unit.kind === "table_row" && unit.cells && unit.spans.length) {
    const tone = classifyText(unit.cells[unit.cells.length - 1] ?? "");
    return tone ? [[unit.spans[0].entity, tone]] : [];
  }
  if (unit.spans.length === 0) {
    if (!refersBack(unit)) return [];
    const tone = classifyText(unit.text);
    return tone ? [[unit.referent!, tone]] : [];
  }
  const entities = [...new Set(unit.spans.map((s) => s.entity))];
  if (entities.length === 1) {
    const tone = classifyText(unit.text);
    return tone ? [[entities[0], tone]] : [];
  }
  const out: Array<[string, Tone]> = [];
  for (const entity of entities) {
    const idx = unit.spans.findIndex((s) => s.entity === entity);
    const tone = classifyText(windowFor(unit, idx));
    if (tone) out.push([entity, tone]);
  }
  return out;
}

/**
 * Final-verdict tone for every mentioned brand: the last sentence that passes judgement on the brand
 * wins; a brand that is named but never judged is neutral.
 */
export function brandTones(units: AttributedUnit[], mentioned: Iterable<string>): Map<string, ToneVerdict> {
  const result = new Map<string, ToneVerdict>();
  for (const b of mentioned) result.set(b, { tone: "neutral", evidence: null });
  for (const unit of units) {
    for (const [entity, tone] of unitVerdicts(unit)) {
      if (result.has(entity)) result.set(entity, { tone, evidence: unit.text });
    }
  }
  return result;
}

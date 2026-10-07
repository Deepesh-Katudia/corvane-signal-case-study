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

/** Clause boundaries: commas, semicolons, colons and "so/while/whereas" joins. */
const CLAUSE_BREAK = /[,;]\s+|:\s+|\s+(?:so|while|whereas)\s+/g;
/** In "X is better than Y" / "pick X over Y", the verdict belongs to the company before the comparison word. */
const COMPARISON = /\b(?:than|over|versus|vs\.?)\b/i;

interface Clause {
  start: number;
  end: number;
  text: string;
}

function clausesOf(unit: AttributedUnit): Clause[] {
  const out: Clause[] = [];
  let from = 0;
  const push = (to: number) => {
    if (to > from) out.push({ start: unit.start + from, end: unit.start + to, text: unit.text.slice(from, to) });
  };
  for (const m of unit.text.matchAll(CLAUSE_BREAK)) {
    push(m.index!);
    from = m.index! + m[0].length;
  }
  push(unit.text.length);
  return out;
}

/**
 * Judge a sentence clause by clause. A clause naming a company judges that company; a clause naming none
 * ("..., so I'd skip it", "..., though reviewers mention a clunky app") judges the company named last in the
 * sentence, or the next one if none has been named yet ("If I had to pick one, it would be X").
 */
function sentenceVerdicts(unit: AttributedUnit): Array<[string, Tone]> {
  const out: Array<[string, Tone]> = [];
  let last: string | null = null;
  let pending: Tone[] = [];
  for (const clause of clausesOf(unit)) {
    const spans = unit.spans.filter((sp) => sp.start >= clause.start && sp.end <= clause.end);
    const tone = classifyText(clause.text);
    if (!spans.length) {
      if (!tone) continue;
      if (last) out.push([last, tone]);
      else pending = [...pending, tone];
      continue;
    }
    const cmp = clause.text.search(COMPARISON);
    const cmpAt = cmp >= 0 ? clause.start + cmp : Infinity;
    const subjects = [...new Set(spans.filter((sp) => sp.start < cmpAt).map((sp) => sp.entity))];
    for (const t of pending) out.push([subjects[0] ?? spans[0].entity, t]);
    pending = [];
    if (tone) for (const e of subjects.length ? subjects : [spans[0].entity]) out.push([e, tone]);
    last = spans[spans.length - 1].entity;
  }
  return out;
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
  return sentenceVerdicts(unit);
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

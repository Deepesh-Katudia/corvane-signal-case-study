export type UnitKind = "sentence" | "table_row";

/** A sentence (or table row) with its character range in the answer text. */
export interface Unit {
  text: string;
  start: number;
  end: number;
  line: number;
  /** Paragraph index; blank lines start a new paragraph. Pronouns never cross paragraphs. */
  paragraph: number;
  kind: UnitKind;
  /** Table rows only: the cell texts. */
  cells?: string[];
}

const TABLE_SEPARATOR = /^\|?\s*:?-{2,}/;
// A sentence ends at . ! or ? followed by whitespace...
const SENTENCE_END = /[.!?](?=\s+)/g;
// ...unless the dot closes a list number at the start of the line ("1. **Trakvia**: ...").
const LIST_NUMBER = /^\s*\d{1,2}$/;

function splitSentences(line: string, offset: number, lineNo: number, paragraph: number): Unit[] {
  const units: Unit[] = [];
  let from = 0;
  const push = (to: number) => {
    const raw = line.slice(from, to);
    const lead = raw.length - raw.trimStart().length;
    const text = raw.trim();
    if (text) units.push({ text, start: offset + from + lead, end: offset + from + lead + text.length, line: lineNo, paragraph, kind: "sentence" });
  };
  for (const m of line.matchAll(SENTENCE_END)) {
    if (LIST_NUMBER.test(line.slice(0, m.index!))) continue;
    push(m.index! + 1);
    from = m.index! + 1;
  }
  push(line.length);
  return units;
}

export function segment(text: string): Unit[] {
  const units: Unit[] = [];
  let offset = 0;
  let paragraph = 0;
  text.split("\n").forEach((line, lineNo) => {
    const trimmed = line.trim();
    if (!trimmed) {
      paragraph++;
    } else if (trimmed.startsWith("|")) {
      if (!TABLE_SEPARATOR.test(trimmed.replace(/^\|\s*/, "|"))) {
        const cells = trimmed.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
        const lead = line.indexOf(trimmed);
        units.push({ text: trimmed, start: offset + lead, end: offset + lead + trimmed.length, line: lineNo, paragraph, kind: "table_row", cells });
      }
    } else {
      units.push(...splitSentences(line, offset, lineNo, paragraph));
    }
    offset += line.length + 1;
  });
  return units;
}

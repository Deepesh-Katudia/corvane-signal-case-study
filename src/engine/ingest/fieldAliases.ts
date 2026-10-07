/**
 * Every field we need, and the names it has been seen under (or plausibly could be).
 * Matching is case-insensitive and ignores "_", "-" and spaces.
 */
export const FIELD_ALIASES = {
  responseId: ["response_id", "id", "answer_id", "uuid"],
  week: ["week", "week_number", "week_no", "wk"],
  engine: ["engine", "model", "platform", "source_engine", "ai_engine"],
  promptId: ["prompt_id", "question_id", "prompt", "query_id"],
  run: ["run", "run_number", "run_no", "attempt", "sample"],
  collectedAt: ["collected_at", "collected", "timestamp", "date", "created_at", "fetched_at"],
  text: ["response_text", "answer", "text", "response", "output", "content", "answer_text"],
  citations: ["citations", "sources", "references", "links", "urls"],
  error: ["error", "error_message", "failure"],
} as const;

export type CanonicalField = keyof typeof FIELD_ALIASES;

export const squash = (s: string): string => s.toLowerCase().replace(/[\s_\-.]/g, "");

const LOOKUP: Map<string, CanonicalField> = new Map(
  (Object.entries(FIELD_ALIASES) as Array<[CanonicalField, readonly string[]]>).flatMap(([field, names]) =>
    names.map((n) => [squash(n), field] as [string, CanonicalField]),
  ),
);

/** Map a raw record's keys onto canonical field names. The first matching key wins. */
export function canonicalizeKeys(raw: Record<string, unknown>): {
  fields: Partial<Record<CanonicalField, unknown>>;
  unknownKeys: string[];
} {
  // For each field, the earliest alias in FIELD_ALIASES wins ("response_id" beats a generic "id").
  const bySquashed = new Map(Object.keys(raw).map((k) => [squash(k), k]));
  const fields: Partial<Record<CanonicalField, unknown>> = {};
  for (const [field, names] of Object.entries(FIELD_ALIASES) as Array<[CanonicalField, readonly string[]]>) {
    const key = names.map((n) => bySquashed.get(squash(n))).find((k) => k !== undefined);
    if (key !== undefined) fields[field] = raw[key];
  }
  const unknownKeys = Object.keys(raw).filter((k) => !LOOKUP.has(squash(k)));
  return { fields, unknownKeys };
}

const GENERIC_SUFFIXES = new Set(["fleet", "systems", "system", "inc", "llc", "ltd", "technologies", "tech", "software", "group", "co"]);

/** "Corvane Fleet" -> "corvane", "Gridwell Systems" -> "gridwell" (matches facts.json keys and the export spec). */
export function deriveBrandKey(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? name;
  return first.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Short form of a name with generic company suffixes removed ("Gridwell Systems" -> "Gridwell"). */
export function coreName(name: string): string {
  const tokens = name.trim().split(/\s+/);
  const kept = tokens.filter((t, i) => i === 0 || !GENERIC_SUFFIXES.has(t.toLowerCase()));
  return kept.join(" ");
}

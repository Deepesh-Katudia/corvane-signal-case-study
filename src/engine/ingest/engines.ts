import type { EngineConfig } from "../types";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function canonicalEngine(raw: string, engines: EngineConfig[]): { engine: string; known: boolean } {
  const n = norm(raw);
  for (const e of engines) {
    if (norm(e.canonical) === n || e.aliases.some((a) => norm(a) === n)) return { engine: e.canonical, known: true };
  }
  return { engine: raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_") || "unknown", known: false };
}

export function engineLabel(canonical: string, engines: EngineConfig[]): string {
  return engines.find((e) => e.canonical === canonical)?.label ?? canonical;
}

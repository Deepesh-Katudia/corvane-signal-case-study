import fs from "node:fs";
import path from "node:path";
import type { AppConfig, BrandConfig, BrandFacts, EngineConfig, ScoringConfig } from "../types";
import { deriveBrandKey } from "./brandKeys";

interface BrandsFile {
  client: { name: string; website: string; key?: string };
  tracked_competitors?: Array<{ name: string; website: string; key?: string }>;
  other_companies?: Array<{ name: string; website: string; key?: string }>;
}

interface AliasesFile {
  brands?: Record<string, { aliases?: string[]; exclusions?: string[] }>;
}

function readJson<T>(file: string, fallback?: T): T {
  if (!fs.existsSync(file)) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Required config file not found: ${file}`);
  }
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch (err) {
    throw new Error(`Config file ${file} is not valid JSON: ${(err as Error).message}`);
  }
}

export function buildBrands(brandsFile: BrandsFile, aliasesFile: AliasesFile): BrandConfig[] {
  if (!brandsFile.client?.name) throw new Error("brands.json must define client.name");
  const entries: Array<[BrandsFile["client"], BrandConfig["tier"]]> = [
    [brandsFile.client, "client"],
    ...(brandsFile.tracked_competitors ?? []).map((b) => [b, "tracked"] as [BrandsFile["client"], BrandConfig["tier"]]),
    ...(brandsFile.other_companies ?? []).map((b) => [b, "other"] as [BrandsFile["client"], BrandConfig["tier"]]),
  ];
  return entries.map(([b, tier]) => {
    const key = b.key ?? deriveBrandKey(b.name);
    const extra = aliasesFile.brands?.[key] ?? {};
    return {
      key,
      name: b.name,
      website: b.website,
      tier,
      aliases: extra.aliases ?? [],
      exclusions: extra.exclusions ?? [],
    };
  });
}

export function loadConfig(configDir = path.join(process.cwd(), "config")): AppConfig {
  const brands = buildBrands(
    readJson<BrandsFile>(path.join(configDir, "brands.json")),
    readJson<AliasesFile>(path.join(configDir, "aliases.json"), {}),
  );
  const rawFacts = readJson<Record<string, unknown>>(path.join(configDir, "facts.json"), {});
  const facts: Record<string, BrandFacts> = {};
  for (const [k, v] of Object.entries(rawFacts)) {
    if (!k.startsWith("_") && v && typeof v === "object") facts[k] = v as BrandFacts;
  }
  const engines = readJson<{ engines: EngineConfig[] }>(path.join(configDir, "engines.json")).engines;
  const scoring = readJson<ScoringConfig>(path.join(configDir, "scoring.json"));
  const settings = readJson<{ perspective?: string }>(path.join(configDir, "settings.json"), {});
  const perspective = settings.perspective ?? brands.find((b) => b.tier === "client")!.key;
  if (!brands.some((b) => b.key === perspective)) {
    throw new Error(`settings.json perspective "${perspective}" is not a brand in brands.json`);
  }
  return { brands, facts, engines, scoring, perspective };
}

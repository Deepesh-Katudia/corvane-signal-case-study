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

/** The data pack files the tool needs but does not ship with (they are supplied by the client). */
export const DATA_PACK_FILES = ["brands.json", "facts.json", "prompts.csv", "responses.jsonl"] as const;

export const DATA_PACK_HELP =
  "Copy the four data pack files (brands.json, facts.json, prompts.csv, responses.jsonl) from corvane_data_pack into the data/ folder. See README.md, 'Run it'.";

/** brands.json / facts.json come with the data pack and live in data/; config/ copies still work as an override. */
function packFile(name: string, dataDir: string, configDir: string): string {
  const inConfig = path.join(configDir, name);
  if (fs.existsSync(inConfig)) return inConfig;
  const inData = path.join(dataDir, name);
  if (!fs.existsSync(inData)) throw new Error(`${name} not found in ${dataDir}. ${DATA_PACK_HELP}`);
  return inData;
}

/** Data pack files missing from a data folder (empty when ready to run). */
export function missingDataPackFiles(dataDir = path.join(process.cwd(), "data")): string[] {
  const has = (n: string) => fs.existsSync(path.join(dataDir, n));
  return DATA_PACK_FILES.filter((n) => !has(n) && !(n.endsWith(".json") && fs.existsSync(path.join(process.cwd(), "config", n))));
}

export function loadConfig(configDir = path.join(process.cwd(), "config"), dataDir = path.join(process.cwd(), "data")): AppConfig {
  const brands = buildBrands(
    readJson<BrandsFile>(packFile("brands.json", dataDir, configDir)),
    readJson<AliasesFile>(path.join(configDir, "aliases.json"), {}),
  );
  const rawFacts = readJson<Record<string, unknown>>(packFile("facts.json", dataDir, configDir));
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

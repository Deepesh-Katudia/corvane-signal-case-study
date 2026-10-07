import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { DATA_DIR, getAnalysis, invalidateAnalysis } from "@/server/analysis";
import { allow, clientIp } from "@/server/rateLimit";
import { buildDataset } from "@/engine/ingest/loadDataset";
import { loadConfig } from "@/engine/config/loadConfig";
import { isXlsx, xlsxToJson } from "@/engine/ingest/xlsx";

const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED = /\.(jsonl|ndjson|json|csv|xlsx)$/i;
const UPLOADS_PER_MINUTE = 10;

const fail = (status: number, error: string) => NextResponse.json({ ok: false, error }, { status });

/** A safe file name inside data/ that never overwrites an existing week. */
function targetName(original: string): string {
  const base = path.basename(original).toLowerCase().replace(/[^a-z0-9._-]/g, "_").slice(0, 80);
  return fs.existsSync(path.join(DATA_DIR, base)) ? `${Date.now()}_${base}` : base;
}

/** Add a new week's file to data/. It is validated by parsing it before it is saved. */
export async function POST(req: Request) {
  if (!allow(`upload:${clientIp(req)}`, UPLOADS_PER_MINUTE, 60_000)) return fail(429, "Too many uploads; try again in a minute.");
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES + 64 * 1024) return fail(413, "File is larger than 4 MB.");

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, "Send the file as multipart form data.");
  }
  const file = form.get("file");
  if (!(file instanceof File)) return fail(400, "No file attached.");
  if (!ALLOWED.test(file.name)) return fail(400, "Use an .xlsx, .csv, .jsonl or .json file of AI answers.");
  if (/^prompts?\.csv$/i.test(file.name)) return fail(400, "That looks like the questions file; upload a responses file.");
  if (file.size > MAX_BYTES) return fail(413, "File is larger than 4 MB.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  let content: string;
  try {
    content = isXlsx(file.name) ? await xlsxToJson(bytes) : new TextDecoder().decode(bytes);
  } catch {
    return fail(422, "Could not read that spreadsheet; save it as .xlsx (Excel workbook) and try again.");
  }
  const probe = buildDataset([{ name: file.name, content }], null, loadConfig().engines);
  if (!probe.responses.length) {
    return fail(422, `No usable answers found (${probe.issues.slice(0, 3).map((i) => i.detail).join("; ") || "empty file"}).`);
  }

  try {
    fs.writeFileSync(path.join(DATA_DIR, targetName(file.name)), bytes, { flag: "wx" });
  } catch (err) {
    console.error("[upload] save failed:", (err as Error).message);
    return fail(500, "Could not save the file into the data folder.");
  }
  invalidateAnalysis();
  const { result } = await getAnalysis();
  return NextResponse.json({
    ok: true,
    added: probe.responses.length,
    weeks: [...new Set(probe.responses.map((r) => r.week))].sort((a, b) => a - b),
    issues: probe.issues.length,
    latestWeek: result.latestWeek,
  });
}

import fs from "node:fs";
import path from "node:path";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { DATA_DIR, getAnalysis, invalidateAnalysis } from "@/server/analysis";
import { getUploadStore } from "@/store/uploadStore";
import { allow } from "@/server/rateLimit";
import { buildDataset } from "@/engine/ingest/loadDataset";
import { loadConfig } from "@/engine/config/loadConfig";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = /\.(jsonl|ndjson|json|csv)$/i;
const UPLOADS_PER_MINUTE = 10;

const fail = (status: number, error: string) => NextResponse.json({ ok: false, error }, { status });

function tokenOk(given: string): boolean {
  const expected = process.env.UPLOAD_TOKEN;
  if (!expected) return true;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function safeName(original: string): string {
  const base = path.basename(original).toLowerCase().replace(/[^a-z0-9._-]/g, "_").slice(0, 80);
  const taken = fs.existsSync(path.join(DATA_DIR, base));
  return taken ? `${Date.now()}_${base}` : base;
}

/** Add a new week's file. It is validated by parsing it before it is stored. */
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!allow(`upload:${ip}`, UPLOADS_PER_MINUTE, 60_000)) return fail(429, "Too many uploads; try again in a minute.");

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, "Send the file as multipart form data.");
  }
  if (!tokenOk(String(form.get("token") ?? ""))) return fail(401, "Upload token missing or wrong.");
  const file = form.get("file");
  if (!(file instanceof File)) return fail(400, "No file attached.");
  if (!ALLOWED.test(file.name)) return fail(400, "Use a .jsonl, .json or .csv file of AI answers.");
  if (/^prompts?\.csv$/i.test(file.name)) return fail(400, "That looks like the questions file; upload a responses file.");
  if (file.size > MAX_BYTES) return fail(413, "File is larger than 5 MB.");

  const content = await file.text();
  const config = loadConfig();
  const probe = buildDataset([{ name: file.name, content }], null, config.engines);
  if (!probe.responses.length) {
    return fail(422, `No usable answers found (${probe.issues.slice(0, 3).map((i) => i.detail).join("; ") || "empty file"}).`);
  }

  const store = getUploadStore(DATA_DIR);
  try {
    await store.save({ name: safeName(file.name), content });
  } catch (err) {
    console.error("[upload] save failed", err);
    const readOnly = store.kind === "local" && (err as NodeJS.ErrnoException).code === "EROFS";
    return fail(503, readOnly ? "This deployment has read-only storage; configure Supabase to accept uploads." : "Could not store the file.");
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

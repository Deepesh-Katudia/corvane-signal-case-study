import path from "node:path";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { DATA_DIR, getAnalysis, invalidateAnalysis } from "@/server/analysis";
import { getUploadStore } from "@/store/uploadStore";
import { allow, clientIp } from "@/server/rateLimit";
import { buildDataset } from "@/engine/ingest/loadDataset";
import { loadConfig } from "@/engine/config/loadConfig";

const MAX_BYTES = 4 * 1024 * 1024;
const MAX_STORED_FILES = 60;
const ALLOWED = /\.(jsonl|ndjson|json|csv)$/i;
const UPLOADS_PER_MINUTE = 5;

const fail = (status: number, error: string) => NextResponse.json({ ok: false, error }, { status });

/** On a public deployment uploads require UPLOAD_TOKEN; locally they are open. Fails closed. */
function uploadsAllowed(given: string): "ok" | "disabled" | "bad_token" {
  const expected = process.env.UPLOAD_TOKEN;
  if (!expected) return process.env.VERCEL ? "disabled" : "ok";
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b) ? "ok" : "bad_token";
}

const safeName = (original: string) => path.basename(original).toLowerCase().replace(/[^a-z0-9._-]/g, "_").slice(0, 80);

/** Add a new week's file. It is validated by parsing it before it is stored; nothing is overwritten. */
export async function POST(req: Request) {
  if (!allow(`upload:${clientIp(req)}`, UPLOADS_PER_MINUTE, 60_000)) return fail(429, "Too many uploads; try again in a minute.");
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES + 64 * 1024) return fail(413, "File is larger than 4 MB.");

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, "Send the file as multipart form data.");
  }
  const gate = uploadsAllowed(String(form.get("token") ?? ""));
  if (gate === "disabled") return fail(403, "Uploads are disabled on this deployment (no UPLOAD_TOKEN configured).");
  if (gate === "bad_token") return fail(401, "Upload token missing or wrong.");

  const file = form.get("file");
  if (!(file instanceof File)) return fail(400, "No file attached.");
  if (!ALLOWED.test(file.name)) return fail(400, "Use a .jsonl, .json or .csv file of AI answers.");
  if (/^prompts?\.csv$/i.test(file.name)) return fail(400, "That looks like the questions file; upload a responses file.");
  if (file.size > MAX_BYTES) return fail(413, "File is larger than 4 MB.");

  const content = await file.text();
  const config = loadConfig();
  const probe = buildDataset([{ name: file.name, content }], null, config.engines);
  if (!probe.responses.length) {
    return fail(422, `No usable answers found (${probe.issues.slice(0, 3).map((i) => i.detail).join("; ") || "empty file"}).`);
  }

  const store = getUploadStore(DATA_DIR);
  try {
    if ((await store.count()) >= MAX_STORED_FILES) return fail(507, "Upload limit reached for this deployment.");
    await store.save({ name: safeName(file.name), content });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    console.error("[upload] save failed:", (err as Error).message);
    const readOnly = store.kind === "local" && (code === "EROFS" || code === "EACCES");
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

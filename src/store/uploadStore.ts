import fs from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { SourceFile } from "@/engine/ingest/loadDataset";

/** Where newly uploaded weekly files live. Bundled data/ files are always read in addition. */
export interface UploadStore {
  readonly kind: "local" | "supabase";
  list(): Promise<SourceFile[]>;
  save(file: SourceFile): Promise<void>;
}

const UPLOADS_TABLE = "response_uploads";

/** Local mode: uploads are written into data/ so the CLI and the app both pick them up. */
class LocalUploadStore implements UploadStore {
  readonly kind = "local" as const;
  constructor(private readonly dir: string) {}
  async list(): Promise<SourceFile[]> {
    return []; // data/ is read directly by the dataset loader
  }
  async save(file: SourceFile): Promise<void> {
    fs.writeFileSync(path.join(this.dir, file.name), file.content, "utf8");
  }
}

class SupabaseUploadStore implements UploadStore {
  readonly kind = "supabase" as const;
  constructor(private readonly client: SupabaseClient) {}
  async list(): Promise<SourceFile[]> {
    const { data, error } = await this.client.from(UPLOADS_TABLE).select("name, content").order("created_at", { ascending: true });
    if (error) throw new Error(`Could not load uploads from Supabase: ${error.message}`);
    return (data ?? []).map((r) => ({ name: String(r.name), content: String(r.content) }));
  }
  async save(file: SourceFile): Promise<void> {
    const { error } = await this.client.from(UPLOADS_TABLE).upsert({ name: file.name, content: file.content }, { onConflict: "name" });
    if (error) throw new Error(`Could not save upload to Supabase: ${error.message}`);
  }
}

let cached: UploadStore | null = null;

export function getUploadStore(dataDir: string): UploadStore {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  cached = url && key ? new SupabaseUploadStore(createClient(url, key, { auth: { persistSession: false } })) : new LocalUploadStore(dataDir);
  return cached;
}

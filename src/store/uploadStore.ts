import fs from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { SourceFile } from "@/engine/ingest/loadDataset";

/** Where newly uploaded weekly files live. Bundled data/ files are always read in addition. */
export interface UploadStore {
  readonly kind: "local" | "supabase";
  list(): Promise<SourceFile[]>;
  count(): Promise<number>;
  /** Stores a new file and never overwrites an existing one; returns the name it was stored under. */
  save(file: SourceFile): Promise<string>;
}

const UPLOADS_TABLE = "response_uploads";
const UNIQUE_VIOLATION = "23505";

const stamped = (name: string) => `${Date.now()}_${name}`;

/** Local mode: uploads are written into data/ so the CLI and the app both pick them up. */
class LocalUploadStore implements UploadStore {
  readonly kind = "local" as const;
  constructor(private readonly dir: string) {}
  async list(): Promise<SourceFile[]> {
    return []; // data/ is read directly by the dataset loader
  }
  async count(): Promise<number> {
    return fs.readdirSync(this.dir).length;
  }
  async save(file: SourceFile): Promise<string> {
    const name = fs.existsSync(path.join(this.dir, file.name)) ? stamped(file.name) : file.name;
    fs.writeFileSync(path.join(this.dir, name), file.content, { encoding: "utf8", flag: "wx" });
    return name;
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
  async count(): Promise<number> {
    const { count, error } = await this.client.from(UPLOADS_TABLE).select("id", { count: "exact", head: true });
    if (error) throw new Error(`Could not count uploads in Supabase: ${error.message}`);
    return count ?? 0;
  }
  async save(file: SourceFile): Promise<string> {
    for (const name of [file.name, stamped(file.name)]) {
      const { error } = await this.client.from(UPLOADS_TABLE).insert({ name, content: file.content });
      if (!error) return name;
      if (error.code !== UNIQUE_VIOLATION) throw new Error(`Could not save upload to Supabase: ${error.message}`);
    }
    throw new Error("Could not find a free name for the upload");
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

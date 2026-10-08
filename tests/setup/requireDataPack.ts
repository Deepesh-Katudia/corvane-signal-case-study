import path from "node:path";
import { DATA_PACK_HELP, missingDataPackFiles } from "../../src/engine/config/loadConfig";

/** The tests run against the real data pack, which is not committed. Fail early with instructions. */
export default function setup(): void {
  const missing = missingDataPackFiles(path.join(process.cwd(), "data"));
  if (missing.length) throw new Error(`Missing data pack files in data/: ${missing.join(", ")}. ${DATA_PACK_HELP}`);
}

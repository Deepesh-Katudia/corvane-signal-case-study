import Link from "next/link";
import { DATA_PACK_FILES, missingDataPackFiles } from "@/engine/config/loadConfig";
import { DATA_DIR } from "@/server/analysis";

export const dynamic = "force-dynamic";

/** Shown until the data pack has been copied into data/. */
export default function SetupPage() {
  const missing = new Set(missingDataPackFiles(DATA_DIR));
  const ready = missing.size === 0;
  return (
    <div className="space-y-6">
      <p className="kicker">Corvane Signal · setup</p>
      <h1 className="font-serif text-4xl tracking-tight">{ready ? "Data pack found" : "Add the data pack to get started"}</h1>
      {ready ? (
        <p>
          All four files are in place.{" "}
          <Link className="link font-medium" href="/">
            Open the Monday brief →
          </Link>
        </p>
      ) : (
        <>
          <p className="text-ink-2">
            The data pack is not included in this repository. Copy these four files from the <code>corvane_data_pack</code> folder into the project&apos;s <code>data/</code> folder,
            then reload this page:
          </p>
          <ul className="space-y-1 rounded-lg border border-rule bg-card p-4">
            {DATA_PACK_FILES.map((f) => (
              <li key={f} className="flex items-center justify-between gap-3 text-sm">
                <code>data/{f}</code>
                {missing.has(f) ? <span className="font-semibold text-drop">missing</span> : <span className="text-gain">found</span>}
              </li>
            ))}
          </ul>
          <pre className="overflow-x-auto rounded-lg border border-rule bg-card p-4 text-xs">{`# from the project folder (macOS / Linux / Git Bash)
cp path/to/corvane_data_pack/{brands.json,facts.json,prompts.csv,responses.jsonl} data/

# Windows PowerShell
Copy-Item path\\to\\corvane_data_pack\\* data\\ -Include brands.json,facts.json,prompts.csv,responses.jsonl`}</pre>
          <p className="text-sm text-ink-3">Nothing else needs configuring: no API keys, accounts or databases.</p>
        </>
      )}
    </div>
  );
}

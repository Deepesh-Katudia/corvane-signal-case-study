import { getAnalysis, resolvePerspective } from "@/server/analysis";
import { getUploadStore } from "@/store/uploadStore";
import { DATA_DIR } from "@/server/analysis";
import { UploadForm } from "@/components/UploadForm";
import { Card, Section } from "@/components/ui";
import { pct } from "@/lib/format";

const ISSUE_LABEL: Record<string, string> = {
  schema_variant: "Different field names (e.g. week 4 uses 'answer' and 'sources')",
  duplicate: "Duplicate answers removed",
  error_row: "Answers that failed to collect (timeouts)",
  empty_text: "Empty answers",
  type_coerced: "Numbers stored as text, converted",
  unknown_engine: "Unrecognised engine names",
  unknown_prompt: "Question IDs not in the questions file",
  bad_json: "Unreadable lines skipped",
  missing_field: "Missing fields filled in or skipped",
};

export default async function DataPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { result } = await getAnalysis();
  const focus = resolvePerspective(result, (await searchParams).as);
  const engineName = (e: string) => result.engines.find((x) => x.canonical === e)?.label ?? e;
  const byKind = [...new Map(result.issues.map((i) => [i.kind, result.issues.filter((x) => x.kind === i.kind)])).entries()];
  const storeKind = getUploadStore(DATA_DIR).kind;
  const asQ = focus !== result.perspective ? `?as=${focus}` : "";

  return (
    <div className="space-y-10 pt-4">
      <header className="rise">
        <p className="kicker">Data & exports</p>
        <h1 className="font-serif text-4xl tracking-tight">What went in, and what you can take out</h1>
      </header>

      <div className="grid gap-8 lg:grid-cols-2">
        <Section kicker="For the board report" title="Downloads">
          <ul className="space-y-2 text-sm">
            <li>
              <a className="link font-medium" href={`/api/export/board_report.xlsx${asQ}`}>
                Board report (Excel)
              </a>
              <span className="text-ink-2">: summary, weekly trend, questions, engines, wrong facts, sources and data notes on separate sheets.</span>
            </li>
            <li>
              <a className="link font-medium" href="/api/export/mentions.csv">
                mentions.csv
              </a>
              <span className="text-ink-2">: one row per answer per company (scoring export).</span>
            </li>
            <li>
              <a className="link font-medium" href="/api/export/wrong_facts.csv">
                wrong_facts.csv
              </a>
              <span className="text-ink-2">: every incorrect claim about Corvane and the tracked competitors.</span>
            </li>
          </ul>
        </Section>

        <Section kicker={storeKind === "supabase" ? "Stored in Supabase" : "Saved to the data folder"} title="Add a new week">
          <UploadForm needsToken={!!process.env.UPLOAD_TOKEN} />
          <p className="mt-2 text-xs text-ink-3">Field names, engine names and date formats may differ from earlier files; they are mapped automatically.</p>
        </Section>
      </div>

      <Section kicker={`${result.files.length} file(s): ${result.files.join(", ")}`} title="Weeks collected">
        <div className="overflow-x-auto rounded-lg border border-rule bg-card">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-rule text-left">
                {["Week", "Answers", "Failed", "Engines", "Coverage", "Status"].map((h) => (
                  <th key={h} className="p-3 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.weeks.map((w) => (
                <tr key={w.week} className="border-b border-rule/60 last:border-0">
                  <td className="num p-3">{w.week}</td>
                  <td className="num p-3">{w.answers}</td>
                  <td className="num p-3">{w.failed}</td>
                  <td className="p-3">{w.engines.map(engineName).join(", ")}</td>
                  <td className="num p-3">{pct(w.coverage)}</td>
                  <td className="p-3">
                    {w.partial ? (
                      <span className="rounded bg-warn-soft px-1.5 py-0.5 text-xs font-semibold text-warn">Incomplete: no {w.missingEngines.map(engineName).join(", ") || "full question set"}</span>
                    ) : (
                      <span className="text-xs text-gain">Complete</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section kicker={`${result.issues.length} issues handled automatically`} title="Messy data, and what we did about it">
        <div className="grid gap-3 md:grid-cols-2">
          {byKind.map(([kind, items]) => (
            <Card key={kind}>
              <p className="flex items-baseline justify-between gap-2 font-medium">
                {ISSUE_LABEL[kind] ?? kind} <span className="num text-sm text-ink-3">{items.length}</span>
              </p>
              <p className="mt-1 text-xs text-ink-2">
                e.g. {items[0].detail}
                {items[0].responseId ? ` (${items[0].responseId})` : ""}
              </p>
            </Card>
          ))}
        </div>
      </Section>

      <Section kicker="Method" title="How the numbers are made">
        <div className="grid gap-6 text-sm leading-relaxed text-ink-2 md:grid-cols-3">
          <p>
            <strong className="text-ink">Mentions.</strong> A company counts as mentioned when the answer text uses its name, a variant (TrakVia, Route Lyne, CorvaneFleet), an obvious
            misspelling or its website. Citations never count. Corvane Logistics, a different company, is excluded. Position is the order companies are first named.
          </p>
          <p>
            <strong className="text-ink">Tone.</strong> Each sentence is matched against phrases for recommending, criticising and advising against. Words after
            &ldquo;but&rdquo; or &ldquo;though&rdquo; get the final say, follow-up sentences like &ldquo;Even so, it&rsquo;s the one I&rsquo;d pick&rdquo; apply to the company just
            named, and the last verdict in the answer wins.
          </p>
          <p>
            <strong className="text-ink">Score and change.</strong> Points per answer (100/50/25/0 by tone, a little less when named later), averaged with important questions counting
            more. Week-on-week changes compare only questions and engines collected in both weeks, and are called real only when larger than 95% of the changes produced by shuffling
            the runs.
          </p>
        </div>
      </Section>
    </div>
  );
}

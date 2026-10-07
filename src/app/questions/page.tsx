import Link from "next/link";
import { getAnalysis, resolvePerspective } from "@/server/analysis";
import { Filters } from "@/components/Filters";
import { Empty, Section, ToneChip } from "@/components/ui";
import { STAGE_LABEL, TONE_LABEL, TONE_VAR, pct, withAs } from "@/lib/format";
import type { AnalyzedResponse } from "@/engine/types";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

function RunDots({ runs, brand }: { runs: AnalyzedResponse[]; brand: string }) {
  if (!runs.length) return <span className="text-xs text-ink-3">no data</span>;
  return (
    <span className="flex gap-1">
      {runs.map((r) => {
        const m = r.mentions.find((x) => x.brand === brand);
        const color = m?.tone ? TONE_VAR[m.tone] : undefined;
        return (
          <span
            key={r.responseId}
            title={!r.ok ? "Collection failed" : m?.mentioned ? `#${m.position}, ${m.tone}` : "Not mentioned"}
            className="h-3.5 w-3.5 rounded-full border"
            style={color ? { background: color, borderColor: color } : { borderColor: "var(--ink-3)", borderStyle: r.ok ? "solid" : "dashed" }}
          />
        );
      })}
    </span>
  );
}

export default async function QuestionsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { result } = await getAnalysis();
  const focus = resolvePerspective(result, sp.as);
  const name = (k: string) => result.brands.find((b) => b.key === k)?.name ?? k;
  const engines = [...new Set(result.responses.map((r) => r.engine))].sort();
  const engineName = (e: string) => result.engines.find((x) => x.canonical === e)?.label ?? e;

  const week = one(sp.week) || String(result.latestWeek ?? "");
  const engine = one(sp.engine);
  const stage = one(sp.stage);
  const prompt = one(sp.prompt);
  const company = one(sp.company);
  const shown = one(sp.shown);

  const prompts = result.prompts.filter((p) => (!stage || p.stage === stage) && (!prompt || p.id === prompt));
  const promptIds = new Set(prompts.map((p) => p.id));
  const answers = result.responses.filter(
    (r) =>
      (week === "all" || String(r.week) === week) &&
      (!engine || r.engine === engine) &&
      promptIds.has(r.promptId) &&
      (!company || (shown === "missing" ? !r.mentions.find((m) => m.brand === company)?.mentioned : r.mentions.find((m) => m.brand === company)?.mentioned)),
  );
  const matrixWeekAnswers = result.responses.filter((r) => week === "all" || String(r.week) === week);
  const recentWeeks = result.weeks.map((w) => w.week).slice(-4);
  const question = new Map(result.prompts.map((p) => [p.id, p]));
  const hidden: Record<string, string> = focus !== result.perspective ? { as: focus } : {};

  return (
    <div className="space-y-8 pt-4">
      <header className="rise">
        <p className="kicker">For Priya · detail view</p>
        <h1 className="font-serif text-4xl tracking-tight">Which questions {name(focus)} shows up for</h1>
        <p className="mt-2 max-w-3xl text-ink-2">
          Each dot is one AI answer (two runs per engine per week), coloured by how it treated {name(focus)}. Hollow means not mentioned; dashed means the answer failed to collect.
          Click a question to see the actual answers.
        </p>
      </header>

      <Filters
        hidden={hidden}
        filters={[
          { name: "week", label: "Week", value: week, options: [...result.weeks.map((w) => ({ value: String(w.week), label: `Week ${w.week}${w.partial ? " (incomplete)" : ""}` })), { value: "all", label: "All weeks" }] },
          { name: "engine", label: "Engine", value: engine, options: [{ value: "", label: "All engines" }, ...engines.map((e) => ({ value: e, label: engineName(e) }))] },
          { name: "stage", label: "Buying stage", value: stage, options: [{ value: "", label: "All stages" }, ...Object.entries(STAGE_LABEL).map(([v, l]) => ({ value: v, label: l }))] },
          { name: "prompt", label: "Question", value: prompt, options: [{ value: "", label: "All questions" }, ...result.prompts.map((p) => ({ value: p.id, label: `${p.id} · ${p.question.slice(0, 48)}` }))] },
          { name: "company", label: "Company", value: company, options: [{ value: "", label: "Any company" }, ...result.brands.map((b) => ({ value: b.key, label: b.name }))] },
          { name: "shown", label: "Company is", value: shown, options: [{ value: "", label: "Mentioned" }, { value: "missing", label: "Not mentioned" }] },
        ]}
      />

      <Section
        kicker={week === "all" ? "All weeks" : `Week ${week}`}
        title="Coverage by question and engine"
        aside={
          <ul className="flex flex-wrap gap-3 text-xs text-ink-2" aria-label="Legend">
            {(["recommended", "neutral", "negative", "not_recommended"] as const).map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full" style={{ background: TONE_VAR[t] }} aria-hidden />
                {TONE_LABEL[t]}
              </li>
            ))}
            <li className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full border border-ink-3" aria-hidden />
              Not mentioned
            </li>
          </ul>
        }
      >
        <div className="overflow-x-auto rounded-lg border border-rule bg-card">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-rule text-left">
                <th className="p-3 font-medium">Buyer question</th>
                <th className="p-3 font-medium">Priority</th>
                {engines.map((e) => (
                  <th key={e} className="p-3 font-medium">
                    {engineName(e)}
                  </th>
                ))}
                <th className="p-3 text-right font-medium">Mentioned, last 4 wks</th>
              </tr>
            </thead>
            <tbody>
              {prompts.map((p) => {
                const recent = result.responses.filter((r) => r.ok && r.promptId === p.id && recentWeeks.includes(r.week));
                const rate = recent.length ? recent.filter((r) => r.mentions.find((m) => m.brand === focus)?.mentioned).length / recent.length : 0;
                return (
                  <tr key={p.id} className="border-b border-rule/60 last:border-0 hover:bg-paper-2/50">
                    <td className="p-3">
                      <Link className="link" href={withAs(`/questions?week=${week}&prompt=${p.id}`, focus, result.perspective)}>
                        {p.question}
                      </Link>
                      <div className="text-xs text-ink-3">{STAGE_LABEL[p.stage] ?? p.stage}</div>
                    </td>
                    <td className="num p-3 text-ink-2">{"●".repeat(p.priority)}</td>
                    {engines.map((e) => (
                      <td key={e} className="p-3">
                        <RunDots brand={focus} runs={matrixWeekAnswers.filter((r) => r.promptId === p.id && r.engine === e).sort((a, b) => a.week - b.week || (a.run ?? 0) - (b.run ?? 0))} />
                      </td>
                    ))}
                    <td className={`num p-3 text-right ${rate < 0.34 ? "text-drop" : ""}`}>{pct(rate)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      <Section kicker={`${answers.length} answers`} title="The actual answers">
        {answers.length === 0 ? (
          <Empty>No answers match these filters.</Empty>
        ) : (
          <ul className="divide-y divide-rule/70 rounded-lg border border-rule bg-card">
            {answers.slice(0, 120).map((r) => {
              const fm = r.mentions.find((m) => m.brand === focus);
              const wrong = r.claims.filter((c) => c.verdict === "wrong").length;
              return (
                <li key={r.responseId}>
                  <Link href={withAs(`/answers/${r.responseId}`, focus, result.perspective)} className="grid gap-2 p-3 transition-colors hover:bg-paper-2/60 sm:grid-cols-[6rem_1fr_auto] sm:items-center">
                    <span className="num text-xs text-ink-3">
                      W{r.week} · {engineName(r.engine)} · run {r.run}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm">{question.get(r.promptId)?.question ?? r.promptId}</span>
                      <span className="block truncate text-xs text-ink-3">{r.ok ? r.text.replace(/\s+/g, " ").slice(0, 140) : `Collection failed (${r.error})`}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      {wrong > 0 && <span className="rounded bg-drop-soft px-1.5 py-0.5 text-[11px] font-semibold text-drop">{wrong} wrong fact{wrong > 1 ? "s" : ""}</span>}
                      {fm?.mentioned ? <span className="num text-xs text-ink-3">#{fm.position}</span> : null}
                      <ToneChip tone={fm?.tone ?? null} compact />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        {answers.length > 120 && <p className="mt-2 text-xs text-ink-3">Showing the first 120. Narrow the filters to see the rest.</p>}
      </Section>
    </div>
  );
}

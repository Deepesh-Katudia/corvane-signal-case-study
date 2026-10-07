import { getAnalysis } from "@/server/analysis";
import { Filters } from "@/components/Filters";
import { Empty, Section } from "@/components/ui";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function HeadToHeadPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { result } = await getAnalysis();
  const focus = result.perspective;
  const week = Number(one(sp.week) || result.latestWeek);
  const scope = one(sp.scope) || "focus";
  const name = (k: string) => result.brands.find((b) => b.key === k)?.name ?? k;
  const engineName = (e: string) => result.engines.find((x) => x.canonical === e)?.label ?? e;
  const engines = [...new Set(result.responses.map((r) => r.engine))].sort();
  const winners = result.winners.filter((w) => w.week === week);
  const wins = new Map<string, number>();
  for (const w of winners) for (const b of w.winners) wins.set(b, (wins.get(b) ?? 0) + 1 / w.winners.length);
  const ranked = [...wins].sort((a, b) => b[1] - a[1]);
  const maxWins = Math.max(...ranked.map(([, n]) => n), 1);
  const swaps = result.replacements.filter((r) => r.week === week && (scope === "all" || r.dropped === focus));
  const question = (id: string) => result.prompts.find((p) => p.id === id)?.question ?? id;
  const weekInfo = result.weeks.find((w) => w.week === week);

  return (
    <div className="space-y-8 pt-4">
      <header className="rise">
        <p className="kicker">Head-to-head</p>
        <h1 className="font-serif text-4xl tracking-tight">Who wins each question, on each engine</h1>
        <p className="mt-2 max-w-3xl text-ink-2">
          The winner is the company with the most points across both runs (recommended and named first beats merely mentioned). When a company disappears from a question it appeared in the
          week before, we show who appeared instead.
        </p>
      </header>

      <Filters
        filters={[
          { name: "week", label: "Week", value: String(week), options: result.weeks.map((w) => ({ value: String(w.week), label: `Week ${w.week}${w.partial ? " (incomplete)" : ""}` })) },
          { name: "scope", label: "Drop-outs for", value: scope, options: [{ value: "focus", label: name(focus) }, { value: "all", label: "All companies" }] },
        ]}
      />

      {weekInfo?.partial && (
        <p className="rounded-lg border border-warn/40 bg-warn-soft p-3 text-sm">
          Week {week} is incomplete: no {weekInfo.missingEngines.map(engineName).join(", ")} answers. Those columns are blank rather than counted as losses.
        </p>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_18rem]">
        <div className="overflow-x-auto rounded-lg border border-rule bg-card">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-rule text-left">
                <th className="p-3 font-medium">Question</th>
                {engines.map((e) => (
                  <th key={e} className="p-3 font-medium">
                    {engineName(e)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.prompts.map((p) => (
                <tr key={p.id} className="border-b border-rule/60 last:border-0">
                  <td className="p-3">{p.question}</td>
                  {engines.map((e) => {
                    const w = winners.find((x) => x.promptId === p.id && x.engine === e);
                    if (!w) return <td key={e} className="p-3 text-xs text-ink-3">no data</td>;
                    if (!w.winners.length) return <td key={e} className="p-3 text-xs text-ink-3">nobody</td>;
                    const isFocus = w.winners.includes(focus);
                    return (
                      <td key={e} className="p-3">
                        <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${isFocus ? "bg-focus text-paper" : "bg-paper-2"}`}>
                          {w.winners.map(name).join(" = ")}
                        </span>
                        <span className="num ml-1 text-[11px] text-ink-3">{w.points[w.winners[0]].toFixed(0)}</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <aside className="space-y-8">
          <Section kicker={`Week ${week}`} title="Questions won">
            <ul className="space-y-2">
              {ranked.map(([b, n]) => (
                <li key={b} className="grid grid-cols-[7rem_1fr_2.5rem] items-center gap-2 text-sm">
                  <span className={`truncate ${b === focus ? "font-semibold text-focus" : ""}`}>{name(b)}</span>
                  <span className="h-2 rounded-full bg-paper-2">
                    <span className={`block h-2 rounded-full ${b === focus ? "bg-focus" : "bg-ink-3"}`} style={{ width: `${(n / maxWins) * 100}%` }} />
                  </span>
                  <span className="num text-right">{n.toFixed(n % 1 ? 1 : 0)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-ink-3">Out of {winners.length} question/engine pairs; ties split.</p>
          </Section>
        </aside>
      </div>

      <Section kicker={`Week ${week} vs the week before`} title={scope === "all" ? "Who dropped out, and who replaced them" : `Where ${name(focus)} dropped out, and who replaced it`}>
        {swaps.length ? (
          <ul className="grid gap-2 md:grid-cols-2">
            {swaps.map((s, i) => (
              <li key={i} className="rounded-lg border border-rule bg-card p-3 text-sm">
                <p className="text-ink-2">
                  {question(s.promptId)} · <span className="text-ink-3">{engineName(s.engine)}</span>
                </p>
                <p className="mt-1">
                  <span className="text-drop line-through decoration-1">{name(s.dropped)}</span>
                  <span className="mx-2 text-ink-3">→</span>
                  <span className="font-medium">{s.replacedBy.length ? s.replacedBy.map(name).join(", ") : "nobody new"}</span>
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No drop-outs compared with the previous week{scope === "focus" ? ` for ${name(focus)}` : ""}.</Empty>
        )}
      </Section>
    </div>
  );
}

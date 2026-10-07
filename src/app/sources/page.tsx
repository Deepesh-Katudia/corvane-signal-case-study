import { getAnalysis } from "@/server/analysis";
import { competitorOnlySources, underIndexedSources } from "@/engine/score/sources";
import { Section } from "@/components/ui";
import { pct } from "@/lib/format";

export default async function SourcesPage() {
  const { result } = await getAnalysis();
  const focus = result.perspective;
  const name = (k: string) => result.brands.find((b) => b.key === k)?.name ?? k;
  const tracked = result.brands.filter((b) => b.tier !== "other");
  const competitors = tracked.filter((b) => b.key !== focus).map((b) => b.key);
  const never = competitorOnlySources(result.sources, focus, competitors);
  const gaps = underIndexedSources(result.sources, focus, competitors);
  const gapByDomain = new Map(gaps.map((g) => [g.domain, g]));

  return (
    <div className="space-y-10 pt-4">
      <header className="rise">
        <p className="kicker">Citations</p>
        <h1 className="font-serif text-4xl tracking-tight">Which websites the AI engines lean on</h1>
        <p className="mt-2 max-w-3xl text-ink-2">
          Citations are the pages an engine lists as its sources. They do not count as mentions, but they show where engines learn about this market and where {name(focus)} needs to
          be present.
        </p>
      </header>

      <Section kicker="Gaps" title={`Sources that cite competitors but never ${name(focus)}`}>
        {never.length ? (
          <ul className="flex flex-wrap gap-2">
            {never.map((s) => (
              <li key={s.domain} className="rounded-full bg-drop-soft px-3 py-1 text-sm font-medium text-drop">
                {s.domain} <span className="num text-xs">({s.answers} answers)</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="max-w-3xl text-sm text-ink-2">
            None in this data: every third-party site cited alongside a competitor is also cited alongside {name(focus)} at least once. The table below instead highlights where{" "}
            {name(focus)} is <strong>under-represented</strong>: sites where a competitor is named noticeably more often in the answers that cite them.
          </p>
        )}
      </Section>

      <Section kicker={`${result.sources.length} websites`} title="Who appears in answers that cite each site">
        <div className="overflow-x-auto rounded-lg border border-rule bg-card">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-rule text-left">
                <th className="p-3 font-medium">Website</th>
                <th className="p-3 font-medium">Type</th>
                <th className="p-3 text-right font-medium">Answers</th>
                {tracked.map((b) => (
                  <th key={b.key} className={`p-3 text-right font-medium ${b.key === focus ? "text-focus" : ""}`}>
                    {b.name}
                  </th>
                ))}
                <th className="p-3 font-medium">Gap</th>
              </tr>
            </thead>
            <tbody>
              {result.sources.map((s) => {
                const gap = gapByDomain.get(s.domain);
                const flagged = gap && gap.gap >= 0.1;
                return (
                  <tr key={s.domain} className={`border-b border-rule/60 last:border-0 ${flagged ? "bg-warn-soft/50" : ""}`}>
                    <td className="p-3 font-medium">{s.domain}</td>
                    <td className="p-3 text-ink-2">{s.ownedBy ? `${name(s.ownedBy)}'s site` : s.kind.replace(/_/g, " ")}</td>
                    <td className="num p-3 text-right">{s.answers}</td>
                    {tracked.map((b) => (
                      <td key={b.key} className={`num p-3 text-right ${b.key === focus ? "font-semibold text-focus" : "text-ink-2"}`}>
                        {pct((s.brandAnswers[b.key] ?? 0) / s.answers)}
                      </td>
                    ))}
                    <td className="p-3 text-xs">{flagged ? `${name(gap.leader)} +${((gap.gap) * 100).toFixed(0)} pts` : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-ink-3">Percentages: share of answers citing the site that name each company. Highlighted rows: a competitor leads {name(focus)} by 10+ points.</p>
      </Section>
    </div>
  );
}

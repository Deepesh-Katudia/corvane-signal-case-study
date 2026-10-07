import { getAnalysis } from "@/server/analysis";
import { competitorOnlySources, underIndexedSources } from "@/engine/score/sources";
import { Section } from "@/components/ui";
import { pct, possessive } from "@/lib/format";

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
        <h1 className="font-serif text-4xl tracking-tight">Which websites AI answers cite</h1>
        <p className="mt-2 max-w-3xl text-ink-2">
          Citations are the pages an AI answer lists as its sources. This page shows which companies are mentioned in the answers that cite each website. It does not show what
          the website itself says: a site cited next to a competitor has not necessarily recommended that competitor. Citations never count as mentions.
        </p>
      </header>

      <Section kicker="Gaps" title={`Sites cited in answers that mention competitors but never ${name(focus)}`}>
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
            None in this data: every third-party site cited in an answer that mentions a competitor is also cited in at least one answer that mentions {name(focus)}. The table
            below instead highlights where {name(focus)} is <strong>mentioned less often</strong>: sites whose citing answers mention a competitor noticeably more often.
          </p>
        )}
      </Section>

      <Section kicker={`${result.sources.length} websites · across all ${result.weeks.length} weeks`} title="Companies mentioned in the answers that cite each site">
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
                    <td className="p-3 text-ink-2">{s.ownedBy ? `${possessive(name(s.ownedBy))} own site` : s.kind.replace(/_/g, " ")}</td>
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
        <p className="mt-2 text-xs text-ink-3">Percentages: of the answers that cite the site, the share that mention each company (all {result.weeks.length} weeks). Highlighted rows: a competitor is mentioned 10+ points more often than {name(focus)}.</p>
      </Section>
    </div>
  );
}

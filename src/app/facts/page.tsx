import Link from "next/link";
import { getAnalysis } from "@/server/analysis";
import { buildBrief, factLabel, truthText, type FactAlert } from "@/engine/insights/brief";
import { Empty, Section } from "@/components/ui";

const IMPACT_LABEL: Record<FactAlert["impact"], string> = { high: "High business impact", medium: "Medium business impact", low: "Lower impact" };

function AlertCard({ a, engineName, latestWeek }: { a: FactAlert; engineName: (e: string) => string; latestWeek: number | null }) {
  const answerLinks = (ids: string[]) =>
    ids.map((id) => (
      <Link key={id} className="link num" href={`/answers/${id}`}>
        {id}
      </Link>
    ));
  return (
    <article id={a.id} className="scroll-mt-6 rounded-lg border border-l-4 border-rule border-l-drop bg-card p-4 target:ring-2 target:ring-focus">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium capitalize">{factLabel(a.factKey)}</p>
        <p className="flex flex-wrap items-center gap-2 text-xs">
          {a.thisWeek ? (
            <span className="rounded bg-drop-soft px-1.5 py-0.5 font-semibold text-drop">
              This week ({latestWeek}) · {a.thisWeekCount}
            </span>
          ) : (
            <span className="text-ink-3">Last seen week {a.lastSeenWeek}</span>
          )}
          <span className="num text-ink-3">
            {a.count} answer{a.count === 1 ? "" : "s"} in all weeks ({a.weeks.join(", ")})
          </span>
        </p>
      </div>
      <p className="mt-1 font-serif text-lg italic">“{a.example}”</p>
      <p className="mt-1 text-sm text-ink-2">
        In fact {truthText(a.factKey, a.expectedValue)}. <span className={a.impact === "high" ? "font-medium text-drop" : "text-ink-3"}>{IMPACT_LABEL[a.impact]}.</span>
      </p>
      <p className="mt-2 text-xs text-ink-3">Engines: {a.engines.map(engineName).join(", ")}</p>
      <p className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-xs">{answerLinks(a.responseIds.slice(0, 8))}</p>
      {a.responseIds.length > 8 && (
        <details className="mt-1 text-xs">
          <summary className="cursor-pointer text-ink-3">+{a.responseIds.length - 8} more answers</summary>
          <p className="mt-1 flex flex-wrap gap-x-2 gap-y-1">{answerLinks(a.responseIds.slice(8))}</p>
        </details>
      )}
    </article>
  );
}

export default async function FactsPage() {
  const { result } = await getAnalysis();
  const focus = result.perspective;
  const brief = buildBrief(result, focus);
  const name = (k: string) => result.brands.find((b) => b.key === k)?.name ?? k;
  const engineName = (e: string) => result.engines.find((x) => x.canonical === e)?.label ?? e;
  const weeks = result.weeks.length;
  const latest = result.latestWeek;
  const unverified = result.unverifiedClaims.filter((c) => c.brand === focus);
  const unverifiedGroups = [...new Map(unverified.map((c) => [c.claimText, unverified.filter((x) => x.claimText === c.claimText).length])).entries()];
  const byCompetitor = result.brands
    .filter((b) => b.tier !== "other" && b.key !== focus)
    .map((b) => ({ brand: b, alerts: brief.competitorAlerts.filter((a) => a.brand === b.key) }));
  const current = brief.alerts.filter((a) => a.thisWeek);
  const earlier = brief.alerts.filter((a) => !a.thisWeek);
  const grid = (alerts: FactAlert[]) => (
    <div className="grid gap-3 md:grid-cols-2">
      {alerts.map((a) => (
        <AlertCard key={a.id} a={a} engineName={engineName} latestWeek={latest} />
      ))}
    </div>
  );

  return (
    <div className="space-y-10 pt-4">
      <header className="rise">
        <p className="kicker">Fact check against our facts file · all {weeks} weeks</p>
        <h1 className="font-serif text-4xl tracking-tight">What AI engines get wrong</h1>
        <p className="mt-2 max-w-3xl text-ink-2">
          A claim is flagged only when it contradicts what we know to be true (price, headquarters, founding year, features, integrations). Claims we have no facts for, such as review
          ratings, are listed as unverified and never flagged. Each card shows whether the claim appeared this week, or when it was last seen.
        </p>
      </header>

      <Section
        kicker={`${current.reduce((s, a) => s + a.thisWeekCount, 0)} wrong claims in week ${latest} · ${brief.alerts.reduce((s, a) => s + a.count, 0)} across all ${weeks} weeks`}
        title={`About ${name(focus)}: seen this week`}
      >
        {current.length ? grid(current) : <Empty>No answer this week contradicts the facts on file.</Empty>}
      </Section>

      {earlier.length > 0 && (
        <Section kicker="Not seen this week" title={`About ${name(focus)}: earlier weeks only`}>
          {grid(earlier)}
        </Section>
      )}

      {unverifiedGroups.length > 0 && (
        <Section kicker="Not flagged" title="Unverified claims (not in the facts file)">
          <ul className="space-y-1 text-sm text-ink-2">
            {unverifiedGroups.map(([text, n]) => (
              <li key={text}>
                “{text}” <span className="num text-ink-3">×{n} across all weeks</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section kicker="For the sales team · all weeks" title="What AI gets wrong about competitors">
        <div className="grid gap-6 md:grid-cols-3">
          {byCompetitor.map(({ brand, alerts }) => (
            <div key={brand.key}>
              <h3 className="mb-2 font-medium">{brand.name}</h3>
              {alerts.length ? (
                <div className="space-y-3">
                  {alerts.map((a) => (
                    <AlertCard key={a.id} a={a} engineName={engineName} latestWeek={latest} />
                  ))}
                </div>
              ) : (
                <Empty>No wrong claims found.</Empty>
              )}
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

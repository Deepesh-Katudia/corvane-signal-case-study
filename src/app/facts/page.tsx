import Link from "next/link";
import { getAnalysis, resolvePerspective } from "@/server/analysis";
import { buildBrief, factLabel, truthText, type FactAlert } from "@/engine/insights/brief";
import { Card, Empty, Section } from "@/components/ui";
import { withAs } from "@/lib/format";

export default async function FactsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { result } = await getAnalysis();
  const focus = resolvePerspective(result, (await searchParams).as);
  const brief = buildBrief(result, focus);
  const name = (k: string) => result.brands.find((b) => b.key === k)?.name ?? k;
  const engineName = (e: string) => result.engines.find((x) => x.canonical === e)?.label ?? e;
  const unverified = result.unverifiedClaims.filter((c) => c.brand === focus);
  const unverifiedGroups = [...new Map(unverified.map((c) => [c.claimText, unverified.filter((x) => x.claimText === c.claimText).length])).entries()];
  const byCompetitor = result.brands
    .filter((b) => b.tier !== "other" && b.key !== focus)
    .map((b) => ({ brand: b, alerts: brief.competitorAlerts.filter((a) => a.brand === b.key) }));

  const AlertCard = ({ a }: { a: FactAlert }) => (
    <Card className="border-l-4 border-l-drop">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium capitalize">{factLabel(a.factKey)}</p>
        <p className="num text-xs text-ink-3">
          {a.count} answer{a.count > 1 ? "s" : ""} · weeks {a.weeks.join(", ")}
        </p>
      </div>
      <p className="mt-1 font-serif text-lg italic">“{a.example}”</p>
      <p className="mt-1 text-sm text-ink-2">In fact {truthText(a.factKey, a.expectedValue)}.</p>
      <p className="mt-2 text-xs text-ink-3">Engines: {a.engines.map(engineName).join(", ")}</p>
      <p className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-xs">
        {a.responseIds.slice(0, 8).map((id) => (
          <Link key={id} className="link num" href={withAs(`/answers/${id}`, focus, result.perspective)}>
            {id}
          </Link>
        ))}
        {a.responseIds.length > 8 && <span className="text-ink-3">+{a.responseIds.length - 8} more</span>}
      </p>
    </Card>
  );

  return (
    <div className="space-y-10 pt-4">
      <header className="rise">
        <p className="kicker">Fact check against our facts file</p>
        <h1 className="font-serif text-4xl tracking-tight">What AI engines get wrong</h1>
        <p className="mt-2 max-w-3xl text-ink-2">
          A claim is flagged only when it contradicts what we know to be true (price, headquarters, founding year, features, integrations). Claims we have no facts for, such as review
          ratings, are listed as unverified and never flagged.
        </p>
      </header>

      <Section kicker={`${brief.alerts.reduce((s, a) => s + a.count, 0)} wrong claims`} title={`About ${name(focus)}`}>
        {brief.alerts.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {brief.alerts.map((a) => (
              <AlertCard key={`${a.factKey}-${a.claimedValue}`} a={a} />
            ))}
          </div>
        ) : (
          <Empty>Nothing contradicts the facts on file.</Empty>
        )}
        {unverifiedGroups.length > 0 && (
          <div className="mt-6">
            <p className="kicker mb-2">Unverified (not in the facts file, so not flagged)</p>
            <ul className="space-y-1 text-sm text-ink-2">
              {unverifiedGroups.map(([text, n]) => (
                <li key={text}>
                  “{text}” <span className="num text-ink-3">×{n}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      <Section kicker="For the sales team" title="What AI gets wrong about competitors">
        <div className="grid gap-6 md:grid-cols-3">
          {byCompetitor.map(({ brand, alerts }) => (
            <div key={brand.key}>
              <h3 className="mb-2 font-medium">{brand.name}</h3>
              {alerts.length ? (
                <div className="space-y-3">
                  {alerts.map((a) => (
                    <AlertCard key={`${a.factKey}-${a.claimedValue}`} a={a} />
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

import Link from "next/link";
import { getAnalysis, resolvePerspective } from "@/server/analysis";
import { buildBrief, factLabel, truthText } from "@/engine/insights/brief";
import { ScoreCards } from "@/components/ScoreCards";
import { TrendChart } from "@/components/TrendChart";
import { Card, Empty, Section } from "@/components/ui";
import { withAs } from "@/lib/format";

export default async function MondayPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { result } = await getAnalysis();
  const focus = resolvePerspective(result, (await searchParams).as);
  const brief = buildBrief(result, focus);
  const client = result.perspective;
  const trend = result.trend;
  const trendLabel = trend ? `weeks ${trend.recentWeeks[0]}–${trend.recentWeeks.at(-1)} vs ${trend.earlierWeeks[0]}–${trend.earlierWeeks.at(-1)}` : "trend";
  const [lead, ...rest] = brief.headline.split(/(?<=\.)\s+/);
  const engineName = (e: string) => result.engines.find((x) => x.canonical === e)?.label ?? e;
  const maxGain = Math.max(...brief.takers.map((t) => t.gained), 1);

  return (
    <div className="space-y-10 pt-4">
      <section className="rise grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div>
          <p className="kicker">Monday brief · week {brief.latestWeek}</p>
          <h1 className="mt-2 font-serif text-4xl leading-[1.05] tracking-tight sm:text-5xl">{lead}</h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-2">{rest.join(" ")}</p>
        </div>
        <div className="space-y-3 self-end">
          {brief.partialNote && (
            <p className="rounded-lg border border-warn/40 bg-warn-soft p-3 text-sm text-ink" role="note">
              <strong className="font-semibold">Incomplete data. </strong>
              {brief.partialNote}
            </p>
          )}
          <p className="text-sm text-ink-2">
            <strong className="text-ink">How to read the score:</strong> every AI answer hands out up to 100 points per company: 100 if it recommends you, 50 if it just names you, 25 if it
            criticises you, 0 if it advises against you or leaves you out, scaled down a little when you are named later. The score is the average, weighted by how important each buyer
            question is. A change only counts as real when it is bigger than what re-asking the same questions normally produces.
          </p>
        </div>
      </section>

      <ScoreCards cards={brief.cards} trendLabel={trendLabel} />

      <div className="grid gap-8 lg:grid-cols-2">
        <Section kicker={brief.whyMovedWindow ? `Explaining ${brief.whyMovedWindow}` : "Why it moved"} title={`Why ${brief.focusName} moved`}>
          {brief.whyMoved.length ? (
            <ol className="space-y-3">
              {brief.whyMoved.map((w, i) => (
                <li key={i} className="flex gap-3 text-[15px] leading-snug">
                  <span className={`num mt-0.5 shrink-0 text-xs ${w.startsWith("Lost") ? "text-drop" : "text-gain"}`}>{w.startsWith("Lost") ? "▼" : "▲"}</span>
                  <span>{w}</span>
                </li>
              ))}
            </ol>
          ) : (
            <Empty>Not enough weeks to compare yet.</Empty>
          )}
          {brief.takers.length > 0 && (
            <div className="mt-6">
              <p className="kicker mb-2">Who took ground where {brief.focusName} lost it</p>
              <ul className="space-y-2">
                {brief.takers.map((t) => (
                  <li key={t.brand} className="grid grid-cols-[7rem_1fr_3rem] items-center gap-3 text-sm">
                    <span className="truncate font-medium">{t.name}</span>
                    <span className="h-2 rounded-full bg-paper-2">
                      <span className="block h-2 rounded-full bg-drop/70" style={{ width: `${(t.gained / maxGain) * 100}%` }} />
                    </span>
                    <span className="num text-right text-ink-2">+{t.gained.toFixed(1)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-ink-3">Score points gained on the exact questions and engines where {brief.focusName} lost points.</p>
            </div>
          )}
        </Section>

        <Section
          kicker="Wrong-fact alerts"
          title={`What AI gets wrong about ${brief.focusName}`}
          aside={
            <Link className="link text-sm" href={withAs("/facts", focus, client)}>
              All alerts →
            </Link>
          }
        >
          {brief.alerts.length ? (
            <ul className="space-y-3">
              {brief.alerts.slice(0, 4).map((a) => (
                <li key={`${a.factKey}-${a.claimedValue}`}>
                  <Card className="border-l-4 border-l-drop">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-medium capitalize">{factLabel(a.factKey)}</p>
                      <p className="num text-xs text-ink-3">
                        {a.count} answers · weeks {a.weeks.join(", ")}
                        {a.weeks.includes(brief.latestWeek ?? -1) && <span className="ml-2 rounded bg-drop-soft px-1.5 py-0.5 font-sans font-semibold text-drop">this week</span>}
                      </p>
                    </div>
                    <p className="mt-1 font-serif text-lg italic leading-snug">“{a.example}”</p>
                    <p className="mt-1 text-sm text-ink-2">
                      In fact {truthText(a.factKey, a.expectedValue)}. Seen on {a.engines.map(engineName).join(", ")}.
                    </p>
                  </Card>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No answer contradicts the facts on file for {brief.focusName}.</Empty>
          )}
        </Section>
      </div>

      <Section kicker="What I'd do this week" title="Suggested actions">
        <ol className="grid gap-3 md:grid-cols-2">
          {brief.actions.map((a, i) => (
            <li key={i}>
              <Card className="h-full">
                <div className="flex items-baseline gap-3">
                  <span className="num text-2xl text-ink-3">{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <p className="font-medium leading-snug">{a.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-ink-2">{a.detail}</p>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ol>
      </Section>

      <Section kicker="Six-week view" title="Visibility score by week">
        <TrendChart series={brief.cards.map((c) => ({ brand: c.brand, name: c.name, isFocus: c.isFocus, points: c.series }))} />
      </Section>
    </div>
  );
}

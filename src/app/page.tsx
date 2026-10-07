import Link from "next/link";
import { getAnalysis } from "@/server/analysis";
import { buildBrief, factLabel, truthText, type Action, type FactAlert } from "@/engine/insights/brief";
import { ScoreCards } from "@/components/ScoreCards";
import { TrendChart } from "@/components/TrendChart";
import { Card, Empty, Section } from "@/components/ui";

const PRIORITY_STYLE: Record<Action["priority"], string> = {
  High: "bg-drop-soft text-drop",
  Medium: "bg-warn-soft text-warn",
  Low: "bg-noise-soft text-noise",
};

function ActionCard({ a, n }: { a: Action; n: number }) {
  return (
    <Card className="h-full">
      <div className="flex items-baseline gap-3">
        <span className="num text-2xl text-ink-3">{String(n).padStart(2, "0")}</span>
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-xs">
            <span className={`rounded px-1.5 py-0.5 font-semibold uppercase tracking-wide ${PRIORITY_STYLE[a.priority]}`}>{a.priority} priority</span>
            <span className="text-ink-3">Owner: {a.owner}</span>
          </p>
          <p className="mt-1 font-medium leading-snug">{a.title}</p>
          <p className="mt-1.5 text-sm leading-snug">
            <span className="kicker mr-1.5">Next</span>
            {a.next}
          </p>
          <Link className="link mt-1.5 inline-block text-sm" href={a.evidence.href}>
            {a.evidence.label} →
          </Link>
          <details className="mt-2 text-sm text-ink-2">
            <summary className="cursor-pointer text-xs text-ink-3 hover:text-ink">Why this matters</summary>
            <p className="mt-1 leading-relaxed">{a.why}</p>
          </details>
        </div>
      </div>
    </Card>
  );
}

function AlertCard({ a, engineName, latestWeek }: { a: FactAlert; engineName: (e: string) => string; latestWeek: number | null }) {
  return (
    <Link href={`/facts#${a.id}`} className="block rounded-lg border border-l-4 border-rule border-l-drop bg-card p-4 transition-colors hover:bg-paper-2/60">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium capitalize">{factLabel(a.factKey)}</p>
        <p className="num text-xs text-ink-3">
          {a.thisWeek ? (
            <span className="rounded bg-drop-soft px-1.5 py-0.5 font-sans font-semibold text-drop">
              This week · {a.thisWeekCount} answer{a.thisWeekCount === 1 ? "" : "s"}
            </span>
          ) : (
            <>Last seen week {a.lastSeenWeek}</>
          )}
          <span className="ml-2">{a.count} in all weeks</span>
        </p>
      </div>
      <p className="mt-1 font-serif text-lg italic leading-snug">“{a.example}”</p>
      <p className="mt-1 text-sm text-ink-2">
        In fact {truthText(a.factKey, a.expectedValue)}. Seen on {a.engines.map(engineName).join(", ")}.
        {a.impact === "high" && <span className="ml-1 font-medium text-drop">High business impact.</span>}
      </p>
      {a.newThisWeek && latestWeek !== null && <p className="mt-1 text-xs font-semibold text-drop">New: first seen in week {latestWeek}.</p>}
    </Link>
  );
}

export default async function MondayPage() {
  const { result } = await getAnalysis();
  const brief = buildBrief(result, result.perspective);
  const trend = result.trend;
  const trendLabel = trend ? `last 3 weeks vs the 3 before (weeks ${trend.recentWeeks[0]}–${trend.recentWeeks.at(-1)} vs ${trend.earlierWeeks[0]}–${trend.earlierWeeks.at(-1)})` : "trend";
  const engineName = (e: string) => result.engines.find((x) => x.canonical === e)?.label ?? e;
  const maxGain = Math.max(...brief.takers.map((t) => t.gained), 1);
  const current = brief.alerts.filter((a) => a.thisWeek);
  const earlier = brief.alerts.filter((a) => !a.thisWeek);
  const [topActions, moreActions] = [brief.actions.slice(0, 3), brief.actions.slice(3)];

  return (
    <div className="space-y-10 pt-4">
      <section className="rise">
        <p className="kicker">Monday brief · week {brief.latestWeek}</p>
        <h1 className="mt-2 max-w-4xl font-serif text-4xl leading-[1.08] tracking-tight sm:text-5xl">{brief.status}</h1>
        <dl className="mt-5 grid max-w-4xl gap-2 text-lg">
          {brief.execLines.map((l) => (
            <div key={l.label} className="grid gap-x-4 sm:grid-cols-[7.5rem_1fr]">
              <dt className="kicker pt-1.5">{l.label}</dt>
              <dd className="leading-snug">
                {l.href ? (
                  <Link className="link" href={l.href}>
                    {l.text}
                  </Link>
                ) : (
                  l.text
                )}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-5 inline-block rounded-md border border-rule bg-card px-3 py-1.5 text-xs text-ink-2">
          {brief.dataLine} ·{" "}
          <Link className="link" href="/data">
            data details
          </Link>
        </p>
        {brief.partialNote && (
          <p className="mt-3 max-w-4xl rounded-lg border border-warn/40 bg-warn-soft p-3 text-sm" role="note">
            <strong className="font-semibold">Incomplete data. </strong>
            {brief.partialNote}
          </p>
        )}
      </section>

      <Section kicker="What to do this week" title="Top actions">
        <ol className="grid gap-3 md:grid-cols-3">
          {topActions.map((a, i) => (
            <li key={i}>
              <ActionCard a={a} n={i + 1} />
            </li>
          ))}
        </ol>
        {moreActions.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-sm text-ink-2 hover:text-ink">
              {moreActions.length} more suggested action{moreActions.length === 1 ? "" : "s"}
            </summary>
            <ol className="mt-3 grid gap-3 md:grid-cols-2">
              {moreActions.map((a, i) => (
                <li key={i}>
                  <ActionCard a={a} n={i + 4} />
                </li>
              ))}
            </ol>
          </details>
        )}
      </Section>

      <ScoreCards cards={brief.cards} trendLabel={trendLabel} />

      <div className="grid gap-8 lg:grid-cols-2">
        <Section kicker={brief.whyMovedWindow ? `Comparing ${brief.whyMovedWindow}` : "Why it moved"} title={`Why ${brief.focusName} moved`}>
          {brief.whyMovedNote && <p className="mb-3 rounded-md bg-noise-soft p-2 text-sm text-ink-2">{brief.whyMovedNote}</p>}
          {brief.whyMoved.length ? (
            <ol className="space-y-3">
              {brief.whyMoved.map((w, i) => (
                <li key={i} className="flex gap-3 text-[15px] leading-snug">
                  <span className={`num mt-0.5 shrink-0 text-xs ${w.direction === "down" ? "text-drop" : "text-gain"}`} aria-hidden>
                    {w.direction === "down" ? "▼" : "▲"}
                  </span>
                  <Link className="link" href={w.href}>
                    {w.text}
                  </Link>
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
                  <li key={t.brand} className="grid grid-cols-[7rem_1fr_4.5rem] items-center gap-3 text-sm">
                    <span className="truncate font-medium">{t.name}</span>
                    <span className="h-2 rounded-full bg-paper-2">
                      <span className="block h-2 rounded-full bg-drop/70" style={{ width: `${(t.gained / maxGain) * 100}%` }} />
                    </span>
                    <span className="num text-right text-ink-2">+{t.gained.toFixed(1)} pts</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-ink-3">Score points gained across all the questions and engines where {brief.focusName} lost points.</p>
            </div>
          )}
        </Section>

        <Section
          kicker="Wrong-fact alerts"
          title={`What AI gets wrong about ${brief.focusName}`}
          aside={
            <Link className="link text-sm" href="/facts">
              All alerts, all weeks →
            </Link>
          }
        >
          <p className="kicker mb-2">Seen this week</p>
          {current.length ? (
            <ul className="space-y-3">
              {current.slice(0, 4).map((a) => (
                <li key={a.id}>
                  <AlertCard a={a} engineName={engineName} latestWeek={brief.latestWeek} />
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No answer this week contradicts the facts on file for {brief.focusName}.</Empty>
          )}
          {earlier.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm text-ink-2 hover:text-ink">
                {earlier.length} older claim{earlier.length === 1 ? "" : "s"} not seen this week
              </summary>
              <ul className="mt-2 space-y-1 text-sm">
                {earlier.map((a) => (
                  <li key={a.id}>
                    <Link className="link" href={`/facts#${a.id}`}>
                      “{a.example}”
                    </Link>{" "}
                    <span className="text-ink-3">last seen week {a.lastSeenWeek}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Section>
      </div>

      <Section kicker={`${result.weeks.length}-week view`} title="Visibility score by week">
        <TrendChart series={brief.cards.map((c) => ({ brand: c.brand, name: c.name, isFocus: c.isFocus, points: c.series }))} />
      </Section>

      <details className="rule-top pt-5">
        <summary className="cursor-pointer font-serif text-xl">How scoring works</summary>
        <div className="mt-3 max-w-3xl space-y-2 text-sm leading-relaxed text-ink-2">
          <p>
            Every AI answer gives each company up to 100 points: <strong>100</strong> if it recommends the company, <strong>50</strong> if it just names it, <strong>25</strong> if
            it criticises it, and <strong>0</strong> if it advises against it or leaves it out. Being named second counts ×0.85, third or later ×0.7.
          </p>
          <p>The score is the average across all answers, with the most important buyer questions counting up to three times as much as the least important.</p>
          <p>
            AI engines give different answers each time they are asked. A change is marked <strong>confirmed</strong> only when it is bigger than 95% of the changes that re-asking the
            same questions produces by chance. Otherwise it is <strong>not yet confirmed</strong>: the score did move, but there is no clear evidence it is more than normal variation.
            Weeks with missing engines are compared only on the questions and engines collected in both weeks.
          </p>
        </div>
      </details>
    </div>
  );
}

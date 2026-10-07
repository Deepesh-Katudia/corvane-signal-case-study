import Link from "next/link";
import type { AnalyzedResponse, ScoringConfig } from "@/engine/types";
import { answerPoints } from "@/engine/score/visibility";
import { ToneChip } from "./ui";

interface Props {
  /** Answers already filtered to one question (and engine, if chosen) in the compared weeks. */
  answers: AnalyzedResponse[];
  /** Earlier period first, later period second (one or more weeks each). */
  periods: [number[], number[]];
  focus: string;
  focusName: string;
  scoring: ScoringConfig;
  brandName: (k: string) => string;
}

const label = (ws: number[]) => (ws.length > 1 ? `Weeks ${ws[0]}–${ws[ws.length - 1]}` : `Week ${ws[0]}`);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Two periods side by side: the focus brand's points in each, and what every answer said. */
export function WeekComparison({ answers, periods, focus, focusName, scoring, brandName }: Props) {
  const [before, after] = periods.map((ws) => {
    const rs = answers.filter((r) => ws.includes(r.week)).sort((a, b) => b.week - a.week || (a.run ?? 0) - (b.run ?? 0));
    const usable = rs.filter((r) => r.ok);
    return { ws, rs, points: mean(usable.map((r) => answerPoints(r, focus, scoring))) };
  });
  const delta = before.points !== null && after.points !== null ? after.points - before.points : null;

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {[after, before].map((p, i) => (
        <section key={i} className={`rounded-lg border p-4 ${i === 0 ? "border-focus bg-focus-soft/40" : "border-rule bg-card"}`}>
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="font-serif text-xl">
              {label(p.ws)} {i === 0 ? <span className="kicker">later</span> : <span className="kicker">earlier</span>}
            </h3>
            <p className="num text-sm">
              {focusName}: <strong className="text-lg">{p.points === null ? "–" : p.points.toFixed(0)}</strong> pts
              {i === 0 && delta !== null && (
                <span className={`ml-2 ${delta < 0 ? "text-drop" : delta > 0 ? "text-gain" : "text-ink-3"}`}>
                  ({delta > 0 ? "+" : delta < 0 ? "−" : "±"}
                  {Math.abs(delta).toFixed(0)})
                </span>
              )}
            </p>
          </div>
          <ul className="mt-3 space-y-2">
            {p.rs.map((r) => {
              const m = r.mentions.find((x) => x.brand === focus);
              const top = r.mentions.filter((x) => x.mentioned).sort((a, b) => (a.position ?? 9) - (b.position ?? 9))[0];
              return (
                <li key={r.responseId}>
                  <Link href={`/answers/${r.responseId}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-rule bg-paper px-3 py-2 text-sm hover:bg-paper-2/60">
                    <span className="num text-xs text-ink-3">
                      W{r.week} · run {r.run}
                    </span>
                    <span className="flex items-center gap-2">
                      {!r.ok ? (
                        <span className="text-xs text-ink-3">failed to collect</span>
                      ) : (
                        <>
                          {m?.mentioned && <span className="num text-xs text-ink-3">#{m.position}</span>}
                          <ToneChip tone={m?.tone ?? null} compact />
                          {top && top.brand !== focus && <span className="text-xs text-ink-3">first named: {brandName(top.brand)}</span>}
                        </>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

import type { ScoreCard } from "@/engine/insights/brief";
import type { WeekComparison } from "@/engine/score/compare";
import { signed } from "@/lib/format";
import { MovementBadge } from "./ui";

function Change({ label, c }: { label: string; c: WeekComparison | null }) {
  if (!c || c.delta === null) {
    return (
      <div className="flex items-center justify-between gap-2 text-xs text-ink-3">
        <span>{label}</span>
        <span>no comparison</span>
      </div>
    );
  }
  const color = c.movement === "real_gain" ? "text-gain" : c.movement === "real_drop" ? "text-drop" : "text-ink-2";
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-ink-2">{label}</span>
      <span className="flex items-center gap-2">
        <span className={`num font-medium ${color}`}>{signed(c.delta)}</span>
        <MovementBadge movement={c.movement} />
      </span>
    </div>
  );
}

export function ScoreCards({ cards, trendLabel }: { cards: ScoreCard[]; trendLabel: string }) {
  const ordered = [...cards].sort((a, b) => Number(b.isFocus) - Number(a.isFocus));
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.35fr_1fr_1fr_1fr]">
      {ordered.map((c) => (
        <article
          key={c.brand}
          className={`rise rounded-lg border p-4 ${c.isFocus ? "border-focus bg-focus-soft/60 shadow-[4px_4px_0_var(--focus)]" : "border-rule bg-card"}`}
        >
          <div className="flex items-baseline justify-between">
            <h3 className={`font-medium ${c.isFocus ? "text-focus" : ""}`}>{c.name}</h3>
            {c.isFocus && <span className="kicker">you</span>}
          </div>
          <p className={`num mt-1 leading-none ${c.isFocus ? "text-6xl" : "text-4xl"}`}>
            {c.score?.toFixed(0) ?? "–"}
            <span className="text-base text-ink-3">/100</span>
          </p>
          <div className="mt-4 space-y-1.5">
            <Change label="vs last week" c={c.weekly} />
            <Change label={trendLabel} c={c.trend} />
          </div>
        </article>
      ))}
    </div>
  );
}

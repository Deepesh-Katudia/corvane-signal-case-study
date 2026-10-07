"use client";

import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface Series {
  brand: string;
  name: string;
  isFocus: boolean;
  points: Array<{ week: number; score: number; partial: boolean }>;
}

const PALETTE = ["var(--focus)", "#b45309", "#0f766e", "#7c3aed", "#be185d", "#4d7c0f"];

export function TrendChart({ series }: { series: Series[] }) {
  const weeks = [...new Set(series.flatMap((s) => s.points.map((p) => p.week)))].sort((a, b) => a - b);
  const partialWeeks = new Set(series.flatMap((s) => s.points.filter((p) => p.partial).map((p) => p.week)));
  const data = weeks.map((w) => ({ week: w, ...Object.fromEntries(series.map((s) => [s.brand, s.points.find((p) => p.week === w)?.score ?? null])) }));
  const ordered = [...series].sort((a, b) => Number(a.isFocus) - Number(b.isFocus));
  const colorOf = (brand: string) => {
    const s = series.find((x) => x.brand === brand)!;
    return s.isFocus ? PALETTE[0] : PALETTE[1 + series.filter((x) => !x.isFocus).findIndex((x) => x.brand === brand)];
  };

  return (
    <div>
      <div className="h-64 w-full" role="img" aria-label="Visibility score by week for each tracked company">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -18 }}>
            <CartesianGrid stroke="var(--rule)" strokeDasharray="2 4" vertical={false} />
            {[...partialWeeks].map((w) => (
              <ReferenceArea key={w} x1={w - 0.4} x2={w + 0.4} fill="var(--warn-soft)" fillOpacity={0.8} />
            ))}
            <XAxis dataKey="week" type="number" domain={[weeks[0] - 0.4, weeks[weeks.length - 1] + 0.4]} ticks={weeks} tickFormatter={(w) => `W${w}`} stroke="var(--ink-3)" fontSize={12} tickLine={false} />
            <YAxis domain={[0, 60]} stroke="var(--ink-3)" fontSize={12} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{ background: "var(--card)", border: "1px solid var(--rule)", borderRadius: 8, fontSize: 12 }}
              labelFormatter={(w) => `Week ${w}${partialWeeks.has(Number(w)) ? " (incomplete)" : ""}`}
              formatter={(v, key) => [typeof v === "number" ? v.toFixed(1) : "–", series.find((s) => s.brand === key)?.name ?? String(key)]}
            />
            {ordered.map((s) => (
              <Line
                key={s.brand}
                dataKey={s.brand}
                stroke={colorOf(s.brand)}
                strokeWidth={s.isFocus ? 3 : 1.5}
                strokeOpacity={s.isFocus ? 1 : 0.75}
                dot={{ r: s.isFocus ? 3.5 : 2.5, strokeWidth: 0, fill: colorOf(s.brand) }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
        {series.map((s) => (
          <li key={s.brand} className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4" style={{ background: colorOf(s.brand), height: s.isFocus ? 3 : 2 }} aria-hidden />
            {s.name}
          </li>
        ))}
        {partialWeeks.size > 0 && (
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm bg-warn-soft" aria-hidden /> incomplete week
          </li>
        )}
      </ul>
    </div>
  );
}

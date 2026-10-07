import type { ReactNode } from "react";
import type { Tone } from "@/engine/types";
import type { Movement } from "@/engine/score/compare";
import { MOVEMENT_LABEL, TONE_LABEL, TONE_VAR } from "@/lib/format";

export function ToneChip({ tone, compact = false }: { tone: Tone | null; compact?: boolean }) {
  if (!tone) return <span className="text-ink-3 text-xs">not mentioned</span>;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap"
      style={{ color: TONE_VAR[tone], borderColor: `color-mix(in srgb, ${TONE_VAR[tone]} 35%, transparent)` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: TONE_VAR[tone] }} aria-hidden />
      {compact ? TONE_LABEL[tone].split(" ")[0] : TONE_LABEL[tone]}
    </span>
  );
}

const MOVEMENT_STYLE: Record<Movement, string> = {
  real_gain: "bg-gain-soft text-gain",
  real_drop: "bg-drop-soft text-drop",
  normal_variation: "bg-noise-soft text-noise",
  no_baseline: "bg-noise-soft text-noise",
};

export function MovementBadge({ movement }: { movement: Movement }) {
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${MOVEMENT_STYLE[movement]}`}>{MOVEMENT_LABEL[movement]}</span>;
}

export function Section({ kicker, title, children, aside }: { kicker: string; title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="rise rule-top pt-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="kicker">{kicker}</p>
          <h2 className="font-serif text-2xl leading-tight">{title}</h2>
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-rule bg-card p-4 shadow-[0_1px_0_var(--rule)] ${className}`}>{children}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-rule p-4 text-sm text-ink-2">{children}</p>;
}

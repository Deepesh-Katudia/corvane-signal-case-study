import Link from "next/link";
import { notFound } from "next/navigation";
import { getAnalysis } from "@/server/analysis";
import { Card, Section, ToneChip } from "@/components/ui";
import { STAGE_LABEL, TONE_VAR, stripMarkdown } from "@/lib/format";
import { factLabel, truthText } from "@/engine/insights/brief";
import type { AnalyzedResponse } from "@/engine/types";

/** The answer text with every brand mention highlighted in its tone colour. */
function Highlighted({ r }: { r: AnalyzedResponse }) {
  const spans = r.mentions
    .flatMap((m) => m.spans.map((s) => ({ ...s, brand: m.brand, tone: m.tone })))
    .sort((a, b) => a.start - b.start);
  const parts: React.ReactNode[] = [];
  let at = 0;
  spans.forEach((s, i) => {
    if (s.start < at) return;
    parts.push(stripMarkdown(r.text.slice(at, s.start)));
    const color = s.tone ? TONE_VAR[s.tone] : "var(--ink)";
    parts.push(
      <mark key={i} className="mention" style={{ color, background: `color-mix(in srgb, ${color} 12%, transparent)` }} title={`${s.brand} · ${s.tone}`}>
        {r.text.slice(s.start, s.end)}
      </mark>,
    );
    at = s.end;
  });
  parts.push(stripMarkdown(r.text.slice(at)));
  return <div className="whitespace-pre-wrap font-serif text-lg leading-relaxed">{parts}</div>;
}

export default async function AnswerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { result } = await getAnalysis();
  const focus = result.perspective;
  const r = result.responses.find((x) => x.responseId === id);
  if (!r) notFound();
  const prompt = result.prompts.find((p) => p.id === r.promptId);
  const name = (k: string) => result.brands.find((b) => b.key === k)?.name ?? k;
  const engineName = result.engines.find((x) => x.canonical === r.engine)?.label ?? r.engine;
  const mentioned = r.mentions.filter((m) => m.mentioned).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  return (
    <div className="space-y-8 pt-4">
      <header className="rise">
        <Link className="link text-sm text-ink-2" href={`/questions?week=${r.week}&prompt=${r.promptId}`}>
          ← All answers to this question
        </Link>
        <p className="kicker mt-4">
          Week {r.week} · {engineName} · run {r.run} · {STAGE_LABEL[prompt?.stage ?? ""] ?? prompt?.stage} · <span className="normal-case">{r.responseId}</span>
        </p>
        <h1 className="mt-1 font-serif text-3xl tracking-tight">“{prompt?.question ?? r.promptId}”</h1>
      </header>

      <div className="grid gap-8 lg:grid-cols-[1.6fr_1fr]">
        <Card className="p-6">
          {r.ok ? <Highlighted r={r} /> : <p className="text-ink-2">This answer failed to collect ({r.error}). It is excluded from scores.</p>}
          {r.citations.length > 0 && (
            <div className="mt-6 rule-top pt-3">
              <p className="kicker mb-2">Sources the AI listed (not counted as mentions)</p>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-2">
                {r.citations.map((c, i) => (
                  <li key={i} className="break-all">
                    {c}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </Card>

        <div className="space-y-8">
          <Section kicker="Detected" title="Companies in this answer">
            {mentioned.length ? (
              <ul className="space-y-3">
                {mentioned.map((m) => (
                  <li key={m.brand} className="text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">
                        <span className="num mr-2 text-ink-3">#{m.position}</span>
                        {name(m.brand)}
                      </span>
                      <ToneChip tone={m.tone} />
                    </div>
                    {m.toneEvidence && <p className="mt-1 border-l-2 border-rule pl-2 text-xs text-ink-2">Decided by: “{stripMarkdown(m.toneEvidence)}”</p>}
                    <p className="mt-1 text-xs text-ink-3">Written as: {[...new Set(m.spans.map((s) => s.text))].join(", ")}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-2">None of the tracked companies is named.</p>
            )}
          </Section>

          <Section kicker="Fact check" title="Claims about tracked companies">
            {r.claims.length ? (
              <ul className="space-y-3">
                {r.claims.map((c, i) => (
                  <li key={i} className="text-sm">
                    <span
                      className={`mr-2 rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase ${
                        c.verdict === "wrong" ? "bg-drop-soft text-drop" : c.verdict === "correct" ? "bg-gain-soft text-gain" : "bg-noise-soft text-noise"
                      }`}
                    >
                      {c.verdict}
                    </span>
                    <span className="font-medium">{name(c.brand)}</span> · {factLabel(c.factKey)}
                    <p className="mt-1 text-ink-2">“{stripMarkdown(c.claimText)}”</p>
                    {c.verdict === "wrong" && <p className="text-xs text-ink-3">In fact {truthText(c.factKey, c.expectedValue)}.</p>}
                    {c.verdict === "unverified" && <p className="text-xs text-ink-3">Not covered by our facts file, so not flagged.</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-2">No checkable claims.</p>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

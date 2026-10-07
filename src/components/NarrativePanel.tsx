"use client";

import { useEffect, useState } from "react";

type State = { status: "loading" } | { status: "off" } | { status: "ready"; text: string } | { status: "error"; message: string };

/** Optional AI-written summary. Renders nothing when no OpenRouter key is configured. */
export function NarrativePanel({ focus }: { focus: string }) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/narrative?as=${encodeURIComponent(focus)}`, { signal: ctrl.signal })
      .then(async (r) => {
        const body = (await r.json()) as { enabled: boolean; text: string | null; error?: string };
        if (!body.enabled) setState({ status: "off" });
        else if (body.text) setState({ status: "ready", text: body.text });
        else setState({ status: "error", message: body.error ?? "AI summary unavailable." });
      })
      .catch((err: unknown) => {
        if ((err as Error).name !== "AbortError") setState({ status: "error", message: "AI summary unavailable." });
      });
    return () => ctrl.abort();
  }, [focus]);

  if (state.status === "off") return null;
  return (
    <aside className="mt-4 rounded-lg border border-dashed border-rule p-4 text-sm" aria-live="polite">
      <p className="kicker mb-1">Plain-English summary · optional, AI-written from the numbers above</p>
      {state.status === "loading" && <p className="text-ink-3">Writing summary…</p>}
      {state.status === "ready" && <p className="leading-relaxed whitespace-pre-line">{state.text}</p>}
      {state.status === "error" && <p className="text-ink-3">{state.message}</p>}
    </aside>
  );
}

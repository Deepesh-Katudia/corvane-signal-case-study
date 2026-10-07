"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Status = { kind: "idle" } | { kind: "busy" } | { kind: "ok"; text: string } | { kind: "error"; text: string };

export function UploadForm() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus({ kind: "busy" });
    try {
      const res = await fetch("/api/upload", { method: "POST", body: new FormData(e.currentTarget) });
      const body = (await res.json()) as { ok: boolean; error?: string; added?: number; weeks?: number[]; issues?: number };
      if (!body.ok) {
        setStatus({ kind: "error", text: body.error ?? "Upload failed." });
        return;
      }
      setStatus({ kind: "ok", text: `Added ${body.added} answers for week ${body.weeks?.join(", ")} (${body.issues} data issues handled). Every page now includes them.` });
      router.refresh();
    } catch {
      setStatus({ kind: "error", text: "Upload failed; check your connection and try again." });
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-lg border border-rule bg-card p-4">
      <label className="block text-sm">
        <span className="kicker mb-1 block">New week of answers (.jsonl, .json or .csv)</span>
        <input name="file" type="file" required accept=".jsonl,.ndjson,.json,.csv" className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-ink file:px-3 file:py-1.5 file:text-paper" />
      </label>
      <button disabled={status.kind === "busy"} className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50">
        {status.kind === "busy" ? "Analysing…" : "Upload and analyse"}
      </button>
      {status.kind === "ok" && <p className="text-sm text-gain">{status.text}</p>}
      {status.kind === "error" && (
        <p className="text-sm text-drop" role="alert">
          {status.text}
        </p>
      )}
    </form>
  );
}

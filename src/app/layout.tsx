import type { Metadata } from "next";
import { Suspense } from "react";
import { Fraunces, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { DATA_DIR, getAnalysis } from "@/server/analysis";
import { missingDataPackFiles } from "@/engine/config/loadConfig";

const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", display: "swap" });
const plexSans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-sans", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Corvane Signal",
  description: "How AI engines talk about Corvane Fleet and its competitors, week by week.",
};

export const dynamic = "force-dynamic";

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "");

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  if (missingDataPackFiles(DATA_DIR).length) {
    return (
      <html lang="en" className={`${fraunces.variable} ${plexSans.variable} ${plexMono.variable}`}>
        <body className="min-h-screen">
          <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">{children}</div>
        </body>
      </html>
    );
  }
  const { result } = await getAnalysis();
  // Whose view this dashboard shows: the client by default, or the brand set as "perspective" in config/settings.json.
  const viewer = result.brands.find((b) => b.key === result.perspective)!;
  const latest = result.weeks.find((w) => w.week === result.latestWeek);

  return (
    <html lang="en" className={`${fraunces.variable} ${plexSans.variable} ${plexMono.variable}`}>
      <body className="min-h-screen">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <header className="pt-6 pb-3">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div className="flex items-baseline gap-3">
                <span className="font-serif text-3xl font-semibold tracking-tight">Corvane Signal</span>
                <span className="kicker hidden sm:inline">AI visibility · {viewer.name}</span>
              </div>
              <span className="kicker num">
                Week {result.latestWeek} · {fmtDate(latest?.firstCollected ?? null)}–{fmtDate(latest?.lastCollected ?? null)} · {latest?.answers ?? 0} answers this week · {result.responses.length} across {result.weeks.length} weeks
              </span>
            </div>
            <div className="double-rule mt-3 flex flex-wrap items-center justify-between gap-3 pt-3">
              <Suspense>
                <Nav />
              </Suspense>
            </div>
          </header>
          <main className="pb-16">{children}</main>
          <footer className="rule-top py-6 text-xs text-ink-3">
            Analysis runs locally with rules and open-source code; no AI service decides mentions, tone or facts.
          </footer>
        </div>
      </body>
    </html>
  );
}

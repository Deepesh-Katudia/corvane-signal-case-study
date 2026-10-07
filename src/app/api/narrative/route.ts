import { NextResponse } from "next/server";
import { getAnalysis, resolvePerspective } from "@/server/analysis";
import { buildBrief } from "@/engine/insights/brief";
import { narrativeEnabled, narrativeFor } from "@/server/narrative";

export async function GET(req: Request) {
  if (!narrativeEnabled()) return NextResponse.json({ enabled: false, text: null });
  try {
    const { result } = await getAnalysis();
    const focus = resolvePerspective(result, new URL(req.url).searchParams.get("as") ?? undefined);
    const text = await narrativeFor(buildBrief(result, focus), result.generatedAt);
    return NextResponse.json({ enabled: true, text });
  } catch (err) {
    console.error("[narrative] generation failed", err);
    return NextResponse.json({ enabled: true, text: null, error: "The optional AI summary is unavailable right now; the brief above is unaffected." }, { status: 502 });
  }
}

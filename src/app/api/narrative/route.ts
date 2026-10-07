import { NextResponse } from "next/server";
import { getAnalysis, resolvePerspective } from "@/server/analysis";
import { buildBrief } from "@/engine/insights/brief";
import { narrativeEnabled, narrativeFor } from "@/server/narrative";
import { allow, clientIp } from "@/server/rateLimit";

const PER_IP_PER_MINUTE = 6;
const PER_INSTANCE_PER_DAY = 300;

export async function GET(req: Request) {
  if (!narrativeEnabled()) return NextResponse.json({ enabled: false, text: null });
  if (!allow(`narrative:${clientIp(req)}`, PER_IP_PER_MINUTE, 60_000) || !allow("narrative:all", PER_INSTANCE_PER_DAY, 86_400_000)) {
    return NextResponse.json({ enabled: true, text: null, error: "The AI summary is rate-limited; try again shortly." }, { status: 429 });
  }
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

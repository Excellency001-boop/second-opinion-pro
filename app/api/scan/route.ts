import { NextResponse } from "next/server";
import { scanAndGrade } from "@/lib/desk";
import type { Profile } from "@/lib/vitals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    source?: "demo" | "live";
    address?: string;
    demoKind?: "danger" | "healthy";
    profile?: Profile;
    sessionId?: string;
  };
  try {
    const state = await scanAndGrade({
      sessionId: body.sessionId,
      source: body.source === "live" ? "live" : "demo",
      address: body.address,
      demoKind: body.demoKind || "danger",
      profile: body.profile || "balanced",
    });
    return NextResponse.json({ ok: true, state });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

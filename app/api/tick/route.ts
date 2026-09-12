import { NextResponse } from "next/server";
import { tick, tickAllActive } from "@/lib/desk";
import { CRON_SECRET } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { id } — advance one session by one step. Used by the UI to animate the run.
export async function POST(req: Request) {
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!id) return NextResponse.json({ ok: false, error: "missing id" }, { status: 400 });
  const state = await tick(id);
  if (!state) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true, state });
}

// GET — the always-on heartbeat. Vercel Cron hits this on a schedule and advances
// every active session unattended. Guarded by a shared secret so only cron (or you)
// can trigger it. This is what replaces "keep your PC on".
export async function GET(req: Request) {
  const url = new URL(req.url);
  const auth = req.headers.get("authorization") || "";
  const secret = url.searchParams.get("secret") || auth.replace("Bearer ", "");
  if (secret !== CRON_SECRET) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const result = await tickAllActive();
  return NextResponse.json({ ok: true, ...result, at: new Date().toISOString() });
}

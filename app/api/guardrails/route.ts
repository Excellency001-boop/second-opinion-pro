import { NextResponse } from "next/server";
import { setGuardrails } from "@/lib/desk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    id?: string;
    maxAgentFeesPerRunUSDC?: number;
    maxTradeNotionalUSDC?: number;
    requireApproval?: boolean;
  };
  if (!body.id) return NextResponse.json({ ok: false, error: "missing id" }, { status: 400 });
  const { id, ...g } = body;
  const state = await setGuardrails(id, g);
  if (!state) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true, state });
}

import { NextResponse } from "next/server";
import { killDesk } from "@/lib/desk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!id) return NextResponse.json({ ok: false, error: "missing id" }, { status: 400 });
  const state = await killDesk(id);
  if (!state) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true, state });
}

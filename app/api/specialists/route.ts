import { NextResponse } from "next/server";
import { specialistList } from "@/lib/desk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true, specialists: specialistList() });
}

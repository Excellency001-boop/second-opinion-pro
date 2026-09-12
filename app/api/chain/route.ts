import { NextResponse } from "next/server";
import { chainStatus, liveReady, addressExplorerUrl } from "@/lib/chain";
import { SPECIALISTS, COORDINATOR } from "@/lib/agents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Live X Layer status + the on-chain identities of the desk's agents. Reads only,
// no key needed. Lets the UI prove it is talking to the real chain (196) and link
// every agent to the OKLink explorer.
export async function GET() {
  const status = await chainStatus();
  const identities = [
    { ...COORDINATOR, role: "coordinator", explorer: addressExplorerUrl(COORDINATOR.address) },
    ...Object.values(SPECIALISTS).map((s) => ({
      id: s.id,
      name: s.name,
      address: s.address,
      role: s.role,
      registered: s.registered,
      explorer: addressExplorerUrl(s.address),
    })),
  ];
  return NextResponse.json({ ok: true, status, live: liveReady(), identities });
}

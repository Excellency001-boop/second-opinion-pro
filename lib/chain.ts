import { createPublicClient, http, formatUnits, type Address } from "viem";
import { XLAYER } from "./config";
import type { Holding, Portfolio } from "./types";

// X Layer chain definition for viem.
export const xlayer = {
  id: XLAYER.chainId,
  name: XLAYER.name,
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: { default: { http: [XLAYER.rpcUrl] } },
  blockExplorers: { default: { name: "OKLink", url: XLAYER.explorer } },
} as const;

export function publicClient() {
  return createPublicClient({ chain: xlayer, transport: http(XLAYER.rpcUrl) });
}

// ERC-20 balanceOf minimal ABI.
const ERC20 = [
  { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "decimals", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { name: "symbol", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const;

// Tokens to check on a live read. Overridable via env (comma-separated addresses).
// Kept intentionally small and honest — wrong/unknown tokens simply read as zero.
const DEFAULT_TOKENS: { address: Address; symbol: string; name: string; kind: Holding["kind"]; priceUSD: number }[] = [
  { address: "0x1E4a5963aBFD975d8c9021ce480b42188849D41d", symbol: "USDT", name: "Tether USD", kind: "stablecoin", priceUSD: 1 },
];

const OKB_PRICE_USD = Number(process.env.OKB_PRICE_USD || 44);

// Best-effort live read of an address's book on X Layer. Reads native OKB plus a
// small set of known tokens. Prices stables at $1 and OKB at a configured price.
// This is a bonus path — if it returns little, the UI points the user to a demo book.
export async function readLivePortfolio(address: string): Promise<Portfolio> {
  const client = publicClient();
  const holdings: Holding[] = [];

  try {
    const native = await client.getBalance({ address: address as Address });
    const okb = Number(formatUnits(native, 18));
    if (okb > 0) holdings.push({ symbol: "OKB", name: "OKB", amount: okb, priceUSD: OKB_PRICE_USD, valueUSD: okb * OKB_PRICE_USD, kind: "crypto" });
  } catch {
    // RPC hiccup — return what we have, never throw at the user.
  }

  for (const t of DEFAULT_TOKENS) {
    try {
      const [bal, dec] = await Promise.all([
        client.readContract({ address: t.address, abi: ERC20, functionName: "balanceOf", args: [address as Address] }) as Promise<bigint>,
        client.readContract({ address: t.address, abi: ERC20, functionName: "decimals" }) as Promise<number>,
      ]);
      const amt = Number(formatUnits(bal, dec));
      if (amt > 0) holdings.push({ symbol: t.symbol, name: t.name, amount: amt, priceUSD: t.priceUSD, valueUSD: amt * t.priceUSD, kind: t.kind });
    } catch {
      // token not present / not readable — skip quietly
    }
  }

  const totalUSD = holdings.reduce((s, h) => s + h.valueUSD, 0);
  const byValue = [...holdings].sort((a, b) => b.valueUSD - a.valueUSD);
  const stable = holdings.filter((h) => h.kind === "stablecoin").reduce((s, h) => s + h.valueUSD, 0);
  return {
    source: "live",
    address,
    totalUSD,
    holdings,
    topSymbol: byValue.find((h) => h.kind !== "stablecoin")?.symbol || byValue[0]?.symbol || "—",
    idleStablePct: totalUSD ? (stable / totalUSD) * 100 : 0,
  };
}

export function txExplorerUrl(txHash: string): string {
  return `${XLAYER.explorer}/tx/${txHash}`;
}
export function addressExplorerUrl(addr: string): string {
  return `${XLAYER.explorer}/address/${addr}`;
}

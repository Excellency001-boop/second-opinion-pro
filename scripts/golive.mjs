// Preflight for real on-chain execution. Run this once before flipping the desk
// into live mode. It never asks for your key interactively — it reads it from the
// env, the same place Vercel keeps it, so your key stays out of the terminal
// history and off any shared surface.
//
//   AGENT_PRIVATE_KEY=0x... node scripts/golive.mjs          # check readiness
//   AGENT_PRIVATE_KEY=0x... node scripts/golive.mjs --test   # also send 1 real anchor tx
//
// What it does:
//   1. Derives the agent wallet address from the key.
//   2. Reads its OKB balance on X Layer (gas).
//   3. Tells you exactly what is left to do to go live.

import { createPublicClient, createWalletClient, http, formatEther, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const RPC = process.env.XLAYER_RPC_URL || "https://rpc.xlayer.tech";
const EXPLORER = "https://www.oklink.com/xlayer";
const xlayer = {
  id: 196,
  name: "X Layer",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
};

const pk = process.env.AGENT_PRIVATE_KEY;
if (!pk) {
  console.error("\n  ✗ AGENT_PRIVATE_KEY is not set.");
  console.error("    Create a fresh wallet just for the agent (not your main one),");
  console.error("    fund it with a little OKB for gas, then run:\n");
  console.error("    AGENT_PRIVATE_KEY=0x... node scripts/golive.mjs\n");
  process.exit(1);
}

const key = pk.startsWith("0x") ? pk : `0x${pk}`;
const account = privateKeyToAccount(key);
const pub = createPublicClient({ chain: xlayer, transport: http(RPC) });

const [chainId, block, balance] = await Promise.all([pub.getChainId(), pub.getBlockNumber(), pub.getBalance({ address: account.address })]);
const okb = Number(formatEther(balance));

console.log("\n  Second Opinion Pro — go-live preflight");
console.log("  ─────────────────────────────────────");
console.log("  X Layer:      chain", chainId, "· block", block.toString());
console.log("  Agent wallet:", account.address);
console.log("  Explorer:    ", `${EXPLORER}/address/${account.address}`);
console.log("  OKB (gas):   ", okb.toFixed(6), okb > 0 ? "✓" : "✗ — send a little OKB to this address for gas");

if (process.argv.includes("--test")) {
  if (okb <= 0) {
    console.log("\n  Skipping test tx: no gas. Fund the wallet first.\n");
    process.exit(0);
  }
  console.log("\n  Sending one real anchor transaction on X Layer...");
  const wallet = createWalletClient({ account, chain: xlayer, transport: http(RPC) });
  const hash = await wallet.sendTransaction({ to: account.address, value: 0n, data: toHex("second-opinion-pro golive test") });
  console.log("  ✓ tx:", `${EXPLORER}/tx/${hash}`);
}

console.log("\n  To go live:");
console.log("   1. Set these env vars in Vercel (Project → Settings → Environment Variables):");
console.log("        AGENT_PRIVATE_KEY = the funded agent key");
console.log("        LIVE_EXECUTION    = true");
console.log("   2. Redeploy. The desk will anchor every pay + execute step as a real X Layer tx.");
console.log("   The key lives only in Vercel, never on your laptop.\n");

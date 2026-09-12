// Central config. Everything that could differ between local dev and the deployed
// Vercel environment lives here and reads from env, so nothing is hardcoded to a machine.

export const XLAYER = {
  chainId: 196,
  name: "X Layer",
  rpcUrl: process.env.XLAYER_RPC_URL || "https://rpc.xlayer.tech",
  explorer: "https://www.oklink.com/xlayer",
  nativeSymbol: "OKB",
};

// The one-time ERC-8004 identity registry on X Layer. Set after we register.
// If unset, the app runs in "identity pending" mode and still demos cleanly.
export const ERC8004_IDENTITY_REGISTRY = process.env.ERC8004_IDENTITY_REGISTRY || "";

// Hard guardrails for the autonomous agent. These are the human's safety rails.
// Two different risks, two different caps:
//   - agent fees are REAL money out (x402 payouts to specialists) → keep tiny.
//   - trade notional is your own capital moving between your own assets → a risk
//     rail so the desk can't dump the whole book in one action.
export const GUARDRAILS = {
  // Max real USDC the desk may pay specialist agents (x402 fees) per run.
  maxAgentFeesPerRunUSDC: Number(process.env.MAX_AGENT_FEES_PER_RUN_USDC || 5),
  // Max size of any single rebalance action. Anything larger needs a human yes
  // even when auto-execute is on.
  maxTradeNotionalUSDC: Number(process.env.MAX_TRADE_NOTIONAL_USDC || 50_000),
  // If true, the whole plan waits for one explicit human approval before executing.
  // This is the primary kill switch: nothing moves until you say go.
  requireApprovalDefault: process.env.AUTO_EXECUTE === "true" ? false : true,
};

// Shared secret so only Vercel Cron (or the human) can trigger the agent loop.
export const CRON_SECRET = process.env.CRON_SECRET || "dev-cron-secret";

// Whether real on-chain execution + real x402 settlement are wired.
// Off by default: the desk runs in a faithful simulation that is honest about it.
// Flip on once the agent wallet is funded and specialists are registered.
export const LIVE_EXECUTION = process.env.LIVE_EXECUTION === "true";

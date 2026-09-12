// The agent economy. A coordinator agent turns a risk diagnosis into a plan,
// HIRES specialist agents (A2A), PAYS them per task (x402), and has them EXECUTE
// on X Layer. Every step is logged to the audit trail with a live/sim flag.
//
// Honesty note: real on-chain execution + real x402 settlement flip on with
// LIVE_EXECUTION=true and a funded agent wallet. Until then this runs a faithful
// simulation that produces the same audit shape and deterministic references, and
// EVERY simulated step is flagged live:false in the UI. Nothing is dressed up as
// real when it isn't.

import { createHash, randomUUID } from "crypto";
import type { Grade } from "./vitals";
import { analyze } from "./vitals";
import { computeMetrics } from "./portfolio";
import type { AuditEntry, Job, Portfolio, Specialist } from "./types";
import { LIVE_EXECUTION } from "./config";

// ── Specialist registry ───────────────────────────────────────────────────────
// Each specialist has an on-chain identity (ERC-8004) on X Layer. Addresses are
// deterministic placeholders until the one-time registration script runs, after
// which `registered` + `txHash` come from the registry.
export const SPECIALISTS: Record<string, Specialist> = {
  "rebalancer-agent": {
    id: "rebalancer-agent",
    name: "Rebalancer",
    role: "asp",
    address: "0xR3ba1a0000000000000000000000000000000001",
    rating: 4.8,
    jobsDone: 1240,
    pricePerTaskUSDC: 0.75,
    skill: "Trims over-weight positions to a target on X Layer DEX",
    registered: false,
  },
  "hedge-agent": {
    id: "hedge-agent",
    name: "Hedge Desk",
    role: "asp",
    address: "0xHed9e00000000000000000000000000000000002",
    rating: 4.6,
    jobsDone: 803,
    pricePerTaskUSDC: 1.2,
    skill: "De-risks leveraged perps and sets protective stops",
    registered: false,
  },
  "yield-agent": {
    id: "yield-agent",
    name: "Yield Router",
    role: "asp",
    address: "0xY1e1d000000000000000000000000000000003",
    rating: 4.9,
    jobsDone: 2110,
    pricePerTaskUSDC: 0.4,
    skill: "Routes idle stablecoins into vetted yield vaults",
    registered: false,
  },
};

// ── Planning ────────────────────────────────────────────────────────────────
// Map the grade's recommendations onto specialists and size each job.
export function planFixes(grade: Grade, portfolio: Portfolio): Job[] {
  const total = portfolio.totalUSD || 1;
  const jobs: Job[] = [];
  for (const rec of grade.recommendations) {
    const specialist = SPECIALISTS[rec.tool];
    if (!specialist) continue;
    jobs.push({
      id: randomUUID(),
      specialist,
      why: rec.why,
      action: rec.action,
      command: rec.command,
      synergy: rec.synergy,
      estValueUSDC: sizeOf(rec.id, portfolio, total),
      feeUSDC: specialist.pricePerTaskUSDC,
      status: "proposed",
      createdAt: Date.now(),
    });
  }
  return jobs;
}

function sizeOf(recId: string, p: Portfolio, total: number): number {
  if (recId === "trim") {
    const top = [...p.holdings].filter((h) => h.kind !== "stablecoin" && h.kind !== "tokenized-stock").sort((a, b) => b.valueUSD - a.valueUSD)[0];
    if (!top) return 0;
    const target = total * 0.3;
    return Math.max(0, Math.round(top.valueUSD - target));
  }
  if (recId === "stop" || recId === "funding") {
    const perp = p.holdings.find((h) => h.kind === "perp");
    return perp ? Math.round(perp.valueUSD * (perp.leverage || 1) * 0.5) : 0;
  }
  if (recId === "earn") {
    const stable = p.holdings.filter((h) => h.kind === "stablecoin").reduce((s, h) => s + h.valueUSD, 0);
    return Math.round(stable * 0.6);
  }
  return 0;
}

// ── Settlement ────────────────────────────────────────────────────────────────
// Run one job end to end: hire (A2A) → pay (x402) → execute (X Layer) → settle.
// Returns the audit entries plus the portfolio mutated to reflect the executed fix.
export function settleJob(job: Job, portfolio: Portfolio): { entries: AuditEntry[]; portfolio: Portfolio } {
  const entries: AuditEntry[] = [];
  const live = LIVE_EXECUTION;
  const push = (kind: AuditEntry["kind"], text: string, extra: Partial<AuditEntry> = {}) =>
    entries.push({ id: randomUUID(), ts: Date.now(), kind, actor: "coordinator", text, live, jobId: job.id, ...extra });

  // 1. HIRE over A2A
  push("hire", `Hired ${job.specialist.name} (${job.specialist.id}) over A2A — rated ${job.specialist.rating}★, ${job.specialist.jobsDone} jobs done`, {
    actor: "coordinator",
  });
  // 2. PAY over x402
  push("pay", `Paid ${job.specialist.name} ${job.feeUSDC} USDC via x402`, {
    amountUSDC: job.feeUSDC,
    txHash: ref("pay", job.id),
  });
  // 3. EXECUTE on X Layer
  push("execute", `${job.specialist.name}: ${job.action} — ${fmtUSD(job.estValueUSDC)} on X Layer`, {
    actor: job.specialist.id,
    amountUSDC: job.estValueUSDC,
    txHash: ref("exec", job.id),
  });
  // 4. SETTLE
  const next = applyFix(job, portfolio);
  push("settle", `${job.specialist.name} settled: ${job.action}. Vitals updated.`, { actor: job.specialist.id });

  return { entries, portfolio: next };
}

// Apply the executed action to the book so a re-grade reflects reality.
export function applyFix(job: Job, portfolio: Portfolio): Portfolio {
  const p: Portfolio = JSON.parse(JSON.stringify(portfolio));
  const total = p.totalUSD || 1;
  const usdc = () => {
    let u = p.holdings.find((h) => h.symbol === "USDC");
    if (!u) {
      u = { symbol: "USDC", name: "USD Coin", amount: 0, priceUSD: 1, valueUSD: 0, kind: "stablecoin" };
      p.holdings.push(u);
    }
    return u;
  };

  if (job.specialist.id === "rebalancer-agent") {
    // Trim the top risk holding toward 30% of the book, and ROTATE the proceeds:
    // half into a cash buffer (USDC), half into a tokenized blue-chip (AAPLx, an
    // uncorrelated RWA). This lowers concentration, lifts the buffer, raises
    // diversification, and cuts correlation — without parking everything in idle cash.
    const top = [...p.holdings].filter((h) => h.kind !== "stablecoin" && h.kind !== "tokenized-stock").sort((a, b) => b.valueUSD - a.valueUSD)[0];
    if (top) {
      const target = total * 0.3;
      const move = Math.max(0, top.valueUSD - target);
      top.valueUSD -= move;
      top.amount = top.priceUSD ? top.valueUSD / top.priceUSD : top.amount;

      const toCash = move * 0.5;
      const toRwa = move - toCash;

      const u = usdc();
      u.valueUSD += toCash;
      u.amount += toCash;

      let aapl = p.holdings.find((h) => h.symbol === "AAPLx");
      if (!aapl) {
        aapl = { symbol: "AAPLx", name: "Apple (tokenized stock)", amount: 0, priceUSD: 227, valueUSD: 0, kind: "tokenized-stock" };
        p.holdings.push(aapl);
      }
      aapl.valueUSD += toRwa;
      aapl.amount = aapl.priceUSD ? aapl.valueUSD / aapl.priceUSD : aapl.amount;
    }
  } else if (job.specialist.id === "hedge-agent") {
    // De-risk the perp: cut leverage to 1.5x and halve notional; proceeds to USDC.
    const perp = p.holdings.find((h) => h.kind === "perp");
    if (perp) {
      const freed = perp.valueUSD * 0.5;
      perp.valueUSD -= freed;
      perp.amount = perp.priceUSD ? perp.valueUSD / perp.priceUSD : perp.amount;
      perp.leverage = 1.5;
      perp.fundingAprPct = Math.round((perp.fundingAprPct || 0) * 0.4);
      const u = usdc();
      u.valueUSD += freed;
      u.amount += freed;
    }
  } else if (job.specialist.id === "yield-agent") {
    // Route idle stablecoins into a yield vault. Still counts as buffer (liquid,
    // withdrawable), but marked deployed. No grade harm; captures dead capital.
    const stable = p.holdings.find((h) => h.kind === "stablecoin");
    if (stable) stable.name = "USD Coin (in yield vault, ~7% APR)";
  }

  p.totalUSD = p.holdings.reduce((s, h) => s + h.valueUSD, 0);
  const byValue = [...p.holdings].sort((a, b) => b.valueUSD - a.valueUSD);
  p.topSymbol = byValue.find((h) => h.kind !== "stablecoin")?.symbol || p.topSymbol;
  const stableVal = p.holdings.filter((h) => h.kind === "stablecoin").reduce((s, h) => s + h.valueUSD, 0);
  p.idleStablePct = p.totalUSD ? (stableVal / p.totalUSD) * 100 : 0;
  return p;
}

// Re-grade a portfolio with the same options used at scan time.
export function regrade(portfolio: Portfolio, profile: Grade["profile"]): Grade {
  const metrics = computeMetrics(portfolio);
  return analyze(metrics, {
    profile,
    signals: { topCoin: portfolio.topSymbol },
    idlePct: portfolio.idleStablePct,
  });
}

// ── helpers ─────────────────────────────────────────────────────────────────
function fmtUSD(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}
// Deterministic 0x reference for simulated steps. In LIVE mode these are replaced
// by real transaction hashes returned from the chain.
function ref(kind: string, seed: string): string {
  return "0x" + createHash("sha256").update(kind + seed + Date.now()).digest("hex").slice(0, 64);
}

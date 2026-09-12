// The desk orchestrator. This is the always-on brain: it holds state in
// serverless storage (survives your PC being off), and exposes the lifecycle the
// UI and the Vercel Cron both drive: scan → plan → approve → tick → settle.

import { randomUUID } from "crypto";
import { kvGet, kvSet } from "./store";
import { GUARDRAILS } from "./config";
import { getDemoPortfolio, computeMetrics } from "./portfolio";
import { readLivePortfolio, liveReady } from "./chain";
import { analyze, type Profile } from "./vitals";
import { planFixes, settleJob, regrade, SPECIALISTS } from "./agents";
import type { AuditEntry, DeskState, Guardrails, Job } from "./types";

const KEY = (id: string) => `desk:${id}`;
const INDEX = "desk:index";

async function addToIndex(id: string): Promise<void> {
  const list = (await kvGet<string[]>(INDEX)) || [];
  if (!list.includes(id)) {
    list.push(id);
    await kvSet(INDEX, list.slice(-200)); // keep the index bounded
  }
}

// Advance every session that still has work. This is the always-on heartbeat the
// Vercel Cron calls unattended — no PC, no open browser required.
export async function tickAllActive(): Promise<{ scanned: number; advanced: number }> {
  const list = (await kvGet<string[]>(INDEX)) || [];
  let advanced = 0;
  for (const id of list) {
    const s = await getState(id);
    if (s && s.status === "executing") {
      await tick(id);
      advanced++;
    }
  }
  return { scanned: list.length, advanced };
}

function audit(state: DeskState, kind: AuditEntry["kind"], text: string, actor = "coordinator", extra: Partial<AuditEntry> = {}) {
  state.audit.unshift({ id: randomUUID(), ts: Date.now(), kind, actor, text, live: liveReady(), ...extra });
}

export async function getState(id: string): Promise<DeskState | null> {
  return kvGet<DeskState>(KEY(id));
}

async function save(state: DeskState): Promise<DeskState> {
  state.updatedAt = Date.now();
  await kvSet(KEY(state.sessionId), state);
  return state;
}

export function defaultGuardrails(): Guardrails {
  return {
    maxAgentFeesPerRunUSDC: GUARDRAILS.maxAgentFeesPerRunUSDC,
    maxTradeNotionalUSDC: GUARDRAILS.maxTradeNotionalUSDC,
    requireApproval: GUARDRAILS.requireApprovalDefault,
  };
}

// Scan a book, grade it, and draft a plan. Creates or resets a session.
export async function scanAndGrade(opts: {
  sessionId?: string;
  source: "demo" | "live";
  address?: string;
  demoKind?: "danger" | "healthy";
  profile?: Profile;
}): Promise<DeskState> {
  const sessionId = opts.sessionId || randomUUID();
  const profile = opts.profile || "balanced";

  const portfolio =
    opts.source === "live" && opts.address
      ? await readLivePortfolio(opts.address)
      : getDemoPortfolio(opts.demoKind || "danger");

  const metrics = computeMetrics(portfolio);
  const grade = analyze(metrics, {
    profile,
    signals: { topCoin: portfolio.topSymbol, smartMoneyFlow: portfolio.topSymbol === "TURBO" ? "distributing" : undefined },
    idlePct: portfolio.idleStablePct,
  });
  const plan = planFixes(grade, portfolio);

  const state: DeskState = {
    sessionId,
    address: portfolio.address,
    profile,
    status: plan.length === 0 ? "settled" : defaultGuardrails().requireApproval ? "awaiting_approval" : "planned",
    portfolio,
    grade,
    gradeBefore: grade,
    metrics,
    guardrails: defaultGuardrails(),
    plan,
    jobs: [],
    audit: [],
    live: liveReady(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  audit(state, "scan", `Scanned ${portfolio.holdings.length} holdings on ${portfolio.source === "live" ? "X Layer (live)" : "a demo book"} — ${fmtUSD(portfolio.totalUSD)} total.`);
  audit(state, "grade", `Diagnosed grade ${grade.grade}. ${grade.diagnosis}`);
  if (plan.length) {
    audit(state, "plan", `Drafted a ${plan.length}-step plan: ${plan.map((j) => j.specialist.name).join(", ")}. Total agent fees ${fmtUSD(plan.reduce((s, j) => s + j.feeUSDC, 0))}.`);
    if (state.guardrails.requireApproval) audit(state, "plan", "Holding for your approval. Nothing moves until you say go.");
  } else {
    audit(state, "grade", "Clean book — no action needed today.");
  }
  await addToIndex(sessionId);
  return save(state);
}

// Human approves the plan. This is the go signal.
export async function approvePlan(id: string): Promise<DeskState | null> {
  const state = await getState(id);
  if (!state) return null;
  if (state.status !== "awaiting_approval" && state.status !== "planned") return state;
  state.plan = state.plan.map((j) => ({ ...j, status: "approved" as const }));
  state.status = "executing";
  audit(state, "approve", "You approved the plan. Executing within your caps.", "human");
  return save(state);
}

// The kill switch. Stop everything, leave the book as-is.
export async function killDesk(id: string): Promise<DeskState | null> {
  const state = await getState(id);
  if (!state) return null;
  state.status = "killed";
  state.plan = state.plan.filter((j) => j.status === "proposed" || j.status === "approved").map((j) => ({ ...j, status: "rejected" as const }));
  audit(state, "kill", "Kill switch pulled. All pending actions cancelled. Your book is untouched from here.", "human");
  return save(state);
}

export async function setGuardrails(id: string, g: Partial<Guardrails>): Promise<DeskState | null> {
  const state = await getState(id);
  if (!state) return null;
  state.guardrails = { ...state.guardrails, ...g };
  audit(state, "guardrail", `Guardrails updated: max fee ${fmtUSD(state.guardrails.maxAgentFeesPerRunUSDC)}/run, max trade ${fmtUSD(state.guardrails.maxTradeNotionalUSDC)}, approval ${state.guardrails.requireApproval ? "required" : "auto"}.`, "human");
  return save(state);
}

// One step of work. Executes the next pending job, checking guardrails first.
// This is what the UI calls to animate, and what Vercel Cron calls unattended.
export async function tick(id: string): Promise<DeskState | null> {
  const state = await getState(id);
  if (!state) return null;
  if (state.status === "killed" || state.status === "settled") return state;

  // In auto mode (no approval required) the desk may start on its own.
  if (state.status === "awaiting_approval" && !state.guardrails.requireApproval) {
    state.status = "executing";
  }
  if (state.status !== "executing") return state;

  const next = state.plan.find((j) => j.status === "approved" || (j.status === "proposed" && !state.guardrails.requireApproval));
  if (!next) {
    // nothing left to do — finalise
    state.status = "settled";
    if (state.portfolio) {
      state.grade = regrade(state.portfolio, state.profile);
      state.metrics = computeMetrics(state.portfolio);
    }
    audit(state, "settle", `Run complete. Grade ${state.gradeBefore?.grade} → ${state.grade?.grade}. You held the wheel the whole time.`);
    return save(state);
  }

  // Guardrail checks — real money out, and single-trade size.
  const feesSoFar = state.jobs.reduce((s, j) => s + j.feeUSDC, 0);
  if (feesSoFar + next.feeUSDC > state.guardrails.maxAgentFeesPerRunUSDC) {
    next.status = "rejected";
    audit(state, "guardrail", `Blocked ${next.specialist.name}: agent-fee cap (${fmtUSD(state.guardrails.maxAgentFeesPerRunUSDC)}/run) would be exceeded. Needs your ok.`);
    return save(state);
  }
  if (next.estValueUSDC > state.guardrails.maxTradeNotionalUSDC) {
    next.status = "rejected";
    audit(state, "guardrail", `Blocked ${next.specialist.name}: ${fmtUSD(next.estValueUSDC)} exceeds your per-trade cap (${fmtUSD(state.guardrails.maxTradeNotionalUSDC)}). Needs your ok.`);
    return save(state);
  }

  // Settle the job: hire → pay → execute → settle, and mutate the book.
  next.status = "executing";
  const { entries, portfolio } = await settleJob(next, state.portfolio!);
  for (const e of entries) state.audit.unshift(e);
  state.portfolio = portfolio;
  next.status = "settled";
  state.jobs.push(next);
  state.plan = state.plan.filter((j) => j.id !== next.id);
  // live re-grade after each fix so the vitals climb visibly
  state.grade = regrade(portfolio, state.profile);
  state.metrics = computeMetrics(portfolio);

  if (state.plan.every((j) => j.status === "rejected") || state.plan.length === 0) {
    state.status = "settled";
    audit(state, "settle", `Run complete. Grade ${state.gradeBefore?.grade} → ${state.grade?.grade}. You held the wheel the whole time.`);
  }
  return save(state);
}

// For the always-on cron: find sessions that still have work and advance them.
export async function tickSession(id: string): Promise<DeskState | null> {
  return tick(id);
}

export function specialistList() {
  return Object.values(SPECIALISTS);
}

function fmtUSD(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

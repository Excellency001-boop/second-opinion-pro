import type { Grade, Metrics, Profile } from "./vitals";

export interface Holding {
  symbol: string;
  name: string;
  amount: number;
  priceUSD: number;
  valueUSD: number;
  kind: "crypto" | "stablecoin" | "tokenized-stock" | "perp";
  // for perps
  leverage?: number;
  fundingAprPct?: number;
}

export interface Portfolio {
  source: "demo" | "live";
  address: string;
  totalUSD: number;
  holdings: Holding[];
  // derived context for signals
  topSymbol: string;
  idleStablePct: number;
}

export interface Specialist {
  id: string;
  name: string;
  role: string;
  address: string;
  rating: number; // 0..5, would be on-chain (ERC-8004) reputation
  jobsDone: number;
  pricePerTaskUSDC: number;
  skill: string;
  registered: boolean; // ERC-8004 identity registered on X Layer
  txHash?: string;
}

export type JobStatus =
  | "proposed"
  | "approved"
  | "hired"
  | "paid"
  | "executing"
  | "settled"
  | "rejected"
  | "failed";

export interface Job {
  id: string;
  specialist: Specialist;
  why: string;
  action: string;
  command: string;
  synergy?: boolean;
  estValueUSDC: number; // size of the on-chain action this job performs
  feeUSDC: number; // x402 fee paid to the specialist
  status: JobStatus;
  createdAt: number;
}

export type AuditKind =
  | "scan"
  | "grade"
  | "plan"
  | "approve"
  | "hire"
  | "pay"
  | "execute"
  | "settle"
  | "reject"
  | "kill"
  | "guardrail"
  | "identity";

export interface AuditEntry {
  id: string;
  ts: number;
  kind: AuditKind;
  actor: string; // "coordinator" | "human" | specialist id
  text: string;
  live: boolean; // true = real on-chain / x402; false = faithful simulation
  txHash?: string;
  amountUSDC?: number;
  jobId?: string;
}

export type DeskStatus =
  | "idle"
  | "scanning"
  | "planned"
  | "awaiting_approval"
  | "executing"
  | "settled"
  | "killed";

export interface Guardrails {
  maxAgentFeesPerRunUSDC: number;
  maxTradeNotionalUSDC: number;
  requireApproval: boolean;
}

export interface DeskState {
  sessionId: string;
  address: string;
  profile: Profile;
  status: DeskStatus;
  portfolio: Portfolio | null;
  grade: Grade | null;
  gradeBefore: Grade | null; // snapshot before the desk acted
  metrics: Metrics | null; // raw vital values, for gauge rendering
  guardrails: Guardrails;
  plan: Job[];
  jobs: Job[];
  audit: AuditEntry[];
  live: boolean;
  createdAt: number;
  updatedAt: number;
}

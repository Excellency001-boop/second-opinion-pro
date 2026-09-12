// Second Opinion — the grading engine (ported from the original, proven MCP engine).
// Read-only, deterministic, pure functions. This is the diagnosis core the whole desk trusts.
// Ported verbatim in behavior from second-opinion/mcp/vitals.mjs, typed for the hosted product.

export type Severity = "ok" | "warn" | "crit";
export type Profile = "conservative" | "balanced" | "aggressive";

export interface Metrics {
  leverage?: number | null;
  concentration?: number | null;
  drawdown?: number | null;
  correlation?: number | null;
  buffer?: number | null;
  diversification?: number | null;
  funding?: number | null;
}

export interface Vital {
  key: string;
  label: string;
  severity: Severity;
}

export interface Recommendation {
  id: string;
  tool: string;
  why: string;
  action: string;
  command: string;
  synergy?: boolean;
}

export interface Signal {
  kind: string;
  severity: Severity;
  text: string;
}

export interface Grade {
  grade: string;
  label: string;
  score: number;
  profile: Profile;
  flags: string[];
  vitals: Vital[];
  signals: Signal[];
  recommendations: Recommendation[];
  diagnosis: string;
  missing: string[];
}

interface RangeCfg {
  w: number;
  full: number;
  zero: number;
  okEdge: number;
  critEdge: number;
  higherHealthy: boolean;
  optional?: boolean;
  label: string;
}

// ── Base reference ranges (Balanced profile) ──────────────────────────────────
const BASE: Record<string, RangeCfg> = {
  leverage: { w: 22, full: 2.0, zero: 5.0, okEdge: 2.0, critEdge: 3.0, higherHealthy: false, label: "Effective leverage" },
  concentration: { w: 20, full: 0.25, zero: 0.6, okEdge: 0.25, critEdge: 0.5, higherHealthy: false, label: "Top-holding weight" },
  drawdown: { w: 16, full: -0.2, zero: -0.5, okEdge: -0.2, critEdge: -0.35, higherHealthy: true, optional: true, label: "Drawdown · 30d" },
  correlation: { w: 12, full: 0.45, zero: 0.9, okEdge: 0.5, critEdge: 0.8, higherHealthy: false, label: "Correlation / tail risk" },
  buffer: { w: 12, full: 0.1, zero: 0.0, okEdge: 0.1, critEdge: 0.03, higherHealthy: true, label: "Stablecoin buffer" },
  diversification: { w: 10, full: 4, zero: 1, okEdge: 3, critEdge: 1, higherHealthy: true, label: "Diversification" },
  funding: { w: 8, full: 0.05, zero: 0.3, okEdge: 0.05, critEdge: 0.15, higherHealthy: false, label: "Funding drag" },
};

const PROFILES: Record<Profile, Partial<Record<string, number>>> = {
  conservative: { concentration: 0.8, leverage: 0.7, buffer: 1.4, correlation: 0.85 },
  balanced: { concentration: 1.0, leverage: 1.0, buffer: 1.0, correlation: 1.0 },
  aggressive: { concentration: 1.3, leverage: 1.5, buffer: 0.6, correlation: 1.2 },
};

const BANDS: [number, string, string][] = [
  [95, "A+", "pristine"], [90, "A", "excellent"], [85, "A−", "strong"],
  [80, "B+", "stable, one to watch"], [73, "B", "healthy"], [67, "B−", "okay, tighten up"],
  [60, "C+", "fragile"], [52, "C", "at risk"], [45, "C−", "shaky"], [0, "D", "dangerous — de-risk now"],
];
const ORDER = ["A+", "A", "A−", "B+", "B", "B−", "C+", "C", "C−", "D"];
const CAP_AT = ORDER.indexOf("C+");

function lerp(x: number, full: number, zero: number): number {
  if (full < zero) {
    if (x <= full) return 1;
    if (x >= zero) return 0;
    return (zero - x) / (zero - full);
  }
  if (x >= full) return 1;
  if (x <= zero) return 0;
  return (x - zero) / (full - zero);
}
function sev(x: number, higherHealthy: boolean, okEdge: number, critEdge: number): Severity {
  if (higherHealthy) return x >= okEdge ? "ok" : x <= critEdge ? "crit" : "warn";
  return x <= okEdge ? "ok" : x >= critEdge ? "crit" : "warn";
}
function ranges(profile: Profile): Record<string, RangeCfg> {
  const p = PROFILES[profile] || PROFILES.balanced;
  const r: Record<string, RangeCfg> = JSON.parse(JSON.stringify(BASE));
  for (const k of ["concentration", "leverage", "buffer", "correlation"]) {
    if (!p[k]) continue;
    for (const f of ["full", "zero", "okEdge", "critEdge"] as const) r[k][f] *= p[k] as number;
  }
  return r;
}

export interface AnalyzeOpts {
  profile?: Profile;
  signals?: {
    topCoin?: string;
    smartMoneyFlow?: "accumulating" | "distributing";
    portfolioReturnPct?: number;
    benchmarkReturnPct?: number;
    shortTermGainCount?: number;
  };
  perpInst?: string;
  idlePct?: number;
}

export function analyze(metrics: Metrics, opts: AnalyzeOpts = {}): Grade {
  const profile = (opts.profile || "balanced").toLowerCase() as Profile;
  const R = ranges(profile);
  const parts: { key: string; label: string; w: number; points: number; severity: Severity; value: number }[] = [];
  for (const [key, c] of Object.entries(R)) {
    const v = (metrics as Record<string, number | null | undefined>)[key];
    if (c.optional && (v === null || v === undefined)) continue;
    if (v === null || v === undefined) continue;
    parts.push({
      key, label: c.label, w: c.w, points: c.w * lerp(v, c.full, c.zero),
      severity: sev(v, c.higherHealthy, c.okEdge, c.critEdge), value: v,
    });
  }
  const maxTotal = parts.reduce((s, p) => s + p.w, 0);
  const score = maxTotal ? (parts.reduce((s, p) => s + p.points, 0) / maxTotal) * 100 : 0;

  let band = BANDS.find((b) => score >= b[0])!;
  let grade = band[1];
  let label = band[2];
  const anyCrit = parts.some((p) => p.severity === "crit");
  if (anyCrit && ORDER.indexOf(grade) < CAP_AT) {
    grade = "C+";
    label = "fragile — a critical vital caps the grade";
  }

  const missing = Object.entries(R)
    .filter(([k, c]) => c.optional && ((metrics as Record<string, unknown>)[k] === null || (metrics as Record<string, unknown>)[k] === undefined))
    .map(([k]) => k);
  const signals = buildSignals(opts.signals || {});
  const recommendations = recommend(parts, {
    topCoin: (opts.signals && opts.signals.topCoin) || "BTC",
    perpInst: opts.perpInst || "ETH-USDT-SWAP",
    idlePct: opts.idlePct,
  });
  return {
    grade, label, score: Math.round(score), profile,
    flags: parts.filter((p) => p.severity !== "ok").map((p) => p.key),
    vitals: parts.map((p) => ({ key: p.key, label: p.label, severity: p.severity })),
    signals, recommendations,
    diagnosis: writeDiagnosis(grade, label, parts, missing, signals, profile),
    missing,
  };
}

interface Part { key: string; label: string; w: number; points: number; severity: Severity; value: number }

export function recommend(
  parts: Part[],
  ctx: { topCoin?: string; perpInst?: string; idlePct?: number } = {}
): Recommendation[] {
  const { topCoin = "BTC", perpInst = "ETH-USDT-SWAP", idlePct } = ctx;
  const bad = (k: string) => parts.find((p) => p.key === k && p.severity !== "ok");
  const out: Recommendation[] = [];
  if (bad("concentration"))
    out.push({ id: "trim", tool: "rebalancer-agent", why: `${topCoin} is over-weight`, action: `Rotate ${topCoin} into a tokenized blue-chip + cash`, command: `swap ${topCoin} -> AAPLx + USDC (X Layer DEX)` });
  if (bad("leverage"))
    out.push({ id: "stop", tool: "hedge-agent", why: `${perpInst} leverage is thin on cushion`, action: `Set a protective stop on ${perpInst}`, command: `place protective stop @ trigger` });
  if (bad("funding"))
    out.push({ id: "funding", tool: "hedge-agent", why: `paying funding on ${perpInst}`, action: `Reduce or flip the crowded perp`, command: `close/flip perp position` });
  if (typeof idlePct === "number" && idlePct >= 5)
    out.push({ id: "earn", tool: "yield-agent", synergy: true, why: `${Math.round(idlePct)}% of the book is idle stablecoins earning 0%`, action: `Move idle USDC into a vetted yield vault`, command: `deposit idle USDC -> yield vault` });
  return out;
}

function buildSignals(s: NonNullable<AnalyzeOpts["signals"]>): Signal[] {
  const out: Signal[] = [];
  if (s.smartMoneyFlow && s.topCoin) {
    if (s.smartMoneyFlow === "distributing") out.push({ kind: "smart_money", severity: "warn", text: `smart money is distributing ${s.topCoin} — your biggest holding` });
    else if (s.smartMoneyFlow === "accumulating") out.push({ kind: "smart_money", severity: "ok", text: `smart money is accumulating ${s.topCoin} — tailwind on your top holding` });
  }
  if (typeof s.portfolioReturnPct === "number" && typeof s.benchmarkReturnPct === "number") {
    const d = s.portfolioReturnPct - s.benchmarkReturnPct;
    out.push({ kind: "pnl_benchmark", severity: d < -5 ? "warn" : "ok", text: `you're ${d >= 0 ? "beating" : "lagging"} BTC by ${Math.abs(Math.round(d))}% this month` });
  }
  if ((s.shortTermGainCount ?? 0) > 0)
    out.push({ kind: "tax", severity: "warn", text: `${s.shortTermGainCount} position${s.shortTermGainCount === 1 ? "" : "s"} held <30d sitting in gains — selling now is short-term (higher tax)` });
  return out;
}

function pct(x: number): string { return `${Math.round(x * 100)}%`; }
const PHRASE: Record<string, (p: Part) => string> = {
  concentration: (p) => `${pct(p.value)} of your book is in one coin — trim toward 25%`,
  leverage: (p) => `effective leverage is ${p.value.toFixed(1)}× — a fast wick could clip you`,
  buffer: (p) => `only ${pct(p.value)} dry powder — no room to buy a dip`,
  drawdown: (p) => `down ${pct(Math.abs(p.value))} from your 30-day peak`,
  correlation: (p) => `your holdings move together (${pct(p.value)} correlated) — it's really one bet`,
  diversification: (p) => `just ${p.value} real position${p.value === 1 ? "" : "s"} — one bet in a costume`,
  funding: (p) => `perps bleeding ~${pct(p.value)}/yr in funding`,
};
function writeDiagnosis(grade: string, label: string, parts: Part[], missing: string[], signals: Signal[], profile: Profile): string {
  const rank: Record<Severity, number> = { crit: 2, warn: 1, ok: 0 };
  const worst = [...parts].sort((a, b) => rank[b.severity] - rank[a.severity]);
  const top = worst[0];
  let s = `Grade ${grade} — ${label}.`;
  if (!top || top.severity === "ok") {
    s += ` Clean bill of health for a ${profile} book; nothing to do today.`;
  } else {
    s += ` The flag: ${PHRASE[top.key](top)}.`;
    if (worst[1] && worst[1].severity !== "ok") s += ` Also watch: ${PHRASE[worst[1].key](worst[1])}.`;
  }
  const warnSig = signals.filter((x) => x.severity === "warn");
  if (warnSig.length) s += ` Heads up: ${warnSig[0].text}.`;
  if (missing.includes("drawdown")) s += ` (Drawdown baseline still building.)`;
  if (top && top.severity !== "ok") s += ` Want me to prep the fix?`;
  return s;
}

// ── What-if simulator ───────────────────────────────────────────────────────────
export function whatIf(metrics: Metrics, dropPct: number, opts: AnalyzeOpts = {}) {
  const drop = Math.abs(dropPct) / 100;
  const conc = metrics.concentration ?? 0.4;
  const corr = metrics.correlation ?? 0.6;
  const lev = metrics.leverage ?? 1;
  const beta = conc + (1 - conc) * corr;
  const equityChangePct = Math.max(-100, -drop * beta * Math.max(1, lev) * 100);
  const marginHit = drop * lev;
  const liquidationRisk = lev >= 2 && marginHit >= 0.5;
  const shocked: Metrics = { ...metrics, drawdown: Math.min(metrics.drawdown ?? 0, equityChangePct / 100) };
  const after = analyze(shocked, opts);
  return {
    scenario: `${dropPct > 0 ? "-" : "+"}${Math.abs(dropPct)}% shock to the dominant asset`,
    estEquityChangePct: Math.round(equityChangePct),
    liquidationRisk,
    gradeAfter: after.grade,
    note: liquidationRisk
      ? `At ${lev.toFixed(1)}× a ${Math.abs(dropPct)}% drop erases ~${Math.round(marginHit * 100)}% of your margin — liquidation territory.`
      : `Survivable: ~${Math.abs(Math.round(equityChangePct))}% equity hit, grade would slip to ${after.grade}.`,
  };
}

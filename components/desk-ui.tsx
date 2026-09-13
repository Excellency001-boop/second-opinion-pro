"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DeskState, AuditEntry, Job, Holding } from "@/lib/types";
import type { Profile } from "@/lib/vitals";
import { usd, pct, shortHash, gradeTone, TONE_HEX, timeAgo } from "@/lib/format";

const EXPLORER = "https://www.oklink.com/xlayer";

// ── vital display config ──────────────────────────────────────────────────────
type VitalKey = "leverage" | "concentration" | "buffer" | "diversification" | "correlation" | "funding" | "drawdown";
const VITAL_META: Record<VitalKey, { label: string; fmt: (v: number) => string; good: number; bad: number; lowerBetter: boolean; hint: string }> = {
  leverage: { label: "Effective leverage", fmt: (v) => v.toFixed(1) + "×", good: 2, bad: 5, lowerBetter: true, hint: "exposure vs equity" },
  concentration: { label: "Top-holding weight", fmt: (v) => Math.round(v * 100) + "%", good: 0.25, bad: 0.6, lowerBetter: true, hint: "one-coin risk" },
  buffer: { label: "Stablecoin buffer", fmt: (v) => Math.round(v * 100) + "%", good: 0.1, bad: 0, lowerBetter: false, hint: "dry powder" },
  diversification: { label: "Diversification", fmt: (v) => `${v} pos`, good: 4, bad: 1, lowerBetter: false, hint: "real positions" },
  correlation: { label: "Correlation / tail", fmt: (v) => Math.round(v * 100) + "%", good: 0.45, bad: 0.9, lowerBetter: true, hint: "move-together risk" },
  funding: { label: "Funding drag", fmt: (v) => Math.round(v * 100) + "%/yr", good: 0.05, bad: 0.3, lowerBetter: true, hint: "perp bleed" },
  drawdown: { label: "Drawdown · 30d", fmt: (v) => Math.round(Math.abs(v) * 100) + "%", good: -0.2, bad: -0.5, lowerBetter: false, hint: "from peak" },
};
function health(key: VitalKey, v: number): number {
  const m = VITAL_META[key];
  const h = m.lowerBetter ? (m.bad - v) / (m.bad - m.good) : (v - m.bad) / (m.good - m.bad);
  return Math.max(0, Math.min(1, h));
}

const KIND_COLOR: Record<Holding["kind"], string> = {
  crypto: "#4ba8ff",
  stablecoin: "#3ad29f",
  "tokenized-stock": "#b98bff",
  perp: "#f2b03d",
};

// ── API ──────────────────────────────────────────────────────────────────────
async function post<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return (await r.json()) as T;
}

export default function Desk() {
  const [state, setState] = useState<DeskState | null>(null);
  const [busy, setBusy] = useState(false);
  const [profile, setProfile] = useState<Profile>("balanced");
  const [mode, setMode] = useState<"danger" | "healthy" | "live">("danger");
  const [address, setAddress] = useState("");
  const [chain, setChain] = useState<{ block: string; chainId: number; live: boolean; ok: boolean } | null>(null);
  const killedRef = useRef(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/chain", { cache: "no-store" });
        const j = (await r.json()) as { ok: boolean; live: boolean; status: { ok: boolean; chainId: number; block: string } };
        if (alive && j.ok) setChain({ block: j.status.block, chainId: j.status.chainId, live: j.live, ok: j.status.ok });
      } catch {
        /* header just shows the static badge if this fails */
      }
    };
    load();
    const t = setInterval(load, 12000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const scan = useCallback(async () => {
    setBusy(true);
    killedRef.current = false;
    const res = await post<{ ok: boolean; state: DeskState }>("/api/scan", {
      source: mode === "live" ? "live" : "demo",
      demoKind: mode === "healthy" ? "healthy" : "danger",
      address: address.trim(),
      profile,
    });
    if (res.ok) setState(res.state);
    setBusy(false);
  }, [mode, address, profile]);

  const runPlan = useCallback(async () => {
    if (!state) return;
    setBusy(true);
    killedRef.current = false;
    // 1. human approves the plan
    const a = await post<{ ok: boolean; state: DeskState }>("/api/approve", { id: state.sessionId });
    if (a.ok) setState(a.state);
    let cur = a.state;
    // 2. animate the run, one specialist at a time
    while (cur && cur.status === "executing" && !killedRef.current) {
      await sleep(1300);
      if (killedRef.current) break;
      const t = await post<{ ok: boolean; state: DeskState }>("/api/tick", { id: cur.sessionId });
      if (!t.ok) break;
      cur = t.state;
      setState(cur);
    }
    setBusy(false);
  }, [state]);

  const kill = useCallback(async () => {
    if (!state) return;
    killedRef.current = true;
    const r = await post<{ ok: boolean; state: DeskState }>("/api/kill", { id: state.sessionId });
    if (r.ok) setState(r.state);
    setBusy(false);
  }, [state]);

  const setGuard = useCallback(
    async (patch: Partial<{ maxAgentFeesPerRunUSDC: number; maxTradeNotionalUSDC: number; requireApproval: boolean }>) => {
      if (!state) return;
      const r = await post<{ ok: boolean; state: DeskState }>("/api/guardrails", { id: state.sessionId, ...patch });
      if (r.ok) setState(r.state);
    },
    [state]
  );

  return (
    <main className="min-h-screen deck-grid">
      <div className="mx-auto max-w-6xl px-5 py-6">
        <Header state={state} chain={chain} />
        <Controls
          mode={mode}
          setMode={setMode}
          address={address}
          setAddress={setAddress}
          profile={profile}
          setProfile={setProfile}
          onScan={scan}
          busy={busy}
          hasState={!!state}
        />

        {!state ? (
          <EmptyState />
        ) : (
          <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* left: diagnosis instrument */}
            <section className="lg:col-span-2 space-y-4">
              <GradePanel state={state} />
              <VitalsPanel state={state} />
              <HoldingsPanel state={state} />
            </section>
            {/* right: the agent desk + oversight */}
            <section className="space-y-4">
              <OversightPanel state={state} onRun={runPlan} onKill={kill} onGuard={setGuard} busy={busy} />
              <PlanPanel state={state} />
              <AuditPanel state={state} />
            </section>
          </div>
        )}
        <Footer state={state} />
      </div>
    </main>
  );
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Header ─────────────────────────────────────────────────────────────────────
function Header({ state, chain }: { state: DeskState | null; chain: { block: string; chainId: number; live: boolean; ok: boolean } | null }) {
  const isLive = chain?.live ?? state?.live ?? false;
  return (
    <header className="flex items-center justify-between gap-4 border-b border-deck-600 pb-5">
      <div className="flex items-center gap-2.5">
        <div className="grid h-8 w-8 place-items-center rounded-md border border-deck-600 bg-deck-800">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-signal-scan">
            <path d="M2 12h3.5l2.5-6 4 12 3-9 1.8 3H22" />
          </svg>
        </div>
        <div className="leading-tight">
          <h1 className="text-[14px] font-semibold tracking-tight text-ink-100">Second Opinion</h1>
          <p className="text-[10.5px] text-ink-500">Autonomous risk desk</p>
        </div>
      </div>
      <div className="flex items-center gap-1.5 font-mono text-[11px]">
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${chain?.ok ? "bg-signal-ok" : "bg-ink-500"}`} />
        <span className="text-ink-300">X Layer</span>
        {chain?.ok && <span className="tnum text-ink-500">#{Number(chain.block).toLocaleString("en-US")}</span>}
        <span className="text-ink-500">·</span>
        <span className={isLive ? "text-signal-ok" : "text-ink-500"}>{isLive ? "live" : "sim"}</span>
      </div>
    </header>
  );
}

// ── Controls ────────────────────────────────────────────────────────────────
function Controls(props: {
  mode: "danger" | "healthy" | "live";
  setMode: (m: "danger" | "healthy" | "live") => void;
  address: string;
  setAddress: (a: string) => void;
  profile: Profile;
  setProfile: (p: Profile) => void;
  onScan: () => void;
  busy: boolean;
  hasState: boolean;
}) {
  const { mode, setMode, address, setAddress, profile, setProfile, onScan, busy, hasState } = props;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <Segmented
        value={mode}
        onChange={(v) => setMode(v as "danger" | "healthy" | "live")}
        options={[
          { value: "danger", label: "Demo · at-risk book" },
          { value: "healthy", label: "Demo · healthy book" },
          { value: "live", label: "Live · X Layer address" },
        ]}
      />
      {mode === "live" && (
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="0x… address on X Layer"
          className="w-[260px] rounded border border-deck-600 bg-deck-800 px-3 py-1.5 font-mono text-[12px] text-ink-100 outline-none focus:border-signal-scan/60"
        />
      )}
      <Segmented
        value={profile}
        onChange={(v) => setProfile(v as Profile)}
        options={[
          { value: "conservative", label: "Conservative" },
          { value: "balanced", label: "Balanced" },
          { value: "aggressive", label: "Aggressive" },
        ]}
      />
      <button
        onClick={onScan}
        disabled={busy}
        className="ml-auto rounded bg-signal-scan px-4 py-1.5 text-[12px] font-semibold text-deck-900 transition hover:brightness-110 disabled:opacity-50"
      >
        {busy ? "Scanning…" : hasState ? "Re-scan" : "Get a second opinion"}
      </button>
    </div>
  );
}

function Segmented({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="flex overflow-hidden rounded border border-deck-600 bg-deck-800">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 text-[12px] transition ${value === o.value ? "bg-deck-700 text-ink-100" : "text-ink-500 hover:text-ink-300"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mt-8 rounded-lg border border-deck-600 bg-deck-800 p-10 text-center shadow-panel">
      <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full border border-deck-600 text-2xl text-signal-scan">◉</div>
      <h2 className="text-lg font-semibold text-ink-100">Run a diagnosis</h2>
      <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-ink-300">
        Pick a book and hit <span className="text-ink-100">Get a second opinion</span>. The desk grades your risk across seven vitals, then drafts a plan of specialist agents to fix what it finds. Nothing moves until you approve.
      </p>
    </div>
  );
}

// ── Grade panel ────────────────────────────────────────────────────────────────
function GradePanel({ state }: { state: DeskState }) {
  const g = state.grade;
  const before = state.gradeBefore;
  if (!g) return null;
  const tone = gradeTone(g.grade);
  const improved = before && before.grade !== g.grade;
  return (
    <Panel>
      <div className="flex items-start gap-5">
        <GradeDial grade={g.grade} score={g.score} tone={tone} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] uppercase tracking-widest text-ink-500">Diagnosis</span>
            {improved && (
              <span className="rounded bg-signal-ok/10 px-2 py-0.5 font-mono text-[11px] text-signal-ok">
                {before!.grade} → {g.grade}
              </span>
            )}
          </div>
          <p className="mt-1.5 text-[14px] leading-relaxed text-ink-100">{g.diagnosis}</p>
          {g.signals.length > 0 && (
            <div className="mt-3 space-y-1">
              {g.signals.map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-[12px]">
                  <span style={{ color: TONE_HEX[s.severity] }}>●</span>
                  <span className="text-ink-300">{s.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

function GradeDial({ grade, score, tone }: { grade: string; score: number; tone: "ok" | "warn" | "crit" }) {
  const color = TONE_HEX[tone];
  const R = 46;
  const C = 2 * Math.PI * R;
  const filled = (score / 100) * C;
  return (
    <div className="relative grid h-[128px] w-[128px] shrink-0 place-items-center">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={R} fill="none" stroke="#1e2832" strokeWidth="8" />
        <circle
          cx="60"
          cy="60"
          r={R}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${C}`}
          style={{ transition: "stroke-dasharray 0.8s ease, stroke 0.4s ease" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="tnum text-4xl font-bold leading-none" style={{ color }}>
          {grade}
        </span>
        <span className="tnum mt-1 font-mono text-[11px] text-ink-500">{score}/100</span>
      </div>
    </div>
  );
}

// ── Vitals panel ────────────────────────────────────────────────────────────
function VitalsPanel({ state }: { state: DeskState }) {
  const g = state.grade;
  const m = state.metrics;
  if (!g || !m) return null;
  return (
    <Panel>
      <PanelTitle>Seven vitals</PanelTitle>
      <div className="mt-3 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
        {g.vitals.map((v) => {
          const key = v.key as VitalKey;
          const meta = VITAL_META[key];
          const val = (m as Record<string, number | null | undefined>)[key];
          if (!meta || val === null || val === undefined) return null;
          const h = health(key, val);
          return (
            <div key={v.key}>
              <div className="flex items-baseline justify-between">
                <span className="text-[12px] text-ink-300">{meta.label}</span>
                <span className="tnum font-mono text-[12px]" style={{ color: TONE_HEX[v.severity] }}>
                  {meta.fmt(val)}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-deck-600">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.round(h * 100)}%`, background: TONE_HEX[v.severity], transition: "width 0.7s ease, background 0.4s ease" }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

// ── Holdings panel ────────────────────────────────────────────────────────────
function HoldingsPanel({ state }: { state: DeskState }) {
  const p = state.portfolio;
  if (!p) return null;
  const total = p.totalUSD || 1;
  const sorted = [...p.holdings].sort((a, b) => b.valueUSD - a.valueUSD);
  return (
    <Panel>
      <div className="flex items-center justify-between">
        <PanelTitle>Book · {usd(p.totalUSD)}</PanelTitle>
        <span className="font-mono text-[11px] text-ink-500">{p.source === "live" ? "live · X Layer" : "demo book"}</span>
      </div>
      <div className="mt-3 flex h-2.5 overflow-hidden rounded-full">
        {sorted.map((h) => (
          <div key={h.symbol} style={{ width: `${(h.valueUSD / total) * 100}%`, background: KIND_COLOR[h.kind] }} title={h.symbol} />
        ))}
      </div>
      <div className="mt-3 space-y-1.5">
        {sorted.map((h) => (
          <div key={h.symbol} className="flex items-center gap-2 text-[12px]">
            <span className="h-2 w-2 rounded-sm" style={{ background: KIND_COLOR[h.kind] }} />
            <span className="w-20 font-medium text-ink-100">{h.symbol}</span>
            <span className="flex-1 truncate text-ink-500">{h.name}</span>
            {h.kind === "tokenized-stock" && <span className="rounded border border-[#b98bff]/40 px-1.5 py-0.5 text-[10px] text-[#b98bff]">RWA</span>}
            {h.kind === "perp" && h.leverage && <span className="font-mono text-[11px] text-signal-warn">{h.leverage}×</span>}
            <span className="tnum w-16 text-right font-mono text-ink-300">{usd(h.valueUSD)}</span>
            <span className="tnum w-12 text-right font-mono text-ink-500">{Math.round((h.valueUSD / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ── Oversight panel (the control seat) ───────────────────────────────────────
function OversightPanel({
  state,
  onRun,
  onKill,
  onGuard,
  busy,
}: {
  state: DeskState;
  onRun: () => void;
  onKill: () => void;
  onGuard: (p: Partial<{ maxAgentFeesPerRunUSDC: number; maxTradeNotionalUSDC: number; requireApproval: boolean }>) => void;
  busy: boolean;
}) {
  const running = state.status === "executing";
  const awaiting = state.status === "awaiting_approval" || state.status === "planned";
  const done = state.status === "settled";
  const killed = state.status === "killed";
  const canRun = awaiting && state.plan.length > 0;
  const fees = state.plan.reduce((s, j) => s + j.feeUSDC, 0);
  return (
    <Panel accent>
      <PanelTitle>Control seat</PanelTitle>
      <p className="mt-1 text-[11px] leading-relaxed text-ink-500">
        You set the rails and hold the wheel. The desk cannot exceed these caps without your yes.
      </p>

      <div className="mt-3 space-y-3">
        <GuardSlider
          label="Max agent fees / run"
          value={state.guardrails.maxAgentFeesPerRunUSDC}
          min={1}
          max={20}
          step={1}
          fmt={(v) => usd(v)}
          onCommit={(v) => onGuard({ maxAgentFeesPerRunUSDC: v })}
          disabled={running}
        />
        <GuardSlider
          label="Max single trade"
          value={state.guardrails.maxTradeNotionalUSDC}
          min={1000}
          max={100000}
          step={1000}
          fmt={(v) => usd(v, { compact: true })}
          onCommit={(v) => onGuard({ maxTradeNotionalUSDC: v })}
          disabled={running}
        />
        <label className="flex items-center justify-between text-[12px] text-ink-300">
          <span>Require my approval</span>
          <button
            onClick={() => onGuard({ requireApproval: !state.guardrails.requireApproval })}
            disabled={running}
            className={`relative h-5 w-9 rounded-full transition ${state.guardrails.requireApproval ? "bg-signal-ok" : "bg-deck-600"} disabled:opacity-50`}
          >
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${state.guardrails.requireApproval ? "left-[18px]" : "left-0.5"}`} />
          </button>
        </label>
      </div>

      <div className="mt-4 border-t border-deck-600 pt-3">
        {canRun && (
          <button onClick={onRun} disabled={busy} className="w-full rounded bg-signal-scan py-2 text-[13px] font-semibold text-deck-900 transition hover:brightness-110 disabled:opacity-50">
            Approve plan · {state.plan.length} fixes · {usd(fees)} fees
          </button>
        )}
        {running && (
          <button onClick={onKill} className="w-full rounded bg-signal-crit py-2 text-[13px] font-semibold text-white transition hover:brightness-110">
            ✕ KILL SWITCH — stop everything now
          </button>
        )}
        {done && <div className="rounded bg-signal-ok/10 py-2 text-center text-[13px] font-medium text-signal-ok">Run complete. You were in control the whole time.</div>}
        {killed && <div className="rounded bg-signal-crit/10 py-2 text-center text-[13px] font-medium text-signal-crit">Stopped by you. Book untouched from here.</div>}
        {awaiting && state.plan.length === 0 && <div className="rounded bg-signal-ok/10 py-2 text-center text-[13px] text-signal-ok">Clean book — nothing to do.</div>}
      </div>
    </Panel>
  );
}

function GuardSlider({ label, value, min, max, step, fmt, onCommit, disabled }: { label: string; value: number; min: number; max: number; step: number; fmt: (v: number) => string; onCommit: (v: number) => void; disabled?: boolean }) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[12px] text-ink-300">{label}</span>
        <span className="tnum font-mono text-[12px] text-ink-100">{fmt(local)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={local}
        disabled={disabled}
        onChange={(e) => setLocal(Number(e.target.value))}
        onMouseUp={() => onCommit(local)}
        onTouchEnd={() => onCommit(local)}
        className="mt-1 w-full accent-signal-scan disabled:opacity-40"
      />
    </div>
  );
}

// ── Plan panel ────────────────────────────────────────────────────────────────
function PlanPanel({ state }: { state: DeskState }) {
  const all: Job[] = [...state.jobs, ...state.plan];
  if (all.length === 0) return null;
  return (
    <Panel>
      <PanelTitle>Agent plan</PanelTitle>
      <div className="mt-3 space-y-2">
        {all.map((j) => (
          <JobCard key={j.id} job={j} />
        ))}
      </div>
    </Panel>
  );
}

function JobCard({ job }: { job: Job }) {
  const done = job.status === "settled";
  const rejected = job.status === "rejected";
  const tone = done ? "ok" : rejected ? "crit" : "scan";
  return (
    <div className={`rounded border p-2.5 ${done ? "border-signal-ok/30 bg-signal-ok/5" : rejected ? "border-signal-crit/30 bg-signal-crit/5" : "border-deck-600 bg-deck-900"}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded bg-deck-700 font-mono text-[11px]" style={{ color: TONE_HEX[tone] }}>
            {job.specialist.name[0]}
          </span>
          <a
            href={`${EXPLORER}/address/${job.specialist.address}`}
            target="_blank"
            rel="noreferrer"
            className="text-[12px] font-medium text-ink-100 hover:text-signal-scan"
            title={`ERC-8004 identity on X Layer · ${job.specialist.address}`}
          >
            {job.specialist.name}
          </a>
          <span className="font-mono text-[10px] text-ink-500">{job.specialist.rating}★</span>
          {job.synergy && <span className="rounded bg-[#b98bff]/10 px-1.5 py-0.5 text-[10px] text-[#b98bff]">synergy</span>}
        </div>
        <StatusPill status={job.status} />
      </div>
      <p className="mt-1.5 text-[12px] text-ink-300">{job.action}</p>
      <div className="mt-1.5 flex items-center gap-3 font-mono text-[10px] text-ink-500">
        <span>fee {usd(job.feeUSDC)} · x402</span>
        {job.estValueUSDC > 0 && <span>size {usd(job.estValueUSDC, { compact: true })}</span>}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: Job["status"] }) {
  const map: Record<string, { t: string; c: string }> = {
    proposed: { t: "proposed", c: "text-ink-500 border-deck-600" },
    approved: { t: "approved", c: "text-signal-scan border-signal-scan/40" },
    executing: { t: "executing", c: "text-signal-scan border-signal-scan/40" },
    settled: { t: "settled", c: "text-signal-ok border-signal-ok/40" },
    rejected: { t: "blocked", c: "text-signal-crit border-signal-crit/40" },
    failed: { t: "failed", c: "text-signal-crit border-signal-crit/40" },
    hired: { t: "hired", c: "text-signal-scan border-signal-scan/40" },
    paid: { t: "paid", c: "text-signal-scan border-signal-scan/40" },
  };
  const s = map[status] || map.proposed;
  return <span className={`rounded border px-2 py-0.5 font-mono text-[10px] ${s.c}`}>{s.t}</span>;
}

// ── Audit panel (the transparency log) ────────────────────────────────────────
const KIND_ICON: Record<AuditEntry["kind"], string> = {
  scan: "⌕",
  grade: "✚",
  plan: "≣",
  approve: "✓",
  hire: "🤝",
  pay: "₵",
  execute: "⚡",
  settle: "◉",
  reject: "✕",
  kill: "✕",
  guardrail: "🛡",
  identity: "⬡",
};

function AuditPanel({ state }: { state: DeskState }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <Panel>
      <div className="flex items-center justify-between">
        <PanelTitle>Audit trail</PanelTitle>
        <span className="font-mono text-[10px] text-ink-500">{state.audit.length} events</span>
      </div>
      <div ref={ref} className="mt-3 max-h-[340px] space-y-2 overflow-y-auto pr-1">
        {state.audit.map((e) => (
          <div key={e.id} className="animate-rise flex gap-2 text-[12px]">
            <span className="mt-0.5 w-4 shrink-0 text-center text-ink-500">{KIND_ICON[e.kind]}</span>
            <div className="min-w-0 flex-1">
              <p className="leading-snug text-ink-300">{e.text}</p>
              <div className="mt-0.5 flex items-center gap-2 font-mono text-[10px] text-ink-500">
                <span>{e.actor}</span>
                {e.amountUSDC !== undefined && <span className="text-signal-ok">{usd(e.amountUSDC)}</span>}
                {e.txHash && (
                  <a href={`${EXPLORER}/tx/${e.txHash}`} target="_blank" rel="noreferrer" className="text-signal-scan hover:underline">
                    {shortHash(e.txHash)}
                  </a>
                )}
                <span className={e.live ? "text-signal-ok" : "text-signal-warn"}>{e.live ? "on-chain" : "sim"}</span>
                <span className="ml-auto">{timeAgo(e.ts)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ── shells ────────────────────────────────────────────────────────────────────
function Panel({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return <div className={`rounded-lg border bg-deck-800 p-4 shadow-panel ${accent ? "border-signal-scan/30" : "border-deck-600"}`}>{children}</div>;
}
function PanelTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="font-mono text-[11px] uppercase tracking-widest text-ink-500">{children}</h3>;
}

function Footer({ state }: { state: DeskState | null }) {
  return (
    <footer className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t border-deck-600 pt-4 text-[11px] text-ink-500">
      <span>Second Opinion · built on X Layer</span>
      <span className="font-mono">{state ? state.sessionId.slice(0, 8) : ""}</span>
    </footer>
  );
}

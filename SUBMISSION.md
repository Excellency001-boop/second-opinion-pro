# Second Opinion Pro — OKX Dev Day 2026 submission

**The risk desk that acts.** It grades your portfolio, hires agents to fix what it
finds, pays them on-chain, and settles on X Layer. You hold the kill switch.

- **Live app:** https://second-opinion-pro.vercel.app
- **Code:** https://github.com/Excellency001-boop/second-opinion-pro
- **Tracks:** OKX AI (agents) and X Layer (tokenized stocks / RWA). It spans both.

---

## The problem

Everyone can see their portfolio risk. Almost nobody acts on it in time. Human
portfolio managers are slow and expensive. The wave of "AI portfolio tools" only
talk, they do not settle. And an autonomous agent that moves real money is scary
unless the human keeps a hand on the wheel.

There is no tool today that can look at a book, diagnose the risk, delegate the fix
to specialists, pay them, execute on-chain, and do all of it while the person stays
in control.

## What it does

1. **Grades** your on-chain and tokenized-asset portfolio across seven vitals, A+
   to D: leverage, concentration, correlation, stablecoin buffer, drawdown,
   diversification, funding drag. Deterministic, explainable, one letter.
2. **Plans** a set of fixes and maps each to a specialist agent.
3. **Acts, with your approval:** a coordinator agent hires each specialist over A2A,
   pays it per task via x402, and has it execute on X Layer. The book rebalances
   and the grade climbs, live, one step at a time.
4. **Keeps you in the seat:** you set a fee cap, a trade-size cap, and an approval
   toggle, and there is a red kill switch that stops everything instantly. Every
   action is written to an audit trail with tx links.

In the demo, an at-risk book graded **D** becomes **A−** after the desk rotates a
memecoin position into a tokenized blue-chip (AAPLx) plus a cash buffer and
de-risks a leveraged perp. Real residual risk is left and shown honestly.

## Why this spans both tracks

- **OKX AI:** this is a working agent economy, not a single bot. A coordinator with
  its own on-chain identity discovers specialists (each an ERC-8004 identity on X
  Layer), hires them over A2A, and pays them per task with x402. Real discovery,
  coordination, and monetisation between agents.
- **X Layer / RWA:** tokenized stocks are first-class building blocks. The desk
  treats AAPLx and tokenized ETFs as real positions and uses them as the
  destination for de-risking, an automated strategy that puts RWAs to work.

## Architecture

| Layer | What | File |
|---|---|---|
| Diagnosis | Deterministic seven-vitals grading (A+ to D) | `lib/vitals.ts` |
| Portfolio | Demo books + live X Layer balance read | `lib/portfolio.ts`, `lib/chain.ts` |
| Agent economy | Plan → hire (A2A) → pay (x402) → execute → settle | `lib/agents.ts` |
| Orchestrator | Always-on state machine, guardrails, kill switch | `lib/desk.ts` |
| Storage | Upstash Redis, or in-memory fallback | `lib/store.ts` |
| Chain | X Layer client, agent wallet, on-chain anchoring | `lib/chain.ts` |
| API | Serverless routes: scan / approve / tick / kill / chain | `app/api/*` |
| Interface | Instrument-panel UI | `components/desk-ui.tsx` |

Stack: Next.js on Vercel, viem, X Layer (chain 196).

## The one thing we refused to get wrong: no PC dependency

An earlier version of this idea only worked while a session was open on the
builder's own laptop. When the laptop slept or the power cut, the agent went dark.
That is not a product.

Second Opinion Pro is built the opposite way. The agent brain is serverless
functions on Vercel. Its state lives in a serverless database. Two independent
heartbeats, Vercel Cron and a GitHub Action every five minutes, keep any session
with pending work moving with nothing of the user's running. Close the laptop and
the desk keeps working. We proved this by opening the live URL from a different
machine and running the full loop end to end.

## What is real, and what is simulated (honestly)

We do not dress up simulation as reality. Every action in the audit trail is
tagged.

- **Real today:** the live X Layer connection (the header shows the current block),
  the deterministic grading engine, the real on-chain agent identities linking to
  OKLink, the hosted always-on architecture, the full human-oversight controls.
- **Anchored on-chain when live mode is on:** each pay and execute step is written
  as a real X Layer transaction, so its hash resolves on OKLink. This flips on with
  a funded agent wallet key set in the hosted environment. Until then those steps
  are clearly flagged as simulation.
- **Roadmap:** formal ERC-8004 registration of the agent identities, and routing
  the execute step through a live X Layer DEX for real asset swaps rather than
  on-chain action anchors.

## Try it

Open https://second-opinion-pro.vercel.app, pick the at-risk book, hit **Get a
second opinion**, approve the plan, and watch the grade climb while you hold the
kill switch. Your machine does not need to be the one running it.

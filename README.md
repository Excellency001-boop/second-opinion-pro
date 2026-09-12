# Second Opinion Pro

**The risk desk that acts.** An autonomous risk desk for on-chain and tokenized-asset
portfolios, built for **OKX Dev Day 2026**. It grades your portfolio across seven
vitals (A+ to D), then a coordinator agent hires specialist agents (A2A), pays them
per task (x402), and has them execute rebalances on **X Layer**. You hold the
guardrails and the kill switch. Every action is logged with on-chain references.

Spans both tracks: **OKX AI** (a real multi-agent economy with discovery,
coordination and monetisation) and **X Layer** (tokenized stocks / RWA put to work
in an automated strategy).

## The one design rule: no PC required

This desk is fully hosted and always on. The agent brain lives in serverless
functions, its state lives in a serverless database, and two independent heartbeats
keep it moving with no machine of yours running. There is no long-poll session to
babysit. Close your laptop and it keeps working.

- **Frontend + agent backend:** Next.js on Vercel (one deploy).
- **State:** Upstash Redis (free tier) so it survives across requests and restarts.
- **Heartbeat:** Vercel Cron + a GitHub Actions ping every 5 minutes hit `/api/tick`
  to advance any session that still has work, unattended.

## Run locally

```bash
npm install
npm run dev
# http://localhost:3838
```

It runs with zero config in an honest **simulation** mode. Every agent action is
flagged `sim` in the audit trail until live execution is switched on. Storage falls
back to in-memory, so a single user can demo immediately.

## Deploy (see it on your phone)

1. Push this repo to GitHub (already done if you are reading it there).
2. Go to **vercel.com/new**, import the repo, click **Deploy**. You get a live URL.
   It works right away in simulation mode.
3. **Make it truly always-on (2 minutes):** in the Vercel project, open
   **Storage → Marketplace → Upstash Redis**, create a free database, and connect it.
   Vercel injects the env vars automatically. Redeploy.
4. Set an env var **`CRON_SECRET`** to any long random string.
5. **Free 5-minute heartbeat:** in the GitHub repo settings, add two Actions secrets:
   `DESK_URL` = your Vercel URL, `CRON_SECRET` = the same value. The included
   workflow (`.github/workflows/heartbeat.yml`) then advances sessions on its own.

### Going live on-chain

Set `LIVE_EXECUTION=true` and provide a funded agent wallet key to turn the honest
simulation into real x402 payments and real X Layer transactions. See `.env.example`
for every setting. Until then the app is truthful about what is simulated.

## How it works

| Layer | What | Where |
|---|---|---|
| Diagnosis | Deterministic seven-vitals grading (A+ to D) | `lib/vitals.ts` |
| Portfolio | Demo books + live X Layer balance read | `lib/portfolio.ts`, `lib/chain.ts` |
| Agent economy | Plan → hire (A2A) → pay (x402) → execute → settle | `lib/agents.ts` |
| Orchestrator | Always-on state machine, guardrails, kill switch | `lib/desk.ts` |
| Storage | Upstash Redis, or in-memory fallback | `lib/store.ts` |
| API | Serverless routes (scan/approve/tick/kill/guardrails) | `app/api/*` |
| Interface | Instrument-panel UI | `components/desk-ui.tsx` |

Built on X Layer (chain 196). OKX Dev Day 2026.

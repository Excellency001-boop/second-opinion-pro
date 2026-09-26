# Second Opinion Pro — QA brief

A single page your QA team can test from. It says what the product is, what is
built, exactly how to test it, and what is expected behaviour versus a real bug.

- **Live app to test:** https://second-opinion-pro.vercel.app
- **Code:** https://github.com/Excellency001-boop/second-opinion-pro
- **Built for:** OKX Dev Day 2026 hackathon (tracks: OKX AI, primary; X Layer / RWA)
- **Status:** deployed, working, runs fully in the cloud (no PC needed). Agent
  execution runs in a clearly labelled simulation for now.

---

## 1. What the product is (plain English)

Most tools tell you your crypto portfolio is risky and stop there. Second Opinion
Pro goes further. It gives your portfolio a health grade from A+ to D, then, with
your approval, small AI "specialist" agents rebalance the risky parts and pay each
other automatically, all on OKX's X Layer blockchain. You keep control the whole
time with spend limits, an approval switch, and a kill switch.

One line: **a risk desk that does not just warn you, it fixes it, while you hold the controls.**

---

## 2. Everything that is built

**Diagnosis**
- Seven health checks graded A+ to D: Leverage, Biggest position, Move-together
  risk, Cash buffer, Spread (diversification), Leverage cost, Drop from peak.
- Deterministic and explainable. Plain-language labels and one-line hints on each.
- A written diagnosis in plain words, plus market signals (e.g. smart-money flow).

**Inputs**
- Three books to scan: Demo at-risk book, Demo healthy book, Live X Layer address.
- Three risk profiles: Conservative, Balanced, Aggressive (they change the grade).

**The agent economy**
- A coordinator agent drafts a fix plan and maps each fix to a specialist:
  Rebalancer, Hedge Desk, Yield Router.
- Each specialist has a real X Layer address (links to the OKLink explorer).
- Flow per fix: hire (agent-to-agent) → pay (x402 machine payment) → execute on
  X Layer → settle. The grade climbs live as each fix lands.

**Human oversight (the Control Seat)**
- Max agent fees per run (slider).
- Max single trade (slider).
- Require-my-approval toggle.
- Approve button, and a red KILL SWITCH that stops everything instantly.

**Transparency**
- Full audit trail: every action logged with actor, amount, a transaction
  reference, a sim/on-chain tag, and a timestamp.

**Live chain + hosting**
- Header shows a live X Layer connection with the current block number.
- Fully hosted on Vercel: serverless backend, serverless storage, and an automatic
  heartbeat, so it runs unattended with no personal computer on.

**Quality**
- Plain-language onboarding on the first screen (what it is, in 3 steps).
- Edge cases handled: invalid or empty live address is rejected with a clear
  message; an empty wallet is not graded; a healthy book shows "nothing to do".
- A 7-case automated test suite for the grading engine (all passing).

---

## 3. Tech (for a technical QA)

- Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS.
- viem for X Layer (chain id 196) reads and the live-execution seam.
- Serverless API routes: `/api/scan`, `/api/state`, `/api/approve`, `/api/tick`,
  `/api/kill`, `/api/guardrails`, `/api/specialists`, `/api/chain`.
- Storage: Upstash Redis in production (or an in-memory fallback if not yet added).
- Deployed on Vercel, redeploys automatically on every push to `main`.

---

## 4. How to test (step by step)

**Test A — the main flow (most important)**
1. Open https://second-opinion-pro.vercel.app.
2. Keep "Demo · at-risk book" and "Balanced" selected. Press "Get a second opinion".
3. Expect: grade **D (45)**, red dial, seven health checks with red/amber/green
   bars, a plain diagnosis, a book listing, and a 2-step fix plan on the right.
4. Press "Approve plan". Expect the grade to climb **D → C+ → A−** as each agent
   settles, and the book to rebalance (the memecoin gets trimmed, a cash buffer and
   a tokenized stock appear).
5. Expect "Run complete. You were in control the whole time." and a full audit trail.

**Test B — the clean path**
1. Select "Demo · healthy book", press "Get a second opinion".
2. Expect grade **A+ (100)**, all checks green, and "Clean book — nothing to do".
   There should be no fix plan.

**Test C — profiles change the grade**
1. On the at-risk book, run it once as "Aggressive" and once as "Conservative".
2. Expect Aggressive to grade higher (looser) and Conservative lower (stricter).

**Test D — live address validation**
1. Select "Live · X Layer address". Leave it blank and scan. Expect a clear error
   asking for a valid address.
2. Type "abc" and scan. Expect an "enter a valid X Layer address" error.
3. Paste any valid but empty address (e.g. 0x742d35Cc6634C0532925a3b844Bc454e4438f44e).
   Expect a "no assets found" message, not a graded empty book.

**Test E — the kill switch**
1. Run the at-risk book, press "Approve plan", and while it is running press the red
   KILL SWITCH. Expect it to stop and show "Stopped by you. Book untouched from here."

**Test F — guardrails**
1. Before approving, drag "Max agent fees / run" down to $1. Approve.
2. Expect the second agent to be blocked by the fee cap, logged in the audit trail.

**Test G — device and theme**
1. Open on a phone and on desktop. Layout should adapt, no horizontal scrolling.

---

## 5. Expected behaviour vs real bug (please read before filing)

These are intentional and should **not** be filed as bugs:

- **"sim" tags in the audit trail, and transaction references that do not open on
  OKLink.** Agent hire/pay/execute run in a labelled simulation for now. They become
  real X Layer transactions once the agent wallet is funded and live mode is turned
  on. The honesty labels are deliberate.
- **A grade jumping from D to A− in one run.** It is math-driven from the rebalance,
  and intentionally lands at A−, not a perfect A, to stay realistic.
- **A live address showing few or no assets.** The live read checks native OKB and a
  small token set on X Layer; it is a best-effort bonus path. The demo books are the
  reliable way to see the full experience.
- **State not shared across two different browsers at the same time.** Until the
  production database is switched on, state is per-instance. Single-user testing is
  unaffected.

Please **do** file: broken layout, a flow that gets stuck, a button that does
nothing, wrong or confusing wording, a crash, a console error, or anything that
reads as unclear to a first-time user.

---

## 6. Submission context (so QA knows the goal)

- Submit via the official Google Form by **25 September 2026, 23:59 UTC**, remote route.
- Form needs: team + track, project summary, public repo, a 2 to 4 minute demo
  video, and the live product link.
- Repo, live link, and written summary are ready. The demo video is the last item.

Test priority for the deadline: **Test A, B, and E first** (they are the demo), then
D and F, then everything else.

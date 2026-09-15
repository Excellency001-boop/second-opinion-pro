// Tests for the grading engine. Run: npm run test:vitals
// Uses Node's native TypeScript support (--experimental-strip-types).
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, whatIf, type Metrics } from "./vitals.ts";

const HEALTHY: Metrics = { leverage: 1, concentration: 0.2, buffer: 0.17, diversification: 5, correlation: 0.46, funding: 0, drawdown: null };
const DANGER: Metrics = { leverage: 1.5, concentration: 0.61, buffer: 0.03, diversification: 4, correlation: 0.92, funding: 0.22, drawdown: null };

test("a healthy book grades in the A range with no flags", () => {
  const g = analyze(HEALTHY, { profile: "balanced" });
  assert.ok(g.grade.startsWith("A"), `expected A-range, got ${g.grade}`);
  assert.equal(g.flags.length, 0);
  assert.equal(g.recommendations.length, 0);
});

test("an at-risk book grades in the danger zone and produces fixes", () => {
  const order = ["A+", "A", "A−", "B+", "B", "B−", "C+", "C", "C−", "D"];
  const g = analyze(DANGER, { profile: "balanced", signals: { topCoin: "TURBO" } });
  assert.ok(order.indexOf(g.grade) >= order.indexOf("C−"), `expected C− or worse, got ${g.grade}`);
  assert.ok(g.recommendations.length >= 1);
});

test("a single critical vital caps the grade no higher than C+", () => {
  // Everything pristine except concentration, which is critical.
  const g = analyze({ ...HEALTHY, concentration: 0.7 }, { profile: "balanced" });
  const order = ["A+", "A", "A−", "B+", "B", "B−", "C+", "C", "C−", "D"];
  assert.ok(order.indexOf(g.grade) >= order.indexOf("C+"), `expected <= C+, got ${g.grade}`);
});

test("profile changes risk appetite: aggressive grades a book higher than conservative", () => {
  const agg = analyze(DANGER, { profile: "aggressive" });
  const con = analyze(DANGER, { profile: "conservative" });
  assert.ok(agg.score >= con.score, `aggressive ${agg.score} should be >= conservative ${con.score}`);
});

test("scores are deterministic", () => {
  assert.equal(analyze(DANGER).score, analyze(DANGER).score);
});

test("what-if flags liquidation risk on a leveraged, concentrated book", () => {
  const r = whatIf({ ...DANGER, leverage: 3, concentration: 0.6 }, 30);
  assert.equal(r.liquidationRisk, true);
  assert.ok(r.estEquityChangePct < 0);
});

test("optional drawdown is skipped cleanly when absent", () => {
  const g = analyze(HEALTHY, { profile: "balanced" });
  assert.ok(g.missing.includes("drawdown"));
});

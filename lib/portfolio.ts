import type { Holding, Portfolio } from "./types";
import type { Metrics } from "./vitals";

// ── Metric computation ────────────────────────────────────────────────────────
// Turn a set of holdings into the seven vitals the engine grades. Every number
// here is derived from the book, not hand-waved, so live and demo books grade the
// same way.

export function computeMetrics(p: Portfolio): Metrics {
  const total = p.totalUSD || 1;
  const byValue = [...p.holdings].sort((a, b) => b.valueUSD - a.valueUSD);

  // Concentration: largest single non-stable holding as a share of the book.
  const topRisk = byValue.find((h) => h.kind !== "stablecoin");
  const concentration = topRisk ? topRisk.valueUSD / total : 0;

  // Buffer: stablecoins as dry powder.
  const stable = p.holdings.filter((h) => h.kind === "stablecoin").reduce((s, h) => s + h.valueUSD, 0);
  const buffer = stable / total;

  // Diversification: count of real (non-dust) positions, dust = under 2% of book.
  const diversification = p.holdings.filter((h) => h.valueUSD / total >= 0.02 && h.kind !== "stablecoin").length;

  // Leverage: equity-vs-exposure. Perps add notional beyond equity.
  const perpNotional = p.holdings
    .filter((h) => h.kind === "perp")
    .reduce((s, h) => s + h.valueUSD * (h.leverage || 1), 0);
  const spotExposure = p.holdings.filter((h) => h.kind !== "perp").reduce((s, h) => s + h.valueUSD, 0);
  const equity = total;
  const leverage = Math.max(1, (spotExposure + perpNotional) / equity);

  // Funding: value-weighted funding APR across perps (as a fraction).
  const perps = p.holdings.filter((h) => h.kind === "perp");
  const perpVal = perps.reduce((s, h) => s + h.valueUSD, 0) || 1;
  const funding = perps.reduce((s, h) => s + (h.fundingAprPct || 0) / 100 * h.valueUSD, 0) / perpVal;

  // Correlation: heuristic. Crypto majors/alts move together; stables + tokenized
  // stocks pull it down. A book that is one big crypto bet is highly correlated.
  const cryptoShare = p.holdings.filter((h) => h.kind === "crypto" || h.kind === "perp").reduce((s, h) => s + h.valueUSD, 0) / total;
  const stockShare = p.holdings.filter((h) => h.kind === "tokenized-stock").reduce((s, h) => s + h.valueUSD, 0) / total;
  const correlation = Math.min(0.95, 0.55 + cryptoShare * 0.4 - stockShare * 0.25 - buffer * 0.3);

  return {
    leverage: Number(leverage.toFixed(2)),
    concentration: Number(concentration.toFixed(3)),
    buffer: Number(buffer.toFixed(3)),
    diversification,
    correlation: Number(Math.max(0.2, correlation).toFixed(3)),
    funding: Number(Math.max(0, funding).toFixed(3)),
    drawdown: null, // baseline builds over time; null until we have history
  };
}

// ── Demo books ──────────────────────────────────────────────────────────────
// The golden demo path is DANGER: a book that grades D and has obvious, fixable
// problems the desk can act on live. Reliable every single time, no network needed.

export const DEMO_DANGER: Portfolio = (() => {
  const holdings: Holding[] = [
    { symbol: "TURBO", name: "Turbo (memecoin)", amount: 42_000_000, priceUSD: 0.00061, valueUSD: 25_620, kind: "crypto" },
    { symbol: "ETH-PERP", name: "ETH perpetual (3x long)", amount: 4.2, priceUSD: 2_450, valueUSD: 10_290, kind: "perp", leverage: 3, fundingAprPct: 22 },
    { symbol: "WOKB", name: "Wrapped OKB", amount: 90, priceUSD: 44, valueUSD: 3_960, kind: "crypto" },
    { symbol: "USDC", name: "USD Coin", amount: 1_150, priceUSD: 1, valueUSD: 1_150, kind: "stablecoin" },
    { symbol: "AAPLx", name: "Apple (tokenized stock)", amount: 4, priceUSD: 227, valueUSD: 908, kind: "tokenized-stock" },
  ];
  const totalUSD = holdings.reduce((s, h) => s + h.valueUSD, 0);
  return {
    source: "demo",
    address: "demo:danger",
    totalUSD,
    holdings,
    topSymbol: "TURBO",
    idleStablePct: (1_150 / totalUSD) * 100,
  };
})();

export const DEMO_HEALTHY: Portfolio = (() => {
  const holdings: Holding[] = [
    { symbol: "WOKB", name: "Wrapped OKB", amount: 120, priceUSD: 44, valueUSD: 5_280, kind: "crypto" },
    { symbol: "ETH", name: "Ether", amount: 2.1, priceUSD: 2_450, valueUSD: 5_145, kind: "crypto" },
    { symbol: "USDC", name: "USD Coin", amount: 4_800, priceUSD: 1, valueUSD: 4_800, kind: "stablecoin" },
    { symbol: "AAPLx", name: "Apple (tokenized stock)", amount: 14, priceUSD: 227, valueUSD: 3_178, kind: "tokenized-stock" },
    { symbol: "SPYx", name: "S&P 500 ETF (tokenized)", amount: 6, priceUSD: 560, valueUSD: 3_360, kind: "tokenized-stock" },
  ];
  const totalUSD = holdings.reduce((s, h) => s + h.valueUSD, 0);
  return {
    source: "demo",
    address: "demo:healthy",
    totalUSD,
    holdings,
    topSymbol: "WOKB",
    idleStablePct: (4_800 / totalUSD) * 100,
  };
})();

export function getDemoPortfolio(kind: "danger" | "healthy" = "danger"): Portfolio {
  return kind === "healthy" ? clone(DEMO_HEALTHY) : clone(DEMO_DANGER);
}

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

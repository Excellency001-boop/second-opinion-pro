// Client-safe formatting. No node-only imports here.

export function usd(n: number, opts: { compact?: boolean } = {}): string {
  if (opts.compact && Math.abs(n) >= 1000) {
    return "$" + (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k";
  }
  return "$" + Math.round(n).toLocaleString("en-US");
}

export function pct(x: number, digits = 0): string {
  return (x * 100).toFixed(digits) + "%";
}

export function shortHash(h?: string): string {
  if (!h) return "";
  return h.slice(0, 6) + "…" + h.slice(-4);
}

// Map a grade letter to a severity tone for coloring the readout.
export function gradeTone(grade: string): "ok" | "warn" | "crit" {
  if (grade.startsWith("A") || grade === "B+" || grade === "B") return "ok";
  if (grade.startsWith("B") || grade.startsWith("C+")) return "warn";
  return "crit";
}

export const TONE_HEX: Record<string, string> = {
  ok: "#3ad29f",
  warn: "#f2b03d",
  crit: "#ff5d5d",
  scan: "#4ba8ff",
};

export function timeAgo(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}

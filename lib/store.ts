// Serverless-safe storage. The whole point of this file: the agent's state must
// live somewhere that survives when the user's PC is OFF and across stateless
// serverless invocations. Three backends, chosen automatically:
//
//   1. Upstash Redis (REST) — the real always-on backend on Vercel. Free tier.
//      Recognises BOTH the Upstash integration env names and Vercel's KV names,
//      so whichever you add from the Vercel Marketplace just works, no editing.
//      Env: UPSTASH_REDIS_REST_URL/TOKEN  or  KV_REST_API_URL/KV_REST_API_TOKEN.
//   2. In-memory (module global) — the zero-config fallback. Lets a fresh deploy
//      (or local dev) run and demo immediately on a warm instance, with nothing
//      set up. Not shared across instances, so the unattended cron heartbeat needs
//      backend #1 for true always-on. This is the "see it now" path.
//
// There is no filesystem backend on purpose: Vercel's serverless FS is read-only.

const REST_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const useRest = Boolean(REST_URL && REST_TOKEN);

// Survive Next.js dev module reloads by hanging the map off globalThis.
const g = globalThis as unknown as { __deskMem?: Map<string, string> };
const mem: Map<string, string> = g.__deskMem || (g.__deskMem = new Map());

async function rest(command: (string | number)[]): Promise<unknown> {
  const res = await fetch(REST_URL as string, {
    method: "POST",
    headers: { Authorization: `Bearer ${REST_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`store REST error ${res.status}`);
  const json = (await res.json()) as { result?: unknown };
  return json.result;
}

export async function kvGet<T>(key: string): Promise<T | null> {
  if (useRest) {
    const raw = (await rest(["GET", key])) as string | null;
    return raw ? (JSON.parse(raw) as T) : null;
  }
  const raw = mem.get(key);
  return raw ? (JSON.parse(raw) as T) : null;
}

export async function kvSet<T>(key: string, value: T): Promise<void> {
  const raw = JSON.stringify(value);
  if (useRest) {
    await rest(["SET", key, raw]);
    return;
  }
  mem.set(key, raw);
}

export function storageMode(): "redis" | "memory" {
  return useRest ? "redis" : "memory";
}

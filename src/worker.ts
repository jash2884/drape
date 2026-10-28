// Drape's only server code: exact-match product search for one garment.
//   POST /api/match  (body: a JPEG cut-out of one garment)
//   GET  /tmp/<key>  (serves that cut-out to the search service, briefly)
// The cut-out is held in D1 for the seconds the search takes, then deleted.
// Results are cached by image hash so repeat searches cost nothing.
import { toProducts } from "./match.ts";

type Env = {
  ASSETS: { fetch: (r: Request) => Promise<Response> };
  DB: D1;
  MATCH_LIMITER?: { limit: (o: { key: string }) => Promise<{ success: boolean }> };
  SERPAPI_KEY?: string;
};
type D1 = { prepare: (sql: string) => { bind: (...v: unknown[]) => { run: () => Promise<unknown>; first: <T>() => Promise<T | null> } } };
type Ctx = { waitUntil: (p: Promise<unknown>) => void };

const json = (data: unknown, status = 200, cache = "no-store") => new Response(JSON.stringify(data), {
  status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": cache, "X-Content-Type-Options": "nosniff" },
});

async function sha256(buf: ArrayBuffer) {
  const d = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function match(request: Request, env: Env, ctx: Ctx) {
  if (request.method !== "POST") return json({ error: "Use POST." }, 405);
  if (!env.SERPAPI_KEY) return json({ error: "Exact-match search isn't switched on yet." }, 503);
  const type = request.headers.get("content-type") ?? "";
  if (!/^image\/(jpeg|png|webp)$/.test(type)) return json({ error: "Send a JPEG, PNG or WebP image." }, 415);
  const body = await request.arrayBuffer();
  if (body.byteLength < 500 || body.byteLength > 600_000) return json({ error: "That image is too small or too big." }, 413);

  const hash = await sha256(body);
  const origin = new URL(request.url).origin;
  const cacheKey = new Request(`${origin}/__cache/match/${hash}`);
  const cache = (caches as unknown as { default: Cache }).default;
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  if (env.MATCH_LIMITER) {
    const { success } = await env.MATCH_LIMITER.limit({ key: request.headers.get("cf-connecting-ip") ?? "unknown" });
    if (!success) return json({ error: "Too many searches. Wait a minute and try again." }, 429);
  }

  const key = `${hash.slice(0, 32)}${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  await env.DB.prepare("INSERT INTO tmp_images (key, type, bytes, created) VALUES (?, ?, ?, ?)").bind(key, type, body, Date.now()).run();
  const cleanup = async () => {
    await env.DB.prepare("DELETE FROM tmp_images WHERE key = ?").bind(key).run();
    await env.DB.prepare("DELETE FROM tmp_images WHERE created < ?").bind(Date.now() - 10 * 60_000).run();
  };
  try {
    const imageUrl = `${origin}/tmp/${key}`;
    const ask = async (kind: string) => {
      const u = new URL("https://serpapi.com/search.json");
      u.search = new URLSearchParams({ engine: "google_lens", url: imageUrl, type: kind, hl: "en", country: "us", api_key: env.SERPAPI_KEY! }).toString();
      const res = await fetch(u, { signal: AbortSignal.timeout(25_000) });
      if (!res.ok) throw new Error(`search ${res.status}: ${(await res.text()).slice(0, 160)}`);
      return res.json();
    };
    let products = toProducts(await ask("products"));
    if (products.length < 3) products = toProducts(await ask("visual_matches"));
    const res = json({ products }, 200, "public, max-age=86400");
    ctx.waitUntil(cache.put(cacheKey, res.clone()));
    return res;
  } catch (e) {
    console.error("match failed", e);
    return json({ error: "The search didn't work just now. Try again in a moment." }, 502);
  } finally {
    ctx.waitUntil(cleanup());
  }
}

// Product thumbnails come from other sites; the app is cross-origin isolated,
// so they're relayed through here (images only, small, cached a day).
async function thumb(request: Request) {
  const u = new URL(request.url).searchParams.get("u") ?? "";
  if (!/^https:\/\//.test(u) || u.length > 1500) return new Response("Bad request", { status: 400 });
  const res = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0 (DrapeBot; +https://drape.jashparmar.com)" }, cf: { cacheTtl: 86400, cacheEverything: true } } as RequestInit).catch(() => null);
  const type = res?.headers.get("content-type") ?? "";
  if (!res?.ok || !type.startsWith("image/")) return new Response("Not found", { status: 404 });
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > 800_000) return new Response("Too big", { status: 413 });
  return new Response(res.body, { headers: { "Content-Type": type, "Cache-Control": "public, max-age=86400", "Cross-Origin-Resource-Policy": "same-origin", "X-Content-Type-Options": "nosniff" } });
}

async function tmpImage(key: string, env: Env) {
  if (!/^[a-f0-9]{44}$/.test(key)) return new Response("Not found", { status: 404 });
  const row = await env.DB.prepare("SELECT type, bytes FROM tmp_images WHERE key = ?").bind(key).first<{ type: string; bytes: ArrayBuffer }>();
  if (!row) return new Response("Not found", { status: 404 });
  return new Response(row.bytes, { headers: { "Content-Type": row.type, "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}

export default {
  async fetch(request: Request, env: Env, ctx: Ctx): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/match") return match(request, env, ctx);
    if (pathname === "/api/thumb") return thumb(request);
    if (pathname === "/api/health") return json({ ok: true, match: Boolean(env.SERPAPI_KEY) });
    if (pathname.startsWith("/tmp/")) return tmpImage(pathname.slice(5), env);
    if (pathname.startsWith("/api/")) return json({ error: "Not found." }, 404);
    return env.ASSETS.fetch(request);
  },
};

// Local dev server for public/ (unknown paths get the app shell).
//   node scripts/static.js        (PORT=8880 by default)

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const dir = process.env.DIR ?? "public";
const root = new URL(`../${dir}/`, import.meta.url).pathname;
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webmanifest": "application/manifest+json", ".json": "application/json", ".xml": "application/xml", ".txt": "text/plain", ".bin": "application/octet-stream", ".webp": "image/webp" };
const port = Number(process.env.PORT ?? 8880);

async function resolve(path) {
  const candidates = path.endsWith("/") ? [`${path}index.html`] : extname(path) ? [path] : [`${path}.html`, `${path}/index.html`];
  for (const c of candidates) {
    try { return { body: await readFile(join(root, c)), file: c, status: 200 }; } catch { /* next */ }
  }
  if (extname(path)) return null;
  // Unknown page: the built site has a real 404 page; in development the app shell routes it.
  const fallback = dir === "public" ? "index.html" : "404.html";
  return { body: await readFile(join(root, fallback)), file: fallback, status: dir === "public" ? 200 : 404 };
}

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  const hit = await resolve(path).catch(() => null);
  if (!hit) { res.writeHead(404).end("Not found"); return; }
  // Cross-origin isolation unlocks multi-threaded WebAssembly for the on-device models.
  res.writeHead(hit.status, { "Content-Type": types[extname(hit.file)] ?? "application/octet-stream", "Cache-Control": "no-cache", "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "require-corp" });
  res.end(hit.body);
}).listen(port, "127.0.0.1", () => console.log(`Serving ${dir}/ on http://localhost:${port}`));

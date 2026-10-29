// Lookalikes from Drape's own catalogue, found on the device: each category is
// a small shard of int8 fashion embeddings (made by scripts/catalog-embed.mjs
// with the same model the app runs), so a search is a few hundred dot
// products and the photo never leaves the phone.
import { affiliate } from "./stores.js";

let index = null;
const shards = new Map();

async function loadIndex() {
  return (index ??= fetch("/catalog/index.json").then((r) => (r.ok ? r.json() : { categories: {} })).catch(() => ({ categories: {} })));
}

async function shard(category) {
  const { version, categories } = await loadIndex();
  if (!categories[category]) return null;
  if (!shards.has(category)) {
    shards.set(category, Promise.all([
      fetch(`/catalog/${category}.json?v=${version}`).then((r) => r.json()),
      fetch(`/catalog/${category}.bin?v=${version}`).then((r) => r.arrayBuffer()),
    ]).then(([meta, bin]) => ({ items: meta.items, vecs: new Int8Array(bin) })).catch((e) => { shards.delete(category); throw e; }));
  }
  return shards.get(category);
}

export const hasCategory = async (category) => Boolean((await loadIndex()).categories[category]);

// Feed products carry their own (already tracked) link; the Amazon seed has ASINs.
export const productLink = (item) => item.l ?? affiliate(`https://www.amazon.com/dp/${item.id}`);

// Closest products to an embedding (unit length) within one category.
// gender: "w" | "m" | null (unisex items always count). colour: the piece's
// main colour as Lab; the closest few dozen by style are then re-ordered so
// the same colour wins (the embedding alone weighs colour lightly).
const COLOUR_WEIGHT = 0.12, SHORTLIST = 60;
export const colourMatch = (a, b) => (a && b ? Math.max(0, 1 - Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) / 60) : 0);

export function rank(embedding, { items, vecs }, { gender = null, limit = 12, colour = null } = {}) {
  const dim = embedding.length, out = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (gender && it.g !== "u" && it.g !== gender) continue;
    let s = 0;
    const off = i * dim;
    for (let d = 0; d < dim; d++) s += embedding[d] * vecs[off + d];
    out.push({ item: it, score: s * it.s });
  }
  out.sort((a, b) => b.score - a.score);
  if (!colour) return out.slice(0, limit);
  return out.slice(0, SHORTLIST).map((r) => ({ ...r, score: r.score + COLOUR_WEIGHT * colourMatch(colour, r.item.c) })).sort((a, b) => b.score - a.score).slice(0, limit);
}

export async function lookalikes(embedding, category, opts) {
  const data = await shard(category);
  if (!data || !embedding) return [];
  return rank(embedding, data, opts).map(({ item, score }) => ({
    id: item.id, title: item.t, brand: item.b, store: item.m ?? "Amazon", price: item.p, rating: item.r, reviews: item.n, image: item.i, link: productLink(item), score,
  }));
}

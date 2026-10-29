// Step 2 of the seed catalogue: embed every candidate's product photo with
// the same Marqo-FashionSigLIP vision model the app runs, check its category
// with the zero-shot tagger, and write one shard per category:
//   public/catalog/<category>.bin   int8 vectors, row-major (n × 768)
//   public/catalog/<category>.json  the products, with each row's scale
//   public/catalog/index.json       categories and counts
// Resumable: finished rows are appended to scripts/data/embedded.* as it goes.
//   cd scripts && node catalog-embed.mjs
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { AutoProcessor, RawImage, SiglipVisionModel } from "@huggingface/transformers";
import { classify, within } from "../public/js/tagging.js";
import { CATEGORIES, slotOf } from "../public/js/taxonomy.js";

const data = (f) => new URL(`./data/${f}`, import.meta.url);
const meta = JSON.parse(readFileSync(new URL("../public/models/tags.json", import.meta.url)));
const bank = new Float32Array(readFileSync(new URL("../public/models/tags.bin", import.meta.url)).buffer.slice(0));
const DIM = meta.dim, BATCH = 8;
// Amazon serves any size from the same image id; 400px is plenty.
const sized = (u) => u.replace(/\._[^/]*_\.(jpg|png)$/i, "._AC_UL400_.$1").replace(/(\/I\/[^./]+)\.(jpg|png)$/i, "$1._AC_UL400_.$2");

const candidates = ["candidates.jsonl", "feed-candidates.jsonl"].filter((f) => existsSync(data(f))).flatMap((f) => readFileSync(data(f), "utf8").trim().split("\n").filter(Boolean)).join("\n").trim().split("\n").map((l) => JSON.parse(l));
const done = new Set(existsSync(data("embedded.jsonl")) ? readFileSync(data("embedded.jsonl"), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l).asin) : []);
const todo = candidates.filter((c) => !done.has(c.asin));
console.log(`${candidates.length} candidates, ${done.size} done, ${todo.length} to embed`);

if (todo.length) {
  const [sig, proc] = await Promise.all([SiglipVisionModel.from_pretrained("Marqo/marqo-fashionSigLIP", { dtype: "q8" }), AutoProcessor.from_pretrained("Marqo/marqo-fashionSigLIP")]);
  const slotCats = (slot) => CATEGORIES.filter((c) => c[2] === slot).map((c) => c[0]);
  const fetchImage = async (c) => {
    try {
      const res = await fetch(sized(c.image), { signal: AbortSignal.timeout(15000) });
      if (!res.ok) return null;
      return (await RawImage.fromBlob(await res.blob())).rgb();
    } catch { return null; }
  };
  const t0 = performance.now();
  let n = 0, kept = 0;
  let next = Promise.all(todo.slice(0, BATCH).map(fetchImage));
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH), images = await next;
    next = Promise.all(todo.slice(i + BATCH, i + 2 * BATCH).map(fetchImage)); // download the next batch while this one runs
    const ok = batch.map((c, k) => [c, images[k]]).filter(([, im]) => im);
    if (ok.length) {
      const { image_embeds } = await sig(await proc(ok.map(([, im]) => im)));
      const all = image_embeds.normalize().data;
      ok.forEach(([c], k) => {
        const v = all.slice(k * DIM, (k + 1) * DIM);
        const tags = classify(v, bank, meta);
        const ranked = within(tags.category, slotCats(slotOf(c.rule)));
        const agrees = ranked.top.slice(0, 3).some((t) => t.id === c.rule);
        // The listing's category, if the model agrees it's plausible; else drop it.
        const row = { ...c, image: sized(c.image), category: agrees ? c.rule : null, clothing: tags.subject.top.find((t) => t.id === "clothing")?.p ?? 0, colour: tags.pattern.id };
        appendFileSync(data("embedded.bin"), Buffer.from(new Float32Array(v).buffer));
        appendFileSync(data("embedded.jsonl"), JSON.stringify(row) + "\n");
        if (agrees) kept++;
      });
    }
    batch.filter((c, k) => !images[k]).forEach((c) => { appendFileSync(data("embedded.bin"), Buffer.alloc(DIM * 4)); appendFileSync(data("embedded.jsonl"), JSON.stringify({ ...c, category: null, failed: true }) + "\n"); });
    n += batch.length;
    const s = (performance.now() - t0) / 1000;
    process.stdout.write(`\r${n}/${todo.length}  kept ${kept}  ${(n / s).toFixed(1)}/s  eta ${Math.round((todo.length - n) / (n / s) / 60)} min   `);
  }
  console.log();
}

// Build the shards.
const rows = readFileSync(data("embedded.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const vecs = new Float32Array(readFileSync(data("embedded.bin")).buffer.slice(0));
if (vecs.length !== rows.length * DIM) throw new Error("embedded.bin and embedded.jsonl are out of step");
const dir = new URL("../public/catalog/", import.meta.url);
mkdirSync(dir, { recursive: true });
const index = { model: meta.model, dim: DIM, version: Date.now().toString(36), source: [...new Set(rows.map((r) => r.merchant ?? "Amazon"))].join(", "), categories: {} };
for (const [cat] of CATEGORIES) {
  const items = rows.map((r, i) => [r, i]).filter(([r]) => r.category === cat);
  if (!items.length) continue;
  const bin = new Int8Array(items.length * DIM), list = [];
  items.forEach(([r, i], k) => {
    const v = vecs.subarray(i * DIM, (i + 1) * DIM);
    let max = 0;
    for (const x of v) max = Math.max(max, Math.abs(x));
    const scale = max / 127;
    for (let d = 0; d < DIM; d++) bin[k * DIM + d] = Math.round(v[d] / scale);
    list.push({ id: r.asin, t: r.title, b: r.brand, p: r.price, r: r.rating, n: r.reviews, g: r.gender, i: r.image, s: +scale.toPrecision(5), ...(r.link ? { l: r.link, m: r.merchant } : {}) });
  });
  writeFileSync(new URL(`${cat}.bin`, dir), Buffer.from(bin.buffer));
  writeFileSync(new URL(`${cat}.json`, dir), JSON.stringify({ category: cat, items: list }));
  index.categories[cat] = list.length;
}
writeFileSync(new URL("index.json", dir), JSON.stringify(index, null, 1));
const total = Object.values(index.categories).reduce((a, b) => a + b, 0);
console.log(`Wrote ${total} products in ${Object.keys(index.categories).length} shards.`);
console.log(Object.entries(index.categories).map(([c, n]) => `${c}:${n}`).join("  "));

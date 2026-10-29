// Step 1 of the seed catalogue: stream Amazon's 2023 clothing metadata
// (McAuley Lab, ~18 GB, never written to disk) and keep popular, priced,
// adult fashion items, sorted into Drape's categories by their Amazon
// category path. Writes scripts/data/candidates.jsonl.
//   cd scripts && node catalog-pull.mjs [perCategory=250] [maxGB=8]
import { createWriteStream } from "node:fs";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { categorise, RULES } from "./catalog-rules.mjs";

const SRC = "https://huggingface.co/datasets/McAuley-Lab/Amazon-Reviews-2023/resolve/main/raw/meta_categories/meta_Clothing_Shoes_and_Jewelry.jsonl";
const PER = Number(process.argv[2] ?? 250), MAX_BYTES = Number(process.argv[3] ?? 8) * 1e9;


const counts = Object.fromEntries(RULES.map(([c]) => [c, 0]));
const out = createWriteStream(new URL("./data/candidates.jsonl", import.meta.url));
const res = await fetch(SRC);
const body = Readable.fromWeb(res.body);
let bytes = 0, lines = 0, kept = 0;
body.on("data", (b) => { bytes += b.length; });
const rl = createInterface({ input: body, crlfDelay: Infinity });
const full = () => Object.values(counts).every((n) => n >= PER);

for await (const line of rl) {
  lines++;
  if (lines % 50000 === 0) process.stdout.write(`\r${(bytes / 1e9).toFixed(2)} GB, ${lines} items, ${kept} kept   `);
  if (bytes > MAX_BYTES || full()) break;
  let r;
  try { r = JSON.parse(line); } catch { continue; }
  if (typeof r.price !== "number" || r.price < 3 || r.price > 500 || (r.rating_number ?? 0) < 50 || (r.average_rating ?? 0) < 3.8) continue;
  const path = (r.categories ?? []).join(" > ");
  if (!path) continue;
  const gender = /\bWomen\b/.test(path) ? "w" : /\bMen\b/.test(path) ? "m" : "u";
  const img = r.images?.find((i) => i.variant === "MAIN") ?? r.images?.[0];
  const image = img?.large ?? img?.hi_res;
  if (!image || !r.parent_asin || !r.title) continue;
  const cat = categorise(path, r.title);
  if (!cat || counts[cat] >= PER) continue;
  counts[cat]++; kept++;
  out.write(JSON.stringify({ asin: r.parent_asin, title: r.title.slice(0, 140), brand: (r.store ?? "").slice(0, 40), price: r.price, rating: r.average_rating, reviews: r.rating_number, gender, rule: cat, image }) + "\n");
}
out.end();
body.destroy();
console.log(`\n${kept} kept from ${lines} items (${(bytes / 1e9).toFixed(2)} GB read)`);
console.log(Object.entries(counts).map(([c, n]) => `${c}:${n}`).join("  "));
process.exit(0);

// Step 1 of the seed catalogue: stream Amazon's 2023 clothing metadata
// (McAuley Lab, ~18 GB, never written to disk) and keep popular, priced,
// adult fashion items, sorted into Drape's categories by their Amazon
// category path. Writes scripts/data/candidates.jsonl.
//   cd scripts && node catalog-pull.mjs [perCategory=250] [maxGB=8]
import { createWriteStream } from "node:fs";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { CATEGORIES } from "../public/js/taxonomy.js";

const SRC = "https://huggingface.co/datasets/McAuley-Lab/Amazon-Reviews-2023/resolve/main/raw/meta_categories/meta_Clothing_Shoes_and_Jewelry.jsonl";
const PER = Number(process.argv[2] ?? 250), MAX_BYTES = Number(process.argv[3] ?? 8) * 1e9;

// [category, test on "path | title"] — first match wins, so specific before general.
const RULES = [
  ["kurta", /\bkurta|kurti\b/i],
  ["denim-jacket", /Jackets & Coats.*\|.*\b(denim|jean) jacket/i],
  ["leather-jacket", /Leather & Faux Leather|Jackets & Coats.*\|.*leather jacket/i],
  ["puffer", /Down & Down Alternative|Jackets & Coats.*\|.*\b(puffer|down jacket|quilted)/i],
  ["blazer", /Suits & Sport Coats|Blazers|\|.*\bblazer\b/i],
  ["coat", /Trench, Rain|Wool & Blends|Pea Coats|Jackets & Coats.*\|.*\b(coat|trench|overcoat)\b/i],
  ["cardigan", /Cardigans|Sweaters.*\|.*cardigan/i],
  ["jacket", /Jackets & Coats|Active Jackets|Lightweight Jackets/i],
  ["hoodie", /Hoodies.*\|.*\b(hoodie|hooded)\b/i],
  ["sweatshirt", /Hoodies & Sweatshirts|Sweatshirts/i],
  ["sweater", /Sweaters/i],
  ["polo", /Polos/i],
  ["tank", /Tanks & Camis|Tank Tops|\btanks\b/i],
  ["tshirt", /T-Shirts|Tees\b/i],
  ["blouse", /Women.*Blouses/i],
  ["shirt", /Button-Down|Dress Shirts|Casual Shirts|Blouses & Button/i],
  ["jeans", /\bJeans\b/i],
  ["leggings", /Leggings/i],
  ["joggers", /\|.*\b(jogger|sweatpant)/i],
  ["chinos", /Pants.*\|.*\bchino/i],
  ["shorts", /\bShorts\b/i],
  ["skirt", /Skirts/i],
  ["trousers", /\bPants\b/i],
  ["jumpsuit", /Jumpsuits|Rompers|Overalls/i],
  ["dress", /\bDresses\b/i],
  ["boots", /\bBoots\b/i],
  ["sneakers", /Fashion Sneakers|Athletic.*\|.*sneaker|Walking|Running/i],
  ["loafers", /Loafers/i],
  ["dress-shoes", /Oxfords|Dress Shoes/i],
  ["heels", /Pumps|Heeled|\bHeels\b/i],
  ["sandals", /Sandals|Slides/i],
  ["flats", /\bFlats\b/i],
  ["backpack", /Backpacks/i],
  ["bag", /Handbags|Shoulder Bags|Crossbody|Totes|Clutches|Hobo|Satchels/i],
  ["cap", /Baseball Caps/i],
  ["hat", /Hats & Caps|Fedoras|Sun Hats|Beanies|Bucket Hats/i],
  ["scarf", /Scarves/i],
  ["belt", /\bBelts\b/i],
  ["watch", /Wrist Watches/i],
  ["sunglasses", /Sunglasses/i],
  ["jewellery", /Necklaces|Earrings|Bracelets|\bRings\b/i],
];
const SKIP = /\b(Girls|Boys|Baby|Toddler|Kids|Costumes|Uniforms|Novelty|Maternity|Lingerie|Underwear|Socks|Sleep|Shoe Care|Accessories > Wallets)\b/i;
const known = new Set(CATEGORIES.map((c) => c[0]));
for (const [c] of RULES) if (!known.has(c)) throw new Error(`unknown category ${c}`);

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
  if (!path || SKIP.test(path)) continue;
  const gender = /\bWomen\b/.test(path) ? "w" : /\bMen\b/.test(path) ? "m" : "u";
  const img = r.images?.find((i) => i.variant === "MAIN") ?? r.images?.[0];
  const image = img?.large ?? img?.hi_res;
  if (!image || !r.parent_asin || !r.title) continue;
  const hit = RULES.find(([, re]) => re.test(`${path} | ${r.title}`));
  if (!hit || counts[hit[0]] >= PER) continue;
  counts[hit[0]]++; kept++;
  out.write(JSON.stringify({ asin: r.parent_asin, title: r.title.slice(0, 140), brand: (r.store ?? "").slice(0, 40), price: r.price, rating: r.average_rating, reviews: r.rating_number, gender, rule: hit[0], image }) + "\n");
}
out.end();
body.destroy();
console.log(`\n${kept} kept from ${lines} items (${(bytes / 1e9).toFixed(2)} GB read)`);
console.log(Object.entries(counts).map(([c, n]) => `${c}:${n}`).join("  "));
process.exit(0);

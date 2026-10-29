// Add products from an affiliate product feed (Awin or Impact CSV, plain or
// .gz) to the catalogue. Links in the feed are already tracked deep links, so
// every click on these lookalikes can earn. Writes
// scripts/data/feed-candidates.jsonl; then run catalog-embed.mjs and
// catalog-colours.mjs as usual.
//   cd scripts && node catalog-feed.mjs ~/Downloads/asos-feed.csv.gz [perCategory=400]
import { createReadStream, createWriteStream } from "node:fs";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { categorise, genderOf } from "./catalog-rules.mjs";

const [file, perArg] = process.argv.slice(2);
if (!file) { console.error("Usage: node catalog-feed.mjs <feed.csv[.gz]> [perCategory]"); process.exit(1); }
const PER = Number(perArg ?? 400);

// Column names differ by network; the first one present wins.
const COLS = {
  id: ["aw_product_id", "merchant_product_id", "Unique Merchant SKU", "SKU", "id"],
  title: ["product_name", "Product Name", "title", "name"],
  link: ["aw_deep_link", "Product URL", "link", "url"],
  image: ["merchant_image_url", "aw_image_url", "large_image", "Image URL", "image_link"],
  price: ["search_price", "store_price", "Current Price", "Sale Price", "Original Price", "price"],
  currency: ["currency", "Currency", "currency_code"],
  merchant: ["merchant_name", "Advertiser Name", "Merchant", "merchant"],
  brand: ["brand_name", "Manufacturer", "Brand", "brand"],
  category: ["merchant_category", "category_name", "Category", "Product Type", "product_type", "google_product_category_name"],
  gender: ["Fashion:suitable_for", "Gender", "gender"],
  stock: ["in_stock", "Stock Availability", "availability"],
};

// One CSV record, quotes and all (records may span lines).
function* records(lines, delim) {
  let row = [], field = "", quoted = false;
  for (const line of lines) {
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') { field += '"'; i++; }
        else if (ch === '"') quoted = false;
        else field += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === delim) { row.push(field); field = ""; }
      else field += ch;
    }
    if (quoted) { field += "\n"; continue; }
    row.push(field); yield row; row = []; field = "";
  }
}

const input = createReadStream(file).pipe(file.endsWith(".gz") ? createGunzip() : new (await import("node:stream")).PassThrough());
const lines = [];
for await (const line of createInterface({ input, crlfDelay: Infinity })) lines.push(line);
// Feeds come comma, tab or pipe separated: the header says which.
const delim = [",", "\t", "|"].sort((a, b) => lines[0].split(b).length - lines[0].split(a).length)[0];
const rows = records(lines, delim);
const header = rows.next().value.map((h) => h.trim());
const at = Object.fromEntries(Object.entries(COLS).map(([k, names]) => [k, names.map((n) => header.indexOf(n)).find((i) => i >= 0) ?? -1]));
for (const k of ["title", "link", "image", "price"]) if (at[k] < 0) { console.error(`No ${k} column found. Columns: ${header.join(", ")}`); process.exit(1); }

const get = (r, k) => (at[k] >= 0 ? (r[at[k]] ?? "").trim() : "");
const counts = {}, out = createWriteStream(new URL("./data/feed-candidates.jsonl", import.meta.url), { flags: "a" });
let seen = 0, kept = 0, skipped = { currency: 0, stock: 0, category: 0 };
for (const r of rows) {
  seen++;
  const currency = get(r, "currency").toUpperCase();
  if (currency && currency !== "USD") { skipped.currency++; continue; }
  if (/^(0|false|no|out of stock|out_of_stock)$/i.test(get(r, "stock"))) { skipped.stock++; continue; }
  const title = get(r, "title"), price = Number(get(r, "price").replace(/[^0-9.]/g, ""));
  const cat = categorise(get(r, "category") || title, title);
  if (!cat) { skipped.category++; continue; }
  if (!(price > 0) || !/^https:/.test(get(r, "link")) || !/^https?:/.test(get(r, "image"))) continue;
  if ((counts[cat] ?? 0) >= PER) continue;
  counts[cat] = (counts[cat] ?? 0) + 1; kept++;
  const merchant = get(r, "merchant") || "Shop";
  out.write(JSON.stringify({
    asin: `${merchant.toLowerCase().replace(/[^a-z0-9]+/g, "-")}:${get(r, "id") || kept}`, title: title.slice(0, 140), brand: (get(r, "brand") || merchant).slice(0, 40),
    price, rating: null, reviews: null, gender: genderOf(`${get(r, "gender")} ${get(r, "category")} ${title}`), rule: cat,
    image: get(r, "image").replace(/^http:/, "https:"), link: get(r, "link"), merchant: merchant.slice(0, 40),
  }) + "\n");
}
out.end();
console.log(`${kept} of ${seen} products added (skipped: ${skipped.currency} non-USD, ${skipped.stock} out of stock, ${skipped.category} not clothing we know).`);
console.log(Object.entries(counts).map(([c, n]) => `${c}:${n}`).join("  "));

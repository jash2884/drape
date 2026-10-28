// Measures zero-shot tagging accuracy on labelled product photos
// (ashraq/fashion-product-images-small): category, colour family and usage.
//   node eval-tags.mjs [count]
import { readFileSync } from "node:fs";
import { AutoProcessor, RawImage, SiglipVisionModel } from "@huggingface/transformers";
import { classify } from "../public/js/tagging.js";

const MODEL = "Marqo/marqo-fashionSigLIP";
const meta = JSON.parse(readFileSync(new URL("../public/models/tags.json", import.meta.url)));
const bank = new Float32Array(readFileSync(new URL("../public/models/tags.bin", import.meta.url)).buffer.slice(0));
const processor = await AutoProcessor.from_pretrained(MODEL);
const model = await SiglipVisionModel.from_pretrained(MODEL, { dtype: "q8" });

// The dataset's article types mapped to ours (types we don't model are skipped).
const MAP = {
  Tshirts: ["tshirt", "polo"], Shirts: ["shirt"], Tops: ["blouse", "tank", "tshirt"], Sweaters: ["sweater", "cardigan"], Sweatshirts: ["sweatshirt", "hoodie"],
  Kurtas: ["kurta"], Jackets: ["jacket", "denim-jacket", "leather-jacket", "puffer"], Blazers: ["blazer"], Jeans: ["jeans"], Trousers: ["trousers", "chinos"],
  "Track Pants": ["joggers"], Shorts: ["shorts"], Skirts: ["skirt"], Leggings: ["leggings"], Dresses: ["dress"], Jumpsuit: ["jumpsuit"],
  "Casual Shoes": ["sneakers", "loafers"], "Sports Shoes": ["sneakers"], "Formal Shoes": ["dress-shoes", "loafers"], Heels: ["heels"], Sandals: ["sandals"], Flats: ["flats", "sandals"],
  Handbags: ["bag"], Backpacks: ["backpack"], Caps: ["cap", "hat"], Belts: ["belt"], Watches: ["watch"], Sunglasses: ["sunglasses"], Scarves: ["scarf"],
};

const want = Number(process.argv[2] ?? 150);
let tried = 0, hit = 0, top3 = 0, offset = 0;
const misses = {};
while (tried < want && offset < 4000) {
  const res = await fetch(`https://datasets-server.huggingface.co/rows?dataset=ashraq/fashion-product-images-small&config=default&split=train&offset=${offset}&length=100`);
  const { rows } = await res.json();
  offset += 137; // stride through the set for variety
  for (const { row } of rows) {
    const ok = MAP[row.articleType];
    if (!ok || tried >= want) continue;
    const image = await RawImage.read(row.image.src);
    const { image_embeds } = await model(await processor(image));
    const tags = classify(image_embeds.normalize().data, bank, meta);
    tried++;
    if (ok.includes(tags.category.id)) hit++; else (misses[`${row.articleType}→${tags.category.id}`] = (misses[`${row.articleType}→${tags.category.id}`] ?? 0) + 1);
    if (tags.category.top.slice(0, 3).some((t) => ok.includes(t.id))) top3++;
  }
}
console.log(`category top-1 ${(100 * hit / tried).toFixed(1)}%  top-3 ${(100 * top3 / tried).toFixed(1)}%  (n=${tried})`);
console.log("most common misses:", Object.entries(misses).sort((a, b) => b[1] - a[1]).slice(0, 10));

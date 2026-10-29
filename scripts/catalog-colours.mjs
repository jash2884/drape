// Step 3 of the seed catalogue: each product's main colour (Lab), so
// lookalikes can prefer the same colour. The fashion embedding knows shape and
// style well but weighs colour lightly. The studio background (near-white,
// touching the edges) is ignored; a white garment inside it still counts.
//   cd scripts && node catalog-colours.mjs
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { RawImage } from "@huggingface/transformers";
import { dominantColours, hexToRgb, rgbToLab } from "../public/js/colour.js";

const dir = new URL("../public/catalog/", import.meta.url);
const S = 96, CONCURRENCY = 16;

function foreground(img) {
  const { width: w, height: h, data } = img, px = new Uint8ClampedArray(w * h * 4);
  const light = (i) => data[i * 3] > 232 && data[i * 3 + 1] > 232 && data[i * 3 + 2] > 232;
  const bg = new Uint8Array(w * h), stack = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length) {
    const i = stack.pop();
    if (bg[i] || !light(i)) continue;
    bg[i] = 1;
    const x = i % w;
    if (x > 0) stack.push(i - 1); if (x < w - 1) stack.push(i + 1);
    if (i >= w) stack.push(i - w); if (i < w * (h - 1)) stack.push(i + w);
  }
  for (let i = 0; i < w * h; i++) { px[i * 4] = data[i * 3]; px[i * 4 + 1] = data[i * 3 + 1]; px[i * 4 + 2] = data[i * 3 + 2]; px[i * 4 + 3] = bg[i] ? 0 : 255; }
  return px;
}

async function colourOf(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    let img = (await RawImage.fromBlob(await res.blob())).rgb();
    img = await img.resize(S, Math.round(S * img.height / img.width));
    const [top] = dominantColours(foreground(img), { k: 4, sample: 3000 });
    return top ? rgbToLab(...hexToRgb(top.hex)).map((v) => Math.round(v)) : null;
  } catch { return null; }
}

for (const f of readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "index.json")) {
  const shard = JSON.parse(readFileSync(new URL(f, dir)));
  const todo = shard.items.filter((it) => !it.c);
  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    const part = todo.slice(i, i + CONCURRENCY);
    (await Promise.all(part.map((it) => colourOf(it.i)))).forEach((c, k) => { if (c) part[k].c = c; });
  }
  writeFileSync(new URL(f, dir), JSON.stringify(shard));
  console.log(`${f}: ${shard.items.filter((it) => it.c).length}/${shard.items.length} coloured`);
}
// New colours mean new shard files: bump the version so browsers fetch them.
const indexUrl = new URL("index.json", dir), index = JSON.parse(readFileSync(indexUrl));
index.version = Date.now().toString(36);
writeFileSync(indexUrl, JSON.stringify(index, null, 1));

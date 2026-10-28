// Runs the look engine on photos and writes annotated PNGs: the main person
// lightly tinted, kept pieces in colour, and a summary of every proposal.
//   node look-debug.mjs ../test/fixtures/street-04.jpg [...]
import { readFileSync } from "node:fs";
import { AutoProcessor, pipeline, RawImage, SamModel, SiglipVisionModel } from "@huggingface/transformers";
import { createEngine } from "../public/js/engine.js";
import { describe } from "../public/js/stores.js";

const meta = JSON.parse(readFileSync(new URL("../public/models/tags.json", import.meta.url)));
const bank = new Float32Array(readFileSync(new URL("../public/models/tags.bin", import.meta.url)).buffer.slice(0));
const [sam, samProc, sig, sigProc, parser] = await Promise.all([
  SamModel.from_pretrained("Xenova/slimsam-77-uniform", { dtype: "q8" }), AutoProcessor.from_pretrained("Xenova/slimsam-77-uniform"),
  SiglipVisionModel.from_pretrained("Marqo/marqo-fashionSigLIP", { dtype: "q8" }), AutoProcessor.from_pretrained("Marqo/marqo-fashionSigLIP"),
  pipeline("image-segmentation", "Xenova/segformer_b2_clothes", { dtype: "q8" }),
]);
const engine = createEngine({ RawImage, sam, samProc, sig, sigProc, parser, bank, meta });
const TINTS = [[99, 76, 255], [224, 118, 47], [31, 157, 107], [214, 51, 123], [47, 127, 214], [201, 154, 36]];

for (const path of process.argv.slice(2)) {
  let image = await RawImage.read(path);
  if (Math.max(image.width, image.height) > 1024) image = await image.resize(...(image.width > image.height ? [1024, Math.round(1024 * image.height / image.width)] : [Math.round(1024 * image.width / image.height), 1024]));
  image = image.rgb();
  const t0 = performance.now();
  await engine.setImage(path, image);
  const r = await engine.findLook();
  const ms = Math.round(performance.now() - t0);
  const { width: w, height: h } = image, px = new Uint8ClampedArray(image.data);
  for (let i = 0; i < px.length; i++) px[i] *= 0.55;
  r.pieces.forEach((p, k) => {
    const [cr, cg, cb] = TINTS[k % TINTS.length];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!p.mask[Math.floor(y * p.mh / h) * p.mw + Math.floor(x * p.mw / w)]) continue;
      const i = (y * w + x) * 3, src = image.data;
      px[i] = src[i] * 0.5 + cr * 0.5; px[i + 1] = src[i + 1] * 0.5 + cg * 0.5; px[i + 2] = src[i + 2] * 0.5 + cb * 0.5;
    }
  });
  const out = path.replace(/(\.[a-z]+)$/i, ".look.png").replace("/fixtures/", "/fixtures/out/");
  await new RawImage(px, w, h, 3).save(out);
  console.log(`${path.split("/").pop()}  ${ms} ms  ${r.person ? "person" : "no person"}:`, r.pieces.map((p) => `${describe(p.tags)}${p.region ? ` [${p.region}]` : ""}`).join(" | "));
}

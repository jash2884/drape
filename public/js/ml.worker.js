// On-device ML, off the main thread. Two models, both cached by the browser
// after the first download:
//  - SlimSAM (~14 MB): tap-to-segment. The image is encoded once per photo;
//    every tap only re-runs the small mask decoder.
//  - Marqo-FashionSigLIP vision tower (~94 MB, int8): a fashion embedding used
//    for zero-shot tags (against precomputed text embeddings), duplicates and
//    outfit matching.
import { AutoProcessor, env, RawImage, SamModel, SiglipVisionModel } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0/dist/transformers.min.js";
import { cropOnWhite, GRID, iou, lowResMask, plausible } from "./automask.js";
import { classify } from "./tagging.js";

env.allowLocalModels = false;
const SAM_ID = "Xenova/slimsam-77-uniform", SIG_ID = "Marqo/marqo-fashionSigLIP";

let sam, samProc, sig, sigProc, bank, meta, loading = null;
let current = null; // the photo being segmented: { id, image, inputs, embeds }

const files = new Map();
const progress = (x) => {
  if (x.status === "progress" && x.total) files.set(x.file + x.name, { loaded: x.loaded, total: x.total });
  if (x.status === "done" && files.has(x.file + x.name)) { const f = files.get(x.file + x.name); f.loaded = f.total; }
  let loaded = 0, total = 0;
  for (const f of files.values()) { loaded += f.loaded; total += f.total; }
  postMessage({ type: "progress", loaded, total });
};

function load() {
  return (loading ??= (async () => {
    const [m, b] = await Promise.all([
      fetch(new URL("../models/tags.json", import.meta.url)).then((r) => r.json()),
      fetch(new URL("../models/tags.bin", import.meta.url)).then((r) => r.arrayBuffer()),
    ]);
    meta = m; bank = new Float32Array(b);
    [sam, samProc, sig, sigProc] = await Promise.all([
      SamModel.from_pretrained(SAM_ID, { dtype: "q8", progress_callback: progress }),
      AutoProcessor.from_pretrained(SAM_ID, { progress_callback: progress }),
      SiglipVisionModel.from_pretrained(SIG_ID, { dtype: "q8", progress_callback: progress }),
      AutoProcessor.from_pretrained(SIG_ID, { progress_callback: progress }),
    ]);
  })());
}

async function setImage(id, blob) {
  const image = await RawImage.fromBlob(blob);
  const inputs = await samProc(image);
  const embeds = await sam.get_image_embeddings(inputs);
  current = { id, image, inputs, embeds };
}

// points: [[x, y, 1 | 0]] in image pixels (1 = garment, 0 = not garment)
async function segment(points) {
  const inputs = await samProc(current.image, { input_points: [points.map(([x, y]) => [x, y])], input_labels: [points.map((p) => p[2])] });
  const out = await sam({ ...current.embeds, input_points: inputs.input_points, input_labels: inputs.input_labels });
  const masks = await samProc.post_process_masks(out.pred_masks, current.inputs.original_sizes, current.inputs.reshaped_input_sizes);
  const scores = out.iou_scores.data;
  let best = 0;
  for (let i = 1; i < scores.length; i++) if (scores[i] > scores[best]) best = i;
  const [, n, h, w] = masks[0].dims;
  const all = masks[0].data, mask = new Uint8Array(w * h);
  mask.set(all.subarray(best * w * h, (best + 1) * w * h));
  void n;
  return { mask, width: w, height: h, score: scores[best] };
}

// Find the garment without a tap: propose masks from a grid of points, drop
// implausible ones, and keep the one the fashion model thinks is most like
// clothing. The centre is tried first and kept straight away if it's clearly
// clothing, so clean product photos stay fast.
async function clothingScore(mask, mw, mh) {
  const img = current.image;
  const rgb = cropOnWhite(img.data, img.width, img.height, img.channels, mask, 224, 0.06, mw, mh);
  const { image_embeds } = await sig(await sigProc(new RawImage(rgb, 224, 224, 3)));
  return classify(image_embeds.normalize().data, bank, meta).subject.top.find((t) => t.id === "clothing").p;
}

// A low-resolution proposal for one point: no upsampling, just the decoder.
async function propose(point) {
  const inputs = await samProc(current.image, { input_points: [[[point[0], point[1]]]], input_labels: [[point[2]]] });
  const out = await sam({ ...current.embeds, input_points: inputs.input_points, input_labels: inputs.input_labels });
  const scores = out.iou_scores.data;
  let best = 0;
  for (let i = 1; i < scores.length; i++) if (scores[i] > scores[best]) best = i;
  return lowResMask(out.pred_masks.data, best, current.inputs.reshaped_input_sizes[0]);
}

async function autoSegment() {
  const { width: w, height: h } = current.image;
  const tried = [], t = { seg: 0, score: 0, n: 0 };
  for (const [fx, fy] of GRID) {
    const point = [Math.round(fx * w), Math.round(fy * h), 1];
    let t0 = performance.now();
    const r = await propose(point);
    t.seg += performance.now() - t0; t.n++;
    if (!plausible(r.mask, r.mw, r.mh) || tried.some((c) => iou(c.mask, r.mask) > 0.85)) continue;
    t0 = performance.now();
    const cand = { ...r, point, clothing: await clothingScore(r.mask, r.mw, r.mh) };
    t.score += performance.now() - t0;
    tried.push(cand);
    if (tried.length === 1 && cand.clothing > 0.85) break;
    if (tried.length >= 4) break;
  }
  const pick = tried.sort((a, b) => b.clothing - a.clothing)[0];
  const point = pick?.point ?? [Math.round(w / 2), Math.round(h / 2), 1];
  const t0 = performance.now();
  const full = await segment([point]); // full resolution only for the winner
  t.final = performance.now() - t0;
  return { ...full, point, clothing: pick?.clothing ?? 0, timing: t, scores: tried.map((c) => +c.clothing.toFixed(2)) };
}

async function embed(blob) {
  const image = await RawImage.fromBlob(blob);
  const { image_embeds } = await sig(await sigProc(image));
  const embedding = new Float32Array(image_embeds.normalize().data);
  return { embedding, tags: classify(embedding, bank, meta) };
}

self.onmessage = async ({ data }) => {
  const { id, type } = data;
  try {
    await load();
    if (type === "init") return postMessage({ id, type: "ready" });
    if (type === "image") { const t0 = performance.now(); await setImage(data.imageId, data.blob); return postMessage({ id, type: "image", ms: Math.round(performance.now() - t0) }); }
    if (type === "segment") {
      if (current?.id !== data.imageId) throw new Error("That photo is no longer loaded.");
      const r = await segment(data.points);
      return postMessage({ id, type: "segment", ...r }, [r.mask.buffer]);
    }
    if (type === "auto") {
      if (current?.id !== data.imageId) throw new Error("That photo is no longer loaded.");
      const r = await autoSegment();
      return postMessage({ id, type: "auto", ...r }, [r.mask.buffer]);
    }
    if (type === "embed") { const r = await embed(data.blob); return postMessage({ id, type: "embed", ...r }, [r.embedding.buffer]); }
    throw new Error(`Unknown request ${type}`);
  } catch (e) {
    postMessage({ id, type: "error", error: e?.message ?? String(e) });
  }
};

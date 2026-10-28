// On-device ML, off the main thread. Three models, all cached by the browser
// after the first download (plus segformer_b2_clothes, ~28 MB, which labels
// the clothes on a person pixel by pixel):
//  - SlimSAM (~14 MB): tap-to-segment. The image is encoded once per photo;
//    every tap only re-runs the small mask decoder.
//  - Marqo-FashionSigLIP vision tower (~94 MB, int8): a fashion embedding used
//    for zero-shot tags (against precomputed text embeddings), duplicates and
//    outfit matching.
import { AutoProcessor, env, pipeline, RawImage, SamModel, SiglipVisionModel } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0/dist/transformers.min.js";
import { createEngine } from "./engine.js";

env.allowLocalModels = false;
const SAM_ID = "Xenova/slimsam-77-uniform", SIG_ID = "Marqo/marqo-fashionSigLIP", PARSER_ID = "Xenova/segformer_b2_clothes";

let engine = null, loading = null;

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
    const [meta, bin] = await Promise.all([
      fetch(new URL("../models/tags.json", import.meta.url)).then((r) => r.json()),
      fetch(new URL("../models/tags.bin", import.meta.url)).then((r) => r.arrayBuffer()),
    ]);
    const [sam, samProc, sig, sigProc, parser] = await Promise.all([
      SamModel.from_pretrained(SAM_ID, { dtype: "q8", progress_callback: progress }),
      AutoProcessor.from_pretrained(SAM_ID, { progress_callback: progress }),
      SiglipVisionModel.from_pretrained(SIG_ID, { dtype: "q8", progress_callback: progress }),
      AutoProcessor.from_pretrained(SIG_ID, { progress_callback: progress }),
      pipeline("image-segmentation", PARSER_ID, { dtype: "q8", progress_callback: progress }),
    ]);
    engine = createEngine({ RawImage, sam, samProc, sig, sigProc, parser, bank: new Float32Array(bin), meta });
  })());
}

const loaded = (imageId) => { if (engine.currentId !== imageId) throw new Error("That photo is no longer loaded."); };

self.onmessage = async ({ data }) => {
  const { id, type } = data;
  try {
    await load();
    if (type === "init") return postMessage({ id, type: "ready" });
    if (type === "image") { await engine.setImage(data.imageId, await RawImage.fromBlob(data.blob)); return postMessage({ id, type: "image" }); }
    if (type === "look") { loaded(data.imageId); return postMessage({ id, type: "look", ...(await engine.findLook()) }); }
    if (type === "piece") { loaded(data.imageId); return postMessage({ id, type: "piece", piece: await engine.pieceAt(data.point) }); }
    if (type === "embed") { const r = await engine.embedImage(await RawImage.fromBlob(data.blob)); return postMessage({ id, type: "embed", ...r }, [r.embedding.buffer]); }
    throw new Error(`Unknown request ${type}`);
  } catch (e) {
    postMessage({ id, type: "error", error: e?.message ?? String(e) });
  }
};

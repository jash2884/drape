// The look engine: given the models, find every garment in a photo.
// Runs in the browser worker and in Node (scripts/look-debug.mjs), so the
// detection can be tuned at full speed on real photos.
//
// Photos of people: a clothing parser (segformer_b2_clothes) labels hat,
// top, pants, shoes, bag… for every pixel; we keep the main person's garments
// and let the fashion model name each one, restricted to what the region can
// be (an "upper-clothes" region is a top or a layer, never jeans).
// Photos without a person (flat lays, product shots, a jumper on a chair):
// SAM proposes masks from a grid and the fashion model keeps what looks most
// like clothing.
import { cropOnWhite, cropRGBA, fracBox, GRID, inside, iou, lowResMask, plausiblePiece } from "./automask.js";
import { dominantColours } from "./colour.js";
import { mainPersonGarments } from "./parsing.js";
import { classify, within } from "./tagging.js";
import { slotOf } from "./taxonomy.js";

export function createEngine({ RawImage, sam, samProc, sig, sigProc, parser, bank, meta }) {
  let current = null; // { id, image, inputs, embeds }

  async function setImage(id, image) {
    const inputs = await samProc(image);
    const embeds = await sam.get_image_embeddings(inputs);
    current = { id, image, inputs, embeds };
  }

  // SAM's masks for one point, low resolution (no upsampling).
  async function masksAt(point, label = 1) {
    const inputs = await samProc(current.image, { input_points: [[[point[0], point[1]]]], input_labels: [[label]] });
    const out = await sam({ ...current.embeds, input_points: inputs.input_points, input_labels: inputs.input_labels });
    return [...out.iou_scores.data].map((score, k) => ({ ...lowResMask(out.pred_masks.data, k, current.inputs.reshaped_input_sizes[0]), score }));
  }
  const best = (masks) => masks.reduce((a, b) => (b.score > a.score ? b : a));

  async function describeMask(m, allowed = null) {
    const img = current.image;
    const rgb = cropOnWhite(img.data, img.width, img.height, img.channels, m.mask, 224, 0.06, m.mw, m.mh);
    const { image_embeds } = await sig(await sigProc(new RawImage(rgb, 224, 224, 3)));
    const embedding = new Float32Array(image_embeds.normalize().data);
    const tags = classify(embedding, bank, meta);
    if (allowed) tags.category = within(tags.category, allowed);
    return { ...m, embedding, tags, clothing: tags.subject.top.find((t) => t.id === "clothing").p, isClothing: tags.subject.id === "clothing", slot: slotOf(tags.category.id) };
  }

  function toPiece(p) {
    const img = current.image;
    const rgba = cropRGBA(img.data, img.width, img.height, img.channels, p.mask, 224, 0.06, p.mw, p.mh);
    return {
      box: fracBox(p.mask, p.mw, p.mh), mask: p.mask, mw: p.mw, mh: p.mh, embedding: p.embedding, clothing: p.clothing, region: p.label ?? null,
      tags: { category: p.tags.category.id, slot: p.slot, pattern: p.tags.pattern.id, style: p.tags.style.id, warmth: p.tags.warmth.id, colours: dominantColours(rgba) },
      predicted: Object.fromEntries(["category", "pattern", "style", "warmth"].map((g) => [g, { id: p.tags[g].id, top: p.tags[g].top.slice(0, 3) }])),
      crop: rgba,
    };
  }

  async function onPerson() {
    if (!parser) return null;
    const segments = await parser(current.image);
    const { person, garments } = mainPersonGarments(segments.map((s) => ({ label: s.label, mask: s.mask })));
    if (!person || !garments.length) return null;
    const pieces = [];
    for (const g of garments) pieces.push(toPiece(await describeMask(g, g.allowed)));
    return pieces;
  }

  // No person: the most clothing-like proposal, plus any other clearly
  // separate garment (a flat lay of a few items).
  async function withoutPerson() {
    const { width: w, height: h } = current.image;
    const cands = [];
    for (const [fx, fy] of GRID) {
      const m = best(await masksAt([Math.round(fx * w), Math.round(fy * h)]));
      if (!plausiblePiece(m.mask, m.mw, m.mh, 0.92) || cands.some((c) => iou(c.mask, m.mask) > 0.85)) continue;
      cands.push(await describeMask(m));
      if (cands.length === 1 && cands[0].isClothing && cands[0].clothing > 0.9) break; // a clean product shot
      if (cands.length >= 6) break;
    }
    const ranked = cands.filter((c) => c.isClothing).sort((a, b) => b.clothing - a.clothing);
    const kept = [];
    for (const c of ranked) {
      if (kept.length && c.clothing < 0.85) break;
      if (kept.some((k) => iou(k.mask, c.mask) > 0.3 || inside(c.mask, k.mask) > 0.3 || inside(k.mask, c.mask) > 0.3)) continue;
      kept.push(c);
    }
    return kept.map(toPiece);
  }

  async function findLook() {
    const person = await onPerson();
    const pieces = person ?? (await withoutPerson());
    return { pieces: pieces.sort((a, b) => a.box.y - b.box.y), person: !!person };
  }

  // One piece from a tap (for anything findLook missed).
  async function pieceAt(point) {
    return toPiece(await describeMask(best(await masksAt(point))));
  }

  async function embedImage(image) {
    const { image_embeds } = await sig(await sigProc(image));
    const embedding = new Float32Array(image_embeds.normalize().data);
    return { embedding, tags: classify(embedding, bank, meta) };
  }

  return { setImage, findLook, pieceAt, embedImage, get currentId() { return current?.id; } };
}

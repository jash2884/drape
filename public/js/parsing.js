// Human parsing (segformer_b2_clothes labels) → the garments of the main person.
import { CATEGORIES } from "./taxonomy.js";

export const GARMENT_LABELS = {
  "Hat": ["cap", "hat"],
  "Sunglasses": ["sunglasses"],
  "Upper-clothes": CATEGORIES.filter((c) => c[2] === "top" || c[2] === "outer").map((c) => c[0]),
  "Skirt": ["skirt", "shorts"],
  "Pants": ["jeans", "trousers", "chinos", "joggers", "leggings", "shorts"],
  "Dress": ["dress", "jumpsuit"],
  "Belt": ["belt"],
  "Shoes": CATEGORIES.filter((c) => c[2] === "shoes").map((c) => c[0]),
  "Bag": ["bag", "backpack"],
  "Scarf": ["scarf"],
};
const BODY = new Set(["Hair", "Face", "Left-leg", "Right-leg", "Left-arm", "Right-arm"]);

// segments: [{ label, mask: { data, width, height } }] at full resolution.
// Returns low-resolution masks (long side `size`) for the main person.
export function mainPersonGarments(segments, size = 256) {
  if (!segments.length) return { person: false, garments: [] };
  const { width: W, height: H } = segments[0].mask;
  const k = size / Math.max(W, H), mw = Math.max(1, Math.round(W * k)), mh = Math.max(1, Math.round(H * k));
  const small = (m) => {
    const out = new Uint8Array(mw * mh);
    for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) out[y * mw + x] = m.data[Math.min(H - 1, Math.floor((y + 0.5) / k)) * W + Math.min(W - 1, Math.floor((x + 0.5) / k))] > 127 ? 1 : 0;
    return out;
  };
  const masks = segments.filter((s) => s.label !== "Background").map((s) => ({ label: s.label, mask: small(s.mask) }));
  // Everything that isn't background, split into connected figures.
  const fg = new Uint8Array(mw * mh);
  for (const m of masks) for (let i = 0; i < fg.length; i++) if (m.mask[i]) fg[i] = 1;
  const comp = new Int32Array(mw * mh).fill(-1), sizes = [], boxes = [];
  for (let s = 0; s < fg.length; s++) {
    if (!fg[s] || comp[s] >= 0) continue;
    const id = sizes.length, stack = [s];
    let n = 0, x0 = mw, x1 = 0, y0 = mh, y1 = 0;
    comp[s] = id;
    while (stack.length) {
      const i = stack.pop(), x = i % mw, y = (i - x) / mw;
      n++; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      for (const j of [x > 0 ? i - 1 : -1, x < mw - 1 ? i + 1 : -1, y > 0 ? i - mw : -1, y < mh - 1 ? i + mw : -1]) if (j >= 0 && fg[j] && comp[j] < 0) { comp[j] = id; stack.push(j); }
    }
    sizes.push(n); boxes.push({ x0, x1, y0, y1 });
  }
  // The main figure: big and near the middle.
  let main = -1, bestScore = 0;
  sizes.forEach((n, id) => {
    const cx = (boxes[id].x0 + boxes[id].x1) / 2 / mw;
    const score = n * (1 - Math.min(0.9, Math.abs(cx - 0.5) * 1.6));
    if (score > bestScore) { bestScore = score; main = id; }
  });
  const on = (m) => { const out = new Uint8Array(mw * mh); let n = 0; for (let i = 0; i < out.length; i++) if (m[i] && comp[i] === main) { out[i] = 1; n++; } return { out, n }; };
  const bodyPixels = masks.filter((m) => BODY.has(m.label)).reduce((s, m) => s + on(m.mask).n, 0);
  const person = bodyPixels > 0.002 * mw * mh;
  const garments = [];
  const shoes = new Uint8Array(mw * mh);
  for (const m of masks) {
    const label = m.label === "Left-shoe" || m.label === "Right-shoe" ? "Shoes" : m.label;
    if (!GARMENT_LABELS[label]) continue;
    const { out, n } = on(m.mask);
    if (n < 0.003 * mw * mh) continue;
    if (label === "Shoes") { for (let i = 0; i < out.length; i++) if (out[i]) shoes[i] = 1; continue; }
    garments.push({ label, mask: out, mw, mh, allowed: GARMENT_LABELS[label] });
  }
  if (shoes.some((v) => v)) garments.push({ label: "Shoes", mask: shoes, mw, mh, allowed: GARMENT_LABELS.Shoes });
  return { person, garments };
}

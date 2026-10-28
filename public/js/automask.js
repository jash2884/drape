// Picking the garment automatically: SAM proposes a mask for each point on a
// grid, these helpers throw out implausible masks, and the fashion model
// scores what's left ("does this cut-out look like clothing?").

export const GRID = [0.5, 0.3, 0.7].flatMap((y) => [0.5, 0.3, 0.7].map((x) => [x, y])); // centre first

export function coverage(mask) {
  let n = 0;
  for (let i = 0; i < mask.length; i++) n += mask[i] ? 1 : 0;
  return n / mask.length;
}

// How many image edges the mask runs along (more than `share` of the edge).
// Floors, walls and grass hug the frame; a garment usually doesn't hug three sides.
export function edgesTouched(mask, w, h, share = 0.3) {
  let top = 0, bottom = 0, left = 0, right = 0;
  for (let x = 0; x < w; x++) { top += mask[x] ? 1 : 0; bottom += mask[(h - 1) * w + x] ? 1 : 0; }
  for (let y = 0; y < h; y++) { left += mask[y * w] ? 1 : 0; right += mask[y * w + w - 1] ? 1 : 0; }
  return [top / w, bottom / w, left / h, right / h].filter((v) => v > share).length;
}

export function iou(a, b) {
  let inter = 0, union = 0;
  for (let i = 0; i < a.length; i++) { const x = a[i] ? 1 : 0, y = b[i] ? 1 : 0; inter += x & y; union += x | y; }
  return union ? inter / union : 0;
}

export function plausible(mask, w, h) {
  const c = coverage(mask);
  return c > 0.015 && c < 0.8 && edgesTouched(mask, w, h) < 3;
}

// A square, padded crop of the masked pixels on white, nearest-neighbour
// resampled to size×size RGB: what the fashion model expects to see.
// The mask may be lower resolution than the image (mw×mh covering the same frame).
export function cropOnWhite(data, w, h, channels, mask, size = 224, pad = 0.06, mw = w, mh = h) {
  let x0 = mw, y0 = mh, x1 = -1, y1 = -1;
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) if (mask[y * mw + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const out = new Uint8ClampedArray(size * size * 3).fill(255);
  if (x1 < 0) return out;
  const kx = w / mw, ky = h / mh;
  const side = Math.max((x1 - x0 + 1) * kx, (y1 - y0 + 1) * ky) * (1 + 2 * pad);
  const cx = (x0 + x1 + 1) / 2 * kx, cy = (y0 + y1 + 1) / 2 * ky; // pixel edges, not indices
  for (let oy = 0; oy < size; oy++) for (let ox = 0; ox < size; ox++) {
    const sx = Math.floor(cx - side / 2 + (ox + 0.5) * side / size), sy = Math.floor(cy - side / 2 + (oy + 0.5) * side / size);
    if (sx < 0 || sy < 0 || sx >= w || sy >= h || !mask[Math.floor(sy / ky) * mw + Math.floor(sx / kx)]) continue;
    const si = (sy * w + sx) * channels, oi = (oy * size + ox) * 3;
    out[oi] = data[si]; out[oi + 1] = data[si + 1]; out[oi + 2] = data[si + 2];
  }
  return out;
}

// SAM's raw 256×256 mask logits cover the padded square the image was resized
// into; keep the part that is the image, thresholded. Much cheaper than
// upsampling to full resolution, and plenty for judging a candidate.
export function lowResMask(logits, best, reshaped, grid = 256, padded = 1024) {
  const mw = Math.max(1, Math.round(reshaped[1] * grid / padded)), mh = Math.max(1, Math.round(reshaped[0] * grid / padded));
  const out = new Uint8Array(mw * mh), off = best * grid * grid;
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) out[y * mw + x] = logits[off + y * grid + x] > 0 ? 1 : 0;
  return { mask: out, mw, mh };
}

// Keep the garment, drop specks: keep the largest connected region plus any
// region at least `keep` of its size (e.g. a pair of shoes), then fill holes
// that don't touch the border (a logo the model skipped).
export function cleanMask(mask, w, h, keep = 0.15) {
  const label = new Int32Array(w * h).fill(-1), sizes = [];
  const stack = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || label[start] !== -1) continue;
    const id = sizes.length;
    let n = 0;
    stack.push(start); label[start] = id;
    while (stack.length) {
      const i = stack.pop(); n++;
      const x = i % w, y = (i - x) / w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
        if (j >= 0 && mask[j] && label[j] === -1) { label[j] = id; stack.push(j); }
      }
    }
    sizes.push(n);
  }
  if (!sizes.length) return new Uint8Array(mask.length);
  const big = Math.max(...sizes);
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) if (label[i] >= 0 && sizes[label[i]] >= big * keep) out[i] = 1;
  // Fill holes: flood the background from the border; anything unreached is inside.
  const outside = new Uint8Array(mask.length);
  for (let x = 0; x < w; x++) for (const y of [0, h - 1]) { const i = y * w + x; if (!out[i] && !outside[i]) { outside[i] = 1; stack.push(i); } }
  for (let y = 0; y < h; y++) for (const x of [0, w - 1]) { const i = y * w + x; if (!out[i] && !outside[i]) { outside[i] = 1; stack.push(i); } }
  while (stack.length) {
    const i = stack.pop(), x = i % w, y = (i - x) / w;
    for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
      if (j >= 0 && !out[j] && !outside[j]) { outside[j] = 1; stack.push(j); }
    }
  }
  for (let i = 0; i < out.length; i++) if (!outside[i]) out[i] = 1;
  return out;
}

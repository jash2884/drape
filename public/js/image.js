import { cleanMask } from "./automask.js";

// Canvas helpers: load and downscale photos, turn a SAM mask into a cut-out,
// and make the white-background version the fashion model expects.

export async function loadPhoto(file, max = 1024) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale);
  const canvas = new OffscreenCanvas(w, h);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  return { canvas, width: w, height: h, blob: await canvas.convertToBlob({ type: "image/jpeg", quality: 0.92 }) };
}

// Bounding box of the mask's "on" pixels.
export function maskBox(mask, w, h) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

// Share of the frame the mask covers (used to sanity-check a segmentation).
export const maskCoverage = (mask) => { let n = 0; for (let i = 0; i < mask.length; i++) n += mask[i] ? 1 : 0; return n / mask.length; };

// A square, padded cut-out with transparency, plus the same on white.
export async function cutout(photo, rawMask, { size = 512, pad = 0.06 } = {}) {
  const { canvas, width: w, height: h } = photo;
  const mask = rawMask ? cleanMask(rawMask, w, h) : null;
  const box = mask ? maskBox(mask, w, h) : { x: 0, y: 0, w, h };
  if (!box) throw new Error("Nothing is selected yet. Tap the garment.");
  const src = canvas.getContext("2d").getImageData(0, 0, w, h);
  if (mask) for (let i = 0; i < mask.length; i++) if (!mask[i]) src.data[i * 4 + 3] = 0;
  const layer = new OffscreenCanvas(w, h);
  layer.getContext("2d").putImageData(src, 0, 0);
  const side = Math.max(box.w, box.h) * (1 + 2 * pad);
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  const out = new OffscreenCanvas(size, size), ctx = out.getContext("2d");
  ctx.drawImage(layer, cx - side / 2, cy - side / 2, side, side, 0, 0, size, size);
  const white = new OffscreenCanvas(size, size), wctx = white.getContext("2d");
  wctx.fillStyle = "#ffffff"; wctx.fillRect(0, 0, size, size); wctx.drawImage(out, 0, 0);
  const thumb = new OffscreenCanvas(256, 256);
  thumb.getContext("2d").drawImage(out, 0, 0, 256, 256);
  return {
    png: await out.convertToBlob({ type: "image/png" }),
    thumb: await thumb.convertToBlob({ type: "image/webp", quality: 0.85 }),
    onWhite: await white.convertToBlob({ type: "image/jpeg", quality: 0.92 }),
    pixels: out.getContext("2d").getImageData(0, 0, size, size).data,
  };
}

// One piece cut out of the full photo on white, for visual product search:
// the low-res mask is scaled up (smoothly) and used as an alpha mask.
export async function pieceImage(photoBlob, piece, size = 512, pad = 0.08) {
  const bmp = await createImageBitmap(photoBlob);
  const W = bmp.width, H = bmp.height;
  const m = new OffscreenCanvas(piece.mw, piece.mh), mctx = m.getContext("2d"), img = mctx.createImageData(piece.mw, piece.mh);
  for (let i = 0; i < piece.mask.length; i++) img.data[i * 4 + 3] = piece.mask[i] ? 255 : 0;
  mctx.putImageData(img, 0, 0);
  const layer = new OffscreenCanvas(W, H), lctx = layer.getContext("2d");
  lctx.drawImage(bmp, 0, 0);
  lctx.globalCompositeOperation = "destination-in";
  lctx.imageSmoothingEnabled = true;
  lctx.drawImage(m, 0, 0, W, H);
  const b = piece.box, side = Math.max(b.w * W, b.h * H) * (1 + 2 * pad);
  const cx = (b.x + b.w / 2) * W, cy = (b.y + b.h / 2) * H;
  const out = new OffscreenCanvas(size, size), ctx = out.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, size, size);
  ctx.drawImage(layer, cx - side / 2, cy - side / 2, side, side, 0, 0, size, size);
  bmp.close?.();
  return out.convertToBlob({ type: "image/jpeg", quality: 0.9 });
}

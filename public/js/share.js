// A shareable card for a look (1080×1350, the 4:5 size Instagram and TikTok
// show in full): the photo with numbered pieces, and each piece with the best
// price Drape found. Made on a canvas on the device; nothing is uploaded.
import { lookalikes } from "./catalog.js";
import { hexToRgb, rgbToLab } from "./colour.js";
import { describe } from "./stores.js";

const W = 1080, H = 1350, PAD = 56;
const INK = "#17151a", MUTED = "#6b6560", BG = "#f6f3ee", ACCENT = "#634cff";
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const loadImage = (src) => new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = src; });

function rounded(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

// The lowest price for a piece: exact matches in dollars, or its lookalikes.
async function bestPrice(p) {
  const exact = (p.matches ?? []).filter((m) => m.priceValue >= 5 && m.price?.startsWith("$")).map((m) => m.priceValue); // under $5 is a listing glitch, not a price
  const main = p.tags.colours?.[0]?.hex;
  const similar = await lookalikes(p.embedding, p.tags.category, { limit: 6, colour: main ? rgbToLab(...hexToRgb(main)) : null }).catch(() => []);
  const all = [...exact, ...similar.map((s) => s.price)].filter((v) => v > 0);
  return all.length ? Math.min(...all) : null;
}

export async function lookCard(look, tints) {
  await Promise.all(["400 52px 'Instrument Serif'", "700 30px Inter", "600 26px Inter"].map((f) => document.fonts.load(f).catch(() => {})));
  const canvas = new OffscreenCanvas(W, H), ctx = canvas.getContext("2d");
  ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);

  // Header.
  ctx.fillStyle = INK; ctx.font = "400 64px 'Instrument Serif', Georgia, serif"; ctx.textBaseline = "alphabetic";
  ctx.fillText("Drape", PAD, 104);
  ctx.fillStyle = MUTED; ctx.font = "600 26px Inter, sans-serif"; ctx.textAlign = "right";
  ctx.fillText("the look, for less", W - PAD, 100);
  ctx.textAlign = "left";

  // The photo, cropped to fill its frame, with a numbered badge on each piece.
  const fx = PAD, fy = 140, fw = 540, fh = 1060;
  const url = URL.createObjectURL(look.photo);
  try {
    const img = await loadImage(url);
    const scale = Math.max(fw / img.width, fh / img.height), dw = img.width * scale, dh = img.height * scale;
    const ox = fx + (fw - dw) / 2, oy = fy + (fh - dh) / 2;
    ctx.save(); rounded(ctx, fx, fy, fw, fh, 28); ctx.clip();
    ctx.drawImage(img, ox, oy, dw, dh);
    look.pieces.slice(0, 6).forEach((p, i) => {
      const x = Math.min(Math.max(ox + p.box.x * dw + 26, fx + 26), fx + fw - 26), y = Math.min(Math.max(oy + p.box.y * dh + 26, fy + 26), fy + fh - 26);
      badge(ctx, x, y, 22, tints[i % tints.length], i + 1);
    });
    ctx.restore();
  } finally { URL.revokeObjectURL(url); }

  // The pieces.
  const pieces = look.pieces.slice(0, 6), prices = await Promise.all(pieces.map(bestPrice));
  // Fewer pieces get bigger rows, centred beside the photo.
  const cx = fx + fw + 36, cw = W - PAD - cx, rowH = Math.min(260, fh / Math.max(pieces.length, 1)), t = Math.min(rowH - 32, 170);
  const top = fy + (fh - rowH * pieces.length) / 2;
  for (const [i, p] of pieces.entries()) {
    const y = top + i * rowH;
    ctx.fillStyle = "#fff"; rounded(ctx, cx, y, t, t, 20); ctx.fill();
    const crop = URL.createObjectURL(p.crop);
    try {
      const im = await loadImage(crop);
      const s = Math.min((t - 16) / im.width, (t - 16) / im.height);
      ctx.drawImage(im, cx + (t - im.width * s) / 2, y + (t - im.height * s) / 2, im.width * s, im.height * s);
    } catch { /* a missing crop leaves the tile blank */ } finally { URL.revokeObjectURL(crop); }
    badge(ctx, cx + 4, y + 4, 18, tints[i % tints.length], i + 1);
    const tx = cx + t + 22, tw = cw - t - 22;
    ctx.fillStyle = INK; ctx.font = "700 30px Inter, sans-serif";
    wrap(ctx, cap(describe(p.tags)), tx, y + 40, tw, 36, 3);
    ctx.fillStyle = prices[i] ? ACCENT : MUTED; ctx.font = "700 28px Inter, sans-serif";
    ctx.fillText(prices[i] ? `from $${prices[i] < 100 ? prices[i].toFixed(2) : Math.round(prices[i])}` : "Find it on Drape", tx, y + t - 10);
  }

  // Footer.
  ctx.fillStyle = INK; ctx.font = "700 30px Inter, sans-serif";
  ctx.fillText("Shop every piece at drape.jashparmar.com", PAD, H - 66);
  return canvas.convertToBlob({ type: "image/png" });
}

function badge(ctx, x, y, r, tint, n) {
  ctx.beginPath(); ctx.arc(x + r, y + r, r, 0, Math.PI * 2); ctx.fillStyle = tint; ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = "#fff"; ctx.stroke();
  ctx.fillStyle = "#fff"; ctx.font = `700 ${r * 1.1}px Inter, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(String(n), x + r, y + r + 1);
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
}

function wrap(ctx, text, x, y, width, lineH, maxLines) {
  const words = text.split(" ");
  let line = "", n = 0;
  for (let i = 0; i < words.length; i++) {
    const next = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(next).width > width && line) {
      if (++n === maxLines) { ctx.fillText(`${line}…`, x, y); return; }
      ctx.fillText(line, x, y); y += lineH; line = words[i];
    } else line = next;
  }
  ctx.fillText(line, x, y);
}

// Share the card where the platform allows it (phones), else download it.
export async function shareLook(look, tints) {
  const blob = await lookCard(look, tints);
  const file = new File([blob], "drape-look.png", { type: "image/png" });
  const text = "Found every piece of this look on Drape: drape.jashparmar.com";
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], text }); return "shared"; } catch (e) { if (e.name === "AbortError") return "cancelled"; }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = "drape-look.png";
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return "downloaded";
}

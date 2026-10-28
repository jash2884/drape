// A look: the photo with every piece outlined and numbered, and for each piece
// a description you can fix in a tap and links to shop it.
import { deleteLook, getLook, putLook } from "../db.js";
import * as ml from "../ml.js";
import { describe, shopLinks } from "../stores.js";
import { labelOf, slotOf } from "../taxonomy.js";
import { h, plural, toast, urlBag } from "../ui.js";
import { storePieces } from "./find.js";

const TINTS = ["#634cff", "#e0762f", "#1f9d6b", "#d6337b", "#2f7fd6", "#c99a24"];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export async function render(root, id) {
  const urls = urlBag();
  const look = await getLook(id);
  if (!look) { location.hash = "#/"; return; }
  let selected = 0, adding = false;
  const photo = h("img", { src: urls.url(look.photo), alt: "Your photo", class: "look-photo" });
  const over = h("canvas", { class: "look-over", width: look.width, height: look.height, "aria-hidden": "true" });
  const list = h("div", { class: "pieces" });
  const hint = h("p", { class: "small muted" }, "Missed something? Tap it on the photo.");

  function drawOverlay() {
    const ctx = over.getContext("2d");
    ctx.clearRect(0, 0, over.width, over.height);
    look.pieces.forEach((p, i) => {
      const tint = TINTS[i % TINTS.length], sel = i === selected;
      // Tint the piece's pixels (masks are low resolution: scale them up).
      const m = new OffscreenCanvas(p.mw, p.mh), mctx = m.getContext("2d"), img = mctx.createImageData(p.mw, p.mh);
      const [r, g, b] = [1, 3, 5].map((k) => parseInt(tint.slice(k, k + 2), 16));
      for (let k = 0; k < p.mask.length; k++) if (p.mask[k]) { img.data[k * 4] = r; img.data[k * 4 + 1] = g; img.data[k * 4 + 2] = b; img.data[k * 4 + 3] = sel ? 120 : 60; }
      mctx.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(m, 0, 0, over.width, over.height);
      // Number badge at the top-left of the piece.
      const x = p.box.x * over.width, y = p.box.y * over.height, rad = Math.max(13, over.width / 34);
      ctx.beginPath(); ctx.arc(x + rad, y + rad, rad, 0, Math.PI * 2); ctx.fillStyle = tint; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = "#fff"; ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.font = `700 ${rad * 1.1}px Inter, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(String(i + 1), x + rad, y + rad + 1);
    });
  }

  const save = () => putLook(look).catch((e) => toast(e.message, "error"));

  function pieceCard(p, i) {
    const query = describe(p.tags);
    const guesses = [...new Set([p.tags.category, ...(p.predicted?.category?.top ?? []).map((t) => t.id)])].slice(0, 3);
    return h("article", { class: `piece${i === selected ? " sel" : ""}`, style: `--tint:${TINTS[i % TINTS.length]}`, onclick: () => { if (selected !== i) { selected = i; drawOverlay(); drawList(); } } },
      h("div", { class: "piece-img" }, h("span", { class: "badge" }, i + 1), h("img", { src: urls.url(p.crop), alt: "" })),
      h("div", { class: "piece-body" },
        h("div", { class: "piece-head" },
          h("h3", null, cap(query)),
          h("button", { type: "button", class: "icon-x", "aria-label": "Remove this piece", onclick: (e) => { e.stopPropagation(); look.pieces.splice(i, 1); selected = 0; save(); drawOverlay(); drawList(); } }, "×")),
        h("div", { class: "chip-row" },
          guesses.map((c) => h("button", { type: "button", class: `chip small${p.tags.category === c ? " on" : ""}`, onclick: (e) => { e.stopPropagation(); p.tags.category = c; p.tags.slot = slotOf(c); save(); drawList(); } }, labelOf("category", c))),
          p.tags.colours.slice(0, 3).map((c) => h("span", { class: "chip small colour" }, h("i", { style: `--c:${c.hex}` }), c.label))),
        h("div", { class: "shop" }, h("span", { class: "small muted" }, "Shop it:"),
          shopLinks(p.tags).map((s) => h("a", { class: "shop-link", href: s.href, target: "_blank", rel: "noopener sponsored", onclick: (e) => e.stopPropagation() }, s.name)))));
  }

  function drawList() {
    list.replaceChildren(...(look.pieces.length ? look.pieces.map(pieceCard) : [h("p", { class: "muted" }, "No pieces found. Tap a garment on the photo to add it.")]));
  }

  // Tap the photo to add a piece the AI missed.
  over.addEventListener("click", async (e) => {
    if (adding) return;
    adding = true;
    hint.textContent = "Adding that piece…";
    const r = over.getBoundingClientRect();
    const point = [Math.round((e.clientX - r.left) * (over.width / r.width)), Math.round((e.clientY - r.top) * (over.height / r.height))];
    try {
      await ml.ready();
      await ml.setImage(look.id, look.photo);
      const { piece } = await ml.pieceAt(look.id, point);
      const [stored] = await storePieces([piece]);
      look.pieces.push(stored);
      look.pieces.sort((a, b) => a.box.y - b.box.y);
      selected = look.pieces.indexOf(stored);
      await save();
      drawOverlay(); drawList();
      hint.textContent = piece.clothing < 0.5 ? "Added, but that may not be clothing. Remove it with × if not." : "Added. Tap anything else that's missing.";
    } catch (err) { hint.textContent = `Couldn't add that: ${err.message}`; }
    adding = false;
  });

  drawOverlay(); drawList();
  root.replaceChildren(
    h("a", { class: "back", href: "#/" }, "← New search"),
    h("div", { class: "look" },
      h("div", { class: "look-left" }, h("div", { class: "look-frame" }, photo, over), hint),
      h("div", null,
        h("header", { class: "page-head" }, h("h1", null, "The look"), h("p", { class: "muted" }, plural(look.pieces.length, "piece"))),
        list,
        h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost danger", onclick: async () => { if (confirm("Delete this look?")) { await deleteLook(look.id); location.hash = "#/"; } } }, "Delete look")),
        h("p", { class: "small muted disclosure" }, "Some shop links may earn Drape a commission. It never changes what we show you."))));
  return urls.free;
}

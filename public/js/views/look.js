// A look: the photo with every piece outlined and numbered, and for each piece
// a description you can fix in a tap and links to shop it.
import { lookalikes } from "../catalog.js";
import { hexToRgb, rgbToLab } from "../colour.js";
import { deleteLook, getLook, putLook } from "../db.js";
import { pieceImage } from "../image.js";
import { shareLook } from "../share.js";
import * as ml from "../ml.js";
import { affiliate, describe, shopLinks } from "../stores.js";
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
        matches(p),
        similar(p),
        h("div", { class: "shop" }, h("span", { class: "small muted" }, "Search stores:"),
          shopLinks(p.tags).map((s) => h("a", { class: "shop-link", href: s.href, target: "_blank", rel: "noopener sponsored", onclick: (e) => e.stopPropagation() }, s.name)))));
  }

  // Exact or closest matches for one piece, found on demand and kept with the look.
  function matches(p) {
    const box = h("div", { class: "matches" });
    const proxied = (u) => (u ? `/api/thumb?u=${encodeURIComponent(u)}` : null);
    const show = () => {
      if (p.matchError) return box.replaceChildren(h("p", { class: "small error" }, p.matchError), findBtn("Try again"));
      if (!p.matches) return box.replaceChildren(findBtn("Find this exact item"));
      if (!p.matches.length) return box.replaceChildren(h("p", { class: "small muted" }, "No shops found for this one. Try the store searches below."));
      box.replaceChildren(h("p", { class: "small muted" }, "Exact or closest matches"), h("div", { class: "match-row" }, p.matches.map((m) => h("a", { class: "match", href: affiliate(m.link), target: "_blank", rel: "noopener nofollow sponsored", onclick: (e) => e.stopPropagation() },
        h("div", { class: "match-img" }, m.image ? h("img", { src: proxied(m.image), alt: "", loading: "lazy", referrerpolicy: "no-referrer" }) : null, m.exact ? h("span", { class: "exact" }, "Exact") : null),
        h("b", null, m.price ?? "See price"),
        h("span", { class: "match-title" }, m.title),
        h("span", { class: "small muted" }, m.store)))));
    };
    const findBtn = (label) => h("button", { type: "button", class: "btn primary small", onclick: async (e) => {
      e.stopPropagation();
      box.replaceChildren(h("p", { class: "small muted" }, "Searching the web for this exact piece…"));
      try {
        const res = await fetch("/api/match", { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: await pieceImage(look.photo, p) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "The search didn't work.");
        p.matches = data.products; p.matchError = null;
      } catch (err) { p.matchError = err.message; }
      save(); drawList(); // the lookalikes below compare against the prices just found
    } }, label);
    show();
    return box;
  }

  // Cheaper lookalikes from Drape's own catalogue, ranked on the device.
  function similar(p) {
    const box = h("div", { class: "matches similar" });
    const gender = (() => { try { return localStorage.getItem("drape.gender") || null; } catch { return null; } })();
    const setGender = (g) => (e) => { e.stopPropagation(); try { g ? localStorage.setItem("drape.gender", g) : localStorage.removeItem("drape.gender"); } catch {} drawList(); };
    // What the exact item costs, when the web search found it in dollars.
    const usd = (p.matches ?? []).filter((m) => m.priceValue && (m.currency === "$" || m.price?.startsWith("$"))).map((m) => m.priceValue).sort((a, b) => a - b);
    const ref = usd.length ? usd[Math.floor(usd.length / 2)] : null;
    const main = p.tags.colours?.[0]?.hex;
    lookalikes(p.embedding, p.tags.category, { gender, limit: 12, colour: main ? rgbToLab(...hexToRgb(main)) : null }).then((list) => {
      if (!list.length) return box.remove();
      box.replaceChildren(
        h("div", { class: "similar-head" }, h("p", { class: "small muted" }, ref ? `Similar for less (the exact piece is around $${Math.round(ref)})` : "Similar for less"),
          h("div", { class: "seg", role: "group", "aria-label": "Show" }, [[null, "All"], ["w", "Women"], ["m", "Men"]].map(([g, label]) => h("button", { type: "button", class: `chip small${gender === g ? " on" : ""}`, "aria-pressed": String(gender === g), onclick: setGender(g) }, label)))),
        h("div", { class: "match-row" }, list.map((m) => {
          const save = ref && m.price < ref * 0.8 ? Math.round((1 - m.price / ref) * 100) : 0;
          return h("a", { class: "match", href: m.link, target: "_blank", rel: "noopener nofollow sponsored", onclick: (e) => e.stopPropagation() },
            h("div", { class: "match-img" }, h("img", { src: `/api/thumb?u=${encodeURIComponent(m.image)}`, alt: "", loading: "lazy" }), save ? h("span", { class: "exact save" }, `Save ${save}%`) : null),
            h("b", null, `$${m.price.toFixed(2)}`),
            h("span", { class: "match-title" }, m.title),
            h("span", { class: "small muted" }, [m.store, m.rating ? `★ ${m.rating}` : null].filter(Boolean).join(" · ")));
        })),
        h("p", { class: "small muted" }, "Prices may have changed since we last checked."));
    }).catch(() => box.remove());
    return box;
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
        h("header", { class: "page-head" }, h("h1", null, "The look"), h("p", { class: "muted" }, plural(look.pieces.length, "piece")),
          h("button", { type: "button", class: "btn primary small", onclick: async (e) => {
            const b = e.currentTarget; b.disabled = true; b.textContent = "Making your card…";
            try { const how = await shareLook(look, TINTS); if (how === "downloaded") toast("Card saved. Post it anywhere.", "good"); }
            catch (err) { toast(`Couldn't make the card: ${err.message}`, "error"); }
            b.disabled = false; b.textContent = "Share this look";
          } }, "Share this look")),
        list,
        h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost danger", onclick: async () => { if (confirm("Delete this look?")) { await deleteLook(look.id); location.hash = "#/"; } } }, "Delete look")),
        h("p", { class: "small muted disclosure" }, "Some shop links may earn Drape a commission. It never changes what we show you."))));
  return urls.free;
}

// Home: drop, paste, pick or snap an outfit photo; Drape finds every piece.
import { allLooks, newId, persist, putLook } from "../db.js";
import { loadPhoto } from "../image.js";
import * as ml from "../ml.js";
import { h, plural, toast, urlBag } from "../ui.js";

export async function rgbaToBlob(rgba, size = 224) {
  const c = new OffscreenCanvas(size, size);
  c.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(rgba), size, size), 0, 0);
  return c.convertToBlob({ type: "image/png" });
}

// Turn the worker's pieces into what we store (images as blobs, no raw arrays).
export async function storePieces(pieces) {
  return Promise.all(pieces.map(async (p) => ({ id: newId(), box: p.box, mask: p.mask, mw: p.mw, mh: p.mh, embedding: p.embedding, tags: p.tags, predicted: p.predicted, crop: await rgbaToBlob(p.crop) })));
}

export async function render(root) {
  const urls = urlBag();
  let alive = true, busy = false;
  ml.ready().catch(() => {});
  const pick = h("input", { type: "file", accept: "image/*", hidden: true, onchange: (e) => run(e.target.files[0]) });
  const snap = h("input", { type: "file", accept: "image/*", capture: "environment", hidden: true, onchange: (e) => run(e.target.files[0]) });
  const stage = h("div");
  const recent = h("section", { class: "recent" });

  const onPaste = (e) => { const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith("image/")); if (f) { e.preventDefault(); run(f); } };
  addEventListener("paste", onPaste);

  function idle() {
    stage.replaceChildren(h("section", { class: "hero-find" },
      h("p", { class: "eyebrow" }, "Shazam for outfits"),
      h("h1", null, "See it. Find it. For less."),
      h("p", { class: "lede muted" }, "Screenshot any outfit from Instagram, TikTok or Pinterest. Drape finds every piece and where to buy it, plus cheaper lookalikes."),
      h("div", { class: "drop", tabindex: 0, role: "button", "aria-label": "Choose a photo",
        onclick: () => pick.click(), onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick.click(); } },
        ondragover: (e) => { e.preventDefault(); e.currentTarget.classList.add("over"); }, ondragleave: (e) => e.currentTarget.classList.remove("over"),
        ondrop: (e) => { e.preventDefault(); e.currentTarget.classList.remove("over"); run([...e.dataTransfer.files].find((f) => f.type.startsWith("image/"))); } },
        h("b", null, "Drop a screenshot"), h("span", { class: "muted" }, "or paste it, or tap to choose")),
      h("div", { class: "row center" }, h("button", { type: "button", class: "btn ghost", onclick: () => snap.click() }, "Use the camera")),
      h("p", { class: "small muted" }, "No sign-up. The AI runs on your device; your photos aren't uploaded.")));
  }

  async function drawRecent() {
    const looks = await allLooks();
    if (!alive || !looks.length) { recent.replaceChildren(); return; }
    recent.replaceChildren(h("h2", null, "Recent looks"), h("div", { class: "grid" }, looks.slice(0, 12).map((l) => h("a", { class: "card", href: `#/look/${l.id}` },
      h("div", { class: "thumb photo-thumb" }, h("img", { src: urls.url(l.photo), alt: "", loading: "lazy" })),
      h("div", { class: "card-text" }, h("b", null, plural(l.pieces.length, "piece")), h("span", null, new Date(l.created).toLocaleDateString()))))));
  }

  async function run(file) {
    if (!file || busy) return;
    busy = true;
    const bar = h("progress", { max: 1, value: 0 }), step = h("p", { class: "step" }, "Waking up the AI…");
    stage.replaceChildren(h("section", { class: "working" }, h("div", { class: "spinner", "aria-hidden": "true" }), step, bar));
    const off = ml.onProgress(({ loaded, total }) => { if (total) { bar.value = loaded / total; step.textContent = `Downloading the on-device AI (once): ${(loaded / 1e6).toFixed(0)} of ${(total / 1e6).toFixed(0)} MB`; } });
    try {
      await ml.ready();
      off(); bar.removeAttribute("value");
      step.textContent = "Reading the photo…";
      const photo = await loadPhoto(file);
      const id = newId();
      await ml.setImage(id, photo.blob);
      step.textContent = "Finding every piece…";
      const { pieces } = await ml.findLook(id);
      persist();
      await putLook({ id, created: Date.now(), photo: photo.blob, width: photo.width, height: photo.height, pieces: await storePieces(pieces) });
      location.hash = `#/look/${id}`;
    } catch (e) {
      off();
      toast(`Couldn't read that photo: ${e.message}`, "error");
      idle();
    }
    busy = false;
  }

  idle();
  root.replaceChildren(pick, snap, stage, recent);
  drawRecent();
  return () => { alive = false; removeEventListener("paste", onPaste); urls.free(); };
}

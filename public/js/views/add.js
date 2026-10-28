// Adding items: pick photos, let the AI find the garment (tap to fix it),
// review the tags, save. The models download once, the first time.
import { dominantColours } from "../colour.js";
import { allItems, newId, persist, putItem } from "../db.js";
import { cutout, loadPhoto, maskCoverage } from "../image.js";
import * as ml from "../ml.js";
import { cosine } from "../tagging.js";
import { slotOf } from "../taxonomy.js";
import { h, plural, toast, urlBag } from "../ui.js";
import { defaultName, tagEditor } from "./tags.js";

const DUPLICATE = 0.9; // cosine similarity above which two items look like the same piece

export async function render(root) {
  const urls = urlBag();
  let alive = true, queue = [], index = 0, saved = 0;
  const modelReady = ml.ready();
  modelReady.catch(() => {});

  const pickCamera = h("input", { type: "file", accept: "image/*", capture: "environment", hidden: true, onchange: (e) => start([...e.target.files]) });
  const pickGallery = h("input", { type: "file", accept: "image/*", multiple: true, hidden: true, onchange: (e) => start([...e.target.files]) });
  const body = h("div");
  root.replaceChildren(h("a", { class: "back", href: "#/" }, "← Closet"), pickCamera, pickGallery, body);

  function choose() {
    body.replaceChildren(h("section", { class: "picker", ondragover: (e) => e.preventDefault(), ondrop: (e) => { e.preventDefault(); start([...e.dataTransfer.files].filter((f) => f.type.startsWith("image/"))); } },
      h("h1", null, "Add clothes"),
      h("p", { class: "muted" }, "One item per photo works best: laid flat, on a hanger or worn. Drape finds the garment and cuts it out."),
      h("div", { class: "pick-row" },
        h("button", { type: "button", class: "btn primary big", onclick: () => pickCamera.click() }, "Take a photo"),
        h("button", { type: "button", class: "btn ghost big", onclick: () => pickGallery.click() }, "Choose photos")),
      h("ul", { class: "tips" }, h("li", null, "Good light, plain background if you can."), h("li", null, "Pick several photos at once to add them in a row."), h("li", null, "Screenshots of things you own (from order emails, shops) work too."))));
  }

  async function waitForModels() {
    const bar = h("progress", { max: 1, value: 0 }), label = h("span", null, "Preparing…");
    const panel = h("section", { class: "loading-ai" }, h("h2", null, "Downloading the on-device AI"), h("p", { class: "muted" }, "About 110 MB, once. After this it works offline and your photos never leave your phone."), bar, label);
    let shown = false;
    const timer = setTimeout(() => { shown = true; body.replaceChildren(panel); }, 250);
    const off = ml.onProgress(({ loaded, total }) => { if (total) { bar.value = loaded / total; label.textContent = `${(loaded / 1e6).toFixed(0)} of ${(total / 1e6).toFixed(0)} MB`; } });
    try { await modelReady; } finally { clearTimeout(timer); off(); }
    return shown;
  }

  async function start(files) {
    if (!files.length) return;
    queue = files; index = 0;
    try { await waitForModels(); } catch (e) { body.replaceChildren(h("p", { class: "error" }, `The AI couldn't load: ${e.message}. Check your connection and try again.`)); return; }
    persist();
    next();
  }

  function next() {
    if (!alive) return;
    if (index >= queue.length) { toast(`Added ${plural(saved, "item")}`, "good"); location.hash = "#/"; return; }
    edit(queue[index]);
  }

  // Step 1: find the garment.
  async function edit(file) {
    const photo = await loadPhoto(file);
    const imageId = newId();
    const view = h("canvas", { class: "photo", width: photo.width, height: photo.height });
    const over = h("canvas", { class: "overlay", width: photo.width, height: photo.height });
    view.getContext("2d").drawImage(photo.canvas, 0, 0);
    const status = h("p", { class: "status", "aria-live": "polite" }, "Finding the garment…");
    let points = [], mask = null, mode = 1, busy = false;
    const modeBtn = (m, text) => h("button", { type: "button", class: `chip${mode === m ? " on" : ""}`, "aria-pressed": String(mode === m), onclick: () => { mode = m; toolbar(); } }, text);
    const tools = h("div", { class: "chip-row" });
    const toolbar = () => tools.replaceChildren(modeBtn(1, "Tap to keep"), modeBtn(0, "Tap to remove"),
      h("button", { type: "button", class: "chip", disabled: points.length < 2, onclick: () => { points.pop(); run(); } }, "Undo"),
      h("button", { type: "button", class: "chip", onclick: () => { mask = null; points = []; drawOverlay(); status.textContent = "Using the whole photo (good for product photos on a plain background)."; } }, "Whole photo"));

    function drawOverlay() {
      const ctx = over.getContext("2d");
      ctx.clearRect(0, 0, over.width, over.height);
      if (mask) {
        const img = ctx.createImageData(over.width, over.height);
        for (let i = 0; i < mask.length; i++) {
          const o = i * 4;
          if (mask[i]) { img.data[o] = 99; img.data[o + 1] = 76; img.data[o + 2] = 255; img.data[o + 3] = 95; }
          else img.data[o + 3] = 120;
        }
        ctx.putImageData(img, 0, 0);
      }
      for (const [x, y, keep] of points) {
        ctx.beginPath(); ctx.arc(x, y, Math.max(6, over.width / 90), 0, Math.PI * 2);
        ctx.fillStyle = keep ? "#22c55e" : "#ef4444"; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = "#fff"; ctx.stroke();
      }
    }

    async function run() {
      if (busy || !points.length) return;
      busy = true;
      try {
        const r = await ml.segment(imageId, points);
        mask = r.mask;
        const cover = maskCoverage(mask);
        status.textContent = cover < 0.01 ? "That's a very small area. Tap the middle of the garment." : cover > 0.97 ? "That covers almost everything. Tap the background with 'Tap to remove'." : "Looks right? Tap to keep or remove areas, then continue.";
      } catch (e) { status.textContent = `Couldn't segment: ${e.message}`; }
      busy = false;
      drawOverlay(); toolbar();
    }

    over.addEventListener("click", (e) => {
      const r = over.getBoundingClientRect();
      if (points.length === 1 && points[0].auto) points = []; // your first tap replaces the automatic pick
      points.push([Math.round((e.clientX - r.left) * (over.width / r.width)), Math.round((e.clientY - r.top) * (over.height / r.height)), mode]);
      run();
    });

    toolbar();
    body.replaceChildren(h("section", { class: "editor" },
      h("p", { class: "eyebrow" }, `Photo ${index + 1} of ${queue.length}`),
      h("div", { class: "canvas-wrap" }, view, over), status, tools,
      h("div", { class: "row" },
        h("button", { type: "button", class: "btn primary", onclick: () => review(photo, mask) }, "Continue"),
        h("button", { type: "button", class: "btn ghost", onclick: () => { index++; next(); } }, "Skip photo"))));
    try {
      await ml.setImage(imageId, photo.blob);
      busy = true;
      const r = await ml.autoSegment(imageId);
      busy = false;
      mask = r.mask;
      points = [Object.assign([...r.point], { auto: true })];
      status.textContent = r.clothing > 0.5 ? "Found it. Tap to keep or remove areas if needed, then continue." : "Not sure what to cut out. Tap the garment.";
      drawOverlay(); toolbar();
    } catch (e) { status.textContent = `Couldn't read this photo: ${e.message}`; }
  }

  // Step 2: check the tags and save.
  async function review(photo, mask) {
    body.replaceChildren(h("p", { class: "status" }, "Cutting out and tagging…"));
    let cut, embedding, predicted;
    try {
      cut = await cutout(photo, mask);
      ({ embedding, tags: predicted } = await ml.embed(cut.onWhite));
    } catch (e) { toast(e.message, "error"); return edit(queue[index]); }
    const tags = {
      name: "", category: predicted.category.id, slot: slotOf(predicted.category.id),
      pattern: predicted.pattern.id, style: predicted.style.id, warmth: predicted.warmth.id,
      colours: dominantColours(cut.pixels),
    };
    const existing = await allItems();
    const dupes = existing.map((it) => ({ it, s: cosine(embedding, it.embedding) })).filter((x) => x.s > DUPLICATE).sort((a, b) => b.s - a.s).slice(0, 2);
    const save = async () => {
      await putItem({ id: newId(), created: Date.now(), image: cut.png, thumb: cut.thumb, embedding, tags,
        predicted: Object.fromEntries(Object.entries(predicted).map(([g, v]) => [g, { id: v.id, top: v.top.slice(0, 3) }])),
        colourGuess: tags.colours.map((c) => c.id) });
      saved++; index++; next();
    };
    body.replaceChildren(h("section", { class: "review" },
      h("p", { class: "eyebrow" }, `Photo ${index + 1} of ${queue.length}`),
      h("div", { class: "review-grid" },
        h("div", { class: "item-img" }, h("img", { src: urls.url(cut.png), alt: "Cut-out preview" })),
        h("div", null,
          h("h1", null, "Check the details"),
          dupes.length ? h("div", { class: "notice warn" }, h("b", null, "Looks like something you own: "),
            dupes.map(({ it }) => h("a", { href: `#/item/${it.id}`, class: "dupe" }, h("img", { src: urls.url(it.thumb), alt: "" }), it.tags.name || defaultName(it.tags)))) : null,
          tagEditor(tags, predicted),
          h("div", { class: "row" },
            h("button", { type: "button", class: "btn primary", onclick: save }, index + 1 < queue.length ? "Save and next" : "Save"),
            h("button", { type: "button", class: "btn ghost", onclick: () => edit(queue[index]) }, "Redo cut-out"))))));
  }

  choose();
  return () => { alive = false; urls.free(); };
}

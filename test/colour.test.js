import assert from "node:assert/strict";
import { test } from "node:test";
import { dominantColours, nameColour, PALETTE, rgbToLab } from "../public/js/colour.js";
import { CATEGORIES, promptIndex, slotOf, SLOTS, TAG_GROUPS } from "../public/js/taxonomy.js";
import { classify } from "../public/js/tagging.js";

const pixelsOf = (parts) => {
  // parts: [[r,g,b,count,alpha=255]]
  const out = [];
  for (const [r, g, b, n, a = 255] of parts) for (let i = 0; i < n; i++) out.push(r, g, b, a);
  return new Uint8ClampedArray(out);
};

test("Lab conversion matches reference values", () => {
  const [L, a, b] = rgbToLab(255, 255, 255);
  assert.ok(Math.abs(L - 100) < 0.1 && Math.abs(a) < 0.5 && Math.abs(b) < 0.5);
  const red = rgbToLab(255, 0, 0); // ≈ (53.24, 80.09, 67.20)
  assert.ok(Math.abs(red[0] - 53.24) < 0.2 && Math.abs(red[1] - 80.09) < 0.3);
});

test("colours are named sensibly", () => {
  assert.equal(nameColour(20, 30, 70).id, "navy");
  assert.equal(nameColour(250, 250, 248).id, "white");
  assert.equal(nameColour(15, 15, 15).id, "black");
  assert.equal(nameColour(200, 40, 45).id, "red");
  for (const [id, , hex] of PALETTE) assert.equal(nameColour(...[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))).id, id);
});

test("dominant colours: shares, transparency ignored, small clusters dropped", () => {
  const px = pixelsOf([[20, 30, 70, 700], [250, 250, 248, 250], [200, 40, 45, 50], [0, 255, 0, 900, 0]]);
  const cols = dominantColours(px);
  assert.equal(cols[0].id, "navy");
  assert.equal(cols[1].id, "white");
  assert.ok(Math.abs(cols[0].share - 0.7) < 0.03);
  assert.ok(!cols.some((c) => c.id === "green"), "transparent pixels must not count");
  assert.deepEqual(dominantColours(pixelsOf([[1, 2, 3, 10, 0]])), []);
});

test("taxonomy is consistent and every prompt is unique", () => {
  for (const [id, , slot] of CATEGORIES) { assert.ok(SLOTS[slot], id); assert.equal(slotOf(id), slot); }
  const prompts = promptIndex();
  assert.equal(new Set(prompts.map((p) => `${p.group}:${p.id}`)).size, prompts.length);
  assert.equal(new Set(prompts.map((p) => p.prompt)).size, prompts.length);
  assert.deepEqual(Object.keys(TAG_GROUPS), ["category", "pattern", "style", "warmth", "subject"]);
});

test("classify picks the closest option in each group and normalises", () => {
  const meta = { dim: 2, prompts: [{ group: "g", id: "a" }, { group: "g", id: "b" }, { group: "h", id: "x" }] };
  const bank = new Float32Array([1, 0, 0, 1, 0.6, 0.8]);
  const out = classify(new Float32Array([0.9, 0.1]), bank, meta);
  assert.equal(out.g.id, "a");
  assert.ok(Math.abs(out.g.top.reduce((s, t) => s + t.p, 0) - 1) < 1e-9);
  assert.equal(out.h.confidence, 1);
});

import { cropOnWhite, edgesTouched, GRID, iou, plausible } from "../public/js/automask.js";
test("auto-mask helpers: plausibility, edges, IoU and the white crop", () => {
  const w = 10, h = 10, box = new Uint8Array(100), floor = new Uint8Array(100);
  for (let y = 3; y < 7; y++) for (let x = 3; x < 7; x++) box[y * w + x] = 1;
  for (let y = 5; y < 10; y++) for (let x = 0; x < 10; x++) floor[y * w + x] = 1;
  assert.ok(plausible(box, w, h));
  assert.equal(edgesTouched(floor, w, h), 3); // bottom, left and right
  assert.ok(!plausible(floor, w, h));
  assert.equal(iou(box, box), 1);
  assert.equal(GRID.length, 9); assert.deepEqual(GRID[0], [0.5, 0.5]);
  const rgb = new Uint8ClampedArray(100 * 3).fill(10);
  const out = cropOnWhite(rgb, w, h, 3, box, 8, 0);
  assert.equal(out[0], 10); // the crop is filled by the masked square
  const outside = cropOnWhite(rgb, w, h, 3, box, 8, 0.5);
  assert.equal(outside[0], 255); // padding is white
});

import { cleanMask } from "../public/js/automask.js";
test("cleanMask drops specks, keeps big parts and fills holes", () => {
  const w = 12, h = 12, m = new Uint8Array(w * h);
  for (let y = 2; y < 9; y++) for (let x = 2; x < 9; x++) m[y * w + x] = 1; // the garment (7x7)
  m[5 * w + 5] = 0; // a hole (logo)
  m[0 * w + 11] = 1; // a speck
  for (let y = 9; y < 12; y++) for (let x = 9; x < 12; x++) m[y * w + x] = 1; // a second part (3x3 = 9 >= 15% of 48)
  const c = cleanMask(m, w, h);
  assert.equal(c[0 * w + 11], 0, "speck removed");
  assert.equal(c[5 * w + 5], 1, "hole filled");
  assert.equal(c[10 * w + 10], 1, "second part kept");
});

import { choosePieces, cropRGBA, fracBox, inside } from "../public/js/automask.js";
test("choosePieces keeps one per region, drops non-clothing and nested duplicates", () => {
  const n = 100, m = (from, to) => { const a = new Uint8Array(n); for (let i = from; i < to; i++) a[i] = 1; return a; };
  const jacket = { mask: m(0, 40), clothing: 0.95, slot: "outer" };
  const jacket2 = { mask: m(5, 40), clothing: 0.9, slot: "outer" }; // same jacket, slightly smaller
  const shirt = { mask: m(15, 30), clothing: 0.8, slot: "top" }; // inside the jacket but a different slot... still nested
  const jeans = { mask: m(50, 80), clothing: 0.92, slot: "bottom" };
  const wall = { mask: m(80, 100), clothing: 0.3, slot: "top" };
  const out = choosePieces([wall, jacket2, shirt, jeans, jacket]);
  assert.deepEqual(out.map((p) => p.slot), ["outer", "bottom"]);
  assert.equal(inside(m(15, 30), m(0, 40)), 1);
  const rgba = cropRGBA(new Uint8ClampedArray(100 * 3).fill(40), 10, 10, 3, m(0, 50), 8, 0);
  assert.equal(rgba[(4 * 8 + 4) * 4 + 3], 255); // the centre is on the garment → opaque
  assert.equal(rgba[3], 0); // the corner is padding → transparent
  assert.deepEqual(fracBox(m(0, 50), 10, 10), { x: 0, y: 0, w: 1, h: 0.5 });
});

import { describe, shopLinks } from "../public/js/stores.js";
test("shop queries read naturally and are URL-safe", () => {
  assert.equal(describe({ category: "sweater", pattern: "textured", style: "casual", colours: [{ label: "Charcoal" }] }), "charcoal textured sweater");
  assert.equal(describe({ category: "dress-shoes", pattern: "solid", style: "formal", colours: [{ label: "Black" }] }), "black formal dress shoes");
  assert.equal(describe({ category: "shirt", pattern: "checked", style: "casual", colours: [] }), "checked shirt");
  const links = shopLinks({ category: "jeans", pattern: "solid", colours: [{ label: "Light blue" }] });
  assert.match(links[0].href, /k=light%20blue%20jeans/);
  assert.equal(links.length, 5);
});

import { mergePairs } from "../public/js/automask.js";
test("mergePairs joins a left and right shoe but not a shoe and a bag", () => {
  const w = 10, m = (cells) => { const a = new Uint8Array(100); for (const [x, y] of cells) a[y * w + x] = 1; return a; };
  const left = { slot: "shoes", mask: m([[2, 8], [3, 8]]), mw: 10, mh: 10 };
  const right = { slot: "shoes", mask: m([[5, 8], [6, 8]]), mw: 10, mh: 10 };
  const bag = { slot: "accessory", mask: m([[8, 5]]), mw: 10, mh: 10 };
  const out = mergePairs([left, right, bag]);
  assert.equal(out.length, 2);
  assert.equal(out[0].mask[8 * w + 6], 1);
});

import { mainPersonGarments } from "../public/js/parsing.js";
import { within } from "../public/js/tagging.js";
test("parsing keeps the main person's garments and merges shoes", () => {
  const W = 20, H = 20, mk = (cells) => { const d = new Uint8Array(W * H); for (const [x0, x1, y0, y1] of cells) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) d[y * W + x] = 255; return { data: d, width: W, height: H }; };
  const segs = [
    { label: "Background", mask: mk([[0, 20, 0, 20]]) },
    { label: "Face", mask: mk([[8, 12, 1, 4]]) },
    { label: "Upper-clothes", mask: mk([[7, 13, 4, 10], [0, 2, 4, 10]]) }, // the main person's top + someone at the edge
    { label: "Pants", mask: mk([[8, 12, 10, 17]]) },
    { label: "Left-shoe", mask: mk([[8, 10, 17, 19]]) },
    { label: "Right-shoe", mask: mk([[10, 12, 17, 19]]) },
  ];
  const r = mainPersonGarments(segs, 20);
  assert.ok(r.person);
  assert.deepEqual(r.garments.map((g) => g.label), ["Upper-clothes", "Pants", "Shoes"]);
  const top = r.garments[0].mask;
  assert.equal(top[5 * 20 + 1], 0, "the edge figure's top is dropped");
  assert.equal(top[5 * 20 + 9], 1);
  const g = { all: [{ id: "scarf", p: 0.6 }, { id: "jeans", p: 0.3 }, { id: "trousers", p: 0.1 }] };
  assert.equal(within(g, ["jeans", "trousers"]).id, "jeans");
  assert.ok(Math.abs(within(g, ["jeans", "trousers"]).confidence - 0.75) < 1e-9);
});

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

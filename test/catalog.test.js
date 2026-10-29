import assert from "node:assert/strict";
import { test } from "node:test";
import { colourMatch, rank } from "../public/js/catalog.js";

test("lookalikes rank by similarity, use each row's scale, and filter by gender", () => {
  const q = new Float32Array([1, 0, 0]);
  const items = [{ id: "a", g: "w", s: 1 / 127 }, { id: "b", g: "m", s: 1 / 127 }, { id: "c", g: "u", s: 1 / 127 }];
  const vecs = new Int8Array([60, 100, 0, 127, 0, 0, 90, 0, 80]);
  assert.deepEqual(rank(q, { items, vecs }).map((r) => r.item.id), ["b", "c", "a"]);
  assert.ok(Math.abs(rank(q, { items, vecs })[0].score - 1) < 1e-9);
  assert.deepEqual(rank(q, { items, vecs }, { gender: "w" }).map((r) => r.item.id), ["c", "a"]);
  assert.equal(rank(q, { items, vecs }, { limit: 1 }).length, 1);
});

test("a close style match in the piece's colour beats a slightly closer one in another colour", () => {
  const q = new Float32Array([1, 0]);
  const items = [{ id: "white", g: "u", s: 1 / 127, c: [95, 0, 0] }, { id: "black", g: "u", s: 1 / 127, c: [12, 0, 1] }];
  const vecs = new Int8Array([127, 0, 120, 40]);
  assert.deepEqual(rank(q, { items, vecs }).map((r) => r.item.id), ["white", "black"]);
  assert.deepEqual(rank(q, { items, vecs }, { colour: [10, 0, 0] }).map((r) => r.item.id), ["black", "white"]);
  assert.equal(colourMatch(null, [1, 2, 3]), 0);
  assert.equal(colourMatch([50, 0, 0], [50, 0, 0]), 1);
});

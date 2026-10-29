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

test("affiliate links: Amazon gets the tag, approved Awin shops get a deep link, others stay as they are", async () => {
  const { AFFILIATE, affiliate } = await import("../public/js/stores.js");
  const { productLink } = await import("../public/js/catalog.js");
  assert.equal(affiliate("https://www.amazon.com/dp/B01"), "https://www.amazon.com/dp/B01");
  AFFILIATE.amazon = "drape-20"; AFFILIATE.awin.publisher = "999"; AFFILIATE.awin.merchants["asos.com"] = "123";
  try {
    assert.equal(affiliate("https://www.amazon.com/dp/B01?th=1"), "https://www.amazon.com/dp/B01?th=1&tag=drape-20");
    assert.equal(productLink({ id: "B02" }), "https://www.amazon.com/dp/B02?tag=drape-20");
    assert.equal(productLink({ id: "x", l: "https://www.awin1.com/pclick.php?p=1" }), "https://www.awin1.com/pclick.php?p=1");
    assert.equal(affiliate("https://www.asos.com/p/1"), `https://www.awin1.com/cread.php?awinmid=123&awinaffid=999&ued=${encodeURIComponent("https://www.asos.com/p/1")}`);
    assert.equal(affiliate("https://www.zara.com/p/1"), "https://www.zara.com/p/1");
  } finally { AFFILIATE.amazon = ""; AFFILIATE.awin.publisher = ""; delete AFFILIATE.awin.merchants["asos.com"]; }
});

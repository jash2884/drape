import assert from "node:assert/strict";
import { test } from "node:test";
import { toProducts } from "../src/match.ts";

test("visual-search results become shoppable products, priced first, social sites dropped", () => {
  const data = {
    visual_matches: [
      { title: "Pin", link: "https://www.pinterest.com/pin/123", source: "Pinterest" },
      { title: "Wool blazer", link: "https://www.zara.com/blazer-1?x=1", source: "Zara", thumbnail: "https://t/1.jpg" },
      { title: "Black blazer", link: "https://www.asos.com/p/2", source: "ASOS", price: { value: "$58.00", extracted_value: 58, currency: "$" }, in_stock: true },
      { title: "dupe", link: "https://www.zara.com/blazer-1?y=2", source: "Zara" },
      { title: "bad", link: "javascript:alert(1)" },
    ],
    exact_matches: [{ title: "Exact one", link: "https://shop.example/item", source: "Example", price: { value: "$120", extracted_value: 120 } }],
  };
  const p = toProducts(data);
  assert.deepEqual(p.map((x) => x.store), ["Example", "ASOS", "Zara"]);
  assert.equal(p[0].exact, true);
  assert.equal(p[1].priceValue, 58);
  assert.deepEqual(toProducts(null), []);
});

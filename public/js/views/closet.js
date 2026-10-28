import { allItems } from "../db.js";
import { labelOf, SLOTS } from "../taxonomy.js";
import { h, plural, urlBag } from "../ui.js";
import { defaultName } from "./tags.js";

export async function render(root) {
  const urls = urlBag();
  const items = await allItems();
  let filter = sessionStorage.getItem("closet-filter") ?? "all";
  const grid = h("div", { class: "grid" }), bar = h("div", { class: "filters", role: "tablist" });

  function draw() {
    const counts = Object.fromEntries(Object.keys(SLOTS).map((s) => [s, items.filter((i) => i.tags.slot === s).length]));
    bar.replaceChildren(...[["all", "All", items.length], ...Object.entries(SLOTS).filter(([s]) => counts[s]).map(([s, name]) => [s, `${name}s`, counts[s]])]
      .map(([id, name, n]) => h("button", { type: "button", role: "tab", "aria-selected": String(filter === id), class: "filter", onclick: () => { filter = id; sessionStorage.setItem("closet-filter", id); draw(); } }, name, h("b", null, n))));
    const shown = items.filter((i) => filter === "all" || i.tags.slot === filter);
    grid.replaceChildren(...shown.map((item) => h("a", { class: "card", href: `#/item/${item.id}` },
      h("div", { class: "thumb" }, h("img", { src: urls.url(item.thumb), alt: "", loading: "lazy" })),
      h("div", { class: "card-text" },
        h("b", null, item.tags.name || defaultName(item.tags)),
        h("span", null, h("span", { class: "dots" }, item.tags.colours.slice(0, 3).map((c) => h("i", { style: `--c:${c.hex}`, title: c.label }))), labelOf("style", item.tags.style))))));
  }

  if (!items.length) {
    root.replaceChildren(h("section", { class: "empty" },
      h("div", { class: "empty-art", "aria-hidden": "true" }, h("i"), h("i"), h("i")),
      h("h1", null, "Shop your closet first."),
      h("p", null, "Snap a few things you own. Drape cuts them out and tags them on your phone, then tells you what goes with what, and whether that new buy is worth it."),
      h("a", { class: "btn primary big", href: "#/add" }, "Add your first items"),
      h("p", { class: "small muted" }, "Everything stays on this device. The AI runs on your phone, not on a server.")));
    return urls.free;
  }
  draw();
  root.replaceChildren(
    h("header", { class: "page-head" }, h("h1", null, "Your closet"), h("p", { class: "muted" }, plural(items.length, "item")), h("a", { class: "btn primary", href: "#/add" }, "+ Add")),
    bar, grid);
  return urls.free;
}

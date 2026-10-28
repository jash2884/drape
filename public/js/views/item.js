import { deleteItem, getItem, putItem } from "../db.js";
import { h, toast, urlBag } from "../ui.js";
import { defaultName, tagEditor } from "./tags.js";

export async function render(root, id) {
  const urls = urlBag();
  const item = await getItem(id);
  if (!item) { location.hash = "#/"; return; }
  let dirty = false;
  const save = h("button", { type: "button", class: "btn primary", disabled: true, onclick: async () => {
    item.edited = Date.now();
    await putItem(item);
    dirty = false; save.disabled = true;
    toast("Saved");
  } }, "Save changes");
  root.replaceChildren(
    h("a", { class: "back", href: "#/" }, "← Closet"),
    h("div", { class: "item-page" },
      h("div", { class: "item-img" }, h("img", { src: urls.url(item.image), alt: item.tags.name || defaultName(item.tags) })),
      h("div", null,
        h("h1", null, item.tags.name || defaultName(item.tags)),
        tagEditor(item.tags, item.predicted, () => { dirty = true; save.disabled = false; }),
        h("div", { class: "row" }, save,
          h("button", { type: "button", class: "btn ghost danger", onclick: async () => {
            if (!confirm("Remove this item from your closet?")) return;
            await deleteItem(id);
            location.hash = "#/";
          } }, "Remove")))));
  return () => { urls.free(); if (dirty) toast("Unsaved changes were discarded"); };
}

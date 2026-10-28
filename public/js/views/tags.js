// The tag editor used when adding an item and on the item page. The AI's top
// guesses are one-tap chips; anything else is a select away.
import { PALETTE } from "../colour.js";
import { CATEGORIES, GROUPS, labelOf, slotOf, SLOTS } from "../taxonomy.js";
import { h } from "../ui.js";

export function defaultName(tags) {
  const colour = tags.colours?.[0]?.label;
  return [colour, labelOf("category", tags.category)].filter(Boolean).join(" ");
}

export function tagEditor(tags, predicted, onChange) {
  const root = h("div", { class: "tag-editor" });
  const set = (patch) => { Object.assign(tags, patch); if (patch.category) tags.slot = slotOf(patch.category); draw(); onChange?.(tags); };

  function chips(group, options) {
    const guesses = predicted?.[group]?.top?.slice(0, 3).map((t) => t.id) ?? [];
    const ids = [...new Set([tags[group], ...guesses])].filter(Boolean);
    const select = h("select", { "aria-label": `Other ${group}`, onchange: (e) => e.target.value && set({ [group]: e.target.value }) },
      h("option", { value: "" }, "Other…"),
      group === "category"
        ? Object.entries(SLOTS).map(([slot, name]) => h("optgroup", { label: name }, CATEGORIES.filter((c) => c[2] === slot).map(([id, label]) => h("option", { value: id }, label))))
        : options.map(([id, label]) => h("option", { value: id }, label)));
    return h("div", { class: "chip-row" },
      ids.map((id) => {
        const p = predicted?.[group]?.top?.find((t) => t.id === id)?.p;
        return h("button", { type: "button", class: `chip${tags[group] === id ? " on" : ""}`, "aria-pressed": String(tags[group] === id), onclick: () => set({ [group]: id }) },
          labelOf(group, id), p != null && tags[group] !== id ? h("small", null, ` ${Math.round(p * 100)}%`) : null);
      }), select);
  }

  function colours() {
    const add = h("select", { "aria-label": "Add a colour", onchange: (e) => {
      const c = PALETTE.find((p) => p[0] === e.target.value);
      if (c && !tags.colours.some((x) => x.id === c[0])) set({ colours: [...tags.colours, { id: c[0], label: c[1], hex: c[2], share: 0 }] });
    } }, h("option", { value: "" }, "Add colour…"), PALETTE.map(([id, label]) => h("option", { value: id }, label)));
    return h("div", { class: "chip-row" }, tags.colours.map((c) => h("button", { type: "button", class: "chip colour on", title: "Remove", onclick: () => set({ colours: tags.colours.filter((x) => x.id !== c.id) }) },
      h("i", { style: `--c:${c.hex}` }), c.label, h("span", { "aria-hidden": "true" }, " ×"))), add);
  }

  function draw() {
    root.replaceChildren(
      h("label", { class: "field" }, h("span", null, "Name"), h("input", { type: "text", value: tags.name ?? "", placeholder: defaultName(tags), maxlength: 60, oninput: (e) => { tags.name = e.target.value; onChange?.(tags); } })),
      h("div", { class: "field" }, h("span", null, "Type"), chips("category")),
      h("div", { class: "field" }, h("span", null, "Colour"), colours()),
      h("div", { class: "field" }, h("span", null, "Pattern"), chips("pattern", GROUPS.pattern)),
      h("div", { class: "field" }, h("span", null, "Style"), chips("style", GROUPS.style)),
      h("div", { class: "field" }, h("span", null, "Warmth"), chips("warmth", GROUPS.warmth)));
  }
  draw();
  return root;
}

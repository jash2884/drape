// A tiny element builder and a few shared UI bits.
export function h(tag, props, ...kids) {
  const svg = ["svg", "path", "circle", "rect", "g", "line"].includes(tag);
  const el = svg ? document.createElementNS("http://www.w3.org/2000/svg", tag) : document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.setAttribute("class", v);
    else if (k === "style") el.style.cssText = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "value" && !svg) el.value = v;
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}

export function toast(text, kind = "info") {
  const el = h("div", { class: `toast ${kind}`, role: kind === "error" ? "alert" : "status" }, text);
  document.body.append(el);
  setTimeout(() => el.classList.add("out"), 2600);
  setTimeout(() => el.remove(), 3100);
}

// Object URLs made for one screen, released when the screen goes away.
export function urlBag() {
  const urls = [];
  return { url: (blob) => { const u = URL.createObjectURL(blob); urls.push(u); return u; }, free: () => urls.splice(0).forEach((u) => URL.revokeObjectURL(u)) };
}

export const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

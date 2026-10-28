// Hash router: #/ closet, #/add, #/item/<id>.
import { h } from "./ui.js";

const main = document.getElementById("app");
let cleanup = null, seq = 0;

async function route() {
  const id = ++seq;
  cleanup?.(); cleanup = null;
  const [, page = "", arg] = location.hash.replace(/^#/, "").split("/");
  for (const a of document.querySelectorAll("[data-nav]")) a.setAttribute("aria-current", String(a.dataset.nav === (page || "closet")));
  try {
    const view = await import(page === "add" ? "./views/add.js" : page === "item" ? "./views/item.js" : "./views/closet.js");
    if (id !== seq) return;
    const box = h("div", { class: "page" });
    main.replaceChildren(box);
    cleanup = (await view.render(box, arg)) ?? null;
  } catch (e) {
    console.error(e);
    main.replaceChildren(h("section", { class: "empty" }, h("h1", null, "Something went wrong"), h("p", { class: "muted" }, e.message), h("button", { class: "btn primary", onclick: () => location.reload() }, "Reload")));
  }
  window.scrollTo(0, 0);
}

addEventListener("hashchange", route);
route();

if ("serviceWorker" in navigator && !["localhost", "127.0.0.1"].includes(location.hostname)) navigator.serviceWorker.register("/sw.js").catch(() => {});

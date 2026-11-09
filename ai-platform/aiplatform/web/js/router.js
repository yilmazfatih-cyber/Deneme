// Hash yönlendirme: #/magaza, #/kurulu, #/sistem, #/denetim, #/onaylar, #/erp  (#/magaza/<modül-id> paneli açar)
import { closeDrawer, fill, h, loading } from "./components.js";

const routes = new Map();
let current = null;

export function route(name, loader) {
  routes.set(name, loader);
}

export function navigate(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

function parse() {
  const parts = (location.hash || "").replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  return { name: parts[0] || "magaza", params: parts.slice(1) };
}

export async function render() {
  const { name, params } = parse();
  const main = document.getElementById("main");
  const loader = routes.get(name);
  document.querySelectorAll(".nav a").forEach((a) => {
    if (a.dataset.route === name) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  if (!loader) {
    fill(main, h("h1", {}, "Sayfa bulunamadı"), h("p", {}, "Üst menüden bir sayfa seçin."));
    return;
  }
  const samePage = current === name;
  if (!samePage) {
    closeDrawer();
    fill(main, loading());
  }
  current = name;
  try {
    const mod = await loader();
    await mod.render(main, params, { samePage });
    const title = main.querySelector("h1");
    document.title = `${title ? title.textContent + " · " : ""}Yerel AI Platformu`;
    if (!samePage && title) title.focus({ preventScroll: true });
  } catch (e) {
    console.error(e);
    fill(main, h("h1", {}, "Sayfa yüklenemedi"), h("p", {}, e.message || String(e)));
  }
}

export function start() {
  window.addEventListener("hashchange", render);
  if (!location.hash) location.replace("#/magaza");
  render();
}

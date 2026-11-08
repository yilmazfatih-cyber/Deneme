// Demo ERP: ERP ekranlarına benzeyen (sol menü, liste/detay, formlar) ve her ekranda platformun AI modüllerini düğme
// olarak gösteren sayfa. Veri: sentetik örnek ERP ("ornek-erp"). Her düğme gerçek API'yi çağırır; uydurma sonuç yoktur.
import { api } from "../api.js";
import { badge, closeDrawer, fill, h, icon, toast } from "../components.js";
import { MODULE_NAMES, loadDurum, state } from "./demo/ortak.js";

const SCREENS = [
  { id: "cari", label: "Cari Kartlar", load: () => import("./demo/cari.js"), ai: "2" },
  { id: "evrak", label: "Gelen Evrak", load: () => import("./demo/evrak.js"), ai: "2" },
  { id: "fatura", label: "Faturalar", load: () => import("./demo/fatura.js"), ai: "" },
  { id: "raporlar", label: "Raporlar", load: () => import("./demo/raporlar.js"), ai: "2" },
  { id: "finans", label: "Nakit ve Yatırım", load: () => import("./demo/finans.js"), ai: "2" },
  { id: "onay", label: "Onay Kutusu", load: () => import("./demo/onay.js"), ai: "" },
  { id: "kvkk", label: "KVKK Göstergesi", load: () => import("./demo/kvkk.js"), ai: "1" },
];

let shell = null; // {root, side, content, head}
let currentScreen = null;

export async function render(main, params = []) {
  const id = SCREENS.some((s) => s.id === params[0]) ? params[0] : "cari";
  if (!shell || !main.contains(shell.root)) {
    shell = buildShell();
    fill(main, shell.root);
    await loadDurum();
    renderHead();
  }
  shell.side.querySelectorAll("a").forEach((a) => {
    if (a.dataset.screen === id) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  const screen = SCREENS.find((s) => s.id === id);
  if (currentScreen !== id) closeDrawer();
  currentScreen = id;
  fill(shell.content, h("div", { class: "loading", role: "status" }, h("span", { class: "spinner", "aria-hidden": "true" }), "Yükleniyor…"));
  const mod = await screen.load();
  await mod.render(shell.content, { params: params.slice(1), refreshHead: refresh, setup: runSetup });
  const h2 = shell.content.querySelector("h2");
  document.title = `${screen.label} · Demo ERP · Yerel AI Platformu`;
  if (h2 && params[0]) h2.focus({ preventScroll: true });
}

function buildShell() {
  const head = h("header", { class: "erp-head" });
  const side = h("nav", { class: "erp-side", "aria-label": "Demo ERP menüsü" },
    SCREENS.map((s, i) => [
      i === 5 ? h("div", { class: "side-sep", role: "presentation" }) : null,
      h("a", { href: `#/demo/${s.id}`, dataset: { screen: s.id } }, s.label,
        s.ai ? h("span", { class: "side-note", title: "Bu ekrandaki AI düğmesi sayısı" }, `AI ×${s.ai}`) : null),
    ]));
  const content = h("section", { class: "erp-content", "aria-live": "polite" });
  const root = h("div", { class: "erp-shell" }, head, side, content);
  return { root, side, content, head };
}

function renderHead() {
  const d = state.durum;
  const company = (d && d.sirket && d.sirket.unvan) || "Örnek Şirket A.Ş.";
  const setupBtn = h("button", { type: "button", class: `btn ${d && d.ready ? "" : "primary"}` }, icon("db"), d && d.ready ? "Demo verisini yenile" : "Demo verisini kur");
  setupBtn.addEventListener("click", async () => {
    setupBtn.disabled = true;
    try { await runSetup(); } finally { setupBtn.disabled = false; }
  });
  const mods = (d && d.modules) || {};
  const installed = Object.entries(mods).filter(([, v]) => v === "installed").map(([k]) => k);
  const llm = d && d.llm;
  fill(shell.head,
    h("div", {},
      h("h1", { tabindex: "-1" }, "Demo ERP · ", h("span", {}, `[${company}]`)),
      h("p", {}, "Sentetik verili örnek ERP. Her düğme platformun gerçek API'sini çağırır; sonuç uydurulmaz."),
      h("div", { class: "erp-status" },
        d && d.ready ? badge(`Demo kurulu · ${d.evrak_sayisi} evrak`, "ok") : badge("Demo verisi kurulmadı", "warn"),
        llm && llm.ok ? badge(`LLM hazır${llm.models && llm.models.length ? ` · ${llm.models[0]}` : ""}`, "ok", { title: llm.url || "" })
          : badge("LLM yok — dil modeli gerektiren düğmeler hata gösterir", "warn", { title: (llm && (llm.error || llm.url)) || "" }),
        badge(`${installed.length}/${Object.keys(mods).length || 0} demo modülü kurulu`, installed.length ? "info" : "", {
          title: Object.keys(mods).map((m) => `${MODULE_NAMES[m] || m}: ${mods[m] === "installed" ? "kurulu" : mods[m] === "disabled" ? "devre dışı" : "kurulu değil"}`).join("\n"),
        }),
        installed.map((m) => badge(MODULE_NAMES[m] || m, "ok", { title: `${m}: kurulu` })))),
    h("div", { class: "row" }, h("a", { class: "btn", href: "#/magaza" }, icon("download"), "Mağaza"), setupBtn));
}

async function refresh() {
  await loadDurum();
  renderHead();
}

async function runSetup() {
  try {
    const r = await api.post("/api/demo/setup");
    toast(r.connection_created ? "Demo kuruldu: örnek ERP bağlantısı, 6 evrak ve örnek veriler hazır." : `Demo verisi güncel (${r.evrak_sayisi} evrak).`, "ok");
  } catch {
    return; // bildirim api.js'te gösterildi
  }
  await refresh();
  const params = (location.hash || "").replace(/^#\/?/, "").split("/").filter(Boolean).slice(1);
  await render(document.getElementById("main"), params);
}

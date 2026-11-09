// Demo ERP ortak parçaları: durum önbelleği, AI düğmesi, hata kartı, "Bu ekranda AI nerede?" kutusu, para biçimi.
import { api, ApiError } from "../../api.js";
import { badge, fill, fmt, h, icon, notice } from "../../components.js";

export const CONN = "ornek-erp";

/** Modül kimliği → arayüzde gösterilen kısa ad */
export const MODULE_NAMES = {
  "fatura-cikarim": "Fatura Çıkarım",
  "dogal-dil-sql": "Doğal Dil → SQL",
  "kayit-eslestirme": "Kayıt Eşleştirme",
  "finans-hesap": "Finans Hesap",
  ozetleme: "Özetleme",
  "yazma-asistani": "Yazma Asistanı",
  "kvkk-kalkani": "KVKK Kalkanı",
  "zaman-serisi": "Zaman Serisi",
  "pdf-ayristirma": "PDF Ayrıştırma",
};

// /api/demo/durum yanıtı (kurulum, modül durumları, LLM sağlığı)
export const state = { durum: null };

export async function loadDurum() {
  try {
    state.durum = await api.get("/api/demo/durum", { quiet: true });
  } catch {
    state.durum = null;
  }
  return state.durum;
}

export function modStatus(id) {
  return (state.durum && state.durum.modules && state.durum.modules[id]) || "unknown";
}

export function llmOk() {
  return !!(state.durum && state.durum.llm && state.durum.llm.ok);
}

const nfTL = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money = (n) => (n === null || n === undefined || n === "" || Number.isNaN(Number(n)) ? "—" : `${nfTL.format(Number(n))} ₺`);
export const plain = (n, d = 2) => (n === null || n === undefined || Number.isNaN(Number(n)) ? "—" : new Intl.NumberFormat("tr-TR", { maximumFractionDigits: d }).format(Number(n)));
export const trDate = (s) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}` : s || "—");

const AYLAR = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
/** "2025-08" → "Ağu" (ocak ayında yılla: "Oca 26") */
export const ayEtiket = (ay) => { const [y, m] = String(ay).split("-").map(Number); return m ? `${AYLAR[m - 1]}${m === 1 ? ` ${String(y).slice(2)}` : ""}` : String(ay); };

/** AI düğmesi: "AI" etiketi + modül adı. Modül kurulu değilse kesik çerçeve; yine de tıklanır ve sunucunun hatası gösterilir. */
export function aiButton(label, moduleId, onClick, { needsLlm = false, primary = false } = {}) {
  const st = modStatus(moduleId);
  const off = st !== "installed";
  const title = `${MODULE_NAMES[moduleId] || moduleId} modülü${off ? " — kurulu değil" : ""}${needsLlm ? " · LLM gerekir" : " · model gerekmez"}`;
  const btn = h("button", { type: "button", class: `btn ai ${primary && !off ? "primary" : ""} ${off ? "off" : ""}`, title },
    h("span", { class: `ai-tag ${off ? "off" : ""}`, "aria-hidden": "true" }, "AI"), label);
  btn.setAttribute("aria-label", `${label} (${title})`);
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    try { await onClick(btn); } finally { btn.disabled = false; }
  });
  return btn;
}

/** Hazır (AI olmayan) işlem etiketi */
export function fixedTag(text = "Hazır sorgu") {
  return h("span", { class: "fixed-tag", title: "Önceden yazılmış SQL; yapay zekâ üretmez" }, text);
}

/** Sunucu hatasını (ApiError) Türkçe kart olarak gösterir; kurulu değilse Mağaza bağlantısı, demo kurulmamışsa kur düğmesi. */
export function errorCard(e, moduleId, { onSetup } = {}) {
  const err = e instanceof ApiError ? e : { message: (e && e.message) || String(e), code: "client_error", hint: null };
  const parts = [h("strong", {}, err.message)];
  if (err.hint) parts.push(h("div", { style: "color:var(--muted);font-size:.92rem;margin-top:.2rem" }, `İpucu: ${err.hint}`));
  const mod = moduleId || (err.hint && (err.hint.match(/\/api\/modules\/([a-z0-9-]+)\//) || [])[1]);
  const actions = [];
  if (mod && ["not_installed", "not_ready", "module_disabled"].includes(err.code)) {
    actions.push(h("a", { class: "btn small", href: `#/magaza/${encodeURIComponent(mod)}` }, icon("download"), `Mağaza'dan kur: ${MODULE_NAMES[mod] || mod}`));
  }
  if (err.code === "module_disabled") actions.push(h("a", { class: "btn small", href: "#/kurulu" }, "Kurulu modüllerde etkinleştir"));
  if (err.code === "demo_not_ready" && onSetup) actions.push(h("button", { type: "button", class: "btn small primary", onclick: onSetup }, icon("db"), "Demo verisini kur"));
  const kind = err.code === "not_installed" || err.code === "demo_not_ready" ? "warn" : "fail";
  return h("div", { class: `notice ${kind}`, role: kind === "fail" ? "alert" : "status" },
    h("div", { class: "row" }, h("div", { class: "grow" }, parts), badge(err.code || "hata", "code")),
    actions.length ? h("div", { class: "row", style: "margin-top:.45rem" }, actions) : null);
}

/** "Bu ekranda AI nerede?" — satıcının okuyacağı kısa açıklama kutusu. items: [{module|null, text}] */
export function aiWhere(items, open = false) {
  return h("details", { class: "ai-where", open: open || null },
    h("summary", {}, h("span", { class: "ai-tag", "aria-hidden": "true" }, "AI"), "Bu ekranda AI nerede?"),
    h("div", {}, h("ul", {}, items.map((it) => h("li", {},
      it.module ? [h("strong", {}, MODULE_NAMES[it.module] || it.module), " ", modBadge(it.module), " — "] : null,
      it.text)))));
}

export function modBadge(id) {
  const st = modStatus(id);
  if (st === "installed") return badge("kurulu", "ok");
  if (st === "disabled") return badge("devre dışı", "warn");
  if (st === "unknown") return badge("?", "");
  return badge("kurulu değil", "");
}

export function screenHead(title, subtitle, where) {
  return h("div", { class: "erp-screen-head" },
    h("div", {}, h("h2", { tabindex: "-1" }, title), subtitle ? h("p", {}, subtitle) : null),
    where);
}

/** Tıklanabilir satırlı yoğun tablo. columns: [{key,label,num?,render?}] */
export function dataTable(columns, rows, { caption, onRow, rowClass, empty = "Kayıt yok.", rowLabel } = {}) {
  if (!rows || !rows.length) return h("div", { class: "empty" }, h("p", {}, empty));
  const thead = h("thead", {}, h("tr", {}, columns.map((c) => h("th", { scope: "col", class: c.num ? "num" : "" }, c.label))));
  const tbody = h("tbody", {}, rows.map((r) => {
    const tr = h("tr", { class: `${onRow ? "row-click" : ""} ${rowClass ? rowClass(r) : ""}` },
      columns.map((c) => {
        const v = c.render ? c.render(r) : r[c.key];
        return h("td", { class: c.num ? "num" : "" }, v === null || v === undefined || v === "" ? "—" : v);
      }));
    if (onRow) {
      tr.tabIndex = 0;
      if (rowLabel) tr.setAttribute("aria-label", rowLabel(r));
      tr.addEventListener("click", () => onRow(r, tr));
      tr.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onRow(r, tr); } });
    }
    return tr;
  }));
  return h("div", { class: "table-wrap" }, h("table", {}, caption ? h("caption", { class: "sr-only" }, caption) : null, thead, tbody));
}

/** Basit dikey çubuk grafik (grafik kütüphanesi yok). items: [{label, value, alt?}] */
export function miniBars(items, { label = "Grafik", format = money } = {}) {
  const max = Math.max(1, ...items.map((i) => Math.abs(Number(i.value) || 0)));
  return h("figure", { style: "margin:0" },
    h("div", { class: "mini-bars", role: "img", "aria-label": `${label}: ${items.map((i) => `${i.label} ${format(i.value)}`).join(", ")}` },
      items.map((i) => h("div", { class: `b ${i.alt ? "alt" : ""}`, title: `${i.label}: ${format(i.value)}` },
        h("span", { style: `height:${Math.max(1.5, (Math.abs(Number(i.value) || 0) / max) * 100)}%` })))),
    h("div", { class: "mini-bars-labels", "aria-hidden": "true" }, items.map((i) => h("span", {}, i.label))));
}

/** Yanıt meta'sı: model, süre, maskelenen varlık */
export function metaLine(meta) {
  if (!meta) return null;
  const parts = [`Modül: ${meta.module || "—"}/${meta.action || "—"}`];
  parts.push(meta.model ? `Model: ${meta.model}` : meta.engine ? `Motor: ${meta.engine} (dil modeli yok)` : "Dil modeli kullanılmadı (kural/hesap)");
  if (meta.duration_ms !== undefined && meta.duration_ms !== null) parts.push(`Süre: ${fmt.num(meta.duration_ms, 0)} ms`);
  if (meta.masked_entities) parts.push(`Maskelenen: ${meta.masked_entities}`);
  if (meta.source) parts.push(`Kaynak: ${meta.source === "pdf-metin-katmani" ? "PDF metin katmanı" : meta.source === "ocr" ? "OCR" : meta.source}`);
  return h("p", { class: "erp-meta" }, parts.join(" · "));
}

export function setBusy(box, text) {
  fill(box, h("div", { class: "loading", role: "status" }, h("span", { class: "spinner", "aria-hidden": "true" }), text));
}

export { notice };

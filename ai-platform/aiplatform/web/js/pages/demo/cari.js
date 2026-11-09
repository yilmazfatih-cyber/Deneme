// Demo ERP · Cari Kartlar: arama, liste, detay; AI: mükerrer kayıt bulma (Kayıt Eşleştirme), cari özeti (Özetleme).
import { api } from "../../api.js";
import { badge, fill, h, icon, openDrawer, pretty } from "../../components.js";
import { aiButton, aiWhere, ayEtiket, dataTable, errorCard, metaLine, miniBars, money, notice, screenHead, setBusy, trDate } from "./ortak.js";

const RISK = { A: ["A", "ok"], B: ["B", "info"], C: ["C", "warn"], D: ["D", "fail"] };
const DURUM = { odendi: ["Ödendi", "ok"], acik: ["Açık", "info"], vadesi_gecti: ["Vadesi geçti", "fail"], iptal: ["İptal", ""], onay_bekliyor: ["Onay bekliyor", "warn"] };
export const durumBadge = (d) => { const [t, k] = DURUM[d] || [d, ""]; return badge(t, k); };

let selected = null;
let query = "";

export async function render(box, { setup }) {
  const search = h("input", { type: "search", id: "cari-q", placeholder: "Unvan, VKN veya il ara…", value: query, "aria-label": "Cari ara" });
  const threshold = h("input", { type: "number", id: "cari-esik", min: "60", max: "100", step: "1", value: "95", style: "width:5.5rem" });
  const dupBox = h("div", { "aria-live": "polite" });
  const listBox = h("div", {});
  const detailBox = null; // detay sağ panelde (openDrawer) açılır
  const dupBtn = aiButton("Mükerrer kayıtları bul", "kayit-eslestirme", async () => {
    setBusy(dupBox, "Cari unvanları karşılaştırılıyor…");
    try {
      const r = await api.post("/api/demo/cari/mukerrer", { threshold: Number(threshold.value) || 95 }, { quiet: true });
      showDuplicates(dupBox, r, (id) => openDetail(id, detailBox, listBox));
    } catch (e) {
      fill(dupBox, errorCard(e, "kayit-eslestirme", { onSetup: setup }));
    }
  });
  let timer = null;
  search.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => { query = search.value; loadList(listBox, detailBox, setup); }, 250);
  });
  fill(box,
    screenHead("Cari Kartlar", "Müşteri ve tedarikçi kartları — örnek ERP'den salt-okunur SQL ile okunur.",
      aiWhere([
        { module: "kayit-eslestirme", text: "\"Mükerrer kayıtları bul\": aynı firmanın farklı yazımla açılmış kartlarını benzerlik skoruyla bulur (RapidFuzz; dil modeli gerekmez)." },
        { module: "ozetleme", text: "\"Bu cariyi özetle\": kart, fatura durumları ve aylık toplamlar metne çevrilir, yerel dil modeli yönetici özeti yazar (LLM gerekir)." },
        { module: null, text: "Liste, arama ve detay AI değildir: doğrudan ERP sorgusudur." },
      ])),
    h("div", { class: "toolbar" }, search,
      h("label", { for: "cari-esik", class: "check" }, "Eşik", threshold), dupBtn),
    dupBox,
    h("p", { class: "erp-meta" }, "Satıra tıklayın: cari kart sağ panelde açılır."),
    listBox);
  await loadList(listBox, detailBox, setup);
}

async function loadList(listBox, detailBox, setup) {
  setBusy(listBox, "Cari kartlar okunuyor…");
  let r;
  try {
    r = await api.get(`/api/demo/cari?q=${encodeURIComponent(query)}`, { quiet: true });
  } catch (e) {
    fill(listBox, errorCard(e, null, { onSetup: setup }));
    return;
  }
  fill(listBox,
    h("p", { class: "erp-meta" }, `${r.total} cari${query ? ` · "${query}" araması` : ""}`),
    dataTable([
      { key: "id", label: "No", num: true },
      { key: "unvan", label: "Unvan", render: (c) => h("strong", { class: "nowrap" }, c.unvan) },
      { key: "vkn", label: "VKN", render: (c) => h("span", { class: "mono" }, c.vkn) },
      { key: "il", label: "İl" },
      { key: "risk_sinifi", label: "Risk", render: (c) => { const [t, k] = RISK[c.risk_sinifi] || [c.risk_sinifi, ""]; return badge(t, k); } },
      { key: "toplam_ciro", label: "Toplam ciro (KDV dahil)", num: true, render: (c) => h("span", { class: "nowrap" }, money(c.toplam_ciro)) },
      { key: "fatura_sayisi", label: "Fatura", num: true },
    ], r.items, {
      caption: "Cari kartlar",
      empty: "Aramaya uyan cari yok.",
      rowClass: (c) => (c.id === selected ? "is-selected" : ""),
      rowLabel: (c) => `${c.unvan} kartını aç`,
      onRow: (c, tr) => {
        listBox.querySelectorAll("tr.is-selected").forEach((x) => x.classList.remove("is-selected"));
        tr.classList.add("is-selected");
        openDetail(c.id, detailBox, listBox);
      },
    }),
    h("details", {}, h("summary", {}, "Çalıştırılan SQL (salt-okunur)"), pretty(r.sql)));
}

async function openDetail(id) {
  selected = id;
  const detailBox = openDrawer("Cari kart", h("div", { class: "loading", role: "status" }, h("span", { class: "spinner", "aria-hidden": "true" }), "Cari kart açılıyor…"));
  let d;
  try {
    d = await api.get(`/api/demo/cari/${id}`, { quiet: true });
  } catch (e) {
    fill(detailBox, errorCard(e));
    return;
  }
  const c = d.cari;
  const sumBox = h("div", { "aria-live": "polite" });
  const sumBtn = aiButton("Bu cariyi özetle", "ozetleme", async () => {
    setBusy(sumBox, "Yerel dil modeli özet yazıyor…");
    try {
      const r = await api.post(`/api/demo/cari/${id}/ozetle`, {}, { quiet: true });
      const res = r.result || {};
      fill(sumBox, h("div", { class: "notice ok" },
        h("strong", {}, "AI özeti"), h("p", {}, res.summary || "—"),
        (res.bullets || []).length ? h("ul", {}, res.bullets.map((b) => h("li", {}, b))) : null,
        (res.actions || []).length ? [h("strong", {}, "Önerilen işler"), h("ul", {}, res.actions.map((b) => h("li", {}, b)))] : null,
        (res.unverified_numbers || []).length ? notice(`Kaynakta olmayan sayılar: ${res.unverified_numbers.join(", ")}`, "warn", "Doğrulanmadı:") : null),
      metaLine(r.meta),
      h("details", {}, h("summary", {}, "Modele giden metin (SQL'den üretildi)"), pretty(r.kaynak_metin)));
    } catch (e) {
      fill(sumBox, errorCard(e, "ozetleme"));
    }
  }, { needsLlm: true });
  const [rt, rk] = RISK[c.risk_sinifi] || [c.risk_sinifi, ""];
  fill(detailBox, h("div", { class: "erp-shell", style: "display:block" },
    h("div", { class: "row" }, h("h3", { class: "grow", style: "margin:0" }, c.unvan), badge(`Risk ${rt}`, rk)),
    h("dl", { class: "kv", style: "margin:.5rem 0" },
      h("dt", {}, "Cari no"), h("dd", {}, String(c.id)),
      h("dt", {}, "VKN"), h("dd", { class: "mono" }, c.vkn),
      h("dt", {}, "İl"), h("dd", {}, c.il),
      h("dt", {}, "Durum özeti"), h("dd", {}, d.durum_ozeti.length ? h("div", { class: "chips" }, d.durum_ozeti.map((o) => [durumBadge(o.durum), ` ${o.adet} · ${money(o.toplam)} `])) : "Fatura yok")),
    h("div", { class: "row", style: "margin:.4rem 0" }, sumBtn, h("a", { class: "btn small", href: `#/demo/fatura` }, icon("link"), "Faturalar ekranı")),
    sumBox,
    h("h3", {}, "Son 12 ay (KDV dahil, iptal hariç)"),
    d.aylik.length ? miniBars(d.aylik.map((a) => ({ label: ayEtiket(a.ay), value: a.toplam })), { label: "Aylık toplam" }) : h("p", { class: "erp-meta" }, "Bu carinin faturası yok."),
    h("h3", {}, `Faturalar (${d.faturalar.length})`),
    dataTable([
      { key: "id", label: "No", num: true },
      { key: "tarih", label: "Tarih", render: (f) => trDate(f.tarih) },
      { key: "toplam", label: "Toplam", num: true, render: (f) => money(f.toplam) },
      { key: "durum", label: "Durum", render: (f) => durumBadge(f.durum) },
    ], d.faturalar.slice(0, 15), { caption: "Carinin faturaları", empty: "Fatura yok.", rowClass: (f) => (f.durum === "onay_bekliyor" ? "demo-hl" : "") })));
}

function showDuplicates(box, r, open) {
  const res = r.result || {};
  const pairs = res.pairs || [];
  fill(box, h("div", { class: "erp-panel", style: "margin-bottom:1rem" },
    h("div", { class: "row" }, h("h3", { class: "grow", style: "margin:0" }, `Mükerrer adayları: ${pairs.length} çift`),
      badge(`motor: ${res.engine || "—"}`, "info"), badge(`eşik %${res.threshold}`), badge(`${res.record_count} kayıt tarandı`)),
    pairs.length ? dataTable([
      { key: "score", label: "Benzerlik", num: true, render: (p) => badge(`%${p.score}`, p.score >= 99 ? "fail" : "warn") },
      { key: "a", label: "Kart A", render: (p) => [h("strong", {}, p.a_cari ? p.a_cari.unvan : p.a), h("br"), h("small", { class: "mono" }, p.a_cari ? `#${p.a} · VKN ${p.a_cari.vkn}` : "")] },
      { key: "b", label: "Kart B", render: (p) => [h("strong", {}, p.b_cari ? p.b_cari.unvan : p.b), h("br"), h("small", { class: "mono" }, p.b_cari ? `#${p.b} · VKN ${p.b_cari.vkn}` : "")] },
      { key: "x", label: "İncele", render: (p) => h("div", { class: "row" },
        h("button", { type: "button", class: "btn small", onclick: () => open(p.a) }, `#${p.a}`),
        h("button", { type: "button", class: "btn small", onclick: () => open(p.b) }, `#${p.b}`)) },
    ], pairs, { caption: "Mükerrer cari adayları" }) : h("p", {}, "Bu eşikte mükerrer aday yok. Eşiği düşürüp yeniden deneyin."),
    notice("Ad karşılaştırması Türkçe normalize edilir (\"Ltd. Şti.\" = \"LTD ŞTİ\", \"A.Ş.\" = \"Anonim Şirketi\"). Birleştirme ERP'ye yazılmaz; karar kullanıcıdadır.", ""),
    metaLine(r.meta)));
}

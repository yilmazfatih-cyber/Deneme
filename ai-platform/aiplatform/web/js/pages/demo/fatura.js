// Demo ERP · Faturalar: durum filtresi (tümü / onay bekliyor / ödenmemiş); onay bekleyenler vurgulu. Bu ekranda AI yok.
import { api } from "../../api.js";
import { fill, h, icon, pretty } from "../../components.js";
import { durumBadge } from "./cari.js";
import { aiWhere, dataTable, errorCard, money, screenHead, setBusy, trDate } from "./ortak.js";

const FILTERS = [["tumu", "Tümü"], ["onay_bekliyor", "Onay bekliyor"], ["odenmemis", "Ödenmemiş"]];
let filter = "tumu";

export async function render(box, { setup }) {
  const tabs = h("div", { class: "row", role: "tablist", "aria-label": "Fatura durumu" });
  const listBox = h("div", {});
  const refresh = h("button", { type: "button", class: "btn", onclick: () => load() }, icon("refresh"), "Yenile");
  fill(box,
    screenHead("Faturalar", "Örnek ERP'deki satış ve alış faturaları (en çok 200 satır).",
      aiWhere([
        { module: null, text: "Bu ekranda AI yok: liste doğrudan salt-okunur SQL'dir." },
        { module: null, text: "Sarı satırlar \"onay_bekliyor\": Gelen Evrak'tan AI ile okunup Onay Kutusu'nda onaylanan öneri kayıtlar burada görünür." },
      ])),
    h("div", { class: "toolbar" }, tabs, h("span", { class: "grow" }), refresh),
    listBox);

  async function load() {
    setBusy(listBox, "Faturalar okunuyor…");
    let r;
    try {
      r = await api.get(`/api/demo/fatura?durum=${filter}&limit=200`, { quiet: true });
    } catch (e) {
      fill(listBox, errorCard(e, null, { onSetup: setup }));
      return;
    }
    const counts = r.counts || {};
    const n = { tumu: Object.values(counts).reduce((a, b) => a + b, 0), onay_bekliyor: counts.onay_bekliyor || 0, odenmemis: (counts.acik || 0) + (counts.vadesi_gecti || 0) };
    fill(tabs, FILTERS.map(([k, l]) => h("button", {
      type: "button", role: "tab", class: `btn ${filter === k ? "primary" : ""}`, "aria-selected": String(filter === k),
      onclick: () => { filter = k; load(); },
    }, `${l} (${n[k]})`)));
    fill(listBox,
      dataTable([
        { key: "id", label: "No", num: true },
        { key: "tarih", label: "Tarih", render: (f) => trDate(f.tarih) },
        { key: "unvan", label: "Cari" },
        { key: "tutar", label: "Tutar", num: true, render: (f) => money(f.tutar) },
        { key: "kdv", label: "KDV", num: true, render: (f) => money(f.kdv) },
        { key: "toplam", label: "Toplam", num: true, render: (f) => h("strong", {}, money(f.toplam)) },
        { key: "durum", label: "Durum", render: (f) => durumBadge(f.durum) },
      ], r.items, {
        caption: "Faturalar",
        empty: filter === "onay_bekliyor" ? "Onay bekleyen fatura yok. Gelen Evrak'tan bir öneri kayıt açıp Onay Kutusu'nda onaylayın." : "Fatura yok.",
        rowClass: (f) => (f.durum === "onay_bekliyor" ? "demo-hl" : ""),
      }),
      r.truncated ? h("p", { class: "erp-meta" }, "İlk 200 satır gösteriliyor.") : null,
      h("details", {}, h("summary", {}, "Çalıştırılan SQL (salt-okunur)"), pretty(r.sql)));
  }
  await load();
}

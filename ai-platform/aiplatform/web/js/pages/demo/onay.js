// Demo ERP · Onay Kutusu: ERP'ye yazacak öneriler insan kararı bekler. Onaylanınca örnek ERP'ye gerçekten yazılır.
import { api } from "../../api.js";
import { badge, confirmDialog, fill, fmt, h, icon, pretty, statusBadge, toast } from "../../components.js";
import { aiWhere, dataTable, errorCard, money, notice, screenHead, setBusy } from "./ortak.js";

function changed() {
  window.dispatchEvent(new Event("aip:approvals-changed"));
}

export async function render(box) {
  const pendingBox = h("div", {});
  const recentBox = h("div", {});
  const refresh = h("button", { type: "button", class: "btn", onclick: () => load() }, icon("refresh"), "Yenile");
  fill(box,
    screenHead("Onay Kutusu", "ERP'ye yazacak her işlem burada insan kararı bekler.",
      aiWhere([
        { module: null, text: "Bu ekranda AI yok: karar insanındır. AI'ın önerdiği kayıtlar (ör. Gelen Evrak'tan okunan fatura) buraya düşer." },
        { module: null, text: "\"Onayla\" örnek ERP'nin yazma aracını çalıştırır; fatura \"onay_bekliyor\" durumunda ERP'ye yazılır ve Faturalar ekranında görünür." },
      ])),
    h("div", { class: "toolbar" }, h("span", { class: "grow" }), refresh),
    h("h3", {}, "Bekleyenler"), pendingBox,
    h("h3", {}, "Son kararlar"), recentBox);

  async function load() {
    setBusy(pendingBox, "Onay kayıtları okunuyor…");
    let pending, all;
    try {
      [pending, all] = await Promise.all([
        api.get("/api/approvals?status=pending&limit=50", { quiet: true }),
        api.get("/api/approvals?limit=15", { quiet: true }),
      ]);
    } catch (e) {
      fill(pendingBox, errorCard(e));
      return;
    }
    changed();
    fill(pendingBox, pending.items.length ? h("div", { class: "erp-gap" }, pending.items.map((a) => card(a, load)))
      : h("div", { class: "empty" }, h("p", {}, "Bekleyen onay yok."), h("a", { class: "btn", href: "#/demo/evrak" }, "Gelen Evrak'tan öneri kayıt aç")));
    const decided = all.items.filter((a) => a.status !== "pending");
    fill(recentBox, dataTable([
      { key: "decided_at", label: "Karar", render: (a) => fmt.date(a.decided_at) },
      { key: "what", label: "İşlem", render: (a) => describe(a) },
      { key: "decided_by", label: "Karar veren" },
      { key: "status", label: "Durum", render: (a) => statusBadge(a.status) },
      { key: "result", label: "Sonuç", render: (a) => resultText(a) },
    ], decided, { caption: "Son kararlar", empty: "Henüz karar verilmedi." }));
  }
  await load();
}

function describe(a) {
  const p = a.payload || {};
  if (a.module === "erp" && a.action === "fatura_oneri_olustur") {
    const k = p.kaynak || {};
    return `Öneri fatura: ${k.satici_unvan || `cari #${(p.args || {}).cari_id}`}${k.belge_no ? ` · ${k.belge_no}` : ""}`;
  }
  return a.module === "erp" ? `ERP yazma aracı "${a.action}"` : `${a.module} / ${a.action}`;
}

function resultText(a) {
  const r = a.result || {};
  if (r.ok && r.result && r.result.fatura_id) return `Fatura #${r.result.fatura_id} · ${money(r.result.toplam)}`;
  if (r.error) return r.error.message;
  return "—";
}

function card(a, reload) {
  const p = a.payload || {};
  const args = p.args || {};
  const k = p.kaynak || null;
  const out = h("div", { "aria-live": "polite" });
  const approve = h("button", { type: "button", class: "btn primary" }, icon("check"), "Onayla");
  const reject = h("button", { type: "button", class: "btn danger" }, icon("x"), "Reddet");
  async function decide(decision) {
    if (decision === "approve" && !(await confirmDialog("Bu kayıt örnek ERP'ye yazılacak. Onaylıyor musunuz?", { okText: "Onayla" }))) return;
    approve.disabled = reject.disabled = true;
    try {
      const r = await api.post(`/api/approvals/${encodeURIComponent(a.id)}/decide`, { decision, note: "Demo ERP onay kutusu" }, { quiet: true });
      if (r.status === "executed") {
        const res = (r.result || {}).result || {};
        fill(out, notice(`ERP'ye yazıldı: fatura #${res.fatura_id ?? "?"}, durum "${res.durum ?? "?"}", toplam ${money(res.toplam)}.`, "ok"),
          h("a", { class: "btn small", href: "#/demo/fatura" }, "Faturalar ekranında gör"));
        toast("Onaylandı ve ERP'ye yazıldı.", "ok");
      } else if (r.status === "failed") {
        fill(out, notice((r.result && r.result.error && r.result.error.message) || "İşlem başarısız.", "fail", "Onaylandı ama yazılamadı:"));
      } else {
        fill(out, notice("Reddedildi; ERP'de hiçbir değişiklik yapılmadı.", ""));
      }
      changed();
      setTimeout(reload, 2500);
    } catch (e) {
      fill(out, errorCard(e));
      approve.disabled = reject.disabled = false;
    }
  }
  approve.addEventListener("click", () => decide("approve"));
  reject.addEventListener("click", () => decide("reject"));
  const kalemler = Array.isArray(args.kalemler) ? args.kalemler : [];
  return h("article", { class: "erp-panel", "aria-label": `Onay ${a.id}` },
    h("div", { class: "row" }, h("strong", { class: "grow" }, describe(a)), badge("Bekliyor", "warn")),
    h("dl", { class: "kv", style: "margin:.45rem 0" },
      h("dt", {}, "İsteyen"), h("dd", {}, a.requested_by || "—"),
      h("dt", {}, "Zaman"), h("dd", {}, fmt.date(a.created_at)),
      k ? [h("dt", {}, "Kaynak evrak"), h("dd", {}, k.dosya_adi || "—"),
        h("dt", {}, "Giriş"), h("dd", {}, k.giris || "—"),
        h("dt", {}, "Belgedeki toplam"), h("dd", {}, k.genel_toplam ? `${k.genel_toplam}` : "—"),
        h("dt", {}, "Doğrulama"), h("dd", {}, k.dogrulama ? badge(k.dogrulama.ok ? `Tutarlı ${k.dogrulama.passed}/${k.dogrulama.total}` : `Uyarı ${k.dogrulama.passed}/${k.dogrulama.total}`, k.dogrulama.ok ? "ok" : "warn") : "—")] : null,
      args.cari_id ? [h("dt", {}, "Cari no"), h("dd", {}, String(args.cari_id))] : null,
      args.tarih ? [h("dt", {}, "Tarih"), h("dd", {}, args.tarih)] : null),
    kalemler.length ? dataTable([
      { key: "urun_kodu", label: "Ürün", render: (x) => h("span", { class: "mono" }, x.urun_kodu) },
      { key: "miktar", label: "Miktar", num: true },
      { key: "birim_fiyat", label: "Birim fiyat", num: true, render: (x) => (x.birim_fiyat !== undefined ? money(x.birim_fiyat) : "stok fiyatı") },
    ], kalemler, { caption: "Yazılacak kalemler" }) : h("details", {}, h("summary", {}, "Yazılacak veri"), pretty(a.payload)),
    a.action === "fatura_oneri_olustur" ? h("p", { class: "erp-meta" }, "Örnek ERP KDV'yi %20 ile yeniden hesaplar; kayıt \"onay_bekliyor\" durumunda açılır.") : null,
    h("div", { class: "row", style: "margin-top:.5rem" }, approve, reject), out);
}

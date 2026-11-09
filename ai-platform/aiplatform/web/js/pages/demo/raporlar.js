// Demo ERP · Raporlar: "Doğal dilde sor" (Doğal Dil → SQL), satış tahmini (Zaman Serisi), etiketli hazır sorgular (AI değil).
import { api } from "../../api.js";
import { badge, fill, h, icon, pretty } from "../../components.js";
import { CONN, aiButton, aiWhere, ayEtiket, dataTable, errorCard, fixedTag, metaLine, miniBars, money, plain, screenHead, setBusy } from "./ortak.js";

const EXAMPLES = [
  "2026'da en çok satış yaptığımız 5 müşteri kim?",
  "Vadesi geçmiş faturaların toplamı ne kadar?",
  "Hangi ilde kaç müşterimiz var?",
];

function resultTable(columns, rows, caption) {
  const cols = (columns || []).map((name, i) => ({ key: String(i), label: name, num: rows.length && typeof rows[0][i] === "number",
    render: (row) => (row[i] === null ? "—" : typeof row[i] === "number" ? plain(row[i]) : String(row[i])) }));
  return dataTable(cols, rows || [], { caption, empty: "Sonuç boş." });
}

export async function render(box, { setup }) {
  fill(box,
    screenHead("Raporlar", "Yönetim raporları: serbest soru, satış tahmini ve hazır sorgular.",
      aiWhere([
        { module: "dogal-dil-sql", text: "\"Doğal dilde sor\": soru yerel dil modeliyle SQL'e çevrilir; SQL kodda denetlenir (tek SELECT, izinli tablolar, LIMIT) ve salt-okunur çalışır (LLM gerekir)." },
        { module: "zaman-serisi", text: "\"Tahmin\": aylık satış serisinden önümüzdeki ayları tahmin eder, alt-üst aralık ve geri test hatası verir." },
        { module: null, text: "\"Hazır sorgular\" AI değildir: önceden yazılmış SQL'dir ve öyle etiketlenmiştir." },
      ])),
    h("div", { class: "erp-gap" }, askCard(), forecastCard(setup), fixedCard(setup)));
}

function askCard() {
  const q = h("input", { type: "text", id: "rp-q", style: "width:100%", placeholder: "ör. 2026'da en çok satış yaptığımız 5 müşteri kim?" });
  const dry = h("input", { type: "checkbox", id: "rp-dry" });
  const out = h("div", { "aria-live": "polite" });
  const btn = aiButton("Sor", "dogal-dil-sql", async () => {
    if (!q.value.trim()) { q.focus(); return; }
    setBusy(out, "Soru SQL'e çevriliyor…");
    try {
      const r = await api.post("/api/modules/dogal-dil-sql/run/ask", { question: q.value.trim(), connection_id: CONN, dry_run: dry.checked }, { quiet: true });
      const res = r.result || {};
      fill(out,
        res.explanation ? h("p", {}, h("strong", {}, "Açıklama: "), res.explanation) : null,
        h("details", { open: res.dry_run || null }, h("summary", {}, "Üretilen SQL (denetimden geçti)"), pretty(res.sql)),
        res.dry_run ? h("p", { class: "erp-meta" }, "Dry run: SQL üretildi ama çalıştırılmadı.")
          : [h("p", { class: "erp-meta" }, `${res.row_count ?? (res.rows || []).length} satır${res.truncated ? " (kısaltıldı)" : ""}`), resultTable(res.columns, res.rows, "Sorgu sonucu")],
        metaLine(r.meta));
    } catch (e) {
      fill(out, errorCard(e, "dogal-dil-sql"));
    }
  }, { needsLlm: true, primary: true });
  q.addEventListener("keydown", (e) => { if (e.key === "Enter") btn.click(); });
  return h("div", { class: "erp-panel" },
    h("h3", {}, "Doğal dilde sor"),
    h("div", { class: "field" }, h("label", { for: "rp-q" }, "Sorunuz"), q),
    h("div", { class: "row" }, btn, h("label", { class: "check", for: "rp-dry" }, dry, "Dry run (SQL'i yalnız göster, çalıştırma)"),
      h("span", { class: "grow" }),
      EXAMPLES.map((x) => h("button", { type: "button", class: "btn small", onclick: () => { q.value = x; q.focus(); } }, x))),
    out);
}

function nextMonths(last, n) {
  let [y, m] = last.split("-").map(Number);
  const out = [];
  for (let i = 0; i < n; i++) {
    m += 1;
    if (m > 12) { m = 1; y += 1; }
    out.push(`${y}-${String(m).padStart(2, "0")}`);
  }
  return out;
}

function forecastCard(setup) {
  const horizon = h("select", { id: "rp-h" }, [3, 6, 12].map((n) => h("option", { value: String(n), selected: n === 6 || null }, `${n} ay`)));
  const hist = h("div", {});
  const out = h("div", { "aria-live": "polite" });
  let series = null;
  (async () => {
    try {
      series = (await api.get("/api/demo/satis-aylik", { quiet: true })).items;
      const last = series.slice(-18);
      fill(hist, h("p", { class: "erp-meta" }, `Satış serisi: ${series.length} ay (${series[0].ay} – ${series[series.length - 1].ay}). Son 18 ay:`),
        miniBars(last.map((s) => ({ label: ayEtiket(s.ay), value: s.tutar })), { label: "Aylık satış" }));
    } catch (e) {
      fill(hist, errorCard(e, null, { onSetup: setup }));
    }
  })();
  const btn = aiButton("Tahmin", "zaman-serisi", async () => {
    if (!series) return;
    setBusy(out, "Tahmin hesaplanıyor…");
    const n = Number(horizon.value);
    try {
      const r = await api.post("/api/modules/zaman-serisi/run/forecast", { series: series.map((s) => s.tutar), horizon: n, freq: "M" }, { quiet: true });
      const res = r.result || {};
      const months = nextMonths(series[series.length - 1].ay, n);
      const rows = months.map((ay, i) => ({ ay, median: res.median[i], low: res.low[i], high: res.high[i] }));
      fill(out,
        h("div", { class: "row" }, badge(`motor: ${res.engine}`, "info"),
          res.backtest_mape !== null && res.backtest_mape !== undefined ? badge(`geri test hatası (MAPE) %${plain(res.backtest_mape, 1)}`, "") : null,
          res.baseline_backtest_mape !== null && res.baseline_backtest_mape !== undefined ? badge(`mevsimsel naif taban %${plain(res.baseline_backtest_mape, 1)}`, "") : null),
        miniBars([...series.slice(-12).map((s) => ({ label: ayEtiket(s.ay), value: s.tutar, alt: true })),
          ...rows.map((x) => ({ label: ayEtiket(x.ay), value: x.median }))], { label: "Gerçekleşen (gri) ve tahmin (mavi)" }),
        dataTable([
          { key: "ay", label: "Ay" },
          { key: "low", label: "Alt (%10)", num: true, render: (x) => money(x.low) },
          { key: "median", label: "Tahmin (medyan)", num: true, render: (x) => h("strong", {}, money(x.median)) },
          { key: "high", label: "Üst (%90)", num: true, render: (x) => money(x.high) },
        ], rows, { caption: "Satış tahmini" }),
        metaLine(r.meta));
    } catch (e) {
      fill(out, errorCard(e, "zaman-serisi"));
    }
  }, { primary: true });
  return h("div", { class: "erp-panel" },
    h("h3", {}, "Satış tahmini"), hist,
    h("div", { class: "row", style: "margin-top:.6rem" }, h("label", { for: "rp-h" }, "Ufuk"), horizon, btn), out);
}

function fixedCard(setup) {
  const list = h("div", {});
  const out = h("div", { "aria-live": "polite" });
  (async () => {
    let r;
    try {
      r = await api.get("/api/demo/hazir-sorgular", { quiet: true });
    } catch (e) {
      fill(list, errorCard(e));
      return;
    }
    fill(list, h("p", { class: "erp-meta" }, r.not),
      h("div", { class: "row" }, r.items.map((s) => h("button", { type: "button", class: "btn", title: s.aciklama, onclick: () => run(s) }, fixedTag(), s.baslik))));
  })();
  async function run(s) {
    setBusy(out, "Hazır sorgu çalışıyor…");
    try {
      const r = await api.post(`/api/demo/hazir-sorgular/${encodeURIComponent(s.id)}/calistir`, {}, { quiet: true });
      fill(out, h("div", { class: "row", style: "margin-top:.6rem" }, fixedTag(), h("strong", {}, r.sorgu.baslik), h("span", { class: "erp-meta" }, `· ${r.row_count} satır · ${r.sorgu.aciklama}`)),
        resultTable(r.columns, r.rows, r.sorgu.baslik),
        h("details", {}, h("summary", {}, "Hazır SQL"), pretty(r.sorgu.sql)));
    } catch (e) {
      fill(out, errorCard(e, null, { onSetup: setup }));
    }
  }
  return h("div", { class: "erp-panel" },
    h("div", { class: "row" }, h("h3", { class: "grow", style: "margin:0" }, "Hazır sorgular"), fixedTag("AI değil")),
    list, out, h("p", { class: "erp-meta" }, icon("db"), " Hazır sorgular da Doğal Dil → SQL ile aynı salt-okunur denetimden geçer."));
}

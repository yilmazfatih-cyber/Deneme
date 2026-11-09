// Demo ERP · Nakit ve Yatırım: geri ödeme + NBD/İVO (Finans Hesap; model gerekmez), "Doğal dilde sor" (LLM gerekir).
import { api } from "../../api.js";
import { badge, fill, h, icon, progressBar, toast } from "../../components.js";
import { aiButton, aiWhere, dataTable, errorCard, metaLine, money, plain, screenHead, setBusy } from "./ortak.js";

const DEFAULTS = { investment: 1500000, flows: [600000, 700000, 750000, 800000, 800000], rate: 30 };

export async function render(box, { refreshHead }) {
  const inv = h("input", { type: "number", id: "fn-inv", min: "0", step: "1000", value: String(DEFAULTS.investment), style: "width:100%" });
  const rate = h("input", { type: "number", id: "fn-rate", min: "0", max: "200", step: "0.5", value: String(DEFAULTS.rate), style: "width:100%" });
  const flows = DEFAULTS.flows.map((v, i) => h("input", { type: "number", id: `fn-cf-${i}`, step: "1000", value: String(v), style: "width:100%" }));
  const out = h("div", { "aria-live": "polite" });

  async function calculate() {
    const cash = flows.map((f) => Number(f.value) || 0);
    const body = { investment: Number(inv.value) || 0, cash_flows: cash, rate: Number(rate.value) };
    setBusy(out, "Hesaplanıyor…");
    try {
      const [pb, nv] = await Promise.all([
        api.post("/api/modules/finans-hesap/run/payback", body, { quiet: true }),
        api.post("/api/modules/finans-hesap/run/npv_irr", body, { quiet: true }),
      ]);
      showResult(out, pb, nv);
    } catch (e) {
      fill(out, errorCard(e, "finans-hesap"), e.code === "not_installed" ? installCard(out, calculate, refreshHead) : null);
    }
  }
  const calcBtn = aiButton("Hesapla", "finans-hesap", calculate, { primary: true });

  const q = h("input", { type: "text", id: "fn-q", style: "width:100%", value: "1,5 milyon TL'lik makine yatırımı yılda 700 bin TL nakit getirirse %30 iskontoyla kaç yılda geri döner?" });
  const askOut = h("div", { "aria-live": "polite" });
  const askBtn = aiButton("Sor", "finans-hesap", async () => {
    setBusy(askOut, "Dil modeli soruyu hesap aracına çeviriyor…");
    try {
      const r = await api.post("/api/modules/finans-hesap/run/ask", { question: q.value.trim() }, { quiet: true });
      const res = r.result || {};
      fill(askOut,
        res.answer ? h("div", { class: "notice ok" }, h("strong", {}, "Yanıt: "), res.answer) : null,
        (res.calculations || []).length ? h("details", {}, h("summary", {}, "Çağrılan hesap araçları (sayılar kodda hesaplandı)"),
          h("pre", {}, JSON.stringify(res.calculations, null, 2))) : null,
        !res.answer ? h("pre", {}, JSON.stringify(res, null, 2)) : null,
        metaLine(r.meta));
    } catch (e) {
      fill(askOut, errorCard(e, "finans-hesap"));
    }
  }, { needsLlm: true });

  fill(box,
    screenHead("Nakit ve Yatırım", "Yatırım değerlendirme: geri ödeme süresi, net bugünkü değer, iç verim oranı.",
      aiWhere([
        { module: "finans-hesap", text: "\"Hesapla\": geri ödeme, NBD ve İVO deterministik hesap motoruyla (numpy-financial) bulunur; dil modeli gerekmez, sonuç her seferinde aynıdır." },
        { module: "finans-hesap", text: "\"Doğal dilde sor\": soruyu dil modeli hesap aracına çevirir, sayıları yine motor hesaplar (LLM gerekir)." },
      ])),
    h("div", { class: "erp-split even" },
      h("div", { class: "erp-panel" },
        h("h3", {}, "Yatırım bilgileri"),
        h("div", { class: "erp-form-grid" },
          h("div", { class: "field" }, h("label", { for: "fn-inv" }, "Yatırım tutarı (₺)"), inv),
          h("div", { class: "field" }, h("label", { for: "fn-rate" }, "İskonto oranı (% yıllık)"), rate)),
        h("h3", {}, "Yıllık net nakit akışları (₺)"),
        h("div", { class: "erp-form-grid" }, flows.map((f, i) => h("div", { class: "field" }, h("label", { for: f.id }, `${i + 1}. yıl`), f))),
        h("div", { class: "row" }, calcBtn)),
      h("div", { class: "erp-panel" }, h("h3", {}, "Sonuç"), out)),
    h("div", { class: "erp-panel", style: "margin-top:1rem" },
      h("h3", {}, "Doğal dilde sor"),
      h("div", { class: "field" }, h("label", { for: "fn-q" }, "Soru"), q),
      h("div", { class: "row" }, askBtn), askOut));
  fill(out, h("p", { class: "erp-meta" }, "Değerleri girip \"Hesapla\"ya basın."));
}

function showResult(out, pb, nv) {
  const p = pb.result || {};
  const n = nv.result || {};
  const notes = [...new Set([...(p.notes || []), ...(n.notes || [])])];
  fill(out,
    h("div", { class: "result-cards" },
      card("Basit geri ödeme", p.simple_years !== null && p.simple_years !== undefined ? `${plain(p.simple_years)} yıl` : "Geri dönmüyor"),
      card("İskontolu geri ödeme", p.discounted_years !== null && p.discounted_years !== undefined ? `${plain(p.discounted_years)} yıl` : "Süre içinde dönmüyor"),
      card("Net bugünkü değer (NBD)", money(n.npv)),
      card("İç verim oranı (İVO)", n.irr_pct !== null && n.irr_pct !== undefined ? `%${plain(n.irr_pct)}` : "Hesaplanamadı")),
    n.decision ? h("p", {}, "Karar: ", badge(n.decision, n.npv > 0 ? "ok" : "warn")) : null,
    dataTable([
      { key: "year", label: "Yıl", num: true },
      { key: "cash_flow", label: "Nakit akışı", num: true, render: (r) => money(r.cash_flow) },
      { key: "cumulative", label: "Kümülatif", num: true, render: (r) => money(r.cumulative) },
      { key: "discounted_cumulative", label: "İskontolu kümülatif", num: true, render: (r) => money(r.discounted_cumulative) },
    ], p.table || [], { caption: "Geri ödeme tablosu" }),
    notes.length ? h("ul", { class: "erp-meta" }, notes.map((x) => h("li", {}, x))) : null,
    metaLine(nv.meta));
}

function card(label, value) {
  return h("div", { class: "card" }, h("div", { class: "label" }, label), h("div", { class: "value" }, value));
}

/** Modül kurulu değilse: "Kur" → POST /api/modules/finans-hesap/install, iş bitene kadar izle, sonra hesaplamayı yeniden dene. */
function installCard(out, retry, refreshHead) {
  const btn = h("button", { type: "button", class: "btn primary" }, icon("download"), "Finans Hesap modülünü kur");
  const prog = progressBar("Kurulum");
  prog.el.hidden = true;
  const log = h("p", { class: "erp-meta", "aria-live": "polite" });
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    prog.el.hidden = false;
    let job;
    try {
      job = await api.post("/api/modules/finans-hesap/install", { target: "auto" });
    } catch {
      btn.disabled = false;
      return;
    }
    for (let i = 0; i < 600; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      let j;
      try { j = await api.get(`/api/jobs/${encodeURIComponent(job.job_id)}`, { quiet: true }); } catch { continue; }
      prog.set(j.progress, j.step);
      log.textContent = (j.log || []).slice(-1)[0] || "";
      if (j.status === "done") {
        toast("Finans Hesap kuruldu; hesaplama yeniden deneniyor.", "ok");
        if (refreshHead) await refreshHead();
        await retry();
        return;
      }
      if (j.status === "failed" || j.status === "cancelled") {
        fill(log, `Kurulum başarısız: ${j.error || j.status}`);
        btn.disabled = false;
        return;
      }
    }
  });
  return h("div", { class: "notice" }, h("p", {}, "Bu modül model indirmez (hesap motoru); kurulum kısa sürer."), btn, prog.el, log);
}

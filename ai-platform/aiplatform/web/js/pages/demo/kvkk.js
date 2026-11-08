// Demo ERP · KVKK Göstergesi: metni maskele (KVKK Kalkanı) ve denetim günlüğü özeti.
import { api } from "../../api.js";
import { badge, fill, fmt, h, icon, pretty } from "../../components.js";
import { aiWhere, dataTable, errorCard, modBadge, screenHead, setBusy } from "./ortak.js";

// Sentetik örnek: TCKN sağlama algoritmasına uygun, IBAN yaygın kullanılan örnek numaradır; gerçek kişi yoktur.
const SAMPLE = "Sayın Ayşe Örnek,\n12.11.2026 tarihli ödemeniz için TCKN 10000000146 ile kayıtlı hesabınıza (IBAN TR33 0006 1005 1978 6457 8413 26) "
  + "iade yapılacaktır. Sorularınız için 0532 000 00 00 numaralı telefondan veya ayse.ornek@ornek.test adresinden bize ulaşabilirsiniz.";

const TYPES = { TR_TCKN: "TC kimlik no", TR_IBAN: "IBAN", TR_PHONE: "Telefon", EMAIL_ADDRESS: "E-posta", PERSON: "Kişi adı", TR_VKN: "Vergi no", LOCATION: "Adres/yer", CREDIT_CARD: "Kart no" };

export async function render(box) {
  const ta = h("textarea", { id: "kv-text", rows: "6", style: "font-family:inherit;font-size:16px;min-height:150px" });
  ta.value = SAMPLE;
  const out = h("div", { "aria-live": "polite" });
  const sumBox = h("div", {});
  const btn = h("button", { type: "button", class: "btn primary ai" }, h("span", { class: "ai-tag", "aria-hidden": "true" }, "AI"), "Maskele");
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    setBusy(out, "Kişisel veriler aranıyor…");
    try {
      const r = await api.post("/api/kvkk/mask", { text: ta.value }, { quiet: true });
      const meta = r.meta || {};
      fill(out,
        h("h3", {}, "Maskeli metin (LLM'e yalnız bu gider)"),
        h("pre", { style: "font-size:15px" }, r.masked_text),
        h("p", { class: "erp-meta" }, `Motor: ${meta.engine || "—"} · Ad tanıma (NER): ${meta.ner || "—"}${meta.ner_reason ? ` (${meta.ner_reason})` : ""}`),
        dataTable([
          { key: "entity_type", label: "Tür", render: (f) => TYPES[f.entity_type] || f.entity_type },
          { key: "placeholder", label: "Yer tutucu", render: (f) => h("code", {}, f.placeholder) },
          { key: "source", label: "Bulan", render: (f) => (f.source === "kural" ? badge("kural (sağlama algoritması/desen)", "") : badge(f.source, "info")) },
          { key: "score", label: "Skor", num: true, render: (f) => fmt.num(f.score, 2) },
        ], r.findings || [], { caption: "Bulunan kişisel veriler", empty: "Kişisel veri bulunmadı." }),
        h("p", { class: "erp-meta" }, `Eşleme kimliği ${r.mapping_id}: gerçek değerler şifreli olarak yalnız bu makinede saklanır; yanıt gelince geri açılır.`));
      loadSummary(sumBox);
    } catch (e) {
      fill(out, errorCard(e, "kvkk-kalkani"));
    } finally {
      btn.disabled = false;
    }
  });
  fill(box,
    screenHead("KVKK Göstergesi", "Kişisel veriler dil modeline gitmeden maskelenir; her çağrı denetim günlüğüne yazılır.",
      aiWhere([
        { module: "kvkk-kalkani", text: "\"Maskele\": TCKN, IBAN, telefon, e-posta kurallarla (sağlama algoritması) bulunur; KVKK Kalkanı kuruluysa ad/adres de NER modeliyle yakalanır." },
        { module: null, text: "Kartlar AI değildir: denetim günlüğünden (audit_log) sayılır. İçerik değil, yalnız özet ve sayılar tutulur." },
      ])),
    h("div", { class: "erp-split even" },
      h("div", { class: "erp-panel" },
        h("div", { class: "row" }, h("h3", { class: "grow", style: "margin:0" }, "Metin"), h("span", {}, "KVKK Kalkanı: ", modBadge("kvkk-kalkani"))),
        h("div", { class: "field", style: "margin-top:.5rem" }, h("label", { for: "kv-text" }, "Müşteriye gidecek metin"), ta),
        h("div", { class: "row" }, btn, h("button", { type: "button", class: "btn", onclick: () => { ta.value = SAMPLE; } }, icon("refresh"), "Örnek metin")),
        out),
      h("div", { class: "erp-panel" }, h("h3", {}, "Denetim günlüğü özeti"), sumBox)));
  loadSummary(sumBox);
}

async function loadSummary(box) {
  setBusy(box, "Özet okunuyor…");
  let s;
  try {
    s = await api.get("/api/audit/summary", { quiet: true });
  } catch (e) {
    fill(box, errorCard(e));
    return;
  }
  const card = (label, value) => h("div", { class: "card" }, h("div", { class: "label" }, label), h("div", { class: "value" }, String(value)));
  fill(box,
    h("div", { class: "result-cards" },
      card("Toplam çağrı", fmt.num(s.total_calls, 0)),
      card("Maskelenen varlık", fmt.num(s.masked_entities_total, 0)),
      card("Hatalı çağrı", fmt.num(s.errors_total, 0))),
    dataTable([
      { key: "module", label: "Modül", render: (m) => h("code", {}, m.module) },
      { key: "calls", label: "Çağrı", num: true },
      { key: "masked_entities", label: "Maskelenen", num: true },
      { key: "errors", label: "Hata", num: true },
      { key: "avg_duration_ms", label: "Ort. süre (ms)", num: true, render: (m) => fmt.num(m.avg_duration_ms, 0) },
    ], s.modules || [], { caption: "Modül kullanımı", empty: "Henüz çağrı yok." }),
    h("p", { class: "erp-meta" }, h("a", { href: "#/denetim" }, "Tüm denetim günlüğü →")),
    s.available === false ? h("p", { class: "erp-meta" }, "Denetim modülü bu kurulumda yok.") : null,
    h("details", {}, h("summary", {}, "Ham yanıt"), pretty(s)));
}

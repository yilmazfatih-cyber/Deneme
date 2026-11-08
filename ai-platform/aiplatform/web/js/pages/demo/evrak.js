// Demo ERP · Gelen Evrak: kuyruk, önizleme, "AI ile oku" (Fatura Çıkarım), düzenlenebilir form, "ERP'ye öneri kayıt aç".
import { api } from "../../api.js";
import { badge, fill, h, icon, pretty } from "../../components.js";
import { aiButton, aiWhere, dataTable, errorCard, metaLine, modStatus, money, notice, screenHead, setBusy } from "./ortak.js";

const TUR = { fatura: "Fatura", irsaliye: "İrsaliye", sozlesme: "Sözleşme" };
const DURUM = { bekliyor: ["Bekliyor", ""], okundu: ["Okundu", "info"], onerildi: ["Önerildi", "warn"] };
const AP = { pending: ["Onay bekliyor", "warn"], executed: ["ERP'ye yazıldı", "ok"], rejected: ["Reddedildi", ""], failed: ["Başarısız", "fail"], approved: ["Onaylandı", "info"] };

const FIELDS = {
  fatura: [["belge_no", "Belge no"], ["tarih", "Tarih"], ["vade", "Vade"], ["satici_unvan", "Satıcı unvanı"], ["satici_vkn", "Satıcı VKN"],
    ["alici_unvan", "Alıcı unvanı"], ["alici_vkn", "Alıcı VKN"], ["ara_toplam", "Ara toplam"], ["kdv_toplam", "KDV toplamı"], ["genel_toplam", "Genel toplam"]],
  irsaliye: [["belge_no", "Belge no"], ["tarih", "Tarih"], ["sevk_tarihi", "Sevk tarihi"], ["gonderen_unvan", "Gönderen unvanı"], ["gonderen_vkn", "Gönderen VKN"],
    ["alici_unvan", "Alıcı unvanı"], ["alici_vkn", "Alıcı VKN"], ["plaka", "Plaka"], ["teslim_adresi", "Teslim adresi"]],
};
const LINE_COLS = [["aciklama", "Açıklama", false], ["miktar", "Miktar", true], ["birim_fiyat", "Birim fiyat", true], ["kdv_orani", "KDV %", true], ["tutar", "Tutar", true]];

let selectedId = null;
let showImage = false;

export async function render(box, { setup, refreshHead }) {
  const listBox = h("div", {});
  const work = h("div", {});
  fill(box,
    screenHead("Gelen Evrak", "Tedarikçilerden gelen faturalar, irsaliye ve sözleşme — okunmayı bekleyen kuyruk.",
      aiWhere([
        { module: "fatura-cikarim", text: "\"AI ile oku\": PDF metin katmanı (veya taranmış görüntüde OCR) + yerel dil modeli alanları ve kalemleri çıkarır; toplamlar, KDV ve VKN kodda doğrulanır (LLM gerekir)." },
        { module: "ozetleme", text: "Sözleşmede \"Özetle\": metin katmanı okunur, yönetici özeti yazılır (LLM gerekir)." },
        { module: null, text: "\"ERP'ye öneri kayıt aç\" AI değildir: insan onayı kaydı açar; onaylanmadan ERP'ye hiçbir şey yazılmaz." },
      ])),
    listBox, h("div", { style: "margin-top:1rem" }, work));
  await loadList(listBox, work, setup, refreshHead);
}

async function loadList(listBox, work, setup, refreshHead, reopen = true) {
  setBusy(listBox, "Kuyruk okunuyor…");
  let r;
  try {
    r = await api.get("/api/demo/evrak", { quiet: true });
  } catch (e) {
    fill(listBox, errorCard(e));
    return;
  }
  if (!r.items.length) {
    fill(listBox, h("div", { class: "empty" }, h("p", {}, "Kuyruk boş."), h("button", { type: "button", class: "btn primary", onclick: setup }, icon("db"), "Demo verisini kur")));
    fill(work, h("div", { class: "erp-panel" }, h("p", {}, "Demo verisi kurulunca 6 örnek evrak burada görünür.")));
    return;
  }
  if (!r.items.some((x) => x.id === selectedId)) selectedId = r.items[0].id;
  const reload = (again = true) => loadList(listBox, work, setup, refreshHead, again);
  fill(listBox, dataTable([
    { key: "id", label: "No", num: true },
    { key: "dosya_adi", label: "Dosya", render: (ev) => h("strong", {}, ev.dosya_adi) },
    { key: "tur", label: "Tür", render: (ev) => [badge(TUR[ev.tur] || ev.tur, "info"), ev.goruntu ? [" ", badge("+ tarama (PNG)", "")] : null] },
    { key: "durum", label: "Durum", render: (ev) => { const [dt, dk] = DURUM[ev.durum] || [ev.durum, ""]; return badge(dt, dk); } },
    { key: "onay", label: "ERP önerisi", render: (ev) => { const ap = ev.approval && AP[ev.approval.status]; return ap ? badge(ap[0], ap[1]) : "—"; } },
    { key: "aciklama", label: "Not", render: (ev) => h("span", { style: "color:var(--muted)" }, ev.aciklama || "") },
  ], r.items, {
    caption: "Gelen evrak kuyruğu",
    rowClass: (ev) => (ev.id === selectedId ? "is-selected" : ""),
    rowLabel: (ev) => `${ev.dosya_adi} evrakını aç`,
    onRow: (ev, tr) => {
      selectedId = ev.id;
      showImage = false;
      listBox.querySelectorAll("tr.is-selected").forEach((x) => x.classList.remove("is-selected"));
      tr.classList.add("is-selected");
      openEvrak(ev.id, work, reload);
    },
  }));
  if (reopen) openEvrak(selectedId, work, reload);
}

async function openEvrak(id, work, reload) {
  setBusy(work, "Evrak açılıyor…");
  let ev;
  try {
    ev = await api.get(`/api/demo/evrak/${id}`, { quiet: true });
  } catch (e) {
    fill(work, errorCard(e));
    return;
  }
  const pdfUrl = `/api/demo/evrak/${id}/file`;
  const preview = showImage
    ? h("img", { class: "erp-preview-img", src: `${pdfUrl}?goruntu=true`, alt: `${ev.dosya_adi} taranmış görüntüsü` })
    : pdfPreview(ev, pdfUrl);
  const toggle = ev.goruntu ? h("div", { class: "row", role: "group", "aria-label": "Önizleme türü" },
    h("button", { type: "button", class: `btn small ${showImage ? "" : "primary"}`, "aria-pressed": String(!showImage), onclick: () => { showImage = false; openEvrak(id, work, reload); } }, "PDF (metin katmanlı)"),
    h("button", { type: "button", class: `btn small ${showImage ? "primary" : ""}`, "aria-pressed": String(showImage), onclick: () => { showImage = true; openEvrak(id, work, reload); } }, "Taranmış görüntü (PNG)")) : null;
  const right = h("div", { class: "erp-panel" });
  fill(work, h("div", { class: "erp-split", style: "grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr)" },
    h("div", {}, h("div", { class: "row", style: "margin-bottom:.5rem" }, h("strong", { class: "grow" }, ev.dosya_adi), toggle,
      h("a", { class: "btn small", href: pdfUrl, target: "_blank", rel: "noopener" }, icon("link"), "PDF'i aç")), preview,
      ev.aciklama ? h("p", { class: "erp-meta" }, `Demo notu: ${ev.aciklama}`) : null),
    right));
  if (ev.tur === "sozlesme") renderContract(ev, right);
  else renderForm(ev, right, work, reload);
}

/** PDF önizleme: sunucuda çizilen sayfa görüntüleri; pypdfium2 yoksa tarayıcının PDF görüntüleyicisine (iframe) düşer. */
function pdfPreview(ev, pdfUrl) {
  const n = ev.sayfa_sayisi || 1;
  const wrap = h("div", { class: "erp-preview", style: "overflow:auto;background:var(--surface-2)", tabindex: "0", "aria-label": `${ev.dosya_adi} önizleme` });
  for (let p = 1; p <= n; p++) {
    const img = h("img", { src: `/api/demo/evrak/${ev.id}/sayfa/${p}.png`, alt: `${ev.dosya_adi} — sayfa ${p} / ${n}`, style: "width:100%;display:block;margin-bottom:6px;background:#fff" });
    img.addEventListener("error", () => {
      wrap.replaceWith(h("iframe", { class: "erp-preview", src: pdfUrl, title: `${ev.dosya_adi} önizleme` }));
    }, { once: true });
    wrap.append(img);
  }
  return wrap;
}

function renderContract(ev, right) {
  const out = h("div", { "aria-live": "polite" });
  const btn = aiButton("Özetle", "ozetleme", async () => {
    setBusy(out, "Sözleşme özetleniyor…");
    try {
      const r = await api.post(`/api/demo/evrak/${ev.id}/ozetle`, {}, { quiet: true });
      const res = r.result || {};
      fill(out, h("div", { class: "notice ok" }, h("strong", {}, "AI özeti"), h("p", {}, res.summary || "—"),
        (res.bullets || []).length ? h("ul", {}, res.bullets.map((b) => h("li", {}, b))) : null,
        (res.actions || []).length ? [h("strong", {}, "Takip edilecekler"), h("ul", {}, res.actions.map((b) => h("li", {}, b)))] : null),
      metaLine(r.meta), h("p", { class: "erp-meta" }, `Kaynak metin: ${r.kaynak_metin_uzunlugu} karakter (PDF metin katmanı).`));
    } catch (e) {
      fill(out, errorCard(e, "ozetleme"));
    }
  }, { needsLlm: true, primary: true });
  fill(right, h("h3", {}, "Tedarik sözleşmesi"),
    h("p", {}, "Sözleşmeler için alan çıkarımı yerine özet ve takip maddeleri üretilir."),
    h("div", { class: "row" }, btn), out);
}

function fieldInput(key, label, value) {
  const id = `ev-f-${key}`;
  return h("div", { class: "field" }, h("label", { for: id }, label), h("input", { type: "text", id, dataset: { key }, value: value ?? "" }));
}

function renderForm(ev, right, work, reload) {
  const tur = ev.tur;
  const c = ev.cikarim;
  const fields = (c && c.fields) || {};
  const lines = ((c && c.lines) || []).map((l) => ({ ...l }));
  const out = h("div", { "aria-live": "polite" });
  const formBox = h("div", {});
  const kaynak = h("select", { id: "ev-kaynak" },
    h("option", { value: "pdf" }, "PDF metin katmanı"), ev.goruntu ? h("option", { value: "goruntu" }, "Taranmış görüntü (OCR)") : null);
  if (showImage && ev.goruntu) kaynak.value = "goruntu";
  const readBtn = aiButton("AI ile oku", "fatura-cikarim", async () => {
    setBusy(out, kaynak.value === "goruntu" ? "OCR + dil modeli alanları çıkarıyor…" : "Metin katmanı okunuyor, dil modeli alanları çıkarıyor…");
    try {
      await api.post(`/api/demo/evrak/${ev.id}/oku`, { kaynak: kaynak.value }, { quiet: true });
      await reload();
    } catch (e) {
      fill(out, errorCard(e, "fatura-cikarim"));
    }
  }, { needsLlm: true, primary: !c });

  const linesBody = h("tbody", {});
  function drawLines() {
    fill(linesBody, lines.length ? lines.map((ln, i) => h("tr", {},
      LINE_COLS.map(([k, label, num]) => h("td", {}, h("input", { type: "text", class: `cell-input ${num ? "num" : ""}`, style: num ? "min-width:5.2rem" : "min-width:13rem", "aria-label": `${i + 1}. kalem ${label}`, value: ln[k] ?? "",
        oninput: (e) => { ln[k] = e.target.value; } }))),
      h("td", {}, h("button", { type: "button", class: "icon-btn", "aria-label": `${i + 1}. kalemi sil`, onclick: () => { lines.splice(i, 1); drawLines(); } }, icon("trash")))))
      : h("tr", {}, h("td", { colspan: String(LINE_COLS.length + 1), style: "color:var(--muted)" }, "Kalem yok.")));
  }
  drawLines();
  const linesTable = h("div", { class: "table-wrap" }, h("table", {}, h("caption", { class: "sr-only" }, "Kalemler"),
    h("thead", {}, h("tr", {}, LINE_COLS.map(([, l, num]) => h("th", { scope: "col", class: num ? "num" : "" }, l)), h("th", { scope: "col" }, h("span", { class: "sr-only" }, "İşlem")))),
    linesBody));
  const addLine = h("button", { type: "button", class: "btn small", onclick: () => { lines.push({ aciklama: "", miktar: "", birim_fiyat: "", kdv_orani: "", tutar: "" }); drawLines(); } }, icon("plus"), "Kalem ekle");

  const grid = h("div", { class: "erp-form-grid" }, (FIELDS[tur] || FIELDS.fatura).map(([k, l]) => fieldInput(k, l, fields[k])));
  const v = c && c.validation;
  const validationBox = v ? h("div", {},
    h("div", { class: "row" }, h("strong", { class: "grow" }, "Kodda doğrulama (AI değil)"),
      badge(v.ok ? `Tutarlı · ${v.passed}/${v.total}` : `Uyarı · ${v.passed}/${v.total}`, v.ok ? "ok" : "warn"),
      c.confidence !== undefined ? badge(`Güven %${Math.round(c.confidence * 100)}`, "info") : null),
    h("ul", { class: "check-list" }, (v.checks || []).map((ch) => h("li", { class: ch.ok ? "ok" : "warn" },
      icon(ch.ok ? "check" : "alert"), h("span", { class: "grow" }, ch.message),
      !ch.ok && ch.expected !== null && ch.expected !== undefined ? h("small", {}, `beklenen ${money(ch.expected)} · bulunan ${money(ch.found)}`) : null)))) : null;

  const proposeOut = h("div", { "aria-live": "polite" });
  const proposeBtn = h("button", { type: "button", class: "btn primary" }, icon("check"), "ERP'ye öneri kayıt aç");
  proposeBtn.addEventListener("click", async () => {
    const f = {};
    grid.querySelectorAll("input[data-key]").forEach((i) => { if (i.value.trim()) f[i.dataset.key] = i.value.trim(); });
    proposeBtn.disabled = true;
    setBusy(proposeOut, "Onay kaydı açılıyor…");
    try {
      const r = await api.post(`/api/demo/evrak/${ev.id}/oner`, { fields: f, lines: lines.filter((l) => Object.values(l).some((x) => String(x ?? "").trim())) }, { quiet: true });
      fill(proposeOut, h("div", { class: "notice ok" },
        h("strong", {}, "Onay kutusuna gönderildi. "), r.message,
        h("dl", { class: "kv", style: "margin:.4rem 0" },
          h("dt", {}, "Cari"), h("dd", {}, r.eslesme.cari ? `${r.eslesme.cari.unvan} (#${r.eslesme.cari.id}, ${r.eslesme.cari.yontem})` : "—"),
          h("dt", {}, "Kalemler"), h("dd", {}, r.eslesme.kalemler.map((k) => `${k.urun_kodu} × ${k.miktar}`).join(", ")),
          h("dt", {}, "Giriş"), h("dd", {}, r.manuel ? "Elle girildi (AI kullanılmadı)" : "AI çıkarımı + insan kontrolü"),
          h("dt", {}, "Onay no"), h("dd", { class: "mono" }, r.approval_id)),
        h("a", { class: "btn small", href: "#/demo/onay" }, "Onay Kutusu'na git")));
      reload(false); // yalnız kuyruk satırı güncellenir; bu sonuç kartı ekranda kalır
    } catch (e) {
      fill(proposeOut, errorCard(e), e.code === "mapping_incomplete" ? notice("Satıcı VKN'sini ve kalem açıklamasındaki ürün kodunu (URN-xxxx) kontrol edin.", "") : null);
      proposeBtn.disabled = false;
    }
  });
  const ap = ev.approval;
  const apNote = ap ? notice(ap.status === "executed" && ap.result ? `ERP'ye yazıldı: fatura #${ap.result.fatura_id}, durum "${ap.result.durum}", toplam ${money(ap.result.toplam)}.`
    : `Öneri kaydı: ${(AP[ap.status] || [ap.status])[0]} (onay ${ap.id.slice(0, 8)}…).`, ap.status === "executed" ? "ok" : ap.status === "rejected" ? "" : "warn") : null;
  const noAi = !c && modStatus("fatura-cikarim") !== "installed"
    ? h("div", { class: "notice warn" }, h("strong", {}, "Fatura Çıkarım modülü kurulu değil. "), "\"AI ile oku\" bu yüzden sunucunun hatasını gösterir. ",
      h("a", { href: "#/magaza/fatura-cikarim" }, "Mağaza'dan kur"), h("br"),
      h("small", {}, "AI olmadan da formu elle doldurup öneri kaydı açabilirsiniz (onay kaydında \"elle girildi\" yazar)."))
    : null;

  fill(right,
    h("h3", {}, `${TUR[tur] || tur} bilgileri`),
    h("div", { class: "row" }, h("label", { for: "ev-kaynak" }, "Kaynak"), kaynak, readBtn),
    out, noAi, apNote,
    c ? h("div", { class: "notice ok" }, h("strong", {}, "AI çıkarımı yüklendi. "), "Alanları kontrol edin; gerekirse düzeltin.") : null,
    c ? metaLine({ ...(c.meta || {}), source: (c.meta && c.meta.source) || c.kaynak }) : null,
    validationBox,
    grid,
    h("div", { class: "row", style: "margin:.6rem 0 .3rem" }, h("strong", { class: "grow" }, "Kalemler"), addLine),
    linesTable,
    tur === "fatura" ? h("div", { class: "row", style: "margin-top:.8rem" }, proposeBtn, h("small", { style: "color:var(--muted)" }, "İnsan onayı gerekir; onaysız yazma yok.")) : notice("İrsaliye ERP'ye fatura olarak önerilmez; teslim kontrolü için okunur.", ""),
    proposeOut,
    c ? h("details", {}, h("summary", {}, "Ham çıkarım (JSON)"), pretty({ fields: c.fields, lines: c.lines })) : null);
}

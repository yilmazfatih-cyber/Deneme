// ERP: bağlantılar (ekle, test, şema, sorgu), webhook adresi ve imza örneği, araç listesi.
import { api } from "../api.js";
import { badge, confirmDialog, emptyState, fill, fmt, h, icon, loading, notice, openDrawer, pageHead, pretty, table, toast } from "../components.js";

const READONLY_TEXT = "Örnek ERP dışındaki her bağlantı, ERP veritabanında YALNIZ SELECT yetkisi olan salt-okunur bir kullanıcıyla tanımlanmalıdır. "
  + "Platformun SQL denetimi (tek SELECT, tablo beyaz listesi, LIMIT, zaman aşımı) ikinci savunma hattıdır; tek başına yeterli değildir.";

export async function render(main) {
  const connBox = h("div", {}, loading());
  const hookBox = h("div", {}, loading());
  const toolBox = h("div", {}, loading());
  const demoBtn = h("button", { type: "button", class: "btn" }, icon("db"), "Örnek ERP'yi kur");
  demoBtn.addEventListener("click", async () => {
    demoBtn.disabled = true;
    try {
      await api.post("/api/erp/connections/demo");
      toast("Örnek ERP bağlantısı hazır (sentetik veri).", "ok");
      loadConnections(connBox);
      loadTools(toolBox);
    } finally {
      demoBtn.disabled = false;
    }
  });
  fill(main, 
    pageHead("ERP Entegrasyonu", "Salt-okunur veritabanı bağlantıları, REST araçları ve webhook.", demoBtn),
    notice(READONLY_TEXT, "warn", "Güvenlik:"),
    h("h2", {}, "Bağlantılar"), connBox,
    h("h2", {}, "Yeni bağlantı"), addForm(connBox, toolBox),
    h("h2", {}, "Webhook"), hookBox,
    h("h2", {}, "Araçlar"), h("p", { style: "color:var(--muted)" }, "İş akışı ajanının kullanabileceği araçlar. Okuma araçları serbest; yazma araçları insan onayına düşer."), toolBox);
  loadConnections(connBox);
  loadWebhook(hookBox);
  loadTools(toolBox);
}

async function loadConnections(box) {
  fill(box, loading());
  let data;
  try { data = await api.get("/api/erp/connections"); } catch { fill(box, emptyState("Bağlantılar alınamadı.")); return; }
  const items = data.items || [];
  if (!items.length) {
    fill(box, emptyState("Henüz ERP bağlantısı yok. Denemek için \"Örnek ERP'yi kur\" düğmesini kullanın ya da aşağıdan ekleyin."));
    return;
  }
  const kinds = { sql: ["SQL (salt-okunur)", "info"], rest: ["REST API", "info"], mock: ["Örnek ERP", "ok"] };
  fill(box, table([
    { key: "name", label: "Ad", render: (c) => [h("strong", {}, c.name), h("br"), h("code", { style: "color:var(--muted)" }, c.id)] },
    { key: "kind", label: "Tür", render: (c) => { const k = kinds[c.kind] || [c.kind, ""]; return [badge(k[0], k[1]), c.source === "ortam" ? [" ", badge("ortam değişkeni")] : null]; } },
    { key: "url", label: "Adres", render: (c) => h("code", {}, c.url) },
    { key: "allowed_tables", label: "İzinli tablolar", render: (c) => (c.allowed_tables.length ? c.allowed_tables.join(", ") : c.kind === "rest" ? "—" : badge("yok — sorgu çalışmaz", "warn")) },
    { key: "last_test", label: "Son test", render: (c) => (c.last_test_at ? [badge(c.last_test_ok ? "Başarılı" : "Başarısız", c.last_test_ok ? "ok" : "fail", { title: c.last_test_message || "" }), " ", fmt.date(c.last_test_at)] : "—") },
    { key: "actions", label: "İşlemler", render: (c) => h("div", { class: "row" },
      h("button", { type: "button", class: "btn small", onclick: () => testConn(c, box) }, "Test"),
      c.kind !== "rest" ? h("button", { type: "button", class: "btn small", onclick: () => showSchema(c) }, "Şema göster") : null,
      c.source !== "ortam" ? h("button", { type: "button", class: "btn small danger", "aria-label": `${c.name} bağlantısını sil`, onclick: () => delConn(c, box) }, icon("trash")) : null) },
  ], items, { caption: "ERP bağlantıları" }));
}

async function testConn(c, box) {
  const body = openDrawer(`Test: ${c.name}`, loading("Bağlantı deneniyor…"));
  let r;
  try { r = await api.post(`/api/erp/connections/${encodeURIComponent(c.id)}/test`); } catch { fill(body, emptyState("Test yapılamadı.")); return; }
  const caps = r.capabilities || {};
  fill(body, 
    notice(r.message, r.ok ? "ok" : "fail"),
    caps.note ? notice(caps.note, caps.read_only_enforcement === "kullanici" ? "warn" : "") : null,
    caps.validator ? h("p", {}, `Sorgu denetimi: ${caps.validator === "sqlglot" ? "sqlglot ayrıştırıcısı" : "anahtar kelime kara listesi (sqlglot kurulu değil)"}`) : null,
    (r.missing_tables || []).length ? notice(`Bulunamayan izinli tablolar: ${r.missing_tables.join(", ")}`, "warn") : null,
    (r.available_tables || []).length ? h("details", {}, h("summary", {}, `Veritabanındaki tablolar (${r.available_tables.length})`),
      h("p", { style: "color:var(--muted)" }, "Beyaz listeye yalnız gerekli tabloları ekleyin; kişisel veri içeren tabloları eklemekten kaçının."),
      h("div", { class: "chips" }, r.available_tables.map((t) => badge(t)))) : null);
  loadConnections(box);
}

async function showSchema(c) {
  const body = openDrawer(`Şema: ${c.name}`, loading("Şema okunuyor…"));
  let r;
  try { r = await api.get(`/api/erp/connections/${encodeURIComponent(c.id)}/schema`); } catch { fill(body, emptyState("Şema alınamadı.")); return; }
  const sql = h("textarea", { id: "erp-sql", spellcheck: "false", style: "min-height:90px" });
  sql.value = c.kind === "mock" ? "SELECT ay, tutar, adet FROM satis_aylik ORDER BY ay DESC" : "SELECT * FROM " + ((c.allowed_tables || [])[0] || "tablo");
  const out = h("div", { "aria-live": "polite" });
  const run = h("button", { type: "button", class: "btn primary" }, icon("play"), "Sorguyu çalıştır");
  run.addEventListener("click", async () => {
    run.disabled = true;
    fill(out, loading("Sorgu çalışıyor…"));
    try {
      const q = await api.post(`/api/erp/connections/${encodeURIComponent(c.id)}/query`, { sql: sql.value, max_rows: 100 }, { quiet: true });
      const cols = q.columns.map((name, i) => ({ key: String(i), label: name, render: (row) => (row[i] === null ? "NULL" : String(row[i])) }));
      fill(out, 
        h("p", {}, `${q.row_count} satır${q.truncated ? " (ilk 100 satır gösteriliyor)" : ""}.`),
        h("details", {}, h("summary", {}, "Çalıştırılan SQL"), pretty(q.sql)),
        table(cols, q.rows, { caption: "Sorgu sonucu", empty: "Sonuç boş." }));
    } catch (e) {
      fill(out, notice(e.message, "fail", "Sorgu reddedildi veya başarısız."), e.hint ? h("p", { style: "color:var(--muted)" }, e.hint) : null);
    } finally {
      run.disabled = false;
    }
  });
  fill(body, 
    h("p", { style: "color:var(--muted)" }, "Bu özet Doğal Dil → SQL modülünün istemine girer. Kişisel veri olabilecek sütunların örnek değerleri *** ile gizlenir."),
    pretty(r.summary),
    h("h3", {}, "Salt-okunur sorgu dene"),
    h("div", { class: "field" }, h("label", { for: "erp-sql" }, "SQL (tek SELECT)"), sql),
    run, out);
}

async function delConn(c, box) {
  if (!(await confirmDialog(`"${c.name}" bağlantısı silinsin mi? ERP'deki veriler etkilenmez.`, { okText: "Sil", danger: true }))) return;
  try {
    await api.del(`/api/erp/connections/${encodeURIComponent(c.id)}`);
    toast("Bağlantı silindi.", "ok");
    loadConnections(box);
  } catch { /* bildirim gösterildi */ }
}

function addForm(connBox, toolBox) {
  const name = h("input", { type: "text", id: "c-name", required: true, placeholder: "ör. Muhasebe veritabanı" });
  const kind = h("select", { id: "c-kind" }, h("option", { value: "sql" }, "SQL veritabanı (salt-okunur)"), h("option", { value: "rest" }, "REST API"));
  const url = h("input", { type: "text", id: "c-url", required: true, placeholder: "postgresql+psycopg://okuyucu:parola@sunucu/erp", style: "width:100%" });
  const tables = h("input", { type: "text", id: "c-tables", placeholder: "cari, fatura, stok", style: "width:100%" });
  const token = h("input", { type: "password", id: "c-token", autocomplete: "off" });
  const openapi = h("input", { type: "text", id: "c-openapi", placeholder: "/openapi.json" });
  const sqlFields = h("div", {}, h("div", { class: "field" }, h("label", { for: "c-tables" }, "İzinli tablolar"), tables,
    h("small", {}, "Virgülle ayırın. Liste boşsa hiçbir tablo sorgulanamaz. Şema adıyla yazılabilir: dbo.cari")));
  const restFields = h("div", { hidden: true },
    h("div", { class: "field" }, h("label", { for: "c-token" }, "Erişim belirteci"), token, h("small", {}, "Bearer başlığıyla gönderilir; şifreli saklanır. Yetkisi en dar kapsamda olmalı.")),
    h("div", { class: "field" }, h("label", { for: "c-openapi" }, "OpenAPI belgesi adresi"), openapi, h("small", {}, "GET uçları okuma, diğerleri onaylı yazma aracı olur.")));
  kind.addEventListener("change", () => {
    const rest = kind.value === "rest";
    sqlFields.hidden = rest;
    restFields.hidden = !rest;
    url.placeholder = rest ? "https://erp.sirket.local/api" : "postgresql+psycopg://okuyucu:parola@sunucu/erp";
  });
  const submit = h("button", { type: "submit", class: "btn primary" }, icon("plus"), "Bağlantı ekle");
  const form = h("form", { class: "card", "aria-label": "Yeni ERP bağlantısı" },
    h("div", { class: "row" }, h("div", { class: "field grow" }, h("label", { for: "c-name" }, "Ad"), name), h("div", { class: "field" }, h("label", { for: "c-kind" }, "Tür"), kind)),
    h("div", { class: "field" }, h("label", { for: "c-url" }, "Adres"), url, h("small", {}, "Parola şifreli saklanır, listede gizlenir. Kullanıcı yalnız SELECT yetkili olmalıdır.")),
    sqlFields, restFields, submit);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    submit.disabled = true;
    const body = { name: name.value.trim(), kind: kind.value, url: url.value.trim() };
    if (kind.value === "sql") body.allowed_tables = tables.value.split(",").map((t) => t.trim()).filter(Boolean);
    else {
      if (token.value) body.token = token.value;
      if (openapi.value.trim()) body.openapi_url = openapi.value.trim();
    }
    try {
      const c = await api.post("/api/erp/connections", body);
      toast(`"${c.name}" eklendi. Şimdi test edin.`, "ok");
      form.reset();
      kind.dispatchEvent(new Event("change"));
      loadConnections(connBox);
      loadTools(toolBox);
    } catch { /* bildirim gösterildi */ } finally {
      submit.disabled = false;
    }
  });
  return form;
}

async function loadWebhook(box) {
  let info;
  try { info = await api.get("/api/erp/webhooks?limit=20"); } catch { fill(box, emptyState("Webhook bilgisi alınamadı.")); return; }
  const url = info.url_template.replace("{source}", "yeni-fatura");
  const example = [
    "GOVDE='{\"belge_no\":\"F-0001\",\"tur\":\"fatura\"}'",
    "IMZA=$(printf '%s' \"$GOVDE\" | openssl dgst -sha256 -hmac \"$AIP_ERP_WEBHOOK_SECRET\" | sed 's/^.* //')",
    `curl -X POST '${url}' \\`,
    "  -H 'Content-Type: application/json' \\",
    "  -H \"X-Signature: sha256=$IMZA\" \\",
    "  --data \"$GOVDE\"",
  ].join("\n");
  const routes = Object.entries(info.routes || {});
  fill(box, 
    info.secret_configured ? notice("Webhook sırrı tanımlı; imzasız veya hatalı imzalı istekler reddedilir.", "ok")
      : notice("Webhook sırrı tanımlı değil: AIP_ERP_WEBHOOK_SECRET ortam değişkenini ayarlayın. Sır yokken webhook ucu 503 döner.", "warn"),
    h("dl", { class: "kv" },
      h("dt", {}, "Adres"), h("dd", {}, h("code", {}, info.url_template)),
      h("dt", {}, "İmza"), h("dd", {}, h("code", {}, info.signature_header))),
    h("h3", {}, "İmza örneği"), pretty(example),
    h("h3", {}, "Eşlemeler (webhook_routes.json)"),
    routes.length ? table([
      { key: "0", label: "Kaynak", render: (r) => h("code", {}, r[0]) },
      { key: "m", label: "Modül / eylem", render: (r) => `${r[1].module} / ${r[1].action}` },
      { key: "p", label: "Alan eşlemesi", render: (r) => (r[1].payload_map ? h("code", {}, JSON.stringify(r[1].payload_map)) : "gövdenin tamamı") },
    ], routes, { caption: "Webhook eşlemeleri" }) : emptyState("Eşleme tanımlı değil. Veri klasöründeki webhook_routes.json dosyasına kaynak → modül/eylem eşlemesi ekleyin."),
    h("h3", {}, "Son olaylar"),
    table([
      { key: "received_at", label: "Zaman", render: (e) => fmt.date(e.received_at) },
      { key: "source", label: "Kaynak" },
      { key: "signature_ok", label: "İmza", render: (e) => (e.signature_ok ? badge("Geçerli", "ok") : badge("Geçersiz", "fail")) },
      { key: "mapped", label: "Eşlenen", render: (e) => (e.mapped_module ? `${e.mapped_module} / ${e.mapped_action}` : "—") },
      { key: "status", label: "Durum", render: (e) => badge(e.status) },
      { key: "job_id", label: "İş / onay", render: (e) => (e.job_id ? h("code", {}, e.job_id.slice(0, 12)) : "—") },
    ], info.events || [], { caption: "Son webhook olayları", empty: "Henüz olay gelmedi." }));
}

async function loadTools(box) {
  const withModules = h("input", { type: "checkbox", id: "tools-mod" });
  async function load() {
    fill(list, loading());
    let r;
    try { r = await api.get(`/api/erp/tools?include_modules=${withModules.checked}`); } catch { fill(list, emptyState("Araçlar alınamadı.")); return; }
    fill(list, table([
      { key: "name", label: "Araç", render: (t) => h("code", {}, t.function.name) },
      { key: "desc", label: "Açıklama", render: (t) => t.function.description },
      { key: "kind", label: "Tür", render: (t) => (t.human_approval ? badge("Yazma — onay gerekir", "warn") : badge("Okuma", "ok")) },
      { key: "params", label: "Parametreler", render: (t) => h("details", {}, h("summary", {}, "Şema"), pretty(t.function.parameters)) },
    ], r.items || [], { caption: "Araç listesi", empty: "Araç yok. Önce bir ERP bağlantısı ekleyin." }));
  }
  const list = h("div", {});
  withModules.addEventListener("change", load);
  fill(box, h("label", { class: "check", for: "tools-mod", style: "margin-bottom:.6rem" }, withModules, "Platform modüllerinin eylemlerini de göster"), list);
  load();
}

// Mağaza: katalog modül kartları (pakete göre gruplu), filtreler, ayrıntı paneli, tek tık kurulum (SSE ilerleme).
import { api, asList, subscribe } from "../api.js";
import {
  badge, bar, closeDrawer, compatBadge, emptyState, fill, fmt, h, icon, loading, notice, openDrawer, pageHead, progressBar,
  table, tierBadge, toast,
} from "../components.js";

const state = { cards: null, q: "", pkg: "", tier: "", onlyOk: false, selected: null };
const modelCache = new Map();
const activeJobs = new Map(); // module_id → job_id

async function loadCards() {
  state.cards = asList(await api.get("/api/catalog/modules"));
}

function compatStatus(c) {
  return typeof c.compat === "string" ? c.compat : c.compat && c.compat.status;
}

function filtered() {
  const q = state.q.trim().toLocaleLowerCase("tr-TR");
  return state.cards.filter((c) => {
    if (state.pkg && c.package !== state.pkg) return false;
    if (state.tier && c.tier !== state.tier) return false;
    if (state.onlyOk && compatStatus(c) === "fail") return false;
    if (!q) return true;
    return [c.name, c.tagline, c.niche_code, c.id, c.package].join(" ").toLocaleLowerCase("tr-TR").includes(q);
  });
}

function card(c) {
  const st = compatStatus(c);
  const rec = c.compat && c.compat.recommendation;
  return h("button", {
    type: "button", class: `card clickable${state.selected === c.id ? " selected" : ""}`, dataset: { id: c.id },
    "aria-label": `${c.name} ayrıntıları`, onclick: () => { location.hash = `#/magaza/${encodeURIComponent(c.id)}`; },
  },
  h("div", { class: "meta" }, badge(c.niche_code, "code"), tierBadge(c.tier), compatBadge(st, rec),
    c.installed ? badge(c.enabled === false ? "Kurulu (pasif)" : "Kurulu", "info") : null,
    c.status === "beta" ? badge("beta") : c.status === "planned" ? badge("planlanan") : null),
  h("div", { class: "title" }, c.name),
  h("div", { class: "tagline" }, c.tagline),
  activeJobs.has(c.id) ? h("div", { class: "meta" }, badge("Kuruluyor…", "info")) : null);
}

function renderGrid(container) {
  const items = filtered();
  if (!items.length) {
    fill(container, emptyState("Aramanıza uyan modül yok. Filtreleri temizlemeyi deneyin."));
    return;
  }
  const groups = new Map();
  for (const c of items) {
    if (!groups.has(c.package)) groups.set(c.package, []);
    groups.get(c.package).push(c);
  }
  const out = [];
  for (const [pkg, list] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], "tr"))) {
    out.push(h("section", { "aria-label": pkg },
      h("h2", { class: "group-title" }, pkg, h("small", {}, `${list.length} modül`)),
      h("div", { class: "grid" }, list.sort((a, b) => a.niche_code.localeCompare(b.niche_code)).map(card))));
  }
  fill(container, ...out);
}

export async function render(main, params, { samePage } = {}) {
  if (!samePage || !state.cards) {
    fill(main, pageHead("Modül Mağazası", "Modülleri inceleyin, bu bilgisayara uygunluğunu görün ve tek tıkla kurun."), loading("Katalog yükleniyor…"));
    try {
      await loadCards();
    } catch {
      fill(main, pageHead("Modül Mağazası"), emptyState("Katalog alınamadı."));
      return;
    }
    const gridBox = h("div", { id: "store-grid" });
    const packages = [...new Set(state.cards.map((c) => c.package))].sort((a, b) => a.localeCompare(b, "tr"));
    const search = h("input", { type: "search", placeholder: "Modül ara (ad, niş kodu, paket)…", "aria-label": "Modül ara", value: state.q,
      oninput: (e) => { state.q = e.target.value; renderGrid(gridBox); } });
    const pkgSel = h("select", { "aria-label": "Paket", onchange: (e) => { state.pkg = e.target.value; renderGrid(gridBox); } },
      h("option", { value: "" }, "Tüm paketler"), packages.map((p) => h("option", { value: p, selected: state.pkg === p }, p)));
    const tierSel = h("select", { "aria-label": "Katman", onchange: (e) => { state.tier = e.target.value; renderGrid(gridBox); } },
      h("option", { value: "" }, "Tüm katmanlar"), ["T0", "T1", "T2", "T3"].map((t) => h("option", { value: t, selected: state.tier === t }, t)));
    const only = h("input", { type: "checkbox", id: "only-ok", checked: state.onlyOk, onchange: (e) => { state.onlyOk = e.target.checked; renderGrid(gridBox); } });
    const counts = { ok: 0, warn: 0, fail: 0 };
    state.cards.forEach((c) => { counts[compatStatus(c)] = (counts[compatStatus(c)] || 0) + 1; });
    fill(main, 
      pageHead("Modül Mağazası", `${state.cards.length} modül · ${counts.ok} kurulabilir, ${counts.warn} CPU'da yavaş, ${counts.fail} donanım yetersiz`),
      h("div", { class: "toolbar", role: "search" }, search, pkgSel, tierSel, h("label", { class: "check", for: "only-ok" }, only, "Yalnız kurulabilenler")),
      gridBox);
    renderGrid(gridBox);
  }
  const id = params[0];
  state.selected = id || null;
  document.querySelectorAll("#store-grid .card").forEach((el) => el.classList.toggle("selected", el.dataset.id === id));
  if (id) await openDetail(id);
  else closeDrawer();
}

async function fetchModel(id) {
  if (!modelCache.has(id)) modelCache.set(id, api.get(`/api/catalog/models/${encodeURIComponent(id)}`, { quiet: true }).catch(() => null));
  return modelCache.get(id);
}

function reqBars(totals) {
  const a = (totals && totals.after_install) || {};
  const out = [];
  if (a.vram_total_gb > 0) {
    out.push(bar({ label: "VRAM (kurulum sonrası)", value: a.vram_used_gb, max: a.vram_total_gb, prior: Math.max(0, a.vram_used_gb - (totals.vram_gb || 0)) }));
  } else {
    out.push(bar({ label: "VRAM", value: totals.vram_gb || 0, max: 0, note: "GPU yok", status: (totals.vram_gb || 0) > 0 ? "warn" : "ok" }));
  }
  if (a.ram_total_gb > 0) out.push(bar({ label: "RAM (kurulum sonrası)", value: a.ram_used_gb, max: a.ram_total_gb, prior: Math.max(0, a.ram_used_gb - (totals.ram_gb || 0)) }));
  if (a.disk_total_gb > 0) out.push(bar({ label: "Disk (kurulum sonrası doluluk)", value: a.disk_used_gb, max: a.disk_total_gb, prior: Math.max(0, a.disk_used_gb - (totals.disk_gb || 0)) }));
  out.push(h("p", { class: "muted", style: "font-size:.85rem;color:var(--muted)" },
    `Bu modül için: ${fmt.gb(totals.disk_gb)} disk, ${fmt.gb(totals.ram_gb)} RAM, ${fmt.gb(totals.vram_gb)} VRAM. Gri bölüm mevcut kullanım.`));
  return out;
}

function checksTable(checks) {
  const names = { vram: "VRAM", ram: "RAM", disk: "Disk", dependencies: "Bağımlılıklar", tier: "Katman", license: "Lisans", cpu: "İşlemci" };
  return table([
    { key: "id", label: "Kontrol", render: (c) => names[c.id] || c.id },
    { key: "status", label: "Durum", render: (c) => badge(...({ ok: ["Uygun", "ok"], warn: ["Uyarı", "warn"], fail: ["Yetersiz", "fail"] }[c.status] || [c.status, ""])) },
    { key: "message", label: "Açıklama" },
    { key: "required", label: "Gereken", num: true, render: (c) => (c.required === null || c.required === undefined ? "—" : fmt.num(c.required)) },
    { key: "available", label: "Mevcut", num: true, render: (c) => (c.available === null || c.available === undefined ? "—" : fmt.num(c.available)) },
  ], checks || [], { caption: "Gereksinim kontrolleri", rowClass: (c) => `check-${c.status}`, empty: "Kontrol sonucu yok." });
}

function componentsTable(spec, req) {
  const sel = new Map(((req && req.selected) || spec.resolved_components || []).map((s) => [s.role, s]));
  const where = { server: "Sunucu", client: "Bilgisayar", either: "İkisi de" };
  return table([
    { key: "role", label: "Rol" },
    { key: "model", label: "Model", render: (c) => c.model || "kütüphane" },
    { key: "artifact", label: "Biçim", render: (c) => { const s = sel.get(c.role); return s ? [s.artifact || "—", s.runtime ? ` (${s.runtime})` : ""].join("") : c.artifact || "otomatik"; } },
    { key: "target", label: "Çalıştığı yer", render: (c) => { const s = sel.get(c.role); return [where[c.target] || c.target, s && s.on_gpu ? " · GPU" : s ? " · CPU" : ""].join(""); } },
    { key: "disk", label: "Disk", num: true, render: (c) => { const s = sel.get(c.role); return s ? fmt.gb(s.disk_gb) : "—"; } },
    { key: "ram", label: "RAM", num: true, render: (c) => { const s = sel.get(c.role); return s ? fmt.gb(s.ram_gb) : c.ram_gb ? fmt.gb(c.ram_gb) : "—"; } },
    { key: "vram", label: "VRAM", num: true, render: (c) => { const s = sel.get(c.role); return s ? fmt.gb(s.vram_gb) : "—"; } },
    { key: "opt", label: "", render: (c) => [c.optional ? badge("isteğe bağlı") : null, sel.get(c.role) && sel.get(c.role).shared_already_installed ? badge("paylaşılan, kurulu", "ok") : null] },
  ], spec.components || [], { caption: "Bileşenler" });
}

async function licensesBlock(spec) {
  const ids = [...new Set((spec.components || []).map((c) => c.model).filter(Boolean))];
  const box = h("div", {}, loading("Lisanslar okunuyor…"));
  Promise.all(ids.map(fetchModel)).then((models) => {
    const rows = models.filter(Boolean).map((m) => ({ ...m }));
    const kinds = { permissive: ["Serbest", "ok"], conditional: ["Koşullu", "warn"], noncommercial: ["Ticari değil", "fail"] };
    fill(box, table([
      { key: "name", label: "Model", render: (m) => m.name || m.id },
      { key: "developer", label: "Geliştirici" },
      { key: "license", label: "Lisans" },
      { key: "license_class", label: "Sınıf", render: (m) => { const k = kinds[m.license_class] || [m.license_class, ""]; return badge(k[0], k[1]); } },
    ], rows, { caption: "Lisanslar", empty: "Model bileşeni yok (yalnız kütüphane)." }));
  });
  return box;
}

async function openDetail(id) {
  const body = openDrawer("Modül ayrıntısı", loading());
  let spec, req;
  try {
    [spec, req] = await Promise.all([
      api.get(`/api/catalog/modules/${encodeURIComponent(id)}`),
      api.get(`/api/catalog/modules/${encodeURIComponent(id)}/requirements?target=auto`, { quiet: true }).catch(() => null),
    ]);
  } catch {
    fill(body, emptyState("Modül bilgisi alınamadı."));
    return;
  }
  if (state.selected !== id) return;
  document.getElementById("drawer-title").textContent = spec.name;
  const reqBox = h("div", {});
  const withOpt = h("input", { type: "checkbox", id: "with-opt" });
  const hasOptional = (spec.components || []).some((c) => c.optional);

  function fillReq(r) {
    if (!r) { fill(reqBox, notice("Gereksinim raporu alınamadı.", "warn")); return; }
    const kind = { ok: "ok", warn: "warn", fail: "fail" }[r.status] || "";
    fill(reqBox, 
      notice(r.recommendation || "", kind, `${compatBadge(r.status).textContent} · hedef: ${r.target === "server" ? "sunucu" : r.target === "client" ? "bilgisayar" : r.target}.`),
      ...reqBars(r.totals || {}),
      checksTable(r.checks),
      (r.missing_dependencies || []).length
        ? h("div", {}, h("h3", {}, "Eksik bağımlılıklar"),
          h("p", {}, "Önce şu modüllerin kurulması gerekir:"),
          h("div", { class: "chips" }, r.missing_dependencies.map((d) => h("a", { href: `#/magaza/${encodeURIComponent(d)}`, class: "badge info" }, d))))
        : null,
      (r.skipped_optional || []).length ? h("p", { style: "color:var(--muted);font-size:.85rem" }, `İsteğe bağlı bileşenler dahil edilmedi: ${r.skipped_optional.join(", ")}`) : null);
  }
  fillReq(req);
  withOpt.addEventListener("change", async () => {
    fill(reqBox, loading("Gereksinimler yeniden hesaplanıyor…"));
    const r = await api.get(`/api/catalog/modules/${encodeURIComponent(id)}/requirements?target=auto&with_optional=${withOpt.checked}`, { quiet: true }).catch(() => null);
    fillReq(r);
    if (!spec.installed && !activeJobs.has(id) && r) {
      const nowBlocked = r.status === "fail";
      installBtn.disabled = nowBlocked;
      installBtn.lastChild.textContent = nowBlocked ? "Kurulamaz" : "Kur";
    }
  });

  const progressBox = h("div", { "aria-live": "polite" });
  const blocked = !spec.installed && req && req.status === "fail";
  const installBtn = h("button", { type: "button", class: "btn primary", disabled: spec.installed || activeJobs.has(id) || blocked,
    title: blocked ? "Donanım yetersiz: gereksinim kontrollerine bakın." : null },
  icon("download"), spec.installed ? "Kurulu" : activeJobs.has(id) ? "Kuruluyor…" : blocked ? "Kurulamaz" : "Kur");
  installBtn.addEventListener("click", () => startInstall(id, withOpt.checked, installBtn, progressBox));
  if (activeJobs.has(id)) followJob(id, activeJobs.get(id), installBtn, progressBox);

  const k = spec.kvkk || {};
  const approvals = (spec.actions || []).filter((a) => a.human_approval);
  const content = h("div", {},
    h("div", { class: "meta row", style: "margin:.6rem 0" }, badge(spec.niche_code, "code"), tierBadge(spec.tier), req ? compatBadge(req.status) : null,
      spec.installed ? badge("Kurulu", "info") : null, badge(spec.package)),
    h("p", { style: "font-weight:550" }, spec.tagline),
    h("p", {}, spec.description),
    (spec.roles || []).length ? h("div", { class: "chips", "aria-label": "Roller" }, h("span", { style: "color:var(--muted)" }, "Roller:"), spec.roles.map((r) => badge(r))) : null,
    h("div", { class: "card", style: "margin:1rem 0" },
      h("div", { class: "row" }, installBtn,
        hasOptional ? h("label", { class: "check", for: "with-opt" }, withOpt, "İsteğe bağlıları da kur") : null,
        spec.installed ? h("a", { href: "#/kurulu" }, "Kurulu modüllere git") : null),
      progressBox),
    h("h3", {}, "Bu bilgisayarda gereksinimler"), reqBox,
    h("h3", {}, "Bileşenler"), componentsTable(spec, req),
    h("h3", {}, "KVKK bildirimi"),
    h("dl", { class: "kv" },
      h("dt", {}, "Veri kategorileri"), h("dd", {}, (k.data_categories || []).length ? h("div", { class: "chips" }, k.data_categories.map((d) => badge(d))) : "—"),
      h("dt", {}, "Amaç"), h("dd", {}, k.purpose || "—"),
      h("dt", {}, "Maskeleme"), h("dd", {}, k.masking_required ? badge("Zorunlu — sunucuya maskeli gider", "ok") : badge("Gerekmez")),
      h("dt", {}, "Özel nitelikli veri"), h("dd", {}, k.special_categories ? badge("İşleyebilir", "warn") : "Hayır"),
      h("dt", {}, "Günlük saklama"), h("dd", {}, k.retention_days !== undefined ? `${k.retention_days} gün` : "—")),
    h("h3", {}, "ERP temas noktaları"),
    (spec.erp_touchpoints || []).length ? h("ul", {}, spec.erp_touchpoints.map((t) => h("li", {}, t))) : h("p", {}, "ERP ile doğrudan teması yok."),
    approvals.length ? notice(`ERP'ye yazan eylemler (${approvals.map((a) => a.name).join(", ")}) insan onayı kuyruğuna düşer; onaysız yazma yapılmaz.`, "warn") : null,
    h("h3", {}, "Eylemler"),
    table([
      { key: "id", label: "Kimlik", render: (a) => h("code", {}, a.id) },
      { key: "name", label: "Ad" },
      { key: "description", label: "Açıklama" },
      { key: "human_approval", label: "", render: (a) => (a.human_approval ? badge("Onay gerekir", "warn") : null) },
    ], spec.actions || [], { caption: "Eylemler" }),
    (spec.depends_on || []).length ? h("div", {}, h("h3", {}, "Bağımlılıklar"), h("div", { class: "chips" }, spec.depends_on.map((d) => h("a", { href: `#/magaza/${encodeURIComponent(d)}`, class: "badge" }, d)))) : null,
    h("h3", {}, "Lisanslar"), await licensesBlock(spec));
  if (state.selected === id) fill(body, content);
}

async function startInstall(id, withOptional, btn, box) {
  btn.disabled = true;
  btn.lastChild.textContent = "Başlatılıyor…";
  let r;
  try {
    r = await api.post(`/api/modules/${encodeURIComponent(id)}/install`, { target: "auto", with_optional: withOptional });
  } catch {
    btn.disabled = false;
    btn.lastChild.textContent = "Kur";
    return;
  }
  activeJobs.set(id, r.job_id);
  markCard(id);
  followJob(id, r.job_id, btn, box);
}

function markCard(id) {
  const grid = document.getElementById("store-grid");
  if (grid && state.cards) renderGrid(grid);
}

function followJob(id, jobId, btn, box) {
  const pb = progressBar("Kurulum");
  const logEl = h("div", { class: "log", "aria-label": "Kurulum günlüğü" });
  fill(box, pb.el, h("details", {}, h("summary", {}, "Günlük"), logEl));
  btn.disabled = true;
  btn.lastChild.textContent = "Kuruluyor…";
  const addLog = (line) => {
    logEl.append(document.createTextNode(line + "\n"));
    logEl.scrollTop = logEl.scrollHeight;
  };
  const stop = subscribe(`/api/jobs/${encodeURIComponent(jobId)}/events`, async (ev) => {
    if (ev.type === "snapshot") {
      pb.set(ev.progress, ev.step);
      (ev.log || []).forEach(addLog);
    } else if (ev.type === "progress") {
      pb.set(ev.progress, ev.step);
    } else if (ev.type === "log") {
      addLog(ev.line);
    } else if (ev.type === "end") {
      stop();
      activeJobs.delete(id);
      if (ev.status === "done") {
        pb.set(100, "Kurulum tamamlandı");
        toast("Kurulum tamamlandı.", "ok");
      } else {
        box.prepend(notice(ev.error || "Kurulum tamamlanamadı.", ev.status === "cancelled" ? "warn" : "fail", ev.status === "cancelled" ? "İptal edildi." : "Kurulum başarısız."));
        toast(ev.status === "cancelled" ? "Kurulum iptal edildi." : "Kurulum başarısız.", "fail", ev.error);
        btn.disabled = false;
        btn.lastChild.textContent = "Yeniden dene";
      }
      try {
        await loadCards();
        markCard(id);
        if (ev.status === "done" && state.selected === id) openDetail(id);
      } catch { /* bildirim zaten gösterildi */ }
    }
  }, () => {
    // bağlantı koptuysa son durumu tek seferde oku
    api.get(`/api/jobs/${encodeURIComponent(jobId)}`, { quiet: true }).then((j) => {
      if (j && ["done", "failed", "cancelled"].includes(j.status)) {
        stop();
        activeJobs.delete(id);
        pb.set(j.progress, j.step);
        btn.disabled = j.status === "done";
        btn.lastChild.textContent = j.status === "done" ? "Kurulu" : "Yeniden dene";
      }
    }).catch(() => {});
  });
}

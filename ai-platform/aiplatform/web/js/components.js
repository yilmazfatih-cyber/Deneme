// Ortak arayüz parçaları: öğe üretici, rozet, çubuk, tablo, bildirim, panel, boş/yükleniyor durumları.

/** Küçük DOM yardımcısı: h("div", {class: "x", onclick: fn}, "metin", child) */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "html") el.innerHTML = v; // yalnız sabit SVG için kullanılır
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** replaceChildren'ın null/false güvenli sürümü (DOM null'u "null" metnine çevirirdi). */
export function fill(el, ...children) {
  el.replaceChildren(...children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false));
  return el;
}

const ICONS = {
  check: "M5 12l5 5 9-10",
  x: "M6 6l12 12M18 6L6 18",
  alert: "M12 3l9 16H3L12 3zm0 6v4m0 3v.5",
  download: "M12 4v11m0 0l-4-4m4 4l4-4M5 20h14",
  play: "M7 5l12 7-12 7V5z",
  trash: "M4 7h16M9 7V4h6v3m-8 0l1 13h8l1-13",
  refresh: "M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7",
  plus: "M12 5v14M5 12h14",
  db: "M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zm0 0v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  shield: "M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3z",
};

export function icon(name, label) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  if (label) { svg.setAttribute("role", "img"); svg.setAttribute("aria-label", label); } else svg.setAttribute("aria-hidden", "true");
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", ICONS[name] || ICONS.alert);
  svg.append(p);
  return svg;
}

// ---- biçimlendirme
const nf1 = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });
export const fmt = {
  num: (n, d = 1) => (n === null || n === undefined || Number.isNaN(Number(n)) ? "—" : (d === 0 ? nf0 : nf1).format(Number(n))),
  gb: (n) => (n === null || n === undefined ? "—" : `${nf1.format(Number(n))} GB`),
  pct: (n) => (n === null || n === undefined ? "—" : `%${nf0.format(Number(n))}`),
  date: (s) => {
    if (!s) return "—";
    const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`);
    return Number.isNaN(d.getTime()) ? s : d.toLocaleString("tr-TR");
  },
};

// ---- rozetler
export function badge(text, kind = "", attrs = {}) {
  return h("span", { class: `badge ${kind}`, ...attrs }, text);
}

export const COMPAT = {
  ok: { kind: "ok", text: "Kurulabilir" },
  warn: { kind: "warn", text: "CPU'da yavaş" },
  fail: { kind: "fail", text: "Donanım yetersiz" },
};
export function compatBadge(status, title) {
  const c = COMPAT[status] || { kind: "", text: "Bilinmiyor" };
  return badge(c.text, c.kind, { title: title || c.text });
}

export const TIERS = {
  T0: "T0 — GPU'suz: CPU ve RAM ile çalışır; küçük modeller, sınıflandırma, hesap motoru.",
  T1: "T1 — Tek tüketici GPU (≈16–24 GB VRAM): orta boy modeller, OCR, konuşma tanıma.",
  T2: "T2 — Tek iş istasyonu/sunucu GPU'su (≈48 GB+ VRAM): ana model ve çok kullanıcı.",
  T3: "T3 — Çoklu GPU: büyük modeller, yüksek eş zamanlılık.",
};
export function tierBadge(tier) {
  return badge(tier || "?", "tier", { title: TIERS[tier] || "Donanım katmanı" });
}

export const STATUS_TEXT = {
  pending: ["Bekliyor", "warn"], approved: ["Onaylandı", "info"], rejected: ["Reddedildi", ""], executed: ["Uygulandı", "ok"], failed: ["Başarısız", "fail"],
  queued: ["Sırada", "info"], running: ["Çalışıyor", "info"], done: ["Bitti", "ok"], cancelled: ["İptal", ""],
  ok: ["Tamam", "ok"], error: ["Hata", "fail"], blocked: ["Engellendi", "fail"], pending_approval: ["Onay bekliyor", "warn"],
};
export function statusBadge(s) {
  const [t, k] = STATUS_TEXT[s] || [s || "—", ""];
  return badge(t, k);
}

// ---- çubuk: gereken/mevcut
export function bar({ label, value, max, prior = 0, unit = "GB", status, note }) {
  const realPct = max > 0 ? (value / max) * 100 : value > 0 ? 100 : 0;
  const pct = Math.min(100, realPct);
  const priorPct = max > 0 ? Math.min(100, (prior / max) * 100) : 0;
  const st = status || (realPct > 90 ? "fail" : realPct > 75 ? "warn" : "ok");
  const right = max > 0 ? `${fmt.num(value)} / ${fmt.num(max)} ${unit} (${fmt.pct(realPct)})` : `${fmt.num(value)} ${unit}${note ? " · " + note : ""}`;
  const track = h("div", { class: "track", role: "progressbar", "aria-label": label, "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(Math.round(pct)) },
    priorPct ? h("div", { class: "fill prior", style: `width:${priorPct}%` }) : null,
    h("div", { class: "fill", style: `width:${pct}%` }));
  return h("div", { class: `bar ${st}` }, h("div", { class: "bar-label" }, h("span", {}, label), h("span", {}, right)), track);
}

export function progressBar(label) {
  const fill = h("div", { class: "fill", style: "width:0%" });
  const track = h("div", { class: "track", role: "progressbar", "aria-label": label, "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": "0" }, fill);
  const text = h("span", {}, "%0");
  const step = h("span", {}, label);
  const el = h("div", { class: "bar accent" }, h("div", { class: "bar-label" }, step, text), track);
  return {
    el,
    set(pct, stepText) {
      const p = Math.max(0, Math.min(100, Number(pct) || 0));
      fill.style.width = `${p}%`;
      track.setAttribute("aria-valuenow", String(Math.round(p)));
      text.textContent = fmt.pct(p);
      if (stepText) step.textContent = stepText;
    },
  };
}

// ---- tablo
/** columns: [{key, label, num?, render?(row)}] */
export function table(columns, rows, { caption, rowClass, empty = "Kayıt yok." } = {}) {
  if (!rows || rows.length === 0) return emptyState(empty);
  const thead = h("thead", {}, h("tr", {}, columns.map((c) => h("th", { scope: "col", class: c.num ? "num" : "" }, c.label))));
  const tbody = h("tbody", {}, rows.map((r) => h("tr", { class: rowClass ? rowClass(r) : "" },
    columns.map((c) => {
      const v = c.render ? c.render(r) : r[c.key];
      return h("td", { class: c.num ? "num" : "" }, v === null || v === undefined || v === "" ? "—" : v);
    }))));
  return h("div", { class: "table-wrap" }, h("table", {}, caption ? h("caption", { class: "sr-only" }, caption) : null, thead, tbody));
}

export function emptyState(text, action) {
  return h("div", { class: "empty" }, h("p", {}, text), action || null);
}

export function loading(text = "Yükleniyor…") {
  return h("div", { class: "loading", role: "status" }, h("span", { class: "spinner", "aria-hidden": "true" }), text);
}

export function notice(text, kind = "", title) {
  return h("div", { class: `notice ${kind}`, role: kind === "fail" ? "alert" : null }, title ? h("strong", {}, title, " ") : null, text);
}

// ---- bildirim
export function toast(message, kind = "info", hint) {
  const box = document.getElementById("toasts");
  if (!box) return;
  const t = h("div", { class: `toast ${kind}` }, h("div", {}, message), hint ? h("div", { class: "hint" }, hint) : null);
  box.append(t);
  setTimeout(() => t.remove(), kind === "fail" ? 9000 : 5000);
}

// ---- sağ panel
let lastFocus = null;
export function openDrawer(title, content) {
  const d = document.getElementById("drawer");
  document.getElementById("drawer-title").textContent = title;
  const body = document.getElementById("drawer-body");
  fill(body, content);
  if (d.hidden) lastFocus = document.activeElement;
  d.hidden = false;
  d.setAttribute("aria-hidden", "false");
  document.getElementById("drawer-close").focus();
  return body;
}
export function closeDrawer() {
  const d = document.getElementById("drawer");
  if (d.hidden) return;
  d.hidden = true;
  d.setAttribute("aria-hidden", "true");
  if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
}
export function drawerOpen() {
  return !document.getElementById("drawer").hidden;
}

// ---- onay sorusu
export function confirmDialog(message, { okText = "Evet", cancelText = "Vazgeç", danger = false } = {}) {
  return new Promise((resolve) => {
    const dlg = h("dialog", { "aria-label": "Onay" },
      h("p", {}, message),
      h("div", { class: "row", style: "justify-content:flex-end;margin-top:1rem" },
        h("button", { class: "btn", type: "button", onclick: () => close(false) }, cancelText),
        h("button", { class: `btn ${danger ? "danger" : "primary"}`, type: "button", onclick: () => close(true) }, okText)));
    function close(v) { dlg.close(); dlg.remove(); resolve(v); }
    dlg.addEventListener("cancel", (e) => { e.preventDefault(); close(false); });
    document.body.append(dlg);
    dlg.showModal();
  });
}

export function pageHead(title, subtitle, ...actions) {
  return h("div", { class: "page-head" },
    h("div", {}, h("h1", { tabindex: "-1" }, title), subtitle ? h("p", {}, subtitle) : null),
    actions.length ? h("div", { class: "row" }, actions) : null);
}

export function pretty(obj) {
  return h("pre", {}, typeof obj === "string" ? obj : JSON.stringify(obj, null, 2));
}

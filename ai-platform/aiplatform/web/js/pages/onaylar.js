// Onaylar: ERP'ye yazan işlemler burada insan kararı bekler. Onaylanınca işlem çalışır, reddedilince hiçbir şey olmaz.
import { api } from "../api.js";
import { badge, confirmDialog, emptyState, fill, fmt, h, icon, loading, notice, pageHead, pretty, statusBadge, table, toast } from "../components.js";

let tab = "pending";

function changed() {
  window.dispatchEvent(new Event("aip:approvals-changed"));
}

export async function render(main) {
  const tabs = h("div", { class: "row", role: "tablist", "aria-label": "Onay listesi" },
    ["pending", "all"].map((t) => h("button", {
      type: "button", role: "tab", class: `btn ${tab === t ? "primary" : ""}`, "aria-selected": String(tab === t),
      onclick: () => { tab = t; render(main); },
    }, t === "pending" ? "Bekleyenler" : "Tümü")));
  const refresh = h("button", { type: "button", class: "btn", onclick: () => render(main) }, icon("refresh"), "Yenile");
  fill(main, pageHead("Onaylar", "ERP'ye yazan her işlem önce burada insan onayı bekler.", refresh), tabs, loading());
  let data;
  try {
    data = await api.get(`/api/approvals?${tab === "pending" ? "status=pending&" : ""}limit=200`);
  } catch {
    fill(main, pageHead("Onaylar"), tabs, emptyState("Onay listesi alınamadı."));
    return;
  }
  changed();
  const items = data.items || [];
  let content;
  if (tab === "pending") {
    content = items.length ? h("div", { style: "display:flex;flex-direction:column;gap:.85rem;margin-top:1rem" }, items.map((a) => pendingCard(a, main)))
      : h("div", { style: "margin-top:1rem" }, emptyState("Bekleyen onay yok."));
  } else {
    content = h("div", { style: "margin-top:1rem" }, table([
      { key: "created_at", label: "İstek", render: (a) => fmt.date(a.created_at) },
      { key: "module", label: "Modül / eylem", render: (a) => [h("strong", {}, a.module), " / ", h("code", {}, a.action)] },
      { key: "requested_by", label: "İsteyen" },
      { key: "status", label: "Durum", render: (a) => statusBadge(a.status) },
      { key: "decided_by", label: "Karar veren" },
      { key: "decided_at", label: "Karar", render: (a) => fmt.date(a.decided_at) },
      { key: "note", label: "Not" },
      { key: "result", label: "Sonuç", render: (a) => (a.result ? h("details", {}, h("summary", {}, a.result.ok ? "Başarılı" : "Hata"), pretty(a.result)) : "—") },
    ], items, { caption: "Tüm onay kayıtları", empty: "Kayıt yok." }));
  }
  fill(main, pageHead("Onaylar", "ERP'ye yazan her işlem önce burada insan onayı bekler.", refresh), tabs, content);
}

function describe(a) {
  if (a.module === "erp") return `ERP bağlantısı "${(a.payload || {}).connection_id}" üzerinde "${a.action}" yazma aracı`;
  return `${a.module} modülünün "${a.action}" eylemi`;
}

function pendingCard(a, main) {
  const noteId = `note-${a.id}`;
  const note = h("textarea", { id: noteId, rows: "2", style: "min-height:auto;font-family:inherit", placeholder: "Not (isteğe bağlı)" });
  const out = h("div", { "aria-live": "polite" });
  const approve = h("button", { type: "button", class: "btn primary" }, icon("check"), "Onayla");
  const reject = h("button", { type: "button", class: "btn danger" }, icon("x"), "Reddet");
  async function decide(decision) {
    if (decision === "approve" && !(await confirmDialog("Bu işlem ERP'ye yazılacak. Onaylıyor musunuz?", { okText: "Onayla" }))) return;
    approve.disabled = reject.disabled = true;
    try {
      const r = await api.post(`/api/approvals/${encodeURIComponent(a.id)}/decide`, { decision, note: note.value.trim() || null });
      if (r.status === "executed") toast("Onaylandı ve uygulandı.", "ok");
      else if (r.status === "failed") toast("Onaylandı ancak işlem başarısız oldu.", "fail", (r.result && r.result.error && r.result.error.message) || "");
      else toast("Reddedildi; hiçbir değişiklik yapılmadı.", "info");
      fill(out, statusBadge(r.status), r.result ? pretty(r.result) : null);
      changed();
      setTimeout(() => render(main), 1200);
    } catch {
      approve.disabled = reject.disabled = false;
    }
  }
  approve.addEventListener("click", () => decide("approve"));
  reject.addEventListener("click", () => decide("reject"));
  return h("article", { class: "card", "aria-label": `Onay ${a.id}` },
    h("div", { class: "row" }, h("strong", { class: "grow" }, describe(a)), badge("Bekliyor", "warn")),
    h("dl", { class: "kv", style: "margin:.4rem 0" },
      h("dt", {}, "İsteyen"), h("dd", {}, a.requested_by || "—"),
      h("dt", {}, "Zaman"), h("dd", {}, fmt.date(a.created_at)),
      h("dt", {}, "Kimlik"), h("dd", {}, h("code", {}, a.id))),
    h("details", { open: true }, h("summary", {}, "Yazılacak veri"), pretty(a.module === "erp" ? (a.payload || {}).args ?? a.payload : a.payload)),
    notice("Onaylarsanız işlem hemen çalışır ve sonucu bu kayda yazılır.", "warn"),
    h("div", { class: "field" }, h("label", { for: noteId }, "Not"), note),
    h("div", { class: "row" }, approve, reject), out);
}

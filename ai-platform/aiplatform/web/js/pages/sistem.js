// Sistem: donanım profili, katman, kapasite, "hangi modülleri çalıştırabilir?" tablosu (önbellekli).
import { api, asList, pool } from "../api.js";
import { badge, bar, compatBadge, emptyState, fill, fmt, h, icon, loading, pageHead, table, tierBadge, TIERS } from "../components.js";

const CACHE_KEY = "aip.sistem.uygunluk";
const CACHE_TTL_MS = 10 * 60 * 1000;

function hwCard(title, rows, extra) {
  return h("div", { class: "card" }, h("h3", { style: "margin-top:0" }, title),
    h("dl", { class: "kv" }, rows.filter(Boolean).flatMap(([k, v]) => [h("dt", {}, k), h("dd", {}, v === null || v === undefined || v === "" ? "—" : v)])), extra || null);
}
const yesNo = (v) => (v ? badge("Var", "ok") : badge("Yok"));

export async function render(main) {
  fill(main, pageHead("Sistem", "Bu bilgisayarın donanımı ve kapasitesi."), loading("Donanım taranıyor…"));
  let probe, cap;
  try {
    [probe, cap] = await Promise.all([api.get("/api/system/probe"), api.get("/api/system/capacity", { quiet: true }).catch(() => null)]);
  } catch {
    fill(main, pageHead("Sistem"), emptyState("Donanım bilgisi alınamadı."));
    return;
  }
  const rescan = h("button", { type: "button", class: "btn" }, icon("refresh"), "Yeniden tara");
  rescan.addEventListener("click", async () => {
    rescan.disabled = true;
    await api.get("/api/system/probe?refresh=true").catch(() => {});
    sessionStorage.removeItem(CACHE_KEY);
    render(main);
  });
  const cpu = probe.cpu || {};
  const ram = probe.ram_gb || {};
  const disk = probe.disk_gb || {};
  const gpus = probe.gpus || [];
  const cards = h("div", { class: "grid" },
    hwCard("İşlemci", [["Model", cpu.model], ["Çekirdek / iş parçacığı", `${cpu.cores ?? "—"} / ${cpu.threads ?? "—"}`], ["Mimari", cpu.arch],
      ["AVX2", yesNo(cpu.avx2)], ["AVX-512", yesNo(cpu.avx512)]]),
    hwCard("Bellek", [["Toplam", fmt.gb(ram.total)], ["Boş", fmt.gb(ram.available)], probe.unified_memory ? ["Birleşik bellek", badge("Evet", "info")] : null]),
    hwCard("GPU", gpus.length ? gpus.flatMap((g, i) => [[`GPU ${i + 1}`, `${g.vendor || ""} ${g.name || ""}`.trim()], ["VRAM", fmt.gb(g.vram_gb)], ["Sürücü / CUDA", `${g.driver || "—"} / ${g.cuda || "—"}`]]) : [["Durum", badge("GPU bulunamadı")]]),
    hwCard("Disk", [["Toplam", fmt.gb(disk.total)], ["Boş", fmt.gb(disk.free)], ["Konum", h("code", {}, disk.path || "—")]]),
    hwCard("Çalışma ortamı", [["Docker", yesNo(probe.docker && probe.docker.available)], ["Docker GPU", yesNo(probe.docker && probe.docker.gpu_runtime)],
      ["Ollama", probe.ollama && probe.ollama.available ? badge(`Var ${probe.ollama.version || ""}`, "ok") : badge("Yok")],
      ["NPU", probe.npu && probe.npu.present ? badge(probe.npu.name || "Var", "ok") : badge("Yok")]]),
    hwCard("Makine", [["Ad", probe.hostname], ["İşletim sistemi", `${probe.os || ""} ${probe.os_version || ""}`.trim()], ["Rol", probe.role === "client" ? "Çalışan bilgisayarı" : "Sunucu"]]));

  const capBox = h("div", {});
  if (cap) {
    const t = cap.total || {};
    const u = cap.used || {};
    capBox.append(
      bar({ label: "RAM — kurulu modüller", value: u.ram_gb || 0, max: t.ram_gb || 0 }),
      t.vram_gb > 0 ? bar({ label: "VRAM — kurulu modüller", value: u.vram_gb || 0, max: t.vram_gb }) : bar({ label: "VRAM", value: 0, max: 0, note: "GPU yok", status: "ok" }),
      bar({ label: "Disk doluluğu", value: (t.disk_gb || 0) - (cap.free_disk_gb ?? (cap.remaining || {}).disk_gb ?? 0), max: t.disk_gb || 0 }),
      h("p", { style: "color:var(--muted);font-size:.85rem" }, `Kurulu modellerin diski: ${fmt.gb(u.disk_gb)}; boş disk: ${fmt.gb(cap.free_disk_gb)}.`));
    if ((cap.installed || []).length) {
      capBox.append(table([
        { key: "model_id", label: "Model", render: (r) => r.model_id || r.model || r.id },
        { key: "artifact_id", label: "Biçim", render: (r) => r.artifact_id || r.artifact },
        { key: "disk_gb", label: "Disk", num: true, render: (r) => fmt.gb(r.disk_gb ?? r.size_gb) },
        { key: "ram_gb", label: "RAM", num: true, render: (r) => fmt.gb(r.ram_gb) },
        { key: "vram_gb", label: "VRAM", num: true, render: (r) => fmt.gb(r.vram_gb) },
      ], cap.installed, { caption: "Kurulu modeller" }));
    }
  } else capBox.append(emptyState("Kapasite bilgisi alınamadı."));

  const compatBox = h("div", {});
  const runBtn = h("button", { type: "button", class: "btn" }, icon("refresh"), "Yeniden denetle");
  runBtn.addEventListener("click", () => { sessionStorage.removeItem(CACHE_KEY); loadCompat(compatBox, runBtn); });

  fill(main, 
    pageHead("Sistem", "Bu bilgisayarın donanımı ve kapasitesi.", rescan),
    h("div", { class: "card", style: "margin-bottom:1rem" },
      h("div", { class: "row" }, h("strong", {}, "Donanım katmanı:"), tierBadge(probe.tier)),
      h("p", {}, TIERS[probe.tier] || ""),
      h("details", {}, h("summary", {}, "Katmanlar"), h("ul", {}, Object.values(TIERS).map((t) => h("li", {}, t))))),
    cards,
    h("h2", {}, "Kapasite"), capBox,
    h("div", { class: "page-head", style: "margin-top:1.5rem" }, h("h2", { style: "margin:0" }, "Bu bilgisayar hangi modülleri çalıştırabilir?"), runBtn),
    compatBox);
  loadCompat(compatBox, runBtn);
}

async function loadCompat(box, btn) {
  btn.disabled = true;
  let cached = null;
  try { cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null"); } catch { cached = null; }
  let rows;
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    rows = cached.rows;
  } else {
    fill(box, loading("Modüller denetleniyor…"));
    let mods;
    try { mods = asList(await api.get("/api/catalog/modules")); } catch { btn.disabled = false; fill(box, emptyState("Katalog alınamadı.")); return; }
    let done = 0;
    const status = h("div", { class: "loading", role: "status" }, h("span", { class: "spinner", "aria-hidden": "true" }), `0 / ${mods.length} modül denetlendi`);
    fill(box, status);
    const reports = await pool(mods, 4, async (m) => {
      const r = await api.get(`/api/catalog/modules/${encodeURIComponent(m.id)}/requirements?target=auto`, { quiet: true });
      done += 1;
      status.lastChild.textContent = `${done} / ${mods.length} modül denetlendi`;
      return r;
    });
    rows = mods.map((m, i) => {
      const r = reports[i] && !reports[i].__error ? reports[i] : null;
      return { id: m.id, niche_code: m.niche_code, name: m.name, tier: m.tier, installed: m.installed, status: r ? r.status : "?",
        totals: r ? r.totals : {}, recommendation: r ? r.recommendation : "Rapor alınamadı.", target: r ? r.target : "" };
    });
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), rows })); } catch { /* depolama dolu */ }
  }
  const order = { ok: 0, warn: 1, fail: 2 };
  rows.sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3) || a.niche_code.localeCompare(b.niche_code));
  const n = (s) => rows.filter((r) => r.status === s).length;
  fill(box, 
    h("div", { class: "stats" },
      h("div", { class: "card stat" }, h("span", { class: "value" }, String(n("ok"))), h("span", { class: "label" }, "Kurulabilir")),
      h("div", { class: "card stat" }, h("span", { class: "value" }, String(n("warn"))), h("span", { class: "label" }, "CPU'da yavaş / uyarılı")),
      h("div", { class: "card stat" }, h("span", { class: "value" }, String(n("fail"))), h("span", { class: "label" }, "Donanım yetersiz"))),
    table([
      { key: "niche_code", label: "Niş", render: (r) => badge(r.niche_code, "code") },
      { key: "name", label: "Modül", render: (r) => h("a", { href: `#/magaza/${encodeURIComponent(r.id)}` }, r.name) },
      { key: "tier", label: "Katman", render: (r) => tierBadge(r.tier) },
      { key: "status", label: "Durum", render: (r) => [compatBadge(r.status), r.installed ? badge("Kurulu", "info") : null] },
      { key: "target", label: "Hedef", render: (r) => (r.target === "server" ? "Sunucu" : r.target === "client" ? "Bilgisayar" : r.target) },
      { key: "ram", label: "RAM", num: true, render: (r) => fmt.gb((r.totals || {}).ram_gb) },
      { key: "vram", label: "VRAM", num: true, render: (r) => fmt.gb((r.totals || {}).vram_gb) },
      { key: "disk", label: "Disk", num: true, render: (r) => fmt.gb((r.totals || {}).disk_gb) },
      { key: "recommendation", label: "Öneri" },
    ], rows, { caption: "Modül uygunluk tablosu", rowClass: (r) => `check-${r.status}` }));
  btn.disabled = false;
}

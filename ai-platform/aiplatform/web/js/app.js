// Giriş noktası: yönlendirmeleri tanımlar, paneli ve bekleyen onay sayacını bağlar.
import { api } from "./api.js";
import { closeDrawer, drawerOpen } from "./components.js";
import { route, start } from "./router.js";

route("magaza", () => import("./pages/magaza.js"));
route("kurulu", () => import("./pages/kurulu.js"));
route("sistem", () => import("./pages/sistem.js"));
route("denetim", () => import("./pages/denetim.js"));
route("onaylar", () => import("./pages/onaylar.js"));
route("erp", () => import("./pages/erp.js"));
route("demo", () => import("./pages/demo.js"));

document.getElementById("drawer-close").addEventListener("click", () => {
  closeDrawer();
  if (location.hash.startsWith("#/magaza/")) history.replaceState(null, "", "#/magaza");
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && drawerOpen()) {
    closeDrawer();
    if (location.hash.startsWith("#/magaza/")) history.replaceState(null, "", "#/magaza");
  }
});

export async function refreshPendingCount() {
  const el = document.getElementById("pending-count");
  try {
    const r = await api.get("/api/approvals?status=pending&limit=1", { quiet: true });
    const n = r.total || 0;
    el.hidden = n === 0;
    el.textContent = String(n);
    el.setAttribute("aria-label", `${n} bekleyen onay`);
  } catch {
    el.hidden = true;
  }
}
window.addEventListener("aip:approvals-changed", refreshPendingCount);
refreshPendingCount();
setInterval(refreshPendingCount, 30000);

start();

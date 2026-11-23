// Oturum: /api/auth/me ile durumu öğrenir; giriş penceresi, üst çubukta kullanıcı rozeti, parola değiştirme.
// Kimlik doğrulama kapalıysa (yalnız 127.0.0.1'e bağlı tek kullanıcılı kurulum) hiçbir şey göstermez.
import { api } from "./api.js";
import { fill, h, notice, toast } from "./components.js";

export const session = { authEnabled: false, user: null, needsSetup: false };

export function isAdmin() {
  return !session.authEnabled || (session.user && session.user.role === "yonetici");
}

export function canApprove() {
  return !session.authEnabled || (session.user && ["onaylayici", "yonetici"].includes(session.user.role));
}

export async function loadSession() {
  try {
    const me = await api.get("/api/auth/me", { quiet: true });
    session.authEnabled = !!me.auth_enabled;
    session.user = me.user;
    session.needsSetup = !!me.needs_setup;
  } catch {
    session.authEnabled = false;
    session.user = null;
  }
  paintUserBox();
  return session;
}

function paintUserBox() {
  const box = document.getElementById("userbox");
  const usersLink = document.querySelector('.nav a[data-route="kullanicilar"]');
  if (usersLink) usersLink.hidden = !(session.authEnabled && isAdmin());
  if (!box) return;
  if (!session.authEnabled || !session.user) {
    fill(box);
    box.hidden = true;
    return;
  }
  box.hidden = false;
  const u = session.user;
  fill(box,
    h("span", { class: "userbox-name", title: `${u.username} · ${u.role_label}` }, u.username),
    h("span", { class: "badge" }, u.role_label),
    u.via === "session" ? h("button", { type: "button", class: "btn small", onclick: passwordDialog }, "Parola") : null,
    h("button", { type: "button", class: "btn small", onclick: logout }, "Çıkış"));
}

async function logout() {
  try { await api.post("/api/auth/logout", {}, { quiet: true }); } catch { /* yine de çık */ }
  session.user = null;
  paintUserBox();
  await requireLogin();
}

let loginOpen = null;

/** Oturum yoksa giriş penceresini açar; giriş yapılınca çözülür. */
export function requireLogin() {
  if (!session.authEnabled || session.user) return Promise.resolve(session.user);
  if (loginOpen) return loginOpen;
  loginOpen = new Promise((resolve) => {
    const err = h("div", { role: "alert" });
    const user = h("input", { type: "text", id: "login-user", autocomplete: "username", required: true, autocapitalize: "off", spellcheck: "false" });
    const pass = h("input", { type: "password", id: "login-pass", autocomplete: "current-password", required: true });
    const submit = h("button", { type: "submit", class: "btn primary" }, "Giriş yap");
    const form = h("form", { method: "dialog", class: "login-form" },
      h("h2", { style: "margin-top:0" }, "Yerel AI Platformu"),
      h("p", { class: "muted" }, "Devam etmek için şirket hesabınızla giriş yapın."),
      session.needsSetup
        ? notice("Henüz kullanıcı yok. Sunucuda ilk yöneticiyi oluşturun: aiplatform user add <ad> --role yonetici", "warn")
        : null,
      h("div", { class: "field" }, h("label", { for: "login-user" }, "Kullanıcı adı"), user),
      h("div", { class: "field" }, h("label", { for: "login-pass" }, "Parola"), pass),
      err,
      h("div", { class: "row", style: "justify-content:flex-end;margin-top:.5rem" }, submit));
    const dlg = h("dialog", { "aria-labelledby": "login-title", class: "login-dialog" }, form);
    form.querySelector("h2").id = "login-title";
    dlg.addEventListener("cancel", (e) => e.preventDefault()); // giriş yapılmadan kapanmaz
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      submit.disabled = true;
      fill(err);
      try {
        const r = await api.post("/api/auth/login", { username: user.value.trim(), password: pass.value }, { quiet: true });
        session.user = { ...r.user, via: "session" };
        dlg.close();
        dlg.remove();
        loginOpen = null;
        paintUserBox();
        toast(`Hoş geldiniz, ${r.user.display_name || r.user.username}.`, "ok");
        window.dispatchEvent(new Event("aip:logged-in"));
        resolve(session.user);
      } catch (ex) {
        fill(err, notice(ex.message, "fail"));
        pass.value = "";
        pass.focus();
      } finally {
        submit.disabled = false;
      }
    });
    document.body.append(dlg);
    dlg.showModal();
    user.focus();
  });
  return loginOpen;
}

function passwordDialog() {
  const cur = h("input", { type: "password", id: "pw-cur", autocomplete: "current-password", required: true });
  const n1 = h("input", { type: "password", id: "pw-new", autocomplete: "new-password", required: true, minlength: "10" });
  const n2 = h("input", { type: "password", id: "pw-new2", autocomplete: "new-password", required: true, minlength: "10" });
  const err = h("div", { role: "alert" });
  const form = h("form", { method: "dialog" },
    h("h2", { style: "margin-top:0" }, "Parola değiştir"),
    h("div", { class: "field" }, h("label", { for: "pw-cur" }, "Mevcut parola"), cur),
    h("div", { class: "field" }, h("label", { for: "pw-new" }, "Yeni parola"), n1, h("small", {}, "En az 10 karakter.")),
    h("div", { class: "field" }, h("label", { for: "pw-new2" }, "Yeni parola (tekrar)"), n2),
    err,
    h("div", { class: "row", style: "justify-content:flex-end;margin-top:.5rem" },
      h("button", { type: "button", class: "btn", onclick: () => { dlg.close(); dlg.remove(); } }, "Vazgeç"),
      h("button", { type: "submit", class: "btn primary" }, "Değiştir")));
  const dlg = h("dialog", { "aria-label": "Parola değiştir" }, form);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    fill(err);
    if (n1.value !== n2.value) {
      fill(err, notice("Yeni parolalar eşleşmiyor.", "fail"));
      return;
    }
    try {
      const r = await api.post("/api/auth/password", { current_password: cur.value, new_password: n1.value }, { quiet: true });
      dlg.close();
      dlg.remove();
      toast(r.message || "Parola değişti.", "ok");
    } catch (ex) {
      fill(err, notice(ex.message, "fail"));
    }
  });
  document.body.append(dlg);
  dlg.showModal();
  cur.focus();
}

// Herhangi bir istek 401 alırsa oturum düşmüştür: giriş penceresini aç.
window.addEventListener("aip:unauthenticated", () => {
  if (!session.authEnabled) return;
  session.user = null;
  paintUserBox();
  requireLogin().then(() => window.dispatchEvent(new Event("aip:logged-in")));
});

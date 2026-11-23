// Kullanıcılar ve API anahtarları (yalnız yönetici). Roller: Kullanıcı < Onaylayıcı < Yönetici.
import { api } from "../api.js";
import { badge, confirmDialog, emptyState, fill, fmt, h, icon, loading, notice, pageHead, table, toast } from "../components.js";
import { session } from "../auth.js";

const ROLE_HELP = {
  kullanici: "Modülleri çalıştırır, sonuçları görür.",
  onaylayici: "Ayrıca ERP'ye yazan işlemleri onaylar veya reddeder.",
  yonetici: "Ayrıca modül kurar, ERP bağlantısı ve kullanıcı yönetir, denetim günlüğünü görür.",
};
const ROLES = [["kullanici", "Kullanıcı"], ["onaylayici", "Onaylayıcı"], ["yonetici", "Yönetici"]];

export async function render(main) {
  if (!session.authEnabled) {
    fill(main, pageHead("Kullanıcılar"),
      notice("Kimlik doğrulama kapalı: platform yalnız bu bilgisayardan (127.0.0.1) erişilebilir ve tek kullanıcılı çalışıyor. "
        + "Ağa açmak için AIP_HOST=0.0.0.0 ile başlatın veya AIP_AUTH_MODE=on ayarlayın; ilk yöneticiyi "
        + "'aiplatform user add <ad> --role yonetici' ile oluşturun.", "info"));
    return;
  }
  fill(main, pageHead("Kullanıcılar", "Hesaplar, roller ve ERP entegrasyonu için API anahtarları."), loading());
  let users, tokens;
  try {
    [users, tokens] = await Promise.all([api.get("/api/auth/users"), api.get("/api/auth/tokens")]);
  } catch {
    fill(main, pageHead("Kullanıcılar"), emptyState("Liste alınamadı."));
    return;
  }
  const reload = () => render(main);
  fill(main,
    pageHead("Kullanıcılar", "Hesaplar, roller ve ERP entegrasyonu için API anahtarları.",
      h("button", { type: "button", class: "btn primary", onclick: () => userDialog(reload) }, icon("plus"), "Kullanıcı ekle")),
    h("dl", { class: "role-help" }, ROLES.map(([id, label]) => [h("dt", {}, label), h("dd", {}, ROLE_HELP[id])])),
    table([
      { key: "username", label: "Kullanıcı", render: (u) => [h("strong", {}, u.username), u.display_name ? h("div", { class: "muted" }, u.display_name) : null] },
      { key: "role", label: "Rol", render: (u) => roleSelect(u, reload) },
      { key: "disabled", label: "Durum", render: (u) => (u.disabled ? badge("Devre dışı", "fail") : badge("Etkin", "ok")) },
      { key: "last_login_at", label: "Son giriş", render: (u) => fmt.date(u.last_login_at) },
      { key: "actions", label: "İşlem", render: (u) => actions(u, reload) },
    ], users.items || [], { caption: "Kullanıcılar" }),
    h("h2", {}, "API anahtarları"),
    h("p", { class: "muted" }, "ERP entegrasyonu ve betikler 'Authorization: Bearer <anahtar>' başlığıyla çağırır. "
      + "İstemci düğümü anahtarı, çalışan bilgisayarlarındaki platformun sunucuya çalışan adına (yalnız Kullanıcı yetkisiyle) gitmesini sağlar."),
    h("div", { class: "row", style: "margin-bottom:.7rem" },
      h("button", { type: "button", class: "btn", onclick: () => tokenDialog(users.items || [], reload) }, icon("plus"), "Anahtar oluştur")),
    table([
      { key: "name", label: "Ad", render: (t) => [h("strong", {}, t.name), t.delegate ? [" ", badge("istemci düğümü", "info")] : null] },
      { key: "username", label: "Kullanıcı" },
      { key: "expires_at", label: "Bitiş", render: (t) => (t.expires_at ? fmt.date(t.expires_at) : "süresiz") },
      { key: "last_used_at", label: "Son kullanım", render: (t) => fmt.date(t.last_used_at) },
      { key: "revoke", label: "", render: (t) => h("button", { type: "button", class: "btn small danger", onclick: async () => {
        if (!(await confirmDialog(`"${t.name}" anahtarı iptal edilsin mi? Onu kullanan entegrasyon hemen durur.`, { okText: "İptal et", danger: true }))) return;
        try { await api.del(`/api/auth/tokens/${encodeURIComponent(t.id)}`); toast("Anahtar iptal edildi.", "ok"); reload(); } catch { /* bildirim gösterildi */ }
      } }, "İptal et") },
    ], tokens.items || [], { caption: "Etkin API anahtarları", empty: "Etkin API anahtarı yok." }));
}

function roleSelect(u, reload) {
  const sel = h("select", { "aria-label": `${u.username} rolü` }, ROLES.map(([id, label]) => h("option", { value: id, selected: u.role === id }, label)));
  sel.addEventListener("change", async () => {
    try {
      await api.patch(`/api/auth/users/${encodeURIComponent(u.username)}`, { role: sel.value });
      toast(`${u.username}: ${sel.selectedOptions[0].textContent}`, "ok");
    } catch {
      sel.value = u.role;
    }
    reload();
  });
  return sel;
}

function actions(u, reload) {
  const me = session.user && session.user.username === u.username;
  return h("div", { class: "row" },
    h("button", { type: "button", class: "btn small", onclick: () => resetPassword(u) }, "Parola sıfırla"),
    me ? null : h("button", { type: "button", class: `btn small ${u.disabled ? "ok" : "danger"}`, onclick: async () => {
      if (!u.disabled && !(await confirmDialog(`${u.username} devre dışı bırakılsın mı? Açık oturumları ve API anahtarları hemen iptal edilir.`, { okText: "Devre dışı bırak", danger: true }))) return;
      try { await api.patch(`/api/auth/users/${encodeURIComponent(u.username)}`, { disabled: !u.disabled }); reload(); } catch { /* bildirim */ }
    } }, u.disabled ? "Etkinleştir" : "Devre dışı bırak"));
}

function dialog(title, fields, onSubmit, submitText = "Kaydet") {
  const err = h("div", { role: "alert" });
  const form = h("form", { method: "dialog" },
    h("h2", { style: "margin-top:0" }, title), fields, err,
    h("div", { class: "row", style: "justify-content:flex-end;margin-top:.5rem" },
      h("button", { type: "button", class: "btn", onclick: () => { dlg.close(); dlg.remove(); } }, "Vazgeç"),
      h("button", { type: "submit", class: "btn primary" }, submitText)));
  const dlg = h("dialog", { "aria-label": title }, form);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    fill(err);
    try {
      const keep = await onSubmit();
      if (!keep) { dlg.close(); dlg.remove(); }
    } catch (ex) {
      fill(err, notice(ex.message, "fail", ex.hint ? undefined : undefined));
    }
  });
  document.body.append(dlg);
  dlg.showModal();
  const first = form.querySelector("input,select");
  if (first) first.focus();
  return { dlg, form };
}

function field(id, label, input, help) {
  input.id = id;
  return h("div", { class: "field" }, h("label", { for: id }, label), input, help ? h("small", {}, help) : null);
}

function userDialog(reload) {
  const username = h("input", { type: "text", required: true, autocapitalize: "off", spellcheck: "false", pattern: "[A-Za-z0-9._@\\-]{1,64}" });
  const display = h("input", { type: "text" });
  const role = h("select", {}, ROLES.map(([id, label]) => h("option", { value: id }, label)));
  const pass = h("input", { type: "password", required: true, minlength: "10", autocomplete: "new-password" });
  dialog("Kullanıcı ekle", [
    field("nu-name", "Kullanıcı adı", username, "İngilizce harf, rakam, . _ @ - ; ör. ayse.yilmaz"),
    field("nu-display", "Görünen ad", display, "Ad soyad (Türkçe karakter olabilir)"),
    field("nu-role", "Rol", role),
    field("nu-pass", "İlk parola", pass, "En az 10 karakter; kişiye güvenli kanaldan iletin, ilk girişte değiştirsin."),
  ], async () => {
    await api.post("/api/auth/users", { username: username.value.trim(), display_name: display.value.trim() || null, role: role.value, password: pass.value }, { quiet: true });
    toast("Kullanıcı eklendi.", "ok");
    reload();
  }, "Ekle");
}

function resetPassword(u) {
  const pass = h("input", { type: "password", required: true, minlength: "10", autocomplete: "new-password" });
  dialog(`${u.username} için yeni parola`, [field("rp-pass", "Yeni parola", pass, "Kişinin açık oturumları kapatılır.")], async () => {
    await api.patch(`/api/auth/users/${encodeURIComponent(u.username)}`, { password: pass.value }, { quiet: true });
    toast("Parola sıfırlandı.", "ok");
  }, "Sıfırla");
}

function tokenDialog(users, reload) {
  const name = h("input", { type: "text", required: true, maxlength: "128" });
  const user = h("select", {}, users.filter((u) => !u.disabled).map((u) => h("option", { value: u.username }, `${u.username} (${u.role_label})`)));
  const days = h("input", { type: "text", inputmode: "numeric", value: "365" });
  const delegate = h("input", { type: "checkbox", id: "nt-del" });
  const { form } = dialog("API anahtarı oluştur", [
    field("nt-name", "Ad", name, "Nerede kullanılacağı: ör. erp-entegrasyon, muhasebe-pc-03"),
    field("nt-user", "Bağlı kullanıcı", user, "Anahtar bu kullanıcının rolüyle çalışır."),
    field("nt-days", "Geçerlilik (gün)", days, "Boş bırakırsanız süresiz."),
    h("label", { class: "check", for: "nt-del" }, delegate, "İstemci düğümü (çalışan bilgisayarındaki platform için)"),
  ], async () => {
    const d = days.value.trim();
    const r = await api.post("/api/auth/tokens", { name: name.value.trim(), username: user.value, delegate: delegate.checked, days: d ? Number(d) : null }, { quiet: true });
    const out = h("input", { type: "text", readonly: true, value: r.token, style: "width:100%;font-family:var(--mono)" });
    fill(form,
      h("h2", { style: "margin-top:0" }, "Anahtar oluşturuldu"),
      notice("Bu anahtar yalnız şimdi gösterilir. Kopyalayıp ERP entegrasyonunun veya istemci düğümünün ayarına (AIP_SERVER_TOKEN) kaydedin.", "warn"),
      field("nt-out", "Anahtar", out),
      h("div", { class: "row", style: "justify-content:flex-end;margin-top:.5rem" },
        h("button", { type: "button", class: "btn", onclick: async () => { try { await navigator.clipboard.writeText(r.token); toast("Kopyalandı.", "ok"); } catch { out.select(); } } }, "Kopyala"),
        h("button", { type: "button", class: "btn primary", onclick: () => { form.closest("dialog").close(); form.closest("dialog").remove(); reload(); } }, "Tamam")));
    out.select();
    return true; // pencere açık kalsın
  }, "Oluştur");
}

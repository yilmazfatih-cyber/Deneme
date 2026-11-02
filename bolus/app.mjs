// Bölüş — arayüz. Sunucu yok; veri bu cihazın localStorage'ında durur.
import {
  parseAmount,
  formatAmount,
  computeShares,
  validatePayers,
  netBalances,
  pairwiseDebts,
  simplifyDebts,
  totals,
  uid,
  today,
  formatDate,
  formatNumber,
  normalizeGroup,
  CURRENCIES,
} from './hesap.mjs'

const STORAGE_KEY = 'bolus:v1'
const CATEGORIES = [
  ['market', '🛒', 'Market'],
  ['kira', '🏠', 'Kira'],
  ['fatura', '💡', 'Faturalar'],
  ['yemek', '🍽️', 'Yemek'],
  ['ulasim', '🚌', 'Ulaşım'],
  ['esya', '🛋️', 'Ev eşyası'],
  ['temizlik', '🧹', 'Temizlik'],
  ['eglence', '🎬', 'Eğlence'],
  ['saglik', '💊', 'Sağlık'],
  ['tatil', '✈️', 'Tatil'],
  ['diger', '📎', 'Diğer'],
]
const COLORS = ['#0f766e', '#b45309', '#1d4ed8', '#be185d', '#4d7c0f', '#7c3aed', '#c2410c', '#0369a1']
const SPLIT_LABELS = { equal: 'Eşit', exact: 'Tutar', percent: 'Yüzde', shares: 'Hisse' }

// ---------- Durum ----------
let state = load()

function emptyState() {
  return { version: 1, activeGroupId: null, groups: [], settings: { simplify: true } }
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyState()
    const s = JSON.parse(raw)
    if (!s || !Array.isArray(s.groups)) return emptyState()
    return sanitizeState(s)
  } catch {
    return emptyState()
  }
}

/** Dış kaynaktan gelen durumu güvenli hâle getirir: bozuk gruplar atılır. */
function sanitizeState(s) {
  const groups = []
  for (const g of s.groups) {
    try {
      groups.push(normalizeGroup(g))
    } catch {
      /* bozuk grup atlanır */
    }
  }
  const activeGroupId = groups.some((g) => g.id === s.activeGroupId) ? s.activeGroupId : groups[0]?.id || null
  return { version: 1, activeGroupId, groups, settings: { simplify: s.settings?.simplify !== false } }
}

let lastSaved = null

function save() {
  lastSaved = JSON.stringify(state)
  localStorage.setItem(STORAGE_KEY, lastSaved)
}

// Başka bir sekme/pencere kaydettiyse buradaki kopyayı tazele (üzerine yazma olmasın).
window.addEventListener('storage', (e) => {
  if (e.key !== STORAGE_KEY || e.newValue === lastSaved) return
  state = load()
  lastSaved = e.newValue
  if (!document.querySelector('form#f')) render()
})

function activeGroup() {
  return state.groups.find((g) => g.id === state.activeGroupId) || state.groups[0] || null
}

function memberName(group, id) {
  return group.members.find((m) => m.id === id)?.name || '—'
}

function memberColor(group, id) {
  const i = group.members.findIndex((m) => m.id === id)
  return COLORS[(i < 0 ? 0 : i) % COLORS.length]
}

function initials(name) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0] || '')
    .join('')
    .toLocaleUpperCase('tr-TR')
}

function category(id) {
  return CATEGORIES.find((c) => c[0] === id) || CATEGORIES[CATEGORIES.length - 1]
}

function esc(s) {
  return String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  )
}

function money(cents, opts) {
  return formatAmount(cents, activeGroup()?.currency || 'TRY', opts)
}

// ---------- Yönlendirme ----------
function route() {
  const h = location.hash.replace(/^#\/?/, '')
  const [path, query] = h.split('?')
  const parts = path.split('/').filter(Boolean)
  return { parts, query: new URLSearchParams(query || '') }
}

let renderedHash = null

function go(path) {
  const next = '#/' + path.replace(/^\/+/, '')
  if (location.hash !== next) location.hash = next
  // Hemen çiz; sonradan gelen hashchange aynı adres için tekrar çizmez (bildirimler silinmesin).
  render()
}

window.addEventListener('hashchange', () => {
  if (location.hash !== renderedHash) render()
})

// ---------- Yardımcı arayüz ----------
const app = document.getElementById('app')

function toast(text, { action, onAction, ms = 6000 } = {}) {
  document.querySelector('.toast')?.remove()
  const el = document.createElement('div')
  el.className = 'toast'
  el.setAttribute('role', 'status')
  el.innerHTML = `<span>${esc(text)}</span>${action ? `<button type="button">${esc(action)}</button>` : ''}`
  if (action) {
    el.querySelector('button').onclick = () => {
      onAction?.()
      el.remove()
    }
  }
  document.body.appendChild(el)
  setTimeout(() => el.remove(), ms)
}

function confirmDialog({ title, text, ok = 'Tamam', cancel = 'Vazgeç', danger = false, extra }) {
  return new Promise((resolve) => {
    const d = document.createElement('dialog')
    d.setAttribute('aria-labelledby', 'dlg-title')
    d.innerHTML = `<div class="body"><h3 id="dlg-title">${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}
      <div class="actions">
        <button type="button" class="btn" data-v="cancel">${esc(cancel)}</button>
        ${extra ? `<button type="button" class="btn" data-v="extra">${esc(extra)}</button>` : ''}
        <button type="button" class="btn ${danger ? 'danger' : 'primary'}" data-v="ok">${esc(ok)}</button>
      </div></div>`
    d.addEventListener('click', (e) => {
      const v = e.target.closest('button')?.dataset.v
      if (v) {
        d.close()
        resolve(v)
      }
    })
    d.addEventListener('close', () => {
      d.remove()
      resolve('cancel')
    })
    document.body.appendChild(d)
    d.showModal()
  })
}

function promptDialog({ title, text, value = '', placeholder = '', ok = 'Kaydet' }) {
  return new Promise((resolve) => {
    const d = document.createElement('dialog')
    d.setAttribute('aria-labelledby', 'dlg-title')
    d.innerHTML = `<form method="dialog" class="body"><h3 id="dlg-title">${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}
      <label class="field"><span class="sr-only">${esc(title)}</span>
      <input type="text" name="v" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off" required /></label>
      <div class="actions"><button type="button" class="btn" data-v="cancel">Vazgeç</button>
      <button type="submit" class="btn primary">${esc(ok)}</button></div></form>`
    const input = d.querySelector('input')
    d.querySelector('[data-v=cancel]').onclick = () => {
      d.close()
      resolve(null)
    }
    d.querySelector('form').onsubmit = (e) => {
      e.preventDefault()
      const v = input.value.trim()
      d.close()
      resolve(v || null)
    }
    d.addEventListener('close', () => {
      d.remove()
      resolve(null)
    })
    document.body.appendChild(d)
    d.showModal()
    input.focus()
    input.select()
  })
}

function header(title, { back, right = '' } = {}) {
  const g = activeGroup()
  const switcher =
    !back && state.groups.length > 0
      ? `<select id="group-switch" aria-label="Grup seç">
          ${state.groups.map((x) => `<option value="${x.id}" ${x.id === g?.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}
          <option value="__new">+ Yeni grup…</option>
        </select>`
      : ''
  return `<header class="top">
    ${back ? `<button type="button" id="back" aria-label="Geri">←</button>` : ''}
    <h1>${esc(switcher ? 'Bölüş' : title)}</h1>${switcher}${right}
  </header>`
}

function bottomNav(current) {
  const items = [
    ['', '🧾', 'Harcamalar'],
    ['bakiye', '⚖️', 'Bakiyeler'],
    ['kisiler', '👥', 'Kişiler'],
    ['ayarlar', '⚙️', 'Ayarlar'],
  ]
  return `<nav class="bottom" aria-label="Ana menü"><div class="inner">
    ${items
      .map(
        ([p, ico, label]) =>
          `<a href="#/${p}" ${current === p ? 'aria-current="page"' : ''}><span class="ico" aria-hidden="true">${ico}</span>${label}</a>`,
      )
      .join('')}
  </div></nav>`
}

/** Tıklanabilir satırları klavye ve ekran okuyucu için düğme gibi bağlar. */
function bindRows(selector, handler) {
  app.querySelectorAll(selector).forEach((row) => {
    row.setAttribute('role', 'button')
    row.setAttribute('tabindex', '0')
    row.addEventListener('click', () => handler(row))
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        handler(row)
      }
    })
  })
}

function avatar(group, id) {
  return `<span class="avatar" style="background:${memberColor(group, id)}" aria-hidden="true">${esc(initials(memberName(group, id)))}</span>`
}

// ---------- Ekranlar ----------
function render() {
  renderedHash = location.hash
  document.querySelector('.toast')?.remove()
  const { parts, query } = route()
  const g = activeGroup()
  if (parts[0] === 'al') return renderImportLink(query.get('v'))
  if (!g && parts[0] !== 'ayarlar') return renderWelcome()
  switch (parts[0]) {
    case undefined:
      return renderExpenses(g)
    case 'bakiye':
      return renderBalances(g)
    case 'kisiler':
      return renderMembers(g)
    case 'ayarlar':
      return renderSettings(g)
    case 'gider':
      return renderExpenseForm(g, parts[1] === 'yeni' ? null : parts[1], query)
    case 'odeme':
      return renderPaymentForm(g, parts[1] === 'yeni' ? null : parts[1], query)
    default:
      go('')
  }
}

function bindCommon() {
  document.getElementById('back')?.addEventListener('click', () => (history.length > 1 ? history.back() : go('')))
  document.getElementById('group-switch')?.addEventListener('change', async (e) => {
    if (e.target.value === '__new') {
      e.target.value = state.activeGroupId
      await createGroupFlow()
      return
    }
    state.activeGroupId = e.target.value
    save()
    render()
  })
}

async function createGroupFlow() {
  const name = await promptDialog({
    title: 'Yeni grup',
    text: 'Örn. Ev, Yazlık, Tatil',
    placeholder: 'Grup adı',
    ok: 'Oluştur',
  })
  if (!name) return
  const g = {
    id: uid(),
    name,
    currency: 'TRY',
    members: [],
    entries: [],
    meId: null,
    deleted: {},
    createdAt: Date.now(),
  }
  state.groups.push(g)
  state.activeGroupId = g.id
  save()
  go('kisiler')
  toast('Grup oluşturuldu. Şimdi kişileri ekleyin.')
}

function renderWelcome() {
  app.innerHTML = `${header('Bölüş')}<main>
    <div class="card">
      <div class="empty"><div class="big">🏠</div>
      <p><strong>Ev içi ortak harcamaları paylaşın.</strong></p>
      <p>Kim ne ödedi, kim kime ne kadar borçlu; tek bakışta.<br/>Sunucu yok, hesap yok; veri bu cihazda kalır.</p>
      <button type="button" class="btn primary block" id="new-group">Grup oluştur</button></div>
    </div>
    <div class="card"><h2>Nasıl çalışır?</h2>
      <div class="kv"><span>1. Grup</span><span class="muted">Ev, yazlık, tatil…</span></div>
      <div class="kv"><span>2. Kişiler</span><span class="muted">Evdekileri ekleyin</span></div>
      <div class="kv"><span>3. Harcama</span><span class="muted">Kim ödedi, nasıl bölünsün</span></div>
      <div class="kv"><span>4. Bakiyeler</span><span class="muted">Borçlar sadeleşir, ödeyince kapanır</span></div>
      <div class="kv"><span>5. Paylaş</span><span class="muted">Bağlantıyla evdekilere gönderin</span></div>
    </div>
    <div class="card"><button type="button" class="btn block" id="import-btn">Yedekten geri yükle</button></div>
  </main>`
  bindCommon()
  document.getElementById('new-group').onclick = createGroupFlow
  document.getElementById('import-btn').onclick = importFile
}

// --- Harcamalar ---
function entryLine(g, e) {
  const [, emoji] = category(e.category)
  const me = g.meId
  let side = ''
  if (e.kind === 'payment') {
    const from = Object.keys(e.payers)[0]
    const to = Object.keys(e.shares)[0]
    return `<div class="row link" data-id="${e.id}" data-kind="payment">
      <span class="emoji" aria-hidden="true">💸</span>
      <div class="grow"><div class="title">${esc(memberName(g, from))} → ${esc(memberName(g, to))} ödeme</div>
      <div class="sub">${formatDate(e.date)}${e.note ? ' · ' + esc(e.note) : ''}</div></div>
      <div class="amt">${money(e.amount)}</div></div>`
  }
  const payerIds = Object.keys(e.payers)
  const payerText = payerIds.length === 1 ? `${esc(memberName(g, payerIds[0]))} ödedi` : `${payerIds.length} kişi ödedi`
  if (me) {
    const paid = e.payers[me] || 0
    const share = e.shares[me] || 0
    const diff = paid - share
    if (diff > 0) side = `<span class="badge pos">size ${money(diff)} borçlu</span>`
    else if (diff < 0) side = `<span class="badge neg">borcunuz ${money(-diff)}</span>`
    else if (share) side = `<span class="badge">payınız ${money(share)}</span>`
    else side = `<span class="muted" style="font-size:13px">dahil değilsiniz</span>`
  }
  return `<div class="row link" data-id="${e.id}" data-kind="expense">
    <span class="emoji" aria-hidden="true">${emoji}</span>
    <div class="grow"><div class="title">${esc(e.description)}</div>
    <div class="sub">${formatDate(e.date)} · ${payerText} ${money(e.amount)}</div></div>
    <div style="text-align:right">${side}</div></div>`
}

function renderExpenses(g) {
  const { query } = route()
  const entries = [...g.entries].sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt))
  const t = totals(g.entries)
  const net = netBalances(
    g.entries,
    g.members.map((m) => m.id),
  )
  const mine = g.meId ? net[g.meId] || 0 : null

  const listHtml = (qRaw) => {
    const q = (qRaw || '').toLocaleLowerCase('tr-TR')
    const filtered = q
      ? entries.filter((e) =>
          [e.description, e.note, category(e.category)[2], ...Object.keys(e.payers).map((id) => memberName(g, id))]
            .join(' ')
            .toLocaleLowerCase('tr-TR')
            .includes(q),
        )
      : entries
    if (filtered.length === 0) {
      return `<div class="card"><div class="empty"><div class="big">🧾</div>
      ${entries.length === 0 ? '<p>Henüz harcama yok.</p><p class="muted">Sağ alttaki düğmeyle ilk harcamayı ekleyin.</p>' : '<p>Eşleşen harcama yok.</p>'}
      </div></div>`
    }
    let month = ''
    const chunks = []
    for (const e of filtered) {
      const m = e.date.slice(0, 7)
      if (m !== month) {
        if (month) chunks.push('</div>')
        month = m
        const [y, mo] = m.split('-').map(Number)
        const label = new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric' }).format(
          new Date(y, mo - 1, 1),
        )
        chunks.push(`<div class="month">${esc(label)}</div><div class="card" style="padding:4px 14px">`)
      }
      chunks.push(entryLine(g, e))
    }
    chunks.push('</div>')
    return chunks.join('')
  }
  const bindList = () =>
    bindRows('#list .row[data-id]', (row) =>
      go(`${row.dataset.kind === 'payment' ? 'odeme' : 'gider'}/${row.dataset.id}`),
    )

  app.innerHTML = `${header(g.name)}<main>
    ${
      g.members.length === 0
        ? `<div class="card"><p style="margin:0 0 10px">Önce evdekileri ekleyin.</p><a class="btn primary block" href="#/kisiler">Kişi ekle</a></div>`
        : ''
    }
    <div class="stats">
      <div class="stat"><div class="k">Toplam harcama</div><div class="v">${money(t.total)}</div></div>
      <div class="stat"><div class="k">${g.meId ? 'Bakiyeniz' : 'Harcama sayısı'}</div>
        <div class="v ${mine === null ? '' : mine > 0 ? 'pos' : mine < 0 ? 'neg' : ''}">${
          mine === null ? g.entries.filter((e) => e.kind !== 'payment').length : money(mine, { sign: true })
        }</div></div>
    </div>
    ${entries.length > 3 ? `<input type="search" id="q" placeholder="Ara: açıklama, kişi, kategori" value="${esc(query.get('q') || '')}" aria-label="Harcama ara" autocomplete="off" />` : ''}
    <div id="list">${listHtml(query.get('q'))}</div>
    ${g.members.length > 0 ? `<div class="actions"><a class="btn" href="#/odeme/yeni">💸 Ödeme kaydet</a></div>` : ''}
  </main>
  ${g.members.length > 0 ? `<button type="button" class="fab" id="fab">＋ Harcama ekle</button>` : ''}
  ${bottomNav('')}`
  bindCommon()
  document.getElementById('fab')?.addEventListener('click', () => go('gider/yeni'))
  document.getElementById('q')?.addEventListener('input', (e) => {
    const v = e.target.value
    history.replaceState(null, '', v ? `#/?q=${encodeURIComponent(v)}` : '#/')
    renderedHash = location.hash
    document.getElementById('list').innerHTML = listHtml(v)
    bindList()
  })
  bindList()
}

// --- Bakiyeler ---
function renderBalances(g) {
  const ids = g.members.map((m) => m.id)
  const net = netBalances(g.entries, ids)
  const simplify = state.settings.simplify
  const debts = simplify ? simplifyDebts(net) : pairwiseDebts(g.entries)
  const t = totals(g.entries)

  app.innerHTML = `${header(g.name)}<main>
    <div class="card"><h2>Kişi bakiyeleri</h2>
      ${
        ids.length === 0
          ? '<p class="muted">Henüz kişi yok.</p>'
          : ids
              .map((id) => {
                const v = net[id] || 0
                return `<div class="row">${avatar(g, id)}
                  <div class="grow"><div class="title">${esc(memberName(g, id))}${id === g.meId ? ' <span class="muted">(ben)</span>' : ''}</div>
                  <div class="sub">ödedi ${money(t.paid[id] || 0)} · payı ${money(t.share[id] || 0)}</div></div>
                  <div class="amt ${v > 0 ? 'pos' : v < 0 ? 'neg' : 'muted'}">${v === 0 ? 'ödeşti' : money(v, { sign: true })}</div></div>`
              })
              .join('')
      }
    </div>
    <div class="card"><h2>Kim kime ödeyecek?</h2>
      <div class="seg" role="group" aria-label="Görünüm" style="margin-bottom:10px">
        <button type="button" data-s="1" aria-pressed="${simplify}">Sadeleştirilmiş</button>
        <button type="button" data-s="0" aria-pressed="${!simplify}">Kişi kişiye</button>
      </div>
      ${
        debts.length === 0
          ? '<div class="empty"><div class="big">🤝</div><p>Herkes ödeşmiş.</p></div>'
          : debts
              .map(
                (d) => `<div class="row">
              <div class="grow"><div class="title">${esc(memberName(g, d.from))} <span class="debt-arrow">→</span> ${esc(memberName(g, d.to))}</div>
              <div class="sub">${esc(memberName(g, d.from))} borçlu</div></div>
              <div class="amt neg">${money(d.amount)}</div>
              <button type="button" class="btn small" data-settle="${d.from}|${d.to}|${d.amount}" aria-label="${esc(memberName(g, d.from))} → ${esc(memberName(g, d.to))} ${money(d.amount)} ödendi">Ödendi</button></div>`,
              )
              .join('')
      }
      <p class="hint">${simplify ? 'En az sayıda ödemeyle herkesin borcu kapanır.' : 'Her harcamadan doğan borçlar, kişi çiftleri arasında netleştirilmiş hâlde.'}</p>
    </div>
  </main>${bottomNav('bakiye')}`
  bindCommon()
  app.querySelectorAll('[data-s]').forEach((b) =>
    b.addEventListener('click', () => {
      state.settings.simplify = b.dataset.s === '1'
      save()
      render()
    }),
  )
  app.querySelectorAll('[data-settle]').forEach((b) =>
    b.addEventListener('click', () => {
      const [from, to, amount] = b.dataset.settle.split('|')
      go(`odeme/yeni?from=${from}&to=${to}&amount=${amount}`)
    }),
  )
}

// --- Kişiler ---
function renderMembers(g) {
  const t = totals(g.entries)
  app.innerHTML = `${header(g.name)}<main>
    <div class="card"><h2>Evdekiler</h2>
      ${g.members.length === 0 ? '<p class="muted">Henüz kimse yok. Aşağıdan ekleyin.</p>' : ''}
      ${g.members
        .map(
          (m) => `<div class="row">${avatar(g, m.id)}
          <div class="grow"><div class="title">${esc(m.name)}</div>
          <div class="sub">${t.paid[m.id] || t.share[m.id] ? `ödedi ${money(t.paid[m.id] || 0)} · payı ${money(t.share[m.id] || 0)}` : 'henüz harcaması yok'}</div></div>
          <label class="row" style="min-height:auto;gap:6px;font-size:13px"><input type="radio" name="me" value="${m.id}" aria-label="${esc(m.name)} benim" ${g.meId === m.id ? 'checked' : ''} /> ben</label>
          <button type="button" class="btn small" data-rename="${m.id}" aria-label="${esc(m.name)} adını değiştir">✏️</button>
          <button type="button" class="btn small danger" data-del="${m.id}" aria-label="${esc(m.name)} sil">🗑️</button></div>`,
        )
        .join('')}
      <form id="add-member" style="display:flex;gap:8px;margin-top:12px">
        <input type="text" name="name" placeholder="İsim (örn. Ayşe)" aria-label="Yeni kişi adı" autocomplete="off" required />
        <button type="submit" class="btn primary">Ekle</button>
      </form>
      <p class="hint">"ben" işaretlediğinizde harcama listesinde size göre borç/alacak görünür.</p>
    </div>
    <div class="card"><h2>Grup</h2>
      <div class="actions">
        <button type="button" class="btn" id="rename-group">Grup adını değiştir</button>
        <button type="button" class="btn danger" id="delete-group">Grubu sil</button>
      </div>
    </div>
  </main>${bottomNav('kisiler')}`
  bindCommon()
  document.getElementById('add-member').onsubmit = (e) => {
    e.preventDefault()
    const name = e.target.name.value.trim()
    if (!name) return
    if (g.members.some((m) => m.name.toLocaleLowerCase('tr-TR') === name.toLocaleLowerCase('tr-TR'))) {
      toast('Bu isimde biri zaten var.')
      return
    }
    g.members.push({ id: uid(), name })
    if (g.members.length === 1) g.meId = g.members[0].id
    save()
    render()
    document.querySelector('#add-member input')?.focus()
  }
  app.querySelectorAll('input[name=me]').forEach((r) =>
    r.addEventListener('change', () => {
      g.meId = r.value
      save()
      render()
    }),
  )
  app.querySelectorAll('[data-rename]').forEach((b) =>
    b.addEventListener('click', async () => {
      const m = g.members.find((x) => x.id === b.dataset.rename)
      const name = await promptDialog({ title: 'Adı değiştir', value: m.name })
      if (name) {
        m.name = name
        save()
        render()
      }
    }),
  )
  app.querySelectorAll('[data-del]').forEach((b) =>
    b.addEventListener('click', async () => {
      const id = b.dataset.del
      const m = g.members.find((x) => x.id === id)
      const used = g.entries.some((e) => id in e.payers || id in e.shares || (e.splitInput && id in e.splitInput))
      if (used) {
        await confirmDialog({
          title: 'Silinemez',
          text: `${m.name} harcamalarda geçiyor. Önce o harcamaları düzenleyin veya silin.`,
          ok: 'Tamam',
          cancel: 'Kapat',
        })
        return
      }
      const v = await confirmDialog({ title: `${m.name} silinsin mi?`, ok: 'Sil', danger: true })
      if (v !== 'ok') return
      g.members = g.members.filter((x) => x.id !== id)
      if (g.meId === id) g.meId = null
      g.deleted[id] = Date.now()
      save()
      render()
    }),
  )
  document.getElementById('rename-group').onclick = async () => {
    const name = await promptDialog({ title: 'Grup adı', value: g.name })
    if (name) {
      g.name = name
      save()
      render()
    }
  }
  document.getElementById('delete-group').onclick = async () => {
    const v = await confirmDialog({
      title: `"${g.name}" grubu silinsin mi?`,
      text: `${g.entries.length} kayıt ve ${g.members.length} kişi silinecek. Önce yedek almak isteyebilirsiniz.`,
      ok: 'Sil',
      danger: true,
    })
    if (v !== 'ok') return
    const backup = JSON.parse(JSON.stringify(state))
    state.groups = state.groups.filter((x) => x.id !== g.id)
    state.activeGroupId = state.groups[0]?.id || null
    save()
    go('')
    setTimeout(
      () =>
        toast('Grup silindi.', {
          action: 'Geri al',
          onAction: () => {
            state = backup
            save()
            render()
          },
        }),
      0,
    )
  }
}

// --- Harcama formu ---
function renderExpenseForm(g, id, query) {
  const existing = id ? g.entries.find((e) => e.id === id && e.kind !== 'payment') : null
  if (id && !existing) return go('')
  if (g.members.length === 0) return go('kisiler')
  const ids = g.members.map((m) => m.id)

  // Form durumu
  const f = existing
    ? {
        description: existing.description,
        amountText: (existing.amount / 100).toFixed(2).replace('.', ','),
        date: existing.date,
        category: existing.category,
        note: existing.note || '',
        multiPayer: Object.keys(existing.payers).length > 1,
        payer: Object.keys(existing.payers)[0],
        payers: Object.fromEntries(
          Object.entries(existing.payers).map(([k, v]) => [k, (v / 100).toFixed(2).replace('.', ',')]),
        ),
        splitType: existing.splitType,
        splitInput: Object.fromEntries(
          Object.entries(existing.splitInput)
            .filter(([k]) => ids.includes(k))
            .map(([k, v]) => [
              k,
              existing.splitType === 'exact' ? (v ? (v / 100).toFixed(2).replace('.', ',') : '') : v,
            ]),
        ),
      }
    : {
        description: '',
        amountText: '',
        date: today(),
        category: query.get('kategori') || 'market',
        note: '',
        multiPayer: false,
        payer: g.meId || ids[0],
        payers: {},
        splitType: 'equal',
        splitInput: Object.fromEntries(ids.map((i) => [i, true])),
      }

  app.innerHTML = `${header(existing ? 'Harcamayı düzenle' : 'Harcama ekle', { back: true })}<main>
    <form id="f" novalidate>
    <div class="card">
      <label class="field"><span>Açıklama</span>
        <input type="text" name="description" value="${esc(f.description)}" placeholder="Örn. Haftalık market" autocomplete="off" required /></label>
      <label class="field"><span>Tutar (${esc(g.currency)})</span>
        <input type="text" name="amount" class="amount" inputmode="decimal" value="${esc(f.amountText)}" placeholder="0,00" autocomplete="off" required /></label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <label class="field"><span>Tarih</span><input type="date" name="date" value="${esc(f.date)}" required /></label>
        <label class="field"><span>Kategori</span><select name="category">
          ${CATEGORIES.map(([k, e, l]) => `<option value="${k}" ${f.category === k ? 'selected' : ''}>${e} ${l}</option>`).join('')}
        </select></label>
      </div>
    </div>

    <div class="card"><h2>Kim ödedi?</h2>
      <div id="single-payer" class="${f.multiPayer ? 'hidden' : ''}">
        <select name="payer" aria-label="Ödeyen">
          ${g.members.map((m) => `<option value="${m.id}" ${f.payer === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}
        </select>
      </div>
      <div id="multi-payer" class="${f.multiPayer ? '' : 'hidden'}">
        ${g.members
          .map(
            (m) => `<div class="member-line">${avatar(g, m.id)}<span class="name">${esc(m.name)}</span>
          <input type="text" inputmode="decimal" data-payer="${m.id}" value="${esc(f.payers[m.id] || '')}" placeholder="0,00" aria-label="${esc(m.name)} ödedi" /></div>`,
          )
          .join('')}
        <p class="hint" id="payer-hint" aria-live="polite"></p>
      </div>
      <label class="row" style="margin-top:8px;gap:8px"><input type="checkbox" name="multiPayer" ${f.multiPayer ? 'checked' : ''} /> Birden fazla kişi ödedi</label>
    </div>

    <div class="card"><h2>Nasıl bölünsün?</h2>
      <div class="seg" role="group" aria-label="Bölüşme türü" style="margin-bottom:10px">
        ${Object.entries(SPLIT_LABELS)
          .map(([k, l]) => `<button type="button" data-split="${k}" aria-pressed="${f.splitType === k}">${l}</button>`)
          .join('')}
      </div>
      <div id="split-lines"></div>
      <p class="hint" id="split-hint" aria-live="polite"></p>
    </div>

    <div class="card">
      <label class="field"><span>Not (isteğe bağlı)</span><textarea name="note" placeholder="Fiş numarası, kim ne aldı…">${esc(f.note)}</textarea></label>
    </div>
    <p class="hint err" id="form-err" role="alert"></p>
    <div class="actions">
      ${existing ? `<button type="button" class="btn danger" id="del">Sil</button>` : ''}
      <button type="submit" class="btn primary">${existing ? 'Kaydet' : 'Ekle'}</button>
    </div>
    </form>
  </main>`
  bindCommon()
  const form = document.getElementById('f')

  const amountCents = () => parseAmount(form.amount.value) ?? 0

  function renderSplitLines() {
    const box = document.getElementById('split-lines')
    const type = f.splitType
    box.innerHTML = g.members
      .map((m) => {
        const v = f.splitInput[m.id]
        let control = ''
        if (type === 'equal')
          control = `<input type="checkbox" data-split-in="${m.id}" ${v ? 'checked' : ''} aria-label="${esc(m.name)} dahil" />`
        else if (type === 'exact')
          control = `<input type="text" inputmode="decimal" data-split-in="${m.id}" value="${esc(v ?? '')}" placeholder="0,00" aria-label="${esc(m.name)} payı" />`
        else if (type === 'percent')
          control = `<input type="number" inputmode="decimal" min="0" max="100" step="0.01" data-split-in="${m.id}" value="${esc(v ?? '')}" placeholder="%" aria-label="${esc(m.name)} yüzdesi" />`
        else
          control = `<input type="number" inputmode="numeric" min="0" step="1" data-split-in="${m.id}" value="${esc(v ?? '')}" placeholder="0" aria-label="${esc(m.name)} hissesi" />`
        return `<div class="member-line">${avatar(g, m.id)}<span class="name">${esc(m.name)}</span>
          <span class="calc" data-calc="${m.id}"></span>${control}</div>`
      })
      .join('')
    box.querySelectorAll('[data-split-in]').forEach((el) => {
      el.addEventListener('input', () => {
        f.splitInput[el.dataset.splitIn] = el.type === 'checkbox' ? el.checked : el.value
        updatePreview()
      })
    })
    updatePreview()
  }

  function currentShares() {
    const amount = amountCents()
    const input = { ...f.splitInput }
    if (f.splitType === 'exact') for (const k of Object.keys(input)) input[k] = parseAmount(input[k]) ?? 0
    return computeShares({ amount, splitType: f.splitType, splitInput: input })
  }

  function updatePreview() {
    const amount = amountCents()
    const hint = document.getElementById('split-hint')
    try {
      const shares = currentShares()
      for (const m of g.members) {
        const el = form.querySelector(`[data-calc="${m.id}"]`)
        if (el) el.textContent = shares[m.id] ? money(shares[m.id]) : ''
      }
      if (f.splitType === 'equal') {
        const n = Object.values(f.splitInput).filter(Boolean).length
        const base = n ? Math.floor(amount / n) : 0
        const extra = n ? amount - base * n : 0
        hint.textContent = n
          ? `${n} kişi · kişi başı ${money(base)}${extra ? ` (${extra} kişiye +${formatNumber(1)})` : ''}`
          : 'En az bir kişi seçin'
      } else if (f.splitType === 'exact') {
        const sum = Object.values(f.splitInput).reduce((a, v) => a + (parseAmount(v) ?? 0), 0)
        hint.textContent = `Girilen ${money(sum)} · kalan ${money(amount - sum)}`
      } else if (f.splitType === 'percent') {
        const sum = Math.round(Object.values(f.splitInput).reduce((a, v) => a + (Number(v) || 0), 0) * 100) / 100
        const pct = (x) => String(Math.round(x * 100) / 100).replace('.', ',')
        hint.textContent = `Toplam %${pct(sum)} · kalan %${pct(100 - sum)}`
      } else {
        const sum = Object.values(f.splitInput).reduce((a, v) => a + (Number(v) || 0), 0)
        hint.textContent = `Toplam ${sum} hisse`
      }
      hint.classList.remove('err')
    } catch (err) {
      form.querySelectorAll('[data-calc]').forEach((el) => (el.textContent = ''))
      hint.textContent = err.message
      hint.classList.add('err')
    }
    // Ödeyenler
    const ph = document.getElementById('payer-hint')
    if (f.multiPayer) {
      const sum = Object.values(f.payers).reduce((a, v) => a + (parseAmount(v) ?? 0), 0)
      ph.textContent = `Ödenen ${money(sum)} · kalan ${money(amount - sum)}`
      ph.classList.toggle('err', sum !== amount)
    }
  }

  form.amount.addEventListener('input', updatePreview)
  form.multiPayer.addEventListener('change', () => {
    f.multiPayer = form.multiPayer.checked
    document.getElementById('single-payer').classList.toggle('hidden', f.multiPayer)
    document.getElementById('multi-payer').classList.toggle('hidden', !f.multiPayer)
    if (f.multiPayer && Object.keys(f.payers).length === 0) {
      f.payers[form.payer.value] = form.amount.value
      form.querySelector(`[data-payer="${form.payer.value}"]`).value = form.amount.value
    }
    updatePreview()
  })
  form.querySelectorAll('[data-payer]').forEach((el) =>
    el.addEventListener('input', () => {
      f.payers[el.dataset.payer] = el.value
      updatePreview()
    }),
  )
  form.querySelectorAll('[data-split]').forEach((b) =>
    b.addEventListener('click', () => {
      const type = b.dataset.split
      if (type === f.splitType) return
      f.splitType = type
      if (type === 'equal') f.splitInput = Object.fromEntries(ids.map((i) => [i, true]))
      else if (type === 'shares') f.splitInput = Object.fromEntries(ids.map((i) => [i, 1]))
      else f.splitInput = {}
      form.querySelectorAll('[data-split]').forEach((x) => x.setAttribute('aria-pressed', x === b))
      renderSplitLines()
    }),
  )
  renderSplitLines()

  form.onsubmit = (e) => {
    e.preventDefault()
    const err = document.getElementById('form-err')
    err.textContent = ''
    form.amount.classList.remove('err')
    try {
      const description = form.description.value.trim()
      if (!description) throw new Error('Açıklama yazın.')
      const amount = parseAmount(form.amount.value)
      if (!amount || amount <= 0) {
        form.amount.classList.add('err')
        throw new Error('Geçerli bir tutar girin (örn. 250,50).')
      }
      if (!form.date.value) throw new Error('Tarih seçin.')
      let payers
      if (f.multiPayer) {
        payers = {}
        for (const [k, v] of Object.entries(f.payers)) {
          const c = parseAmount(v) ?? 0
          if (c) payers[k] = c
        }
        validatePayers(amount, payers)
      } else {
        payers = { [form.payer.value]: amount }
      }
      const splitInput = { ...f.splitInput }
      if (f.splitType === 'exact')
        for (const k of Object.keys(splitInput)) splitInput[k] = parseAmount(splitInput[k]) ?? 0
      const shares = computeShares({ amount, splitType: f.splitType, splitInput })
      if (Object.keys(shares).length === 0) throw new Error('En az bir kişi harcamaya dahil olmalı.')
      const now = Date.now()
      const entry = {
        id: existing?.id || uid(),
        kind: 'expense',
        description,
        amount,
        date: form.date.value,
        category: form.category.value,
        note: form.note.value.trim(),
        payers,
        splitType: f.splitType,
        splitInput: f.splitType === 'exact' ? splitInput : { ...f.splitInput },
        shares,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      }
      if (existing) g.entries = g.entries.map((x) => (x.id === existing.id ? entry : x))
      else g.entries.push(entry)
      save()
      go('')
      toast(existing ? 'Harcama güncellendi.' : 'Harcama eklendi.')
    } catch (ex) {
      err.textContent = ex.message
      err.scrollIntoView({ block: 'nearest' })
    }
  }
  document.getElementById('del')?.addEventListener('click', () => deleteEntry(g, existing))
  if (!existing) form.description.focus()
}

function deleteEntry(g, entry) {
  g.entries = g.entries.filter((x) => x.id !== entry.id)
  g.deleted[entry.id] = Date.now()
  save()
  go('')
  toast('Silindi.', {
    action: 'Geri al',
    onAction: () => {
      delete g.deleted[entry.id]
      g.entries.push(entry)
      save()
      render()
    },
  })
}

// --- Ödeme formu ---
function renderPaymentForm(g, id, query) {
  const existing = id ? g.entries.find((e) => e.id === id && e.kind === 'payment') : null
  if (id && !existing) return go('')
  if (g.members.length < 2) return go('kisiler')
  const from = existing ? Object.keys(existing.payers)[0] : query.get('from') || g.meId || g.members[0].id
  const to = existing ? Object.keys(existing.shares)[0] : query.get('to') || g.members.find((m) => m.id !== from)?.id
  const amountText = existing
    ? (existing.amount / 100).toFixed(2).replace('.', ',')
    : query.get('amount')
      ? (Number(query.get('amount')) / 100).toFixed(2).replace('.', ',')
      : ''
  const opts = (sel) =>
    g.members.map((m) => `<option value="${m.id}" ${sel === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')

  app.innerHTML = `${header(existing ? 'Ödemeyi düzenle' : 'Ödeme kaydet', { back: true })}<main>
    <form id="f" novalidate><div class="card">
      <p class="muted" style="margin:0 0 12px">Biri diğerine borcunu ödediğinde buraya yazın; bakiyeler güncellenir.</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <label class="field"><span>Ödeyen</span><select name="from">${opts(from)}</select></label>
        <label class="field"><span>Alan</span><select name="to">${opts(to)}</select></label>
      </div>
      <label class="field"><span>Tutar (${esc(g.currency)})</span>
        <input type="text" name="amount" class="amount" inputmode="decimal" value="${esc(amountText)}" placeholder="0,00" required /></label>
      <label class="field"><span>Tarih</span><input type="date" name="date" value="${esc(existing?.date || today())}" required /></label>
      <label class="field"><span>Not (isteğe bağlı)</span><input type="text" name="note" value="${esc(existing?.note || '')}" placeholder="Havale, nakit…" /></label>
    </div>
    <p class="hint err" id="form-err" role="alert"></p>
    <div class="actions">
      ${existing ? `<button type="button" class="btn danger" id="del">Sil</button>` : ''}
      <button type="submit" class="btn primary">${existing ? 'Kaydet' : 'Kaydet'}</button>
    </div></form>
  </main>`
  bindCommon()
  const form = document.getElementById('f')
  form.onsubmit = (e) => {
    e.preventDefault()
    const err = document.getElementById('form-err')
    try {
      const amount = parseAmount(form.amount.value)
      if (!amount || amount <= 0) throw new Error('Geçerli bir tutar girin.')
      if (form.from.value === form.to.value) throw new Error('Ödeyen ve alan farklı olmalı.')
      const now = Date.now()
      const entry = {
        id: existing?.id || uid(),
        kind: 'payment',
        description: 'Ödeme',
        amount,
        date: form.date.value || today(),
        category: 'diger',
        note: form.note.value.trim(),
        payers: { [form.from.value]: amount },
        splitType: 'exact',
        splitInput: { [form.to.value]: amount },
        shares: { [form.to.value]: amount },
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      }
      if (existing) g.entries = g.entries.map((x) => (x.id === existing.id ? entry : x))
      else g.entries.push(entry)
      save()
      go('bakiye')
      toast('Ödeme kaydedildi.')
    } catch (ex) {
      err.textContent = ex.message
    }
  }
  document.getElementById('del')?.addEventListener('click', () => deleteEntry(g, existing))
}

// --- Ayarlar ---
function renderSettings(g) {
  app.innerHTML = `${header('Ayarlar')}<main>
    ${
      g
        ? `<div class="card"><h2>${esc(g.name)} grubu</h2>
      <label class="field"><span>Para birimi</span><select id="currency">
        ${CURRENCIES.map((c) => `<option value="${c}" ${g.currency === c ? 'selected' : ''}>${c}</option>`).join('')}
      </select></label>
      <div class="actions">
        <button type="button" class="btn primary" id="share">🔗 Paylaşım bağlantısı</button>
        <button type="button" class="btn" id="csv">CSV indir</button>
      </div>
      <p class="hint">Bağlantı, grubun tüm kayıtlarını içerir. Evdekilere WhatsApp'tan gönderin; açtıklarında kendi telefonlarına alırlar. Her değişiklikten sonra yeni bağlantı paylaşın.</p>
    </div>`
        : ''
    }
    <div class="card"><h2>Yedek</h2>
      <div class="actions">
        <button type="button" class="btn" id="export">Yedek al (.json)</button>
        <button type="button" class="btn" id="import">Yedekten yükle</button>
      </div>
      <p class="hint">Tüm gruplar tek dosyada. Veri yalnızca bu cihazda tutulur; telefon değiştirirken yedek alın.</p>
    </div>
    <div class="card"><h2>Gruplar</h2>
      ${state.groups
        .map(
          (x) => `<div class="row link" data-g="${x.id}"><div class="grow"><div class="title">${esc(x.name)}</div>
          <div class="sub">${x.members.length} kişi · ${x.entries.length} kayıt</div></div>${x.id === state.activeGroupId ? '<span class="badge pos">açık</span>' : ''}</div>`,
        )
        .join('')}
      <button type="button" class="btn block" id="new-group" style="margin-top:10px">+ Yeni grup</button>
    </div>
    <div class="card"><h2>Tehlikeli bölge</h2>
      <button type="button" class="btn danger block" id="wipe">Tüm verileri sil</button>
    </div>
    <p class="hint" style="text-align:center">Bölüş · sunucusuz, reklamsız, veri telefonda. <a href="https://github.com/yilmazfatih-cyber/Deneme" style="color:inherit">Kaynak kod</a></p>
  </main>${bottomNav('ayarlar')}`
  bindCommon()
  document.getElementById('currency')?.addEventListener('change', (e) => {
    g.currency = e.target.value
    save()
    render()
  })
  document.getElementById('share')?.addEventListener('click', () => shareGroup(g))
  document.getElementById('csv')?.addEventListener('click', () => exportCsv(g))
  document.getElementById('export').onclick = exportFile
  document.getElementById('import').onclick = importFile
  document.getElementById('new-group').onclick = createGroupFlow
  bindRows('[data-g]', (row) => {
    state.activeGroupId = row.dataset.g
    save()
    go('')
  })
  document.getElementById('wipe').onclick = async () => {
    const v = await confirmDialog({
      title: 'Tüm veriler silinsin mi?',
      text: 'Bütün gruplar, kişiler ve harcamalar bu cihazdan silinir. Geri alınamaz; önce yedek alın.',
      ok: 'Hepsini sil',
      danger: true,
    })
    if (v !== 'ok') return
    state = emptyState()
    save()
    go('')
    render()
  }
}

// ---------- Dışa / içe aktarma ----------
function download(name, text, type = 'application/json') {
  const blob = new Blob([text], { type })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

function exportFile() {
  download(`bolus-yedek-${today()}.json`, JSON.stringify(state, null, 2))
  toast('Yedek dosyası indirildi.')
}

function importFile() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json,application/json'
  input.onchange = async () => {
    const file = input.files[0]
    if (!file) return
    try {
      const data = JSON.parse(await file.text())
      if (!data || !Array.isArray(data.groups)) throw new Error('Dosya Bölüş yedeği değil.')
      const clean = sanitizeState(data)
      if (clean.groups.length === 0) throw new Error('Dosyada geçerli grup yok.')
      const v = await confirmDialog({
        title: 'Yedek yüklensin mi?',
        text: `${clean.groups.length} grup bulundu. "Üzerine yaz" mevcut her şeyi siler; "Birleştir" grupları yan yana ekler.`,
        ok: 'Üzerine yaz',
        extra: 'Birleştir',
        danger: true,
      })
      if (v === 'cancel') return
      if (v === 'ok') state = clean
      else for (const grp of clean.groups) mergeGroup(grp, 'merge')
      if (!state.groups.find((x) => x.id === state.activeGroupId)) state.activeGroupId = state.groups[0]?.id || null
      save()
      go('')
      toast('Yedek yüklendi.')
    } catch (e) {
      toast('Yüklenemedi: ' + e.message)
    }
  }
  input.click()
}

/** Grubu mevcut duruma ekler: aynı kimlik varsa 'replace' üzerine yazar, 'merge' kayıtları birleştirir. */
function mergeGroup(incoming, mode) {
  const i = state.groups.findIndex((x) => x.id === incoming.id)
  if (i < 0) {
    state.groups.push(incoming)
    return
  }
  if (mode === 'replace') {
    const meId = state.groups[i].meId
    state.groups[i] = { ...incoming, meId: incoming.members.some((m) => m.id === meId) ? meId : incoming.meId }
    return
  }
  const cur = state.groups[i]
  // Silinenler (mezar taşları): iki tarafın silme kayıtları birleşir; silme, kayıttan yeniyse kazanır.
  for (const [id, ts] of Object.entries(incoming.deleted || {})) cur.deleted[id] = Math.max(cur.deleted[id] || 0, ts)
  cur.entries = cur.entries.filter((e) => !(cur.deleted[e.id] > (e.updatedAt || 0)))
  for (const m of incoming.members) {
    if (cur.members.some((x) => x.id === m.id)) continue
    if (cur.deleted[m.id] && !incoming.entries.some((e) => m.id in e.payers || m.id in e.shares)) continue
    cur.members.push(m)
  }
  for (const e of incoming.entries) {
    if (cur.deleted[e.id] > (e.updatedAt || 0)) continue
    const j = cur.entries.findIndex((x) => x.id === e.id)
    if (j < 0) cur.entries.push(e)
    else if ((e.updatedAt || 0) > (cur.entries[j].updatedAt || 0)) cur.entries[j] = e
  }
  // Silinmiş üye bir kayıtta geçiyorsa (karşı tarafta hâlâ kullanılıyor) geri gelir.
  const referenced = new Set(cur.entries.flatMap((e) => [...Object.keys(e.payers), ...Object.keys(e.shares)]))
  cur.members = cur.members.filter((m) => !cur.deleted[m.id] || referenced.has(m.id))
  for (const m of incoming.members) {
    if (referenced.has(m.id) && !cur.members.some((x) => x.id === m.id)) cur.members.push(m)
  }
  // Doğrulamadan geçir: paylar ile üyeler tutarlı kalsın.
  state.groups[i] = normalizeGroup(cur)
}

function exportCsv(g) {
  const names = g.members.map((m) => m.name)
  const head = ['Tarih', 'Açıklama', 'Kategori', 'Tutar', 'Ödeyen', ...names.map((n) => `${n} payı`), 'Not']
  const rows = [...g.entries]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => [
      e.date,
      e.kind === 'payment' ? 'Ödeme' : e.description,
      e.kind === 'payment' ? 'Ödeme' : category(e.category)[2],
      (e.amount / 100).toFixed(2).replace('.', ','),
      Object.keys(e.payers)
        .map((id) => memberName(g, id))
        .join(' + '),
      ...g.members.map((m) => ((e.shares[m.id] || 0) / 100).toFixed(2).replace('.', ',')),
      e.note || '',
    ])
  const csv = [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n')
  download(`${g.name}-${today()}.csv`, '﻿' + csv, 'text/csv;charset=utf-8')
}

// --- Paylaşım bağlantısı: grup verisi sıkıştırılıp URL'ye gömülür ---
function b64url(bytes) {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function unb64url(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/')
  while (s.length % 4) s += '='
  const bin = atob(s)
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

async function encodeGroup(g) {
  const json = JSON.stringify({ ...g, meId: null })
  const bytes = new TextEncoder().encode(json)
  if (typeof CompressionStream === 'undefined') return 'j.' + b64url(bytes)
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  const out = new Uint8Array(await new Response(stream).arrayBuffer())
  return 'd.' + b64url(out)
}

async function decodeGroup(code) {
  // Mesajlaşma uygulamaları bağlantı sonuna nokta/parantez ekleyebilir.
  const clean = String(code).replace(/[^A-Za-z0-9_.-]/g, '')
  const [kind, data] = [clean.slice(0, 2), clean.slice(2).replace(/[^A-Za-z0-9_-]/g, '')]
  if (kind !== 'd.' && kind !== 'j.') throw new Error('Bağlantı tanınmadı')
  if (kind === 'd.' && typeof DecompressionStream === 'undefined')
    throw new Error('Bu tarayıcı sıkıştırılmış bağlantıyı açamıyor; telefonu güncelleyin ya da .json yedek isteyin')
  let raw
  try {
    let bytes = unb64url(data)
    if (kind === 'd.') {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
      bytes = new Uint8Array(await new Response(stream).arrayBuffer())
    }
    raw = JSON.parse(new TextDecoder().decode(bytes))
  } catch (e) {
    console.error(e)
    throw new Error('Bağlantı eksik ya da bozuk kopyalanmış; gönderenden tekrar isteyin')
  }
  try {
    return normalizeGroup(raw)
  } catch {
    throw new Error('Bağlantıda grup verisi yok')
  }
}

async function shareGroup(g) {
  const code = await encodeGroup(g)
  const url = `${location.origin}${location.pathname}#/al?v=${code}`
  const text = `Bölüş · "${g.name}" grubu (${g.members.length} kişi, ${g.entries.length} kayıt)`
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Bölüş', text, url })
      return
    } catch {
      /* iptal: panoya kopyalamaya düş */
    }
  }
  try {
    await navigator.clipboard.writeText(url)
    toast("Bağlantı panoya kopyalandı. WhatsApp'a yapıştırın.")
  } catch {
    await promptDialog({ title: 'Bağlantıyı kopyalayın', value: url, ok: 'Tamam' })
  }
}

async function renderImportLink(code) {
  app.innerHTML = `${header('Bölüş')}<main><div class="card"><div class="empty">Bağlantı okunuyor…</div></div></main>`
  if (!code) return go('')
  let g
  try {
    g = await decodeGroup(code)
  } catch (e) {
    app.innerHTML = `${header('Bölüş')}<main><div class="card"><div class="empty"><div class="big">⚠️</div>
      <p>Bağlantı açılamadı.</p><p class="muted">${esc(e.message)}</p>
      <a class="btn block" href="#/">Ana sayfa</a></div></div></main>`
    return
  }
  const exists = state.groups.some((x) => x.id === g.id)
  const meGuess = state.groups.find((x) => x.id === g.id)?.meId
  app.innerHTML = `${header('Bölüş')}<main>
    <div class="card"><h2>Paylaşılan grup</h2>
      <div class="row"><span class="emoji" aria-hidden="true">🏠</span><div class="grow"><div class="title">${esc(g.name)}</div>
      <div class="sub">${g.members.map((m) => esc(m.name)).join(', ')} · ${g.entries.length} kayıt · toplam ${formatAmount(totals(g.entries).total, g.currency)}</div></div></div>
      <label class="field" style="margin-top:12px"><span>Bu grupta siz kimsiniz?</span><select id="me">
        <option value="">— seçme —</option>
        ${g.members.map((m) => `<option value="${m.id}" ${meGuess === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}
      </select></label>
      ${exists ? '<p class="hint">Bu grup telefonunuzda zaten var. "Üzerine yaz" bağlantıdaki hâli alır; "Birleştir" iki tarafın kayıtlarını birleştirir (aynı kayıtta yeni olan kazanır; silmeler de taşınır).</p>' : ''}
      <div class="actions">
        <a class="btn" href="#/">Vazgeç</a>
        ${exists ? '<button type="button" class="btn" id="merge">Birleştir</button>' : ''}
        <button type="button" class="btn primary" id="replace">${exists ? 'Üzerine yaz' : 'Telefonuma al'}</button>
      </div>
    </div></main>`
  bindCommon()
  const finish = (mode) => {
    const me = document.getElementById('me').value || null
    mergeGroup(g, mode)
    const cur = state.groups.find((x) => x.id === g.id)
    if (me) cur.meId = me
    state.activeGroupId = g.id
    save()
    history.replaceState(null, '', '#/')
    render()
    toast('Grup telefonunuza alındı.')
  }
  document.getElementById('replace').onclick = () => finish('replace')
  document.getElementById('merge')?.addEventListener('click', () => finish('merge'))
}

// ---------- Başlat ----------
render()
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {})
}

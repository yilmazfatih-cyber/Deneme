/**
 * Odak motoru (uzamsal gezinme) — kütüphanesiz, DOM'dan bağımsız çekirdek. React katmanı: react.tsx.
 *
 * Kavramlar
 *   düğüm   odaklanabilir öğe; dikdörtgeni gezinme ANINDA okunur (`getRect`), kayıtta saklanmaz.
 *   kapsam  düğüm ve alt kapsam grubu (satır, ızgara, yan menü, iletişim kutusu, ekran). Her kapsam son odaklanan
 *           çocuğunu hatırlar; kapsama dışarıdan girilince önce o, yoksa bildirilen varsayılan, yoksa gidilen yöndeki
 *           en yakın çocuk, yoksa ilk çocuk seçilir.
 *           `trap`: odak kapsamdan yön tuşuyla çıkamaz (yan menü, iletişim kutusu, tuş takımı, ekran).
 *           `onEdge(yön)`: kapsamın içinde o yönde aday kalmadığında çağrılır; true dönerse tuş tüketilmiştir
 *           ("ilk karttayken ← yan menüyü açar" böyle kurulur). Önce onEdge, sonra trap denetlenir.
 *           `restore`: kapsam kapanınca odak, kapsama girmeden önceki düğüme döner (iletişim kutusu).
 *           `modal`: odak içindeyken fareyle dışarıdaki bir düğüme tıklamak yok sayılır.
 *           `orientation`: 'horizontal' kapsamda ↑/↓ doğrudan üst kapsama sorulur ('vertical' için ←/→).
 *           Yatay satır kendi ekseninde mühürlüdür: ←/→ için satırda aday kalmazsa odak üst kapsamlardaki öğelere
 *           kaymaz, yalnız kenar işleyicileri (onEdge) ve tuzak denetlenir — satırın sonunda → hiçbir şey yapmaz,
 *           ilk kartta ← yalnız açık bir kenar işleyicisiyle (yan menü) bir yere gider.
 *
 * Güvenceler (UX_SPEC §7 kural 6)
 *   - Aynı anda en çok bir düğüm odaktadır; odaktaki öğenin DOM elemanı `data-focused` taşır.
 *   - Odaktaki düğüm kalkar ya da devre dışı kalırsa bir sonraki tikte yedeğe geçilir:
 *     (restore hedefi) → kapsamın hatırladığı çocuk → kapsamın ilk çocuğu → üst kapsam … → ekran → herhangi biri.
 *   - Odak boşken bir düğüm kaydolursa aynı yolla odak kurulur: ekranda hiçbir an odaksız kalınmaz.
 *   - Odak kendiliğinden (ekran açılışı, yedek) kurulduysa ve kullanıcı henüz tuşa basmadıysa, sonradan gelen
 *     `autoFocus` düğümü ya da ekranın varsayılanı odağı devralır (veri geç yüklenince ilk karta geçmek gibi).
 *
 * Tuşlar `dispatchKey` ile tek yerden girer (klavye dinleyicisi ve telefondan gelen KEY komutu aynı yolu izler):
 * önce öncelik sırasıyla kesiciler (oynatıcı, iletişim kutusu, kabuk), sonra yön tuşları → `move`, OK → `onEnter`.
 */
import type { RemoteKey } from '../../../../shared/devices'
import { isHorizontal, isUsableRect, pickNearest, pickNext, unionRect, type Direction, type Rect } from './geometry'
import { directionOf } from './keys'

export const ROOT_SCOPE = '__kok'

export type Orientation = 'horizontal' | 'vertical' | 'grid'
export type FocusReason = 'user' | 'auto'

export interface FocusNodeConfig {
  id: string
  /** Düğümün içinde bulunduğu kapsam (yoksa kök) */
  scopeId?: string
  /** Gezinme anında okunur; null ya da boyutsuz → yön adayı değildir (gizli öğe) */
  getRect: () => Rect | null
  element?: HTMLElement | null
  disabled?: boolean
  /** Odak boşken / kendiliğinden kurulmuşken bu düğüm kaydolursa odağı alır */
  autoFocus?: boolean
  onEnter?: () => void
  onFocus?: () => void
  onBlur?: () => void
  /** Yön tuşu bu düğümdeyken önce buraya sorulur; true → tüketildi */
  onArrow?: (dir: Direction) => boolean | void
  /** Odak durumu değişince (React durumunu günceller) */
  onFocusedChange?: (focused: boolean) => void
}

export interface FocusScopeConfig {
  id: string
  /** Üst kapsam (yoksa kök) */
  parentId?: string | null
  trap?: boolean
  restore?: boolean
  modal?: boolean
  orientation?: Orientation
  /** Kapsama girilince (hafıza yoksa) odaklanacak düğüm kimliği */
  defaultFocusId?: string
  onEdge?: (dir: Direction) => boolean | void
}

interface NodeRec extends FocusNodeConfig {
  scopeId: string
  seq: number
}

interface ScopeRec extends FocusScopeConfig {
  parentId: string | null
  seq: number
  lastFocusedId: string | null
  returnTo: string | null
}

/** Bir kapsamın doğrudan çocuğu: düğüm ya da alt kapsam (yön seçiminde tek birim sayılır). */
interface Unit {
  id: string
  kind: 'node' | 'scope'
  rect: Rect
  order: number
}

export type KeyInterceptor = (key: RemoteKey) => boolean | void

interface InterceptorRec {
  fn: KeyInterceptor
  priority: number
  seq: number
}

interface LostFocus {
  scopeChain: string[]
  restoreTo: string | null
}

export interface FocusEngineOptions {
  /** Onarımı bir sonraki tike erteler (varsayılan queueMicrotask: React işlemesi bittikten hemen sonra) */
  schedule?: (fn: () => void) => void
}

export class FocusEngine {
  private readonly nodes = new Map<string, NodeRec>()
  private readonly scopes = new Map<string, ScopeRec>()
  /** Kalkan kapsamların hafızası: aynı kimlikle yeniden bağlanınca (StrictMode, ekrana dönüş) geri yüklenir. */
  private readonly memory = new Map<string, { lastFocusedId: string | null; returnTo: string | null }>()
  private readonly interceptors: InterceptorRec[] = []
  private readonly listeners = new Set<() => void>()
  private readonly schedule: (fn: () => void) => void
  private seq = 0
  private currentId: string | null = null
  private autoPlaced = true
  private screenId: string | null = null
  private lost: LostFocus | null = null
  private upgradeTo: string | null = null
  private repairQueued = false
  /** Ekranın odak talebi (TvScreen): içerik geç gelse de, izleyici tuşa basmadıysa odak ekrana iner. */
  private claim: { scopeId: string; keys: number; want: string | null } | null = null
  /** Kullanıcı eylemi sayacı (tuş, tıklama); talep bu sayı değişince düşer. */
  private userActions = 0

  constructor(opts: FocusEngineOptions = {}) {
    this.schedule =
      opts.schedule ??
      ((fn) => {
        queueMicrotask(fn)
      })
    this.scopes.set(ROOT_SCOPE, {
      id: ROOT_SCOPE,
      parentId: null,
      seq: 0,
      lastFocusedId: null,
      returnTo: null,
    })
  }

  /* ───────────── Kayıt ───────────── */

  registerScope(cfg: FocusScopeConfig): () => void {
    const prev = this.scopes.get(cfg.id) ?? this.memory.get(cfg.id)
    const rec: ScopeRec = {
      ...cfg,
      parentId: cfg.parentId ?? (cfg.id === ROOT_SCOPE ? null : ROOT_SCOPE),
      seq: ++this.seq,
      // Aynı kimlikle yeniden kayıtta (StrictMode, yeniden bağlama) hafıza korunur.
      lastFocusedId: prev?.lastFocusedId ?? null,
      returnTo: prev?.returnTo ?? null,
    }
    this.scopes.set(cfg.id, rec)
    return () => this.unregisterScope(cfg.id, rec)
  }

  updateScope(id: string, patch: Partial<Omit<FocusScopeConfig, 'id'>>): void {
    const s = this.scopes.get(id)
    if (s) Object.assign(s, patch, { parentId: patch.parentId ?? s.parentId })
  }

  private unregisterScope(id: string, rec: ScopeRec): void {
    if (this.scopes.get(id) !== rec) return
    const cur = this.currentId
    const inside = cur !== null && this.chainOf(cur).includes(id)
    if (rec.restore && rec.returnTo && (inside || this.lost?.scopeChain.includes(id))) {
      if (this.lost) this.lost.restoreTo = rec.returnTo
      else if (inside) this.lost = { scopeChain: this.chainOf(cur), restoreTo: rec.returnTo }
    }
    this.scopes.delete(id)
    // Pencereler her açılışta varsayılanından başlar; satır ve ekranlar kaldıkları yeri hatırlar.
    this.memory.set(id, { lastFocusedId: rec.restore ? null : rec.lastFocusedId, returnTo: rec.returnTo })
    if (this.screenId === id) this.screenId = null
    if (inside) this.queueRepair()
  }

  registerNode(cfg: FocusNodeConfig): () => void {
    const rec: NodeRec = { ...cfg, scopeId: cfg.scopeId ?? ROOT_SCOPE, seq: ++this.seq }
    this.nodes.set(cfg.id, rec)
    if (this.currentId === cfg.id) {
      // Aynı kimlik yeniden bağlandı: işaret yeni elemana taşınır.
      rec.element?.setAttribute('data-focused', 'true')
      rec.onFocusedChange?.(true)
    } else if (this.currentId === null) {
      this.queueRepair()
    }
    if (cfg.autoFocus && (this.currentId === null || this.autoPlaced)) {
      this.upgradeTo = cfg.id
      this.queueRepair()
    }
    if (this.claim) this.queueRepair()
    return () => this.unregisterNode(cfg.id, rec)
  }

  updateNode(id: string, patch: Partial<Omit<FocusNodeConfig, 'id'>>): void {
    const n = this.nodes.get(id)
    if (!n) return
    const wasEl = n.element
    Object.assign(n, patch)
    if (patch.scopeId === undefined && !n.scopeId) n.scopeId = ROOT_SCOPE
    if (this.currentId === id) {
      if ('element' in patch && wasEl !== n.element) {
        wasEl?.removeAttribute('data-focused')
        n.element?.setAttribute('data-focused', 'true')
      }
      if (n.disabled) {
        this.lost = { scopeChain: this.chainOf(id), restoreTo: null }
        this.queueRepair()
      }
    }
  }

  private unregisterNode(id: string, rec: NodeRec): void {
    if (this.nodes.get(id) !== rec) return
    if (this.currentId === id) {
      this.lost = { scopeChain: this.chainOf(id), restoreTo: this.lost?.restoreTo ?? null }
      rec.element?.removeAttribute('data-focused')
      this.currentId = null
      this.nodes.delete(id)
      this.queueRepair()
      this.notify()
      return
    }
    this.nodes.delete(id)
  }

  /* ───────────── Sorgular ───────────── */

  current(): string | null {
    return this.currentId
  }

  currentElement(): HTMLElement | null {
    return (this.currentId && this.nodes.get(this.currentId)?.element) || null
  }

  has(id: string): boolean {
    return this.nodes.has(id)
  }

  /** Düğüm (ya da verilmezse odaktaki düğüm) bu kapsamın içinde mi? */
  isWithin(scopeId: string, nodeId: string | null = this.currentId): boolean {
    return nodeId !== null && this.nodes.has(nodeId) && this.chainOf(nodeId).includes(scopeId)
  }

  lastFocused(scopeId: string): string | null {
    return this.scopes.get(scopeId)?.lastFocusedId ?? null
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  /** Ekranın kök kapsamı (TvScreen bildirir); yedek zincirinin son halkası ve "ekrana dön" hedefi. */
  setScreen(scopeId: string | null): void {
    this.screenId = scopeId
  }

  screen(): string | null {
    return this.screenId
  }

  /* ───────────── Odak ───────────── */

  /** Düğümü odaklar; yoksa ya da devre dışıysa false. */
  focus(id: string, reason: FocusReason = 'user'): boolean {
    const next = this.nodes.get(id)
    if (!next || next.disabled) return false
    this.autoPlaced = reason === 'auto'
    if (reason === 'user') {
      this.upgradeTo = null
      this.userActions++
    }
    if (this.currentId === id) return true
    const prevId = this.currentId
    const prev = prevId ? this.nodes.get(prevId) : undefined
    const prevChain = prevId && prev ? this.chainOf(prevId) : (this.lost?.scopeChain ?? [])
    const nextChain = this.chainOf(id)
    for (const sid of nextChain) {
      const s = this.scopes.get(sid)
      if (!s) continue
      if (s.restore && !prevChain.includes(sid)) s.returnTo = prevId ?? this.lost?.restoreTo ?? null
      s.lastFocusedId = id
    }
    this.currentId = id
    this.lost = null
    if (prev) {
      prev.element?.removeAttribute('data-focused')
      prev.onFocusedChange?.(false)
      prev.onBlur?.()
    }
    next.element?.setAttribute('data-focused', 'true')
    try {
      next.element?.focus({ preventScroll: true })
    } catch {
      /* odaklanamayan eleman: önemli değil, işaret data-focused'tadır */
    }
    next.onFocusedChange?.(true)
    next.onFocus?.()
    this.notify()
    return true
  }

  /** Kapsama girer (hafıza → varsayılan → ilk çocuk) ve odaklar. */
  focusScope(scopeId: string, reason: FocusReason = 'user'): boolean {
    const target = this.entryOf(scopeId, null, null, null)
    return target ? this.focus(target, reason) : false
  }

  /** Ekranın kapsamına döner (yan menü kapanınca). */
  focusScreen(reason: FocusReason = 'user'): boolean {
    return this.screenId ? this.focusScope(this.screenId, reason) : false
  }

  /** Yön tuşu. Odak varsa her zaman tüketilir (true): aday yoksa odak yerinde kalır. */
  move(dir: Direction): boolean {
    const cur = this.currentId ? this.nodes.get(this.currentId) : undefined
    if (!cur) {
      this.repairNow()
      return this.currentId !== null
    }
    if (cur.onArrow?.(dir) === true) {
      this.autoPlaced = false
      return true
    }
    const origin = cur.getRect()
    if (!isUsableRect(origin)) {
      // Odaktaki öğe görünmez oldu: yedeğe geç.
      this.lost = { scopeChain: this.chainOf(cur.id), restoreTo: null }
      this.currentId = null
      cur.element?.removeAttribute('data-focused')
      cur.onFocusedChange?.(false)
      this.repairNow()
      return true
    }
    let childUnit = cur.id
    // Yatay satır ←/→ yönünde tükenince üst kapsamlara yalnız kenar (onEdge) ve tuzak için bakılır:
    // satırın sonunda → başka satıra kaymaz; ilk kartta ← yan menüyü ancak açık bir kenar işleyicisi açar.
    let sealed = false
    for (const sid of this.chainOf(cur.id)) {
      const s = this.scopes.get(sid)
      if (!s) continue
      if (!sealed && !this.excludesAxis(s, dir)) {
        const units = this.unitsOf(sid).filter((u) => u.id !== childUnit)
        const pick = pickNext(origin, units, dir)
        if (pick) {
          const target = pick.kind === 'node' ? pick.id : this.entryOf(pick.id, origin, dir, null)
          if (target) {
            this.focus(target, 'user')
            return true
          }
        }
      }
      if (s.onEdge?.(dir) === true) {
        this.autoPlaced = false
        return true
      }
      if (s.trap) {
        this.autoPlaced = false
        return true
      }
      if (this.ownsAxis(s, dir)) sealed = true
      childUnit = sid
    }
    this.autoPlaced = false
    return true
  }

  /** OK: odaktaki düğümün onEnter'ı; işleyici yoksa false. */
  enter(): boolean {
    const cur = this.currentId ? this.nodes.get(this.currentId) : undefined
    if (!cur?.onEnter || cur.disabled) return false
    this.autoPlaced = false
    cur.onEnter()
    return true
  }

  /** Fare tıklaması: odaklar ve OK'u tetikler. Modal kapsamdayken dışarıya tıklama yok sayılır. */
  click(id: string): boolean {
    const n = this.nodes.get(id)
    if (!n || n.disabled) return false
    const cur = this.currentId
    if (cur && cur !== id) {
      for (const sid of this.chainOf(cur)) {
        const s = this.scopes.get(sid)
        if (s?.modal && !this.isWithin(sid, id)) return false
      }
    }
    this.focus(id, 'user')
    n.onEnter?.()
    return true
  }

  /* ───────────── Tuşlar ───────────── */

  /**
   * Kesici ekler. Yüksek öncelik önce; eşitlikte son eklenen önce (iç içe iletişim kutuları).
   * Kesici true dönerse tuş tüketilir. Kaldırma işlevini döndürür.
   */
  addInterceptor(fn: KeyInterceptor, priority = 0): () => void {
    const rec: InterceptorRec = { fn, priority, seq: ++this.seq }
    this.interceptors.push(rec)
    this.interceptors.sort((a, b) => b.priority - a.priority || b.seq - a.seq)
    return () => {
      const i = this.interceptors.indexOf(rec)
      if (i >= 0) this.interceptors.splice(i, 1)
    }
  }

  /** Tek giriş noktası: klavye dinleyicisi ve telefon kumandası. İşlendiyse true. */
  dispatchKey(key: RemoteKey): boolean {
    this.userActions++
    for (const rec of [...this.interceptors]) {
      if (rec.fn(key) === true) return true
    }
    const dir = directionOf(key)
    if (dir) return this.move(dir)
    if (key === 'OK') return this.enter()
    return false
  }

  /* ───────────── Onarım ───────────── */

  /** Bekleyen onarımı hemen çalıştırır (testler ve yön tuşu). */
  flush(): void {
    if (this.repairQueued) this.repairNow()
  }

  private queueRepair(): void {
    if (this.repairQueued) return
    this.repairQueued = true
    this.schedule(() => {
      if (this.repairQueued) this.repairNow()
    })
  }

  private repairNow(): void {
    this.repairBody()
    this.applyClaim()
  }

  private repairBody(): void {
    this.repairQueued = false
    const cur = this.currentId ? this.nodes.get(this.currentId) : undefined
    const upgrade = this.upgradeTo
    this.upgradeTo = null
    if (cur && !cur.disabled) {
      if (
        upgrade &&
        this.autoPlaced &&
        upgrade !== cur.id &&
        this.available(upgrade) &&
        this.sameModal(cur.id, upgrade)
      )
        this.focus(upgrade, 'auto')
      return
    }
    if (cur) {
      // devre dışı kaldı
      cur.element?.removeAttribute('data-focused')
      cur.onFocusedChange?.(false)
      this.currentId = null
    }
    const target = this.fallbackTarget(upgrade)
    if (target) this.focus(target, 'auto')
    else this.notify()
  }

  /**
   * Ekran odak talebi: ekran açılınca (TvScreen) çağrılır. Odak ekranın kapsamına — hafıza → varsayılan → ilk öğe —
   * hemen, içerik henüz yoksa içerik geldiği anda iner. İzleyici bu arada bir tuşa basarsa (ya da tıklarsa) talep
   * düşer. Odak ekranda genel bir öğeye (ör. Geri) indiyse, hatırlanan / varsayılan öğe sonradan gelince ona geçer.
   * Kapsam dışındaki modal pencereye dokunulmaz.
   */
  claimScope(scopeId: string): void {
    // Hedef talep anında sabitlenir: odak geçici olarak genel bir öğeye inse de hafıza kaybolmaz.
    const s = this.scopes.get(scopeId)
    this.claim = { scopeId, keys: this.userActions, want: s?.lastFocusedId ?? null }
    this.applyClaim()
  }

  /** Bekleyen ekran talebi (testler ve tanılama için) */
  pendingClaim(): string | null {
    return this.claim?.scopeId ?? null
  }

  private applyClaim(): void {
    const c = this.claim
    if (!c) return
    const s = this.scopes.get(c.scopeId)
    if (!s || this.userActions !== c.keys) {
      this.claim = null
      return
    }
    const ok = (id: string | null | undefined): id is string =>
      !!id && this.available(id) && this.isWithin(c.scopeId, id)
    const preferred = ok(c.want) ? c.want : ok(s.defaultFocusId) ? s.defaultFocusId : null
    const cur = this.currentId
    if (cur && this.isWithin(c.scopeId, cur)) {
      if (preferred && preferred !== cur) this.focus(preferred, 'auto')
      if (preferred) this.claim = null
      return
    }
    if (cur) for (const sid of this.chainOf(cur)) if (this.scopes.get(sid)?.modal) return
    const target = preferred ?? this.entryOf(c.scopeId, null, null, null)
    if (!target) return
    this.focus(target, 'auto')
    if (target === preferred) this.claim = null
  }

  private fallbackTarget(upgrade: string | null): string | null {
    const lost = this.lost
    if (lost?.restoreTo && this.available(lost.restoreTo)) return lost.restoreTo
    if (lost) {
      for (const sid of lost.scopeChain) {
        if (!this.scopes.has(sid)) continue
        const t = this.entryOf(sid, null, null, null)
        if (t) return t
      }
    }
    if (upgrade && this.available(upgrade)) return upgrade
    if (this.screenId) {
      const t = this.entryOf(this.screenId, null, null, null)
      if (t) return t
    }
    return this.entryOf(ROOT_SCOPE, null, null, null)
  }

  /* ───────────── Yardımcılar ───────────── */

  private available(id: string): boolean {
    const n = this.nodes.get(id)
    return !!n && !n.disabled
  }

  /** İki düğüm aynı modal kapsamın içinde mi (ya da hiçbiri modal değil mi)? */
  private sameModal(a: string, b: string): boolean {
    for (const sid of this.chainOf(a)) if (this.scopes.get(sid)?.modal && !this.isWithin(sid, b)) return false
    return true
  }

  /** Düğümün kapsam zinciri: en içten köke. */
  private chainOf(nodeId: string): string[] {
    const out: string[] = []
    let sid: string | null = this.nodes.get(nodeId)?.scopeId ?? null
    const seen = new Set<string>()
    while (sid && !seen.has(sid)) {
      seen.add(sid)
      out.push(sid)
      sid = sid === ROOT_SCOPE ? null : (this.scopes.get(sid)?.parentId ?? ROOT_SCOPE)
    }
    if (out[out.length - 1] !== ROOT_SCOPE) out.push(ROOT_SCOPE)
    return out
  }

  /** Yatay satırın kendi ekseni mi (←/→)? Dikey listeler mühürlenmez: listenin altındaki öğeye ↓ ile inilir. */
  private ownsAxis(s: ScopeRec, dir: Direction): boolean {
    return s.orientation === 'horizontal' && isHorizontal(dir)
  }

  private excludesAxis(s: ScopeRec, dir: Direction): boolean {
    if (s.orientation === 'horizontal') return !isHorizontal(dir)
    if (s.orientation === 'vertical') return isHorizontal(dir)
    return false
  }

  /** Belge sırası (elemanlar varsa), yoksa kayıt sırası. */
  private orderOf(ids: string[]): Map<string, number> {
    const recs = ids.map((id) => this.nodes.get(id)).filter((n): n is NodeRec => !!n)
    const withEl = recs.every((n) => n.element && n.element.isConnected)
    if (withEl && recs.length > 1 && typeof Node !== 'undefined') {
      recs.sort((a, b) => (a.element!.compareDocumentPosition(b.element!) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
    } else {
      recs.sort((a, b) => a.seq - b.seq)
    }
    return new Map(recs.map((n, i) => [n.id, i]))
  }

  /** Kapsamın doğrudan çocuk birimleri (düğümler + alt kapsamlar), dikdörtgenleriyle. */
  private unitsOf(scopeId: string): Unit[] {
    const groups = new Map<string, { kind: 'node' | 'scope'; ids: string[] }>()
    for (const n of this.nodes.values()) {
      if (n.disabled) continue
      const chain = this.chainOf(n.id)
      const i = chain.indexOf(scopeId)
      if (i < 0) continue
      const key = i === 0 ? n.id : chain[i - 1]!
      const g = groups.get(key) ?? { kind: i === 0 ? 'node' : 'scope', ids: [] }
      g.ids.push(n.id)
      groups.set(key, g)
    }
    const order = this.orderOf([...groups.values()].flatMap((g) => g.ids))
    const units: Unit[] = []
    for (const [id, g] of groups) {
      const rects = g.ids.map((nid) => this.nodes.get(nid)!.getRect())
      const rect = g.kind === 'node' ? rects[0] : unionRect(rects)
      if (!isUsableRect(rect)) continue
      units.push({ id, kind: g.kind, rect, order: Math.min(...g.ids.map((nid) => order.get(nid) ?? 0)) })
    }
    return units
  }

  /**
   * Kapsama girişte odaklanacak düğüm: hafıza → varsayılan → (yön verildiyse) yöndeki en yakın çocuk →
   * en yakın çocuk → belge sırasındaki ilk düğüm. `exclude` atlanır.
   */
  private entryOf(scopeId: string, origin: Rect | null, dir: Direction | null, exclude: string | null): string | null {
    const s = this.scopes.get(scopeId)
    if (!s) return null
    const ok = (id: string | null | undefined): id is string =>
      !!id && id !== exclude && this.available(id) && this.isWithin(scopeId, id)
    if (ok(s.lastFocusedId)) return s.lastFocusedId
    if (ok(s.defaultFocusId)) return s.defaultFocusId
    const units = this.unitsOf(scopeId).filter((u) => u.id !== exclude)
    if (origin) {
      const pick = (dir ? pickNext(origin, units, dir) : null) ?? pickNearest(origin, units)
      if (pick) return pick.kind === 'node' ? pick.id : this.entryOf(pick.id, origin, dir, exclude)
    }
    // Belge sırasındaki ilk düğüm (görünmez olsa da: ekranda hiçbir an odaksız kalınmaz).
    const all = [...this.nodes.values()].filter((n) => ok(n.id)).map((n) => n.id)
    if (!all.length) return null
    const order = this.orderOf(all)
    const visible = units.length ? all.filter((id) => isUsableRect(this.nodes.get(id)!.getRect())) : all
    const pool = visible.length ? visible : all
    pool.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0))
    return pool[0] ?? null
  }

  private notify(): void {
    for (const l of [...this.listeners]) l()
  }
}

/** Uygulamanın tek odak yöneticisi (FocusRoot varsayılan olarak bunu kullanır). */
export const focusManager = new FocusEngine()

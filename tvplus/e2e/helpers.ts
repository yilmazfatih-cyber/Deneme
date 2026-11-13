/**
 * Uçtan uca testlerin ortak yardımcıları.
 *
 *   test / expect          `issues` fikstürüyle genişletilmiş test: her testte sayfa hataları ve aynı kökene giden
 *                          başarısız istekler (4xx/5xx) toplanır; beklenenler `issues.allowHttp` ile bildirilir,
 *                          kalanlar testin kendisini düşürür.
 *   appUrl / openDevice    `?vd=<ad>&cihaz=<biçim>` ile ayrı sanal cihaz olarak açılan sayfalar (tek tarayıcı bağlamı)
 *   signIn / signInTv      karşılama → demo girişi → profil kapısı (web/mobil) · TV'de klavyeyle demo girişi
 *   tvKey / tvMoveTo       TV kumandası: her tuştan sonra TAM OLARAK BİR `data-focused` öğe olduğunu doğrular
 *   pageApi                sayfanın kendi oturumuyla (sanal cihaz başlığı + CSRF) REST çağrısı
 *   waitForModel           stüdyo uçlarını yoklayarak tahmin modelinin / toplulukların hazır olmasını bekler
 */
import {
  expect,
  test as base,
  type BrowserContext,
  type Locator,
  type Page,
  type Response,
} from '@playwright/test'
import { FORM_FACTOR_PARAM, HEADERS, VIRTUAL_DEVICE_PARAM } from '../shared/constants'

export { expect }

/* ───────────── Hata toplayıcı fikstür ───────────── */

export interface Issues {
  /** Bu testte beklenen başarısız isteği bildirir (yol deseni, isteğe bağlı durum kodları). */
  allowHttp: (path: RegExp, statuses?: readonly number[]) => void
  /** Toplanan sorunlar (yalnız okuma). */
  readonly list: readonly string[]
}

interface Allowance {
  path: RegExp
  statuses: readonly number[] | null
}

export const test = base.extend<{ issues: Issues }>({
  issues: [
    async ({ context, baseURL }, use, testInfo) => {
      const origin = new URL(baseURL ?? 'http://127.0.0.1').origin
      const allowances: Allowance[] = []
      const list: string[] = []
      const isAllowed = (path: string, status: number) =>
        allowances.some((a) => a.path.test(path) && (a.statuses === null || a.statuses.includes(status)))
      const onResponse = (res: Response) => {
        const url = res.url()
        if (!url.startsWith(origin) || res.status() < 400) return
        const u = new URL(url)
        const path = u.pathname + u.search
        if (isAllowed(path, res.status())) return
        list.push(`${res.status()} ${res.request().method()} ${path.slice(0, 160)}`)
      }
      const watch = (p: Page) => {
        p.on('pageerror', (e) => list.push(`sayfa hatası (${p.url().slice(0, 120)}): ${e.message}`))
        p.on('response', onResponse)
      }
      context.pages().forEach(watch)
      context.on('page', watch)
      await use({
        allowHttp: (path, statuses) => allowances.push({ path, statuses: statuses ?? null }),
        get list() {
          return list
        },
      })
      if (testInfo.status === testInfo.expectedStatus) {
        expect(list, 'beklenmeyen sayfa hatası ya da başarısız istek').toEqual([])
      }
    },
    { auto: true },
  ],
})

/* ───────────── Adresler ve sanal cihazlar ───────────── */

export type Cihaz = 'web' | 'mobil' | 'tv'

export interface DeviceOpts {
  /** Sanal cihaz adı: çerezler `__<ad>` ekiyle ayrılır */
  vd?: string
  /** Ekran biçimini zorlar */
  cihaz?: Cihaz
}

/** `/?vd=…&cihaz=…#/yol` */
export function appUrl(route: string, opts: DeviceOpts = {}): string {
  const q = new URLSearchParams()
  if (opts.vd) q.set(VIRTUAL_DEVICE_PARAM, opts.vd)
  if (opts.cihaz) q.set(FORM_FACTOR_PARAM, opts.cihaz)
  const s = q.toString()
  const hash = route.startsWith('/') ? route : `/${route}`
  return `/${s ? `?${s}` : ''}#${hash}`
}

const VIEWPORT: Record<Cihaz, { width: number; height: number }> = {
  web: { width: 1440, height: 900 },
  mobil: { width: 390, height: 844 },
  tv: { width: 1280, height: 720 },
}

/** Aynı tarayıcı bağlamında ayrı bir sanal cihaz sayfası açar (cihaz vitrinindeki gibi). */
export async function openDevice(
  context: BrowserContext,
  vd: string,
  cihaz: Cihaz,
  route = '/',
): Promise<Page> {
  const page = await context.newPage()
  await page.setViewportSize(VIEWPORT[cihaz])
  await page.goto(appUrl(route, { vd, cihaz }))
  return page
}

/** Benzersiz kısa ad (sanal cihaz, profil adı): koşu ve proje başına çakışmaz. */
export function uniq(prefix: string): string {
  return `${prefix}${Date.now().toString(36).slice(-5)}${Math.floor(Math.random() * 1296)
    .toString(36)
    .padStart(2, '0')}`
}

/* ───────────── Giriş ───────────── */

/** Karşılama → "Demo hesabıyla devam et" → profil kapısında `profile` (web/mobil; sanal cihazda da çalışır). */
export async function signIn(page: Page, profile = 'Deniz', opts: DeviceOpts = {}): Promise<void> {
  if (opts.vd || opts.cihaz || page.url() === 'about:blank') await page.goto(appUrl('/', opts))
  await page.getByRole('button', { name: /Demo hesabıyla devam et/ }).click()
  await expect(page).toHaveURL(/#\/profiller/)
  await pickProfile(page, profile)
}

/** Profil kapısında kilitsiz bir profili seçer ve ana sayfayı bekler. */
export async function pickProfile(page: Page, profile: string): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Kim izliyor?' })).toBeVisible()
  await page.getByRole('button', { name: profile, exact: true }).click()
  await expect(page).toHaveURL(/#\/goz-at/)
}

/** Yalnız giriş (profil kapısında kalır). */
export async function loginOnly(page: Page, opts: DeviceOpts = {}): Promise<void> {
  await page.goto(appUrl('/', opts))
  await page.getByRole('button', { name: /Demo hesabıyla devam et/ }).click()
  await expect(page).toHaveURL(/#\/profiller/)
}

/* ───────────── TV kumandası ───────────── */

export const FOCUSED = '[data-focused="true"]'

/** Odaktaki öğenin okunur adı (aria-label, yoksa metin). */
export async function tvFocused(page: Page): Promise<string> {
  return page
    .locator(FOCUSED)
    .first()
    .evaluate((el) => (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().replace(/\s+/g, ' '))
    .catch(() => '')
}

export interface TvKeyOpts {
  /** Tam ekran oynatıcı gibi odaklanabilir öğe taşımayan ekranlarda sıfır odak da kabul */
  allowNone?: boolean
}

/**
 * Bir kumanda tuşuna basar ve ardından ekranda TAM OLARAK BİR odaklı öğe olduğunu doğrular
 * (UX_SPEC §7.6: odak hiçbir zaman kaybolmaz).
 */
export async function tvKey(page: Page, key: string, opts: TvKeyOpts = {}): Promise<string> {
  await page.keyboard.press(key)
  const focused = page.locator(FOCUSED)
  if (opts.allowNone) {
    await expect.poll(() => focused.count(), { message: `${key} sonrası en çok bir odak` }).toBeLessThanOrEqual(1)
  } else {
    await expect(focused, `${key} sonrası tam olarak bir odaklı öğe`).toHaveCount(1)
  }
  return tvFocused(page)
}

/** Odaktaki öğe `target` olana dek yön tuşlarıyla yürür (geometriye göre). */
export async function tvMoveTo(page: Page, target: Locator, maxSteps = 40): Promise<void> {
  let stuck = 0
  let lastKey = ''
  for (let i = 0; i < maxSteps; i++) {
    if ((await target.getAttribute('data-focused')) === 'true') return
    const [from, to] = await Promise.all([page.locator(FOCUSED).first().boundingBox(), target.boundingBox()])
    if (!from || !to) throw new Error('tvMoveTo: odak ya da hedef görünmüyor')
    const dx = to.x + to.width / 2 - (from.x + from.width / 2)
    const dy = to.y + to.height / 2 - (from.y + from.height / 2)
    const vertical = Math.abs(dy) > Math.min(from.height, to.height) / 2
    const horizontal = Math.abs(dx) > Math.min(from.width, to.width) / 2
    // Önce satır (dikey), sonra sütun; takılırsa öteki ekseni dene
    let key = vertical ? (dy > 0 ? 'ArrowDown' : 'ArrowUp') : dx > 0 ? 'ArrowRight' : 'ArrowLeft'
    if (stuck > 0 && vertical && horizontal) key = dx > 0 ? 'ArrowRight' : 'ArrowLeft'
    const before = await tvFocused(page)
    await tvKey(page, key)
    await page.waitForTimeout(120)
    const after = await tvFocused(page)
    stuck = after === before ? stuck + 1 : 0
    if (stuck > 3) throw new Error(`tvMoveTo: odak "${after}" üzerinde takıldı (${lastKey || key})`)
    lastKey = key
  }
  throw new Error('tvMoveTo: hedefe ulaşılamadı')
}

/** TV'de "Bu TV'de demo hesabıyla giriş yap" → profil (klavyeyle) → ana sayfa. */
export async function signInTv(page: Page, profile = 'Deniz'): Promise<void> {
  const demo = page.getByRole('button', { name: "Bu TV'de demo hesabıyla giriş yap" })
  await expect(demo).toBeVisible({ timeout: 30_000 })
  await tvMoveTo(page, demo)
  await tvKey(page, 'Enter')
  await tvChooseProfile(page, profile)
}

/** TV profil ekranında profile yürür ve açar. */
export async function tvChooseProfile(page: Page, profile = 'Deniz'): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Kim izliyor?' })).toBeVisible({ timeout: 30_000 })
  const tile = page.getByRole('region', { name: 'Kim izliyor?' }).getByRole('button', { name: profile, exact: true })
  await expect(tile).toBeVisible()
  await expect(page.locator(FOCUSED)).toHaveCount(1)
  await tvMoveTo(page, tile)
  await tvKey(page, 'Enter')
  await expect(page).toHaveURL(/#\/tv$/, { timeout: 30_000 })
  await expect(page.locator(FOCUSED)).toHaveCount(1, { timeout: 30_000 })
}

/* ───────────── Sayfanın oturumuyla REST ───────────── */

export interface ApiResult<T> {
  status: number
  json: T | null
  headers: Record<string, string>
}

/**
 * İsteği sayfanın içinden yollar: sanal cihaz başlığı (`?vd=`) ve oturumun CSRF başlığı (`authURL`) eklenir —
 * arayüzün yaptığı gibi. Yalnız kurulum / doğrulama için; kullanıcı eylemleri arayüzden yapılır.
 */
export async function pageApi<T = unknown>(
  page: Page,
  method: string,
  path: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  const res = await page.evaluate(
    async ({ method, path, body, vdHeader, authHeader, vdParam }) => {
      const headers: Record<string, string> = { accept: 'application/json' }
      const vd = new URLSearchParams(location.search).get(vdParam)
      if (vd) headers[vdHeader] = vd
      const boot = (await (await fetch('/api/boot', { headers })).json()) as { authURL?: string | null }
      if (boot.authURL) headers[authHeader] = boot.authURL
      if (body !== undefined) headers['content-type'] = 'application/json'
      const r = await fetch(path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      const text = await r.text()
      const out: Record<string, string> = {}
      r.headers.forEach((v, k) => (out[k] = v))
      let json: unknown = null
      try {
        json = text ? JSON.parse(text) : null
      } catch {
        json = null
      }
      return { status: r.status, json, headers: out }
    },
    {
      method,
      path,
      body,
      vdHeader: HEADERS.VIRTUAL_DEVICE,
      authHeader: HEADERS.AUTH_URL,
      vdParam: VIRTUAL_DEVICE_PARAM,
    },
  )
  return res as ApiResult<T>
}

/* ───────────── Modelin hazır olmasını bekleme ───────────── */

interface ModelInfo {
  ready: boolean
  version: string
  run: { status: string } | null
}

/** İlk açılışta arka planda üretilen sentetik örnek + topluluklar + tahmin modeli hazır olana dek yoklar. */
export async function waitForModel(page: Page, timeout = 120_000): Promise<ModelInfo> {
  let info: ModelInfo | null = null
  await expect
    .poll(
      async () => {
        const r = await pageApi<ModelInfo>(page, 'GET', '/api/studio/model')
        info = r.json
        return r.status === 200 && !!r.json?.ready && r.json.run?.status === 'DONE'
      },
      { timeout, intervals: [500, 1000, 2000], message: 'tahmin modeli hazır' },
    )
    .toBe(true)
  await expect
    .poll(
      async () => {
        const r = await pageApi<{ run: unknown; items: unknown[] }>(page, 'GET', '/api/studio/communities')
        return r.status === 200 && !!r.json?.run && (r.json?.items.length ?? 0) > 0
      },
      { timeout, intervals: [500, 1000, 2000], message: 'zevk toplulukları hazır' },
    )
    .toBe(true)
  return info!
}

/* ───────────── Oynatma ───────────── */

export interface VideoState {
  currentTime: number
  paused: boolean
  readyState: number
  width: number
  height: number
  bufferedEnd: number
  playbackRate: number
  error: string | null
}

/** Sayfadaki (ya da kapsayıcıdaki) ilk <video> öğesinin durumu. */
export async function videoState(page: Page, within?: Locator): Promise<VideoState | null> {
  const root = within ?? page.locator('body')
  const video = root.locator('video').first()
  if ((await video.count()) === 0) return null
  return video
    .evaluate((el: HTMLVideoElement) => {
      const b = el.buffered
      return {
        currentTime: el.currentTime,
        paused: el.paused,
        readyState: el.readyState,
        width: el.videoWidth,
        height: el.videoHeight,
        bufferedEnd: b.length ? b.end(b.length - 1) : 0,
        playbackRate: el.playbackRate,
        error: el.error ? el.error.message : null,
      }
    })
    .catch(() => null)
}

/** Video `sec` saniyeyi geçene dek bekler. */
export async function waitPlaying(page: Page, sec = 2, timeout = 60_000, within?: Locator): Promise<void> {
  await expect
    .poll(async () => (await videoState(page, within))?.currentTime ?? 0, {
      timeout,
      message: `video ${sec} sn'yi geçmeli`,
    })
    .toBeGreaterThan(sec)
}

/** Belgenin yatay taşması (piksel; 0 olmalı). */
export const horizontalOverflow = (page: Page): Promise<number> =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

/** Kalıcı GraphQL işlemlerinin adlarını sayar; ham sorgu metni görülürse işaretler. */
export function watchGraphql(page: Page): { ops: string[]; rawQuerySeen: boolean } {
  const state = { ops: [] as string[], rawQuerySeen: false }
  page.on('request', (req) => {
    if (!req.url().endsWith('/graphql') || req.method() !== 'POST') return
    const body = req.postDataJSON() as {
      operationName?: string
      query?: string
      extensions?: { persistedQuery?: { id?: string } }
    } | null
    if (body?.query) state.rawQuerySeen = true
    if (body?.operationName && body.extensions?.persistedQuery?.id) state.ops.push(body.operationName)
  })
  return state
}

export const offline = process.env.TVP_E2E_OFFLINE === '1'
/** Sintel'in medyası açık bir kökten ağ üzerinden gelir. */
export const NET = '(ağ gerekir)'

/**
 * Yönetici kipi ve Yönetici Paneli.
 *   - Kip kapalıyken iç işleyiş hiç görünmez: menüde Stüdyo / Kaputun altı / Yönetici Paneli yok, başlatıcı düğme yok.
 *   - #/yonetici: yanlış kod hata verir, doğru kod kipi açar; panel segmenti ve kararın gerekçesini gösterir.
 *   - Kip cihazda kalır (yenilemede sürer); "Yönetici kipinden çık" her şeyi yeniden gizler.
 * İzleme geçmişi olay ucundan beslenir (POST /log/web/cl/1): gerçek oynatma beklenmez, ağ gerekmez.
 */
import type { Page } from '@playwright/test'
import { E2E_ADMIN_CODE, expect, pageApi, signIn, test, waitForModel } from './helpers'

const isMobile = (page: Page) => (page.viewportSize()?.width ?? 0) < 900

/** Bir başlığı baştan sona izlenmiş gibi olay paketine çevirir (kalp atışları 30 sn'lik adımlarla). */
function watchedEvents(videoId: number, durationSec: number, seq0: number, ts0: number) {
  const viewableId = `Video:${videoId}`
  const ctx = `e2e-${videoId}-${ts0}`
  const events: { name: string; ts: number; seq: number; data: Record<string, unknown> }[] = []
  let seq = seq0
  let ts = ts0
  events.push({ name: 'playback.start', ts, seq: seq++, data: { viewableId, playbackContextId: ctx, positionSec: 0 } })
  for (let pos = 30; pos < durationSec; pos += 30) {
    ts += 30_000
    events.push({
      name: 'playback.heartbeat',
      ts,
      seq: seq++,
      data: { viewableId, playbackContextId: ctx, positionSec: pos },
    })
  }
  events.push({
    name: 'playback.end',
    ts: ts + 1000,
    seq: seq++,
    data: { viewableId, playbackContextId: ctx, positionSec: durationSec, durationSec, reason: 'ended' },
  })
  return events
}

/** Profilin izleme geçmişini besler: üç film baştan sona izlenmiş olur. */
async function seedViewing(page: Page): Promise<void> {
  const now = Date.now() - 3_600_000
  let seq = 1
  for (const [videoId, durationSec] of [
    [80010001, 600],
    [80010002, 600],
    [80010003, 600],
  ] as const) {
    const events = watchedEvents(videoId, durationSec, seq, now + seq * 1000)
    seq += events.length
    const r = await pageApi<{ accepted: number }>(page, 'POST', '/log/web/cl/1', {
      sessionId: `e2e-yonetici-${now}`,
      sentAt: Date.now(),
      events,
    })
    expect(r.status, 'olay paketi kabul edilir').toBe(200)
    expect(r.json?.accepted ?? 0).toBeGreaterThan(0)
  }
}

/** Yönetici girişlerinin göründüğü yer: masaüstünde profil menüsü, mobilde TV+'ım. */
async function openAccountSurface(page: Page): Promise<void> {
  if (isMobile(page)) await page.goto('/#/tvplusim')
  else await page.getByRole('button', { name: 'Profil: Deniz' }).click()
}

test.describe('Yönetici kipi', () => {
  test('kip kapalıyken iç işleyiş görünmez; yanlış kod hata verir, doğru kod paneli açar; çıkınca yine gizlenir', async ({
    page,
    issues,
  }) => {
    issues.allowHttp(/^\/api\/admin\/unlock/, [403])
    await signIn(page)

    // Kapalı: menüde yönetici girişi yok, başlatıcı düğme yok
    await openAccountSurface(page)
    for (const name of ['Yönetici Paneli', 'Stüdyo', 'Kaputun altı']) {
      await expect(page.getByRole(isMobile(page) ? 'link' : 'menuitem', { name })).toHaveCount(0)
      await expect(page.getByRole('button', { name })).toHaveCount(0)
    }
    await page.keyboard.press('Escape')

    // Kod girişi
    await page.goto('/#/yonetici')
    await expect(page.getByRole('heading', { name: 'Yönetici girişi', level: 1 })).toBeVisible()
    const code = page.getByLabel('Yönetici kodu')
    await code.fill('YANLIS-KOD')
    await page.getByRole('button', { name: 'Aç', exact: true }).click()
    await expect(page.getByRole('alert')).toHaveText('Yönetici kodu yanlış.')
    await expect(page.getByRole('heading', { name: 'Yönetici Paneli', level: 1 })).toHaveCount(0)

    // Doğru kod (küçük harf ve boşlukla da kabul edilir)
    await code.fill(E2E_ADMIN_CODE.toLowerCase().replace(/-/g, ' '))
    await page.getByRole('button', { name: 'Aç', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Yönetici Paneli', level: 1 })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Segmentim' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Ana sayfandaki satırlar' })).toBeVisible()

    // Açık: girişler görünür; yenilemede kip sürer
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Yönetici Paneli', level: 1 })).toBeVisible()
    await openAccountSurface(page)
    if (isMobile(page)) {
      await expect(page.getByRole('link', { name: /^Yönetici Paneli/ })).toBeVisible()
      await expect(page.getByRole('button', { name: /^Kaputun altı/ })).toBeVisible()
    } else {
      await expect(page.getByRole('menuitem', { name: 'Yönetici Paneli' })).toBeVisible()
      await expect(page.getByRole('menuitem', { name: 'Stüdyo' })).toBeVisible()
      await expect(page.getByRole('menuitem', { name: 'Kaputun altı' })).toBeVisible()
      await page.keyboard.press('Escape')
    }

    // Çıkış: her şey yeniden gizlenir, sayfa kod girişine döner
    await page.goto('/#/yonetici')
    await page.getByRole('button', { name: 'Yönetici kipinden çık' }).click()
    await expect(page).toHaveURL(/#\/goz-at$/)
    await page.goto('/#/yonetici')
    await expect(page.getByRole('heading', { name: 'Yönetici girişi', level: 1 })).toBeVisible()
  })

  test('panel: izleme geçmişinden segment ve gerekçesi; satırlar, alt türler ve modeller', async ({ page }) => {
    await signIn(page)
    await waitForModel(page)
    await seedViewing(page)

    await page.goto('/#/yonetici')
    await page.getByLabel('Yönetici kodu').fill(E2E_ADMIN_CODE)
    await page.getByRole('button', { name: 'Aç', exact: true }).click()
    const segment = page.getByRole('region', { name: 'Segmentim' })
    await expect(segment).toBeVisible()

    // Topluluklar arka planda yeniden hesaplanabilir: segment görünene dek yenile
    await expect
      .poll(
        async () => {
          if (await segment.getByText('Şu an bu toplulukta sayılıyorsun').count()) return true
          await page.getByRole('button', { name: 'Yenile' }).click()
          return false
        },
        { timeout: 60_000, intervals: [1000, 2000, 3000], message: 'segment atanır' },
      )
      .toBe(true)
    await expect(segment.getByRole('img', { name: /^Benzerlik %\d+$/ })).toBeVisible()
    await expect(segment.getByRole('heading', { name: 'Sistem nasıl karar verdi?' })).toBeVisible()
    await expect(segment.getByRole('heading', { name: 'Kararı en çok etkileyen özellikler' })).toBeVisible()
    await expect(segment.getByRole('heading', { name: 'Seni buraya çeken izlediklerin' })).toBeVisible()
    await expect(segment.getByText('Örnek veri').first()).toBeVisible()

    const history = page.getByRole('region', { name: 'İzleme özetim' })
    await expect(history.getByRole('link', { name: 'Sintel' })).toBeVisible()
    await expect(
      page.getByRole('region', { name: 'Ana sayfandaki satırlar' }).getByText('Kişisel').first(),
    ).toBeVisible()
    await expect(page.getByRole('region', { name: 'Alt tür motorunun seçtikleri' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Tahmin modeli' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Arama modeli' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(
      0,
    )
  })
})

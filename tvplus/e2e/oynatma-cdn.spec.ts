import type { Page } from '@playwright/test'
import { expect, NET, offline, pageApi, signIn, test, videoState, waitPlaying } from './helpers'

/**
 * CDN koşulları: etkin düğüm yavaşlatılınca uyarlamalı akış bit hızını düşürür; etkin düğüm kapatılınca oynatıcı
 * başka düğüme geçer ve yayın kesilmez. Düğüm durumu SUNUCU GENELİDİR: bu dosya `cdn` projesinde, öteki projeler
 * bittikten sonra tek başına ve sırayla koşar; her test düğümleri sıfırlayarak biter.
 * Gözlem kullanıcının gördüğü yerden: oynatıcının "i" ile açılan istatistik katmanı (Bit hızı, CDN).
 */
test.describe.configure({ mode: 'serial' })

async function readStats(page: Page): Promise<{ kbps: number; cdn: string }> {
  const stats = page.getByRole('region', { name: 'Oynatma istatistikleri' })
  if (!(await stats.isVisible())) {
    await page.keyboard.press('i')
    await expect(stats).toBeVisible()
  }
  const value = (label: string) => stats.locator(`dt:text-is("${label}") + dd`).innerText()
  const [bitrate, cdn] = await Promise.all([value('Bit hızı'), value('CDN')])
  return { kbps: Number(/(\d+)\s*kbps/.exec(bitrate)?.[1] ?? 0), cdn: cdn.trim() }
}

async function resetNodes(page: Page): Promise<void> {
  const r = await pageApi(page, 'POST', '/api/debug/oca/reset', {})
  expect(r.status).toBe(200)
}

test.describe('CDN koşulları', () => {
  test.skip(offline, 'ağ gerekir (TVP_E2E_OFFLINE=1)')

  test(`düğümler yavaşlayınca (Kaputun altı → CDN → Zayıf Wi-Fi 2 Mb) bit hızı düşer ${NET}`, async ({ page }) => {
    await signIn(page)
    await resetNodes(page)
    try {
      await page.goto('/#/izle/Video:80010001')
      await waitPlaying(page, 3)
      // ABR düşük kademeden başlar ve tampon dolunca tırmanır: üst kademelere çıkmasını bekle
      let before = { kbps: 0, cdn: '' }
      await expect
        .poll(async () => (before = await readStats(page)).kbps, {
          timeout: 60_000,
          intervals: [1000],
          message: 'bit hızı tırmanmalı',
        })
        .toBeGreaterThan(1500)
      expect(before.cdn).not.toBe('—')

      // "Kaputun altı" → CDN sekmesi: her düğümde "Zayıf Wi-Fi 2 Mb" (oynatıcı başka düğüme kaçıp hızlı kalamasın).
      // Panel izleme sayfasında oynatıcının üstünde açılmalı (bkz. rapor: z-index düzeltmesi).
      await page.keyboard.press('Control+.')
      await page.getByRole('tab', { name: 'CDN' }).click()
      const presets = page.getByRole('group', { name: / hazır ayarlar$/ })
      await expect(presets.first()).toBeVisible()
      const count = await presets.count()
      expect(count).toBeGreaterThanOrEqual(2)
      for (let i = 0; i < count; i++) {
        const chip = presets.nth(i).getByRole('button', { name: 'Zayıf Wi-Fi 2 Mb' })
        await chip.click()
        await expect(chip).toHaveAttribute('aria-pressed', 'true')
      }
      await expect
        .poll(async () => {
          const nodes = await pageApi<{ throughputKbps: number | null }[]>(page, 'GET', '/api/debug/oca')
          return (nodes.json ?? []).every((n) => n.throughputKbps === 2000)
        })
        .toBe(true)
      await page.keyboard.press('Control+.')

      await expect
        .poll(async () => (await readStats(page)).kbps, {
          timeout: 90_000,
          intervals: [1000, 2000],
          message: `bit hızı ${before.kbps} kbps'nin altına inmeli`,
        })
        .toBeLessThan(before.kbps)
      const v = await videoState(page)
      expect(v?.error).toBeNull()
    } finally {
      await resetNodes(page)
    }
  })

  test(`etkin düğüm kapanınca başka düğüme geçer, yayın kesilmez ${NET}`, async ({ page, issues }) => {
    await signIn(page)
    await resetNodes(page)
    try {
      await page.goto('/#/izle/Video:80010001')
      await waitPlaying(page, 3)
      let active = ''
      await expect
        .poll(async () => (active = (await readStats(page)).cdn), { message: 'etkin düğüm okunur' })
        .not.toMatch(/^(—|)$/)
      // Kapalı düğüme giden istekler hata döner (beklenen)
      issues.allowHttp(new RegExp(`^/oca/${active}/`))
      issues.allowHttp(/^\/oca\/anycast\//)
      const r = await pageApi(page, 'POST', `/api/debug/oca/${active}`, { down: true })
      expect(r.status).toBe(200)

      await expect
        .poll(async () => (await readStats(page)).cdn, { timeout: 60_000, message: 'başka düğüme geçmeli' })
        .not.toBe(active)
      const t = (await videoState(page))!.currentTime
      await expect
        .poll(async () => (await videoState(page))!.currentTime, { timeout: 30_000, message: 'yayın sürmeli' })
        .toBeGreaterThan(t + 3)
      expect((await videoState(page))?.error).toBeNull()
    } finally {
      await resetNodes(page)
    }
  })
})

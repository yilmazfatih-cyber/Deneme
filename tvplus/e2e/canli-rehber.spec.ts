import type { Locator, Page } from '@playwright/test'
import { expect, horizontalOverflow, NET, offline, signIn, test, videoState, waitPlaying } from './helpers'

/**
 * Canlı TV ve Rehber: canlı ana sayfanın vitrini kanal 1'in canlı görüntüsünü gerçekten oynatır, "Canlı İzle"
 * oynatıcıyı açar; rehber "şimdi"de açılır (kırmızı çizgi), gelecekteki bir programa hatırlatma kurulur, TV+'ım'da
 * görünür ve oradan kaldırılır.
 */

const isMobile = (page: Page) => (page.viewportSize()?.width ?? 0) < 900

test.describe('Canlı TV', () => {
  test.skip(offline, 'ağ gerekir (TVP_E2E_OFFLINE=1)')

  test(`vitrin kanal 1'i canlı oynatır, "Canlı İzle" oynatıcıyı açar ${NET}`, async ({ page }) => {
    await signIn(page)
    await page.goto('/#/canli')
    const hero = page.getByRole('region', { name: 'Şimdi TV+ Sinema kanalında' })
    await expect(hero).toBeVisible()
    await expect(hero.getByText(/\d\d:\d\d–\d\d:\d\d · .*kaldı/).first()).toBeVisible()
    await expect(hero.getByRole('progressbar', { name: 'Yayın ilerlemesi' })).toBeVisible()
    if (!isMobile(page)) {
      // Masaüstü vitrini: sessiz canlı önizleme gerçekten oynar
      await expect(hero.locator('video')).toHaveCount(1, { timeout: 30_000 })
      await waitPlaying(page, 1, 60_000, hero)
      const v = await videoState(page, hero)
      expect(v?.error ?? null).toBeNull()
    }
    await hero.getByRole('link', { name: 'Canlı İzle', exact: true }).click()
    await expect(page).toHaveURL(/#\/izle\/Channel:1/)
    await expect
      .poll(async () => (await videoState(page))?.readyState ?? 0, { timeout: 60_000 })
      .toBeGreaterThanOrEqual(3)
    await expect(page.getByText('CANLI').first()).toBeVisible()
    expect(await horizontalOverflow(page)).toBe(0)
  })
})

/** Bir kanal satırında yayındaki programdan sonraki ilk program bloğu. */
async function nextProgramme(row: Locator): Promise<{ block: Locator; title: string }> {
  await expect(row.getByRole('button', { name: /şu an yayında/ })).toBeVisible()
  const blocks = row.getByRole('button')
  const labels = await blocks.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''))
  const live = labels.findIndex((l) => l.includes('şu an yayında'))
  expect(live, 'yayındaki program').toBeGreaterThanOrEqual(0)
  const next = labels[live + 1]
  test.skip(!next, 'günün son programı yayında (gece yarısından sonra)')
  const title = next!.split(', ')[1]!
  return { block: blocks.nth(live + 1), title }
}

test.describe('Rehber', () => {
  test('rehber "şimdi"de açılır; hatırlatma kurulur, TV+\'ım\'da görünür ve kaldırılır', async ({ page }) => {
    test.skip(isMobile(page), 'aynı profilde paralel koşmasın diye hatırlatma masaüstünde')
    await signIn(page)
    await page.goto('/#/rehber')
    await expect(page.getByRole('heading', { name: 'Rehber', level: 1 })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Bugün' })).toHaveAttribute('aria-selected', 'true')
    const grid = page.getByRole('region', { name: /^Yayın akışı/ })
    // Açılışta şimdiye kaydırılmış: kanal 1'in yayındaki programı ve "şimdi" çizgisi görünür alanda
    const ch1 = grid.getByRole('group', { name: '1 TV+ Sinema' })
    await expect(ch1.getByRole('button', { name: /şu an yayında/ })).toBeInViewport()
    await expect(page.locator('.gd-now')).toBeInViewport()
    await expect(page.getByRole('button', { name: 'Şimdi' })).toBeVisible()
    expect(await horizontalOverflow(page)).toBe(0)

    // TRT Haber'in sıradaki programına hatırlatma
    const row = grid.getByRole('group', { name: '20 TRT Haber' })
    const { block, title } = await nextProgramme(row)
    await block.click()
    const remind = page.getByRole('button', { name: 'Hatırlat', exact: true })
    await expect(remind).toBeVisible()
    await remind.click()
    await expect(page.getByRole('button', { name: 'Hatırlatmayı Kaldır' })).toHaveAttribute('aria-pressed', 'true')
    await page.keyboard.press('Escape')
    await expect(block).toHaveAttribute('aria-label', /hatırlatma kurulu/)

    // TV+'ım → Hatırlatmalar
    await page.goto('/#/tvplusim')
    const section = page.locator('section', { has: page.getByRole('heading', { name: 'Hatırlatmalar' }) })
    await expect(section.getByText(title, { exact: true })).toBeVisible()
    await section.getByRole('button', { name: `${title} hatırlatmasını kaldır` }).click()
    await expect(page.getByText('Hatırlatma kaldırıldı')).toBeVisible()
    await expect(section.getByText(title, { exact: true })).toHaveCount(0)

    // Rehberde de kalktı (sayfa yeniden yüklenince: sunucuda kalktığının kanıtı)
    await page.goto('/#/rehber')
    await page.reload()
    const again = (await nextProgramme(page.getByRole('region', { name: /^Yayın akışı/ }).getByRole('group', { name: '20 TRT Haber' }))).block
    await expect(again).not.toHaveAttribute('aria-label', /hatırlatma kurulu/)
  })

  // UYGULAMA HATASI: TV+'ım'dan kaldırılan hatırlatma, aynı oturumda Rehber'e dönünce hâlâ "hatırlatma kurulu"
  // görünür. web/src/features/account/index.tsx `Reminders.remove` ham `SetReminder` yollar; Rehber'in dayandığı
  // web/src/features/live/actions.ts `reminderStore` geçersiz kılması ve 'Guide' sorgu önbelleği (120 sn) güncellenmez.
  test.fixme('TV+\'ım\'dan kaldırılan hatırlatma uygulama içinde Rehber\'e döner dönmez kalkar', async ({ page }) => {
    test.skip(isMobile(page), 'masaüstü')
    await signIn(page)
    await page.goto('/#/rehber')
    const row = page.getByRole('region', { name: /^Yayın akışı/ }).getByRole('group', { name: '20 TRT Haber' })
    const { block, title } = await nextProgramme(row)
    await block.click()
    await page.getByRole('button', { name: 'Hatırlat', exact: true }).click()
    await page.keyboard.press('Escape')
    await page.goto('/#/tvplusim')
    await page.getByRole('button', { name: `${title} hatırlatmasını kaldır` }).click()
    await expect(page.getByText('Hatırlatma kaldırıldı')).toBeVisible()
    await page.goto('/#/rehber')
    await expect((await nextProgramme(row)).block).not.toHaveAttribute('aria-label', /hatırlatma kurulu/)
  })

  test('mobil rehber kanal seçici ve dikey akışla açılır', async ({ page }) => {
    test.skip(!isMobile(page), 'mobil düzen')
    await signIn(page)
    await page.goto('/#/rehber')
    await expect(page.getByRole('heading', { name: 'Rehber', level: 1 }).first()).toBeVisible()
    await expect(page.getByRole('group', { name: 'Kanallar' })).toBeVisible()
    await expect(page.getByText(/şu an yayında|CANLI/i).first()).toBeVisible()
    expect(await horizontalOverflow(page)).toBe(0)
  })
})

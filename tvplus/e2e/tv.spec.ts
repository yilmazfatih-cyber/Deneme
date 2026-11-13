import type { Page } from '@playwright/test'
import {
  appUrl,
  expect,
  FOCUSED,
  NET,
  offline,
  signInTv,
  test,
  tvFocused,
  tvKey,
  tvMoveTo,
  videoState,
  waitPlaying,
} from './helpers'

/**
 * TV (10-foot) uygulaması yalnız klavyeyle (kumanda): yön tuşları, Enter (OK), Escape (Geri).
 * Her tuştan sonra ekranda TAM OLARAK BİR odaklı öğe olmalı (`data-focused`, UX_SPEC §7.6); tam ekran oynatıcıda
 * odaklanabilir öğe yoktur (tuşları oynatıcı işler).
 */

const heroTitle = (page: Page) => page.locator('[data-hero-title]').first()

/** Odaktaki kart etiketinden başlık: "2. Sintel" → "Sintel", "Charge, Yeni" → "Charge". */
const titleOf = (label: string) =>
  label.replace(/^\d+\.\s*/, '').replace(/, (Yeni|Yeni Bölüm|Son 3 Gün|\d+ dk kaldı).*$/, '')

async function openTv(page: Page): Promise<void> {
  await page.goto(appUrl('/', { cihaz: 'tv' }))
  await signInTv(page)
}

/** Geri'ye oynatıcıdan çıkana dek basar (ilk Geri bilgi şeridini gizleyebilir). */
async function backOutOfPlayer(page: Page): Promise<void> {
  for (let i = 0; i < 4 && /#\/tv\/izle\//.test(page.url()); i++) {
    await tvKey(page, 'Escape', { allowNone: true })
    await page.waitForTimeout(700)
  }
  await expect(page).not.toHaveURL(/#\/tv\/izle\//)
}

test.describe('TV uygulaması', () => {
  test('klavyeyle giriş → profil → ana sayfa; satırlarda tek odak, vitrin odaktaki başlığı izler', async ({ page }) => {
    await openTv(page)
    await expect(page.getByRole('region', { name: 'Ana Sayfa' })).toBeVisible()
    await expect(heroTitle(page)).not.toHaveText('')

    // Satırlar boyunca aşağı, satır içinde sağa: her adımda tek odak, vitrin başlığı odaktakini izler
    const seen = new Set<string>()
    for (const key of ['ArrowDown', 'ArrowDown', 'ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowRight', 'ArrowUp']) {
      const label = await tvKey(page, key)
      seen.add(label)
      await expect
        .poll(async () => (await heroTitle(page).textContent())?.trim(), { message: `vitrin: ${label}` })
        .toBe(titleOf(label))
    }
    expect(seen.size, 'odak gerçekten yer değiştirdi').toBeGreaterThan(4)
  })

  test('ilk kartta ← yan menüyü açar; menüden Diziler ve Canlı TV', async ({ page }) => {
    await openTv(page)
    const menu = page.getByRole('menu', { name: 'Ana menü' })
    // Satırın başına dön, sonra bir daha ← : yan menü
    for (let i = 0; i < 12 && !(await menu.locator(FOCUSED).count()); i++) await tvKey(page, 'ArrowLeft')
    await expect(menu.locator(FOCUSED)).toHaveText(/Ana Sayfa/)
    await tvMoveTo(page, menu.getByRole('menuitem', { name: 'Diziler' }))
    await tvKey(page, 'Enter')
    await expect(page).toHaveURL(/#\/tv\/kategori\/shows/)
    await expect(page.getByRole('heading', { name: "Türkiye'de Bugünün Top 10 Dizi Listesi" })).toBeVisible()
    expect(await tvFocused(page)).not.toBe('')

    for (let i = 0; i < 12 && !(await menu.locator(FOCUSED).count()); i++) await tvKey(page, 'ArrowLeft')
    await expect(menu.locator(FOCUSED)).toHaveText(/Diziler/)
    await tvMoveTo(page, menu.getByRole('menuitem', { name: 'Canlı TV' }))
    await tvKey(page, 'Enter')
    await expect(page).toHaveURL(/#\/tv\/canli/)
    await expect(page.getByRole('list', { name: 'Kanallar' }).locator(FOCUSED)).toHaveCount(1)
  })

  test('bir başlığı aç → Geri aynı karta döner', async ({ page }) => {
    await openTv(page)
    await tvKey(page, 'ArrowDown')
    const label = await tvKey(page, 'ArrowRight')
    await tvKey(page, 'Enter')
    await expect(page).toHaveURL(/#\/tv\/baslik\/\d+/)
    await expect(page.getByRole('heading', { level: 1, name: titleOf(label) })).toBeVisible()
    await tvKey(page, 'Escape')
    await expect(page).toHaveURL(/#\/tv$/)
    await expect.poll(() => tvFocused(page)).toBe(label)
  })

  test(`detay → Oynat: TV oynatıcısı Sintel'i oynatır, Geri çıkar ${NET}`, async ({ page }) => {
    test.skip(offline, 'ağ gerekir')
    await openTv(page)
    const card = page
      .getByRole('region', { name: "Türkiye'de Bugünün Top 10 Film Listesi" })
      .getByRole('button', { name: /^\d+\. Sintel$/ })
    await tvMoveTo(page, card)
    await tvKey(page, 'Enter')
    await expect(page).toHaveURL(/#\/tv\/baslik\/80010001/)
    await expect(page.getByRole('heading', { level: 1, name: 'Sintel' })).toBeVisible()
    const play = page.getByRole('button', { name: /^(Oynat|Devam Et)$/ })
    await tvMoveTo(page, play)
    await tvKey(page, 'Enter', { allowNone: true })
    await expect(page).toHaveURL(/#\/tv\/izle\/Video:80010001/)
    await expect(page.getByRole('region', { name: 'Oynatıcı: Sintel' })).toBeVisible()
    await waitPlaying(page, 2)
    expect((await videoState(page))?.error ?? null).toBeNull()
    await backOutOfPlayer(page)
    await expect(page).toHaveURL(/#\/tv\/baslik\/80010001/)
    await expect(page.locator(FOCUSED)).toHaveCount(1)
  })

  test('ekran klavyesiyle arama: iki harf, bir tahmin seç, sonuçlar gelir', async ({ page }) => {
    await openTv(page)
    const menu = page.getByRole('menu', { name: 'Ana menü' })
    for (let i = 0; i < 12 && !(await menu.locator(FOCUSED).count()); i++) await tvKey(page, 'ArrowLeft')
    await tvMoveTo(page, menu.getByRole('menuitem', { name: 'Ara' }))
    await tvKey(page, 'Enter')
    await expect(page).toHaveURL(/#\/tv\/ara/)
    const keyboard = page.getByRole('group', { name: 'Ekran klavyesi' })
    await expect(page.getByRole('region', { name: 'Sana Özel Öneriler' })).toBeVisible()
    for (const letter of ['s', 'i']) {
      await tvMoveTo(page, keyboard.getByRole('button', { name: letter, exact: true }))
      await tvKey(page, 'Enter')
    }
    const box = page.getByRole('search')
    await expect(box).toHaveText(/si/)
    const predictions = page.getByRole('list', { name: 'Tahminler' }).getByRole('listitem')
    await expect(predictions.first()).toBeVisible()
    const pick = predictions.first()
    const text = ((await pick.getAttribute('aria-label')) ?? '').replace(/^Şunu ara: /, '')
    expect(text).not.toBe('')
    await tvMoveTo(page, pick)
    await tvKey(page, 'Enter')
    await expect(box).toHaveText(text)
    await expect(page.getByRole('region', { name: 'Film ve Diziler' }).getByRole('button').first()).toBeVisible()
  })

  test(`Canlı TV listesi: sahne odaktaki kanalı izler; OK tam ekran, Geri listeye ${NET}`, async ({ page }) => {
    test.skip(offline, 'ağ gerekir')
    await openTv(page)
    const menu = page.getByRole('menu', { name: 'Ana menü' })
    for (let i = 0; i < 12 && !(await menu.locator(FOCUSED).count()); i++) await tvKey(page, 'ArrowLeft')
    await tvMoveTo(page, menu.getByRole('menuitem', { name: 'Canlı TV' }))
    await tvKey(page, 'Enter')
    await expect(page).toHaveURL(/#\/tv\/canli/)
    const channels = page.getByRole('list', { name: 'Kanallar' })
    await tvMoveTo(page, channels.getByRole('listitem', { name: /^1 TV\+ Sinema/ }))
    await expect(page.getByRole('region', { name: 'TV+ Sinema kanalı' })).toBeVisible()
    await tvKey(page, 'ArrowDown')
    await expect(page.getByRole('region', { name: 'TRT Haber kanalı' })).toBeVisible()
    await tvKey(page, 'ArrowUp')
    const stage = page.getByRole('region', { name: 'TV+ Sinema kanalı' })
    await expect(stage).toBeVisible()
    await waitPlaying(page, 0.5, 60_000)
    await tvKey(page, 'Enter', { allowNone: true })
    await expect(page).toHaveURL(/#\/tv\/izle\/Channel:1/)
    await expect(page.getByRole('region', { name: /^Oynatıcı: TV\+ Sinema/ })).toBeVisible()
    await expect
      .poll(async () => (await videoState(page))?.readyState ?? 0, { timeout: 60_000 })
      .toBeGreaterThanOrEqual(3)
    await backOutOfPlayer(page)
    await expect(page).toHaveURL(/#\/tv\/canli/)
    await expect(channels.locator(FOCUSED)).toHaveText(/TV\+ Sinema/)
  })

  test('~150 tuşluk rastgele yürüyüş odağı hiç kaybetmez ve hata fırlatmaz', async ({ page }) => {
    await openTv(page)
    // Tohumlu sözde rastgele: başarısızlık aynı diziyle yeniden üretilebilir
    let seed = Number(process.env.TVP_E2E_SEED ?? 20261113)
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed / 2147483648
    }
    const keys = [
      'ArrowDown',
      'ArrowDown',
      'ArrowUp',
      'ArrowRight',
      'ArrowRight',
      'ArrowRight',
      'ArrowLeft',
      'ArrowLeft',
      'Enter',
      'Escape',
    ]
    const trail: string[] = []
    for (let i = 0; i < 150; i++) {
      const inPlayer = /#\/tv\/izle\//.test(page.url())
      // Oynatıcıya düşülürse hemen çık: yürüyüş göz atma ekranlarındaki odağı denetler
      const key = inPlayer ? 'Escape' : keys[Math.floor(rnd() * keys.length)]!
      trail.push(key)
      await page.keyboard.press(key)
      await page.waitForTimeout(60)
      const n = await page.locator(FOCUSED).count()
      const nowInPlayer = /#\/tv\/izle\//.test(page.url())
      if (nowInPlayer) {
        expect(n, `oynatıcıda en çok bir odak (adım ${i})`).toBeLessThanOrEqual(1)
        continue
      }
      // Ekran geçişinde odak bir sonraki karede kurulur: kısa bekleme payı
      await expect(page.locator(FOCUSED), `adım ${i}: ${trail.slice(-6).join(' ')} · ${page.url()}`).toHaveCount(1, {
        timeout: 5_000,
      })
    }
    expect(page.url()).toContain('#/tv')
  })
})

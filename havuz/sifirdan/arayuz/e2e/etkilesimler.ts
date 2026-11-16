// Her gösterim için "temel etkileşim": sayfanın gerçekten çalıştığını gösteren en küçük kullanıcı akışı.
// Kural testi (test/kurallar.test.ts) kayıttaki her gösterimin burada bir girdisi olduğunu denetler.
// Genişletme: YENİ GÖSTERİM BURAYA → gösterim adıyla bir işlev ekleyin.
import { expect, type Page } from '@playwright/test'

export const etkilesimler: Record<string, (page: Page) => Promise<void>> = {
  sinyal: async (page) => {
    await page.getByRole('button', { name: 'Adedi artır' }).click()
    await expect(page.locator('#toplam')).toContainText('388,80')
  },
  sanal_dom: async (page) => {
    await page.getByLabel('Yeni görev').fill('Ekmek al')
    await page.getByRole('button', { name: 'Ekle', exact: true }).click()
    await expect(page.getByText('Ekmek al')).toBeVisible()
  },
  yonlendirici: async (page) => {
    await page.getByRole('link', { name: 'Kullanıcılar' }).click()
    await expect(page.getByRole('heading', { level: 2, name: 'Kullanıcılar' })).toBeVisible()
    await expect(page).toHaveURL(/#\/kullanicilar$/)
  },
  depo: async (page) => {
    await page.getByLabel('Yeni not').fill('Deneme notu')
    await page.getByRole('button', { name: 'Ekle', exact: true }).click()
    await expect(page.getByText('Deneme notu', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Geri al' }).click()
    await expect(page.getByText('Deneme notu', { exact: true })).toHaveCount(0)
  },
  form: async (page) => {
    await page.getByRole('button', { name: 'İleri' }).click()
    await expect(page.locator('[data-error-for="kullaniciAdi"]')).toHaveText('Bu alan zorunlu.')
    await expect(page.locator('#kullaniciAdi')).toBeFocused()
    await expect(page.locator('#kullaniciAdi')).toHaveAttribute('aria-invalid', 'true')
  },
  tablo: async (page) => {
    await page.locator('#hucre-E2').click()
    await page.keyboard.type('=2+3')
    await page.keyboard.press('Enter')
    await expect(page.locator('#hucre-E2')).toHaveText('5')
    await expect(page.locator('#hucre-D6')).toHaveText('51.750,5')
  },
  duzenleyici: async (page) => {
    await page.locator('#yuzey').click({ position: { x: 60, y: 20 } })
    await page.keyboard.press('End')
    await page.keyboard.type(' ekledim')
    await expect(page.locator('.satir-metni').first()).toContainText('ekledim')
    await page.getByRole('button', { name: 'Tümünü değiştir' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'değiştirildi' })).toBeVisible()
  },
  oyun_motoru: async (page) => {
    await page.getByRole('button', { name: 'Başla', exact: true }).click()
    await page.keyboard.down('ArrowRight')
    await page.waitForTimeout(600)
    await page.keyboard.up('ArrowRight')
    await expect(page.locator('#hud')).not.toContainText('Süre 0,0 sn')
  },
  isin_izleyici: async (page) => {
    await expect(page.locator('#durum')).toContainText('Bitti', { timeout: 60_000 })
    await expect(page.getByRole('button', { name: 'PNG indir' })).toBeEnabled()
  },
  grafik: async (page) => {
    const plot = page.locator('.grafik-cizim').first()
    await plot.focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.locator('[aria-live="polite"]').first()).toContainText('Gelir — Oca')
  },
  paketleyici: async (page) => {
    await page.getByRole('button', { name: 'Çalıştır' }).click()
    await expect(page.locator('#sonuc')).toContainText('İSTANBUL VE IRMAK')
    await expect(page.locator('#cikti')).not.toContainText('function carp')
  },
  animasyon: async (page) => {
    const first = page.locator('#sehirler li').first()
    await expect(first).toHaveText('İstanbul')
    await page.getByRole('button', { name: 'Karıştır' }).click()
    await expect(first).not.toHaveText('İstanbul')
  },
  sanal_liste: async (page) => {
    await page.getByRole('button', { name: '5.000. mesaja git' }).click()
    await expect(page.getByText(/^Mesaj 5000:/)).toBeVisible()
    expect(await page.locator('[role="listitem"]').count()).toBeLessThan(60)
  },
  // YENİ GÖSTERİM BURAYA (npm run gen -- <ad> buraya bir girdi ekler)
}

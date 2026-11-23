/**
 * Belgeye soru uçtan uca: GERÇEK API (derlenmiş web'i sunar) + GERÇEK yz sunucusu (sahte sağlayıcı, örnek
 * belgeler, anahtarlı). Kayıt → Sor sayfası → belgede olan soru (yanıt + kaynak) → belgede olmayan soru →
 * çevrimdışı ileti. Her ekranda erişilebilirlik taraması ve 360 px'te yatay kaydırma denetimi.
 */
import { expect, test, type Page } from '@playwright/test'
import { expectAccessible, expectNoHorizontalScroll, register, uniqueEmail } from '../support/helpers.ts'

async function openSor(page: Page): Promise<void> {
  await register(page, { name: 'Ayşe', email: uniqueEmail('sor') })
  await expect(page.getByRole('heading', { level: 1, name: 'Görevler' })).toBeVisible()
  await page.goto('./#/sor')
  await expect(page.getByRole('heading', { level: 1, name: 'Belgelere sor' })).toBeVisible()
}

async function ask(page: Page, question: string): Promise<void> {
  await page.getByRole('textbox', { name: 'Sorunuz' }).fill(question)
  await page.getByRole('button', { name: 'Sor', exact: true }).click()
}

test('belgede olan soru: yanıt, kaynak ve alıntı görünür', async ({ page }) => {
  await openSor(page)
  await expect(page.getByRole('heading', { name: 'Belgelerinize bir soru sorun' })).toBeVisible()
  await expectAccessible(page, 'sor (boş)')
  await ask(page, 'Ürünü kaç gün içinde iade edebilirim?')
  const answer = page.getByRole('heading', { name: 'Yanıt' })
  await expect(answer).toBeVisible()
  await expect(page.getByText(/14 gün/).first()).toBeVisible()
  const source = page.getByText(/^\[1\] iade\.md/)
  await expect(source).toBeVisible()
  await source.click()
  await expect(page.getByText(/teslimden sonraki 14 gün/).last()).toBeVisible()
  await expectAccessible(page, 'sor (yanıt)')
  await expectNoHorizontalScroll(page)
})

test('belgede olmayan soru: "belgelerde bulunamadı" der, uydurmaz', async ({ page }) => {
  await openSor(page)
  await ask(page, 'Şirketin genel müdürü kimdir?')
  await expect(page.getByText('Bu sorunun yanıtı belgelerde bulunamadı.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Kaynaklar' })).toHaveCount(0)
})

test('çevrimdışıyken gönderme kapalı ve nedeni yazılı; bağlantı gelince açılır', async ({ page, context }) => {
  await openSor(page)
  await page.getByRole('textbox', { name: 'Sorunuz' }).fill('Kargo ücreti ne kadar?')
  await context.setOffline(true)
  await expect(page.getByText(/Çevrimdışısınız/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sor', exact: true })).toBeDisabled()
  await expectAccessible(page, 'sor (çevrimdışı)')
  await context.setOffline(false)
  await expect(page.getByRole('button', { name: 'Sor', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Sor', exact: true }).click()
  await expect(page.getByText(/500 TL/).first()).toBeVisible()
})

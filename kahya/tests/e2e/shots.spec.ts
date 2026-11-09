import { test, type Page } from '@playwright/test'

// Belgeler için ekran görüntüleri: SHOTS=1 npm run shots → docs/ekran/*.png
test.skip(!process.env.SHOTS, 'Ekran görüntüleri yalnız SHOTS=1 ile alınır')

const OUT = 'docs/ekran'

test.use({ deviceScaleFactor: 2 })
const shot = (page: Page, name: string) => page.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 80 })

async function staff(page: Page) {
  await page.goto('/')
  await page.getByLabel('E-posta').fill('elif@yildizyonetim.example')
  await page.getByLabel('Parola').fill('Kahya!2026')
  await page.getByRole('button', { name: 'Giriş yap' }).click()
  await page.getByText('Akıllı uyarılar').waitFor()
}

const settle = async (page: Page) => {
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(300)
}

test('yönetim paneli', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await shot(page, '00-giris')
  await staff(page)
  await settle(page)
  await shot(page, '01-pano')
  await page.goto('/gelen-kutusu/1')
  await settle(page)
  await shot(page, '02-gelen-kutusu')
  await page.goto('/onaylar')
  await settle(page)
  await shot(page, '03-onaylar')
  await page.goto('/finans')
  await settle(page)
  await shot(page, '04-finans')
  await page.goto('/finans/banka/1')
  await settle(page)
  await shot(page, '05-banka-eslestirme')
  await page.goto('/finans/butce/1')
  await settle(page)
  await shot(page, '06-isletme-projesi')
  await page.goto('/talepler')
  await settle(page)
  await shot(page, '07-talepler')
  await page.goto('/genel-kurul/2')
  await settle(page)
  await page.getByRole('tab', { name: 'Tutanak' }).click()
  await shot(page, '08-genel-kurul-tutanak')
  await page.goto('/kontroller')
  await settle(page)
  await shot(page, '09-periyodik-kontroller')
  await page.goto('/ayarlar')
  await settle(page)
  await shot(page, '10-ayarlar')
})

test('sakin portalı (telefon)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Sakin' }).click()
  await page.getByLabel('Cep telefonu').fill('0533 200 00 00')
  await page.getByRole('button', { name: 'Kod gönder' }).click()
  const code = (await page.locator('.alert.info b').textContent())!.trim()
  await page.getByLabel('SMS ile gelen 6 haneli kod').fill(code)
  await page.getByRole('button', { name: 'Giriş yap' }).click()
  await page.getByText('Hesap ekstresi').waitFor()
  await settle(page)
  await shot(page, '11-portal-ozet')
  await page.goto('/portal/asistan')
  await page.getByRole('button', { name: 'Havuz kaçta kapanıyor?' }).click()
  await page.locator('.bubble.bot').waitFor()
  await shot(page, '12-portal-asistan')
  await page.goto('/portal/talepler')
  await settle(page)
  await shot(page, '13-portal-talepler')
})

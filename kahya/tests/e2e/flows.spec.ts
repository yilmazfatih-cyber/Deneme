import { expect, test, type Page } from '@playwright/test'

const ADMIN = { email: 'elif@yildizyonetim.example', password: 'Kahya!2026' }

async function staffLogin(page: Page) {
  await page.goto('/')
  await page.getByLabel('E-posta').fill(ADMIN.email)
  await page.getByLabel('Parola').fill(ADMIN.password)
  await page.getByRole('button', { name: 'Giriş yap' }).click()
  await expect(page.getByText('Akıllı uyarılar')).toBeVisible()
}

async function residentLogin(page: Page, phone: string) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Sakin' }).click()
  await page.getByLabel('Cep telefonu').fill(phone)
  await page.getByRole('button', { name: 'Kod gönder' }).click()
  const code = (await page.locator('.alert.info b').textContent())!.trim()
  await page.getByLabel('SMS ile gelen 6 haneli kod').fill(code)
  await page.getByRole('button', { name: 'Giriş yap' }).click()
}

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (e) => {
    throw new Error(`Sayfa hatası: ${e.message}`)
  })
})

test('pano, gelen kutusu ve yanıt onayı', async ({ page }) => {
  await staffLogin(page)
  await expect(page.getByText('Toplam alacak')).toBeVisible()
  await page
    .getByRole('link', { name: /Gelen kutusu/ })
    .first()
    .click()
  await page.getByRole('button', { name: /Ayşe Kaya/ }).click()
  await expect(page.getByText('Yapay zekâ sınıflandırması')).toBeVisible()
  await page.getByRole('button', { name: 'Onayla ve gönder' }).first().click()
  await expect(page.getByRole('status').getByText(/Yanıt whatsapp ile gönderildi/)).toBeVisible()
})

test('acil mesaj: talep açılır ve güvenlik talimatı görünür', async ({ page }) => {
  await staffLogin(page)
  await page.goto('/gelen-kutusu')
  await page.getByRole('button', { name: 'Mesaj benzet (demo)' }).click()
  await page.getByRole('dialog').getByRole('textbox').last().fill('Merdiven boşluğunda yoğun gaz kokusu var!')
  await page.getByRole('dialog').getByRole('button', { name: 'Gönder' }).click()
  await expect(page.getByText(/Güvenlik talimatı: .*187/)).toBeVisible()
  await page.getByRole('link', { name: /^Talep #\d+/ }).click()
  await expect(page.locator('.badge', { hasText: 'Acil' }).first()).toBeVisible()
})

test('banka dökümü eşleştirilir ve tahsilata dönüşür', async ({ page }) => {
  await staffLogin(page)
  await page.goto('/finans?sekme=banka')
  await page.locator('a.list-item').first().click()
  await page.getByRole('button', { name: /Seçilenleri onayla/ }).click()
  await expect(page.getByRole('status').getByText(/tahsilat kaydedildi/)).toBeVisible()
  await expect(page.locator('.badge', { hasText: 'Kaydedildi' }).first()).toBeVisible()
})

test('genel kurul: katılım yeter sayıyı değiştirir', async ({ page }) => {
  await staffLogin(page)
  await page.goto('/genel-kurul')
  await page
    .getByRole('link', { name: /Olağan Kat Malikleri Kurulu/ })
    .first()
    .click()
  await expect(page.getByText('Sağlanmadı')).toBeVisible()
  const boxes = page.locator('tbody input[type=checkbox]')
  const n = await boxes.count()
  for (let i = 0; i < Math.ceil(n / 2) + 1; i++) await boxes.nth(i).check()
  await expect(page.getByText('Sağlandı', { exact: true })).toBeVisible()
})

test('sakin: borcunu görür, talep açar ve kartla öder', async ({ page }) => {
  await residentLogin(page, '0532 111 22 33')
  await expect(page.getByRole('heading', { name: 'Merhaba Ayşe' })).toBeVisible()
  await page.goto('/portal/talepler')
  await page.getByPlaceholder(/lavabo/).fill('Banyodaki musluk sürekli damlatıyor')
  await page.getByRole('button', { name: 'Gönder' }).click()
  await expect(page.getByText(/Talep no #\d+/)).toBeVisible()
  await page.goto('/portal')
  await page.getByRole('link', { name: 'Kartla öde' }).click()
  await page.getByRole('button', { name: /öde$/ }).click()
  await expect(page.getByText('Test ödeme sayfası')).toBeVisible()
  await page.getByRole('button', { name: 'Ödemeyi onayla' }).click()
  await expect(page.getByText('Ödemeniz alındı.')).toBeVisible()
})

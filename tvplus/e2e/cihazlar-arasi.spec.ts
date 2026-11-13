import type { BrowserContext, Page } from '@playwright/test'
import type { DeviceInfo } from '../shared/devices'
import {
  appUrl,
  expect,
  FOCUSED,
  NET,
  offline,
  openDevice,
  pageApi,
  signIn,
  signInTv,
  test,
  tvFocused,
  uniq,
  videoState,
  waitPlaying,
} from './helpers'

/**
 * Cihazlar arası deneyim, tek tarayıcı bağlamında ayrı sanal cihazlarla (`?vd=<ad>&cihaz=<biçim>`): TV'de QR / kodla
 * giriş, telefonun kumanda olması, web'den TV'ye yansıtma ve geri alma, TV oturumunu uzaktan kapatma, cihaz vitrini.
 * Aynı hesapta başka testlerin TV'leri de çevrimiçi olabilir (paralel `tv` projesi): her test kendi TV'sini adıyla
 * seçer — evde iki TV varmış gibi.
 */
test.describe.configure({ timeout: 180_000 })

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** TV giriş ekranındaki kod ("Giriş için QR kodu: HF5Z-D4R9"). */
async function tvLoginCode(tv: Page): Promise<string> {
  const qr = tv.getByRole('img', { name: /^Giriş için QR kodu: / })
  await expect(qr).toBeVisible({ timeout: 30_000 })
  const code = /([A-Z0-9]{4}-[A-Z0-9]{4})/.exec((await qr.getAttribute('alt')) ?? '')?.[1]
  expect(code, 'TV kodu').toBeTruthy()
  await expect(tv.getByText(code!, { exact: true })).toBeVisible()
  return code!
}

/** Bu sayfanın cihaz kaydı. */
async function thisDevice(page: Page): Promise<DeviceInfo> {
  let me: DeviceInfo | undefined
  await expect
    .poll(async () => {
      const r = await pageApi<{ devices: DeviceInfo[] }>(page, 'GET', '/api/devices')
      me = r.json?.devices.find((d) => d.isThisDevice && d.online)
      return !!me
    })
    .toBe(true)
  return me!
}

/** TV'yi açar, kendi düğmesiyle demo hesabına girer ve ayırt edilir bir ad verir. */
async function signedInTv(context: BrowserContext): Promise<{ tv: Page; name: string; id: string }> {
  const vd = uniq('tv')
  const tv = await openDevice(context, vd, 'tv', '/')
  await signInTv(tv)
  const me = await thisDevice(tv)
  const name = `E2E TV ${vd}`
  const r = await pageApi(tv, 'PATCH', `/api/devices/${me.deviceId}`, { name })
  expect(r.status).toBe(200)
  return { tv, name, id: me.deviceId }
}

/** Kumanda sayfasında hedef TV'yi adıyla seçer (birden çok TV çevrimiçiyse seçici açılır). */
async function chooseRemoteTarget(phone: Page, tvName: string): Promise<void> {
  const header = phone.locator('button[aria-haspopup="dialog"]').filter({ hasText: /\S/ }).first()
  await expect(header).toBeVisible()
  await expect
    .poll(
      async () => {
        if ((await header.innerText()).includes(tvName)) return true
        const inline = phone.getByRole('button', { name: new RegExp(`^${esc(tvName)}`) })
        if (await inline.first().isVisible()) {
          await inline.first().click()
        } else {
          await header.click()
          const sheet = phone.getByRole('dialog', { name: 'Kumanda edilecek TV' })
          const choice = sheet.getByRole('button', { name: new RegExp(`^${esc(tvName)}`) })
          if (await choice.isVisible().catch(() => false)) await choice.click()
          else await phone.keyboard.press('Escape')
        }
        return (await header.innerText()).includes(tvName)
      },
      { timeout: 30_000, message: `kumanda hedefi ${tvName}` },
    )
    .toBe(true)
  await expect(phone.getByRole('status').filter({ hasText: 'Bağlı' })).toBeVisible()
}

test.describe('QR / kodla TV girişi', () => {
  test('TV QR ve kod gösterir → telefon /bagla?kod= ile onaylar → TV kendiliğinden ana sayfaya geçer', async ({
    context,
  }) => {
    const tv = await openDevice(context, uniq('tv'), 'tv', '/')
    const code = await tvLoginCode(tv)
    await expect(tv.getByText(/\/#\/bagla/)).toBeVisible()

    const phone = await context.newPage()
    await phone.setViewportSize({ width: 390, height: 844 })
    await signIn(phone, 'Deniz', { vd: uniq('tel'), cihaz: 'mobil' })
    await phone.goto(appUrl(`/bagla?kod=${code}`, { vd: new URL(phone.url()).searchParams.get('vd')!, cihaz: 'mobil' }))
    await expect(phone.getByRole('heading', { name: /bu hesaba bağlanmak istiyor$/ })).toBeVisible()
    await expect(phone.getByText('Bu cihazda oturum açılsın mı?')).toBeVisible()
    await expect(phone.getByText(code, { exact: true })).toBeVisible()
    await phone.getByText('Deniz', { exact: true }).click()
    await phone.getByRole('button', { name: 'Onayla' }).click()
    await expect(phone.getByRole('heading', { name: / bağlandı$/ })).toBeVisible()

    // TV hiçbir tuşa basılmadan profilli ana sayfaya geçer
    await expect(tv).toHaveURL(/#\/tv$/, { timeout: 30_000 })
    await expect(tv.locator(FOCUSED)).toHaveCount(1)
    await expect(tv.getByRole('region', { name: 'Ana Sayfa' })).toBeVisible()
  })

  test('oturumsuz telefon /bagla?kod= → karşılama → demo girişi → koda geri döner; "TV\'de seçerim"', async ({
    context,
  }) => {
    const tv = await openDevice(context, uniq('tv'), 'tv', '/')
    const code = await tvLoginCode(tv)
    const phoneVd = uniq('tel')
    const phone = await openDevice(context, phoneVd, 'mobil', `/bagla?kod=${code}`)
    await expect(phone).toHaveURL(/#\/karsilama/)
    await phone.getByRole('button', { name: /Demo hesabıyla devam et/ }).click()
    // Profil seçmeden onay ekranına döner (kod adreste korunur)
    await expect(phone).toHaveURL(new RegExp(`#/bagla\\?kod=${code}`))
    await expect(phone.getByRole('heading', { name: /bu hesaba bağlanmak istiyor$/ })).toBeVisible()
    await phone.getByText("TV'de seçerim", { exact: true }).click()
    await phone.getByRole('button', { name: 'Onayla' }).click()
    await expect(phone.getByRole('heading', { name: / bağlandı$/ })).toBeVisible()

    // TV kendiliğinden profil seçimine geçer; profil kumandayla seçilir
    await expect(tv).toHaveURL(/#\/tv\/profiller/, { timeout: 30_000 })
    await expect(tv.getByRole('heading', { name: 'Kim izliyor?' })).toBeVisible()
    await expect(tv.locator(FOCUSED)).toHaveCount(1)
    await tv.keyboard.press('Enter')
    await expect(tv).toHaveURL(/#\/tv$/)
  })
})

test.describe('telefon kumanda', () => {
  test("/kumanda yön tuşu TV'de odağı taşır; telefondan yazılan TV'deki arama kutusuna gider", async ({ context }) => {
    const { tv, name } = await signedInTv(context)
    const phone = await context.newPage()
    await phone.setViewportSize({ width: 390, height: 844 })
    await signIn(phone, 'Deniz', { vd: uniq('tel'), cihaz: 'mobil' })
    await phone.goto(phone.url().replace(/#.*$/, '#/kumanda'))
    await chooseRemoteTarget(phone, name)

    await phone.getByRole('radio', { name: 'Yön tuşları' }).click()
    const before = await tvFocused(tv)
    await phone.getByRole('button', { name: 'Sağ', exact: true }).click()
    await expect.poll(() => tvFocused(tv), { message: 'TV odağı sağa geçmeli' }).not.toBe(before)
    await expect(tv.locator(FOCUSED)).toHaveCount(1)
    const afterRight = await tvFocused(tv)
    await phone.getByRole('button', { name: 'Aşağı', exact: true }).click()
    await expect.poll(() => tvFocused(tv)).not.toBe(afterRight)

    // "Ara": TV arama ekranına geçer, telefon klavyesi açılır; yazılan TV'deki kutuya düşer
    await phone.getByRole('button', { name: 'Ara', exact: true }).click()
    await expect(tv).toHaveURL(/#\/tv\/ara/)
    const typer = phone
      .getByRole('textbox', { name: "TV'deki arama kutusuna yaz" })
      .or(phone.getByRole('searchbox', { name: "TV'deki arama kutusuna yaz" }))
    await expect(typer).toBeVisible()
    await typer.pressSequentially('sin', { delay: 120 })
    await expect(tv.getByRole('search')).toHaveText(/sin/i)
    await expect(tv.getByRole('region', { name: 'Film ve Diziler' }).getByRole('button').first()).toBeVisible()
  })
})

test.describe('yansıtma', () => {
  test.skip(offline, 'ağ gerekir (TVP_E2E_OFFLINE=1)')

  test(`web'den TV'ye yansıt → "Şu an TV'de" kartından duraklat → Bu Cihazda Devam Et ${NET}`, async ({
    context,
    page,
  }) => {
    // Evde iki TV: yansıtma seçicisi her koşuda açılır (oynatıcının üstünde görünmeli)
    const { tv, name } = await signedInTv(context)
    await signedInTv(context)
    await signIn(page, 'Deniz', { vd: uniq('web'), cihaz: 'web' })
    // Oynatma uygulama içinden başlar (detay penceresi → Oynat / Devam Et)
    await page.goto(page.url().replace(/#.*$/, '#/goz-at?jbv=80010001'))
    await page
      .getByRole('dialog', { name: 'Sintel' })
      .getByRole('link', { name: /^(Oynat|Devam Et), Sintel/ })
      .click()
    await expect(page).toHaveURL(/#\/izle\/Video:80010001/)
    const start = (await videoState(page))?.currentTime ?? 0
    await waitPlaying(page, start + 6)

    // Oynatıcıdaki "TV'de İzle"; birden çok TV varsa seçiciden bizimki
    await page.mouse.move(700, 450)
    await page.mouse.move(720, 460, { steps: 3 })
    await page.getByRole('button', { name: "TV'de İzle" }).click()
    const picker = page.getByRole('dialog', { name: "TV'de İzle" })
    await expect(picker).toBeVisible()
    await picker.getByRole('button', { name: new RegExp(`^${esc(name)}`) }).click()
    const handedOver = (await videoState(page))?.currentTime ?? 0

    // TV kaldığı yerden oynatır
    await expect(tv).toHaveURL(/#\/tv\/izle\/Video:80010001/, { timeout: 30_000 })
    await expect
      .poll(async () => (await videoState(tv))?.readyState ?? 0, { timeout: 60_000 })
      .toBeGreaterThanOrEqual(2)
    const tvPos = (await videoState(tv))!.currentTime
    expect(tvPos, 'devredilen konumdan (baştan değil)').toBeGreaterThan(handedOver - 5)
    expect(tvPos, 'devredilen konumun yakınında').toBeLessThan(handedOver + 30)
    await waitPlaying(tv, tvPos + 1)

    // Web "Şu an TV'de" kartını gösterir; kartta duraklat → TV'nin videosu durur
    const card = page.getByRole('region', { name: "Şu an TV'de" }).filter({ hasText: name })
    await expect(card).toBeVisible({ timeout: 30_000 })
    await card.getByRole('button', { name: 'Duraklat' }).click()
    await expect.poll(async () => (await videoState(tv))?.paused, { message: "TV'nin videosu durmalı" }).toBe(true)

    // Bu Cihazda Devam Et: oynatma web'e döner, TV oynatıcıdan çıkar
    await card.getByRole('button', { name: 'Bu Cihazda Devam Et' }).click()
    await expect(page).toHaveURL(/#\/izle\/Video:80010001/)
    await expect
      .poll(async () => (await videoState(page))?.readyState ?? 0, { timeout: 60_000 })
      .toBeGreaterThanOrEqual(2)
    expect((await videoState(page))!.currentTime, "TV'nin konumundan sürer").toBeGreaterThan(tvPos - 5)
    await expect(tv).not.toHaveURL(/#\/tv\/izle\//, { timeout: 30_000 })
  })
})

test.describe('yansıtma (doğrudan açılan oynatıcı)', () => {
  // UYGULAMA HATASI: oynatıcı ilk açılan sayfaysa (paylaşılan bağlantı / yenileme) ve birden çok TV çevrimiçiyse
  // "TV'de İzle" hiçbir şey yapmaz. Yansıtma işleyicisi web/src/app/services.ts'te kuruluyor, ama seçicinin yuvası
  // (registerPickerHost, web/src/devices/ui.tsx) yalnız features/remote yüklenince — kabuksuz /izle'de hiç — kaydoluyor;
  // openCastPicker (web/src/devices/runtime.tsx) yuva yokken sessizce hiçbir şey çizmiyor.
  test.fixme(`/izle yenilenince iki TV varken "TV'de İzle" seçiciyi açar ${NET}`, async ({ context, page }) => {
    const { name } = await signedInTv(context)
    await signedInTv(context)
    await signIn(page, 'Deniz', { vd: uniq('web'), cihaz: 'web' })
    await page.goto(page.url().replace(/#.*$/, '#/izle/Video:80010001'))
    await page.reload()
    await waitPlaying(page, 3)
    await page.mouse.move(700, 450)
    await page.mouse.move(720, 460, { steps: 3 })
    await page.getByRole('button', { name: "TV'de İzle" }).click()
    const picker = page.getByRole('dialog', { name: "TV'de İzle" })
    await expect(picker.getByRole('button', { name: new RegExp(`^${esc(name)}`) })).toBeVisible()
  })
})

test.describe('cihaz yönetimi ve vitrin', () => {
  test("/cihazlar'dan TV'nin oturumu kapatılınca TV giriş ekranına döner", async ({ context, page }) => {
    const { tv, name } = await signedInTv(context)
    await signIn(page)
    await page.goto('/#/cihazlar')
    const item = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name, exact: true }) })
    await expect(item).toBeVisible()
    await expect(item.getByText('Çevrimiçi')).toBeVisible()
    await item.getByRole('button', { name: 'Oturumu Kapat' }).click()
    const confirm = page.getByRole('dialog', { name: 'Oturumu kapat' })
    await expect(confirm.getByRole('heading', { name: 'Oturum kapatılsın mı?' })).toBeVisible()
    await confirm.getByRole('button', { name: 'Oturumu Kapat' }).click()
    await expect(page.getByText(`${name} oturumu kapatıldı`)).toBeVisible()
    await expect(tv).toHaveURL(/#\/tv\/giris/, { timeout: 30_000 })
    await expect(tv.getByRole('button', { name: "Bu TV'de demo hesabıyla giriş yap" })).toBeVisible()
  })

  test('/vitrin üç çerçeve çizer; 1. senaryo "Benim yerime onayla" ile tamamlanır', async ({ page }) => {
    await page.goto('/#/vitrin')
    await expect(page.getByRole('heading', { name: 'Cihaz vitrini' })).toBeVisible()
    for (const frame of ['TV çerçevesi', 'Web çerçevesi', 'Telefon çerçevesi']) {
      await expect(page.locator(`iframe[title="${frame}"]`)).toBeVisible()
    }
    const auto = page.getByRole('switch', { name: 'Benim yerime onayla' })
    if ((await auto.getAttribute('aria-checked')) !== 'true') await auto.click()
    await expect(auto).toHaveAttribute('aria-checked', 'true')
    await page
      .getByRole('group', { name: 'Senaryolar' })
      .getByRole('button', { name: /^1 · TV'de QR ile giriş/ })
      .click()
    await expect(page.getByText('TV açıldı. Şimdi 2. adımla telefonu kumanda yapabilirsin.')).toBeVisible({
      timeout: 90_000,
    })
    // TV çerçevesi gerçekten ana sayfada
    const tvFrame = page.frameLocator('iframe[title="TV çerçevesi"]')
    await expect(tvFrame.locator(FOCUSED)).toHaveCount(1)
  })
})

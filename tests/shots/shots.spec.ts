import { test } from '@playwright/test'
import { join } from 'node:path'
import { completeSetup } from '../e2e/helpers'

/**
 * Tasarım ve ürün incelemesi için her ekranın görüntüsü.
 * Çıktı: SHOTS_DIR (varsayılan tests/shots/output)/<proje>/<ekran>.png
 */
const outDir = process.env.SHOTS_DIR ?? 'tests/shots/output'

const screens: { name: string; path: string; prepare?: (page: import('@playwright/test').Page) => Promise<void> }[] = [
  { name: '01-ana-ekran', path: '#/' },
  { name: '02-konus', path: '#/konus' },
  { name: '03-hizli-ihtiyaclar', path: '#/konus/hizli' },
  {
    name: '04-kahvalti-secili',
    path: '#/konus/k/kahvalti',
    prepare: async (page) => {
      await page.getByTestId('item-peynir').click()
    },
  },
  { name: '05-kaliplar', path: '#/konus/kaliplar' },
  { name: '06-harfle-bul', path: '#/konus/harf' },
  { name: '07-vucut-haritasi', path: '#/konus/vucut-haritasi' },
  {
    name: '08-agri-olcegi',
    path: '#/konus/vucut-haritasi',
    prepare: async (page) => {
      await page.getByTestId('region-bas').click()
    },
  },
  { name: '09-partner', path: '#/goster' },
  { name: '10-ben-karti', path: '#/ben' },
  { name: '11-ogren', path: '#/ogren' },
  { name: '12-oturum-isinma', path: '#/ogren/oturum' },
  {
    name: '13-oturum-etkinlik',
    path: '#/ogren/oturum',
    prepare: async (page) => {
      await page.getByTestId('session-next').click()
    },
  },
  { name: '14-ilerleme', path: '#/ogren/ilerleme' },
  { name: '15-ayarlar', path: '#/ayarlar' },
  { name: '16-kart-ekle', path: '#/ayarlar/kartlar/yeni' },
  { name: '17-gorunum', path: '#/ayarlar/gorunum' },
  { name: '18-yolculuk-terapist', path: '#/ayarlar/yolculuk' },
  { name: '19-yedek', path: '#/ayarlar/yedek' },
]

test('ekran görüntüleri', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await completeSetup(page)
  for (const screen of screens) {
    await page.goto(`./${screen.path}`)
    await page.waitForTimeout(250)
    if (screen.prepare) await screen.prepare(page)
    await page.waitForTimeout(250)
    await page.screenshot({ path: join(outDir, testInfo.project.name, `${screen.name}.png`) })
  }
  await page.goto('./#/kurulum')
  await page.waitForTimeout(200)
  await page.screenshot({ path: join(outDir, testInfo.project.name, '00-kurulum.png') })
})

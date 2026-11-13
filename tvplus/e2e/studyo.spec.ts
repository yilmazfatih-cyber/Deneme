import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'
import { expect, pageApi, signIn, test, waitForModel } from './helpers'

/**
 * Stüdyo (içerik zekâsı arka ofisi, yalnız masaüstü): profil menüsünden açılır; genel bakış, tahmin modeli (ölçüm
 * tablosu, eğitim, simülatör), etiketleme masası (fiş → onay → uzlaşı), Mixpanel deneme içe aktarımı, planlayıcı,
 * gömme komşuları. İlk açılışta arka planda üretilen sentetik örnek + topluluklar + model stüdyo uçlarından
 * yoklanarak beklenir. Ayrıca koruma: oturumsuz /api/studio isteği 401.
 */

const MIXPANEL_SAMPLE = fileURLToPath(new URL('../content/analytics/ornek-mixpanel.jsonl', import.meta.url))

/** "1.497" / "213.795" → sayı */
const trInt = (s: string) => Number(s.replace(/\./g, ''))

async function openStudio(page: Page, section = ''): Promise<void> {
  await signIn(page)
  await waitForModel(page)
  await page.goto(`/#/studyo${section ? `/${section}` : ''}`)
}

test.describe('Stüdyo', () => {
  test('profil menüsünden açılır; genel bakış sıfırdan büyük sayılar ve "Sentetik örnek" etiketi gösterir', async ({
    page,
  }) => {
    await signIn(page)
    await waitForModel(page)
    await page.getByRole('button', { name: 'Profil: Deniz' }).click()
    await page.getByRole('menuitem', { name: 'Stüdyo' }).click()
    await expect(page).toHaveURL(/#\/studyo$/)
    await expect(page.getByRole('heading', { name: 'Genel Bakış', level: 1 })).toBeVisible()
    const line = page.getByRole('list', { name: 'İçerik zekâsı hattı' })
    const tags = line.getByRole('link', { name: /^Etiketler / })
    await expect(tags).toBeVisible()
    const tagText = (await tags.getAttribute('aria-label')) ?? (await tags.innerText())
    expect(Number(/(\d+) \/ (\d+) başlık/.exec(tagText)?.[2] ?? 0), 'katalog başlıkları').toBeGreaterThan(0)
    const mg = await line.getByRole('link', { name: /^Mikro türler / }).innerText()
    expect(Number(/Mikro türler\s+([\d.]+)/.exec(mg)?.[1]?.replace(/\./g, '') ?? 0), 'mikro türler').toBeGreaterThan(0)
    const viewing = await line.getByRole('link', { name: /^İzleme verisi / }).innerText()
    expect(viewing).toContain('Sentetik örnek')
    expect(trInt(/Sentetik örnek:\s*[\d.]+ olay · ([\d.]+) izleyici/.exec(viewing)?.[1] ?? '0')).toBeGreaterThan(1000)
    await expect(line.getByRole('link', { name: /^Tahmin modeli tahmin-1/ })).toBeVisible()
  })

  test('tahmin modeli: ölçüm tablosu (model ve tabanlar); "Eğit" yeni bir eğitimi bitirir', async ({ page }) => {
    await openStudio(page, 'tahmin')
    const card = page.getByRole('region', { name: 'Model kartı' })
    await expect(card.getByText(/^tahmin-1 · \d+ eğitim$/)).toBeVisible()
    await expect(card.getByText(/SENTETİK örnek/)).toBeVisible()
    const table = page.getByRole('table', { name: 'Sıralama ölçümleri' })
    for (const col of ['Model', 'Tür yakınlığı (taban)', 'Popülerlik (taban)'])
      await expect(table.getByRole('columnheader', { name: col })).toBeVisible()
    await expect(table.getByRole('row', { name: /^Recall@10 %/ })).toBeVisible()

    const before = await pageApi<{ version: string }>(page, 'GET', '/api/studio/model')
    const runs = page.getByRole('table', { name: 'Eğitim geçmişi, en yeni önce' })
    const rowsBefore = await runs.getByRole('row').count()
    await page.getByRole('region', { name: 'Eğitim' }).getByRole('button', { name: 'Eğit' }).click()
    await expect
      .poll(() => runs.getByRole('row').count(), { message: 'yeni eğitim satırı' })
      .toBeGreaterThan(rowsBefore)
    await expect(runs.getByRole('row').nth(1)).toContainText('Bitti', { timeout: 90_000 })
    await expect
      .poll(async () => (await pageApi<{ version: string }>(page, 'GET', '/api/studio/model')).json?.version)
      .not.toBe(before.json?.version)
  })

  test('simülatör: bir topluluğun izleyicisi için eşleşme yüzdeli öneriler', async ({ page }) => {
    await openStudio(page, 'tahmin')
    const sim = page.getByRole('region', { name: 'Simülatör' })
    const community = sim.getByRole('combobox', { name: 'Zevk topluluğu' })
    await expect(community).toBeVisible()
    await expect
      .poll(() => community.getByRole('option').count(), { message: 'topluluklar yüklenir' })
      .toBeGreaterThan(1)
    await community.selectOption({ index: 1 })
    const viewers = sim.getByRole('radiogroup', { name: 'Örnek izleyiciler' }).getByRole('radio')
    await expect(viewers.first()).toBeVisible()
    await viewers.nth(1).check()
    await expect(sim.getByRole('heading', { name: 'Modelin önerileri' })).toBeVisible()
    const picks = sim.getByRole('button').filter({ hasText: /%\d+ Eşleşme/ })
    await expect.poll(() => picks.count()).toBeGreaterThan(4)
    await expect(sim.getByText('Sentetik örnek').first()).toBeVisible()
  })

  test('etiketleme: "etiket-e2e" fişi gönderilir, onaylanır, dayanak "Uzlaşı" olur', async ({ page }) => {
    await openStudio(page, 'etiketleme/80010001')
    try {
      await expect(page.getByRole('heading', { name: 'Sintel', level: 2 })).toBeVisible()
      await expect(page.getByText('Geçerli etiketler:')).toContainText('Örnek')
      const form = page.getByRole('region', { name: 'Etiketleme formu' })
      // Önce kimlik: kimlik değişince form o etiketleyicinin fişiyle yeniden kurulur
      await form.getByRole('textbox', { name: 'Etiketleyici kimliği' }).fill('etiket-e2e')
      await form.getByRole('button', { name: 'Model önerisinden doldur' }).click()
      await expect(form.getByText(/^[1-9]\d*\/\d+ ölçek değerlendirildi$/)).toBeVisible()
      await form.getByRole('switch', { name: 'İzledim' }).click()
      await expect(form.getByRole('switch', { name: 'İzledim' })).toHaveAttribute('aria-checked', 'true')
      await form.getByRole('button', { name: 'Gönder' }).click()
      const sheet = page.getByRole('article').filter({ hasText: 'etiket-e2e' })
      await expect(sheet).toBeVisible()
      await sheet.getByRole('button', { name: 'Onayla' }).click()
      await expect(sheet.getByText('Onaylandı')).toBeVisible()
      await expect(page.getByText('Geçerli etiketler:')).toContainText('Uzlaşı')
    } finally {
      // Katalog geneli durum: fişi geri al (öteki testlerin mikro türleri örnek fişlerle kalsın)
      await pageApi(page, 'DELETE', '/api/studio/tagging/titles/80010001/sheets/etiket-e2e')
    }
  })

  test('veri kaynakları: örnek Mixpanel dosyası deneme olarak yüklenir ve rapor okunur', async ({ page }) => {
    await openStudio(page, 'kaynaklar')
    const mixpanel = page.getByRole('region', { name: 'Mixpanel' })
    await mixpanel.getByLabel('Dosya').setInputFiles(MIXPANEL_SAMPLE)
    await expect(mixpanel.getByText(/^ornek-mixpanel\.jsonl · /)).toBeVisible()
    await expect(mixpanel.getByRole('switch', { name: 'Deneme (depoya yazma)' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await mixpanel.getByRole('button', { name: 'Dene' }).click()
    const result = mixpanel.getByRole('status').filter({ hasText: 'Deneme raporu (depoya yazılmadı)' })
    await expect(result).toBeVisible({ timeout: 60_000 })
    const lines = trInt(/([\d.]+)\s*satır/.exec(await result.innerText())?.[1] ?? '0')
    expect(lines).toBeGreaterThan(0)
    // Deneme depoya yazmaz: Mixpanel kaynağı boş kalır
    const sources = await pageApi<{ sources: { source: string; events: number }[] }>(page, 'GET', '/api/studio/sources')
    expect(sources.json?.sources.find((s) => s.source === 'MIXPANEL')?.events ?? 0).toBe(0)
  })

  test('planlayıcı: istenen başlık sayısı satırlara dağıtılır', async ({ page }) => {
    await openStudio(page, 'planlayici')
    await page.getByRole('textbox', { name: 'Eklenecek başlık' }).fill('7')
    await page.getByRole('button', { name: 'Planla' }).click()
    await expect(page.getByText(/Dağıtılan\s*7\s*\/\s*7/)).toBeVisible()
    const table = page.getByRole('table', { name: 'Tür başına önerilen başlık sayısı' })
    const counts = await table
      .locator('tbody tr')
      .evaluateAll((rows) => rows.map((r) => Number((r.querySelector('td')?.textContent ?? '0').trim())))
    expect(counts.length).toBeGreaterThan(0)
    expect(
      counts.reduce((a, b) => a + b, 0),
      'satırların toplamı istenen sayı',
    ).toBe(7)
  })

  test('gömme: Sintel için en yakın başlıklar', async ({ page }) => {
    await openStudio(page, 'gomme')
    await expect(page.getByRole('combobox', { name: 'Başlık seç' })).toHaveValue('80010001')
    await expect(page.getByRole('heading', { name: 'En yakın başlıklar' })).toBeVisible()
    const neighbours = page.getByRole('button').filter({ hasText: /benzerlik \d,\d+/ })
    await expect.poll(() => neighbours.count()).toBeGreaterThan(4)
    await expect(neighbours.filter({ hasText: /^Sintel / })).toHaveCount(0)
  })

  test('koruma: oturumsuz /api/studio isteği 401', async ({ playwright, baseURL }) => {
    const anon = await playwright.request.newContext({ baseURL })
    try {
      for (const path of ['/api/studio/overview', '/api/studio/model', '/api/studio/tagging/queue']) {
        const r = await anon.get(path)
        expect(r.status(), path).toBe(401)
      }
      const w = await anon.post('/api/studio/model/train', { data: {} })
      expect(w.status()).toBe(401)
    } finally {
      await anon.dispose()
    }
  })
})

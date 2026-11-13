import type { Page } from '@playwright/test'
import { expect, signIn, test, watchGraphql } from './helpers'

/**
 * Arama ve çevrimiçi öğrenen tahmin modeli: yazarken tamamlama tahminleri, doğrudan sonuç + "‹X› ile ilgili" tahmin
 * bölümü, eşleşme yoksa sakin satır + "Bunlar ilgini çekebilir" (çıkmaz sokak yok, UX §7.7), tıklama geri bildirimi
 * (`RecordSearchFeedback`) ve modelin sürümünün ilerlemesi, mobil arama sayfası.
 */

const isMobile = (page: Page) => (page.viewportSize()?.width ?? 0) < 900

/** Model alt bilgisindeki güncelleme sayısı ("Model: lr-1 · 3 güncelleme"); yanıt gelene dek bekler. */
async function modelUpdates(page: Page): Promise<number> {
  let n = Number.NaN
  await expect
    .poll(async () => {
      const text = (await page.getByText(/^Model: /).first().textContent()) ?? ''
      n = Number(/(\d+)\s+güncelleme/.exec(text)?.[1] ?? Number.NaN)
      return Number.isNaN(n)
    })
    .toBe(false)
  return n
}

test.describe('Arama', () => {
  test('üst menü kutusu: yazınca /ara?q= ve tamamlama tahminleri; boşalınca önceki sayfaya dönülür', async ({
    page,
  }) => {
    test.skip(isMobile(page), 'üst menü kutusu masaüstünde')
    await signIn(page)
    await page.getByRole('button', { name: 'Ara' }).click()
    const box = page.getByRole('search').getByRole('combobox', { name: 'Ara' })
    await expect(box).toBeFocused()
    await expect(box).toHaveAttribute('placeholder', 'Başlıklar, kişiler, türler')
    await box.pressSequentially('sin', { delay: 80 })
    await expect(page).toHaveURL(/#\/ara\?q=sin/)
    const predictions = page.getByRole('listbox', { name: 'Tahminler' })
    await expect(predictions.getByRole('option', { name: /^Sintel/ })).toBeVisible()
    // Sayfada da "Şunu mu arıyorsun:" satırı modelin tamamlamalarıyla
    const didYouMean = page.locator('main p', { hasText: 'Şunu mu arıyorsun:' })
    await expect(didYouMean.getByRole('button', { name: 'Sintel' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Filmler ve Diziler' }).getByRole('link').first()).toBeVisible()

    // Kutu boşalınca önceki sayfa
    await page.getByRole('button', { name: 'Aramayı temizle' }).click()
    await expect(page).toHaveURL(/#\/goz-at$/)
  })

  test('"sintel": sonuç ve "Sintel ile ilgili" tahmin bölümü; yazım düzeltmesi', async ({ page }) => {
    await signIn(page)
    await page.goto('/#/ara?q=sintel')
    const results = page.getByRole('region', { name: 'Filmler ve Diziler' })
    await expect(results.getByRole('link', { name: /^Sintel/ }).first()).toBeVisible()
    const related = page.getByRole('region', { name: 'Sintel ile ilgili' })
    await expect(related).toBeVisible()
    expect(await related.getByRole('link').count()).toBeGreaterThan(2)

    await page.goto('/#/ara?q=sitnel')
    await expect(page.getByText(/“sintel” için sonuçlar gösteriliyor/)).toBeVisible()
  })

  test('anlamsız terim: sakin "eşleşme bulunamadı" satırı ve modelin tahminleri', async ({ page }) => {
    await signIn(page)
    await page.goto('/#/ara?q=qzxwvbk')
    await expect(page.getByRole('status').filter({ hasText: '“qzxwvbk” için eşleşme bulunamadı.' })).toBeVisible()
    const predicted = page.getByRole('region', { name: 'Bunlar ilgini çekebilir' })
    await expect(predicted).toBeVisible()
    expect(await predicted.getByRole('link').count()).toBeGreaterThan(0)
  })

  test('sonuca basınca RecordSearchFeedback gider ve model sürümü ilerler (?aciklama=1)', async ({ page }) => {
    test.skip(isMobile(page), 'açıklama kipi masaüstünde denenir')
    const gql = watchGraphql(page)
    const feedback: Record<string, unknown>[] = []
    page.on('request', (req) => {
      if (!req.url().endsWith('/graphql')) return
      const body = req.postDataJSON() as { operationName?: string; variables?: Record<string, unknown> } | null
      if (body?.operationName === 'RecordSearchFeedback') feedback.push(body.variables ?? {})
    })
    await signIn(page)
    await page.goto('/#/ara?q=sintel&aciklama=1')
    const results = page.getByRole('region', { name: 'Filmler ve Diziler' })
    await expect(results.getByRole('link', { name: /^Sintel/ }).first()).toBeVisible()
    await expect(results.getByRole('button', { name: /^Model puanı / }).first()).toBeVisible()
    const before = await modelUpdates(page)

    await results.getByRole('link', { name: /^Sintel/ }).first().click()
    await expect(page.getByRole('dialog', { name: 'Sintel' })).toBeVisible()
    await expect.poll(() => feedback.length, { message: 'RecordSearchFeedback isteği' }).toBeGreaterThan(0)
    expect(feedback[0]).toMatchObject({ searchTerm: 'sintel', action: 'CLICK' })
    expect(String(feedback[0]!.unifiedEntityId)).toContain('80010001')
    expect(gql.ops).toContain('RecordSearchFeedback')

    // Aynı arama yeniden: önbellek temizlendi, yeni yanıt güncellenmiş modelle gelir
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Sintel' })).toBeHidden()
    await expect
      .poll(
        async () => {
          await page.goto('/#/goz-at')
          await page.goto('/#/ara?q=sintel&aciklama=1')
          return modelUpdates(page)
        },
        { timeout: 30_000, message: 'model güncelleme sayısı artmalı' },
      )
      .toBeGreaterThan(before)
  })

  test('mobil arama: yazmadan önce "Sana Özel Öneriler", yazarken tahminler', async ({ page }) => {
    test.skip(!isMobile(page), 'mobil arama sayfası')
    await signIn(page)
    await page.getByRole('link', { name: 'Ara' }).click()
    await expect(page).toHaveURL(/#\/ara/)
    const picks = page.getByRole('region', { name: 'Sana Özel Öneriler' })
    await expect(picks).toBeVisible()
    expect(await picks.getByRole('link', { name: / oynat$/ }).count()).toBeGreaterThan(3)

    const box = page.getByRole('search').getByRole('searchbox', { name: 'Ara' })
    await box.pressSequentially('sin', { delay: 80 })
    const predictions = page.getByRole('list', { name: 'Tahminler' })
    await expect(predictions.getByRole('button', { name: /^Sintel/ })).toBeVisible()
    await predictions.getByRole('button', { name: /^Sintel/ }).click()
    await expect(box).toHaveValue(/^sintel$/i)
    await expect(page.getByRole('region', { name: 'Filmler ve Diziler' }).getByRole('link', { name: /Sintel/ }).first()).toBeVisible()
  })
})

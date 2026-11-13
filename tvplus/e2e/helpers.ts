import { expect, type Page } from '@playwright/test'

/** Karşılama → demo girişi → profil seçimi. */
export async function signIn(page: Page, profile: 'Deniz' | 'Çocuk' = 'Deniz'): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', { name: /Demo hesabıyla devam et/ }).click()
  await expect(page).toHaveURL(/#\/profiller/)
  await page.getByText(profile, { exact: true }).first().click()
  await expect(page).toHaveURL(/#\/(film-dizi|canli)/)
}

/** Sayfadaki ilk <video> öğesinin oynatma durumunu okur. */
export async function videoState(page: Page) {
  return page.evaluate(() => {
    const el = document.querySelector('video')
    if (!el) return null
    const b = el.buffered
    return {
      currentTime: el.currentTime,
      paused: el.paused,
      readyState: el.readyState,
      width: el.videoWidth,
      height: el.videoHeight,
      bufferedEnd: b.length ? b.end(b.length - 1) : 0,
      error: el.error ? el.error.message : null,
    }
  })
}

export const offline = process.env.TVP_E2E_OFFLINE === '1'

import { expect, signIn, test, uniq } from './helpers'

/**
 * Profil yönetimi uçtan uca: profil ekle → 4 haneli kilit → profile geçerken PIN ekranı (önce yanlış, sonra doğru) →
 * profili sil (onaylı). Projeler paralel koştuğu için her koşu kendi benzersiz adını kullanır.
 */
test.describe('Profil yönetimi', () => {
  test('profil ekle, PIN ile kilitle, geçişte PIN sor (yanlış → doğru), sil', async ({ page, issues }) => {
    const mobile = (page.viewportSize()?.width ?? 0) < 900
    const name = uniq(mobile ? 'M' : 'W')
    // Yanlış PIN sunucudan 403 PIN_INVALID döner (beklenen)
    issues.allowHttp(/\/api\/profiles\/switch|\/api\/devices\/profiles/, [403])

    await signIn(page)

    // Profil kapısı → Profil Ekle
    await page.goto('/#/profiller')
    await page.getByRole('link', { name: 'Profil Ekle' }).click()
    await expect(page.getByRole('heading', { name: 'Profil Ekle' })).toBeVisible()
    await page.getByRole('textbox', { name: 'Profil adı' }).fill(name)
    await page.getByRole('switch', { name: 'Profil kilidi' }).click()
    await page.getByLabel("Yeni profil kilidi PIN'i").fill('4826')
    await page.getByRole('button', { name: 'Devam' }).click()
    await expect(page).toHaveURL(/#\/profiller$/)
    await expect(page.getByText(`${name} profili eklendi`)).toBeVisible()
    const tile = page.getByRole('button', { name: `${name}, kilitli` })
    await expect(tile).toBeVisible()

    // Geçiş: masaüstünde avatar menüsünden, mobilde profil kapısından → PIN ekranı
    await page.getByRole('button', { name: 'Deniz', exact: true }).click()
    await expect(page).toHaveURL(/#\/goz-at/)
    if (mobile) {
      await page.goto('/#/profiller')
      await page.getByRole('button', { name: `${name}, kilitli` }).click()
    } else {
      await page.getByRole('button', { name: 'Profil: Deniz' }).click()
      await page.getByRole('menuitem', { name: name }).click()
    }
    const pin = page.getByRole('dialog', { name: "Bu profile girmek için PIN'ini gir." })
    await expect(pin).toBeVisible()
    await expect(pin.getByText(`${name} profilinde kilit açık.`)).toBeVisible()
    await pin.getByLabel("Profil kilidi PIN'i").fill('1111')
    await expect(pin.getByRole('alert')).toHaveText('PIN eşleşmedi. Tekrar dene.')
    await expect(pin).toBeVisible()
    await pin.getByLabel("Profil kilidi PIN'i").fill('4826')
    await expect(page).toHaveURL(/#\/goz-at/)
    await expect(pin).toBeHidden()
    if (mobile) await expect(page.getByRole('heading', { name: `${name} için`, level: 1 })).toBeVisible()
    else await expect(page.getByRole('button', { name: `Profil: ${name}` })).toBeVisible()

    // Sil (etkin profil: PIN tekrar sorulmaz), onay ekranıyla
    await page.goto('/#/profiller/yonet')
    await page.getByRole('button', { name: `${name} profilini düzenle` }).click()
    await expect(page.getByRole('heading', { name: 'Profili Düzenle' })).toBeVisible()
    await page.getByRole('button', { name: 'Profili Sil' }).click()
    await expect(page.getByRole('heading', { name: 'Profil silinsin mi?' })).toBeVisible()
    await page.getByRole('button', { name: 'Profili Sil' }).click()
    await expect(page.getByText(`${name} profili silindi`)).toBeVisible()
    // Düzenleyici listeye döner; silinen profil listede yok
    await expect(page.getByRole('heading', { name: 'Profilleri Yönet' })).toBeVisible()
    await expect(page.getByRole('button', { name: `${name} profilini düzenle` })).toHaveCount(0)
    await page.getByRole('button', { name: 'Tamam' }).click()
    await expect(page).toHaveURL(/#\/profiller$/)
    await expect(page.getByRole('heading', { name: 'Kim izliyor?' })).toBeVisible()
    await expect(page.getByRole('button', { name: new RegExp(`^${name}`) })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Deniz', exact: true })).toBeVisible()
  })
})

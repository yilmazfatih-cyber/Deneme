/**
 * Hesap ekranı (sahte API ile): ad değiştirme, yanlış şu anki şifrede iletinin alanın altında görünmesi.
 */
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { readSession } from '../../src/lib/session/store.ts'
import { FakeBackend } from '../helpers/fakeApi.ts'
import { renderApp, resetBrowserData } from '../helpers/render.tsx'

const PASSWORD = 'mavi-deniz-kenari-42'

beforeEach(async () => {
  await resetBrowserData()
})

describe('Hesap', () => {
  it('ad değişir; yanlış şu anki şifre şifre alanının altında bildirilir', async () => {
    const user = userEvent.setup()
    const backend = new FakeBackend()
    backend.createAccount('ayse@ornek.com', PASSWORD, 'Ayşe')
    renderApp({ path: '/giris?next=%2Fhesap', api: backend.device().api })
    await user.type(await screen.findByRole('textbox', { name: 'E-posta' }), 'ayse@ornek.com')
    await user.type(screen.getByLabelText('Şifre'), PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Giriş yap' }))

    const name = await screen.findByRole('textbox', { name: 'Adınız' })
    await user.clear(name)
    await user.type(name, 'Ayşe Yılmaz')
    await user.click(screen.getAllByRole('button', { name: 'Kaydet' })[0]!)
    expect(await screen.findByText('Kaydedildi.')).toBeInTheDocument()
    expect((await readSession())?.user.name).toBe('Ayşe Yılmaz')

    await user.click(screen.getByRole('button', { name: 'Şifreyi değiştir' }))
    const dialog = await screen.findByRole('dialog', { name: 'Şifreyi değiştir' })
    await user.type(within(dialog).getByLabelText('Şu anki şifre'), 'yanlis-sifre-99')
    await user.type(within(dialog).getByLabelText('Yeni şifre'), 'yepyeni-uzun-sifre-7')
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }))
    expect(await within(dialog).findByText('Şifre yanlış.')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Şu anki şifre')).toHaveAttribute('aria-invalid', 'true')
  })
})

/**
 * Eşitleme arayüzü: hesapsız kipte gösterge "Bu cihazda" der; sunucu yedeğe dönünce engelleyici pencere çıkar ve
 * "Buradakini gönder" kayıpları sunucuya geri yazar.
 */
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { FakeBackend } from '../helpers/fakeApi.ts'
import { renderApp, resetBrowserData } from '../helpers/render.tsx'

const PASSWORD = 'mavi-deniz-kenari-42'

beforeEach(async () => {
  await resetBrowserData()
})

describe('Eşitleme arayüzü', () => {
  it('hesapsız kipte gösterge veri yalnız bu cihazda der', async () => {
    const user = userEvent.setup()
    renderApp({ path: '/gorevler' })
    const [indicator] = await screen.findAllByRole('button', { name: 'Bu cihazda' })
    await user.click(indicator!)
    expect(await screen.findByRole('dialog', { name: 'Bu cihazda' })).toHaveTextContent('Veriler yalnız bu cihazda.')
  })

  it('reset: engelleyici pencere çıkar; "Buradakini gönder" sunucuyu geri doldurur', async () => {
    const user = userEvent.setup()
    const backend = new FakeBackend()
    const account = backend.createAccount('ayse@ornek.com', PASSWORD)
    renderApp({ path: '/giris', api: backend.device().api })
    await user.type(await screen.findByRole('textbox', { name: 'E-posta' }), 'ayse@ornek.com')
    await user.type(screen.getByLabelText('Şifre'), PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Giriş yap' }))
    const input = await screen.findByRole('textbox', { name: 'Yeni görev' })
    await user.type(input, 'Birinci{Enter}')
    await waitFor(() => expect(backend.server.recordsOf(account.personalWorkspaceId)).toHaveLength(1))
    await user.type(input, 'İkinci{Enter}')
    await waitFor(() => expect(backend.server.recordsOf(account.personalWorkspaceId)).toHaveLength(2))

    backend.server.rollback(account.personalWorkspaceId, 1)
    await user.click(screen.getAllByRole('button', { name: /^(Eşitlendi|Gönderilecek|Eşitleniyor)/ })[0]!)
    const syncButton = await screen.findByRole('button', { name: 'Şimdi eşitle' })
    await waitFor(() => expect(syncButton).toBeEnabled()) // önceki gönderim bitsin
    await user.click(syncButton)
    const dialog = await screen.findByRole('dialog', { name: 'Sunucu eski bir yedeğe dönmüş' })
    expect(within(dialog).queryByRole('button', { name: 'Kapat' })).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Buradakini gönder' }))
    await waitFor(() =>
      expect(
        backend.server
          .recordsOf(account.personalWorkspaceId)
          .map((record) => record.data.title)
          .toSorted(),
      ).toEqual(['Birinci', 'İkinci']),
    )
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Sunucu eski bir yedeğe dönmüş' })).toBeNull())
  })
})

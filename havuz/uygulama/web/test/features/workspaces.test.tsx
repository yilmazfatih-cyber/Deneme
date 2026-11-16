/**
 * Çalışma alanları (sahte API ile): yeni paylaşımlı alan açılır ve seçilir; davet bağlantısıyla katılınır;
 * izleyici rolünde yazma denetimleri kapalıdır.
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

async function login(user: ReturnType<typeof userEvent.setup>, email: string) {
  await user.type(await screen.findByRole('textbox', { name: 'E-posta' }), email)
  await user.type(screen.getByLabelText('Şifre'), PASSWORD)
  await user.click(screen.getByRole('button', { name: 'Giriş yap' }))
}

describe('Çalışma alanları', () => {
  it('yeni paylaşımlı alan açılır, listede görünür ve geçerli alan olur', async () => {
    const user = userEvent.setup()
    const backend = new FakeBackend()
    backend.createAccount('ayse@ornek.com', PASSWORD)
    renderApp({ path: '/giris?next=%2Falanlar', api: backend.device().api })
    await login(user, 'ayse@ornek.com')
    expect(await screen.findByRole('link', { name: /Kişisel/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Yeni alan' }))
    const dialog = await screen.findByRole('dialog', { name: 'Yeni alan' })
    await user.click(within(dialog).getByRole('button', { name: 'Alanı aç' }))
    expect(await within(dialog).findByText('Alana bir ad verin.')).toBeInTheDocument()
    await user.type(within(dialog).getByRole('textbox', { name: 'Alan adı' }), 'Ev işleri')
    await user.click(within(dialog).getByRole('button', { name: 'Alanı aç' }))

    const link = await screen.findByRole('link', { name: /Ev işleri/ })
    expect(await within(link).findByText('Şu an açık')).toBeInTheDocument()
  })

  it('davet bağlantısıyla katılan izleyici alanı görür ama yazamaz', async () => {
    const user = userEvent.setup()
    const backend = new FakeBackend()
    const owner = backend.createAccount('ayse@ornek.com', PASSWORD, 'Ayşe')
    backend.createAccount('burak@ornek.com', PASSWORD, 'Burak')
    const shared = backend.server.createWorkspace(owner.user.id, 'Aile')
    backend.names.set(shared, 'Aile')
    const ownerDevice = backend.device()
    await ownerDevice.api.login({ email: 'ayse@ornek.com', password: PASSWORD })
    const { invite } = await ownerDevice.api.createInvite(shared, { role: 'viewer' })

    renderApp({ path: `/davet?token=${invite.token}`, api: backend.device().api })
    expect(await screen.findByText('Ayşe sizi “Aile” alanına İzleyici olarak davet etti.')).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Giriş yap' }))
    await login(user, 'burak@ornek.com')
    await user.click(await screen.findByRole('button', { name: 'Daveti kabul et' }))

    expect(await screen.findByText('Bu alanı yalnız görüntüleyebilirsiniz.')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Yeni görev' })).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Alan: Aile/ }).length).toBeGreaterThan(0))
  })
})

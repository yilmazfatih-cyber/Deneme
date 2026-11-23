/**
 * Ayarlar: tema seçimi saklanır; hesapsız kipte hesap düğmeleri; hesaplı kipte ad/e-posta, "Şimdi eşitle",
 * çıkış (onaylı) ve hesap silme (şifreli, onaylı). Sunucu yedeğe dönünce karar düğmeleri.
 */
import { userEvent, within } from '@testing-library/react-native'
import { getDeviceValue, openDeviceDb } from '../../src/lib/device/deviceStore.ts'
import { renderApp, resetApp, signedIn, skipWelcome } from '../support/app.tsx'
import { FakeBackend } from '../support/fakeApi.ts'

afterEach(resetApp)

describe('ayarlar', () => {
  it('tema seçimi hemen uygulanır ve cihazda saklanır', async () => {
    await skipWelcome()
    const app = await renderApp({ url: '/settings' })
    const user = userEvent.setup()
    await user.press(await app.screen.findByRole('radio', { name: 'Koyu' }))
    expect(app.screen.getByRole('radio', { name: 'Koyu' })).toBeChecked()
    expect(await getDeviceValue(await openDeviceDb(), 'theme')).toBe('dark')
    expect(app.screen.getByText('Sunucusuz: veriler yalnız bu telefonda')).toBeOnTheScreen()
  })

  it('hesapsız kipte (API açık) giriş ve kayıt düğmeleri görünür', async () => {
    await skipWelcome()
    const app = await renderApp({ url: '/settings', backend: new FakeBackend() })
    expect(await app.screen.findByRole('button', { name: 'Giriş yap' })).toBeOnTheScreen()
    expect(app.screen.getByRole('button', { name: 'Hesap oluştur' })).toBeOnTheScreen()
    expect(app.screen.getByText(/Veriler yalnız bu telefonda/)).toBeOnTheScreen()
  })

  it('hesaplı kip: eşitlenir; çıkış onaylanınca karşılamaya dönülür, belirteç silinir', async () => {
    const backend = new FakeBackend()
    const { tokens } = await signedIn(backend)
    const app = await renderApp({ url: '/settings', backend, tokens })
    const user = userEvent.setup()
    expect(await app.screen.findByText('ayse@ornek.com')).toBeOnTheScreen()
    expect(await app.screen.findByText('Eşitlendi')).toBeOnTheScreen()
    await user.press(app.screen.getByRole('button', { name: 'Şimdi eşitle' }))
    await user.press(app.screen.getByRole('button', { name: 'Çıkış yap' }))
    const dialog = await app.screen.findByLabelText('Çıkış yapılsın mı?')
    await user.press(within(dialog).getByRole('button', { name: 'Çıkış yap' }))
    expect(await app.screen.findByRole('header', { name: /hoş geldiniz/ })).toBeOnTheScreen()
    expect(tokens.value).toBeNull()
    expect(await getDeviceValue(await openDeviceDb(), 'session')).toBeNull()
  })

  it('hesap silme: yanlış şifre iletisi; doğru şifreyle hesap silinir', async () => {
    const backend = new FakeBackend()
    const { tokens } = await signedIn(backend, 'ayse@ornek.com', 'dogru-sifre-12345')
    const app = await renderApp({ url: '/delete-account', backend, tokens })
    const user = userEvent.setup()
    const confirmDelete = async () => {
      await user.press(app.screen.getByRole('button', { name: 'Hesabımı sil' }))
      const dialog = await app.screen.findByLabelText('Hesabınız silinsin mi?')
      await user.press(within(dialog).getByRole('button', { name: 'Hesabımı sil' }))
    }
    await user.type(await app.screen.findByLabelText('Şifre'), 'yanlis')
    await confirmDelete()
    expect(await app.screen.findByText('Şifre eşleşmedi. Yeniden deneyin.')).toBeOnTheScreen()
    await user.clear(app.screen.getByLabelText('Şifre'))
    await user.type(app.screen.getByLabelText('Şifre'), 'dogru-sifre-12345')
    await confirmDelete()
    expect(await app.screen.findByRole('header', { name: /hoş geldiniz/ })).toBeOnTheScreen()
    expect(backend.accounts.has('ayse@ornek.com')).toBe(false)
  })

  it('sunucu yedeğe dönünce karar düğmeleri çıkar; "Buradakini gönder" eşitlemeyi sürdürür', async () => {
    const backend = new FakeBackend()
    const { account, tokens } = await signedIn(backend)
    const app = await renderApp({ url: '/tasks', backend, tokens })
    const user = userEvent.setup()
    await user.type(await app.screen.findByLabelText('Yeni görev'), 'Yedekte yok')
    await user.press(app.screen.getByRole('button', { name: 'Ekle' }))
    await app.screen.findByText('Yedekte yok')
    await user.press(app.screen.getByRole('button', { name: /^Ayarlar sekmesi/ }))
    await user.press(await app.screen.findByRole('button', { name: 'Şimdi eşitle' }))
    expect(await app.screen.findByText('Eşitlendi')).toBeOnTheScreen()
    backend.server.rollback(account.personalWorkspaceId, 0)
    await user.press(app.screen.getByRole('button', { name: 'Şimdi eşitle' }))
    await user.press(await app.screen.findByRole('button', { name: 'Buradakini gönder' }))
    await user.press(app.screen.getByRole('button', { name: 'Şimdi eşitle' }))
    expect(await app.screen.findByText('Eşitlendi')).toBeOnTheScreen()
    expect(backend.server.recordsOf(account.personalWorkspaceId).map((record) => record.data.title)).toEqual([
      'Yedekte yok',
    ])
  })
})

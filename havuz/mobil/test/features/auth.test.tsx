/**
 * Hesap ekranları (sahte sunucuyla, belirteç kipi): kayıt → görevler; yanlış şifre iletisi; şema hatası alanda;
 * kayıtlı e-posta iletisi; şifremi unuttum. Belirteç güvenli depoya yazılır.
 */
import { userEvent } from '@testing-library/react-native'
import { memoryTokenStorage, renderApp, resetApp } from '../support/app.tsx'
import { FakeBackend } from '../support/fakeApi.ts'

afterEach(resetApp)

describe('hesap ekranları', () => {
  it('kayıt olunca görevlere gidilir, belirteç güvenli depoya yazılır, ilk eşitleme yapılır', async () => {
    const backend = new FakeBackend()
    const tokens = memoryTokenStorage()
    const app = await renderApp({ url: '/welcome', backend, tokens })
    const user = userEvent.setup()
    await user.press(await app.screen.findByRole('button', { name: 'Hesap oluştur' }))
    await user.type(await app.screen.findByLabelText('Adınız'), 'Ayşe Yılmaz')
    await user.type(app.screen.getByLabelText('E-posta'), 'ayse@ornek.com')
    await user.type(app.screen.getByLabelText('Şifre'), 'mavi-deniz-kenari-42')
    await user.press(app.screen.getByRole('button', { name: 'Hesap oluştur' }))
    expect(await app.screen.findByLabelText('Yeni görev')).toBeOnTheScreen()
    expect(app.getPathname()).toBe('/tasks')
    expect(tokens.value).toMatch(/^belirtec-/)
    expect(backend.syncCalls).toBeGreaterThan(0)
  })

  it('yanlış şifre suçlamayan iletiyle bildirilir; bozuk e-posta alanın altında', async () => {
    const backend = new FakeBackend()
    backend.createAccount('ayse@ornek.com', 'dogru-sifre-12345')
    const app = await renderApp({ url: '/login', backend })
    const user = userEvent.setup()
    await user.type(await app.screen.findByLabelText('E-posta'), 'ayse-at-ornek')
    await user.type(app.screen.getByLabelText('Şifre'), 'x')
    await user.press(app.screen.getByRole('button', { name: 'Giriş yap' }))
    expect(await app.screen.findByText('Geçerli bir e-posta yazın.')).toBeOnTheScreen()
    await user.clear(app.screen.getByLabelText('E-posta'))
    await user.type(app.screen.getByLabelText('E-posta'), 'ayse@ornek.com')
    await user.press(app.screen.getByRole('button', { name: 'Giriş yap' }))
    expect(await app.screen.findByText('E-posta ya da şifre eşleşmedi. Yeniden deneyin.')).toBeOnTheScreen()
  })

  it('kayıtlı e-postayla kayıt yol gösteren ileti verir', async () => {
    const backend = new FakeBackend()
    backend.createAccount('ayse@ornek.com', 'dogru-sifre-12345')
    const app = await renderApp({ url: '/register', backend })
    const user = userEvent.setup()
    await user.type(await app.screen.findByLabelText('Adınız'), 'Ayşe')
    await user.type(app.screen.getByLabelText('E-posta'), 'ayse@ornek.com')
    await user.type(app.screen.getByLabelText('Şifre'), 'mavi-deniz-kenari-42')
    await user.press(app.screen.getByRole('button', { name: 'Hesap oluştur' }))
    expect(await app.screen.findByText('Bu e-postayla bir hesap zaten var. Giriş yapmayı deneyin.')).toBeOnTheScreen()
  })

  it('şifremi unuttum: istek gider, hesabın varlığını sızdırmayan ileti çıkar', async () => {
    const backend = new FakeBackend()
    const app = await renderApp({ url: '/forgot-password', backend })
    const user = userEvent.setup()
    await user.type(await app.screen.findByLabelText('E-posta'), 'Ayse@Ornek.com ')
    await user.press(app.screen.getByRole('button', { name: 'Bağlantı gönder' }))
    expect(await app.screen.findByText(/bir hesap varsa bağlantıyı gönderdik/)).toBeOnTheScreen()
    expect(backend.forgotten).toEqual(['ayse@ornek.com'])
  })
})

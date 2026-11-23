/**
 * Oturum: sunucu 401 dönünce oturum "süresi dolmuş" olur (veri kalır, belirteç silinir, uyarı çıkar); açılışta
 * belirteç yoksa oturum düşmüş sayılır; ilk eşitleme olmadan alanlar "hazırlanıyor" görünür.
 */
import { AppError } from '@uygulama/shared'
import { userEvent } from '@testing-library/react-native'
import { getDeviceValue, openDeviceDb } from '../../src/lib/device/deviceStore.ts'
import { memoryTokenStorage, renderApp, resetApp, signedIn } from '../support/app.tsx'
import { FakeBackend } from '../support/fakeApi.ts'

afterEach(resetApp)

describe('oturum', () => {
  it('ilk eşitleme gelmeden alanlar hazırlanıyor; bağlantı gelince görevler açılır', async () => {
    const backend = new FakeBackend()
    const { tokens } = await signedIn(backend)
    backend.offline = true
    const app = await renderApp({ url: '/tasks', backend, tokens })
    expect(await app.screen.findByText('İnternete bağlanınca alanlarınız görünür.')).toBeOnTheScreen()
    backend.offline = false
    await userEvent.setup().press(app.screen.getByRole('button', { name: 'Şimdi eşitle' }))
    expect(await app.screen.findByLabelText('Yeni görev')).toBeOnTheScreen()
  })

  it('sunucu 401 dönünce oturum düşer: belirteç silinir, uyarı çıkar, kayıt saklanır', async () => {
    const backend = new FakeBackend()
    const { tokens } = await signedIn(backend)
    const app = await renderApp({ url: '/settings', backend, tokens })
    await app.screen.findByText('Eşitlendi')
    backend.failNextSync = new AppError('unauthorized')
    await userEvent.setup().press(app.screen.getByRole('button', { name: 'Şimdi eşitle' }))
    expect((await app.screen.findAllByRole('button', { name: 'Yeniden giriş yap' })).length).toBeGreaterThan(0)
    expect(tokens.value).toBeNull()
    expect((await getDeviceValue(await openDeviceDb(), 'session'))?.expired).toBe(true)
  })

  it('açılışta belirteç yoksa oturum düşmüş sayılır (veri yerinde kalır)', async () => {
    const backend = new FakeBackend()
    await signedIn(backend)
    const app = await renderApp({ url: '/settings', backend, tokens: memoryTokenStorage(null) })
    expect(await app.screen.findByText(/Oturumun süresi doldu/)).toBeOnTheScreen()
    expect(app.screen.getByRole('button', { name: 'Yeniden giriş yap' })).toBeOnTheScreen()
    expect(backend.syncCalls).toBe(0)
    expect((await getDeviceValue(await openDeviceDb(), 'session'))?.expired).toBe(true)
  })
})

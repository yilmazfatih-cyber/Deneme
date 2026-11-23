/**
 * Karşılama ekranı: API kapalıyken yalnız "Başla"; açıkken kayıt / giriş / hesapsız devam. Hesapsız devam edince
 * görevlere gidilir ve karşılama bir daha gösterilmez.
 */
import { userEvent } from '@testing-library/react-native'
import { getDeviceValue, openDeviceDb } from '../../src/lib/device/deviceStore.ts'
import { renderApp, resetApp } from '../support/app.tsx'
import { FakeBackend } from '../support/fakeApi.ts'

afterEach(resetApp)

describe('karşılama', () => {
  it('API kapalıyken "Başla" görevlere götürür', async () => {
    const app = await renderApp({ url: '/' })
    expect(await app.screen.findByRole('header', { name: /hoş geldiniz/ })).toBeOnTheScreen()
    expect(app.screen.queryByRole('button', { name: 'Giriş yap' })).not.toBeOnTheScreen()
    await userEvent.setup().press(app.screen.getByRole('button', { name: 'Başla' }))
    expect(await app.screen.findByLabelText('Yeni görev')).toBeOnTheScreen()
    expect(app.getPathname()).toBe('/tasks')
  })

  it('API açıkken kayıt, giriş ve hesapsız devam seçenekleri görünür; hesapsız devam görevlere götürür', async () => {
    const app = await renderApp({ url: '/', backend: new FakeBackend() })
    const user = userEvent.setup()
    expect(await app.screen.findByRole('button', { name: 'Hesap oluştur' })).toBeOnTheScreen()
    expect(app.screen.getByRole('button', { name: 'Giriş yap' })).toBeOnTheScreen()
    await user.press(app.screen.getByRole('button', { name: 'Hesapsız devam et' }))
    expect(await app.screen.findByLabelText('Yeni görev')).toBeOnTheScreen()
    expect(await getDeviceValue(await openDeviceDb(), 'welcomeDone')).toBe(true)
  })
})

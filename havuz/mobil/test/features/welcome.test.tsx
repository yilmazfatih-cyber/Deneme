/**
 * Karşılama ekranı: API kapalıyken yalnız "Başla"; açıkken kayıt / giriş / hesapsız devam. Hesapsız devam edince
 * görevlere gidilir ve karşılama bir daha gösterilmez.
 */
import { userEvent } from '@testing-library/react-native'
import { renderApp, resetApp } from '../support/app.tsx'

afterEach(resetApp)

describe('karşılama', () => {
  it('API kapalıyken "Başla" görevlere götürür', async () => {
    const { screen, getPathname } = await renderApp({ url: '/' })
    expect(await screen.findByRole('header', { name: /hoş geldiniz/ })).toBeOnTheScreen()
    expect(screen.queryByRole('button', { name: 'Giriş yap' })).not.toBeOnTheScreen()
    await userEvent.setup().press(screen.getByRole('button', { name: 'Başla' }))
    expect(await screen.findByLabelText('Yeni görev')).toBeOnTheScreen()
    expect(getPathname()).toBe('/tasks')
  })
})

/**
 * Bilinmeyen adres: Türkçe "Sayfa bulunamadı" ekranı ve ana ekrana dönüş düğmesi.
 */
import { renderApp, resetApp, skipWelcome } from '../support/app.tsx'

afterEach(resetApp)

describe('bulunamayan adres', () => {
  it('Türkçe boş durum ve dönüş düğmesi gösterir', async () => {
    await skipWelcome()
    const app = await renderApp({ url: '/boyle-bir-sayfa-yok' })
    expect(await app.screen.findByRole('button', { name: 'Ana ekrana dön' })).toBeOnTheScreen()
    expect(app.screen.getAllByText('Sayfa bulunamadı').length).toBeGreaterThan(0)
  })
})

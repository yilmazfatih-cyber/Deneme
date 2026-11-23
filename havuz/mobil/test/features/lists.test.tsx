/**
 * Listeler: liste ekle (boş ad iletisi), açık görev sayısı, listeye dokununca görevler o listeyle süzülür,
 * listeyi yeniden adlandır, sil + geri al.
 */
import { userEvent } from '@testing-library/react-native'
import { renderApp, resetApp, skipWelcome } from '../support/app.tsx'

afterEach(resetApp)

async function openLists() {
  await skipWelcome()
  const app = await renderApp({ url: '/lists' })
  await app.screen.findByLabelText('Liste adı')
  return { ...app, user: userEvent.setup() }
}

describe('listeler', () => {
  it('liste eklenir; boş ad reddedilir', async () => {
    const app = await openLists()
    await app.user.press(app.screen.getByRole('button', { name: 'Listeyi ekle' }))
    expect(await app.screen.findByText('Listeye bir ad verin.')).toBeOnTheScreen()
    await app.user.type(app.screen.getByLabelText('Liste adı'), 'Ev işleri')
    await app.user.press(app.screen.getByRole('radio', { name: 'Yeşil' }))
    await app.user.press(app.screen.getByRole('button', { name: 'Listeyi ekle' }))
    expect(await app.screen.findByRole('button', { name: /^Ev işleri/ })).toBeOnTheScreen()
    expect(app.screen.getByText('0 açık görev')).toBeOnTheScreen()
  })

  it('listeye dokununca görevler o listeyle süzülür; yeni görev o listeye eklenir', async () => {
    const app = await openLists()
    await app.user.type(app.screen.getByLabelText('Liste adı'), 'Market')
    await app.user.press(app.screen.getByRole('button', { name: 'Listeyi ekle' }))
    await app.user.press(await app.screen.findByRole('button', { name: /^Market/ }))
    expect(await app.screen.findByRole('button', { name: 'Liste: Market · Kaldır' })).toBeOnTheScreen()
    await app.user.type(app.screen.getByLabelText('Yeni görev'), 'Ekmek')
    await app.user.press(app.screen.getByRole('button', { name: 'Ekle' }))
    expect(await app.screen.findByText('Ekmek')).toBeOnTheScreen()
    expect(app.screen.getByText('Market')).toBeOnTheScreen()
  })

  it('liste yeniden adlandırılır; silinen liste geri alınır', async () => {
    const app = await openLists()
    await app.user.type(app.screen.getByLabelText('Liste adı'), 'İş')
    await app.user.press(app.screen.getByRole('button', { name: 'Listeyi ekle' }))
    await app.user.press(await app.screen.findByRole('button', { name: '“İş” listesini düzenle' }))
    const name = await app.screen.findByDisplayValue('İş')
    await app.user.clear(name)
    await app.user.type(name, 'Ofis')
    await app.user.press(app.screen.getByRole('button', { name: 'Kaydet' }))
    expect(await app.screen.findByRole('button', { name: /^Ofis/ })).toBeOnTheScreen()

    await app.user.press(app.screen.getByRole('button', { name: '“Ofis” listesini düzenle' }))
    await app.user.press(await app.screen.findByRole('button', { name: '“Ofis” listesini sil' }))
    expect(await app.screen.findByText('Henüz liste yok')).toBeOnTheScreen()
    await app.user.press(app.screen.getByRole('button', { name: 'Geri al' }))
    expect(await app.screen.findByRole('button', { name: /^Ofis/ })).toBeOnTheScreen()
  })
})

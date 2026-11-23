/**
 * Alan değiştirici: paylaşımlı alana geçilir, görevler o alandan okunur ve oraya yazılır (sunucuya gider);
 * izleyici rolünde yazma denetimleri kapanır.
 */
import { userEvent } from '@testing-library/react-native'
import { renderApp, resetApp, signedIn } from '../support/app.tsx'
import { FakeBackend } from '../support/fakeApi.ts'

afterEach(resetApp)

describe('çalışma alanları', () => {
  it('paylaşımlı alana geçilir; yeni görev o alana yazılır ve eşitlenir', async () => {
    const backend = new FakeBackend()
    const owner = backend.createAccount('burak@ornek.com', 'uzun-bir-sifre-42', 'Burak')
    const shared = backend.server.createWorkspace(owner.user.id, 'Ev')
    const { account, tokens } = await signedIn(backend)
    backend.server.setMember(shared, account.user.id, 'editor')
    const app = await renderApp({ url: '/tasks', backend, tokens })
    const user = userEvent.setup()
    await user.press(await app.screen.findByRole('button', { name: /^Alan: .* · Değiştir$/ }))
    await user.press(await app.screen.findByRole('radio', { name: 'Ev · Paylaşımlı · Düzenleyen' }))
    expect(await app.screen.findByRole('button', { name: 'Alan: Ev · Değiştir' })).toBeOnTheScreen()
    await user.type(app.screen.getByLabelText('Yeni görev'), 'Ortak alışveriş')
    await user.press(app.screen.getByRole('button', { name: 'Ekle' }))
    await app.screen.findByText('Ortak alışveriş')
    await user.press(app.screen.getByRole('button', { name: /^Ayarlar sekmesi/ }))
    await user.press(await app.screen.findByRole('button', { name: 'Şimdi eşitle' }))
    expect(await app.screen.findByText('Eşitlendi')).toBeOnTheScreen()
    expect(backend.server.recordsOf(shared).map((record) => record.data.title)).toEqual(['Ortak alışveriş'])
  })

  it('izleyici rolünde görevler okunur ama değiştirilemez', async () => {
    const backend = new FakeBackend()
    const owner = backend.createAccount('burak@ornek.com', 'uzun-bir-sifre-42', 'Burak')
    const shared = backend.server.createWorkspace(owner.user.id, 'Ofis')
    backend.server.sync(owner.user.id, {
      protocolVersion: 1,
      clientId: 'burak-telefon',
      cursors: {},
      mutations: [
        {
          mid: 1,
          workspaceId: shared,
          collection: 'tasks',
          recordId: 'gorev-1',
          at: new Date().toISOString(),
          op: 'put',
          data: { title: 'Toplantı notları' },
        },
      ],
    })
    const { account, tokens } = await signedIn(backend)
    backend.server.setMember(shared, account.user.id, 'viewer')
    const app = await renderApp({ url: '/tasks', backend, tokens })
    const user = userEvent.setup()
    await user.press(await app.screen.findByRole('button', { name: /^Alan: .* · Değiştir$/ }))
    await user.press(await app.screen.findByRole('radio', { name: 'Ofis · Paylaşımlı · İzleyici' }))
    expect(await app.screen.findByText('Bu alanı yalnız görüntüleyebilirsiniz.')).toBeOnTheScreen()
    expect(await app.screen.findByText('Toplantı notları')).toBeOnTheScreen()
    expect(app.screen.queryByLabelText('Yeni görev')).not.toBeOnTheScreen()
    expect(app.screen.queryByRole('button', { name: '“Toplantı notları” görevini sil' })).not.toBeOnTheScreen()
    expect(app.screen.getByRole('checkbox', { name: '“Toplantı notları” tamamlandı olarak işaretle' })).toBeDisabled()
  })
})

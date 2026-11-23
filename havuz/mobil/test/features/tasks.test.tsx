/**
 * Görevler (hesapsız kip, gerçek rotalar + SQLite): ekle, boş başlık iletisi, tamamla + durum süzgeci, Türkçe arama
 * ("ILAC" → "İlaç al"), sil + geri al, düzenleme ekranında başlık/son tarih/öncelik, olmayan görev.
 */
import { userEvent } from '@testing-library/react-native'
import { renderApp, resetApp, skipWelcome } from '../support/app.tsx'

afterEach(resetApp)

async function openTasks() {
  await skipWelcome()
  const app = await renderApp({ url: '/tasks' })
  await app.screen.findByLabelText('Yeni görev')
  return { ...app, user: userEvent.setup() }
}

async function addTask(app: Awaited<ReturnType<typeof openTasks>>, title: string) {
  await app.user.type(app.screen.getByLabelText('Yeni görev'), title)
  await app.user.press(app.screen.getByRole('button', { name: 'Ekle' }))
  await app.screen.findByRole('checkbox', { name: `“${title}” tamamlandı olarak işaretle` })
}

describe('görevler', () => {
  it('görev eklenir; boş başlık sözlükteki iletiyle reddedilir', async () => {
    const app = await openTasks()
    expect(app.screen.getByText('Henüz görev yok')).toBeOnTheScreen()
    await app.user.press(app.screen.getByRole('button', { name: 'Ekle' }))
    expect(await app.screen.findByText('Göreve bir başlık yazın.')).toBeOnTheScreen()
    await addTask(app, 'Süt al')
    expect(app.screen.getByLabelText('Yeni görev')).toHaveDisplayValue('')
    expect(app.screen.getByRole('radio', { name: 'Açık (1)' })).toBeChecked()
  })

  it('tamamlanan görev "Açık"tan çıkar, "Biten"de görünür; yeniden açılabilir', async () => {
    const app = await openTasks()
    await addTask(app, 'Rapor yaz')
    await app.user.press(app.screen.getByRole('checkbox', { name: '“Rapor yaz” tamamlandı olarak işaretle' }))
    expect(await app.screen.findByText('Bu süzgece uyan görev yok')).toBeOnTheScreen()
    await app.user.press(app.screen.getByRole('radio', { name: 'Biten (1)' }))
    const box = await app.screen.findByRole('checkbox', { name: '“Rapor yaz” yeniden aç' })
    expect(box).toBeChecked()
    await app.user.press(box)
    expect(await app.screen.findByRole('radio', { name: 'Açık (1)' })).toBeOnTheScreen()
  })

  it('arama Türkçe harflere duyarsızdır: "ILAC" → "İlaç al"', async () => {
    const app = await openTasks()
    await addTask(app, 'İlaç al')
    await addTask(app, 'Fatura öde')
    await app.user.type(app.screen.getByLabelText('Görevlerde ara'), 'ILAC')
    expect(await app.screen.findByRole('radio', { name: 'Açık (1)' })).toBeOnTheScreen()
    expect(app.screen.getByText('İlaç al')).toBeOnTheScreen()
    expect(app.screen.queryByText('Fatura öde')).not.toBeOnTheScreen()
  })

  it('silinen görev "Geri al" ile döner', async () => {
    const app = await openTasks()
    await addTask(app, 'Geçici iş')
    await app.user.press(app.screen.getByRole('button', { name: '“Geçici iş” görevini sil' }))
    expect(await app.screen.findByText('“Geçici iş” silindi.')).toBeOnTheScreen()
    expect(app.screen.queryByText('Geçici iş')).not.toBeOnTheScreen()
    await app.user.press(app.screen.getByRole('button', { name: 'Geri al' }))
    expect(await app.screen.findByText('Geçici iş')).toBeOnTheScreen()
  })

  it('düzenleme: başlık, son tarih ve öncelik kaydedilir; geçersiz tarih yazılınca ileti çıkar', async () => {
    const app = await openTasks()
    await addTask(app, 'Banka')
    await app.user.press(app.screen.getByRole('button', { name: '“Banka” görevini aç' }))
    const title = await app.screen.findByLabelText('Başlık')
    expect(app.getPathname()).toMatch(/^\/task\//)
    await app.user.clear(title)
    await app.user.type(title, 'Bankaya git')
    await app.user.type(app.screen.getByLabelText('Başka bir gün'), '31.02.2026')
    expect(await app.screen.findByText('Tarihi GG.AA.YYYY biçiminde yazın (ör. 17.11.2026).')).toBeOnTheScreen()
    await app.user.clear(app.screen.getByLabelText('Başka bir gün'))
    await app.user.type(app.screen.getByLabelText('Başka bir gün'), '17.11.2030')
    await app.user.press(app.screen.getByRole('radio', { name: 'Yüksek' }))
    await app.user.press(app.screen.getByRole('button', { name: 'Kaydet' }))
    expect(await app.screen.findByText('Bankaya git')).toBeOnTheScreen()
    expect(app.screen.getByText('17 Kasım 2030')).toBeOnTheScreen()
    expect(app.getPathname()).toBe('/tasks')
  })

  it('olmayan görevin adresi yol gösteren boş durum gösterir', async () => {
    await skipWelcome()
    const app = await renderApp({ url: '/task/yok-boyle-bir-gorev' })
    expect(await app.screen.findByText('Görev bulunamadı')).toBeOnTheScreen()
    expect(app.screen.getByRole('button', { name: 'Görevlere dön' })).toBeOnTheScreen()
  })
})

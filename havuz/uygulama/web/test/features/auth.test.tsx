/**
 * Oturum ekranları (sahte API ile): kayıt → görevler, yanlış şifre iletisi, hesapsız kayıtları hesaba taşıma,
 * çıkışta "bu cihazdaki veriyi de sil".
 */
import { LOCAL_WORKSPACE_ID } from '@uygulama/shared'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { readSession } from '../../src/lib/session/store.ts'
import { LOCAL_DB_NAME, openDb, userDbName } from '../../src/lib/store/db.ts'
import { createRecord, listRecords } from '../../src/lib/store/records.ts'
import { FakeBackend } from '../helpers/fakeApi.ts'
import { renderApp, resetBrowserData } from '../helpers/render.tsx'

const PASSWORD = 'mavi-deniz-kenari-42'

beforeEach(async () => {
  await resetBrowserData()
})

describe('Oturum', () => {
  it('ilk açılışta karşılama gelir; kayıt olunca kişisel alanın görevleri açılır', async () => {
    const user = userEvent.setup()
    const backend = new FakeBackend()
    renderApp({ path: '/', api: backend.device().api })
    await user.click(await screen.findByRole('link', { name: 'Hesap oluştur' }))
    await user.type(await screen.findByRole('textbox', { name: 'Adınız' }), 'Ayşe')
    await user.type(screen.getByRole('textbox', { name: 'E-posta' }), 'ayse@ornek.com')
    await user.type(screen.getByLabelText('Yeni şifre'), 'kısa')
    await user.click(screen.getByRole('button', { name: 'Hesap oluştur' }))
    expect(await screen.findByText('Şifre en az 10 karakter olmalı.')).toBeInTheDocument()

    await user.clear(screen.getByLabelText('Yeni şifre'))
    await user.type(screen.getByLabelText('Yeni şifre'), PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Hesap oluştur' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Görevler' })).toBeInTheDocument()
    expect(await screen.findByText(/Kişisel · 0 açık görev/)).toBeInTheDocument()
    expect((await readSession())?.user.email).toBe('ayse@ornek.com')
  })

  it('yanlış şifrede suçlamayan ileti gösterilir', async () => {
    const user = userEvent.setup()
    const backend = new FakeBackend()
    backend.createAccount('ayse@ornek.com', PASSWORD)
    renderApp({ path: '/giris', api: backend.device().api })
    await user.type(await screen.findByRole('textbox', { name: 'E-posta' }), 'ayse@ornek.com')
    await user.type(screen.getByLabelText('Şifre'), 'yanlis-sifre-123')
    await user.click(screen.getByRole('button', { name: 'Giriş yap' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('E-posta ya da şifre eşleşmedi. Yeniden deneyin.')
  })

  it('hesapsız yazılan kayıtlar girişte hesaba taşınır ve sunucuya ulaşır', async () => {
    const user = userEvent.setup()
    const backend = new FakeBackend()
    const account = backend.createAccount('ayse@ornek.com', PASSWORD)
    await createRecord(openDb(LOCAL_DB_NAME), LOCAL_WORKSPACE_ID, 'tasks', { title: 'Hesapsız yazdım' })
    renderApp({ path: '/giris', api: backend.device().api })
    await user.type(await screen.findByRole('textbox', { name: 'E-posta' }), 'ayse@ornek.com')
    await user.type(screen.getByLabelText('Şifre'), PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Giriş yap' }))

    expect(await screen.findByRole('heading', { name: 'Kayıtlarınızı hesaba taşıyalım mı?' })).toBeInTheDocument()
    expect(await screen.findByText('1 görev')).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'Hesabıma taşı' }))
    expect(await screen.findByRole('link', { name: 'Hesapsız yazdım' })).toBeInTheDocument()
    expect(await listRecords(openDb(LOCAL_DB_NAME), LOCAL_WORKSPACE_ID, 'tasks')).toEqual([])
    await waitFor(() =>
      expect(backend.server.recordsOf(account.personalWorkspaceId).map((record) => record.data.title)).toEqual([
        'Hesapsız yazdım',
      ]),
    )
  })

  it('çıkışta "bu cihazdaki veriyi de sil" seçilirse kullanıcı veritabanı silinir', async () => {
    const user = userEvent.setup()
    const backend = new FakeBackend()
    const account = backend.createAccount('ayse@ornek.com', PASSWORD)
    renderApp({ path: '/giris?next=%2Fhesap', api: backend.device().api })
    await user.type(await screen.findByRole('textbox', { name: 'E-posta' }), 'ayse@ornek.com')
    await user.type(screen.getByLabelText('Şifre'), PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Giriş yap' }))
    await user.click(await screen.findByRole('button', { name: 'Çıkış yap' }))
    await user.click(await screen.findByRole('checkbox', { name: 'Bu cihazdaki veriyi de sil' }))
    const dialog = await screen.findByRole('dialog', { name: 'Çıkış yapılsın mı?' })
    await user.click(dialog.querySelector('footer button:last-child') as HTMLElement)
    expect(await screen.findByRole('heading', { level: 1, name: 'Görevler' })).toBeInTheDocument()
    expect(await readSession()).toBeNull()
    await waitFor(async () => {
      const names = (await indexedDB.databases()).map((info) => info.name)
      expect(names).not.toContain(userDbName(account.user.id))
    })
  })
})

describe('giriş sonrası yönlendirme', () => {
  it('yalnız uygulama içi yollar kabul edilir (açık yönlendirme yok)', async () => {
    const { safeNext } = await import('../../src/features/auth/afterLogin.ts')
    expect(safeNext('/davet?token=abc')).toBe('/davet?token=abc')
    for (const bad of ['//kotu.site', 'https://kotu.site', '/\\kotu.site', 'gorevler', null, '']) {
      expect(safeNext(bad)).toBe('/gorevler')
    }
  })
})

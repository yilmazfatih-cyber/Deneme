/**
 * Görevler özelliği (başvuru özelliği) ekran testleri: hızlı ekleme ve doğrulama iletisi, form doğrulaması,
 * silme + "Geri al", Türkçe'ye duyarlı arama, izleyici rolünde yazma denetimlerinin kapalı olması, son silinenler.
 */
import { LOCAL_WORKSPACE_ID } from '@uygulama/shared'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { TaskEditPage } from '../../src/features/tasks/TaskEditPage.tsx'
import { TasksPage } from '../../src/features/tasks/TasksPage.tsx'
import { LOCAL_DB_NAME, openDb } from '../../src/lib/store/db.ts'
import { createRecord, listRecords } from '../../src/lib/store/records.ts'
import { renderApp, renderWithStore, resetBrowserData } from '../helpers/render.tsx'

beforeEach(async () => {
  await resetBrowserData()
})

describe('Görevler', () => {
  it('hızlı ekleme: Enter ile görev eklenir; boş başlıkta şemanın iletisi alanın altında görünür', async () => {
    const user = userEvent.setup()
    renderApp({ path: '/gorevler' })
    const input = await screen.findByRole('textbox', { name: 'Yeni görev' })
    await user.type(input, '   {Enter}')
    expect(await screen.findByText('Göreve bir başlık yazın.')).toBeInTheDocument()
    expect(input).toHaveAttribute('aria-invalid', 'true')

    await user.clear(input)
    await user.type(input, 'Süt al{Enter}')
    expect(await screen.findByRole('link', { name: 'Süt al' })).toBeInTheDocument()
    expect(screen.queryByText('Göreve bir başlık yazın.')).not.toBeInTheDocument()
    const stored = await listRecords(openDb(LOCAL_DB_NAME), LOCAL_WORKSPACE_ID, 'tasks')
    expect(stored.map((task) => task.data.title)).toEqual(['Süt al'])
  })

  it('silme anında olur; "Geri al" görevi geri getirir', async () => {
    const user = userEvent.setup()
    const db = openDb(LOCAL_DB_NAME)
    await createRecord(db, LOCAL_WORKSPACE_ID, 'tasks', { title: 'Faturayı öde' })
    renderApp({ path: '/gorevler' })
    await user.click(await screen.findByRole('button', { name: '“Faturayı öde” seçenekleri' }))
    await user.click(screen.getByRole('menuitem', { name: 'Sil' }))
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Faturayı öde' })).not.toBeInTheDocument())
    expect(screen.getByText('“Faturayı öde” silindi.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Geri al' }))
    expect(await screen.findByRole('link', { name: 'Faturayı öde' })).toBeInTheDocument()
  })

  it('arama Türkçe harflere duyarsızdır: "ilac" → "İlaçları al"', async () => {
    const user = userEvent.setup()
    const db = openDb(LOCAL_DB_NAME)
    await createRecord(db, LOCAL_WORKSPACE_ID, 'tasks', { title: 'İlaçları al' })
    await createRecord(db, LOCAL_WORKSPACE_ID, 'tasks', { title: 'Süt al' })
    renderApp({ path: '/gorevler' })
    await screen.findByRole('link', { name: 'Süt al' })
    await user.type(screen.getByRole('searchbox', { name: 'Görevlerde ara' }), 'ILAC')
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Süt al' })).not.toBeInTheDocument())
    expect(screen.getByRole('link', { name: 'İlaçları al' })).toBeInTheDocument()
  })

  it('tamamlanan görev "Biten" sekmesine geçer', async () => {
    const user = userEvent.setup()
    const db = openDb(LOCAL_DB_NAME)
    await createRecord(db, LOCAL_WORKSPACE_ID, 'tasks', { title: 'Rapor yaz' })
    renderApp({ path: '/gorevler' })
    await user.click(await screen.findByRole('checkbox', { name: '“Rapor yaz” tamamlandı olarak işaretle' }))
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Rapor yaz' })).not.toBeInTheDocument())
    await user.click(screen.getByRole('tab', { name: /Biten/ }))
    expect(await screen.findByRole('link', { name: 'Rapor yaz' })).toBeInTheDocument()
  })

  it('tam form: geçersiz değerlerde iletiler alanların altında görünür ve kayıt yapılmaz', async () => {
    const user = userEvent.setup()
    const { db } = renderWithStore(<TaskEditPage />)
    await user.click(await screen.findByRole('button', { name: 'Görevi ekle' }))
    expect(await screen.findByText('Göreve bir başlık yazın.')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Başlık' })).toHaveAttribute('aria-invalid', 'true')
    const title = screen.getByRole('textbox', { name: 'Başlık' })
    await waitFor(() => expect(title).toHaveFocus()) // ilk hatalı alana odaklanıldı
    await user.type(title, 'Uzun notlu görev')
    await user.click(screen.getByRole('textbox', { name: 'Not' }))
    await user.paste('x'.repeat(5001))
    await user.click(screen.getByRole('button', { name: 'Görevi ekle' }))
    expect(await screen.findByText('Not en çok 5000 karakter olabilir.')).toBeInTheDocument()
    expect(await db.records.count()).toBe(0)
  })

  it('izleyici rolünde ekleme kutusu yoktur, onay kutuları kapalıdır', async () => {
    const db = openDb('izleyici-testi')
    await createRecord(db, 'ortak', 'tasks', { title: 'Ortak görev' })
    renderWithStore(<TasksPage />, {
      db,
      workspace: { id: 'ortak', name: 'Ev', role: 'viewer', canWrite: false, local: false, kind: 'shared' },
    })
    expect(await screen.findByText('Bu alanı yalnız görüntüleyebilirsiniz.')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Yeni görev' })).not.toBeInTheDocument()
    expect(await screen.findByRole('checkbox', { name: /Ortak görev/ })).toBeDisabled()
    expect(screen.queryByRole('button', { name: /seçenekleri/ })).not.toBeInTheDocument()
  })

  it('son silinenler: silinen görev listelenir ve geri getirilir', async () => {
    const user = userEvent.setup()
    const db = openDb(LOCAL_DB_NAME)
    const id = await createRecord(db, LOCAL_WORKSPACE_ID, 'tasks', { title: 'Eski görev' })
    const { removeRecord } = await import('../../src/lib/store/records.ts')
    await removeRecord(db, LOCAL_WORKSPACE_ID, 'tasks', id)
    renderApp({ path: '/silinenler' })
    const item = (await screen.findByText('Eski görev')).closest('li')
    expect(item).not.toBeNull()
    await user.click(within(item as HTMLElement).getByRole('button', { name: '“Eski görev” geri getir' }))
    await waitFor(async () => expect(await listRecords(db, LOCAL_WORKSPACE_ID, 'tasks')).toHaveLength(1))
  })

  it('listeler: yeni liste açılır ve görevler o listeye göre süzülür', async () => {
    const user = userEvent.setup()
    renderApp({ path: '/listeler' })
    await user.click(await screen.findByRole('button', { name: 'Yeni liste' }))
    const dialog = await screen.findByRole('dialog', { name: 'Yeni liste' })
    await user.type(within(dialog).getByRole('textbox', { name: 'Liste adı' }), 'Market')
    await user.click(within(dialog).getByRole('button', { name: 'Ekle' }))
    await user.click(await screen.findByRole('link', { name: /Market/ }))
    const input = await screen.findByRole('textbox', { name: 'Yeni görev' })
    await user.type(input, 'Ekmek{Enter}')
    const db = openDb(LOCAL_DB_NAME)
    await waitFor(async () => {
      const [task] = await listRecords(db, LOCAL_WORKSPACE_ID, 'tasks')
      const [list] = await listRecords(db, LOCAL_WORKSPACE_ID, 'lists')
      expect(task?.data.listId).toBe(list?.id)
    })
  })
})

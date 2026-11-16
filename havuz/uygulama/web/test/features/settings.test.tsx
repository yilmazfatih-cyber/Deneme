/**
 * Ayarlar: görünüm ayarları <html>'e uygulanır ve saklanır; içe aktarma özet gösterip onayla yazar.
 */
import { LOCAL_WORKSPACE_ID } from '@uygulama/shared'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { APP } from '../../src/app/config.ts'
import { BACKUP_FORMAT } from '../../src/lib/backup.ts'
import { LOCAL_DB_NAME, openDb } from '../../src/lib/store/db.ts'
import { listRecords } from '../../src/lib/store/records.ts'
import { renderApp, resetBrowserData } from '../helpers/render.tsx'

beforeEach(async () => {
  await resetBrowserData()
})

describe('Ayarlar', () => {
  it('tema, yazı boyutu ve yüksek karşıtlık hemen uygulanır ve hatırlanır', async () => {
    const user = userEvent.setup()
    renderApp({ path: '/ayarlar' })
    await user.click(await screen.findByRole('radio', { name: 'Koyu' }))
    await user.click(screen.getByRole('radio', { name: 'Büyük' }))
    await user.click(screen.getByRole('switch', { name: 'Yüksek karşıtlık' }))
    const root = document.documentElement
    expect(root.dataset).toMatchObject({ theme: 'dark', font: 'large', contrast: 'high' })
    expect(JSON.parse(localStorage.getItem(`${APP.id}.gorunum`) ?? '{}')).toMatchObject({
      theme: 'dark',
      fontScale: 'large',
      highContrast: true,
    })
    await user.click(screen.getByRole('radio', { name: 'Sistem' }))
    expect(root.dataset.theme).toBe('light') // test ortamında sistem açık temada
  })

  it('içe aktarma: dosya doğrulanır, özet gösterilir, onaylanınca yazılır', async () => {
    const user = userEvent.setup()
    renderApp({ path: '/ayarlar' })
    const backup = {
      format: BACKUP_FORMAT,
      version: 1,
      exportedAt: '2026-11-16T09:00:00Z',
      collections: {
        tasks: [
          { id: 'gorev-1', data: { title: 'Yedekten gelen' } },
          { id: 'gorev-2', data: { title: '' } },
        ],
      },
    }
    const file = new File([JSON.stringify(backup)], 'yedek.json', { type: 'application/json' })
    await user.click(await screen.findByRole('button', { name: 'İçe aktar' }))
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!
    await user.upload(input, file)
    const dialog = await screen.findByRole('dialog', { name: 'Yedek içe aktarılsın mı?' })
    expect(within(dialog).getByText(/1 yeni kayıt eklenecek, 0 kayıt güncellenecek/)).toBeInTheDocument()
    expect(within(dialog).getByText('1 kayıt okunamadı ve atlanacak.')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'İçe aktar' }))
    await waitFor(async () =>
      expect((await listRecords(openDb(LOCAL_DB_NAME), LOCAL_WORKSPACE_ID, 'tasks')).map((t) => t.data.title)).toEqual([
        'Yedekten gelen',
      ]),
    )
  })
})

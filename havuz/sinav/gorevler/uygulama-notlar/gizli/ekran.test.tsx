/**
 * Gizli sınav testi (uygulama-notlar): sortNotes, liste sayfasında sıra ve "Sabitle" onay kutusu.
 */
import { LOCAL_WORKSPACE_ID } from '@uygulama/shared'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { sortNotes } from '../src/features/notes/logic.ts'
import { LOCAL_DB_NAME, openDb } from '../src/lib/store/db.ts'
import { createRecord, listRecords } from '../src/lib/store/records.ts'
import { renderApp, resetBrowserData } from './helpers/render.tsx'

const STAMP = '2026-11-16T09:00:00.000Z'
const note = (id: string, order: number, pinned: boolean) => ({
  id,
  deleted: false,
  createdAt: STAMP,
  updatedAt: STAMP,
  data: { title: id, note: '', pinned, order },
})
const create = (input: Record<string, unknown>) =>
  createRecord(openDb(LOCAL_DB_NAME), LOCAL_WORKSPACE_ID, 'notes' as never, input as never)

beforeEach(async () => {
  await resetBrowserData()
})

describe('gizli: notlar', () => {
  it('sortNotes: sabitlenmişler üstte, her grup order sırasında', () => {
    const input = [note('c', 3, false), note('a', 1, false), note('e', 5, true), note('b', 2, true), note('d', 4, false)]
    const sorted = sortNotes(input as never) as unknown as { id: string }[]
    expect(sorted.map((item) => item.id)).toEqual(['b', 'e', 'a', 'c', 'd'])
    expect(sortNotes([] as never)).toEqual([])
  })

  it('liste sayfasında sabitlenmiş not en üstte', async () => {
    await create({ title: 'Alışveriş listesi', order: 1 })
    await create({ title: 'Doktor randevusu', order: 2, pinned: true })
    await create({ title: 'Kitap önerileri', order: 3 })
    renderApp({ path: '/notlar' })
    await screen.findByRole('link', { name: /Kitap önerileri/ })
    const titles = ['Alışveriş listesi', 'Doktor randevusu', 'Kitap önerileri']
    const seen: string[] = []
    for (const link of screen.getAllByRole('link')) {
      const title = titles.find((candidate) => link.textContent?.includes(candidate))
      if (title && !seen.includes(title)) seen.push(title)
    }
    expect(seen).toEqual(['Doktor randevusu', 'Alışveriş listesi', 'Kitap önerileri'])
  })

  it('düzenleme ekranındaki "Sabitle" kutusu kaydedilir', async () => {
    const user = userEvent.setup()
    const id = await create({ title: 'Doktor randevusu', order: 1 })
    renderApp({ path: `/notlar/${id}` })
    await user.click(await screen.findByLabelText('Sabitle'))
    const save = screen.queryByRole('button', { name: 'Kaydet' })
    if (save) await user.click(save)
    await waitFor(async () => {
      const [stored] = await listRecords(openDb(LOCAL_DB_NAME), LOCAL_WORKSPACE_ID, 'notes' as never)
      expect((stored?.data as { pinned?: boolean } | undefined)?.pinned).toBe(true)
    })
  })
})

// Node ortamı: jsdom'un Blob'u IndexedDB'de (structuredClone) saklanamıyor; tarayıcıda sorun yok.
// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { db, updateSettings } from '../../src/db'
import { createBackup, readBackupSummary, restoreBackup } from '../../src/lib/backup'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('yedek', () => {
  it('fotoğraf ve ses dahil tüm veri .zip ile gidip gelir', async () => {
    const photo = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/jpeg' })
    const audio = new Blob([new Uint8Array([9, 8, 7])], { type: 'audio/webm' })
    await db.personalItems.put({
      id: 'p1',
      word: 'Elif',
      category: 'kisiler',
      photo,
      audio,
      phrases: ['Elif nerede?'],
      createdAt: 1,
    })
    await db.profile.put({
      id: 'main',
      name: 'Ayşe',
      message: 'Afazim var.',
      emergencyName: 'Zeynep',
      emergencyPhone: '0555',
    })
    await updateSettings({ leftHand: true, grid: '2x3' })
    await db.practiceRecords.add({
      wordId: 'su',
      at: 5,
      activity: 'naming',
      cueLevel: 0,
      result: 'said',
      responseMs: 1200,
      sessionId: 's',
    })
    await db.srsStates.put({ wordId: 'su', stage: 'hatirla', box: 2, nextReview: 10, streak: 1, updatedAt: 5 })

    const zip = await createBackup()
    const summary = await readBackupSummary(zip)
    expect(summary.personalItems).toBe(1)
    expect(summary.practiceRecords).toBe(1)

    await Promise.all(db.tables.map((t) => t.clear()))
    expect(await db.personalItems.count()).toBe(0)

    await restoreBackup(zip)
    const item = await db.personalItems.get('p1')
    expect(item?.word).toBe('Elif')
    expect(item?.photo?.type).toBe('image/jpeg')
    expect(new Uint8Array(await item!.photo!.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]))
    expect(new Uint8Array(await item!.audio!.arrayBuffer())).toEqual(new Uint8Array([9, 8, 7]))
    expect((await db.profile.get('main'))?.name).toBe('Ayşe')
    expect((await db.settings.get('main'))?.leftHand).toBe(true)
    expect(await db.practiceRecords.count()).toBe(1)
    expect((await db.srsStates.get('su'))?.box).toBe(2)
  })

  it('başka bir dosya reddedilir', async () => {
    await expect(readBackupSummary(new Blob(['merhaba']))).rejects.toThrow()
  })
})

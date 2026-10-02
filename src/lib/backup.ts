import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate'
import {
  db,
  type PersonalItem,
  type PracticeRecord,
  type Profile,
  type Settings,
  type SrsState,
  type UsageEvent,
} from '../db'

/**
 * Yedek dosyası: tüm kayıtlar (fotoğraf ve sesler dahil) tek bir .zip içinde.
 * Aynı dosya başka bir telefona geri yüklenebilir.
 */

const VERSION = 1
const DATA_FILE = 'kopru-yedek.json'

type StoredPersonalItem = Omit<PersonalItem, 'photo' | 'audio'> & {
  photo?: { path: string; type: string }
  audio?: { path: string; type: string }
}

interface BackupData {
  app: 'kopru'
  version: number
  exportedAt: string
  settings: Settings[]
  profile: Profile[]
  personalItems: StoredPersonalItem[]
  usageEvents: UsageEvent[]
  practiceRecords: PracticeRecord[]
  srsStates: SrsState[]
}

function ext(type: string | undefined): string {
  type = type ?? ''
  if (type.includes('jpeg')) return 'jpg'
  if (type.includes('png')) return 'png'
  if (type.includes('webp')) return 'webp'
  if (type.includes('mp4')) return 'm4a'
  if (type.includes('ogg')) return 'ogg'
  if (type.includes('webm')) return 'webm'
  return 'bin'
}

async function blobBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer())
}

export async function createBackup(): Promise<Blob> {
  const files: Zippable = {}
  const personalItems: StoredPersonalItem[] = []
  for (const item of await db.personalItems.toArray()) {
    const { photo, audio, ...rest } = item
    const stored: StoredPersonalItem = { ...rest }
    if (photo) {
      const path = `media/${item.id}-foto.${ext(photo.type)}`
      files[path] = await blobBytes(photo)
      stored.photo = { path, type: photo.type }
    }
    if (audio) {
      const path = `media/${item.id}-ses.${ext(audio.type)}`
      files[path] = await blobBytes(audio)
      stored.audio = { path, type: audio.type }
    }
    personalItems.push(stored)
  }
  const data: BackupData = {
    app: 'kopru',
    version: VERSION,
    exportedAt: new Date().toISOString(),
    settings: await db.settings.toArray(),
    profile: await db.profile.toArray(),
    personalItems,
    usageEvents: await db.usageEvents.toArray(),
    practiceRecords: await db.practiceRecords.toArray(),
    srsStates: await db.srsStates.toArray(),
  }
  files[DATA_FILE] = strToU8(JSON.stringify(data))
  const zipped = zipSync(files, { level: 6 })
  return new Blob([zipped.slice().buffer as ArrayBuffer], { type: 'application/zip' })
}

export interface BackupSummary {
  exportedAt: string
  personalItems: number
  practiceRecords: number
}

function parse(bytes: Uint8Array): { data: BackupData; files: Record<string, Uint8Array> } {
  const files = unzipSync(bytes)
  const raw = files[DATA_FILE]
  if (!raw) throw new Error('Bu dosya bir Köprü yedeği değil.')
  const data = JSON.parse(strFromU8(raw)) as BackupData
  if (data.app !== 'kopru' || typeof data.version !== 'number') throw new Error('Bu dosya bir Köprü yedeği değil.')
  if (data.version > VERSION) throw new Error('Bu yedek daha yeni bir sürümle alınmış. Önce uygulamayı güncelleyin.')
  return { data, files }
}

export async function readBackupSummary(file: Blob): Promise<BackupSummary> {
  const { data } = parse(await blobBytes(file))
  return {
    exportedAt: data.exportedAt,
    personalItems: data.personalItems.length,
    practiceRecords: data.practiceRecords.length,
  }
}

/** Mevcut verinin yerine yedeği yükler. Çağıran önce kullanıcıdan onay alır. */
export async function restoreBackup(file: Blob): Promise<void> {
  const { data, files } = parse(await blobBytes(file))
  const toBlob = (ref?: { path: string; type: string }) => {
    if (!ref) return undefined
    const bytes = files[ref.path]
    return bytes ? new Blob([bytes.slice().buffer as ArrayBuffer], { type: ref.type }) : undefined
  }
  const personalItems: PersonalItem[] = data.personalItems.map(({ photo, audio, ...rest }) => ({
    ...rest,
    photo: toBlob(photo),
    audio: toBlob(audio),
  }))
  await db.transaction(
    'rw',
    [db.settings, db.profile, db.personalItems, db.usageEvents, db.practiceRecords, db.srsStates],
    async () => {
      await Promise.all([
        db.settings.clear(),
        db.profile.clear(),
        db.personalItems.clear(),
        db.usageEvents.clear(),
        db.practiceRecords.clear(),
        db.srsStates.clear(),
      ])
      await db.settings.bulkPut(data.settings)
      await db.profile.bulkPut(data.profile)
      await db.personalItems.bulkPut(personalItems)
      await db.usageEvents.bulkPut(data.usageEvents)
      await db.practiceRecords.bulkPut(data.practiceRecords)
      await db.srsStates.bulkPut(data.srsStates)
    },
  )
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function backupFilename(now = new Date()): string {
  const d = now.toISOString().slice(0, 10)
  return `kopru-yedek-${d}.zip`
}

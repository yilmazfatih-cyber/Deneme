import Dexie, { type EntityTable } from 'dexie'

/** Telefonda tutulan veri (IndexedDB). Sunucu yok; veri cihazda kalır. */

export interface PersonalItem {
  id: string
  word: string
  category: string
  photo?: Blob
  audio?: Blob
  /** Bu kart hazır içerikteki bir kartın yerine geçer (aynı konumda durur). */
  replacesId?: string
  phrases: string[]
  semanticCue?: string
  sentenceCue?: string
  createdAt: number
}

export interface UsageEvent {
  id?: number
  wordId: string
  at: number
}

export type ActivityType = 'warmup' | 'match' | 'listen' | 'naming' | 'sentence' | 'repeat' | 'scenario'

export type PracticeResult = 'said' | 'said_with_help' | 'not_yet' | 'correct' | 'retry'

export interface PracticeRecord {
  id?: number
  wordId: string
  at: number
  activity: ActivityType
  /** 0 = ipucusuz, 1 anlam, 2 cümle, 3 ilk ses, 4 yazılı kelime, 5 model, 6 = henüz değil */
  cueLevel: number
  result: PracticeResult
  responseMs: number
  sessionId: string
}

export type Stage = 'tani' | 'hatirla' | 'kullan' | 'surdur' | 'kazanildi'

export interface SrsState {
  wordId: string
  stage: Stage
  /** 1–5 */
  box: number
  nextReview: number
  /** Tanı aşamasında üst üste doğru sayısı */
  streak: number
  lastCueLevel?: number
  /** Kullan aşamasından Sürdür'e geçiş zamanı (14 gün kuralı için) */
  maintainSince?: number
  updatedAt: number
}

export type GridSize = '2x3' | '3x3' | '3x4' | '3x5'
export type LayoutMode = 'normal' | 'single' | 'left-half'
export type CueOrder = 'decreasing' | 'increasing'

export interface Settings {
  id: 'main'
  grid: GridSize
  leftHand: boolean
  largeText: boolean
  speechRate: number
  holdMs: number
  highContrast: boolean
  layout: LayoutMode
  figure: 'kadin' | 'erkek'
  voiceURI?: string
  setupDone: boolean
  disclaimerAccepted: boolean
  lastBackupAt?: number
  /** Terapist modu: durak sırası ve ek hedef kelimeler */
  stopOrder?: string[]
  extraWords: string[]
  cueOrder: CueOrder
  sessionSize: number
  /** Tanı aşamasında seçenek sayısı (2–4); oturumda otomatik ayarlanır. */
  choiceCount: number
}

export interface Profile {
  id: 'main'
  name: string
  message: string
  emergencyName: string
  emergencyPhone: string
}

export const defaultSettings: Settings = {
  id: 'main',
  grid: '3x4',
  leftHand: false,
  largeText: false,
  speechRate: 0.8,
  holdMs: 0,
  highContrast: false,
  layout: 'normal',
  figure: 'kadin',
  setupDone: false,
  disclaimerAccepted: false,
  extraWords: [],
  cueOrder: 'decreasing',
  sessionSize: 8,
  choiceCount: 3,
}

export const defaultProfile: Profile = {
  id: 'main',
  name: '',
  message: 'Afazim var. Anlıyorum ama konuşmakta zorlanıyorum.',
  emergencyName: '',
  emergencyPhone: '',
}

export class KopruDB extends Dexie {
  personalItems!: EntityTable<PersonalItem, 'id'>
  usageEvents!: EntityTable<UsageEvent, 'id'>
  practiceRecords!: EntityTable<PracticeRecord, 'id'>
  srsStates!: EntityTable<SrsState, 'wordId'>
  settings!: EntityTable<Settings, 'id'>
  profile!: EntityTable<Profile, 'id'>

  constructor(name = 'kopru') {
    super(name)
    this.version(1).stores({
      personalItems: 'id, category, replacesId, createdAt',
      usageEvents: '++id, wordId, at',
      practiceRecords: '++id, wordId, at, sessionId',
      srsStates: 'wordId, stage, nextReview',
      settings: 'id',
      profile: 'id',
    })
  }
}

export const db = new KopruDB()

export async function getSettings(): Promise<Settings> {
  return { ...defaultSettings, ...(await db.settings.get('main')) }
}

export async function updateSettings(patch: Partial<Omit<Settings, 'id'>>): Promise<void> {
  const current = await getSettings()
  await db.settings.put({ ...current, ...patch, id: 'main' })
}

export async function getProfile(): Promise<Profile> {
  return { ...defaultProfile, ...(await db.profile.get('main')) }
}

export function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

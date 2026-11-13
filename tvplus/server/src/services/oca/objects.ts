/**
 * Nesne kayıt defteri: her teslim edilebilir dosyaya opak bir kimlik (`o`) ve sürüm (`v`) verir.
 * Kökenin gerçek yeri (uzak adres / yerel yol) yalnızca burada durur, istemciye asla gitmez.
 * Kimlik, yerin anahtarlı özetidir (yeniden başlatmada değişmez); eşleme 'oca-objects' deposunda kalıcıdır.
 */
import { createHmac } from 'node:crypto'
import { deriveKey, type AppConfig } from '../../kernel/config'
import { createStore } from '../../kernel/store'

export type ObjectLocation =
  /** Uzak açık köken (DASH temsilleri, PROGRESSIVE dosya) */
  | { kind: 'remote'; url: string; mime: string; size: number | null }
  /** Yerelde paketlenmiş dosya (mediaDir altında mutlak yol) */
  | { kind: 'local'; path: string; mime: string; size: number }
  /** Altyazı kaynağı (uzak adres ya da yerel dosya); OCA bunu TTML'e çevirip verir */
  | { kind: 'text'; url?: string; path?: string; format: 'vtt' | 'ttml'; lang: string }

export interface ObjectRecord {
  o: string
  v: number
  loc: ObjectLocation
}

export interface ObjectRegistry {
  register(loc: ObjectLocation): ObjectRecord
  get(o: string): ObjectRecord | null
  /** Kaydetmeden arar. */
  find(loc: ObjectLocation): ObjectRecord | null
  /** Uzak nesnenin öğrenilen boyunu kaydeder. */
  setSize(o: string, size: number): void
  count(): number
}

function canonical(loc: ObjectLocation): string {
  switch (loc.kind) {
    case 'remote':
      return `remote|${loc.url}`
    case 'local':
      return `local|${loc.path}`
    case 'text':
      return `text|${loc.format}|${loc.lang}|${loc.url ?? ''}|${loc.path ?? ''}`
  }
}

export function createObjectRegistry(config: AppConfig): ObjectRegistry {
  const key = deriveKey(config, 'oca-object')
  const store = createStore(config, 'oca-objects', () => ({ objects: {} as Record<string, ObjectRecord> }))
  const idOf = (loc: ObjectLocation) => createHmac('sha256', key).update(canonical(loc)).digest('hex').slice(0, 16)

  const sizeOf = (loc: ObjectLocation): number | null => (loc.kind === 'text' ? null : loc.size)

  return {
    register(loc) {
      const o = idOf(loc)
      const existing = store.get().objects[o]
      if (existing) {
        const oldSize = sizeOf(existing.loc)
        const newSize = sizeOf(loc)
        const sizeChanged = oldSize !== null && newSize !== null && oldSize !== newSize
        const mimeChanged = 'mime' in loc && 'mime' in existing.loc && existing.loc.mime !== loc.mime
        if (sizeChanged || mimeChanged) {
          // İçerik değişti: sürümü artır (önbellek ve eski imzalı adresler geçersizleşir).
          store.update((s) => {
            s.objects[o] = { o, v: existing.v + 1, loc }
          })
        } else if (oldSize === null && newSize !== null) {
          store.update((s) => {
            s.objects[o] = { ...existing, loc }
          })
        }
        return store.get().objects[o]!
      }
      const rec: ObjectRecord = { o, v: 1, loc }
      store.update((s) => {
        s.objects[o] = rec
      })
      return rec
    },
    get(o) {
      return store.get().objects[o] ?? null
    },
    find(loc) {
      return store.get().objects[idOf(loc)] ?? null
    },
    setSize(o, size) {
      const rec = store.get().objects[o]
      if (!rec || rec.loc.kind !== 'remote' || rec.loc.size === size) return
      store.update((s) => {
        const r = s.objects[o]
        if (r && r.loc.kind === 'remote') r.loc = { ...r.loc, size }
      })
    },
    count: () => Object.keys(store.get().objects).length,
  }
}

/**
 * Manifest önbelleği: anahtar = (viewableId, seçenekler). Kayıt `expiration` anına kadar (güvenlik payı düşülerek)
 * geçerlidir. Aynı anahtar için uçuştaki istek paylaşılır.
 */
import type { LicensedManifest } from '../../../../shared/playback'

export interface ManifestKeyOptions {
  promo?: boolean
  startOver?: boolean
  preferredSource?: 'OWN_CDN' | 'YOUTUBE'
}

/** Süresi bitmeye bu kadar kalmış manifest artık kullanılmaz (imzalı adreslerin oynatma sırasında dolmaması için). */
export const EXPIRY_MARGIN_MS = 60_000

export function manifestKey(viewableId: string, o: ManifestKeyOptions): string {
  return [viewableId, o.promo ? 'promo' : '-', o.startOver ? 'bastan' : '-', o.preferredSource ?? '-'].join('|')
}

interface Entry {
  manifest: LicensedManifest
  storedAt: number
}

export class ManifestCache {
  private entries = new Map<string, Entry>()
  private inflight = new Map<string, Promise<LicensedManifest>>()

  get(key: string, now: number): { manifest: LicensedManifest; ageMs: number } | null {
    const e = this.entries.get(key)
    if (!e) return null
    if (e.manifest.expiration - EXPIRY_MARGIN_MS <= now) {
      this.entries.delete(key)
      return null
    }
    return { manifest: e.manifest, ageMs: now - e.storedAt }
  }

  set(key: string, manifest: LicensedManifest, now: number): void {
    this.entries.set(key, { manifest, storedAt: now })
  }

  delete(key: string): void {
    this.entries.delete(key)
  }

  pending(key: string): Promise<LicensedManifest> | undefined {
    return this.inflight.get(key)
  }

  track(key: string, p: Promise<LicensedManifest>): Promise<LicensedManifest> {
    this.inflight.set(key, p)
    const clear = () => {
      if (this.inflight.get(key) === p) this.inflight.delete(key)
    }
    p.then(clear, clear)
    return p
  }

  /** Süresi geçmiş kayıtları atar. */
  prune(now: number): void {
    for (const [k, e] of this.entries) if (e.manifest.expiration - EXPIRY_MARGIN_MS <= now) this.entries.delete(k)
  }

  size(): number {
    return this.entries.size
  }
}

/**
 * Gerçek oynatma, ön hazırlıkla alınmış taze bir manifesti her zaman yeniden kullanabilir: devam konumu
 * PlaybackMetadata.bookmark'tan gelir (manifest.bookmark yalnızca yedek). Seçenekleri farklı olanlar zaten ayrı anahtardadır.
 */
export function canReuseForPlay(m: LicensedManifest, now: number): boolean {
  return m.expiration - EXPIRY_MARGIN_MS > now
}

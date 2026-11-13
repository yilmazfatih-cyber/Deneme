/**
 * FTL sıralaması: her darbedeki ölçümlerden CDN düğümlerinin "en hızlıdan en yavaşa" listesi.
 * Puan = toplam sürenin (ms) üstel ortalaması; başarısız ölçüm ceza alır ve listenin sonuna düşer.
 */
import type { FtlReport } from '../../../../shared/playback'

export type FtlResult = FtlReport['results'][number]

interface Entry {
  cdnId: string
  scoreMs: number
  kbps: number
  failures: number
  samples: number
  lastOk: boolean
}

const ALPHA = 0.5
const FAIL_PENALTY_MS = 10_000

export class FtlRanking {
  private entries = new Map<string, Entry>()

  /** Bir darbenin sonuçlarını işler. Aynı düğümü temsil eden birden çok hedef varsa hepsi ayrı örnektir. */
  record(results: FtlResult[]): void {
    for (const r of results) {
      const e = this.entries.get(r.cdnId) ?? { cdnId: r.cdnId, scoreMs: 0, kbps: 0, failures: 0, samples: 0, lastOk: true }
      const value = r.ok ? r.totalMs : FAIL_PENALTY_MS
      e.scoreMs = e.samples === 0 ? value : ALPHA * value + (1 - ALPHA) * e.scoreMs
      if (r.ok) e.kbps = e.samples === 0 || e.kbps === 0 ? r.kbps : ALPHA * r.kbps + (1 - ALPHA) * e.kbps
      e.failures += r.ok ? 0 : 1
      e.lastOk = r.ok
      e.samples += 1
      this.entries.set(r.cdnId, e)
    }
  }

  /** CDN kimlikleri, en hızlı başta; son ölçümü başarısız olanlar en sonda. */
  ranking(): string[] {
    return [...this.entries.values()]
      .sort((a, b) => {
        if (a.lastOk !== b.lastOk) return a.lastOk ? -1 : 1
        return a.scoreMs - b.scoreMs
      })
      .map((e) => e.cdnId)
  }

  /** En iyi düğümün ölçülen hızı (kbps); ölçüm yoksa null. */
  bestKbps(): number | null {
    const first = this.ranking()[0]
    if (!first) return null
    const e = this.entries.get(first)
    return e && e.lastOk && e.kbps > 0 ? e.kbps : null
  }

  snapshot(): { cdnId: string; scoreMs: number; kbps: number; failures: number }[] {
    return this.ranking().map((id) => {
      const e = this.entries.get(id)!
      return { cdnId: id, scoreMs: Math.round(e.scoreMs), kbps: Math.round(e.kbps), failures: e.failures }
    })
  }

  clear(): void {
    this.entries.clear()
  }
}

/** Bir darbenin kazananı: başarılı ve en kısa toplam süreli hedef. */
export function pulseWinner(results: FtlResult[]): FtlResult | null {
  let best: FtlResult | null = null
  for (const r of results) if (r.ok && (!best || r.totalMs < best.totalMs)) best = r
  return best
}

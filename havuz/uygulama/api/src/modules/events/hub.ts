/**
 * Anlık bildirim merkezi: açık SSE bağlantılarını kullanıcıya göre tutar ve olay yayar.
 * Bir alan değişince (eşitleme, üyelik, ad) o alanın üyelerine `poke` gider: "şu alan değişti, eşitle".
 *
 * SINIR: bellek içi ve TEK SÜREÇLİDİR. Sunucunun birden çok kopyası çalışırsa bir kopyadaki değişiklik ötekine
 * bağlı istemcilere ulaşmaz (istemci yine de düzenli aralıkla/odaklanınca eşitlediği için veri kaybı olmaz,
 * yalnız gecikir). SQLite zaten tek kopya demektir; çok kopyaya geçilirse burası Postgres LISTEN/NOTIFY ya da
 * Redis yayınıyla değiştirilir (docs/YAYINLAMA.md → "Ölçekleme").
 *
 * Genişletme: yeni bir olay türü için `pokeEventSchema` gibi shared/src/api.ts'e şema ekleyin ve burada
 * `sendToUsers(…, { event: 'yeni', data })` çağırın.
 */
import type { PokeEvent } from '@uygulama/shared'

export interface SseMessage {
  readonly event: string
  readonly data: string
}

export interface Connection {
  readonly id: number
  readonly userId: string
  readonly sessionId: string
  send(message: SseMessage): void
  close(): void
}

export interface ConnectInput {
  readonly userId: string
  readonly sessionId: string
  readonly send: (message: SseMessage) => void
  readonly close: () => void
}

export class EventHub {
  private readonly byUser = new Map<string, Set<Connection>>()
  private readonly maxPerUser: number
  private nextId = 1

  constructor(options: { maxPerUser: number }) {
    this.maxPerUser = options.maxPerUser
  }

  /** Açık bağlantı sayısı (ölçüm ve testler için). */
  get size(): number {
    let total = 0
    for (const set of this.byUser.values()) total += set.size
    return total
  }

  countFor(userId: string): number {
    return this.byUser.get(userId)?.size ?? 0
  }

  /** Bağlantıyı kaydeder. Kullanıcının bağlantı sayısı sınırı aşarsa EN ESKİ bağlantı kapatılır. */
  connect(input: ConnectInput): Connection {
    const connection: Connection = { id: this.nextId++, ...input }
    const set = this.byUser.get(input.userId) ?? new Set<Connection>()
    this.byUser.set(input.userId, set)
    set.add(connection)
    while (set.size > this.maxPerUser) {
      const oldest = set.values().next().value
      if (!oldest) break
      this.disconnect(oldest)
    }
    return connection
  }

  /** Bağlantıyı listeden çıkarır ve kapatır. İki kez çağrılması zararsızdır. */
  disconnect(connection: Connection): void {
    const set = this.byUser.get(connection.userId)
    if (!set?.delete(connection)) return
    if (set.size === 0) this.byUser.delete(connection.userId)
    try {
      connection.close()
    } catch {
      // Kapanmış akışı yeniden kapatmak hata verebilir; önemsiz.
    }
  }

  sendToUsers(userIds: Iterable<string>, message: SseMessage): void {
    for (const userId of new Set(userIds)) {
      for (const connection of this.byUser.get(userId) ?? []) {
        try {
          connection.send(message)
        } catch {
          this.disconnect(connection)
        }
      }
    }
  }

  /** "Bu alan değişti" dürtmesi. `clientId`: değişikliği yapan cihaz (kendi dürtmesini yok sayar). */
  poke(userIds: Iterable<string>, poke: PokeEvent): void {
    this.sendToUsers(userIds, { event: 'poke', data: JSON.stringify(poke) })
  }

  /** Kullanıcının bütün bağlantılarını kapatır (hesap kapatıldı, tüm cihazlardan çıkış…). */
  disconnectUser(userId: string, options: { exceptSessionId?: string } = {}): void {
    for (const connection of [...(this.byUser.get(userId) ?? [])]) {
      if (connection.sessionId !== options.exceptSessionId) this.disconnect(connection)
    }
  }

  /** Tek bir oturumun bağlantılarını kapatır (çıkış). */
  disconnectSession(userId: string, sessionId: string): void {
    for (const connection of [...(this.byUser.get(userId) ?? [])]) {
      if (connection.sessionId === sessionId) this.disconnect(connection)
    }
  }

  /** Sunucu kapanırken bütün bağlantıları kapatır. */
  closeAll(): void {
    for (const set of [...this.byUser.values()]) for (const connection of [...set]) this.disconnect(connection)
  }
}

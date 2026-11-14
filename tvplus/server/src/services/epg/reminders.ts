/**
 * Yayın hatırlatma zamanlayıcısı: profilin hatırlatma kurduğu yayın başladığında bildirim servisine bir kez
 * "Şimdi başlıyor" bildirimi yollar. 30 sn'de bir döner (süreci ayakta tutmaz). Testlerde kapalıdır; testler
 * `createReminderScheduler(...)` ile kendi saatleriyle `tick()` çağırır.
 * Yayın, bildirim verilmeden bittiyse (sunucu kapalıydı) bildirim atılmaz, kayıt "bildirildi" sayılır.
 */
import { channelEntityId } from '../../../../shared/tctx'
import type { Services } from '../../kernel/services'
import { localParts } from './time'

export const REMINDER_TICK_MS = 30_000

const pad = (n: number) => String(n).padStart(2, '0')
/** İstanbul saatiyle 'HH:MM' */
export const clockText = (d: Date) => {
  const p = localParts(d)
  return `${pad(p.hh)}:${pad(p.mm)}`
}

export interface ReminderScheduler {
  /** Bir tur: başlayan yayınlar için bildirim yollar; yollanan bildirim sayısını döner */
  tick(): number
  start(): void
  stop(): void
}

export function createReminderScheduler(opts: {
  services: () => Partial<Services>
  now: () => Date
  intervalMs?: number
}): ReminderScheduler {
  let timer: NodeJS.Timeout | null = null

  function tick(): number {
    const s = opts.services()
    const progress = s.progress
    const epg = s.epg
    if (!progress?.pendingReminders || !epg) return 0
    const now = opts.now().getTime()
    let sent = 0
    for (const { profileGuid, airingId } of progress.pendingReminders()) {
      const airing = epg.getAiring(airingId)
      if (!airing) {
        // Akış penceresinden düşmüş: artık gösterilemez
        progress.markReminderFired(profileGuid, airingId)
        continue
      }
      const start = new Date(airing.startAt).getTime()
      const end = new Date(airing.endAt).getTime()
      if (start > now) continue
      progress.markReminderFired(profileGuid, airingId)
      if (end <= now) continue
      const channel = s.catalog?.getChannel(airing.channelId)
      s.notifications?.push(profileGuid, {
        kind: 'REMINDER',
        title: `Şimdi başlıyor: ${airing.title}`,
        body: `${channel?.name ?? 'Canlı TV'} · ${clockText(new Date(start))}`,
        href: `#/izle/${channelEntityId(airing.channelId)}`,
      })
      sent++
    }
    return sent
  }

  return {
    tick,
    start() {
      if (timer) return
      timer = setInterval(() => {
        try {
          tick()
        } catch {
          /* bir tur başarısızsa sonraki tur yeniden dener */
        }
      }, opts.intervalMs ?? REMINDER_TICK_MS)
      timer.unref()
    },
    stop() {
      if (timer) clearInterval(timer)
      timer = null
    },
  }
}

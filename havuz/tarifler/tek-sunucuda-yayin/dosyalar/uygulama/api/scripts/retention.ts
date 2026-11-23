/**
 * Yedek saklama kuralı (saf işlev; backup.ts `--sakla` ile kullanır): `uygulama-YYYYMMDD-HHMMSS.db` adlı
 * yedeklerden `keepDays` günden eski olanlar silinir, ama en yeni `minKeep` yedeğe HİÇ dokunulmaz
 * (zamanlayıcı uzun süre durmuş olsa bile elde yedek kalsın). Ad kalıbına uymayan dosyaya (elle alınmış
 * kopya, başka dosya) dokunulmaz. Zaman damgası backup.ts'in yazdığı gibi UTC'dir.
 *
 * Genişletme: katmanlı saklama (ör. son 7 gün + son 4 haftanın birer yedeği) gerekirse `expiredBackups` içinde
 * korunacakları genişletin ve test/backupRestore.test.ts'e senaryo ekleyin.
 */
export const BACKUP_NAME = /^uygulama-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.db$/

const DAY_MS = 24 * 60 * 60_000

/** Yedek adındaki zaman (UTC); kalıba uymayan adda `null`. */
export function backupTime(name: string): Date | null {
  const match = BACKUP_NAME.exec(name)
  if (!match) return null
  const [year = 0, month = 0, day = 0, hour = 0, minute = 0, second = 0] = match.slice(1).map(Number)
  const time = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  // Date.UTC taşan değeri sessizce kaydırır (13. ay → ertesi yıl): bileşenler aynı değilse ad geçersizdir.
  const same =
    time.getUTCFullYear() === year &&
    time.getUTCMonth() === month - 1 &&
    time.getUTCDate() === day &&
    time.getUTCHours() === hour &&
    time.getUTCMinutes() === minute &&
    time.getUTCSeconds() === second
  return same ? time : null
}

/** Silinecek yedek adları: `keepDays` günden eski olanlar, en yeni `minKeep` tanesi hariç. */
export function expiredBackups(names: readonly string[], now: Date, keepDays: number, minKeep = 3): string[] {
  const cutoff = now.getTime() - keepDays * DAY_MS
  return names
    .map((name) => ({ name, time: backupTime(name) }))
    .filter((item): item is { name: string; time: Date } => item.time !== null)
    .sort((a, b) => b.time.getTime() - a.time.getTime())
    .slice(minKeep)
    .filter((item) => item.time.getTime() < cutoff)
    .map((item) => item.name)
}

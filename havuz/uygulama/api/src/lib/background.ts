/**
 * Arka plan işleri: yanıtı bekletmeden yapılacak işler (ör. e-posta gönderimi). Hata yanıtı bozmaz, günlüğe yazılır.
 * Şifre-unuttum ucu e-postayı arka planda gönderir ki hesap olup olmadığı yanıt süresinden anlaşılmasın.
 *
 * Testler `await jobs.idle()` ile bekleyen işlerin bitmesini bekler; kapanışta da beklenir.
 *
 * Genişletme: uzun süren ya da yeniden denenmesi gereken işler için bu basit yapı yetmez; kalıcı bir iş kuyruğu
 * (tablo + yoklayıcı) gerekir. Bkz. README → "Sınırlar".
 */
import { errorFields, type Logger } from './logger.ts'

export interface BackgroundJobs {
  /** İşi başlatır; beklemez. `name` günlükte görünür. */
  run(name: string, task: () => Promise<void>): void
  /** Bekleyen bütün işler bitince çözülür. */
  idle(): Promise<void>
  readonly pending: number
}

export function createBackgroundJobs(logger: Logger): BackgroundJobs {
  const running = new Set<Promise<void>>()
  return {
    run(name, task) {
      const promise = Promise.resolve()
        .then(task)
        .catch((error: unknown) => logger.error('arka plan işi başarısız', { job: name, ...errorFields(error) }))
        .finally(() => running.delete(promise))
      running.add(promise)
    },
    async idle() {
      while (running.size > 0) await Promise.all([...running])
    },
    get pending() {
      return running.size
    },
  }
}

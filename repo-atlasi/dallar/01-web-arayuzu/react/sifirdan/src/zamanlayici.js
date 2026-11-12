// Mini zamanlayıcı (scheduler): görev kuyruğu + "zaman doldu mu?" sorusu.
// Gerçeği: packages/scheduler/src/forks/Scheduler.js
//   - unstable_scheduleCallback → taskQueue (öncelik ve son tarihe göre min-heap: SchedulerMinHeap.js)
//   - shouldYieldToHost → frameInterval (frameYieldMs = 5 ms, SchedulerFeatureFlags.js)
//   - görev bir fonksiyon döndürürse bu "devam" (continuation) görevidir; aynı görev kuyrukta kalır.
// Mini: tek öncelik, FIFO kuyruk. Saat dışarıdan verilebilir; testler sahte saatle zamanı kendisi ilerletir.

/**
 * @param {{ now?: () => number, frameMs?: number, otomatik?: boolean }} [secenekler]
 *   otomatik: true ise görevler setImmediate ile kendiliğinden çalışır (gerçek kullanım);
 *   false ise testler runNext()/flushAll() ile adım adım ilerletir.
 */
export function createScheduler({ now = () => performance.now(), frameMs = 5, otomatik = false } = {}) {
  const kuyruk = []
  let dilimBaslangici = 0
  let calisiyor = false

  const scheduler = {
    now,
    scheduleCallback(callback) {
      const gorev = { callback, iptal: false }
      kuyruk.push(gorev)
      if (otomatik && !calisiyor) {
        calisiyor = true
        setImmediate(dongu)
      }
      return gorev
    },
    cancelCallback(gorev) {
      gorev.iptal = true
    },
    /** Uzlaştırıcı her iş biriminden sonra sorar: bu dilimin süresi doldu mu? */
    shouldYield() {
      return now() - dilimBaslangici >= frameMs
    },
    /** Bir görevi (bir zaman dilimini) çalıştırır. Kuyruk boşsa false döner. */
    runNext() {
      const gorev = kuyruk.shift()
      if (!gorev) return false
      if (gorev.iptal) return true
      dilimBaslangici = now()
      const devam = gorev.callback()
      if (typeof devam === 'function') {
        gorev.callback = devam
        kuyruk.unshift(gorev) // devam görevi sıranın başında kalır
      }
      return true
    },
    flushAll(sinir = 10_000) {
      let n = 0
      while (kuyruk.length > 0 && n < sinir) {
        scheduler.runNext()
        n++
      }
      return n
    },
    get bekleyen() {
      return kuyruk.length
    },
  }

  // Gerçek tarayıcıda MessageChannel, Node'da setImmediate: her dilimden sonra olay döngüsüne nefes aldırır.
  function dongu() {
    scheduler.runNext()
    if (kuyruk.length > 0) setImmediate(dongu)
    else calisiyor = false
  }

  return scheduler
}

/** Testler için sahte saat: zaman yalnızca ilerlet() çağrılınca akar. */
export function sahteSaat() {
  let t = 0
  return {
    now: () => t,
    ilerlet(ms) {
      t += ms
    },
  }
}

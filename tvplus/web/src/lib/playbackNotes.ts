/**
 * Oynatma notları: bu oturumda hangi videoların yer imi değişti?
 *
 * Not düşenler
 *   - oynatıcı, yer imini kaydederken (oynatma hangi yoldan başlarsa başlasın: arama, gelen yansıtma,
 *     "Bu Cihazda Devam Et", paylaşılan /izle bağlantısı);
 *   - oynat bağlantıları, tıklama anında (keşif ve detay ekranları).
 * Okuyanlar: keşif ve detay ekranlarının eşitleme modülleri. Her biri kendi imlecinden sonrasını okur; biri okuyunca
 * öteki notu kaybetmez.
 *
 * Yolda olan yer imi kaydı da burada izlenir: tazeleme, kayıt sunucuya varmadan yapılırsa eski veri yeniden çekilir.
 */

let cursor = 0
const notedAt = new Map<number, number>()

/** Video (ve bölümse üst dizisi) oynatıldı: yer imine bağlı önbellekler bir sonraki açılışta tazelensin. */
export function notePlayback(videoId: number | null | undefined, parentId?: number | null): void {
  for (const id of [videoId, parentId]) {
    if (typeof id === 'number' && Number.isInteger(id) && id > 0) notedAt.set(id, ++cursor)
  }
}

/** `since` imlecinden sonra not düşülen videolar ve yeni imleç. */
export function playbackSince(since: number): { ids: number[]; cursor: number } {
  const ids: number[] = []
  for (const [id, at] of notedAt) if (at > since) ids.push(id)
  return { ids, cursor }
}

/* ───────────── Yolda olan yer imi kayıtları ───────────── */

let inflight = 0
const waiting = new Set<() => void>()

/** Yer imi kaydı yola çıktı; bitince (başarı ya da hata) bekleyen tazelemeler çalışır. */
export function trackBookmarkSave(save: Promise<unknown>): void {
  inflight += 1
  const done = (): void => {
    inflight -= 1
    if (inflight > 0) return
    const fns = [...waiting]
    waiting.clear()
    for (const fn of fns) fn()
  }
  save.then(done, done)
}

/** Yolda yer imi kaydı yoksa hemen, varsa bitince (en geç `maxWaitMs` sonra) bir kez çağırır. */
export function afterBookmarkSaves(fn: () => void, maxWaitMs = 3000): void {
  if (inflight <= 0) {
    fn()
    return
  }
  let called = false
  const once = (): void => {
    if (called) return
    called = true
    waiting.delete(once)
    clearTimeout(timer)
    fn()
  }
  const timer = setTimeout(once, maxWaitMs)
  waiting.add(once)
}

/** Yalnız testler: durumu sıfırlar. */
export function resetPlaybackNotes(): void {
  cursor = 0
  notedAt.clear()
  inflight = 0
  waiting.clear()
}

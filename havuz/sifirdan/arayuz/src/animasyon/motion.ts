// Hareket azaltma tercihi: işletim sisteminde "hareketi azalt" açık olan kullanıcı (baş dönmesi, dikkat
// dağınıklığı) için animasyonlar anında son durumuna atlar. Varsayılan 'system': tarayıcının
// `prefers-reduced-motion` sorgusu. Uygulama içi bir ayarla 'reduce' ya da 'full' zorlanabilir.
// Genişletme: "azaltılmış" kipte tamamen atlamak yerine kısa bir saydamlık geçişi isterseniz
// `shouldReduceMotion` yerine bir `motionScale` (0..1) döndürün.

export type MotionPreference = 'system' | 'reduce' | 'full'

let preference: MotionPreference = 'system'
let query: (q: string) => { matches: boolean } = (q) =>
  typeof matchMedia === 'function' ? matchMedia(q) : { matches: false }

export function setMotionPreference(value: MotionPreference): void {
  preference = value
}

export function getMotionPreference(): MotionPreference {
  return preference
}

/** Testler ve Node için: medya sorgusu işlevini değiştirir. */
export function setMediaQuery(fn: (q: string) => { matches: boolean }): void {
  query = fn
}

export function shouldReduceMotion(): boolean {
  if (preference !== 'system') return preference === 'reduce'
  return query('(prefers-reduced-motion: reduce)').matches
}

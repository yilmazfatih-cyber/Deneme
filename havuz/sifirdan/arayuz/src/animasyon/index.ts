// animasyon — hareket kütüphanesi: yumuşatma eğrileri (cubic-bezier dahil), yay fiziği (kapalı formül),
// ara değerleme (sayı, OKLab renk, birimli dizgi, dönüşüm), zaman çizelgesi ve kademeleme, paylaşılan
// requestAnimationFrame zamanlayıcısı (enjekte saat), FLIP düzen geçişi, prefers-reduced-motion saygısı.
// Ayrıntılı anlatım: README.md.
// Genişletme: yeni parça ayrı dosyada yazılıp buradan dışa aktarılır.
export * from './easing.ts'
export {
  springState,
  settleTime,
  rk4Step,
  dampingRatio,
  SPRING_DEFAULTS,
  type SpringConfig,
  type SpringState,
} from './spring.ts'
export { parseColor, formatColor, rgbToOklab, oklabToRgb, mixColors, mixSrgb, type Rgba, type Oklab } from './color.ts'
export { interpolate, interpolateString, lerp, toTransform, type Interpolator, type Transform } from './interpolate.ts'
export { Ticker, ManualClock, systemClock, defaultTicker, type Clock } from './ticker.ts'
export { Player, type Playable } from './player.ts'
export { Tween, tween, springAnimation, type TweenOptions, type SpringAnimation } from './tween.ts'
export { Timeline, timeline, stagger, type Position } from './timeline.ts'
export { flip, type FlipOptions, type Rect } from './flip.ts'
export {
  setMotionPreference,
  getMotionPreference,
  setMediaQuery,
  shouldReduceMotion,
  type MotionPreference,
} from './motion.ts'

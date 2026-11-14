/**
 * Klavye / TV kumandası tuşlarını tek bir yerde RemoteKey'e çevirir. Aynı RemoteKey'ler telefondan gelen kumanda
 * komutlarıyla da gelir (`dispatchKey`); ekranlar hangi kaynaktan geldiğini bilmez.
 *
 * Tablo (KEY_TABLE / KEYCODE_TABLE) birim testlerinde doğrulanır: keys.test.ts.
 */
import type { RemoteKey } from '../../../../shared/devices'
import type { Direction } from './geometry'

/** KeyboardEvent'in bize gereken parçası (testte sahte olay için). */
export interface KeyLike {
  key: string
  code?: string
  keyCode?: number
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
}

/** `KeyboardEvent.key` → RemoteKey */
export const KEY_TABLE: Readonly<Record<string, RemoteKey>> = {
  ArrowUp: 'UP',
  ArrowDown: 'DOWN',
  ArrowLeft: 'LEFT',
  ArrowRight: 'RIGHT',
  Up: 'UP',
  Down: 'DOWN',
  Left: 'LEFT',
  Right: 'RIGHT',
  Enter: 'OK',
  ' ': 'OK',
  Spacebar: 'OK',
  Select: 'OK',
  Escape: 'BACK',
  Backspace: 'BACK',
  BrowserBack: 'BACK',
  GoBack: 'BACK',
  MediaPlayPause: 'PLAY_PAUSE',
  MediaPlay: 'PLAY_PAUSE',
  MediaPause: 'PLAY_PAUSE',
  Pause: 'PLAY_PAUSE',
  MediaRewind: 'REWIND',
  MediaFastForward: 'FORWARD',
  MediaTrackPrevious: 'REWIND',
  MediaTrackNext: 'FORWARD',
  ChannelUp: 'CHANNEL_UP',
  ChannelDown: 'CHANNEL_DOWN',
  PageUp: 'CHANNEL_UP',
  PageDown: 'CHANNEL_DOWN',
  AudioVolumeUp: 'VOLUME_UP',
  AudioVolumeDown: 'VOLUME_DOWN',
  AudioVolumeMute: 'MUTE',
  Subtitle: 'SUBTITLES',
  ClosedCaptionToggle: 'SUBTITLES',
  Guide: 'GUIDE',
  BrowserHome: 'HOME',
  GoHome: 'HOME',
  BrowserSearch: 'SEARCH',
  h: 'HOME',
  H: 'HOME',
  '/': 'SEARCH',
  '0': 'DIGIT_0',
  '1': 'DIGIT_1',
  '2': 'DIGIT_2',
  '3': 'DIGIT_3',
  '4': 'DIGIT_4',
  '5': 'DIGIT_5',
  '6': 'DIGIT_6',
  '7': 'DIGIT_7',
  '8': 'DIGIT_8',
  '9': 'DIGIT_9',
}

/**
 * TV tarayıcılarının `key` yerine yalnız `keyCode` verdiği tuşlar (LG webOS, Samsung Tizen, HbbTV).
 * 461 webOS Geri · 10009 Tizen Geri · 415 Oynat · 19 Duraklat · 10252 Tizen Oynat/Duraklat · 412 Geri sar ·
 * 417 İleri sar · 427/428 Kanal ±.
 */
export const KEYCODE_TABLE: Readonly<Record<number, RemoteKey>> = {
  37: 'LEFT',
  38: 'UP',
  39: 'RIGHT',
  40: 'DOWN',
  13: 'OK',
  461: 'BACK',
  10009: 'BACK',
  415: 'PLAY_PAUSE',
  19: 'PLAY_PAUSE',
  10252: 'PLAY_PAUSE',
  412: 'REWIND',
  417: 'FORWARD',
  427: 'CHANNEL_UP',
  428: 'CHANNEL_DOWN',
}

/** `code` ile ayırt edilenler (sayısal tuş takımı). */
const CODE_TABLE: Readonly<Record<string, RemoteKey>> = {
  NumpadEnter: 'OK',
  Numpad0: 'DIGIT_0',
  Numpad1: 'DIGIT_1',
  Numpad2: 'DIGIT_2',
  Numpad3: 'DIGIT_3',
  Numpad4: 'DIGIT_4',
  Numpad5: 'DIGIT_5',
  Numpad6: 'DIGIT_6',
  Numpad7: 'DIGIT_7',
  Numpad8: 'DIGIT_8',
  Numpad9: 'DIGIT_9',
}

/** Yazı alanındayken yalnız bunlar kumanda tuşu sayılır (harf, rakam, boşluk ve silme alana gider). */
const EDITABLE_PASSTHROUGH = new Set<RemoteKey>(['UP', 'DOWN', 'LEFT', 'RIGHT', 'OK'])

/**
 * Klavye olayını RemoteKey'e çevirir; tanınmıyorsa ya da tarayıcı kısayoluysa (Ctrl/Cmd/Alt) null.
 * `editable`: olay bir yazı alanından geldi (Escape dışında harf/rakam/Backspace/boşluk alana bırakılır).
 */
export function remoteKeyFromKeyboard(e: KeyLike, editable = false): RemoteKey | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null
  const byCode = e.code ? CODE_TABLE[e.code] : undefined
  const byKey = Object.hasOwn(KEY_TABLE, e.key) ? KEY_TABLE[e.key] : undefined
  // Bazı TV'ler key = 'Unidentified' verir ama keyCode doludur; bazıları Geri için key'i boş bırakır.
  const byKeyCode = e.keyCode !== undefined ? KEYCODE_TABLE[e.keyCode] : undefined
  const key = byCode ?? byKey ?? byKeyCode ?? null
  if (!key) return null
  if (editable) {
    if (e.key === 'Escape') return 'BACK'
    if (!EDITABLE_PASSTHROUGH.has(key) || e.key === ' ') return null
  }
  return key
}

/** Yön tuşu → yön; yön değilse null. */
export function directionOf(key: RemoteKey): Direction | null {
  switch (key) {
    case 'UP':
      return 'up'
    case 'DOWN':
      return 'down'
    case 'LEFT':
      return 'left'
    case 'RIGHT':
      return 'right'
    default:
      return null
  }
}

/** Rakam tuşu → 0–9; değilse null. */
export function digitOf(key: RemoteKey): number | null {
  return key.startsWith('DIGIT_') ? Number(key.slice(6)) : null
}

const isEditableTarget = (t: EventTarget | null): boolean => {
  if (typeof HTMLElement === 'undefined' || !(t instanceof HTMLElement)) return false
  if (t.isContentEditable) return true
  if (t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return true
  return t instanceof HTMLInputElement && !['button', 'checkbox', 'radio', 'range', 'submit'].includes(t.type)
}

/**
 * Pencereye keydown dinleyicisi kurar: tanınan tuşu `dispatch`'e verir; işlendiyse varsayılan davranışı
 * (sayfa kaydırma, geri gitme, düğme tıklaması) engeller. Kaldırma işlevini döndürür.
 */
export function installKeyListener(
  dispatch: (key: RemoteKey) => boolean,
  target: Window = window,
  /** true dönerken tuşlara dokunulmaz (ör. TV oynatıcısı tuşları kendisi dinliyor) */
  suspended: () => boolean = () => false,
): () => void {
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.defaultPrevented || e.isComposing || suspended()) return
    const key = remoteKeyFromKeyboard(e, isEditableTarget(e.target))
    if (!key) return
    // Yön tuşları ve OK her durumda tüketilir (tarayıcı sayfayı kaydırmasın, odaktaki düğme ikinci kez tıklanmasın).
    const handled = dispatch(key)
    if (handled || directionOf(key) || key === 'OK' || key === 'BACK') e.preventDefault()
  }
  target.addEventListener('keydown', onKeyDown)
  return () => target.removeEventListener('keydown', onKeyDown)
}

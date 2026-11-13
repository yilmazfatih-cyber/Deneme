import { describe, expect, it } from 'vitest'
import { digitOf, directionOf, remoteKeyFromKeyboard } from './keys'

describe('remoteKeyFromKeyboard — tablo', () => {
  const cases: [string, { key: string; code?: string; keyCode?: number }, string | null][] = [
    ['ok yukarı', { key: 'ArrowUp' }, 'UP'],
    ['ok aşağı', { key: 'ArrowDown' }, 'DOWN'],
    ['ok sol', { key: 'ArrowLeft' }, 'LEFT'],
    ['ok sağ', { key: 'ArrowRight' }, 'RIGHT'],
    ['Enter', { key: 'Enter' }, 'OK'],
    ['NumpadEnter', { key: 'Enter', code: 'NumpadEnter' }, 'OK'],
    ['boşluk', { key: ' ' }, 'OK'],
    ['Escape', { key: 'Escape' }, 'BACK'],
    ['Backspace', { key: 'Backspace' }, 'BACK'],
    ['BrowserBack', { key: 'BrowserBack' }, 'BACK'],
    ['webOS 461', { key: 'Unidentified', keyCode: 461 }, 'BACK'],
    ['Tizen 10009', { key: 'XF86Back', keyCode: 10009 }, 'BACK'],
    ['MediaPlayPause', { key: 'MediaPlayPause' }, 'PLAY_PAUSE'],
    ['MediaPlay', { key: 'MediaPlay' }, 'PLAY_PAUSE'],
    ['MediaPause', { key: 'MediaPause' }, 'PLAY_PAUSE'],
    ['415', { key: 'Unidentified', keyCode: 415 }, 'PLAY_PAUSE'],
    ['19', { key: 'Pause', keyCode: 19 }, 'PLAY_PAUSE'],
    ['10252', { key: '', keyCode: 10252 }, 'PLAY_PAUSE'],
    ['MediaRewind', { key: 'MediaRewind' }, 'REWIND'],
    ['412', { key: 'Unidentified', keyCode: 412 }, 'REWIND'],
    ['MediaFastForward', { key: 'MediaFastForward' }, 'FORWARD'],
    ['417', { key: 'Unidentified', keyCode: 417 }, 'FORWARD'],
    ['ChannelUp', { key: 'ChannelUp' }, 'CHANNEL_UP'],
    ['427', { key: 'Unidentified', keyCode: 427 }, 'CHANNEL_UP'],
    ['PageUp', { key: 'PageUp' }, 'CHANNEL_UP'],
    ['ChannelDown', { key: 'ChannelDown' }, 'CHANNEL_DOWN'],
    ['428', { key: 'Unidentified', keyCode: 428 }, 'CHANNEL_DOWN'],
    ['PageDown', { key: 'PageDown' }, 'CHANNEL_DOWN'],
    ['h', { key: 'h' }, 'HOME'],
    ['/', { key: '/' }, 'SEARCH'],
    ['rakam', { key: '7' }, 'DIGIT_7'],
    ['sayısal tuş takımı', { key: 'End', code: 'Numpad1' }, 'DIGIT_1'],
    ['tanınmayan harf', { key: 'q' }, null],
    ['Tab', { key: 'Tab' }, null],
  ]
  for (const [name, ev, want] of cases) {
    it(name, () => expect(remoteKeyFromKeyboard(ev)).toBe(want))
  }

  it('Ctrl/Cmd/Alt ile basılanlar tarayıcıya bırakılır', () => {
    expect(remoteKeyFromKeyboard({ key: 'ArrowLeft', altKey: true })).toBeNull()
    expect(remoteKeyFromKeyboard({ key: 'h', metaKey: true })).toBeNull()
    expect(remoteKeyFromKeyboard({ key: '/', ctrlKey: true })).toBeNull()
  })

  it('yazı alanında harf, rakam, boşluk ve silme alana gider; oklar, Enter ve Escape kumanda tuşudur', () => {
    expect(remoteKeyFromKeyboard({ key: 'h' }, true)).toBeNull()
    expect(remoteKeyFromKeyboard({ key: '3' }, true)).toBeNull()
    expect(remoteKeyFromKeyboard({ key: ' ' }, true)).toBeNull()
    expect(remoteKeyFromKeyboard({ key: 'Backspace' }, true)).toBeNull()
    expect(remoteKeyFromKeyboard({ key: 'ArrowDown' }, true)).toBe('DOWN')
    expect(remoteKeyFromKeyboard({ key: 'Enter' }, true)).toBe('OK')
    expect(remoteKeyFromKeyboard({ key: 'Escape' }, true)).toBe('BACK')
  })
})

describe('yardımcılar', () => {
  it('directionOf / digitOf', () => {
    expect(directionOf('LEFT')).toBe('left')
    expect(directionOf('OK')).toBeNull()
    expect(digitOf('DIGIT_0')).toBe(0)
    expect(digitOf('DIGIT_9')).toBe(9)
    expect(digitOf('BACK')).toBeNull()
  })
})

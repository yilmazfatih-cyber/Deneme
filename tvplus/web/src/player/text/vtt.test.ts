import { describe, expect, it } from 'vitest'
import { isVtt, parseVtt } from './vtt'

describe('WebVTT okuyucu (durağan kip altyazısı)', () => {
  it('VTT belgesini tanır, TTML belgesini tanımaz', () => {
    expect(isVtt('﻿WEBVTT\n\n')).toBe(true)
    expect(isVtt('WEBVTT - başlık\n')).toBe(true)
    expect(isVtt('<?xml version="1.0"?><tt/>')).toBe(false)
  })

  it('ipuçlarını saniye cinsinden, satır ve biçemle çıkarır', () => {
    const doc = parseVtt(
      'WEBVTT\n\nNOTE yorum\n\n1\n00:00:01.000 --> 00:00:03.500 align:start\n<i>Merhaba</i> dünya\nikinci &amp; satır\n\n' +
        '01:02.250 --> 01:04.000\n<v Ali><b>Kalın</b>\n',
    )
    expect(doc.cues).toHaveLength(2)
    expect(doc.cues[0]).toEqual({
      start: 1,
      end: 3.5,
      lines: [
        [
          { text: 'Merhaba', italic: true },
          { text: ' dünya', italic: false },
        ],
        [{ text: 'ikinci & satır', italic: false }],
      ],
    })
    expect(doc.cues[1]).toMatchObject({ start: 62.25, end: 64, lines: [[{ text: 'Kalın', bold: true }]] })
  })
})

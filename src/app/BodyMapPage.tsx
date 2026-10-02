import { useState } from 'react'
import { Page } from '../components/Shell'
import { wordById } from '../content'
import { useSentence } from '../features/board/store'
import { recordUsage } from '../features/board/items'
import { t, type MessageKey } from '../i18n'
import { speak } from '../lib/speech'

/**
 * Vücut haritası: ön/arka çizim üzerinde ağrıyan yer, ardından 0–10 yüz ifadeli ölçek.
 * Bölgelerin dokunma alanı çizimden geniştir (≥ 72 px); bölge adları içerikteki "___ ağrıyor" biçiminden gelir.
 */

interface Region {
  wordId: string
  /** viewBox 0 0 240 400 içinde dokunma alanı; en dar bölge 54 birim ≈ 360 px ekranda 74 px */
  x: number
  y: number
  w: number
  h: number
}

const FRONT: Region[] = [
  { wordId: 'bas', x: 64, y: 0, w: 112, h: 56 },
  { wordId: 'bogaz', x: 64, y: 56, w: 112, h: 54 },
  { wordId: 'gogus', x: 64, y: 110, w: 112, h: 55 },
  { wordId: 'karin', x: 64, y: 165, w: 112, h: 55 },
  { wordId: 'kol', x: 0, y: 62, w: 64, h: 128 },
  { wordId: 'el', x: 0, y: 190, w: 64, h: 60 },
  { wordId: 'kol', x: 176, y: 62, w: 64, h: 128 },
  { wordId: 'el', x: 176, y: 190, w: 64, h: 60 },
  { wordId: 'bacak', x: 64, y: 220, w: 112, h: 55 },
  { wordId: 'diz', x: 64, y: 275, w: 112, h: 55 },
  { wordId: 'ayak', x: 64, y: 330, w: 112, h: 70 },
]

const BACK: Region[] = [
  { wordId: 'bas', x: 64, y: 0, w: 112, h: 56 },
  { wordId: 'omuz', x: 0, y: 56, w: 240, h: 54 },
  { wordId: 'sirt', x: 64, y: 110, w: 112, h: 110 },
  { wordId: 'kol', x: 0, y: 110, w: 64, h: 140 },
  { wordId: 'kol', x: 176, y: 110, w: 64, h: 140 },
  { wordId: 'bacak', x: 64, y: 220, w: 112, h: 110 },
  { wordId: 'ayak', x: 64, y: 330, w: 112, h: 70 },
]

/** Basit, yetişkin bir vücut silueti (çocuksu değil). */
function Figure() {
  return (
    <g className="body-figure" aria-hidden="true">
      <circle cx="120" cy="30" r="24" />
      <path d="M110 54h20v14h-20z" />
      <path d="M82 72c0-6 6-10 14-10h48c8 0 14 4 14 10v138c0 6-4 10-10 10H92c-6 0-10-4-10-10z" />
      <path d="M82 76c-14 2-24 10-28 22l-18 96c-2 8 10 12 13 4l20-86" />
      <path d="M158 76c14 2 24 10 28 22l18 96c2 8-10 12-13 4l-20-86" />
      <circle cx="42" cy="208" r="10" />
      <circle cx="198" cy="208" r="10" />
      <path d="M94 220h24l-2 140c0 8-14 8-15 0z" />
      <path d="M122 220h24l-7 140c-1 8-15 8-15 0z" />
      <path d="M84 360h34v16c0 6-4 10-10 10H90c-6 0-8-6-6-12z" />
      <path d="M122 360h34l2 14c2 6 0 12-6 12h-18c-6 0-10-4-10-10z" />
    </g>
  )
}

const LEVELS: { n: number; key: MessageKey }[] = [
  { n: 0, key: 'body.level0' },
  { n: 2, key: 'body.level2' },
  { n: 4, key: 'body.level4' },
  { n: 6, key: 'body.level6' },
  { n: 8, key: 'body.level8' },
  { n: 10, key: 'body.level10' },
]

/** Wong-Baker benzeri sade yüzler; ağız eğrisi ağrıyla birlikte aşağı döner. */
function Face({ n }: { n: number }) {
  const curve = 8 - (n / 10) * 16 // gülümseme → kaş çatma
  const brow = n >= 6
  return (
    <svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true">
      <circle cx="24" cy="24" r="21" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="17" cy="19" r="2.4" fill="currentColor" />
      <circle cx="31" cy="19" r="2.4" fill="currentColor" />
      {brow ? <path d="M12 13l8 3M36 13l-8 3" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /> : null}
      <path
        d={`M14 32 Q24 ${32 + curve} 34 32`}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function BodyMapPage() {
  const [side, setSide] = useState<'front' | 'back'>('front')
  const [part, setPart] = useState<string | null>(null)
  const addPhrase = useSentence((s) => s.addPhrase)
  const regions = side === 'front' ? FRONT : BACK

  const choosePart = (wordId: string) => {
    const w = wordById.get(wordId)
    if (!w) return
    setPart(wordId)
    void recordUsage(wordId)
    void speak(w.forms.agriyor ?? `${w.word} ağrıyor`)
  }

  const chooseLevel = (n: number) => {
    const w = part ? wordById.get(part) : undefined
    const partText = w ? (w.forms.agriyor ?? `${w.word} ağrıyor`) : 'Ağrım var'
    const sentence = t('body.sentence', { part: partText, n })
    addPhrase(sentence, part ?? undefined)
    void speak(sentence)
  }

  const label = (wordId: string) => {
    const w = wordById.get(wordId)
    return w ? (w.forms.agriyor ?? w.word) : wordId
  }

  return (
    <Page title={t('body.title')} back="/konus/k/vucut">
      {part ? (
        <p className="hint" data-testid="body-hint">
          {label(part)} — {t('body.howMuch')}
        </p>
      ) : (
        <div className="segmented" role="group" aria-label={t('body.where')}>
          <button
            type="button"
            className="btn btn-secondary"
            aria-pressed={side === 'front'}
            onClick={() => setSide('front')}
          >
            {t('body.front')}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            aria-pressed={side === 'back'}
            onClick={() => setSide('back')}
          >
            {t('body.back')}
          </button>
        </div>
      )}
      {part ? (
        <div className="pain-scale" role="group" aria-label={t('body.howMuch')}>
          {LEVELS.map(({ n, key }) => (
            <button
              key={n}
              type="button"
              className="btn pain-btn"
              onClick={() => chooseLevel(n)}
              data-testid={`pain-${n}`}
            >
              <Face n={n} />
              <span className="pain-n">{n}</span>
              <span>{t(key)}</span>
            </button>
          ))}
          <button type="button" className="btn btn-secondary" onClick={() => setPart(null)}>
            {t('body.other')}
          </button>
        </div>
      ) : (
        <svg className="body-map" viewBox="0 0 240 400" role="group" aria-label={t('body.where')}>
          <Figure />
          {regions.map((r, i) => (
            <rect
              key={`${side}-${i}`}
              className="body-region"
              x={r.x}
              y={r.y}
              width={r.w}
              height={r.h}
              role="button"
              tabIndex={0}
              aria-label={label(r.wordId)}
              data-testid={`region-${r.wordId}`}
              onClick={() => choosePart(r.wordId)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  choosePart(r.wordId)
                }
              }}
            />
          ))}
        </svg>
      )}
    </Page>
  )
}

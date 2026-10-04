import { useEffect, useRef, useState } from 'react'
import { Icon } from '../../components/Icon'
import { BigButton } from '../../components/Shell'
import { content } from '../../content'
import type { PracticeResult } from '../../db'
import { t } from '../../i18n'
import { useBlobUrl } from '../../lib/hooks'
import { playConfirmTone, recordingSupported, startRecording, type Recording } from '../../lib/media'
import { speakable } from '../../lib/audioKey'
import { speak } from '../../lib/speech'
import { speakItem, type LearnItem } from './learn'
import { cueAvailable, NOT_YET, type Step } from './session'

export interface Outcome {
  result: PracticeResult
  cueLevel: number
  responseMs: number
}

function useResponseTimer() {
  const start = useRef(0)
  useEffect(() => {
    start.current = performance.now()
  }, [])
  return () => Math.round(performance.now() - start.current)
}

export function Picture({ item, size = 'large' }: { item: LearnItem; size?: 'large' | 'small' }) {
  const photoUrl = useBlobUrl(item.photo)
  const src = photoUrl ?? item.symbol
  return (
    <div className={`picture picture-${size}`}>
      {src ? (
        <img src={src} alt="" className={photoUrl ? 'is-photo' : undefined} />
      ) : (
        <span className="tile-initial">{item.label.charAt(0)}</span>
      )}
    </div>
  )
}

/** Isınma: otomatik diziler (sayılar, günler, aylar). Akıcılık için; değerlendirme yok. */
export function Warmup({ warmupId, onDone }: { warmupId: string; onDone: () => void }) {
  const warmup = content.journey.warmups.find((w) => w.id === warmupId) ?? content.journey.warmups[0]!
  const [playing, setPlaying] = useState(false)
  const playAll = async () => {
    setPlaying(true)
    for (const item of warmup.items) await speak(item)
    setPlaying(false)
  }
  return (
    <div className="activity" data-testid="activity-warmup">
      <h2 className="activity-title">
        {t('session.warmup')}: {warmup.label}
      </h2>
      <p className="hint">{t('session.warmupHint')}</p>
      <div className="warmup-grid">
        {warmup.items.map((w) => (
          <button key={w} type="button" className="btn btn-secondary warmup-btn" onClick={() => void speak(w)}>
            {w}
          </button>
        ))}
      </div>
      <div className="row">
        <button type="button" className="btn btn-secondary" onClick={() => void playAll()} disabled={playing}>
          <Icon name="play" />
          <span>{t('session.listenAgain')}</span>
        </button>
        <BigButton icon="next" label={t('session.next')} onClick={onDone} testId="session-next" />
      </div>
    </div>
  )
}

/**
 * Resim–kelime eşleştirme ve dinle-seç. Yanlış seçimde kırmızı çarpı yok:
 * seçilen resim sessizce soluklaşır ve "Bir daha bakalım" denir.
 */
export function ChoiceActivity({
  step,
  item,
  itemsById,
  onDone,
}: {
  step: Step
  item: LearnItem
  itemsById: Map<string, LearnItem>
  onDone: (o: Outcome) => void
}) {
  const [wrong, setWrong] = useState<string[]>([])
  const [done, setDone] = useState(false)
  const elapsed = useResponseTimer()
  const listen = step.activity === 'listen'

  useEffect(() => {
    void speakItem(item)
  }, [item])

  const choose = (id: string) => {
    if (done || wrong.includes(id)) return
    if (id === item.id) {
      setDone(true)
      playConfirmTone()
      const ms = elapsed()
      setTimeout(() => onDone({ result: 'correct', cueLevel: wrong.length === 0 ? 0 : 1, responseMs: ms }), 900)
    } else {
      setWrong((w) => [...w, id])
      void speak(t('session.tryAgain'))
    }
  }

  return (
    <div className="activity" data-testid={`activity-${step.activity}`}>
      <h2 className="activity-title">{listen ? t('session.listen') : t('session.match')}</h2>
      {listen ? null : (
        <p className="target-word" lang="tr">
          {item.label}
        </p>
      )}
      <button type="button" className="btn btn-secondary" onClick={() => void speakItem(item)}>
        <Icon name="speak" />
        <span>{t('session.listenAgain')}</span>
      </button>
      <div
        className="choices"
        style={{ gridTemplateColumns: `repeat(${step.options.length > 2 ? 2 : step.options.length}, 1fr)` }}
      >
        {step.options.map((id) => {
          const opt = itemsById.get(id)
          if (!opt) return null
          const isWrong = wrong.includes(id)
          const isRight = done && id === item.id
          return (
            <button
              key={id}
              type="button"
              className="btn choice"
              data-state={isWrong ? 'dim' : isRight ? 'right' : undefined}
              aria-label={listen ? `Seçenek ${step.options.indexOf(id) + 1}` : opt.label}
              disabled={isWrong}
              onClick={() => choose(id)}
              data-testid={id === item.id ? 'choice-target' : 'choice-other'}
            >
              <Picture item={opt} size="small" />
            </button>
          )
        })}
      </div>
      <p className="hint" aria-live="polite">
        {wrong.length && !done ? t('session.tryAgain') : ''}
      </p>
    </div>
  )
}

function CueContent({ level, item, step }: { level: number; item: LearnItem; step: Step }) {
  const semantic = item.cues.semantic[step.variant % Math.max(1, item.cues.semantic.length)]
  const sentence = item.cues.sentence[step.variant % Math.max(1, item.cues.sentence.length)]
  switch (level) {
    case 1:
      return (
        <p className="cue">
          <span className="cue-kind">{t('session.cueSemantic')}</span> {semantic}
        </p>
      )
    case 2:
      return (
        <p className="cue">
          <span className="cue-kind">{t('session.cueSentence')}</span> {sentence}
        </p>
      )
    case 3:
      return (
        <p className="cue">
          <span className="cue-kind">{t('session.cueFirstSound')}</span>{' '}
          <strong className="cue-big">{item.cues.firstSound}</strong>
        </p>
      )
    case 4:
      return (
        <p className="cue">
          <span className="cue-kind">{t('session.cueWritten')}</span> <strong className="cue-big">{item.label}</strong>
        </p>
      )
    case 5:
      return (
        <p className="cue">
          <span className="cue-kind">{t('session.cueModel')}</span>{' '}
          <button type="button" className="btn btn-secondary inline-btn" onClick={() => void speakItem(item)}>
            <Icon name="speak" />
            <span>{item.label}</span>
          </button>
        </p>
      )
    default:
      return null
  }
}

function speakCue(level: number, item: LearnItem, step: Step) {
  const semantic = item.cues.semantic[step.variant % Math.max(1, item.cues.semantic.length)]
  const sentence = item.cues.sentence[step.variant % Math.max(1, item.cues.sentence.length)]
  if (level === 1 && semantic) void speak(semantic)
  if (level === 2 && sentence) void speak(speakable(sentence))
  // İlk ses: çok heceli kelimede ilk hece söylenir; tek hecelide söylemek modeli vermek olur, yalnız gösterilir.
  if (level === 3 && item.syllables.length > 1) void speak(item.syllables[0]!)
  if (level === 5) void speakItem(item)
}

/**
 * İpuçlu adlandırma, cümle tamamlama ve gündelik senaryo.
 * Konuşma tanıma yok: kişi ya da yanındaki üç düğmeyle işaretler. Süre sınırı yok.
 */
export function NamingActivity({
  step,
  item,
  startLevel,
  onDone,
}: {
  step: Step
  item: LearnItem
  startLevel: number
  onDone: (o: Outcome) => void
}) {
  const mode = step.activity
  const scenario = mode === 'scenario' ? content.journey.scenarios.find((s) => s.answer === item.id) : undefined
  const sentence = item.cues.sentence[step.variant % Math.max(1, item.cues.sentence.length)]
  const allowed = (
    mode === 'naming' ? [0, 1, 2, 3, 4, 5] : mode === 'scenario' ? [0, 1, 3, 4, 5] : [0, 3, 4, 5]
  ).filter((l) => l === 0 || cueAvailable(l, item))
  const initial = allowed.filter((l) => l <= startLevel).at(-1) ?? 0
  const [level, setLevel] = useState(initial)
  const [modelShown, setModelShown] = useState(false)
  const elapsed = useResponseTimer()

  useEffect(() => {
    if (mode === 'sentence' && sentence) void speak(speakable(sentence))
    else if (scenario) void speak(scenario.prompt)
    else if (initial > 0) speakCue(initial, item, step)
    // yalnızca ilk açılışta
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const nextLevel = allowed.find((l) => l > level)
  const moreCue = () => {
    if (nextLevel === undefined) return
    setLevel(nextLevel)
    speakCue(nextLevel, item, step)
  }

  const rate = (result: PracticeResult) => {
    const ms = elapsed()
    if (result === 'not_yet') {
      // Başarısızlık hissi yok: modeli göster, birlikte söyle, sonra devam.
      setModelShown(true)
      void speakItem(item)
      return
    }
    playConfirmTone()
    const cueLevel = result === 'said_with_help' ? Math.max(1, level) : level
    if (scenario) void speak(scenario.phrase)
    onDone({ result, cueLevel, responseMs: ms })
  }

  if (modelShown) {
    return (
      <div className="activity" data-testid="activity-model">
        <h2 className="activity-title">{t('session.repeat')}</h2>
        <Picture item={item} />
        <p className="target-word">{item.label}</p>
        <div className="row">
          <button type="button" className="btn btn-secondary" onClick={() => void speakItem(item)}>
            <Icon name="speak" />
            <span>{t('session.playModel')}</span>
          </button>
          <BigButton
            icon="next"
            label={t('session.next')}
            onClick={() => onDone({ result: 'not_yet', cueLevel: NOT_YET, responseMs: elapsed() })}
            testId="session-next"
          />
        </div>
      </div>
    )
  }

  const title =
    mode === 'sentence'
      ? t('session.sentence')
      : mode === 'scenario'
        ? (scenario?.label ?? t('session.scenario'))
        : t('session.naming')
  return (
    <div className="activity" data-testid={`activity-${mode}`}>
      <h2 className="activity-title">{title}</h2>
      <Picture item={item} />
      {mode === 'sentence' && sentence ? <p className="cue cue-context">{sentence}</p> : null}
      {scenario ? <p className="cue cue-context">{scenario.prompt}</p> : null}
      {mode === 'naming' && level === 0 ? <p className="hint">{t('session.namingHint')}</p> : null}
      <div className="cues" aria-live="polite">
        {allowed
          .filter((l) => l > 0 && l <= level)
          .map((l) => (
            <CueContent key={l} level={l} item={item} step={step} />
          ))}
      </div>
      <button
        type="button"
        className="btn btn-secondary cue-btn"
        onClick={moreCue}
        disabled={nextLevel === undefined}
        data-testid="cue-more"
      >
        <Icon name="hint" />
        <span>{level === 0 ? t('session.cue') : t('session.moreCue')}</span>
      </button>
      <RatingButtons onRate={rate} />
    </div>
  )
}

function RatingButtons({ onRate }: { onRate: (r: PracticeResult) => void }) {
  return (
    <div className="rating" role="group">
      <button type="button" className="btn btn-primary" onClick={() => onRate('said')} data-testid="rate-said">
        <Icon name="yes" />
        <span>{t('session.said')}</span>
      </button>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => onRate('said_with_help')}
        data-testid="rate-help"
      >
        <Icon name="hint" />
        <span>{t('session.saidWithHelp')}</span>
      </button>
      <button type="button" className="btn btn-quiet" onClick={() => onRate('not_yet')} data-testid="rate-not-yet">
        <Icon name="pause" />
        <span>{t('session.notYet')}</span>
      </button>
    </div>
  )
}

/** Dinle, tekrar et, kaydet: model ses + isteğe bağlı kendi kaydını dinleyip karşılaştırma. */
export function RepeatActivity({ item, onDone }: { item: LearnItem; onDone: (o: Outcome) => void }) {
  const [recording, setRecording] = useState<Recording | null>(null)
  const [mine, setMine] = useState<Blob | undefined>()
  const [micError, setMicError] = useState(false)
  const elapsed = useResponseTimer()

  useEffect(() => {
    void speakItem(item)
  }, [item])

  const toggleRecord = async () => {
    if (recording) {
      setMine(await recording.stop())
      setRecording(null)
      return
    }
    try {
      setRecording(await startRecording(8000))
    } catch {
      setMicError(true)
    }
  }

  useEffect(() => () => recording?.cancel(), [recording])

  const rate = (result: PracticeResult) => {
    if (result !== 'not_yet') playConfirmTone()
    onDone({ result, cueLevel: result === 'not_yet' ? NOT_YET : 5, responseMs: elapsed() })
  }

  return (
    <div className="activity" data-testid="activity-repeat">
      <h2 className="activity-title">{t('session.repeat')}</h2>
      <Picture item={item} />
      <p className="target-word">{item.label}</p>
      <p className="hint">{t('session.repeatHint')}</p>
      <div className="row">
        <button type="button" className="btn btn-secondary" onClick={() => void speakItem(item)}>
          <Icon name="speak" />
          <span>{t('session.playModel')}</span>
        </button>
        {recordingSupported() && !micError ? (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void toggleRecord()}
            aria-pressed={!!recording}
          >
            <Icon name={recording ? 'stop' : 'mic'} />
            <span>{recording ? t('session.stopRecording') : t('session.record')}</span>
          </button>
        ) : null}
        {mine ? (
          <button type="button" className="btn btn-secondary" onClick={() => void speak('', { blob: mine })}>
            <Icon name="play" />
            <span>{t('session.playMine')}</span>
          </button>
        ) : null}
      </div>
      {micError ? <p className="note">{t('item.micDenied')}</p> : null}
      <RatingButtons onRate={rate} />
    </div>
  )
}

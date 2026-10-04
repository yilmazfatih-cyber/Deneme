import { useNavigate } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { t } from '../../i18n'
import { usePersonalItems, useSettings } from '../../lib/hooks'
import { speak } from '../../lib/speech'
import { tail } from '../../lib/text'
import { findItem } from './items'
import { displayText, lastItemId, spokenParts, spokenText } from './sentence'
import { useSentence, useToast } from './store'

/** Üstte cümle şeridi: Söyle, Geri al, Temizle, Göster. Altında son kartın hazır cümleleri. */
export function SentenceStrip() {
  const { segments, undo, clear, restore, addPhrase } = useSentence()
  const showToast = useToast((s) => s.show)
  const navigate = useNavigate()
  const personal = usePersonalItems()
  const settings = useSettings()
  const text = displayText(segments)
  const lastId = lastItemId(segments)
  const lastItem = lastId ? findItem(lastId, personal, settings) : undefined
  const phrases = (lastItem?.phrases ?? []).slice(0, 2)
  const empty = segments.length === 0

  return (
    <section className="strip" aria-label={t('strip.label')}>
      <div className="strip-text" aria-live="polite" data-testid="strip-text" data-empty={empty || undefined}>
        {empty ? t('strip.empty') : tail(text, 60)}
      </div>
      <div className="strip-actions">
        <button
          type="button"
          className="btn btn-primary strip-say"
          onClick={() => void speak(spokenText(segments), { parts: spokenParts(segments) })}
          disabled={empty}
          data-testid="strip-say"
        >
          <Icon name="speak" />
          <span>{t('strip.say')}</span>
        </button>
        <button type="button" className="btn btn-secondary" onClick={undo} disabled={empty} data-testid="strip-undo">
          <Icon name="undo" />
          <span>{t('strip.undo')}</span>
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            clear()
            showToast(t('strip.cleared'), t('strip.restore'), restore)
          }}
          disabled={empty}
          data-testid="strip-clear"
        >
          <Icon name="clear" />
          <span>{t('strip.clear')}</span>
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => navigate('/goster')}
          data-testid="strip-show"
        >
          <Icon name="show" />
          <span>{t('strip.show')}</span>
        </button>
      </div>
      <div className="strip-phrases" aria-label={t('strip.phrases')} data-testid="strip-phrases">
        {phrases.length === 0 ? <span className="placeholder">{empty ? '' : t('strip.phrasesHint')}</span> : null}
        {phrases.map((p) => (
          <button
            key={p}
            type="button"
            className="btn btn-phrase"
            onClick={() => {
              addPhrase(p, lastItem?.id)
              void speak(p, lastItem?.audio && p === lastItem.word ? { blob: lastItem.audio } : {})
            }}
          >
            {p}
          </button>
        ))}
      </div>
    </section>
  )
}

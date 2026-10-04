import { useState } from 'react'
import { Icon } from '../components/Icon'
import { Page } from '../components/Shell'
import { displayText, spokenParts, spokenText } from '../features/board/sentence'
import { useSentence } from '../features/board/store'
import { t } from '../i18n'
import { speak } from '../lib/speech'

/** Karşıdakine gösterme: büyük yazı, ekranı çevirme, partner için kısa ipuçları. */
export function PartnerPage() {
  const segments = useSentence((s) => s.segments)
  const [flipped, setFlipped] = useState(false)
  const text = segments.length ? displayText(segments) : t('partner.default')

  return (
    <Page title={t('partner.title')} back="/konus" hideTitle>
      <div className="partner" data-flipped={flipped || undefined}>
        <p className="partner-text" data-testid="partner-text" lang="tr">
          {text}
        </p>
        <ul className="partner-tips">
          <li>{t('partner.slow')}</li>
          <li>{t('partner.tip1')}</li>
          <li>{t('partner.tip2')}</li>
          <li>{t('partner.tip3')}</li>
        </ul>
      </div>
      <div className="row">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setFlipped((f) => !f)}
          aria-pressed={flipped}
        >
          <Icon name="flip" />
          <span>{t('partner.flip')}</span>
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() =>
            void speak(segments.length ? spokenText(segments) : t('partner.default'), { parts: spokenParts(segments) })
          }
        >
          <Icon name="speak" />
          <span>{t('strip.say')}</span>
        </button>
      </div>
    </Page>
  )
}

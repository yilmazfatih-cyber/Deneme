import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { BigButton, Page } from '../components/Shell'
import { symbolUrl } from '../content'
import { t } from '../i18n'
import { db, getSettings } from '../db'
import { useProfile } from '../lib/hooks'
import { speak } from '../lib/speech'
import { DAY } from '../lib/srs'

/** Ana ekran: üç ana yol (Konuş, Öğren, Ben kartı). Evet/Hayır altta her zaman görünür. */
export function HomePage() {
  const navigate = useNavigate()
  // Ayda bir yedek hatırlatması (yalnız kişisel kart varsa)
  const needsBackup = useLiveQuery(async () => {
    const [settings, count] = await Promise.all([getSettings(), db.personalItems.count()])
    return count > 0 && (!settings.lastBackupAt || Date.now() - settings.lastBackupAt > 30 * DAY)
  }, [])

  return (
    <Page title={t('app.name')} hideTitle="sr-only">
      <div className="home">
        <BigButton
          symbol={symbolUrl('symbols/talk_1_to.svg')}
          label={t('home.speak')}
          onClick={() => navigate('/konus')}
          testId="home-speak"
        />
        <BigButton
          symbol={symbolUrl('symbols/read_book_to.svg')}
          label={t('home.learn')}
          onClick={() => navigate('/ogren')}
          tone="secondary"
          testId="home-learn"
        />
        <BigButton
          symbol={symbolUrl('symbols/hello.svg')}
          label={t('home.me')}
          onClick={() => navigate('/ben')}
          tone="secondary"
          testId="home-me"
        />
        {needsBackup ? (
          <div className="note note-row">
            <span>{t('home.backupReminder')}</span>
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/ayarlar/yedek')}>
              {t('home.backupAction')}
            </button>
          </div>
        ) : null}
        <button
          type="button"
          className="btn btn-quiet home-settings"
          onClick={() => navigate('/ayarlar')}
          data-testid="home-settings"
        >
          <Icon name="settings" />
          <span>{t('home.caregiver')}</span>
        </button>
      </div>
    </Page>
  )
}

export function MeCardPage() {
  const profile = useProfile()
  const navigate = useNavigate()
  const filled = profile.name || profile.emergencyPhone
  const text = [profile.name ? `Benim adım ${profile.name}.` : '', profile.message].filter(Boolean).join(' ')

  return (
    <Page title={t('me.title')} back="/">
      <div className="me-card" data-testid="me-card">
        {profile.name ? <p className="me-name">{profile.name}</p> : null}
        <p className="me-message">{profile.message}</p>
        {profile.emergencyPhone ? (
          <div className="me-emergency">
            <p>
              <strong>{t('me.emergency')}:</strong> {profile.emergencyName} —{' '}
              <span dir="ltr">{profile.emergencyPhone}</span>
            </p>
            <a className="btn btn-no" href={`tel:${profile.emergencyPhone.replace(/[^\d+]/g, '')}`}>
              <Icon name="phone" />
              <span>
                {t('me.call')}: {profile.emergencyName || profile.emergencyPhone}
              </span>
            </a>
          </div>
        ) : null}
      </div>
      <BigButton icon="speak" label={t('me.say')} onClick={() => void speak(text)} testId="me-say" />
      {!filled ? (
        <p className="note">
          {t('me.empty')}{' '}
          <button type="button" className="btn btn-quiet inline-btn" onClick={() => navigate('/ayarlar/ben')}>
            {t('cg.profile')}
          </button>
        </p>
      ) : null}
    </Page>
  )
}

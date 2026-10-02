import { useEffect, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../features/board/store'
import { t } from '../i18n'
import { speak } from '../lib/speech'
import { Icon } from './Icon'

/**
 * Her ekranın çatısı. Evet / Hayır / Geri her ekranda aynı yerde, altta durur.
 * Sol el modunda sıralama aynalanır (CSS: [data-hand="left"]).
 */
export function Page({
  title,
  back,
  children,
  hideTitle,
  className,
}: {
  title: string
  /** "Geri" düğmesinin gideceği üst ekran; verilmezse düğme pasif kalır (yeri korunur). */
  back?: string
  children: ReactNode
  /** Başlık sayfa içinde başka yerde (ör. sayfalayıcıda) gösteriliyorsa; 'sr-only' yalnız ekran okuyucuya gösterir */
  hideTitle?: boolean | 'sr-only'
  className?: string
}) {
  useEffect(() => {
    document.title = `${title} · ${t('app.name')}`
  }, [title])
  return (
    <div className={`page ${className ?? ''}`}>
      <main className="page-main" id="main">
        {hideTitle ? null : <h1 className="page-title">{title}</h1>}
        {hideTitle === 'sr-only' ? <h1 className="sr-only">{title}</h1> : null}
        {children}
      </main>
      <Toast />
      <BottomBar back={back} />
    </div>
  )
}

export function BottomBar({ back }: { back?: string }) {
  const navigate = useNavigate()
  return (
    <nav className="bottom-bar" aria-label="Temel düğmeler">
      <button
        type="button"
        className="btn bar-btn bar-back"
        onClick={() => back && navigate(back)}
        disabled={!back}
        data-testid="nav-back"
      >
        <Icon name="back" size={36} />
        <span>{t('nav.back')}</span>
      </button>
      <button
        type="button"
        className="btn bar-btn bar-yes"
        onClick={() => void speak(t('nav.yes'))}
        data-testid="nav-yes"
      >
        <Icon name="yes" size={36} strokeWidth={3} />
        <span>{t('nav.yes')}</span>
      </button>
      <button type="button" className="btn bar-btn bar-no" onClick={() => void speak(t('nav.no'))} data-testid="nav-no">
        <Icon name="no" size={36} strokeWidth={3} />
        <span>{t('nav.no')}</span>
      </button>
    </nav>
  )
}

export function Toast() {
  const { message, actionLabel, action, hide } = useToast()
  if (!message) return <div className="toast-region" role="status" aria-live="polite" />
  return (
    <div className="toast-region" role="status" aria-live="polite">
      <div className="toast">
        <span>{message}</span>
        {action && actionLabel ? (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              action()
              hide()
            }}
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  )
}

export function BigButton({
  icon,
  label,
  onClick,
  tone = 'primary',
  testId,
  sublabel,
  disabled,
  symbol,
}: {
  icon?: Parameters<typeof Icon>[0]['name']
  /** Piktogram (Mulberry) — simgeden önce gelir: önce görsel, sonra kelime */
  symbol?: string
  label: string
  onClick: () => void
  tone?: 'primary' | 'secondary' | 'quiet' | 'yes' | 'no'
  testId?: string
  sublabel?: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      className={`btn big-btn btn-${tone}`}
      onClick={onClick}
      data-testid={testId}
      disabled={disabled}
    >
      {symbol ? <img src={symbol} alt="" className="big-btn-symbol" /> : icon ? <Icon name={icon} size={40} /> : null}
      <span className="big-btn-text">
        <span>{label}</span>
        {sublabel ? <span className="big-btn-sub">{sublabel}</span> : null}
      </span>
    </button>
  )
}

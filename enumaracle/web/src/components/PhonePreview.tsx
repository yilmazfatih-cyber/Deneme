import { useState } from 'react'
import { fmtTN, initials } from '../format'

export interface PhonePreviewProps {
  displayName: string
  logoUrl?: string
  callReason?: string
  tn?: string
  /** Whether the call would be shown as a verified caller. */
  verified?: boolean
  caption?: string
}

function isHttps(u?: string): u is string {
  return !!u && /^https:\/\/[^\s]+$/i.test(u)
}

/**
 * Shows how an incoming call looks on the subscriber's phone when the
 * operator delivers branded caller data (RCD: name, logo, call reason).
 */
export function PhonePreview({ displayName, logoUrl, callReason, tn, verified = true, caption }: PhonePreviewProps) {
  const [failedLogo, setFailedLogo] = useState<string | null>(null)
  const name = displayName.trim()
  const showLogo = isHttps(logoUrl) && failedLogo !== logoUrl
  const reason = callReason?.trim()

  const summary = [
    'Gelen arama önizlemesi',
    name || 'Marka adı girilmedi',
    tn ? fmtTN(tn) : '',
    reason ? `Arama nedeni: ${reason}` : '',
    verified ? 'Doğrulanmış arayan' : 'Doğrulanmamış arayan',
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <figure className="phone-figure">
      <div className="phone" role="img" aria-label={summary} data-testid="phone-preview">
        <div className="phone-notch" aria-hidden="true" />
        <div className="phone-screen" aria-hidden="true">
          <div className="phone-status">
            <span>09:41</span>
            <span>5G ▮▮▮</span>
          </div>
          <p className="phone-incoming">Gelen arama</p>
          <div className="phone-avatar">
            {showLogo ? (
              <img src={logoUrl} alt="" onError={() => setFailedLogo(logoUrl ?? null)} />
            ) : (
              <span className="phone-initials">{initials(name) || '?'}</span>
            )}
          </div>
          <p className="phone-name" data-testid="phone-name">
            {name || 'Marka adı'}
          </p>
          {verified ? (
            <p className="phone-verified">
              <span className="phone-check">✓</span> Doğrulanmış arayan
            </p>
          ) : (
            <p className="phone-unverified">Doğrulanmamış numara</p>
          )}
          {tn ? <p className="phone-tn">{fmtTN(tn)}</p> : null}
          {reason ? (
            <p className="phone-reason" data-testid="phone-reason">
              {reason}
            </p>
          ) : null}
          <div className="phone-actions">
            <span className="phone-btn phone-decline">
              <span>✆</span>
              Reddet
            </span>
            <span className="phone-btn phone-accept">
              <span>✆</span>
              Yanıtla
            </span>
          </div>
        </div>
      </div>
      {caption ? <figcaption className="muted small">{caption}</figcaption> : null}
    </figure>
  )
}

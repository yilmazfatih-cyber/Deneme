import { useState } from 'react'

export function CopyButton({ text, label = 'Kopyala' }: { text: string; label?: string }) {
  const [state, setState] = useState<'idle' | 'ok' | 'fail'>('idle')
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setState('ok')
    } catch {
      setState('fail')
    }
    window.setTimeout(() => setState('idle'), 2500)
  }
  return (
    <>
      <button type="button" className="btn btn-small" onClick={copy}>
        {state === 'ok' ? 'Kopyalandı' : label}
      </button>
      <span className="sr-only" role="status">
        {state === 'ok' ? 'Panoya kopyalandı' : state === 'fail' ? 'Kopyalanamadı; metni elle seçin' : ''}
      </span>
    </>
  )
}

/** Shows a secret exactly once with a copy button. */
export function SecretOnce({ title, secret, onDone }: { title: string; secret: string; onDone: () => void }) {
  return (
    <div className="alert alert-warning secret-once" role="status">
      <strong className="alert-title">{title}</strong>
      <p>Bu gizli değer yalnızca bir kez gösterilir. Şimdi kopyalayıp güvenli bir yerde saklayın.</p>
      <div className="secret-row">
        <code className="secret" aria-label="Gizli değer">
          {secret}
        </code>
        <CopyButton text={secret} />
      </div>
      <button type="button" className="btn btn-small" onClick={onDone}>
        Kaydettim, kapat
      </button>
    </div>
  )
}

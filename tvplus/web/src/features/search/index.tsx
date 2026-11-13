/**
 * YER TUTUCU — canlı + arama ajanı arama sayfası ve öneri kutusuyla değiştirecek. Dışa aktarım adları SABİT.
 * SearchBox web üst çubuğunda durur (360×44, surface-1, hap); gönderince #/ara?q=… açılır.
 */
import { useEffect, useState, type FormEvent, type ReactElement } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { PagePlaceholder } from '../../app/PagePlaceholder'
import { Icon } from '../../design'
import './placeholder.css'

/** #/ara?q= */
export function SearchPage(): ReactElement {
  return <PagePlaceholder title="Ara" />
}

export function SearchBox({ className }: { className?: string }): ReactElement {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')
  useEffect(() => setQ(params.get('q') ?? ''), [params])
  const submit = (e: FormEvent) => {
    e.preventDefault()
    navigate(`/ara?q=${encodeURIComponent(q.trim())}`)
  }
  return (
    <form role="search" className={className ? `tvp-searchbox ${className}` : 'tvp-searchbox'} onSubmit={submit}>
      <Icon name="search" size={20} />
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Film, dizi, kanal, program, oyuncu ara" aria-label="Ara" enterKeyHint="search" />
    </form>
  )
}

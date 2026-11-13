import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ROUTES } from '../../../../shared/constants'
import type { OcaNodeState } from '../../../../shared/types'
import { sessionHeaders } from '../../api/session'
import { fmtBytes, fmtClock, fmtInt, fmtKbps } from '../model/format'
import { Explainer, usePoll } from '../ui'

const OCA_URL = `${ROUTES.DEBUG_PREFIX}/oca`
/** Bant genişliği kaydırıcısının basamakları; son basamak sınırsız. */
const THROUGHPUT_STEPS: (number | null)[] = [250, 500, 750, 1000, 1500, 2000, 3000, 5000, 8000, 12_000, 20_000, null]
const PRESETS: { label: string; kbps: number | null }[] = [
  { label: '3G 750 kbps', kbps: 750 },
  { label: 'Zayıf Wi-Fi 2 Mb', kbps: 2000 },
  { label: 'Sınırsız', kbps: null },
]

type Controls = Pick<OcaNodeState, 'latencyMs' | 'throughputKbps' | 'errorRate' | 'down'>

/** Uç dizi ya da { nodes } / { oca } döndürebilir; ikisini de kabul et. */
function readNodes(v: unknown): OcaNodeState[] | null {
  if (Array.isArray(v)) return v as OcaNodeState[]
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    if (Array.isArray(o.nodes)) return o.nodes as OcaNodeState[]
    if (Array.isArray(o.oca)) return o.oca as OcaNodeState[]
  }
  return null
}

function stepIndex(kbps: number | null): number {
  if (kbps === null) return THROUGHPUT_STEPS.length - 1
  let best = 0
  THROUGHPUT_STEPS.forEach((s, i) => {
    if (s !== null && Math.abs(s - kbps) < Math.abs((THROUGHPUT_STEPS[best] ?? 0) - kbps)) best = i
  })
  return best
}

export function CdnTab(): ReactNode {
  const poll = usePoll<unknown>(OCA_URL, 2000, 10_000, sessionHeaders)
  const nodes = readNodes(poll.data)
  const [busy, setBusy] = useState<string | null>(null)
  const [postError, setPostError] = useState<string | null>(null)

  const post = async (url: string, body: unknown, who: string) => {
    setBusy(who)
    setPostError(null)
    try {
      const res = await fetch(url, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', accept: 'application/json', ...sessionHeaders() },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    } catch (err) {
      setPostError(`Ayar gönderilemedi (${String((err as Error).message ?? err)})`)
    } finally {
      setBusy(null)
      poll.refresh()
    }
  }

  return (
    <div className="kp-tab">
      <Explainer netflix="Open Connect (OCA) düğümleri">
        Videoyu dört sanal sunucu dağıtır. Burada her birinin ağ koşulunu bozup oynatıcının nasıl uyum sağladığını izleyebilirsin.
      </Explainer>
      <ul className="kp-guide">
        <li>Bant genişliğini kıs → ④'te bit hızının düştüğünü izle.</li>
        <li>Düğümü kapat → oynatıcı diğer düğüme geçer.</li>
      </ul>

      {poll.error && (
        <p className="kp-calm" role="status">
          Sunucunun hata ayıklama ucu şu an yanıt vermiyor. 10 sn'de bir yeniden deneniyor.
          <span className="kp-dim kp-small"> ({poll.error})</span>
        </p>
      )}
      {postError && (
        <p className="kp-calm" role="status">
          {postError}
        </p>
      )}

      {nodes === null && !poll.error && <p className="kp-empty">Düğümler yükleniyor…</p>}
      {nodes && (
        <>
          <div className="kp-toolbar">
            <button type="button" className="kp-btn" disabled={busy !== null} onClick={() => void post(`${OCA_URL}/reset`, {}, 'reset')}>
              Sıfırla
            </button>
            <span className="kp-toolbar-note">
              {poll.at ? `Güncellendi ${fmtClock(poll.at)}` : ''} · 2 sn'de bir
            </span>
          </div>
          <ul className="kp-nodes">
            {nodes.map((n) => (
              <NodeCard key={n.id} node={n} disabled={busy === 'reset'} onApply={(c) => void post(`${OCA_URL}/${encodeURIComponent(n.id)}`, c, n.id)} />
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function NodeCard({ node, disabled, onApply }: { node: OcaNodeState; disabled: boolean; onApply: (c: Controls) => void }): ReactNode {
  const server: Controls = { latencyMs: node.latencyMs, throughputKbps: node.throughputKbps, errorRate: node.errorRate, down: node.down }
  const [draft, setDraft] = useState<Controls | null>(null)
  const timer = useRef<number | null>(null)
  const c = draft ?? server

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    },
    [],
  )

  /** Kaydırıcı sürüklenirken her adımda istek atmamak için 300 ms bekler. */
  const change = (patch: Partial<Controls>, immediate = false) => {
    const next = { ...c, ...patch }
    setDraft(next)
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(
      () => {
        timer.current = null
        onApply(next)
        // Sunucu durumu bir sonraki yoklamada gelir; o zamana kadar taslak ekranda kalır.
        window.setTimeout(() => setDraft(null), 2500)
      },
      immediate ? 0 : 300,
    )
  }

  const lookups = node.cacheHits + node.cacheMisses
  const hit = lookups ? Math.round((node.cacheHits / lookups) * 100) : null
  const idx = stepIndex(c.throughputKbps)
  const nameId = `kp-node-${node.id}`

  return (
    <li className={`kp-node${c.down ? ' is-down' : ''}`} aria-labelledby={nameId}>
      <div className="kp-node-head">
        <div>
          <h3 id={nameId} className="kp-node-name">
            {node.name}
          </h3>
          <div className="kp-dim kp-small">
            <span className="kp-pill">{node.type}</span> {node.location} · <span className="kp-mono">{node.id}</span>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={c.down}
          className="kp-switch"
          disabled={disabled}
          onClick={() => change({ down: !c.down }, true)}
        >
          <span className="kp-switch-track" aria-hidden="true">
            <span className="kp-switch-dot" />
          </span>
          Düğümü kapat
        </button>
      </div>

      <div className="kp-node-stats">
        <span>
          <strong>{fmtInt(node.requests)}</strong> istek
        </span>
        <span>
          <strong>{fmtBytes(node.bytesServed)}</strong> sunuldu
        </span>
        <span>
          önbellek isabeti <strong>{hit === null ? '—' : `%${hit}`}</strong>
        </span>
      </div>

      <label className="kp-slider">
        <span className="kp-slider-l">Gecikme</span>
        <input
          type="range"
          min={0}
          max={1500}
          step={10}
          value={c.latencyMs}
          disabled={disabled}
          onChange={(e) => change({ latencyMs: Number(e.target.value) })}
        />
        <span className="kp-slider-v">{c.latencyMs} ms</span>
      </label>

      <label className="kp-slider">
        <span className="kp-slider-l">Bant genişliği</span>
        <input
          type="range"
          min={0}
          max={THROUGHPUT_STEPS.length - 1}
          step={1}
          value={idx}
          disabled={disabled}
          aria-valuetext={c.throughputKbps === null ? 'sınırsız' : fmtKbps(c.throughputKbps)}
          onChange={(e) => change({ throughputKbps: THROUGHPUT_STEPS[Number(e.target.value)] ?? null })}
        />
        <span className="kp-slider-v">{c.throughputKbps === null ? 'sınırsız' : fmtKbps(c.throughputKbps)}</span>
      </label>
      <div className="kp-presets" role="group" aria-label={`${node.name} hazır ayarlar`}>
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            className="kp-chip"
            aria-pressed={c.throughputKbps === p.kbps}
            disabled={disabled}
            onClick={() => change({ throughputKbps: p.kbps }, true)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <label className="kp-slider">
        <span className="kp-slider-l">Hata oranı</span>
        <input
          type="range"
          min={0}
          max={50}
          step={1}
          value={Math.round(c.errorRate * 100)}
          disabled={disabled}
          onChange={(e) => change({ errorRate: Number(e.target.value) / 100 })}
        />
        <span className="kp-slider-v">%{Math.round(c.errorRate * 100)}</span>
      </label>
    </li>
  )
}

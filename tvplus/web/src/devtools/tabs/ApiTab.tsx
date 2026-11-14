import { useState, type ReactNode } from 'react'
import { averageMs, formatFalcorPath, type ApiState, type FalcorCall, type GqlCall } from '../model/api'
import { fmtBytes, fmtClock, fmtInt, fmtMs, preview, shortId } from '../model/format'
import { ErrMark, Explainer } from '../ui'

const SHOW = 40

export function ApiTab({ api }: { api: ApiState }): ReactNode {
  const [more, setMore] = useState(false)
  const g = api.gqlStats
  const f = api.falcorStats
  const n = more ? 100 : SHOW
  return (
    <div className="kp-tab">
      <Explainer netflix="GraphQL (yeni) ve Shakti / Falcor pathEvaluator (eski)">
        Netflix iki API'yi yan yana çalıştırıyor; biz de öyle. Ana sayfa satırları eski Falcor yollarıyla, detay, arama
        ve canlı yeni GraphQL ile gelir.
      </Explainer>

      <div className="kp-compare">
        <section className="kp-card">
          <h3 className="kp-card-title">GraphQL</h3>
          <p className="kp-dim kp-small">Kalıcı sorgu: kimlik + sürüm</p>
          <div className="kp-mini-stats">
            <MiniStat v={fmtInt(g.count)} l="istek" />
            <MiniStat v={fmtMs(averageMs(g))} l="ortalama" />
            <MiniStat v={fmtInt(g.errors)} l="hata" />
          </div>
        </section>
        <section className="kp-card">
          <h3 className="kp-card-title">Falcor</h3>
          <p className="kp-dim kp-small">JSON Graph yolları</p>
          <div className="kp-mini-stats">
            <MiniStat v={fmtInt(f.network)} l="ağdan" />
            <MiniStat v={fmtInt(f.cacheHits)} l="önbellek" />
            <MiniStat v={fmtMs(averageMs(f))} l="ortalama" />
          </div>
        </section>
      </div>
      <p className="kp-note kp-note-strong">
        Sorgu metni hiç gönderilmez: yalnızca işlem adı, kayıt kimliği ve sürüm gider. Sunucu ham sorguyu reddeder.
      </p>

      <h3 className="kp-h">GraphQL istekleri</h3>
      {api.graphql.length === 0 ? (
        <p className="kp-empty">Henüz GraphQL isteği yok.</p>
      ) : (
        <ol className="kp-calls">
          {api.graphql.slice(0, n).map((c) => (
            <GqlRow key={c.id} c={c} />
          ))}
        </ol>
      )}

      <h3 className="kp-h">Falcor istekleri</h3>
      {api.falcor.length === 0 ? (
        <p className="kp-empty">Henüz Falcor isteği yok. Ana sayfa satırları bununla gelir.</p>
      ) : (
        <ol className="kp-calls">
          {api.falcor.slice(0, n).map((c) => (
            <FalcorRow key={c.id} c={c} />
          ))}
        </ol>
      )}
      {!more && (api.graphql.length > SHOW || api.falcor.length > SHOW) && (
        <button type="button" className="kp-btn" onClick={() => setMore(true)}>
          Daha fazla göster
        </button>
      )}
    </div>
  )
}

function MiniStat({ v, l }: { v: string; l: string }): ReactNode {
  return (
    <div className="kp-mini">
      <div className="kp-mini-v">{v}</div>
      <div className="kp-mini-l">{l}</div>
    </div>
  )
}

function GqlRow({ c }: { c: GqlCall }): ReactNode {
  return (
    <li className="kp-call">
      <div className="kp-call-top">
        <span className="kp-call-name">{c.op}</span>
        {!c.ok && <ErrMark label="başarısız" />}
        <span className="kp-ms">{fmtMs(c.ms)}</span>
      </div>
      <div className="kp-call-meta">
        <span title={c.pqId ?? ''}>
          kimlik <span className="kp-mono">{shortId(c.pqId)}</span>
        </span>
        <span>sürüm {c.version ?? '—'}</span>
        {c.bytes !== null && <span>{fmtBytes(c.bytes)}</span>}
        <span>{fmtClock(c.at)}</span>
      </div>
      <div className="kp-mono kp-call-vars">{preview(c.variables, 90)}</div>
      <div className="kp-call-meta">
        <span title={c.traceId ?? ''}>
          iz <span className="kp-mono">{shortId(c.traceId, 16)}</span>
        </span>
        {c.error && (
          <span className="kp-errline">
            {c.status ? `${c.status} · ` : ''}
            {c.error}
          </span>
        )}
      </div>
    </li>
  )
}

function FalcorRow({ c }: { c: FalcorCall }): ReactNode {
  const paths = c.paths.slice(0, 6)
  return (
    <li className="kp-call">
      <div className="kp-call-top">
        <span className="kp-call-name">{c.label}</span>
        <span className="kp-tag">{c.fromCache ? 'önbellekten' : 'ağdan'}</span>
        {!c.ok && <ErrMark label="başarısız" />}
        <span className="kp-ms">{c.fromCache ? '' : fmtMs(c.ms)}</span>
      </div>
      <ul className="kp-paths">
        {paths.map((p, i) => (
          <li key={i} className="kp-mono">
            {formatFalcorPath(p)}
          </li>
        ))}
        {c.paths.length > paths.length && <li className="kp-dim">+{c.paths.length - paths.length} yol daha</li>}
      </ul>
      <div className="kp-call-meta">
        <span>{fmtClock(c.at)}</span>
        {c.traceId && (
          <span title={c.traceId}>
            iz <span className="kp-mono">{shortId(c.traceId, 16)}</span>
          </span>
        )}
        {c.missing ? <span>{c.missing} yol eksik</span> : null}
        {c.error && <span className="kp-errline">{c.error}</span>}
      </div>
    </li>
  )
}

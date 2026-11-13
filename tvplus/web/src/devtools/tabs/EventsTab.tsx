import type { ReactNode } from 'react'
import { ROUTES } from '../../../../shared/constants'
import type { DebugServerState } from '../../../../shared/types'
import { sessionHeaders } from '../../api/session'
import { fmtClock, fmtInt, fmtMs } from '../model/format'
import { sortedTally, type TelemetryState } from '../model/telemetry'
import { ErrMark, Explainer, Stat, usePoll } from '../ui'

const STATE_URL = `${ROUTES.DEBUG_PREFIX}/state`

function uptime(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return h ? `${h} sa ${m} dk` : `${m} dk`
}

export function EventsTab({ t }: { t: TelemetryState }): ReactNode {
  const poll = usePoll<DebugServerState>(STATE_URL, 5000, 15_000, sessionHeaders)
  const server = poll.data && typeof poll.data === 'object' && poll.data.events ? poll.data : null
  const tally = sortedTally(t.tally)
  const max = tally[0]?.[1] ?? 1
  const serverTally = server ? sortedTally(server.events.byName ?? {}).slice(0, 8) : []

  return (
    <div className="kp-tab">
      <Explainer netflix="Ichnaea olay günlüğü (logs.netflix.com/log/www/cl/2)">
        Gezinme, görünen kartlar ve oynatma olayları kuyrukta biriktirilir, birkaç saniyede bir tek paket olarak yollanır. Arayüz bu
        gönderimi asla beklemez.
      </Explainer>

      <div className="kp-stats-row">
        <Stat label="paket" value={fmtInt(t.batchesSent)} />
        <Stat label="olay" value={fmtInt(t.eventsSent)} />
        <Stat label="başarısız paket" value={fmtInt(t.failed)} />
        <Stat label="kalan kota" value={t.lastRemaining === null ? '—' : fmtInt(t.lastRemaining)} hint="x-tvplus-izci başlığındaki RL değeri" />
      </div>
      <p className="kp-dim kp-small">
        Hız sınırı başlığı: <span className="kp-mono">x-tvplus-izci: {t.lastRate ?? '—'}</span> (Netflix: x-ichnaea)
      </p>

      <h3 className="kp-h">Bu oturumda olay adına göre</h3>
      {tally.length === 0 ? (
        <p className="kp-empty">Henüz paket gönderilmedi. İlk paket birkaç saniye içinde gider.</p>
      ) : (
        <ul className="kp-tally">
          {tally.map(([name, n]) => (
            <li key={name}>
              <span className="kp-mono kp-tally-name">{name}</span>
              <span className="kp-tally-bar" aria-hidden="true">
                <span style={{ width: `${(n / max) * 100}%` }} />
              </span>
              <span className="kp-tally-n">{fmtInt(n)}</span>
            </li>
          ))}
        </ul>
      )}

      <h3 className="kp-h">Son paketler</h3>
      {t.batches.length === 0 ? (
        <p className="kp-empty">Paket yok.</p>
      ) : (
        <ol className="kp-calls">
          {t.batches.slice(0, 20).map((b) => (
            <li key={b.id} className="kp-call">
              <div className="kp-call-top">
                <span className="kp-call-name">
                  {b.count} olay{b.beacon ? ' · sayfa kapanırken (beacon)' : ''}
                </span>
                {!b.ok && <ErrMark label="gönderilemedi" />}
                <span className="kp-ms">{fmtMs(b.ms)}</span>
              </div>
              <div className="kp-call-meta">
                <span>{fmtClock(b.at)}</span>
                {b.status !== null && <span>durum {b.status}</span>}
                {b.remaining !== null && <span>kalan {fmtInt(b.remaining)}</span>}
                {b.error && <span className="kp-errline">{b.error}</span>}
              </div>
              {b.names.length > 0 && <div className="kp-mono kp-call-vars">{summarizeNames(b.names)}</div>}
            </li>
          ))}
        </ol>
      )}

      <h3 className="kp-h">Sunucu tarafı toplamlar</h3>
      {!server ? (
        <p className="kp-calm" role="status">
          {poll.error ? 'Sunucu durumu şu an alınamıyor; 15 sn\'de bir yeniden deneniyor.' : 'Yükleniyor…'}
        </p>
      ) : (
        <>
          <div className="kp-stats-row">
            <Stat label="toplam olay" value={fmtInt(server.events.total)} />
            <Stat label="etkin oynatma" value={fmtInt(server.playback.activeSessions)} />
            <Stat label="manifest" value={fmtInt(server.playback.manifestsIssued)} />
            <Stat label="ön hazırlık" value={fmtInt(server.playback.prefetchIssued)} />
          </div>
          <p className="kp-dim kp-small">
            Son paket: {server.events.lastBatchAt ? fmtClock(Date.parse(server.events.lastBatchAt)) : '—'} · sunucu {uptime(server.uptimeSec)} açık ·{' '}
            {server.region}
            {poll.error ? ' · son yenileme başarısız' : ''}
          </p>
          {serverTally.length > 0 && (
            <ul className="kp-tally">
              {serverTally.map(([name, n]) => (
                <li key={name}>
                  <span className="kp-mono kp-tally-name">{name}</span>
                  <span className="kp-tally-bar" aria-hidden="true">
                    <span style={{ width: `${(n / (serverTally[0]?.[1] ?? 1)) * 100}%` }} />
                  </span>
                  <span className="kp-tally-n">{fmtInt(n)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

/** ["impression","impression","focus"] → "impression ×2, focus" */
function summarizeNames(names: string[]): string {
  const m = new Map<string, number>()
  for (const n of names) m.set(n, (m.get(n) ?? 0) + 1)
  return [...m].map(([n, c]) => (c > 1 ? `${n} ×${c}` : n)).join(', ')
}

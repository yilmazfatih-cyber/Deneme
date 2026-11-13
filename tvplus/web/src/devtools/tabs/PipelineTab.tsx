import { useState, type ReactNode } from 'react'
import { fmtBytes, fmtClock, fmtCountdown, fmtInt, fmtKbps, fmtMs, fmtSec } from '../model/format'
import {
  activeRungIndex,
  type EmbedView,
  type FtlView,
  type ManifestView,
  type MslView,
  type PipelineState,
  type RangeBlock,
  type StreamingView,
  type TtmlView,
} from '../model/pipeline'
import { Empty, ErrMark, Explainer, Icon, ICONS, KV, useNow } from '../ui'

type StepStatus = 'wait' | 'done' | 'live'

function Step({
  n,
  title,
  netflix,
  status,
  children,
}: {
  n: number
  title: string
  netflix: string
  status: StepStatus
  children: ReactNode
}): ReactNode {
  const statusText = status === 'wait' ? 'bekliyor' : status === 'live' ? 'şu an çalışıyor' : 'tamam'
  return (
    <li className={`kp-step is-${status}`}>
      <div className="kp-step-rail" aria-hidden="true">
        <span className="kp-step-n">{n}</span>
      </div>
      <div className="kp-step-body">
        <h3 className="kp-step-title">
          {title}
          <span className="kp-step-status">{statusText}</span>
        </h3>
        <p className="kp-step-nf">Netflix'te: {netflix}</p>
        {children}
      </div>
    </li>
  )
}

const KIND_TEXT: Record<string, string> = {
  STREAMS: 'Ayrı ses ve video akışları, bayt aralığıyla (kendi CDN hattımız)',
  PROGRESSIVE: 'Tek dosya; aralık isteklerini tarayıcı kendisi yapar',
  EXTERNAL_EMBED: 'YouTube gömmesi; akışı YouTube oynatıcısı taşır',
  UNKNOWN: 'Bilinmeyen tür',
}
const SOURCE_TEXT: Record<string, string> = {
  none: 'Henüz oynatma yok',
  streams: 'Kendi CDN hattımız (ayrı ses/video)',
  progressive: 'Kendi CDN hattımız (tek dosya)',
  embed: 'YouTube gömmesi',
}

export function PipelineTab({ p }: { p: PipelineState }): ReactNode {
  const now = useNow(1000)
  const st = p.streaming
  const lastRange = Math.max(st.video.at(-1)?.at ?? 0, st.audio.at(-1)?.at ?? 0)
  const embed = p.source === 'embed'
  return (
    <div className="kp-tab">
      <Explainer netflix="Cadmium oynatıcı · FTL · MSL · Open Connect">
        Oynat'a bastığında beş adım işler: en hızlı sunucu ölçülür, şifreli anahtar alınır, izinli akış listesi
        (manifest) istenir, görüntü ve ses ayrı ayrı parça parça iner, altyazı ayrı belge olarak gelir.
      </Explainer>

      <div className="kp-source" aria-live="polite">
        <span>
          Kaynak: <strong>{SOURCE_TEXT[p.source]}</strong>
        </span>
        {p.player?.state && (
          <span>
            Oynatıcı: <strong>{p.player.state}</strong>
            {p.player.positionSec !== null && ` · ${fmtSec(p.player.positionSec)}`}
          </span>
        )}
      </div>
      {!p.manifest && !p.embed && st.requests === 0 && (
        <p className="kp-hint">Bir başlık oynat; adımlar burada canlı dolar.</p>
      )}

      <ol className="kp-steps">
        <Step n={1} title="FTL yoklaması" netflix="FTL (Faster Than Light)" status={p.ftl ? 'done' : 'wait'}>
          {p.ftl ? (
            <FtlPanel ftl={p.ftl} now={now} />
          ) : (
            <Empty>Profil seçilince dört uç yarıştırılır; en hızlısı manifest sıralamasına girer.</Empty>
          )}
        </Step>

        <Step n={2} title="MSL anahtar sağlama" netflix="MSL / ALE (aleProvision)" status={p.msl ? 'done' : 'wait'}>
          {p.msl ? (
            <MslPanel msl={p.msl} now={now} />
          ) : (
            <Empty>Oynatmadan önce tarayıcı sunucuyla ortak bir şifre anahtarı kurar.</Empty>
          )}
        </Step>

        <Step
          n={3}
          title="Lisanslı manifest"
          netflix="licensedManifest (+ prefetch)"
          status={p.manifest ? 'done' : 'wait'}
        >
          {p.manifest ? (
            <ManifestPanel
              m={p.manifest}
              st={st}
              now={now}
              prefetchCount={p.prefetchCount}
              lastPrefetch={p.lastPrefetch}
            />
          ) : (
            <Empty>Hangi kalitelerin, dillerin ve sunucuların kullanılabileceğini söyleyen şifreli liste.</Empty>
          )}
        </Step>

        {embed ? (
          <Step
            n={4}
            title="YouTube oynatıcısı"
            netflix="(karşılığı yok — dış sağlayıcı)"
            status={p.embed?.states.length ? 'live' : 'wait'}
          >
            <EmbedPanel embed={p.embed} />
          </Step>
        ) : (
          <>
            <Step
              n={4}
              title="Bayt-aralığı akışı"
              netflix="Open Connect /range/ istekleri + ABR"
              status={st.requests === 0 ? 'wait' : now - lastRange < 5000 ? 'live' : 'done'}
            >
              {st.requests === 0 ? (
                <Empty>
                  {p.source === 'progressive'
                    ? 'Tek dosya kaynağında aralık isteklerini tarayıcı kendisi yapar; burada görünmeyebilir.'
                    : 'Görüntü ve ses ayrı ayrı, küçük bayt aralıklarıyla indirilir.'}
                </Empty>
              ) : (
                <StreamingPanel st={st} />
              )}
            </Step>
            <Step n={5} title="TTML altyazı" netflix="TTML, tickRate=10000000" status={p.ttml ? 'done' : 'wait'}>
              {p.ttml ? <TtmlPanel t={p.ttml} /> : <Empty>Altyazı seçilince ayrı bir TTML belgesi olarak gelir.</Empty>}
            </Step>
          </>
        )}
      </ol>
    </div>
  )
}

/* ───────────── ① FTL ───────────── */

function FtlPanel({ ftl, now }: { ftl: FtlView; now: number }): ReactNode {
  const last = ftl.pulses.at(-1)
  if (!last) return null
  const max = Math.max(1, ...last.targets.map((t) => t.totalMs ?? 0))
  const done = new Set(ftl.pulses.map((x) => x.index))
  return (
    <div className="kp-ftl">
      <div className="kp-pulses">
        {Array.from({ length: ftl.totalPulses }, (_, i) => (
          <span key={i} className={`kp-pulse${done.has(i) ? ' is-done' : ''}${i === last.index ? ' is-current' : ''}`}>
            {done.has(i) && <Icon d={ICONS.check} size={12} />}
            Darbe {i + 1}
          </span>
        ))}
        <span className="kp-pulse-next">
          {ftl.iter + 1}. tur ·{' '}
          {ftl.nextPulseAt ? `sonraki darbe ${fmtCountdown(ftl.nextPulseAt - now)} sonra` : 'tur bitti'}
        </span>
      </div>
      <ul className="kp-bars" aria-label={`Darbe ${last.index + 1} sonuçları`}>
        {last.targets.map((t) => (
          <li key={t.name} className={`kp-bar-row${t.winner ? ' is-winner' : ''}`}>
            <div className="kp-bar-head">
              <span className="kp-mono">{t.name}</span>
              <span className="kp-dim">{t.cdnId}</span>
              {t.winner && (
                <span className="kp-tag">
                  <Icon d={ICONS.check} size={12} /> en hızlı
                </span>
              )}
              <span className="kp-bar-val">{t.ok ? fmtMs(t.totalMs) : ''}</span>
            </div>
            {t.ok ? (
              <>
                <div
                  className="kp-bar"
                  role="img"
                  aria-label={`ilk bayt ${fmtMs(t.ttfbMs)}, toplam ${fmtMs(t.totalMs)}`}
                >
                  <span className="kp-bar-total" style={{ width: `${((t.totalMs ?? 0) / max) * 100}%` }}>
                    <span
                      className="kp-bar-ttfb"
                      style={{ width: `${t.totalMs ? ((t.ttfbMs ?? 0) / t.totalMs) * 100 : 0}%` }}
                    />
                  </span>
                </div>
                <div className="kp-dim kp-small">
                  ilk bayt {fmtMs(t.ttfbMs)} · {fmtKbps(t.kbps)}
                </div>
              </>
            ) : (
              <div className="kp-small kp-errline">
                <ErrMark /> yanıt yok
              </div>
            )}
          </li>
        ))}
      </ul>
      <p className="kp-legend">
        <span className="kp-key kp-key-ttfb" /> ilk bayt <span className="kp-key kp-key-total" /> 5 KB'ın tamamı · kısa
        çubuk daha hızlı
      </p>
    </div>
  )
}

/* ───────────── ② MSL ───────────── */

const SCHEME_TEXT: Record<string, string> = {
  ECDH_P256_AESGCM: 'ECDH P-256 + AES-GCM (şifreli zarf)',
  PLAINTEXT_DEV: 'Şifresiz (güvensiz bağlam, yalnızca geliştirme)',
}

function MslPanel({ msl, now }: { msl: MslView; now: number }): ReactNode {
  return (
    <>
      {!msl.lastOk && (
        <p className="kp-errline">
          <ErrMark /> Son ileti başarısız: {msl.lastLabel}
        </p>
      )}
      <KV
        rows={[
          ['Şema', msl.scheme ? (SCHEME_TEXT[msl.scheme] ?? msl.scheme) : '—'],
          ['Ana belirteç no', msl.serial !== null ? `#${msl.serial}` : '—'],
          ['Yenileme', msl.renewalAt ? `${fmtCountdown(msl.renewalAt - now)} sonra` : '—'],
          ['Geçerlilik sonu', msl.expiresAt ? `${fmtCountdown(msl.expiresAt - now)} sonra` : '—'],
          [
            'Son ileti no',
            msl.lastMessageId !== null ? `#${msl.lastMessageId} · ${msl.messages} zarf` : `${msl.messages} zarf`,
          ],
          ['Sağlandı', msl.provisionedAt ? fmtClock(msl.provisionedAt) : '—'],
        ]}
      />
      <p className="kp-note">İleti numarası her zarfta artar; sunucu eskisini tekrar görürse reddeder.</p>
    </>
  )
}

/* ───────────── ③ manifest ───────────── */

function ManifestPanel({
  m,
  st,
  now,
  prefetchCount,
  lastPrefetch,
}: {
  m: ManifestView
  st: StreamingView
  now: number
  prefetchCount: number
  lastPrefetch: { at: number; viewableId: string } | null
}): ReactNode {
  const active = activeRungIndex(m, st)
  return (
    <>
      {!m.ok && (
        <p className="kp-errline">
          <ErrMark /> Manifest alınamadı
        </p>
      )}
      <KV
        rows={[
          ['İçerik', m.title ? `${m.title} · ${m.viewableId}` : m.viewableId],
          [
            'Tür',
            <span key="k">
              <span className="kp-mono">{m.kind}</span> — {KIND_TEXT[m.kind]}
            </span>,
          ],
          ['İstek', m.prefetch ? "Ön hazırlık (oynat'a basılmadan önce)" : 'Gerçek oynatma'],
          ['Geçerlilik', m.expiresAt ? `${fmtCountdown(m.expiresAt - now)} sonra biter` : '—'],
          ['Ön hazırlık', prefetchCount ? `${prefetchCount} kez · son ${lastPrefetch?.viewableId ?? ''}` : 'yok'],
        ]}
      />
      {m.video.length > 0 && (
        <table className="kp-table">
          <caption>Video basamakları (ABR bunların arasında geçer)</caption>
          <thead>
            <tr>
              <th scope="col">Bit hızı</th>
              <th scope="col">Çözünürlük</th>
              <th scope="col">Profil</th>
            </tr>
          </thead>
          <tbody>
            {m.video.map((r, i) => (
              <tr
                key={`${r.bitrateKbps}-${i}`}
                className={i === active ? 'is-active' : undefined}
                aria-current={i === active ? 'true' : undefined}
              >
                <td>{fmtKbps(r.bitrateKbps)}</td>
                <td>{r.height ? `${r.height}p` : '—'}</td>
                <td className="kp-mono">
                  {r.profile ?? '—'}
                  {i === active && <span className="kp-tag kp-tag-on">şu an</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {(m.audio.length > 0 || m.text.length > 0) && (
        <div className="kp-tracks">
          {m.audio.length > 0 && (
            <div>
              <span className="kp-dim kp-small">Ses</span>
              <div className="kp-chips-static">
                {m.audio.map((a) => (
                  <span key={a} className="kp-pill">
                    {a}
                  </span>
                ))}
              </div>
            </div>
          )}
          {m.text.length > 0 && (
            <div>
              <span className="kp-dim kp-small">Altyazı</span>
              <div className="kp-chips-static">
                {m.text.map((a) => (
                  <span key={a} className="kp-pill">
                    {a}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {m.cdns.length > 0 && (
        <div className="kp-cdnrank">
          <span className="kp-dim kp-small">CDN sıralaması (FTL sonucuna göre)</span>
          <ol>
            {m.cdns.map((c) => (
              <li key={c.id} className={c.id === st.activeCdn ? 'is-active' : undefined}>
                <span className="kp-rank">{c.rank}</span>
                <span className="kp-mono">{c.id}</span>
                <span className="kp-dim">{[c.type, c.location].filter(Boolean).join(' · ')}</span>
                {c.id === st.activeCdn && <span className="kp-tag kp-tag-on">kullanılıyor</span>}
              </li>
            ))}
          </ol>
        </div>
      )}
    </>
  )
}

/* ───────────── ④ akış ───────────── */

function StreamingPanel({ st }: { st: StreamingView }): ReactNode {
  const [picked, setPicked] = useState<number | null>(null)
  const all = [...st.video, ...st.audio]
  const sel = all.find((b) => b.id === picked) ?? st.video.at(-1) ?? st.audio.at(-1) ?? null
  const scale = Math.max(1, sum(st.video), sum(st.audio))
  const buf = st.buffer
  return (
    <div className="kp-stream">
      <div className="kp-stats4">
        <div>
          <div className="kp-big">{fmtKbps(st.currentKbps)}</div>
          <div className="kp-dim kp-small">bit hızı</div>
        </div>
        <div>
          <div className="kp-big">{st.currentHeight ? `${st.currentHeight}p` : '—'}</div>
          <div className="kp-dim kp-small">çözünürlük</div>
        </div>
        <div>
          <div className="kp-big kp-mono kp-ellipsis" title={st.activeCdn ?? ''}>
            {st.activeCdn ?? '—'}
          </div>
          <div className="kp-dim kp-small">düğüm</div>
        </div>
        <div>
          <div className="kp-big">{fmtBytes(st.totalBytes)}</div>
          <div className="kp-dim kp-small">{fmtInt(st.requests)} istek</div>
        </div>
      </div>

      <Lane title="Video" blocks={st.video} scale={scale} picked={sel?.id ?? null} onPick={setPicked} />
      <Lane title="Ses" blocks={st.audio} scale={scale} picked={sel?.id ?? null} onPick={setPicked} />
      <p className="kp-legend">
        Her kutu bir aralık isteği; genişliği indirilen bayt kadar. Ses parçaları videodan çok küçüktür.
        {[...st.video, ...st.audio].some(
          (b, i, a) => i > 0 && a[i - 1]?.type === b.type && a[i - 1]?.cdnId !== b.cdnId,
        ) && ' Kutunun solundaki beyaz çizgi: düğüm değişti.'}
      </p>
      {sel && (
        <div className="kp-sel" aria-live="polite">
          <span className="kp-mono">
            {sel.type === 'video' ? 'video' : 'ses'} /range/{sel.start ?? '?'}-{sel.end ?? '?'}
          </span>
          <span>
            {fmtBytes(sel.bytes)} · {fmtMs(sel.ms)} · {fmtKbps(sel.kbps)} ·{' '}
            <span className="kp-mono">{sel.cdnId ?? '—'}</span>
            {!sel.ok && (
              <>
                {' '}
                <ErrMark label="istek başarısız" /> başarısız
              </>
            )}
          </span>
        </div>
      )}

      <Spark st={st} />

      <div className="kp-buffers">
        <span className="kp-dim kp-small">Tampon {buf?.state ? `· ${buf.state}` : ''}</span>
        <BufferBar label="Video" sec={buf?.videoSec ?? null} />
        <BufferBar label="Ses" sec={buf?.audioSec ?? null} />
      </div>

      {st.markers.length > 0 && (
        <ul className="kp-markers" aria-label="Son geçişler">
          {st.markers
            .slice(-4)
            .reverse()
            .map((mk) => (
              <li key={mk.id}>
                <span className="kp-time">{fmtClock(mk.at)}</span>
                <span className={`kp-mk kp-mk-${mk.kind}`}>
                  {mk.kind === 'abr' ? (mk.dir === 'down' ? '↓' : '↑') : '⇄'}
                </span>
                <span>
                  {mk.kind === 'abr' ? 'Bit hızı: ' : 'Yük devri: '}
                  {mk.text}
                  {mk.reason && <span className="kp-dim"> · {mk.reason}</span>}
                </span>
              </li>
            ))}
        </ul>
      )}
    </div>
  )
}

function sum(list: RangeBlock[]): number {
  return list.reduce((a, b) => a + b.bytes, 0)
}

function Lane({
  title,
  blocks,
  scale,
  picked,
  onPick,
}: {
  title: string
  blocks: RangeBlock[]
  scale: number
  picked: number | null
  onPick: (id: number) => void
}): ReactNode {
  const total = sum(blocks)
  const timed = blocks.filter((b) => b.kbps !== null)
  const avg = timed.length ? timed.reduce((a, b) => a + (b.kbps ?? 0), 0) / timed.length : null
  return (
    <div className="kp-lane">
      <div className="kp-lane-head">
        <span className="kp-lane-title">{title}</span>
        <span className="kp-dim kp-small">
          son {blocks.length} istek · {fmtBytes(total)} · ort. {fmtKbps(avg)}
        </span>
      </div>
      <div className="kp-lane-track">
        {blocks.map((b, i) => {
          const switched = i > 0 && blocks[i - 1]?.cdnId !== b.cdnId
          return (
            <button
              key={b.id}
              type="button"
              className={`kp-block${b.id === picked ? ' is-picked' : ''}${switched ? ' is-switch' : ''}${b.ok ? '' : ' is-fail'}`}
              style={{ flexGrow: Math.max(b.bytes, 1) }}
              title={`${b.start ?? '?'}-${b.end ?? '?'} · ${fmtBytes(b.bytes)} · ${fmtMs(b.ms)} · ${fmtKbps(b.kbps)} · ${b.cdnId ?? ''}`}
              aria-label={`${title} aralığı ${fmtBytes(b.bytes)}, ${b.cdnId ?? ''}`}
              onClick={() => onPick(b.id)}
            >
              {!b.ok && '!'}
            </button>
          )
        })}
        {/* Ortak ölçek: şeridin boş kalan kısmı, iki şerit aynı bayt ölçeğinde kalsın diye. */}
        {scale > total && <span className="kp-lane-rest" style={{ flexGrow: scale - total }} aria-hidden="true" />}
      </div>
    </div>
  )
}

function Spark({ st }: { st: StreamingView }): ReactNode {
  const pts = [...st.samples, ...st.estimates]
  if (pts.length < 2) return null
  const t0 = Math.min(...pts.map((p) => p.at))
  const t1 = Math.max(...pts.map((p) => p.at), t0 + 1)
  const max = Math.max(...pts.map((p) => p.kbps), st.currentKbps ?? 0) * 1.15
  const W = 400
  const H = 64
  const x = (at: number) => ((at - t0) / (t1 - t0)) * W
  const y = (k: number) => H - (k / max) * H
  const line = (list: { at: number; kbps: number }[]) =>
    list.map((p) => `${x(p.at).toFixed(1)},${y(p.kbps).toFixed(1)}`).join(' ')
  const marks = st.markers.filter((m) => m.at >= t0 && m.at <= t1)
  return (
    <figure className="kp-spark">
      <figcaption className="kp-spark-head">
        <span className="kp-dim kp-small">İndirme hızı</span>
        <span className="kp-small">
          <span className="kp-key kp-key-sample" /> ölçülen <span className="kp-key kp-key-est" /> ABR tahmini
        </span>
        <span className="kp-dim kp-small">üst: {fmtKbps(max)}</span>
      </figcaption>
      <div className="kp-spark-box">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label="Ölçülen hız ve ABR tahmini grafiği"
        >
          {st.samples.length > 1 && (
            <polyline className="kp-spark-sample" points={line(st.samples)} vectorEffect="non-scaling-stroke" />
          )}
          {st.estimates.length > 1 && (
            <polyline className="kp-spark-est" points={line(st.estimates)} vectorEffect="non-scaling-stroke" />
          )}
          {marks.map((m) => (
            <line
              key={m.id}
              className={`kp-spark-mk kp-spark-mk-${m.kind}`}
              x1={x(m.at)}
              x2={x(m.at)}
              y1={0}
              y2={H}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        {marks.map((m) => (
          <span key={m.id} className="kp-spark-tag" style={{ left: `${(x(m.at) / W) * 100}%` }}>
            {m.kind === 'abr' ? (m.dir === 'down' ? '↓' : '↑') : '⇄'}
          </span>
        ))}
      </div>
    </figure>
  )
}

const BUFFER_TARGET_SEC = 30

function BufferBar({ label, sec }: { label: string; sec: number | null }): ReactNode {
  const pct = sec === null ? 0 : Math.min(100, (sec / BUFFER_TARGET_SEC) * 100)
  return (
    <div className="kp-buf">
      <span className="kp-buf-l">{label}</span>
      <span
        className="kp-buf-track"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={BUFFER_TARGET_SEC}
        aria-valuenow={sec ?? 0}
        aria-label={`${label} tamponu`}
      >
        <span className="kp-buf-fill" style={{ width: `${pct}%` }} />
      </span>
      <span className="kp-buf-v">{fmtSec(sec)}</span>
    </div>
  )
}

/* ───────────── ⑤ TTML ───────────── */

function TtmlPanel({ t }: { t: TtmlView }): ReactNode {
  return (
    <>
      {!t.ok && (
        <p className="kp-errline">
          <ErrMark /> Altyazı yüklenemedi
        </p>
      )}
      <KV
        rows={[
          ['Dil', t.language ?? '—'],
          ['Satır sayısı', fmtInt(t.cues)],
          ['Zaman birimi', t.tickRate ? `saniyede ${fmtInt(t.tickRate)} tik` : '—'],
        ]}
      />
      <p className="kp-note">Tik tabanlı zamanlama, altyazıyı kare hassasiyetinde görüntüye bağlar.</p>
    </>
  )
}

/* ───────────── gömme ───────────── */

const EMBED_TEXT: Record<string, string> = {
  UNSTARTED: 'başlamadı',
  BUFFERING: 'arabellek',
  PLAYING: 'oynuyor',
  PAUSED: 'duraklatıldı',
  ENDED: 'bitti',
  CUED: 'hazır',
  ERROR: 'hata',
}

function EmbedPanel({ embed }: { embed: EmbedView | null }): ReactNode {
  return (
    <>
      <p className="kp-note kp-note-strong">
        Bu başlığı YouTube'un kendi oynatıcısı taşıyor. Görüntü YouTube sunucularından gelir; bizim bayt-aralığı
        trafiğimiz ve TTML altyazımız olmadığı için ④ ve ⑤ burada yok.
      </p>
      {embed && embed.states.length > 0 ? (
        <ol className="kp-timeline" aria-label="Gömme oynatıcı durumları">
          {embed.states.map((s, i) => (
            <li key={`${s.at}-${i}`} className={i === embed.states.length - 1 ? 'is-current' : undefined}>
              <span className="kp-mono">{s.state}</span>
              <span className="kp-dim kp-small">
                {EMBED_TEXT[s.state] ?? ''} · {fmtClock(s.at)}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <Empty>Oynatıcı yüklenince durumlar burada sıralanır.</Empty>
      )}
      {embed?.videoId && (
        <p className="kp-dim kp-small">
          YouTube kimliği: <span className="kp-mono">{embed.videoId}</span>
        </p>
      )}
      {embed?.error && (
        <p className="kp-errline">
          <ErrMark /> YouTube hatası: {embed.error}
        </p>
      )}
    </>
  )
}

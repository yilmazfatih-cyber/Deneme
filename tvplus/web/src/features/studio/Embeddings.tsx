/**
 * Gömme (docs/ICERIK_ZEKASI.md §8; uçlar /api/studio/embeddings*): sağlayıcı ve sürüm (taban mı eğitilmiş mi),
 * sayılar ve kipler; başlık seçici → en yakın başlıklar; çekim şeridi (anahartar kare, zaman, söylenen) → bir çekimin
 * başka başlıklardaki en yakın çekimleri; başlık vektörlerinin 2B haritası; "Yeniden kur".
 */
import { useMemo, useState, type ReactElement } from 'react'
import type {
  EmbeddingInfo,
  NeighborShot,
  NeighborTitle,
  ProjectionPoint,
  ShotSummary,
} from '../../../../shared/intelligence'
import { apiUrl } from '../../api/session'
import { Button, toast } from '../../ui'
import { studioSend, useAction, useStudio } from './api'
import { ScatterPlot, type ScatterPoint } from './charts'
import { fmtClock, fmtDateTime, fmtDec, fmtInt } from './format'
import { Chip, Loadable, LoadingBlock, Panel, SectionHead, Stat, TYPE_LABEL, type ChipTone } from './parts'
import { StudioTitleCard, titleName, useTitleIndex } from './titles'

const MODALITY_LABEL = { VISUAL: 'Görüntü', AUDIO: 'Ses', TEXT: 'Metin', CONTEXT: 'Genel bağlam' } as const

/** Sağlayıcının dürüst etiketi: taban eğitilmemiş yerleşik kodlayıcıdır; dosya/http eğitilmiş modelin vektörleridir. */
export function embeddingKind(provider: string): { label: string; tone: ChipTone; trained: boolean } {
  if (provider === 'taban') return { label: 'taban — eğitilmemiş', tone: 'sample', trained: false }
  if (provider === 'dosya') return { label: 'eğitilmiş model vektörleri (dosya)', tone: 'ok', trained: true }
  if (provider === 'http') return { label: 'eğitilmiş model (canlı sunucu)', tone: 'ok', trained: true }
  return { label: provider, tone: 'neutral', trained: false }
}

const DEFAULT_TITLE_NAME = 'Sintel'

export function EmbeddingsSection(): ReactElement {
  const info = useStudio<EmbeddingInfo>('/embeddings')
  const idx = useTitleIndex()
  const [titleId, setTitleId] = useState<number | null>(null)
  const fallback = useMemo(
    () => [...idx.values()].find((t) => t.title === DEFAULT_TITLE_NAME)?.id ?? [...idx.keys()][0] ?? null,
    [idx],
  )
  const current = titleId ?? fallback
  const options = useMemo(() => [...idx.values()].sort((a, b) => a.title.localeCompare(b.title, 'tr')), [idx])
  const rebuild = useAction()
  const doRebuild = async () => {
    const r = await rebuild.run(() => studioSend<EmbeddingInfo>('POST', '/embeddings/rebuild'))
    if (r) {
      toast(`Vektörler yeniden kuruldu: ${fmtInt(r.titles)} başlık, ${fmtInt(r.shots)} çekim.`, { kind: 'success' })
      info.refetch()
    }
  }
  return (
    <>
      <SectionHead
        title="Gömme"
        lead="İçerik çekimlere bölünür; her çekim görüntü, ses ve söylenenlerle temsil edilir. Başlığın özeti ve etiketleri her çekime genel bağlam olarak eklenir."
        actions={
          <Button variant="secondary" size="sm" onClick={doRebuild} busy={rebuild.busy} disabled={rebuild.busy}>
            Yeniden kur
          </Button>
        }
      />
      {rebuild.error && (
        <p className="st-error" role="alert">
          {rebuild.error}
        </p>
      )}
      <Loadable res={info} what="Gömme" skeleton={<LoadingBlock lines={2} block={false} />}>
        {(e) => {
          const kind = embeddingKind(e.provider)
          return (
            <>
              <div className="st-stats">
                <Stat label="Sağlayıcı" value={e.provider} note={<Chip tone={kind.tone}>{kind.label}</Chip>} />
                <Stat
                  label="Model sürümü"
                  value={<span className="st-small st-mono">{e.modelVersion}</span>}
                  note={`${e.dims} boyut`}
                />
                <Stat label="Başlık vektörü" value={fmtInt(e.titles)} />
                <Stat
                  label="Çekim vektörü"
                  value={fmtInt(e.shots)}
                  note={`sahne algılanan ${fmtInt(e.sceneDetected)} video`}
                />
                <Stat
                  label="Kipler"
                  value={<span className="st-small">{e.modalities.map((m) => MODALITY_LABEL[m]).join(', ')}</span>}
                />
                <Stat label="Kuruldu" value={<span className="st-small">{fmtDateTime(e.builtAt)}</span>} />
              </div>
              {!kind.trained && (
                <p className="ui-caption st-honest">
                  Taban sağlayıcı eğitilmemiş, elle kurulmuş bir kodlayıcıdır. Hattı ve arayüzü çalışır tutar; eğitilmiş
                  bir modelin yerini tutmaz. Eğitilmiş vektörler dosya ya da http sağlayıcısıyla takılır.
                </p>
              )}
            </>
          )
        }}
      </Loadable>
      <Panel
        title="Başlık"
        actions={
          <label className="st-select st-select--inline">
            <span className="st-select__label">Başlık seç</span>
            <select value={current ?? ''} onChange={(ev) => setTitleId(Number(ev.target.value))}>
              {options.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title} ({TYPE_LABEL[t.type]})
                </option>
              ))}
            </select>
          </label>
        }
      >
        {current !== null ? (
          <TitleNeighbors titleId={current} onPick={setTitleId} />
        ) : (
          <LoadingBlock lines={1} block={false} />
        )}
      </Panel>
      {current !== null && <ShotStrip key={current} videoId={current} />}
      <MapPanel selected={current} onSelect={setTitleId} />
    </>
  )
}

function TitleNeighbors({ titleId, onPick }: { titleId: number; onPick: (id: number) => void }): ReactElement {
  const res = useStudio<NeighborTitle[]>(`/embeddings/titles/${titleId}/neighbors?first=12`)
  return (
    <>
      <h3 className="st-h3">En yakın başlıklar</h3>
      <Loadable res={res} what="Komşu başlıklar" skeleton={<LoadingBlock lines={1} />}>
        {(list) =>
          list.length === 0 ? (
            <p className="ui-meta">Komşu yok.</p>
          ) : (
            <div className="st-cards">
              {list.map((n) => (
                <StudioTitleCard
                  key={n.titleId}
                  id={n.titleId}
                  onClick={() => onPick(n.titleId)}
                  caption={`benzerlik ${fmtDec(n.score, 3)}`}
                />
              ))}
            </div>
          )
        }
      </Loadable>
    </>
  )
}

function ShotStrip({ videoId }: { videoId: number }): ReactElement {
  const res = useStudio<ShotSummary[]>(`/embeddings/videos/${videoId}/shots`)
  const [shot, setShot] = useState<number | null>(null)
  const idx = useTitleIndex()
  return (
    <Panel
      title={`Çekimler · ${titleName(idx, videoId)}`}
      sub="Bir çekime basınca başka başlıklardaki en yakın çekimler gelir."
    >
      {res.error && !res.data ? (
        <p className="ui-meta">
          Bu yaprağın çekim vektörü yok{res.error.status === 404 ? '' : ` (${res.error.message})`}. Dizilerde çekimler
          bölüm düzeyindedir.
        </p>
      ) : (
        <Loadable res={res} what="Çekimler" skeleton={<LoadingBlock lines={1} />}>
          {(shots) => (
            <>
              <p className="ui-caption">{fmtInt(shots.length)} çekim</p>
              <ul className="st-shots" aria-label="Çekim şeridi">
                {shots.map((s) => (
                  <li key={s.index}>
                    <button
                      type="button"
                      className={shot === s.index ? 'st-shot is-on' : 'st-shot'}
                      aria-pressed={shot === s.index}
                      aria-label={`Çekim ${s.index + 1}, ${fmtClock(s.startSec)}–${fmtClock(s.endSec)}${s.text ? `: ${s.text}` : ''}`}
                      onClick={() => setShot(shot === s.index ? null : s.index)}
                    >
                      {s.keyframeUrl ? (
                        <img src={apiUrl(s.keyframeUrl)} alt="" loading="lazy" decoding="async" />
                      ) : (
                        <span className="st-shot__noimg">kare yok</span>
                      )}
                      <span className="st-shot__time">
                        {fmtClock(s.startSec)}–{fmtClock(s.endSec)}
                        {!s.hasAudio && ' · sessiz'}
                      </span>
                      <span className="st-shot__text">{s.text || '—'}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {shot !== null && <ShotNeighbors videoId={videoId} index={shot} />}
            </>
          )}
        </Loadable>
      )}
    </Panel>
  )
}

function ShotNeighbors({ videoId, index }: { videoId: number; index: number }): ReactElement {
  const res = useStudio<NeighborShot[]>(`/embeddings/videos/${videoId}/shots/${index}/neighbors?first=12`)
  const idx = useTitleIndex()
  return (
    <div className="st-shotnb">
      <h3 className="st-h3">Çekim {index + 1} için en yakın çekimler</h3>
      <Loadable res={res} what="Komşu çekimler" skeleton={<LoadingBlock lines={1} />}>
        {(list) =>
          list.length === 0 ? (
            <p className="ui-meta">Komşu çekim yok.</p>
          ) : (
            <ul className="st-shots st-shots--grid">
              {list.map((n) => (
                <li key={`${n.videoId}-${n.index}`} className="st-shot st-shot--static">
                  {n.keyframeUrl ? (
                    <img src={apiUrl(n.keyframeUrl)} alt="" loading="lazy" decoding="async" />
                  ) : (
                    <span className="st-shot__noimg">kare yok</span>
                  )}
                  <span className="st-shot__time">
                    {titleName(idx, n.titleId)} · {fmtClock(n.startSec)}
                  </span>
                  <span className="st-shot__text">benzerlik {fmtDec(n.score, 3)}</span>
                </li>
              ))}
            </ul>
          )
        }
      </Loadable>
    </div>
  )
}

function MapPanel({ selected, onSelect }: { selected: number | null; onSelect: (id: number) => void }): ReactElement {
  const proj = useStudio<ProjectionPoint[]>('/embeddings/projection')
  const near = useStudio<NeighborTitle[]>(selected !== null ? `/embeddings/titles/${selected}/neighbors?first=6` : null)
  const idx = useTitleIndex()
  const nearSet = useMemo(() => new Set((near.data ?? []).map((n) => n.titleId)), [near.data])
  return (
    <Panel
      title="Başlık haritası"
      sub="Başlık vektörlerinin 2B izdüşümü. Yakın noktalar benzer içerik demektir; eksenlerin kendi anlamı yoktur."
      actions={
        <span className="st-legend" aria-hidden="true">
          <span className="st-legend__item">
            <span className="st-key st-key--cat-a" /> Film
          </span>
          <span className="st-legend__item">
            <span className="st-key st-key--cat-b" /> Dizi
          </span>
          <span className="st-legend__item">
            <span className="st-key st-key--accent" /> Seçili ve komşuları
          </span>
        </span>
      }
    >
      <Loadable res={proj} what="Harita" skeleton={<LoadingBlock lines={0} />}>
        {(pts) => {
          const points: ScatterPoint[] = pts.map((p) => {
            const t = idx.get(p.titleId)
            return {
              id: p.titleId,
              x: p.x,
              y: p.y,
              label: `${t?.title ?? `#${p.titleId}`} (${t ? TYPE_LABEL[t.type] : 'bilinmiyor'})`,
              group: t?.type === 'SHOW' ? 'b' : 'a',
              emphasis: p.titleId === selected ? 'selected' : nearSet.has(p.titleId) ? 'near' : null,
            }
          })
          const movies = points.filter((p) => p.group === 'a').length
          return (
            <ScatterPlot
              points={points}
              onSelect={onSelect}
              caption={`${fmtInt(points.length)} başlık: ${fmtInt(movies)} film, ${fmtInt(points.length - movies)} dizi. Bir noktaya basınca başlık seçilir.`}
            />
          )
        }}
      </Loadable>
    </Panel>
  )
}

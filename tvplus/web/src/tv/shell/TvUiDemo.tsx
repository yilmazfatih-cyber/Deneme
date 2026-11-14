/**
 * Görsel QA ve odak motoru sınaması için TV ilkelleri vitrini (/tv/_ui ve /tv/_ui/2). Gerçek görseller Falcor
 * lolomo'sundan gelir. Bu ekran ürünün parçası değildir; TV ekipleri bileşenleri burada görür.
 */
import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router-dom'
import { falcor } from '../../api/falcor'
import {
  TvActionList,
  TvAvatar,
  TvBackground,
  TvButton,
  TvCard,
  TvDialog,
  TvGrid,
  TvKeypad,
  TvList,
  TvLiveTag,
  TvPosterCard,
  TvProgress,
  TvRow,
  TvRowsViewport,
  TvScreen,
  TvSkeletonRow,
  TvSkeletonText,
  tvToast,
} from '../ui'

interface Art {
  url?: string
}
interface DemoVideo {
  id: number
  title: string
  type: string
  synopsis: string
  storyUrl: string | null
  boxUrl: string | null
  billboardUrl: string | null
  rank: number | null
  progress: number | null
  runtime: string | null
  badge: string | null
}
interface DemoRow {
  key: string
  title: string
  context: string
  items: DemoVideo[]
}

type Json = Record<string, unknown>
const obj = (v: unknown): Json | null => (v && typeof v === 'object' ? (v as Json) : null)

const LEAVES = [
  'summary',
  'title',
  'shortSynopsis',
  'storyArt',
  'boxart',
  'billboardArt',
  'top10Rank',
  'bookmark',
  'displayRuntime',
  'badge',
]

/** lolomo JSON → demo satırları (bilinmeyen biçimler sessizce atlanır). */
function mapRows(json: Json | null): DemoRow[] {
  const lolomo = obj(json?.lolomo)
  if (!lolomo) return []
  const rows: DemoRow[] = []
  for (let r = 0; r < 12; r++) {
    const list = obj(lolomo[String(r)])
    const summary = obj(list?.summary)
    // Vitrin satırı tek öğelidir; Ana Sayfa'da bilgi alanı olarak gösterilir, satır olarak değil.
    if (!list || !summary || summary.context === 'billboard') continue
    const items: DemoVideo[] = []
    for (let i = 0; i < 30; i++) {
      const v = obj(list[String(i)])
      const s = obj(v?.summary)
      if (!v || !s || typeof v.title !== 'string') continue
      const bm = obj(v.bookmark)
      const badge = obj(v.badge)
      items.push({
        id: Number(s.id),
        title: v.title,
        type: String(s.type ?? ''),
        synopsis: typeof v.shortSynopsis === 'string' ? v.shortSynopsis : '',
        storyUrl: (v.storyArt as Art | undefined)?.url ?? null,
        boxUrl: (v.boxart as Art | undefined)?.url ?? null,
        billboardUrl: (v.billboardArt as Art | undefined)?.url ?? null,
        rank: typeof v.top10Rank === 'number' ? v.top10Rank : null,
        progress: bm && typeof bm.progress === 'number' ? bm.progress : null,
        runtime: typeof v.displayRuntime === 'string' ? v.displayRuntime : null,
        badge: badge && typeof badge.text === 'string' ? badge.text : null,
      })
    }
    if (!items.length) continue
    rows.push({
      key: `r${r}`,
      title: String(summary.displayName ?? `Satır ${r + 1}`),
      context: String(summary.context ?? ''),
      items,
    })
  }
  return rows
}

function useDemoRows(): { rows: DemoRow[]; error: boolean } {
  const [state, setState] = useState<{ rows: DemoRow[]; error: boolean }>({ rows: [], error: false })
  useEffect(() => {
    let alive = true
    falcor
      .get<Json>(
        ['lolomo', { from: 0, to: 11 }, 'summary'],
        ['lolomo', { from: 0, to: 11 }, { from: 0, to: 24 }, LEAVES],
      )
      .then(
        (json) => alive && setState({ rows: mapRows(json), error: false }),
        (err: unknown) => {
          // Kısmi hata: gelen yolları yine kullan.
          const partial = obj((err as { json?: unknown }).json)
          if (alive) setState({ rows: mapRows(partial), error: !partial })
        },
      )
    return () => {
      alive = false
    }
  }, [])
  return state
}

const TYPE_TEXT: Record<string, string> = { show: 'DİZİ', movie: 'FİLM' }

/** /tv/_ui — satırlar, kartlar, arka plan, düğmeler, pencere, bildirim. */
export function TvUiDemo(): ReactElement {
  const navigate = useNavigate()
  const { rows, error } = useDemoRows()
  const [focused, setFocused] = useState<DemoVideo | null>(null)
  const [dialog, setDialog] = useState(false)
  const hero = focused ?? rows[0]?.items[0] ?? null

  const viewportRows = useMemo(
    () =>
      rows.map((row, r) => {
        const poster = row.context === 'top10'
        return (
          <TvRow
            key={row.key}
            id={`demo-satir-${r}`}
            title={row.title}
            items={row.items}
            itemKey={(v) => String(v.id)}
            itemWidth={poster ? 19.2 : 19.5}
            aspect={poster ? 19.2 / 18 : 16 / 9}
            onFocusIndex={(_, v) => setFocused(v)}
            renderItem={(v, i, focusId) =>
              poster ? (
                <TvPosterCard
                  id={focusId}
                  imageUrl={v.boxUrl}
                  title={v.title}
                  rank={v.rank ?? i + 1}
                  onPress={() => tvToast(`${v.title} seçildi`)}
                />
              ) : (
                <TvCard
                  id={focusId}
                  imageUrl={v.storyUrl ?? v.boxUrl}
                  title={v.title}
                  badge={r === 1 && i === 1 ? 'Yeni Bölüm' : v.badge}
                  live={r === 1 && i === 0}
                  locked={r === 1 && i === 2}
                  progress={v.progress ?? (r === 1 && i === 0 ? 0.42 : null)}
                  caption={r === 1 ? (v.runtime ?? v.title) : null}
                  autoFocus={r === 0 && i === 0}
                  onPress={() => tvToast(`${v.title} seçildi`)}
                />
              )
            }
          />
        )
      }),
    [rows],
  )

  return (
    <TvScreen id="ui-vitrin" title="TV bileşenleri" padded={false}>
      <TvBackground src={hero?.billboardUrl ?? hero?.storyUrl ?? null} />
      <div className="tv-demo-hero">
        <p className="tv-demo-hero__eyebrow">{hero ? (TYPE_TEXT[hero.type] ?? 'BAŞLIK') : ' '}</p>
        <h1 className="tv-demo-hero__title">{hero?.title ?? 'TV bileşenleri'}</h1>
        <p className="tv-demo-hero__meta">
          {hero?.runtime ?? ''} {hero && <span className="tv-demo-hero__hd">HD</span>}
        </p>
        <p className="tv-demo-hero__synopsis">{hero?.synopsis || 'Satırlar yükleniyor.'}</p>
        <div className="tv-demo-hero__buttons">
          <TvButton id="demo:oynat" label="Oynat" icon="play" variant="play" onPress={() => tvToast('Oynat')} />
          <TvButton id="demo:pencere" label="Pencere" icon="info" onPress={() => setDialog(true)} />
          <TvButton
            id="demo:bildirim"
            label="Bildirim"
            onPress={() => tvToast("Deniz'in telefonu gönderdi", { kind: 'phone' })}
          />
          <TvButton
            id="demo:diger"
            label="Diğer bileşenler"
            icon="chevronRight"
            onPress={() => navigate('/tv/_ui/2')}
          />
        </div>
      </div>
      {rows.length ? (
        <TvRowsViewport id="demo-satirlar" anchor="35rem" className="tv-demo-rows">
          {viewportRows}
        </TvRowsViewport>
      ) : (
        <div className="tv-demo-rows tv-demo-rows--loading">
          {error ? <p className="tv-subtle">Satırlar alınamadı.</p> : <TvSkeletonRow />}
        </div>
      )}
      {dialog && (
        <TvDialog
          id="demo-pencere"
          title="Listeden çıkarılsın mı?"
          message="Bu bir sınama penceresi. Geri tuşu da kapatır."
          onClose={() => setDialog(false)}
          defaultFocus="demo-pencere:hayir"
        >
          <div className="tv-dialog__actions">
            <TvButton id="demo-pencere:evet" label="Çıkar" onPress={() => setDialog(false)} />
            <TvButton id="demo-pencere:hayir" label="Vazgeç" onPress={() => setDialog(false)} />
          </div>
        </TvDialog>
      )}
    </TvScreen>
  )
}

/** /tv/_ui/2 — ızgara, liste, tuş takımı, eylem listesi, göstergeler, iskeletler. */
export function TvUiDemo2(): ReactElement {
  const navigate = useNavigate()
  const { rows } = useDemoRows()
  const items = rows.flatMap((r) => r.items).slice(0, 18)
  const [digits, setDigits] = useState('')
  return (
    <TvScreen id="ui-vitrin-2" title="TV bileşenleri 2" defaultFocus="demo2:eylem-0">
      <div className="tv-demo2">
        <div className="tv-demo2__col">
          <h2 className="tv-demo2__label">TvActionList</h2>
          <TvActionList
            id="demo2-eylemler"
            actions={[
              { id: 'demo2:eylem-0', label: 'Oynat', icon: 'play', onPress: () => tvToast('Oynat') },
              { label: 'Baştan Başlat', icon: 'restart', onPress: () => tvToast('Baştan Başlat') },
              { label: 'Geri dön', icon: 'back', onPress: () => navigate('/tv/_ui') },
            ]}
          />
          <h2 className="tv-demo2__label">TvKeypad · {digits || '—'}</h2>
          <TvKeypad
            id="demo2-tus"
            onDigit={(d) => setDigits((s) => (s + String(d)).slice(-4))}
            onDelete={() => setDigits((s) => s.slice(0, -1))}
            onSubmit={() => tvToast(`Kanal ${digits || '—'}`)}
          />
        </div>
        <div className="tv-demo2__col">
          <h2 className="tv-demo2__label">TvList</h2>
          <TvList id="demo2-liste" className="tv-demo2__list" gap={0.6}>
            {Array.from({ length: 14 }, (_, i) => (
              <TvButton key={i} label={`${i + 1}. Kanal`} variant="quiet" className="tv-demo2__list-item" />
            ))}
          </TvList>
          <h2 className="tv-demo2__label">Göstergeler</h2>
          <div className="tv-demo2__chips">
            <TvLiveTag />
            <span className="tv-badge">Yeni Bölüm</span>
            <TvAvatar url="/brand/avatar-1.png" name="Deniz" size={3.4} />
            <TvAvatar url={null} name="Çocuk" size={3.4} />
          </div>
          <TvProgress value={0.62} className="tv-demo2__progress" />
          <TvSkeletonText lines={2} width={24} />
        </div>
        <div className="tv-demo2__col tv-demo2__col--grid">
          <h2 className="tv-demo2__label">TvGrid (3 sütun)</h2>
          <TvGrid id="demo2-izgara" columns={3} className="tv-demo2__grid">
            {items.map((v) => (
              <TvCard
                key={v.id}
                id={`demo2:kart-${v.id}`}
                imageUrl={v.storyUrl}
                title={v.title}
                width="100%"
                caption={v.title}
              />
            ))}
          </TvGrid>
        </div>
      </div>
    </TvScreen>
  )
}

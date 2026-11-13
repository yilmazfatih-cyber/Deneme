/**
 * Tasarım sistemi galerisi (#/_tasarim) — görsel QA yüzeyi: her bileşen, her durumuyla.
 * Görsel sunucusu gerektirmez: kart görselleri yoksa yedek (başlıklı) yüzey çizilir; kanal logoları /brand altından.
 */
import { useMemo, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  AccessLock,
  AdvisoryBadge,
  Avatar,
  Badge,
  Button,
  ChannelTile,
  Chip,
  EmptyHint,
  ErrorState,
  formatClock,
  formatDayTime,
  formatLiveLine,
  formatRemaining,
  formatTimeRange,
  HScroll,
  Icon,
  ICON_NAMES,
  IconButton,
  LandscapeCard,
  LiveChannelCard,
  LiveTag,
  ModeSwitch,
  PosterCard,
  ProgressBar,
  Row,
  RowHeader,
  Sheet,
  Skeleton,
  SkeletonRow,
  TextButton,
  toast,
  weekdayShort,
  type AppMode,
  type VisibleRange,
} from './index'
import './gallery.css'

const MIN = 60_000
/** Yalnız /brand/channels altında gerçekten bulunan logolar. */
const CHANNELS: [slug: string, name: string][] = [
  ['trt-haber', 'TRT Haber'],
  ['ntv', 'NTV'],
  ['cnn-turk', 'CNN Türk'],
  ['haberturk', 'Habertürk'],
  ['haber-global', 'Haber Global'],
  ['a-haber', 'A Haber'],
  ['tv100', 'tv100'],
  ['szc', 'Sözcü TV'],
  ['trt-cocuk', 'TRT Çocuk'],
  ['tv-plus-kanal', 'TV+ Kanal'],
]
const logo = (slug: string) => `/brand/channels/${slug}.png`
/** Afiş genişliğini bir kapsayıcıda sabitler (galeride iki ölçüyü yan yana göstermek için). */
const posterW = (px: number) => ({ '--poster-w': `${px}px` }) as CSSProperties

function Section({ title, children, note }: { title: string; note?: string; children: ReactNode }): ReactElement {
  return (
    <section className="tvp-gal__section">
      <h2 className="cn-row-title cn-gutter-x">{title}</h2>
      {note && <p className="cn-meta cn-gutter-x tvp-gal__note">{note}</p>}
      {children}
    </section>
  )
}

const Swatch = ({ name, value }: { name: string; value: string }) => (
  <div className="tvp-gal__swatch">
    <span className="tvp-gal__chip" style={{ background: `var(${value})` }} />
    <span className="cn-meta">{name}</span>
  </div>
)

export function DesignGallery(): ReactElement {
  const [mode, setMode] = useState<AppMode>('live')
  const [chip, setChip] = useState('Tümü')
  const [sheet, setSheet] = useState(false)
  const [range, setRange] = useState<VisibleRange>({ first: -1, last: -1 })
  const [liked, setLiked] = useState(true)
  const [listed, setListed] = useState(false)
  const now = useMemo(() => Date.now(), [])
  const ending = { start: now - 80 * MIN, end: now + 25 * MIN }
  const long = { start: now - 30 * MIN, end: now + 95 * MIN }

  return (
    <div className="tvp-gal">
      <header className="tvp-gal__head cn-pad-x">
        <img src="/brand/logo.png" alt="TV+" className="tvp-gal__logo" />
        <div>
          <h1 className="cn-screen-title">çini tasarım sistemi</h1>
          <p className="cn-meta">Tüm bileşenler ve durumları · görsel denetim yüzeyi</p>
        </div>
        <span className="tvp-gal__spacer" />
        <Button variant="secondary" size="md" to="/">
          Uygulamaya dön
        </Button>
      </header>

      <div className="cn-page">
        <Section title="Renkler">
          <div className="tvp-gal__wrap cn-pad-x">
            {[
              ['bg', '--bg'],
              ['surface-1', '--s1'],
              ['surface-2', '--s2'],
              ['surface-3', '--s3'],
              ['line', '--line'],
              ['line-strong', '--line-strong'],
              ['yellow', '--yellow'],
              ['text-1', '--t1'],
              ['text-2', '--t2'],
              ['text-3', '--t3'],
              ['live', '--live'],
              ['ok', '--ok'],
            ].map(([n, v]) => (
              <Swatch key={n} name={n!} value={v!} />
            ))}
          </div>
        </Section>

        <Section title="Yazı rolleri">
          <div className="tvp-gal__stack cn-pad-x">
            <p className="cn-hero-title">Hero başlığı</p>
            <p className="cn-screen-title">Ekran başlığı</p>
            <p className="cn-row-title">Satır başlığı</p>
            <p className="cn-card-title">Kart başlığı tek satır, uzun olursa üç noktayla kesilir ve taşmaz</p>
            <p className="cn-body">Gövde metni: kısa, sen dili, emir kipinde eylem. Ünlem yok.</p>
            <p className="cn-meta">Meta · S1 B4 · 23 dk kaldı</p>
          </div>
        </Section>

        <Section title="İkonlar" note={`${ICON_NAMES.length} ikon · 24 px · çizgi 2`}>
          <div className="tvp-gal__icons cn-pad-x">
            {ICON_NAMES.map((n) => (
              <div key={n} className="tvp-gal__icon">
                <Icon name={n} />
                <span className="cn-meta">{n}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Butonlar" note="Ekranda en fazla bir sarı birincil buton (bu galeri hariç)">
          <div className="tvp-gal__wrap cn-pad-x">
            <Button icon="play">İzle</Button>
            <Button variant="secondary" icon="plus">
              Listeme ekle
            </Button>
            <Button variant="tertiary" icon="cast">
              TV'de izle
            </Button>
            <Button size="md">Devam et</Button>
            <Button size="sm" variant="secondary">
              Küçük
            </Button>
            <Button busy>Bekleniyor</Button>
            <Button disabled variant="secondary">
              Pasif
            </Button>
            <Button
              variant="secondary"
              icon={listed ? 'check' : 'plus'}
              aria-pressed={listed}
              title="Listeme ekle / çıkar"
              onClick={() => setListed((v) => !v)}
            >
              {listed ? 'Listende' : 'Listeme ekle'}
            </Button>
            <Button to="/_tasarim" variant="secondary" icon="chevronRight">
              Bağlantı
            </Button>
          </div>
          <div className="tvp-gal__wrap cn-pad-x">
            <IconButton icon="plus" label="Listeme ekle" />
            <IconButton icon="like" label="Beğen" />
            <IconButton icon="share" label="Paylaş" />
            <IconButton icon="cast" label="TV'de izle" size={40} />
            <IconButton icon="bell" label="Bildirimler" variant="ghost" />
            <IconButton icon="close" label="Kapat" size={36} />
            <IconButton icon="download" label="İndir" disabled />
            <IconButton icon="like" label="Beğendim" pressed={liked} onClick={() => setLiked((v) => !v)} />
            <IconButton icon="check" label="Listende" pressed size={40} />
            <TextButton onClick={() => toast('Tümü açılır')}>Tümü</TextButton>
          </div>
        </Section>

        <Section title="Çip ve Geçiş" note="Çipte seçili BEYAZ; sarı yalnız Geçiş'te">
          <HScroll label="Çipler">
            {['Tümü', 'Film', 'Dizi', 'Belgesel', 'Çocuk', 'Spor', 'Haber'].map((c) => (
              <Chip key={c} selected={chip === c} onClick={() => setChip(c)}>
                {c}
              </Chip>
            ))}
          </HScroll>
          <div className="cn-pad-x tvp-gal__mode">
            <ModeSwitch value={mode} onChange={setMode} />
          </div>
        </Section>

        <Section title="Satır + afiş kartları" note={`Görünür kartlar: ${range.first}–${range.last} (gösterim izleme)`}>
          <Row title="Bugünün Top 10'u" to="/_tasarim" scrollKey="galeri-top10" onVisibleRangeChange={setRange}>
            {Array.from({ length: 10 }, (_, i) => (
              <PosterCard key={i} title={`Film ${i + 1}`} rank={i + 1} to="/_tasarim" badge={i === 1 ? 'Yeni' : null} />
            ))}
          </Row>
          <div style={posterW(112)}>
            <Row title="Top 10 · 112 px afiş">
              {[1, 2, 7, 9, 10].map((r) => (
                <PosterCard
                  key={r}
                  title={`Film ${r}`}
                  rank={r}
                  imageUrl={r === 2 ? '/brand/avatar-2.png' : null}
                  to="/_tasarim"
                />
              ))}
            </Row>
          </div>
          <div style={posterW(184)}>
            <Row title="Top 10 · 184 px afiş">
              {[1, 4, 8, 10].map((r) => (
                <PosterCard
                  key={r}
                  title={`Film ${r}`}
                  rank={r}
                  showTitle={r === 4}
                  meta={r === 4 ? '2024 · Dram' : null}
                  imageUrl={r === 1 ? '/brand/avatar-1.png' : null}
                  to="/_tasarim"
                />
              ))}
            </Row>
          </div>
          <RowHeader title="Afiş durumları" />
          <HScroll label="Afiş durumları">
            <PosterCard title="Rozetli" badge="Yeni bölüm" onClick={() => toast('Afişe dokunuldu')} />
            <PosterCard title="Sadece burada" badge="Sadece TV+'ta" />
            <PosterCard title="Pakette yok" lockedText="Sinema Paketi ile" />
            <PosterCard title="Kalkıyor" badge="Son 3 gün" />
            <PosterCard title="Afiş ve başlık" showTitle meta="2024 · Dram" imageUrl="/brand/avatar-1.png" />
            <PosterCard title="Kilitli ızgara kartı" showTitle lockedText="Sinema Paketi ile" />
            <PosterCard title="Çok uzun bir film adı ve devamı" showTitle meta="1 sa 48 dk" />
          </HScroll>
        </Section>

        <Section title="Yatay kartlar (16:9)">
          <HScroll label="Yatay kartlar">
            <LandscapeCard title="Kuzgun" meta="S1 B4 · 23 dk kaldı" progress={0.62} to="/_tasarim" />
            <LandscapeCard
              title="Ana Haber"
              live={ending}
              channelLogoUrl={logo('trt-haber')}
              channelName="TRT Haber"
              to="/_tasarim"
            />
            <LandscapeCard title="Gece Bülteni" live={long} channelLogoUrl={logo('ntv')} channelName="NTV" />
            <LandscapeCard title="Yeni bölüm geldi" badge="Yeni bölüm" meta="S2 B1" />
            <LandscapeCard title="Pakette yok" lockedText="Sinema Paketi ile" progress={0.2} />
            <LandscapeCard title="Yeni başladı" meta="1 sa 12 dk" progress={0.04} />
          </HScroll>
        </Section>

        <Section
          title="Kanal karoları ve canlı kanal kartı"
          note="Canlı öğe her zaman ilerleme + bitiş/kalan süre taşır"
        >
          <HScroll label="Kanallar">
            {CHANNELS.map(([slug, name], i) => (
              <ChannelTile key={slug} name={name} logoUrl={logo(slug)} to="/_tasarim" selected={i === 0} />
            ))}
            <ChannelTile name="Logosuz" />
          </HScroll>
          <HScroll label="Kanallarım">
            <LiveChannelCard
              channelName="TRT Haber"
              channelLogoUrl={logo('trt-haber')}
              programmeTitle="Ana Haber Bülteni"
              {...ending}
              to="/_tasarim"
            />
            <LiveChannelCard
              channelName="CNN Türk"
              channelLogoUrl={logo('cnn-turk')}
              programmeTitle="Akşam Haberleri ve Uzun Bir Program Adı"
              {...long}
              to="/_tasarim"
            />
            <LiveChannelCard
              channelName="TRT Çocuk"
              channelLogoUrl={logo('trt-cocuk')}
              programmeTitle="Çizgi Film Kuşağı"
              {...long}
              lockedText="Çocuk Paketi ile"
            />
          </HScroll>
        </Section>

        <Section title="Etiketler, rozetler, ilerleme">
          <div className="tvp-gal__wrap cn-pad-x">
            <LiveTag />
            <span className="tvp-gal__onimage">
              <LiveTag overlay />
            </span>
            <Badge>Yeni bölüm</Badge>
            <Badge>Yeni</Badge>
            <Badge>Sadece TV+'ta</Badge>
            <Badge>Son 3 gün</Badge>
            <AccessLock text="Sinema Paketi ile" />
            <AccessLock text="Paketinde" />
          </div>
          <div className="tvp-gal__stack cn-pad-x tvp-gal__progress">
            {[0, 0.25, 0.62, 1].map((v) => (
              <ProgressBar key={v} value={v} />
            ))}
          </div>
          <div className="tvp-gal__stack cn-pad-x">
            <AdvisoryBadge certification="Genel İzleyici" />
            <AdvisoryBadge certification="7+" reasons={['Şiddet ve Korku']} />
            <AdvisoryBadge
              certification="13+"
              reasons={['Şiddet ve Korku', 'Olumsuz Örnek Oluşturabilecek Davranışlar']}
            />
            <AdvisoryBadge certification="18+" reasons={['Cinsellik', 'Şiddet ve Korku']} />
          </div>
          <div className="tvp-gal__wrap cn-pad-x">
            <Avatar src="/brand/avatar-1.png" name="Deniz" size={40} />
            <Avatar src="/brand/avatar-2.png" name="Ece" size={36} />
            <Avatar name="İpek" size={40} />
            <Avatar name="çağrı" size={96} />
          </div>
        </Section>

        <Section title="İskeletler">
          <div className="tvp-gal__wrap cn-pad-x">
            <Skeleton variant="tile" />
            <div className="tvp-gal__stack tvp-gal__texts">
              <Skeleton variant="title" />
              <Skeleton variant="text" />
              <Skeleton variant="text" width="60%" />
            </div>
          </div>
          <SkeletonRow variant="poster" count={9} />
          <SkeletonRow variant="landscape" count={5} />
        </Section>

        <Section title="Boş durum, hata, katmanlar">
          <EmptyHint action={<TextButton to="/_tasarim">Keşfet</TextButton>}>Listende henüz bir şey yok.</EmptyHint>
          <ErrorState onRetry={() => toast('Yeniden deneniyor')} />
          <ErrorState
            size="page"
            title="Bu sayfa açılamadı"
            message="Biraz sonra yeniden dene."
            onRetry={() => toast('Yeniden deneniyor')}
          />
          <div className="tvp-gal__wrap cn-pad-x">
            <Button variant="secondary" onClick={() => setSheet(true)}>
              Alt sayfayı aç
            </Button>
            <Button variant="secondary" onClick={() => toast('Listene eklendi', { kind: 'ok' })}>
              Onay bildirimi
            </Button>
            <Button variant="secondary" onClick={() => toast('Bağlantı kurulamadı. Tekrar dene.')}>
              Bilgi bildirimi
            </Button>
          </div>
          <Sheet
            open={sheet}
            onClose={() => setSheet(false)}
            title="Bu içerik Sinema Paketi ile izlenir"
            actions={
              <>
                <Button onClick={() => setSheet(false)}>Paketi ekle</Button>
                <Button variant="secondary" onClick={() => setSheet(false)}>
                  Paketimde benzerleri
                </Button>
              </>
            }
          >
            <p className="cn-body">
              Paketi ekleyince bu film ve 300'den fazla başlık hemen açılır. İstediğin zaman çıkarabilirsin.
            </p>
          </Sheet>
        </Section>

        <Section title="Zaman biçimi" note="24 saat · Türkiye saati · geri sayım yalnız son 60 dakikada">
          <dl className="tvp-gal__times cn-pad-x">
            <dt>formatClock</dt>
            <dd>{formatClock(now)}</dd>
            <dt>formatTimeRange</dt>
            <dd>{formatTimeRange(long.start, long.end)}</dd>
            <dt>formatRemaining (25 dk)</dt>
            <dd>{formatRemaining(ending.end, now)}</dd>
            <dt>formatRemaining (95 dk)</dt>
            <dd>{String(formatRemaining(long.end, now))}</dd>
            <dt>formatLiveLine</dt>
            <dd>{formatLiveLine(ending.start, ending.end, now)}</dd>
            <dt>formatDayTime</dt>
            <dd>{[-1, 0, 1, 3, 10].map((d) => formatDayTime(now + d * 86_400_000, now)).join(' · ')}</dd>
            <dt>weekdayShort</dt>
            <dd>{Array.from({ length: 7 }, (_, d) => weekdayShort(now + d * 86_400_000)).join(' ')}</dd>
          </dl>
        </Section>

        <p className="cn-meta cn-gutter-x">
          <Link to="/">Uygulamaya dön</Link>
        </p>
      </div>
    </div>
  )
}

/**
 * Tasarım sistemi galerisi (#/_ui) — her bileşen, durumlarıyla. Görsel QA yüzeyi: masaüstü (1440) ve mobil (390/360)
 * genişlikte açılır; profil seçiliyse ana sayfanın gerçek görselleri kullanılır. Kabuk örneği: #/_ui/kabuk.
 */
import { useState, type ReactElement, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useFormFactor } from '../lib/formFactor'
import { formatEpisodeCode, formatTimeLeft, joinDot } from './format'
import {
  AdvisoryBadge,
  Avatar,
  Badge,
  Billboard,
  BillboardImage,
  BillboardInfo,
  BillboardSide,
  Button,
  ButtonLink,
  Dropdown,
  EmptyState,
  ErrorState,
  Icon,
  ICON_NAMES,
  IconButton,
  LiveTag,
  Logo,
  Menu,
  MenuItem,
  MenuSeparator,
  MobileHero,
  Modal,
  Pill,
  PillBar,
  PillClear,
  PinInput,
  PosterCard,
  ProgressBar,
  RoundButton,
  Sheet,
  SkeletonBillboard,
  SkeletonGrid,
  SkeletonSlider,
  SkeletonText,
  Slider,
  Spinner,
  Switch,
  Tabs,
  TextField,
  TitleCard,
  toast,
  Tooltip,
  TopTenLine,
} from './index'
import { uniqueTitles, useSampleRows, type SampleTitle } from './gallery/sampleData'
import './gallery/gallery.css'

const SECTIONS = [
  ['renkler', 'Renkler'],
  ['yazi', 'Yazı'],
  ['ikonlar', 'İkonlar'],
  ['dugmeler', 'Düğmeler'],
  ['gostergeler', 'Göstergeler'],
  ['kartlar', 'Kartlar'],
  ['satirlar', 'Satırlar'],
  ['vitrin', 'Vitrin'],
  ['katmanlar', 'Katmanlar'],
  ['denetimler', 'Denetimler'],
  ['durumlar', 'Durumlar'],
] as const

const TOKENS = [
  '--bg',
  '--surface-1',
  '--surface-2',
  '--surface-3',
  '--text-1',
  '--text-2',
  '--text-3',
  '--text-4',
  '--accent',
  '--btn-2',
  '--live',
  '--positive',
]

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }): ReactElement {
  return (
    <section className="gl-section" id={`gl-${id}`} aria-labelledby={`gl-${id}-t`}>
      <h2 className="gl-section__title ui-gutter" id={`gl-${id}-t`}>
        {title}
      </h2>
      {children}
    </section>
  )
}

function Row({ label, children }: { label?: string; children: ReactNode }): ReactElement {
  return (
    <div className="gl-row ui-gutter">
      {label && <span className="gl-row__label">{label}</span>}
      <div className="gl-row__items">{children}</div>
    </div>
  )
}

/** "S1:B3 · 23 dk kaldı" örneği */
const cwCaption = (i: number) => joinDot([formatEpisodeCode(1, i + 1), formatTimeLeft((12 + i * 7) * 60)])

export function UiGallery(): ReactElement {
  const ff = useFormFactor()
  const { rows, real, loading } = useSampleRows()
  const titles = uniqueTitles(rows)
  const hero: SampleTitle | undefined = titles[0]
  const [modal, setModal] = useState(false)
  const [sheet, setSheet] = useState(false)
  const [muted, setMuted] = useState(true)
  const [tab, setTab] = useState('bolumler')
  const [pill, setPill] = useState<string | null>(null)
  const [name, setName] = useState('Deniz')
  const [pin, setPin] = useState('12')
  const [kids, setKids] = useState(false)
  const [liked, setLiked] = useState(false)
  const [listed, setListed] = useState(true)

  return (
    <div className="gl-page">
      <header className="gl-head ui-gutter">
        <Logo height={26} />
        <h1 className="gl-head__title">Tasarım sistemi v2</h1>
        <span className="ui-meta">
          {ff} · {real ? 'gerçek görseller' : loading ? 'görseller yükleniyor' : 'görselsiz örnek'}
        </span>
        <Link to="/_ui/kabuk" className="gl-head__link">
          Kabuk örneği
        </Link>
      </header>
      <nav className="gl-toc ui-gutter" aria-label="Bölümler">
        {SECTIONS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => document.getElementById(`gl-${id}`)?.scrollIntoView({ behavior: 'smooth' })}
          >
            {label}
          </button>
        ))}
      </nav>

      <Section id="renkler" title="Renkler">
        <div className="gl-swatches ui-gutter">
          {TOKENS.map((t) => (
            <div key={t} className="gl-swatch">
              <span style={{ background: `var(${t})` }} />
              <code>{t}</code>
            </div>
          ))}
        </div>
      </Section>

      <Section id="yazi" title="Yazı">
        <div className="ui-gutter gl-type">
          <p className="ui-hero-title">Vitrin başlığı</p>
          <p className="ui-page-title">Sayfa başlığı · Diziler</p>
          <p className="ui-row-title">Satır başlığı · İzlemeye Devam Et</p>
          <p className="ui-body">
            Gövde: Genç bir kadın, yaralı bir ejderha yavrusunu iyileştirir ve onu kaybedince aramaya çıkar.
          </p>
          <p className="ui-meta">
            <span className="ui-new">Yeni</span> · 2024 · 2 Sezon · HD
          </p>
          <ul className="ui-dotted ui-meta">
            <li>Gerilim</li>
            <li>Karanlık</li>
            <li>Dram</li>
          </ul>
          <p className="ui-caption">Altyazı · en küçük yazı 11 px yalnız rozetlerde</p>
        </div>
      </Section>

      <Section id="ikonlar" title="İkonlar">
        <ul className="gl-icons ui-gutter">
          {ICON_NAMES.map((n) => (
            <li key={n}>
              <Icon name={n} size={28} />
              <code>{n}</code>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="dugmeler" title="Düğmeler">
        <Row label="lg (vitrin)">
          <Button variant="play" size="lg" icon="play">
            Oynat
          </Button>
          <Button variant="secondary" size="lg" icon="info">
            Daha Fazla Bilgi
          </Button>
        </Row>
        <Row label="md">
          <Button variant="play" icon="play">
            Devam Et
          </Button>
          <Button icon="startOver">Baştan Başlat</Button>
          <Button variant="outline">Profilleri Yönet</Button>
          <Button variant="ghost" icon="share">
            Paylaş
          </Button>
          <Button variant="accent">Demo hesabıyla devam et</Button>
        </Row>
        <Row label="sm · durum">
          <Button variant="play" size="sm" icon="play">
            Canlı İzle
          </Button>
          <Button size="sm" busy>
            Kaydet
          </Button>
          <Button size="sm" disabled>
            Devre dışı
          </Button>
          <Button variant="outline" size="sm" aria-pressed>
            Seçili
          </Button>
          <ButtonLink to="/_ui/kabuk" size="sm" icon="chevronRight">
            Bağlantı düğmesi
          </ButtonLink>
        </Row>
        <Row label="yuvarlak">
          <RoundButton variant="play" icon="play" label="Oynat" />
          <Tooltip label={listed ? 'Listemden Çıkar' : 'Listeme Ekle'}>
            <RoundButton
              icon={listed ? 'check' : 'plus'}
              label={listed ? 'Listemde' : 'Listeme Ekle'}
              aria-pressed={listed}
              onClick={() => setListed((v) => !v)}
            />
          </Tooltip>
          <Tooltip label="Beğen">
            <RoundButton icon="thumbsUp" label="Beğen" aria-pressed={liked} onClick={() => setLiked((v) => !v)} />
          </Tooltip>
          <RoundButton icon="chevronDown" label="Daha fazla bilgi" />
          <RoundButton icon="close" label="Kapat" variant="solid" />
          <RoundButton icon="play" label="Oynat (bağlantı)" variant="play" to="/_ui/kabuk" />
          <RoundButton icon="star" label="Kanallarıma ekle" />
          <RoundButton icon="starFilled" label="Kanallarımda" aria-pressed />
          <RoundButton icon="cast" label="TV'de İzle" size="sm" />
          <RoundButton icon="volume" label="Sesi kapat" size="lg" />
        </Row>
        <Row label="yalın simge">
          <IconButton icon="search" label="Ara" />
          <IconButton icon="cast" label="TV'de İzle" />
          <IconButton icon="bell" label="Bildirimler" />
          <IconButton icon="more" label="Daha fazla" />
        </Row>
      </Section>

      <Section id="gostergeler" title="Göstergeler">
        <Row label="rozet">
          <Badge>Yeni</Badge>
          <Badge>Yeni Bölüm</Badge>
          <Badge>Son 3 Gün</Badge>
          <Badge tone="neutral">Yakında</Badge>
          <Badge tone="lock" />
          <Badge tone="lock">Pakette yok</Badge>
          <Badge tone="top10" />
          <LiveTag />
        </Row>
        <Row label="yaş işareti">
          <AdvisoryBadge certification="Genel İzleyici" />
          <AdvisoryBadge certification="7+" />
          <AdvisoryBadge certification="13+" reasons={['Şiddet ve Korku']} showReasons />
          <AdvisoryBadge
            certification="18+"
            reasons={['Cinsellik', 'Olumsuz Örnek Oluşturabilecek Davranışlar']}
            showReasons
          />
        </Row>
        <Row label="ilerleme">
          <div className="gl-progress">
            <ProgressBar value={0.15} />
            <ProgressBar value={0.62} />
            <ProgressBar value={0.4} tone="live" label="Yayın ilerlemesi" />
          </div>
        </Row>
        <Row label="avatar · yükleniyor">
          <Avatar src="/brand/avatar-1.png" name="Deniz" size={32} />
          <Avatar src="/brand/avatar-2.png" name="Çocuk" size={48} />
          <Avatar name="Ayşe" size={48} />
          <Avatar name="Mert" size={32} />
          <Spinner size={32} />
        </Row>
      </Section>

      <Section id="kartlar" title="Kartlar">
        <div className="gl-cards ui-gutter">
          {titles.slice(0, 1).map((t) => (
            <TitleCard key="plain" title={t.title} image={t.storyArt} to="/_ui" />
          ))}
          {titles.slice(1, 2).map((t) => (
            <TitleCard
              key="badge"
              title={t.title}
              image={t.storyArt}
              badge={<Badge>Yeni Bölüm</Badge>}
              onClick={() => {}}
            />
          ))}
          {titles.slice(2, 3).map((t) => (
            <TitleCard
              key="cw"
              title={t.title}
              image={t.storyArt}
              progress={0.42}
              caption={cwCaption(2)}
              onClick={() => {}}
            />
          ))}
          {titles.slice(3, 4).map((t) => (
            <TitleCard
              key="live"
              title={t.title}
              image={t.storyArt}
              channelLogo="/brand/logo.png"
              channelName="TV+"
              progress={0.7}
              caption="20:00–23:15 · 42 dk kaldı"
              onClick={() => {}}
            />
          ))}
          <TitleCard title="Görseli olmayan başlık" image={null} badge={<Badge tone="lock">Pakette yok</Badge>} />
          {titles.slice(4, 5).map((t) => (
            <TitleCard key="title" title={t.title} image={t.storyArt} showTitle />
          ))}
        </div>
        <div className="gl-posters ui-gutter">
          {titles.slice(0, 3).map((t, i) => (
            <PosterCard
              key={t.id}
              title={t.title}
              image={t.boxart}
              badge={i === 0 ? <Badge>Yeni</Badge> : undefined}
              onClick={() => {}}
            />
          ))}
          {titles.slice(3, 4).map((t) => (
            <PosterCard
              key="cw"
              title={t.title}
              image={t.boxart}
              progress={0.35}
              actions={
                <>
                  <button type="button" aria-label="Bilgi">
                    <Icon name="info" size={20} />
                  </button>
                  <button type="button" aria-label="Daha fazla">
                    <Icon name="more" size={20} />
                  </button>
                </>
              }
            />
          ))}
        </div>
        <div className="gl-ranked ui-gutter">
          {titles.slice(0, 2).map((t, i) => (
            <PosterCard key={t.id} title={t.title} image={t.boxart} rank={i === 0 ? 1 : 10} onClick={() => {}} />
          ))}
        </div>
      </Section>

      <Section id="satirlar" title="Satırlar">
        {rows.slice(0, 3).map((r, ri) => (
          <div key={r.name} className="gl-slider">
            <Slider
              title={r.name}
              moreHref="/_ui"
              items={r.items}
              getKey={(t) => t.id}
              renderItem={(t, ctx) =>
                ctx.mobile ? (
                  <PosterCard
                    title={t.title}
                    image={t.boxart}
                    tabIndex={ctx.tabIndex}
                    progress={ri === 1 ? 0.3 + (ctx.index % 5) * 0.12 : undefined}
                    onClick={() => {}}
                  />
                ) : (
                  <TitleCard
                    title={t.title}
                    image={t.storyArt}
                    tabIndex={ctx.tabIndex}
                    progress={ri === 1 ? 0.3 + (ctx.index % 5) * 0.12 : undefined}
                    caption={ri === 1 ? cwCaption(ctx.index) : undefined}
                    badge={ri === 0 && ctx.index === 1 ? <Badge>Yeni Bölüm</Badge> : undefined}
                    onClick={() => {}}
                  />
                )
              }
            />
          </div>
        ))}
        <div className="gl-slider">
          <Slider
            title="Türkiye'de Bugünün Top 10 Dizi Listesi"
            items={titles.slice(0, 10)}
            getKey={(t) => t.id}
            mobileItemWidth={170}
            renderItem={(t, ctx) => (
              <PosterCard
                title={t.title}
                image={t.boxart}
                rank={ctx.index + 1}
                tabIndex={ctx.tabIndex}
                onClick={() => {}}
              />
            )}
          />
        </div>
      </Section>

      <Section id="vitrin" title="Vitrin">
        {hero && (
          <>
            <div className="gl-billboard">
              <Billboard
                media={<BillboardImage src={hero.billboardArt ?? hero.storyArt} />}
                side={
                  <BillboardSide
                    muted={muted}
                    onToggleMute={() => setMuted((m) => !m)}
                    certification={hero.certification}
                  />
                }
              >
                <BillboardInfo
                  logo={hero.titleLogo}
                  title={hero.title}
                  synopsis={hero.synopsis}
                  topTen={<TopTenLine rank={3} category="Dizilerde" />}
                  actions={
                    <>
                      <Button variant="play" size="lg" icon="play">
                        Oynat
                      </Button>
                      <Button size="lg" icon="info">
                        Daha Fazla Bilgi
                      </Button>
                    </>
                  }
                />
              </Billboard>
            </div>
            <div className="gl-mhero">
              <MobileHero
                image={hero.boxart}
                title={hero.title}
                logo={hero.titleLogo}
                showTitle={false}
                tags={hero.tags.length ? hero.tags.slice(0, 3) : ['Gerilim', 'Karanlık', 'Dram']}
                tint="#4a3a1a"
                actions={
                  <>
                    <Button variant="play" icon="play" block>
                      Oynat
                    </Button>
                    <Button icon="plus" block>
                      Listem
                    </Button>
                  </>
                }
              />
            </div>
          </>
        )}
      </Section>

      <Section id="katmanlar" title="Katmanlar">
        <Row>
          <Button onClick={() => setModal(true)} className="gl-open-modal">
            Detay penceresini aç
          </Button>
          <Button onClick={() => setSheet(true)} className="gl-open-sheet">
            Alt sayfayı aç
          </Button>
          <Button onClick={() => toast('Listene eklendi', { kind: 'success' })}>Kısa bildirim</Button>
          <Button onClick={() => toast('Listenden çıkarıldı', { action: { label: 'Geri al', onClick: () => {} } })}>
            Eylemli bildirim
          </Button>
        </Row>
        <Row label="menü">
          <Menu
            label="Örnek menü"
            align="start"
            trigger={({ 'data-open': _o, ...p }) => (
              <button {...p} className="gl-menu-trigger">
                <Avatar src="/brand/avatar-1.png" name="Deniz" size={32} />
                <Icon name="caret" size={18} />
              </button>
            )}
            footer={<MenuItem footer>Çıkış</MenuItem>}
          >
            <MenuItem leading={<Avatar src="/brand/avatar-2.png" name="Çocuk" size={32} />}>Çocuk</MenuItem>
            <MenuSeparator />
            <MenuItem icon="edit">Profilleri Yönet</MenuItem>
            <MenuItem icon="tv">Cihazlar</MenuItem>
          </Menu>
          <Dropdown label="Türler">
            {['Aksiyon', 'Animasyon', 'Belgesel', 'Bilim Kurgu', 'Dram', 'Gerilim', 'Komedi', 'Korku', 'Romantik'].map(
              (g) => (
                <MenuItem key={g}>{g}</MenuItem>
              ),
            )}
          </Dropdown>
        </Row>
      </Section>

      <Section id="denetimler" title="Denetimler">
        <div className="ui-gutter gl-controls">
          <Tabs
            label="Detay sekmeleri"
            value={tab}
            onChange={setTab}
            items={[
              { id: 'bolumler', label: 'Bölümler' },
              { id: 'benzerleri', label: 'Benzerleri' },
              { id: 'fragmanlar', label: 'Fragmanlar' },
            ]}
          />
        </div>
        <PillBar>
          {pill && <PillClear onClick={() => setPill(null)} />}
          {(pill ? [pill] : ['Diziler', 'Filmler', 'Canlı TV']).map((p) => (
            <Pill key={p} selected={pill === p} onClick={() => setPill(p)}>
              {p}
            </Pill>
          ))}
          <Pill caret>Kategoriler</Pill>
        </PillBar>
        <div className="ui-gutter gl-controls gl-form">
          <TextField label="Profil adı" value={name} onChange={setName} />
          <TextField label="Hatalı alan" value="" onChange={() => {}} error="Bir ad yaz." placeholder="Ad" />
          <Switch
            label="Çocuk profili"
            description="Yalnız çocuklara uygun içerik görünür."
            checked={kids}
            onChange={setKids}
          />
          <div className="gl-pins">
            <PinInput value={pin} onChange={setPin} />
            <PinInput value="" onChange={() => {}} error label="Hatalı PIN örneği" />
          </div>
        </div>
      </Section>

      <Section id="durumlar" title="İskeletler ve durumlar">
        <div className="gl-skel-billboard">
          <SkeletonBillboard />
        </div>
        <SkeletonSlider />
        <SkeletonGrid count={6} />
        <div className="ui-gutter gl-controls">
          <SkeletonText lines={3} />
        </div>
        <EmptyState
          icon="plus"
          title="Listen boş"
          message="Beğendiğin başlıkları ＋ ile buraya ekle."
          action={
            <ButtonLink variant="play" size="sm" to="/goz-at">
              Göz At
            </ButtonLink>
          }
        />
        <ErrorState title="Bu satır yüklenemedi" message="Biraz sonra yeniden dene." onRetry={() => {}} />
      </Section>

      <Modal open={modal} onClose={() => setModal(false)} label={hero?.title ?? 'Detay'}>
        <div className="gl-modal-hero">
          {hero?.storyArt && <img src={hero.billboardArt ?? hero.storyArt} alt="" />}
          <div className="gl-modal-hero__info">
            <h2 className="ui-hero-title">{hero?.title}</h2>
            <div className="gl-row__items">
              <Button variant="play" icon="play">
                Oynat
              </Button>
              <RoundButton icon="plus" label="Listeme Ekle" />
              <RoundButton icon="thumbsUp" label="Beğen" />
            </div>
          </div>
        </div>
        <div className="gl-modal-body">
          <div>
            <p className="ui-meta">
              <span className="ui-new">Yeni</span> · {hero?.year} · {hero?.runtime} · HD
            </p>
            <AdvisoryBadge certification={hero?.certification ?? '13+'} reasons={hero?.reasons} showReasons />
            <p className="ui-body">{hero?.synopsis}</p>
          </div>
          <div className="ui-meta">
            <p>
              <span className="gl-dim">Türler:</span> {hero?.tags.join(', ')}
            </p>
          </div>
        </div>
        <div className="gl-modal-body">
          <SkeletonText lines={8} />
        </div>
      </Modal>
      <Sheet
        open={sheet}
        onClose={() => setSheet(false)}
        title="Sezon seç"
        actions={
          <>
            <Button variant="play" onClick={() => setSheet(false)}>
              Tamam
            </Button>
            <Button onClick={() => setSheet(false)}>Vazgeç</Button>
          </>
        }
      >
        <ul className="gl-sheet-list">
          {['Sezon 1', 'Sezon 2', 'Sezon 3'].map((s, i) => (
            <li key={s}>
              <button type="button" aria-current={i === 0 || undefined} onClick={() => setSheet(false)}>
                {s}
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    </div>
  )
}

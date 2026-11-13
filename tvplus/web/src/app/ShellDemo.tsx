/**
 * Kabuk örneği (#/_ui/kabuk) — sayfa ekipleri için başvuru düzeni: vitrinle başlayan sayfa (üst menü vitrinin
 * üstüne biner), mobilde hap sırası ve vitrin kartı, ardından satırlar (vitrinin altına binen). Kartlar
 * `titleHref()` ile detaya gider (masaüstünde ?jbv= penceresi, mobilde /baslik/:id). Gerçek görseller ana sayfa
 * lolomo'sundan gelir (ui/gallery/sampleData).
 */
import { useEffect, useState, type ReactElement } from 'react'
import { useFormFactor } from '../lib/formFactor'
import {
  Badge,
  Billboard,
  BillboardImage,
  BillboardInfo,
  BillboardSide,
  Button,
  ButtonLink,
  formatEpisodeCode,
  formatTimeLeft,
  joinDot,
  MobileHero,
  Pill,
  PillClear,
  PosterCard,
  SkeletonBillboard,
  Slider,
  TitleCard,
  TopTenLine,
} from '../ui'
import { uniqueTitles, useSampleRows } from '../ui/gallery/sampleData'
import { useDetailModal } from './detailModal'
import { useTitleHref } from './links'
import { ShellPills, useShellOptions } from './shellContext'

/** Görsel QA: tarayıcı testlerinin pencere içi başlık geçişini (switchTo) denemesi için `window.__tvpDetailSwitch`. */
function DetailSwitchProbe(): null {
  const { switchTo } = useDetailModal()
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>
    w.__tvpDetailSwitch = switchTo
    return () => {
      delete w.__tvpDetailSwitch
    }
  }, [switchTo])
  return null
}

export function ShellDemoPage(): ReactElement {
  useShellOptions({ fullBleed: true })
  const mobile = useFormFactor() === 'mobile'
  const href = useTitleHref()
  const { rows, loading } = useSampleRows()
  const titles = uniqueTitles(rows)
  const hero = titles[0]
  const [muted, setMuted] = useState(true)
  const [category, setCategory] = useState<string | null>(null)

  return (
    <div className="app-demo">
      <DetailSwitchProbe />
      <ShellPills>
        {category && <PillClear onClick={() => setCategory(null)} />}
        {(category ? [category] : ['Diziler', 'Filmler', 'Canlı TV']).map((c) => (
          <Pill key={c} selected={category === c} onClick={() => setCategory(c)}>
            {c}
          </Pill>
        ))}
        <Pill caret>Kategoriler</Pill>
      </ShellPills>

      {loading || !hero ? (
        <SkeletonBillboard />
      ) : mobile ? (
        <MobileHero
          image={hero.boxart}
          title={hero.title}
          logo={hero.titleLogo}
          showTitle={false}
          tags={hero.tags.slice(0, 3)}
          to={href(hero.id)}
          tint="#3d3420"
          actions={
            <>
              <ButtonLink variant="play" icon="play" block to={`/izle/${hero.id}`}>
                Oynat
              </ButtonLink>
              <Button icon="plus" block>
                Listem
              </Button>
            </>
          }
        />
      ) : (
        <Billboard
          media={<BillboardImage src={hero.billboardArt ?? hero.storyArt} />}
          side={
            <BillboardSide muted={muted} onToggleMute={() => setMuted((m) => !m)} certification={hero.certification} />
          }
        >
          <BillboardInfo
            logo={hero.titleLogo}
            title={hero.title}
            synopsis={hero.synopsis}
            topTen={<TopTenLine rank={2} category="Filmlerde" />}
            actions={
              <>
                <ButtonLink variant="play" size="lg" icon="play" to={`/izle/${hero.id}`}>
                  Oynat
                </ButtonLink>
                <ButtonLink size="lg" icon="info" to={href(hero.id)}>
                  Daha Fazla Bilgi
                </ButtonLink>
              </>
            }
          />
        </Billboard>
      )}

      <div className="ui-billboard-rows app-demo__rows">
        {rows.map((r, ri) => {
          const ranked = r.context.startsWith('top10')
          return (
            <Slider
              key={r.name}
              title={r.name}
              moreHref={ranked ? undefined : '/goz-at'}
              items={ranked ? r.items.slice(0, 10) : r.items}
              getKey={(t) => t.id}
              mobileItemWidth={ranked ? 170 : 110}
              renderItem={(t, ctx) =>
                ranked ? (
                  <PosterCard
                    title={t.title}
                    image={t.boxart}
                    rank={ctx.index + 1}
                    to={href(t.id)}
                    tabIndex={ctx.tabIndex}
                  />
                ) : ctx.mobile ? (
                  <PosterCard title={t.title} image={t.boxart} to={href(t.id)} tabIndex={ctx.tabIndex} />
                ) : (
                  <TitleCard
                    title={t.title}
                    image={t.storyArt}
                    to={href(t.id)}
                    tabIndex={ctx.tabIndex}
                    badge={ri === 2 && ctx.index === 2 ? <Badge>Yeni Bölüm</Badge> : undefined}
                    progress={ri === 2 ? 0.25 + (ctx.index % 4) * 0.15 : undefined}
                    caption={
                      ri === 2
                        ? joinDot([formatEpisodeCode(1, ctx.index + 1), formatTimeLeft(1380 - ctx.index * 120)])
                        : undefined
                    }
                  />
                )
              }
            />
          )
        })}
      </div>
    </div>
  )
}

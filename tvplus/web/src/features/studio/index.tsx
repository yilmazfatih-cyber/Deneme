/**
 * Stüdyo (#/studyo) — içerik zekâsı arka ofisinin penceresi (docs/ICERIK_ZEKASI.md; uçlar /api/studio/*).
 * Dışa aktarım adı SABİT: StudioPage. Masaüstü kabuğunun içinde çizilir; alt yolları kendisi yönetir:
 *   /studyo                 Genel Bakış (hat şeması + canlı sayılar)
 *   /studyo/tahmin          Tahmin Modeli (model kartı, değerlendirme, eğitim, simülatör)
 *   /studyo/etiketleme[/:id] Etiketleme masası
 *   /studyo/mikro-turler[/:id] Mikro tür gezgini
 *   /studyo/kaynaklar       Veri kaynakları ve Mixpanel
 *   /studyo/topluluklar     Zevk toplulukları
 *   /studyo/icgoruler       Katalog payı ↔ izlenme payı, zaman çizelgesi
 *   /studyo/planlayici      İçerik karması planlayıcısı
 *   /studyo/gomme           Çekim düzeyi gömme
 * Her bölüm kendi verisini yükler; servisi yoksa yalnız o bölüm "henüz hazır değil" der.
 */
import type { ReactElement, ReactNode } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { useDocumentTitle } from '../../app'
import { useMediaQuery } from '../../ui'
import { CommunitiesSection } from './Communities'
import { EmbeddingsSection } from './Embeddings'
import { InsightsSection } from './Insights'
import { MicrogenresSection } from './Microgenres'
import { ModelSection } from './Model'
import { OverviewSection } from './Overview'
import { PlannerSection } from './Planner'
import { SectionBoundary } from './parts'
import { SourcesSection } from './Sources'
import { TaggingSection } from './Tagging'
import './studio.css'

export const STUDIO_SECTIONS = [
  { path: '', label: 'Genel Bakış', title: 'Stüdyo' },
  { path: 'tahmin', label: 'Tahmin Modeli', title: 'Tahmin Modeli' },
  { path: 'etiketleme', label: 'Etiketleme', title: 'Etiketleme' },
  { path: 'mikro-turler', label: 'Mikro Türler', title: 'Mikro Türler' },
  { path: 'kaynaklar', label: 'Veri Kaynakları', title: 'Veri Kaynakları' },
  { path: 'topluluklar', label: 'Zevk Toplulukları', title: 'Zevk Toplulukları' },
  { path: 'icgoruler', label: 'İçgörüler', title: 'İçgörüler' },
  { path: 'planlayici', label: 'Planlayıcı', title: 'Planlayıcı' },
  { path: 'gomme', label: 'Gömme', title: 'Gömme' },
] as const

export const studioHref = (path: string): string => (path ? `/studyo/${path}` : '/studyo')

function Frame({ title, children }: { title: string; children: ReactNode }): ReactElement {
  useDocumentTitle(title === 'Stüdyo' ? 'Stüdyo' : `${title} · Stüdyo`)
  return <SectionBoundary name={title}>{children}</SectionBoundary>
}

export function StudioPage(): ReactElement {
  const wide = useMediaQuery('(min-width: 1100px)')
  return (
    <div className="st-root">
      {!wide && (
        <p className="st-narrow" role="note">
          Stüdyo bir masaüstü aracıdır. En az 1100 piksel genişlikte rahat okunur.
        </p>
      )}
      <nav className="st-nav" aria-label="Stüdyo bölümleri">
        <p className="st-nav__brand">
          Stüdyo <span className="st-dim">· arka ofis</span>
        </p>
        <ul>
          {STUDIO_SECTIONS.map((s) => (
            <li key={s.path}>
              <NavLink
                to={studioHref(s.path)}
                end={s.path === ''}
                className={({ isActive }) => (isActive ? 'st-nav__link is-active' : 'st-nav__link')}
              >
                {s.label}
              </NavLink>
            </li>
          ))}
        </ul>
        <p className="ui-caption st-nav__foot">İç araç. Örnek ve sentetik veriler her yerde öyle etiketlenir.</p>
      </nav>
      <div className="st-content">
        <Routes>
          <Route
            index
            element={
              <Frame title="Stüdyo">
                <OverviewSection />
              </Frame>
            }
          />
          <Route
            path="tahmin/*"
            element={
              <Frame title="Tahmin Modeli">
                <ModelSection />
              </Frame>
            }
          />
          <Route
            path="etiketleme/:titleId?"
            element={
              <Frame title="Etiketleme">
                <TaggingSection />
              </Frame>
            }
          />
          <Route
            path="mikro-turler/:id?"
            element={
              <Frame title="Mikro Türler">
                <MicrogenresSection />
              </Frame>
            }
          />
          <Route
            path="kaynaklar"
            element={
              <Frame title="Veri Kaynakları">
                <SourcesSection />
              </Frame>
            }
          />
          <Route
            path="topluluklar"
            element={
              <Frame title="Zevk Toplulukları">
                <CommunitiesSection />
              </Frame>
            }
          />
          <Route
            path="icgoruler"
            element={
              <Frame title="İçgörüler">
                <InsightsSection />
              </Frame>
            }
          />
          <Route
            path="planlayici"
            element={
              <Frame title="Planlayıcı">
                <PlannerSection />
              </Frame>
            }
          />
          <Route
            path="gomme"
            element={
              <Frame title="Gömme">
                <EmbeddingsSection />
              </Frame>
            }
          />
          <Route path="*" element={<Navigate to="/studyo" replace />} />
        </Routes>
      </div>
    </div>
  )
}

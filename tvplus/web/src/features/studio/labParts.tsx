/**
 * Laboratuvar sayfalarının ortak parçaları (uçlar /api/studio/lab*; sözleşme shared/lab.ts):
 *   useLabIndex / hasResult — hangi sonuçlar var
 *   LabEmpty                — hiç sonuç yokken: sonuçların terminalden nasıl üretileceği (durağan derlemede: yok)
 *   LabHint / Cmd           — eksik tek bir sonuç için kısa yönlendirme, terminal komutu
 *   DataLine                — veri penceresi, kullanıcı sayısı, "SENTETİK DEMO VERİSİ" ve "eski veri" etiketleri
 * Sayfalar salt okunurdur: sonuçlar yalnız toplam içerir, burada hiçbir şey çalıştırılmaz.
 */
import type { ReactElement, ReactNode } from 'react'
import type { LabDataStatus, LabIndex } from '../../../../shared/lab'
import { isStaticHost } from '../../lib/assetBase'
import { useStudio, type Resource } from './api'
import { fmtDateTime, fmtInt, fmtPct } from './format'
import { fmtDay } from './labScales'
import { Chip, NotReady, Panel } from './parts'

export function useLabIndex(): Resource<LabIndex> {
  return useStudio<LabIndex>('/lab')
}

export const hasResult = (index: LabIndex | undefined, name: string): boolean =>
  !!index?.results.some((r) => r.name === name)

/** Terminal komutu (tek satır, kopyalanabilir metin) */
export function Cmd({ children }: { children: ReactNode }): ReactElement {
  return <code className="st-cmd">{children}</code>
}

/** Sentetik demo verisiyle üretilmiş her sonucun yanında durur. */
export function SyntheticDemoBadge({ show = true }: { show?: boolean }): ReactElement | null {
  if (!show) return null
  return (
    <Chip tone="sample" title="Gerçek kullanıcı verisi değil: laboratuvarın ürettiği sentetik demo verisi">
      SENTETİK DEMO VERİSİ
    </Chip>
  )
}

/**
 * Sonuç, şimdiki veriden eski bir veri sürümüyle üretildiyse uyarır (veri yeniden kurulmuş, analiz yeniden
 * çalıştırılmamış). İki sürümden biri bilinmiyorsa bir şey göstermez.
 */
export function StaleChip({
  resultRev,
  currentRev,
}: {
  resultRev: string | null | undefined
  currentRev: string | null | undefined
}): ReactElement | null {
  if (!resultRev || !currentRev || resultRev === currentRev) return null
  return (
    <Chip
      tone="warn"
      title={`Sonuç ${resultRev} veri sürümüyle üretildi; şimdiki veri sürümü ${currentRev}. Analizi yeniden çalıştırın.`}
    >
      Eski veri sürümü
    </Chip>
  )
}

/** Veri satırı: pencere · kullanıcı · olay · (örneklem) · analiz anı + etiketler */
export function DataLine({
  status,
  at,
  children,
}: {
  status: LabDataStatus | null | undefined
  /** Sonucun üretildiği an (ISO) */
  at?: string | null
  /** Ek etiketler (ör. eski veri sürümü) */
  children?: ReactNode
}): ReactElement {
  return (
    <p className="st-dataline">
      {status ? (
        <>
          <span>
            Veri: <strong>{fmtDay(status.from)}</strong> – <strong>{fmtDay(status.to)}</strong> ({fmtInt(status.days)}{' '}
            gün)
          </span>
          <span>{fmtInt(status.users)} kullanıcı</span>
          <span>{fmtInt(status.events)} olay</span>
          {status.sample < 1 && <span>kullanıcı örneklemi {fmtPct(status.sample, 0)}</span>}
        </>
      ) : (
        <span>Veri durumu bilinmiyor</span>
      )}
      {at && <span>analiz {fmtDateTime(at)}</span>}
      <SyntheticDemoBadge show={!!status?.synthetic} />
      {children}
    </p>
  )
}

/** Hiç laboratuvar sonucu yok: nasıl üretileceğini anlatır. Durağan derlemede laboratuvarın olmadığını söyler. */
export function LabEmpty({ onRetry }: { onRetry?: () => void }): ReactElement {
  if (isStaticHost())
    return (
      <NotReady
        title="Laboratuvar bu derlemede kullanılamıyor"
        detail={
          <>
            Bu sürüm sunucusuz çalışır (durağan barındırma); laboratuvar sonuçları ise yerel diskteki dosyalardan
            okunur. Görmek için uygulamayı kendi makinenizde sunucusuyla çalıştırın (<Cmd>npm run dev</Cmd>) ve
            laboratuvarı terminalden çalıştırın (<Cmd>npm run lab -- demo</Cmd>).
          </>
        }
      />
    )
  return (
    <Panel title="Henüz laboratuvar sonucu yok" id="lab-bos">
      <p className="ui-body">
        Bu sayfa, çevrimdışı analiz laboratuvarının yazdığı sonuçları gösterir. Sonuçlar terminalden üretilir;{' '}
        <Cmd>tvplus</Cmd> klasöründe:
      </p>
      <ol className="st-steps">
        <li>
          <span className="st-steps__what">Hızlı deneme — sentetik demo verisiyle tüm hat</span>
          <Cmd>npm run lab -- demo</Cmd>
        </li>
        <li>
          <span className="st-steps__what">
            Kendi veriniz — keşfet, içe al, tabloları kur, churn analizini çalıştır
          </span>
          <span className="st-steps__cmds">
            <Cmd>npm run lab -- kesif &lt;dosya&gt;</Cmd>
            <span aria-hidden="true">→</span>
            <Cmd>npm run lab -- al &lt;dosya&gt;</Cmd>
            <span aria-hidden="true">→</span>
            <Cmd>npm run lab -- kur</Cmd>
            <span aria-hidden="true">→</span>
            <Cmd>npm run lab -- churn</Cmd>
          </span>
        </li>
        <li>
          <span className="st-steps__what">Simülasyonun gerçeklik karnesi</span>
          <Cmd>npm run lab -- sim karne</Cmd>
        </li>
        <li>
          <span className="st-steps__what">Bir deneyi simülasyonda çalıştır</span>
          <Cmd>npm run lab -- deney calistir &lt;anahtar&gt;</Cmd>
        </li>
      </ol>
      <p className="ui-meta">
        Sıradaki adımı <Cmd>npm run lab -- durum</Cmd> söyler. Sonuçlar burada salt okunurdur ve yalnız toplamları
        içerir; kullanıcı düzeyinde veri gösterilmez.
      </p>
      {onRetry && (
        <p className="st-actions">
          <button type="button" className="st-link" onClick={onRetry}>
            Yeniden denetle
          </button>
        </p>
      )}
    </Panel>
  )
}

/** Tek bir sonuç eksik: ne olduğunu ve hangi komutla üretileceğini söyler. */
export function LabHint({ title, children }: { title: string; children: ReactNode }): ReactElement {
  return (
    <div className="st-notready" role="status">
      <p className="st-notready__title">{title}</p>
      <p className="ui-meta">{children}</p>
    </div>
  )
}

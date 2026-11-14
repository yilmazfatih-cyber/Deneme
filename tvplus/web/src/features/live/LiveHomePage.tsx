/**
 * Canlı TV ana sayfası (#/canli). Dışa aktarım adı SABİT; kabuk bu modülü tembel yükler.
 * Veri katmanı useLiveModel.ts'te (yetenek bildirimi, satır TTL'leri, sunucu saatine göre şimdi/sonraki);
 * masaüstü (LiveDesktop) ve mobil (LiveMobile) aynı modeli kendi düzeniyle çizer.
 */
import { useState, type ReactElement } from 'react'
import { useDocumentTitle, useShellOptions } from '../../app'
import { useFormFactor } from '../../lib/formFactor'
import { ErrorState, SkeletonBillboard, SkeletonSlider } from '../../ui'
import { LiveDesktop, type LiveHandlers } from './LiveDesktop'
import { LiveMobile } from './LiveMobile'
import { AccessSheet, AiringSheet, type AiringSheetTarget } from './shared'
import { useLiveModel } from './useLiveModel'
import './live.css'

export function LiveHomePage(): ReactElement {
  useDocumentTitle('Canlı TV')
  useShellOptions({ fullBleed: true, mobileTitle: 'Canlı TV' })
  const mobile = useFormFactor() === 'mobile'
  const { model, error, retry } = useLiveModel()
  const [airing, setAiring] = useState<AiringSheetTarget | null>(null)
  const [locked, setLocked] = useState<{ title: string; reason: string } | null>(null)
  const handlers: LiveHandlers = {
    openAiring: setAiring,
    openLocked: (title, reason) => setLocked({ title, reason }),
  }

  if (!model && error)
    return (
      <div className="lv-page lv-page--state">
        <ErrorState size="page" title="Canlı TV yüklenemedi" onRetry={retry} />
      </div>
    )
  if (!model)
    return (
      <div className="lv-page" role="status" aria-label="Yükleniyor">
        <SkeletonBillboard />
        <div className="ui-billboard-rows">
          <SkeletonSlider />
          <SkeletonSlider />
        </div>
      </div>
    )

  return (
    <>
      {mobile ? <LiveMobile model={model} handlers={handlers} /> : <LiveDesktop model={model} handlers={handlers} />}
      <AiringSheet target={airing} onClose={() => setAiring(null)} />
      <AccessSheet title={locked?.title ?? null} reason={locked?.reason ?? ''} onClose={() => setLocked(null)} />
    </>
  )
}

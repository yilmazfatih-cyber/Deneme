/**
 * Canlı TV, Rehber ve Arama'nın paylaştığı küçük parçalar: geniş ekran kancası, yayın alt sayfası
 * (durumuna göre tek birincil eylem) ve yetki alt sayfası ("pakette yok" tam ekran hata değildir).
 */
import { useSyncExternalStore, type ReactElement } from 'react'
import { useNavigate } from 'react-router-dom'
import { AccessLock, Button, ChannelTile, formatTimeRange, LiveTag, ProgressBar, Sheet, useNow, liveProgress, formatLiveLine } from '../../design'
import { logEvent } from '../../telemetry/logger'
import { airingAction } from './airing'
import type { AiringBriefData, AiringChannelData } from './types'
import './shared.css'

const WIDE = '(min-width: 900px)'

/** Web düzeni (≥ 900 px) mi. */
export function useWide(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(WIDE)
      m.addEventListener('change', cb)
      return () => m.removeEventListener('change', cb)
    },
    () => window.matchMedia(WIDE).matches,
    () => true,
  )
}

export interface AiringSheetTarget {
  airing: AiringBriefData
  channel: AiringChannelData
  /** Kartın konum izi (tctx), oynatmaya aynen taşınır */
  tctx?: string | null
  /** Kaynak yüzey (olay günlüğü): 'rehber' | 'canli' | 'arama' */
  surface: string
}

/** Yayın alt sayfası: başlık, kanal, saat aralığı, özet; duruma göre TEK birincil eylem. */
export function AiringSheet({ target, onClose }: { target: AiringSheetTarget | null; onClose: () => void }): ReactElement | null {
  const now = useNow()
  const navigate = useNavigate()
  if (!target) return null
  const { airing, channel, tctx, surface } = target
  const action = airingAction(airing, channel.channelId, now, tctx)
  const go = (to: string, label: string) => {
    logEvent('click', { surface, action: label, entityId: airing.unifiedEntityId }, tctx)
    onClose()
    navigate(to)
  }
  const actions =
    action.kind === 'live' ? (
      <>
        {action.secondary && (
          <Button variant="secondary" icon="restart" onClick={() => go(action.secondary!.to, 'bastan')}>
            {action.secondary.label}
          </Button>
        )}
        <Button icon="play" onClick={() => go(action.primary.to, 'canli')}>
          {action.primary.label}
        </Button>
      </>
    ) : action.kind === 'catchup' ? (
      <Button icon="play" onClick={() => go(action.primary.to, 'geri-al')}>
        {action.primary.label}
      </Button>
    ) : undefined

  return (
    <Sheet open onClose={onClose} title={airing.title} actions={actions} className="lv-airsheet">
      <div className="lv-airsheet__channel">
        <ChannelTile name={channel.name} logoUrl={channel.logo.url} size={40} />
        <span className="lv-airsheet__chtext">
          <span className="cn-card-title">{channel.name}</span>
          <span className="cn-meta">
            {action.kind === 'live' ? formatLiveLine(airing.startAt, airing.endAt, now) : formatTimeRange(airing.startAt, airing.endAt)}
          </span>
        </span>
        {action.kind === 'live' && <LiveTag />}
      </div>
      {action.kind === 'live' && <ProgressBar value={liveProgress(airing.startAt, airing.endAt, now)} label="Yayın ilerlemesi" className="lv-airsheet__progress" />}
      {airing.synopsis && <p className="cn-body lv-airsheet__synopsis">{airing.synopsis}</p>}
      {action.kind === 'catchup' && action.hint && <p className="cn-meta lv-airsheet__note">Geri izleme: {action.hint}</p>}
      {action.kind === 'ended' && <p className="lv-airsheet__line">{action.note}</p>}
      {action.kind === 'upcoming' && <p className="lv-airsheet__line">{action.note}</p>}
      {action.kind === 'upcoming' && action.lockReason && <AccessLock text={action.lockReason} />}
      {action.kind === 'locked' && <AccessLock text={action.reason} />}
      {channel.isSampleSchedule && <p className="cn-meta lv-airsheet__note">Örnek yayın akışı</p>}
    </Sheet>
  )
}

/** Yetki alt sayfası: kilitli kanal/yayına dokununca gerekçe (hata sayfası yok). */
export function AccessSheet({ title, reason, onClose }: { title: string | null; reason: string; onClose: () => void }): ReactElement | null {
  if (!title) return null
  return (
    <Sheet open onClose={onClose} title={title}>
      <AccessLock text={reason} />
      <p className="cn-body lv-airsheet__synopsis">Paketini değiştirince burada izleyebilirsin.</p>
    </Sheet>
  )
}

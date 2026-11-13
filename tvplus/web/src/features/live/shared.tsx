/**
 * Canlı TV, Rehber ve Arama'nın paylaştığı yayın penceresi.
 *   AiringSheet  Bir yayın için küçük pencere: masaüstünde `Modal` (Netflix detay penceresinin küçüğü), mobilde `Sheet`.
 *                Görsel, başlık, kanal + saat, özet, örnek akış etiketi ve duruma göre eylemler:
 *                yayında → "Canlı İzle" (+ "Baştan Başlat") + "TV'de İzle" · başlamamış → "Hatırlat" / "Hatırlatmayı
 *                Kaldır" · bitmiş → geri izleme açıksa "İzle", değilse yalnız not. Kilitliyse gerekçe (hata sayfası yok).
 *                Ayrıntılar (büyük görsel, güncel hatırlatma durumu) `GuideAiring` ile tamamlanır; gelene dek elde olanla çizer.
 *   AccessSheet  Kilitli kanala dokununca gerekçe.
 * Dışa aktarım adları Arama (features/search) tarafından da kullanılır: AiringSheet, AccessSheet, AiringSheetTarget.
 */
import { useId, useRef, type ReactElement } from 'react'
import { useGql } from '../../api/hooks'
import { useFormFactor } from '../../lib/formFactor'
import { logEvent } from '../../telemetry/logger'
import {
  Button,
  ButtonLink,
  cx,
  formatClock,
  formatDayTime,
  formatRemaining,
  formatTimeRange,
  joinDot,
  LiveTag,
  liveProgress,
  Modal,
  ProgressBar,
  Sheet,
  useMediaQuery,
  useNow,
} from '../../ui'
import { castChannel, rememberChannel, setReminder, useCastAvailable, useReminder } from './actions'
import { airingAction, packageLock } from './airing'
import { ChannelLogo, LockLine, SampleNote } from './parts'
import type { AiringBriefData, AiringChannelData, ArtworkData } from './types'
import './shared.css'

/** Web düzeni (≥ 900 px) mi. */
export function useWide(): boolean {
  return useMediaQuery('(min-width: 900px)')
}

export interface AiringSheetTarget {
  airing: AiringBriefData
  channel: AiringChannelData
  /** Kartın konum izi (tctx), oynatmaya aynen taşınır */
  tctx?: string | null
  /** Kaynak yüzey (olay günlüğü): 'rehber' | 'canli' | 'arama' */
  surface: string
}

interface GuideAiringData {
  airing:
    | (AiringBriefData & {
        art: ArtworkData | null
        channel: AiringChannelData & { categoryName: string }
      })
    | null
}

/** Pencerenin içeriği (Modal ve Sheet aynı gövdeyi kullanır). */
function AiringWindowBody({
  target,
  titleId,
  onClose,
  sheet,
}: {
  target: AiringSheetTarget
  titleId: string
  onClose: () => void
  sheet: boolean
}): ReactElement {
  const now = useNow()
  const castable = useCastAvailable()
  const { data } = useGql<GuideAiringData, { airingId: string }>(
    'GuideAiring',
    { airingId: target.airing.airingId },
    { ttlMs: 60_000 },
  )
  const detail = data?.airing ?? null
  const airing: AiringBriefData = detail ? { ...target.airing, ...detail } : target.airing
  const channel = target.channel
  const { tctx, surface } = target
  const action = airingAction(airing, channel.channelId, now, tctx)
  const reminder = useReminder(airing.airingId, airing.hasReminder)
  const art = detail?.art?.url ?? airing.art?.url ?? airing.card?.url ?? null
  const sample = channel.isSampleSchedule ?? detail?.channel.isSampleSchedule ?? false
  const live = action.kind === 'live'
  // Örnek akışlı kanalın görseli üretilmiş bir kapaktır (adı üzerinde yazılı): başlık görselin üstüne yazılmaz.
  const inline = sheet || sample

  const click = (name: string) =>
    logEvent('click', { surface, action: name, entityId: airing.unifiedEntityId, channelId: channel.channelId }, tctx)

  const actions: ReactElement[] = []
  if (action.kind === 'live') {
    actions.push(
      <ButtonLink
        key="canli"
        variant="play"
        icon="play"
        to={action.primary.to}
        onClick={() => {
          click('canli')
          rememberChannel(channel.channelId)
          onClose()
        }}
      >
        {action.primary.label}
      </ButtonLink>,
    )
    if (action.secondary)
      actions.push(
        <ButtonLink
          key="bastan"
          icon="startOver"
          to={action.secondary.to}
          onClick={() => {
            click('bastan')
            rememberChannel(channel.channelId)
            onClose()
          }}
        >
          {action.secondary.label}
        </ButtonLink>,
      )
    if (castable)
      actions.push(
        <Button
          key="tv"
          icon="cast"
          onClick={() => {
            castChannel({ channelId: channel.channelId, name: channel.name, programme: airing.title }, surface, tctx)
            onClose()
          }}
        >
          TV'de İzle
        </Button>,
      )
  } else if (action.kind === 'catchup') {
    actions.push(
      <ButtonLink key="izle" variant="play" icon="play" to={action.primary.to} onClick={() => click('geri-al')}>
        {action.primary.label}
      </ButtonLink>,
    )
  } else if (action.kind === 'upcoming' && !action.lockReason) {
    actions.push(
      <Button
        key="hatirlat"
        variant={reminder.on ? 'secondary' : 'play'}
        icon={reminder.on ? 'check' : 'bell'}
        aria-pressed={reminder.on}
        onClick={() => setReminder({ ...airing, hasReminder: airing.hasReminder }, surface, tctx)}
      >
        {reminder.on ? 'Hatırlatmayı Kaldır' : 'Hatırlat'}
      </Button>,
    )
  }

  const lock =
    action.kind === 'locked' ? action.reason : action.kind === 'upcoming' ? action.lockReason : packageLock(airing.access)
  const when = live
    ? joinDot([formatTimeRange(airing.startAt, airing.endAt), formatRemaining(airing.endAt, now)])
    : `${formatDayTime(airing.startAt, now)}–${formatClock(airing.endAt)}`

  return (
    <div className={cx('lv-win', sheet && 'lv-win--sheet', inline && 'lv-win--inline')}>
      <div className="lv-win__media">
        {art ? <img className="lv-win__img" src={art} alt="" /> : <span className="lv-win__img ui-art-fallback" />}
        <span className="lv-win__shade" aria-hidden="true" />
        <span className="lv-win__badges">
          <ChannelLogo url={channel.logo.url} name={channel.name} size={sheet ? 40 : 48} />
          {live && <LiveTag />}
        </span>
        {!inline && (
          <div className="lv-win__over">
            <h2 className="lv-win__title" id={titleId}>
              {airing.title}
            </h2>
            {actions.length > 0 && <div className="lv-win__actions">{actions}</div>}
          </div>
        )}
      </div>
      <div className="lv-win__body">
        {inline && (
          <h2 className="lv-win__title" id={titleId}>
            {airing.title}
          </h2>
        )}
        <p className="lv-win__meta">
          <strong>{channel.name}</strong>
          <span>Kanal {channel.number}</span>
          <span>{when}</span>
        </p>
        {live && (
          <ProgressBar
            value={liveProgress(airing.startAt, airing.endAt, now)}
            label="Yayın ilerlemesi"
            className="lv-win__progress"
          />
        )}
        {inline && actions.length > 0 && (
          <div className={cx('lv-win__actions', sheet && 'lv-win__actions--sheet')}>{actions}</div>
        )}
        {action.kind === 'upcoming' && <p className="lv-win__note">{action.note}</p>}
        {action.kind === 'ended' && <p className="lv-win__note">{action.note}</p>}
        {action.kind === 'catchup' && action.hint && <p className="lv-win__note">Geri izleme: {action.hint}</p>}
        {lock && <LockLine text={lock} />}
        {airing.synopsis && <p className="lv-win__synopsis">{airing.synopsis}</p>}
        {sample && (
          <p className="lv-win__sample">
            <SampleNote /> Bu kanalın gerçek yayın akışı değildir.
          </p>
        )}
      </div>
    </div>
  )
}

/** Yayın penceresi: masaüstünde Modal, mobilde Sheet. `target` null iken kapalıdır. */
export function AiringSheet({
  target,
  onClose,
}: {
  target: AiringSheetTarget | null
  onClose: () => void
}): ReactElement | null {
  const mobile = useFormFactor() === 'mobile'
  const titleId = useId()
  // Kapanış animasyonu boyunca son içerik çizilmeye devam eder.
  const last = useRef<AiringSheetTarget | null>(null)
  if (target) last.current = target
  const shown = target ?? last.current
  if (!shown) return null
  const body = (
    <AiringWindowBody
      key={shown.airing.airingId}
      target={shown}
      titleId={titleId}
      onClose={onClose}
      sheet={mobile}
    />
  )
  if (mobile)
    return (
      <Sheet open={!!target} onClose={onClose} label={shown.airing.title} className="lv-winsheet">
        {body}
      </Sheet>
    )
  return (
    <Modal open={!!target} onClose={onClose} labelledBy={titleId} maxWidth={620} className="lv-winmodal">
      {body}
    </Modal>
  )
}

/** Yetki alt sayfası: kilitli kanala dokununca gerekçe (hata sayfası yok). */
export function AccessSheet({
  title,
  reason,
  onClose,
}: {
  title: string | null
  reason: string
  onClose: () => void
}): ReactElement | null {
  if (!title) return null
  return (
    <Sheet open onClose={onClose} title={title}>
      <div className="lv-win__body">
        <LockLine text={reason} />
        <p className="lv-win__synopsis">Paketini değiştirince burada izleyebilirsin.</p>
      </div>
    </Sheet>
  )
}

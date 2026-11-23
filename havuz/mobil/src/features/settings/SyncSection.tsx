/**
 * Ayarlar → Eşitleme: durum, bekleyen değişiklik, son eşitleme, son hata, "Şimdi eşitle"; sunucu yedeğe döndüyse
 * karar düğmeleri (buradakini gönder / sunucudakini al); sunucunun reddettiği değişikliklerin listesi.
 * Hesapsız kipte "veriler yalnız bu telefonda" bilgisi.
 *
 * Genişletme: yeni bir eşitleme bilgisi → `Row` ile bir satır ekleyin.
 */
import { StyleSheet, View } from 'react-native'
import { t } from '../../i18n/index.ts'
import { useClock } from '../../lib/clock.tsx'
import { formatRelative } from '../../lib/date.ts'
import { useSession, useSyncStatus } from '../../lib/session/context.ts'
import { useMetaOf, usePendingCountOf } from '../../lib/store/hooks.ts'
import type { LocalDb } from '../../lib/store/localDb.ts'
import { AppText, Banner, Button, Card, Heading, Icon, SPACE, useTheme } from '../../ui/index.ts'
import { SYNC_ICONS, syncLabel, syncViewOf } from './syncView.ts'

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <AppText tone="muted">{label}</AppText>
      <AppText weight="bold" style={styles.value}>
        {value}
      </AppText>
    </View>
  )
}

export function SyncSection({ db }: { db: LocalDb }) {
  const session = useSession()
  const status = useSyncStatus()
  const clock = useClock()
  const { colors } = useTheme()
  const pending = usePendingCountOf(db) ?? 0
  const lastSyncedAt = useMetaOf(db, 'lastSyncedAt')
  const rejections = useMetaOf(db, 'rejections') ?? []
  const workspaces = useMetaOf(db, 'workspaces') ?? []
  const resets = useMetaOf(db, 'resetWorkspaceIds') ?? []
  const state = session.state
  const engine = state.status === 'account' ? state.engine : null
  const view = syncViewOf(state, status, pending)

  if (state.status !== 'account') {
    return (
      <Card>
        <Heading level={2}>{t('settings.sync')}</Heading>
        <AppText tone="muted">{t('sync.localOnly')}</AppText>
      </Card>
    )
  }
  return (
    <Card>
      <Heading level={2}>{t('settings.sync')}</Heading>
      <View style={styles.state} accessibilityLiveRegion="polite">
        <Icon name={SYNC_ICONS[view]} color={colors.accentInk} />
        <AppText weight="bold">{syncLabel(view)}</AppText>
      </View>
      <Row label={t('sync.pending')} value={String(pending)} />
      <Row label={t('sync.last')} value={lastSyncedAt ? formatRelative(lastSyncedAt, clock.now()) : t('sync.never')} />
      {status.error ? <Banner tone="danger" message={status.error.message} /> : null}
      {status.blocked === 'upgrade' ? <Banner tone="warn" message={t('sync.upgrade')} /> : null}
      {resets.map((workspaceId) => (
        <View key={workspaceId} style={styles.reset}>
          <Banner
            tone="warn"
            message={t('sync.reset.message', {
              name: workspaces.find((workspace) => workspace.id === workspaceId)?.name ?? workspaceId,
            })}
          />
          <AppText size="small" tone="muted">
            {t('sync.reset.pushHint')}
          </AppText>
          <Button label={t('sync.reset.push')} onPress={() => void engine?.resolveReset(workspaceId, 'push')} />
          <AppText size="small" tone="muted">
            {t('sync.reset.pullHint')}
          </AppText>
          <Button
            label={t('sync.reset.pull')}
            variant="secondary"
            onPress={() => void engine?.resolveReset(workspaceId, 'pull')}
          />
        </View>
      ))}
      <Button
        label={t('sync.now')}
        icon="sync"
        variant="secondary"
        disabled={!engine}
        busy={status.phase === 'syncing'}
        onPress={() => void engine?.syncNow()}
      />
      {rejections.length > 0 ? (
        <View style={styles.rejections}>
          <AppText weight="bold">{t('sync.rejectedTitle')}</AppText>
          <AppText size="small" tone="muted">
            {t('sync.rejectedHint')}
          </AppText>
          {[...rejections].reverse().map((item) => (
            <AppText key={`${item.at}-${item.recordId}-${item.op}`} size="small">
              {t('sync.rejectedLine', { when: formatRelative(item.at, clock.now()), message: item.message })}
            </AppText>
          ))}
        </View>
      ) : null}
    </Card>
  )
}

const styles = StyleSheet.create({
  state: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: SPACE.md, flexWrap: 'wrap' },
  value: { flexShrink: 1, textAlign: 'right' },
  reset: { gap: SPACE.sm },
  rejections: { gap: SPACE.xs },
})

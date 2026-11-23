/**
 * Ayarlar → Hesap: hesapsızsa giriş/kayıt düğmeleri; hesaplıysa ad ve e-posta, oturum düştüyse "yeniden giriş",
 * çıkış (iki seçenek: veriyi bırak / bu telefondaki veriyi de sil) ve "Hesabımı sil" (mağaza kuralı: hesap açılabilen
 * uygulamada hesap uygulamanın içinden silinebilmeli; bkz. docs/YAYINLAMA.md).
 *
 * Genişletme: hesap için yeni bir işlem (ör. ad değiştir) → önce SessionApi'ye ekleyin, burada düğme açın.
 */
import { router } from 'expo-router'
import { t } from '../../i18n/index.ts'
import { errorMessage } from '../../lib/errors.ts'
import { useSession } from '../../lib/session/context.ts'
import { usePendingCountOf } from '../../lib/store/hooks.ts'
import type { LocalDb } from '../../lib/store/localDb.ts'
import { AppText, Banner, Button, Card, Heading, useConfirm, useToast } from '../../ui/index.ts'

export function AccountSection({ db }: { db: LocalDb }) {
  const session = useSession()
  const confirm = useConfirm()
  const toast = useToast()
  const pending = usePendingCountOf(db) ?? 0
  const state = session.state

  if (!session.apiEnabled) return null
  if (state.status !== 'account') {
    return (
      <Card>
        <Heading level={2}>{t('account.title')}</Heading>
        <AppText tone="muted">{t('account.guestHint')}</AppText>
        <Button label={t('welcome.register')} onPress={() => router.push('/register')} />
        <Button label={t('welcome.login')} variant="secondary" onPress={() => router.push('/login')} />
      </Card>
    )
  }

  const logout = async (deleteLocalData: boolean) => {
    const ok = await confirm(
      deleteLocalData
        ? {
            title: t('account.logoutDeleteTitle'),
            message:
              pending > 0 ? t('account.logoutDeletePending', { count: pending }) : t('account.logoutDeleteMessage'),
            confirmLabel: t('account.logoutDelete'),
            destructive: true,
          }
        : {
            title: t('account.logoutTitle'),
            message: pending > 0 ? t('account.logoutPending', { count: pending }) : t('account.logoutMessage'),
            confirmLabel: t('account.logout'),
          },
    )
    if (!ok) return
    try {
      await session.logout({ deleteLocalData })
      router.replace('/welcome')
    } catch (error) {
      toast.show({ message: errorMessage(error), tone: 'error' })
    }
  }

  return (
    <Card>
      <Heading level={2}>{t('account.title')}</Heading>
      <AppText weight="bold">{state.session.user.name}</AppText>
      <AppText tone="muted">{state.session.user.email}</AppText>
      {state.session.expired ? (
        <Banner
          tone="warn"
          message={t('account.expiredBanner')}
          action={<Button label={t('account.relogin')} onPress={() => router.push('/login')} />}
        />
      ) : null}
      <Button
        label={t('account.logout')}
        variant="secondary"
        icon="log-out-outline"
        onPress={() => void logout(false)}
      />
      <Button label={t('account.logoutDelete')} variant="ghost" onPress={() => void logout(true)} />
      <Button label={t('account.delete')} variant="danger" onPress={() => router.push('/delete-account')} />
    </Card>
  )
}

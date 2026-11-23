/**
 * Hesabı sil (/delete-account): şifreyle onaylanır, geri alınamaz. Başarılı olunca oturum kapanır, bu telefondaki
 * hesap verisi silinir ve karşılama ekranına dönülür. App Store ve Google Play, hesap açılabilen uygulamada hesabın
 * UYGULAMANIN İÇİNDEN silinebilmesini ister (docs/YAYINLAMA.md → "Hesap silme").
 *
 * Genişletme: silmeden önce "verilerimi indir" önerilecekse buraya bağlantı ekleyin (API: GET /api/account/export).
 */
import { router } from 'expo-router'
import { useState } from 'react'
import { t } from '../../i18n/index.ts'
import { useSession } from '../../lib/session/context.ts'
import { AppText, Banner, Button, Screen, TextField, useConfirm } from '../../ui/index.ts'
import { useSubmit } from '../auth/useSubmit.ts'

export function DeleteAccountScreen() {
  const { deleteAccount, state } = useSession()
  const confirm = useConfirm()
  const [password, setPassword] = useState('')
  const { busy, errors, message, submit } = useSubmit({ invalid_credentials: t('account.wrongPassword') })

  const onDelete = async () => {
    const ok = await confirm({
      title: t('account.deleteTitle'),
      message: t('account.deleteMessage'),
      confirmLabel: t('account.delete'),
      destructive: true,
    })
    if (!ok) return
    const done = await submit(async () => {
      await deleteAccount(password)
    })
    if (done) router.replace('/welcome')
  }

  if (state.status !== 'account') {
    return (
      <Screen title={t('account.delete')}>
        <AppText tone="muted">{t('account.deleteNoAccount')}</AppText>
      </Screen>
    )
  }
  return (
    <Screen
      title={t('account.delete')}
      footer={
        <Button
          label={t('account.delete')}
          variant="danger"
          busy={busy}
          disabled={password === ''}
          onPress={() => void onDelete()}
        />
      }
    >
      <Banner tone="danger" message={t('account.deleteHint')} />
      {message ? <Banner tone="danger" message={message} /> : null}
      <TextField
        label={t('auth.field.password')}
        value={password}
        onChangeText={setPassword}
        error={errors.password}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
      />
    </Screen>
  )
}

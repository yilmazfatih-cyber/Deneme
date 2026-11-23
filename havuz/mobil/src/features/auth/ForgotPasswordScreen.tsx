/**
 * Şifremi unuttum (/forgot-password): e-posta yazılır, sunucu sıfırlama bağlantısı gönderir. Hesap olsun olmasın
 * aynı ileti gösterilir (hesabın varlığı sızmasın). Bağlantı WEB uygulamasında açılır (APP_URL/#/sifre-sifirla);
 * yeni şifreyle buradan giriş yapılır.
 *
 * Genişletme: bağlantının telefonda açılması istenirse derin bağlantı (scheme) + sıfırlama ekranı gerekir
 * (docs/YAYINLAMA.md → "Derin bağlantılar").
 */
import { forgotPasswordRequestSchema } from '@uygulama/shared'
import { router } from 'expo-router'
import { useState } from 'react'
import { t } from '../../i18n/index.ts'
import { useSession } from '../../lib/session/context.ts'
import { AppText, Banner, Button, Screen, TextField } from '../../ui/index.ts'
import { parseForm } from './parseForm.ts'
import { useSubmit } from './useSubmit.ts'

export function ForgotPasswordScreen() {
  const { forgotPassword } = useSession()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const { busy, errors, message, submit } = useSubmit()

  const onSubmit = () =>
    void submit(async () => {
      await forgotPassword(parseForm(forgotPasswordRequestSchema, { email }).email)
      setSent(true)
    })

  if (sent) {
    return (
      <Screen title={t('auth.forgot.title')}>
        <Banner tone="success" message={t('auth.forgot.sent')} />
        <Button label={t('auth.backToLogin')} variant="secondary" onPress={() => router.back()} />
      </Screen>
    )
  }
  return (
    <Screen
      title={t('auth.forgot.title')}
      footer={<Button label={t('auth.forgot.submit')} busy={busy} onPress={onSubmit} />}
    >
      <AppText tone="muted">{t('auth.forgot.description')}</AppText>
      {message ? <Banner tone="danger" message={message} /> : null}
      <TextField
        label={t('auth.field.email')}
        value={email}
        onChangeText={setEmail}
        error={errors.email}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        returnKeyType="send"
        onSubmitEditing={onSubmit}
      />
    </Screen>
  )
}

/**
 * Giriş ekranı (/login): e-posta + şifre. Başarılı girişte hesap veritabanı açılır, eşitleme başlar ve görevlere
 * gidilir. Belirteç telefonun güvenli deposuna yazılır (lib/session/tokenStore.ts).
 *
 * Genişletme: başka bir giriş yöntemi (ör. e-posta bağlantısı) → önce API'de uç, sonra burada ikinci bir form.
 */
import { loginRequestSchema } from '@uygulama/shared'
import { router } from 'expo-router'
import { useRef, useState } from 'react'
import type { TextInputInstance } from 'react-native'
import { t } from '../../i18n/index.ts'
import { useSession } from '../../lib/session/context.ts'
import { Banner, Button, Screen, TextField } from '../../ui/index.ts'
import { parseForm } from './parseForm.ts'
import { useSubmit } from './useSubmit.ts'

export function LoginScreen() {
  const { login } = useSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const passwordRef = useRef<TextInputInstance>(null)
  const { busy, errors, message, submit } = useSubmit({ invalid_credentials: t('auth.login.invalid') })

  const onSubmit = () =>
    void submit(async () => {
      await login(parseForm(loginRequestSchema, { email, password }))
      router.replace('/tasks')
    })

  return (
    <Screen
      title={t('auth.login.title')}
      footer={<Button label={t('auth.login.submit')} busy={busy} onPress={onSubmit} />}
    >
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
        textContentType="username"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <TextField
        ref={passwordRef}
        label={t('auth.field.password')}
        value={password}
        onChangeText={setPassword}
        error={errors.password}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={onSubmit}
      />
      <Button label={t('auth.login.forgot')} variant="ghost" onPress={() => router.push('/forgot-password')} />
      <Button label={t('auth.login.toRegister')} variant="ghost" onPress={() => router.replace('/register')} />
    </Screen>
  )
}

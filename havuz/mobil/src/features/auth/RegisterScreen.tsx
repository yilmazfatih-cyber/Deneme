/**
 * Kayıt ekranı (/register): ad, e-posta, şifre (en az 10 karakter). Hesap açılınca oturum başlar, görevlere gidilir.
 * Zayıf şifre ve kayıtlı e-posta sunucudan gelir; ileti ilgili alanın altında görünür.
 *
 * Genişletme: kayıtta yeni bir alan → önce shared registerRequestSchema (uygulama/shared), sonra burada TextField.
 */
import { PASSWORD_MIN, registerRequestSchema } from '@uygulama/shared'
import { router } from 'expo-router'
import { useState } from 'react'
import { t } from '../../i18n/index.ts'
import { useSession } from '../../lib/session/context.ts'
import { Banner, Button, Screen, TextField } from '../../ui/index.ts'
import { parseForm } from './parseForm.ts'
import { useSubmit } from './useSubmit.ts'

export function RegisterScreen() {
  const { register } = useSession()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const { busy, errors, message, submit } = useSubmit({ email_taken: t('auth.register.emailTaken') })

  const onSubmit = () =>
    void submit(async () => {
      await register(parseForm(registerRequestSchema, { name, email, password }))
      router.replace('/tasks')
    })

  return (
    <Screen
      title={t('auth.register.title')}
      footer={<Button label={t('auth.register.submit')} busy={busy} onPress={onSubmit} />}
    >
      {message ? <Banner tone="danger" message={message} /> : null}
      <TextField
        label={t('auth.field.name')}
        value={name}
        onChangeText={setName}
        error={errors.name}
        autoComplete="name"
        textContentType="name"
      />
      <TextField
        label={t('auth.field.email')}
        value={email}
        onChangeText={setEmail}
        error={errors.email}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
      />
      <TextField
        label={t('auth.field.password')}
        hint={t('auth.passwordHint', { min: PASSWORD_MIN })}
        value={password}
        onChangeText={setPassword}
        error={errors.password}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={onSubmit}
      />
      <Button label={t('auth.register.toLogin')} variant="ghost" onPress={() => router.replace('/login')} />
    </Screen>
  )
}

/**
 * Metin alanı: görünür etiket + giriş kutusu + hata/ipucu. Ekran okuyucu etiketi giriş kutusunun adı olarak okur;
 * hata `accessibilityLiveRegion` ile duyurulur. Dokunma hedefi ≥ 48 dp; klavye "İleri/Bitti" düğmesi verilebilir.
 *
 *   <TextField label={t('auth.field.email')} value={email} onChangeText={setEmail} keyboardType="email-address"
 *     autoComplete="email" error={errors.email} />
 *
 * Genişletme: yeni bir TextInput özelliği gerekiyorsa `TextFieldProps`'a ekleyip aşağıda iletin.
 */
import type { Ref } from 'react'
import { StyleSheet, TextInput, View, type TextInputInstance, type TextInputProps } from 'react-native'
import { AppText } from './Text.tsx'
import { FONT, RADIUS, SPACE, TOUCH, useTheme } from './theme.tsx'

export interface TextFieldProps extends Pick<
  TextInputProps,
  | 'value'
  | 'onChangeText'
  | 'placeholder'
  | 'secureTextEntry'
  | 'keyboardType'
  | 'autoComplete'
  | 'textContentType'
  | 'autoCapitalize'
  | 'autoCorrect'
  | 'returnKeyType'
  | 'onSubmitEditing'
  | 'multiline'
  | 'maxLength'
  | 'autoFocus'
  | 'submitBehavior'
  | 'testID'
> {
  readonly label: string
  readonly error?: string | undefined
  readonly hint?: string | undefined
  readonly ref?: Ref<TextInputInstance>
}

export function TextField({ label, error, hint, multiline, ref, ...input }: TextFieldProps) {
  const { colors } = useTheme()
  return (
    <View style={styles.wrap}>
      <AppText weight="medium" accessibilityElementsHidden importantForAccessibility="no" aria-hidden>
        {label}
      </AppText>
      <TextInput
        ref={ref}
        {...input}
        multiline={multiline}
        accessibilityLabel={label}
        accessibilityHint={hint}
        aria-invalid={error ? true : undefined}
        placeholderTextColor={colors.muted}
        style={[
          styles.input,
          multiline ? styles.multiline : null,
          {
            color: colors.ink,
            backgroundColor: colors.surface,
            borderColor: error ? colors.danger : colors.lineStrong,
          },
        ]}
      />
      {hint && !error ? (
        <AppText size="small" tone="muted">
          {hint}
        </AppText>
      ) : null}
      {error ? (
        <AppText size="small" tone="danger" accessibilityLiveRegion="polite" role="alert">
          {error}
        </AppText>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: SPACE.xs },
  input: {
    minHeight: TOUCH,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
    fontSize: FONT.body,
  },
  multiline: { minHeight: 112, textAlignVertical: 'top' },
})

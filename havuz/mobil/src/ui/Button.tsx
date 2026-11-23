/**
 * Düğme: metinli (`Button`) ve yalnız simgeli (`IconButton`). Dokunma hedefi ≥ 48 dp; ekran okuyucu adı her zaman
 * vardır (IconButton'da `label` ZORUNLUDUR). Meşgulken (`busy`) dönen gösterge çıkar ve basılamaz.
 *
 *   <Button label={t('common.save')} onPress={save} />
 *   <Button label={t('tasks.delete')} variant="danger" icon="trash-outline" onPress={remove} />
 *   <IconButton icon="close" label={t('common.close')} onPress={close} />
 *
 * Genişletme: yeni görünüm → `variant`'a ekleyin ve renklerini `colorsFor` içinde verin.
 */
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { a11yState } from './a11y.ts'
import { Icon, type IconName } from './Icon.tsx'
import { AppText } from './Text.tsx'
import { RADIUS, SPACE, TOUCH, useTheme } from './theme.tsx'
import type { Palette } from './palette.ts'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

function colorsFor(variant: ButtonVariant, colors: Palette) {
  switch (variant) {
    case 'primary':
      return { background: colors.accent, text: colors.onAccent, border: colors.accent }
    case 'secondary':
      return { background: colors.surface, text: colors.accentInk, border: colors.lineStrong }
    case 'ghost':
      return { background: 'transparent', text: colors.accentInk, border: 'transparent' }
    case 'danger':
      return { background: colors.dangerSoft, text: colors.danger, border: colors.danger }
  }
}

export interface ButtonProps {
  readonly label: string
  readonly onPress: () => void
  readonly variant?: ButtonVariant
  readonly icon?: IconName
  readonly disabled?: boolean
  readonly busy?: boolean
  /** Ekran okuyucunun ek açıklaması ("Görevi siler" gibi). */
  readonly hint?: string
  readonly style?: StyleProp<ViewStyle>
  readonly testID?: string
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  busy,
  hint,
  style,
  testID,
}: ButtonProps) {
  const { colors } = useTheme()
  const palette = colorsFor(variant, colors)
  const inactive = disabled === true || busy === true
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      {...a11yState({ disabled: inactive, busy: busy === true })}
      disabled={inactive}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: palette.background,
          borderColor: palette.border,
          opacity: disabled ? 0.55 : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      {busy ? <ActivityIndicator color={palette.text} /> : icon ? <Icon name={icon} color={palette.text} /> : null}
      <AppText weight="bold" style={{ color: palette.text }}>
        {label}
      </AppText>
    </Pressable>
  )
}

export interface IconButtonProps {
  readonly icon: IconName
  /** Ekran okuyucunun okuyacağı ad (görünmez ama ZORUNLU). */
  readonly label: string
  readonly onPress: () => void
  readonly disabled?: boolean
  readonly color?: string
  readonly testID?: string
}

export function IconButton({ icon, label, onPress, disabled, color, testID }: IconButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      {...a11yState({ disabled: disabled === true })}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [styles.iconButton, { opacity: disabled ? 0.4 : pressed ? 0.6 : 1 }]}
    >
      <View>
        <Icon name={icon} size={24} {...(color ? { color } : {})} />
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: {
    minHeight: TOUCH,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.sm,
  },
  iconButton: { minWidth: TOUCH, minHeight: TOUCH, alignItems: 'center', justifyContent: 'center' },
})

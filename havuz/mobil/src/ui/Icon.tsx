/**
 * Simge: Ionicons yazı tipinden (@expo/vector-icons). Simgeler süstür: ekran okuyucudan GİZLİDİR; anlamı yanındaki
 * metin ya da düğmenin `label`'ı taşır. Kullanılabilecek adlar `IconName` listesindedir (ad yanlışsa derleme hatası).
 *
 *   <Icon name="trash-outline" />    <Icon name="add" size={28} color={colors.onAccent} />
 *
 * Genişletme: yeni simge → `ICONS` listesine Ionicons adını ekleyin (adlar: node_modules/@expo/vector-icons/build/
 * vendor/react-native-vector-icons/glyphmaps/Ionicons.json).
 */
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme } from './theme.tsx'

export const ICONS = [
  'add',
  'alert-circle-outline',
  'arrow-undo',
  'calendar-outline',
  'checkbox',
  'checkbox-outline',
  'checkmark',
  'checkmark-circle',
  'chevron-forward',
  'close',
  'cloud-done-outline',
  'cloud-offline-outline',
  'flag-outline',
  'information-circle-outline',
  'list-outline',
  'log-out-outline',
  'people-outline',
  'person-circle-outline',
  'phone-portrait-outline',
  'search',
  'settings-outline',
  'square-outline',
  'swap-horizontal',
  'sync',
  'trash-outline',
] as const
export type IconName = (typeof ICONS)[number]

export function Icon({ name, size = 22, color }: { name: IconName; size?: number; color?: string }) {
  const { colors } = useTheme()
  return (
    <Ionicons
      name={name}
      size={size}
      color={color ?? colors.ink}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
    />
  )
}

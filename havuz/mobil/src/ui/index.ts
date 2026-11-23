/**
 * Arayüz bileşenleri: ekranlar YALNIZ bunları kullanır (renk/ölçü tutarlı, erişilebilirlik hazır).
 * Genişletme: yeni bileşen → src/ui/<Ad>.tsx (başlık yorumu + örnek), buradan dışa aktarın, test/ui'ye testini yazın.
 */
export { a11yState } from './a11y.ts'
export { Banner, Card, EmptyState, Loading, type BannerTone } from './Blocks.tsx'
export { Button, IconButton, type ButtonVariant } from './Button.tsx'
export { Checkbox, ChoiceGroup, type ChoiceOption } from './Choice.tsx'
export { ConfirmProvider, useConfirm, type ConfirmInput } from './Confirm.tsx'
export { Icon, type IconName } from './Icon.tsx'
export { Screen } from './Screen.tsx'
export { AppText, Heading } from './Text.tsx'
export { TextField } from './TextField.tsx'
export { ThemeProvider, useTheme, FONT, RADIUS, SPACE, THEME_CHOICES, TOUCH, type ThemeChoice } from './theme.tsx'
export { ToastProvider, useToast, type ToastInput } from './Toast.tsx'

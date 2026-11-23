/**
 * Onay penceresi: geri alınamayan işlemden (hesap silme, veriyi silerek çıkış) önce sorar. Android geri tuşu
 * "Vazgeç" sayılır. `Alert.alert` KULLANMAYIN: web derlemesinde düğmesiz çalışır (lint kuralı yakalar).
 *
 *   const confirm = useConfirm()
 *   if (await confirm({ title: t('…'), message: t('…'), confirmLabel: t('…'), destructive: true })) …
 *
 * Genişletme: üç seçenekli bir soru gerekiyorsa (ör. reset kararı) `ChoiceDialog` gibi ayrı bir bileşen yazın.
 */
import { createContext, use, useCallback, useMemo, useState, type ReactNode } from 'react'
import { Modal, StyleSheet, View } from 'react-native'
import { t } from '../i18n/index.ts'
import { Button } from './Button.tsx'
import { AppText } from './Text.tsx'
import { RADIUS, SPACE, useTheme } from './theme.tsx'

export interface ConfirmInput {
  readonly title: string
  readonly message: string
  readonly confirmLabel: string
  readonly cancelLabel?: string
  readonly destructive?: boolean
}

type Confirm = (input: ConfirmInput) => Promise<boolean>

const ConfirmContext = createContext<Confirm | null>(null)

export function useConfirm(): Confirm {
  const value = use(ConfirmContext)
  if (!value) throw new Error('useConfirm yalnız <ConfirmProvider> içinde kullanılabilir (src/app/_layout.tsx).')
  return value
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<(ConfirmInput & { resolve: (ok: boolean) => void }) | null>(null)
  const confirm = useCallback<Confirm>((input) => new Promise((resolve) => setPending({ ...input, resolve })), [])
  const close = useCallback(
    (ok: boolean) => {
      pending?.resolve(ok)
      setPending(null)
    },
    [pending],
  )
  const value = useMemo(() => confirm, [confirm])
  return (
    <ConfirmContext value={value}>
      {children}
      {pending ? <ConfirmDialog input={pending} onClose={close} /> : null}
    </ConfirmContext>
  )
}

function ConfirmDialog({ input, onClose }: { input: ConfirmInput; onClose: (ok: boolean) => void }) {
  const { colors } = useTheme()
  return (
    <Modal transparent visible animationType="fade" onRequestClose={() => onClose(false)}>
      <View style={[styles.backdrop, { backgroundColor: 'rgba(0,0,0,0.45)' }]}>
        <View
          role="alertdialog"
          aria-modal
          accessibilityViewIsModal
          accessibilityLabel={input.title}
          style={[styles.dialog, { backgroundColor: colors.surface }]}
        >
          <AppText size="large" weight="bold" accessibilityRole="header">
            {input.title}
          </AppText>
          <AppText tone="muted">{input.message}</AppText>
          <View style={styles.actions}>
            <Button
              label={input.cancelLabel ?? t('common.cancel')}
              variant="secondary"
              onPress={() => onClose(false)}
            />
            <Button
              label={input.confirmLabel}
              variant={input.destructive ? 'danger' : 'primary'}
              onPress={() => onClose(true)}
            />
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACE.lg },
  dialog: { width: '100%', maxWidth: 440, borderRadius: RADIUS.lg, padding: SPACE.xl, gap: SPACE.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: SPACE.sm },
})

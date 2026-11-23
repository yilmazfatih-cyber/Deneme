/**
 * Arayüz bileşenleri: ekran okuyucu rolleri/adları/durumları, dokunma hedefi ≥ 48 dp, bildirim eylemi,
 * onay penceresi (Android geri tuşu = Vazgeç).
 */
import { fireEvent, render, screen, userEvent } from '@testing-library/react-native'
import { useState, type ReactNode } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import {
  Button,
  Checkbox,
  ChoiceGroup,
  ConfirmProvider,
  IconButton,
  TextField,
  ThemeProvider,
  ToastProvider,
  TOUCH,
  useConfirm,
  useToast,
} from '../../src/ui/index.ts'

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }

function Providers({ children }: { children: ReactNode }) {
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider choice="light">
        <ToastProvider>
          <ConfirmProvider>{children}</ConfirmProvider>
        </ToastProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  )
}

describe('arayüz bileşenleri', () => {
  it('düğme: rol, ad, ≥ 48 dp; devre dışı ve meşgul durumları duyurulur', async () => {
    const onPress = jest.fn()
    await render(
      <Providers>
        <Button label="Kaydet" onPress={onPress} />
        <Button label="Gönder" onPress={onPress} busy />
        <Button label="Sil" onPress={onPress} disabled />
        <IconButton icon="close" label="Kapat" onPress={onPress} />
      </Providers>,
    )
    const save = screen.getByRole('button', { name: 'Kaydet' })
    expect(save).toHaveStyle({ minHeight: TOUCH })
    expect(TOUCH).toBeGreaterThanOrEqual(48)
    await userEvent.setup().press(save)
    expect(onPress).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Gönder' })).toBeBusy()
    expect(screen.getByRole('button', { name: 'Sil' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Kapat' })).toHaveStyle({ minWidth: TOUCH, minHeight: TOUCH })
  })

  it('onay kutusu ve seçim grubu durumlarını bildirir', async () => {
    function Example() {
      const [checked, setChecked] = useState(false)
      const [value, setValue] = useState<'a' | 'b'>('a')
      return (
        <>
          <Checkbox checked={checked} label="Tamamlandı" onChange={setChecked} showLabel />
          <ChoiceGroup
            label="Öncelik"
            value={value}
            onChange={setValue}
            options={[
              { value: 'a', label: 'Normal' },
              { value: 'b', label: 'Yüksek' },
            ]}
          />
        </>
      )
    }
    await render(
      <Providers>
        <Example />
      </Providers>,
    )
    const user = userEvent.setup()
    const box = screen.getByRole('checkbox', { name: 'Tamamlandı' })
    expect(box).not.toBeChecked()
    await user.press(box)
    expect(screen.getByRole('checkbox', { name: 'Tamamlandı' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Normal' })).toBeChecked()
    await user.press(screen.getByRole('radio', { name: 'Yüksek' }))
    expect(screen.getByRole('radio', { name: 'Yüksek' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Normal' })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: 'Yüksek' })).toHaveStyle({ minHeight: TOUCH })
  })

  it('metin alanı etiketle bulunur; hata gösterilir ve alan geçersiz işaretlenir', async () => {
    await render(
      <Providers>
        <TextField label="E-posta" value="x" onChangeText={() => {}} error="Geçerli bir e-posta yazın." />
      </Providers>,
    )
    expect(screen.getByLabelText('E-posta')).toHaveProp('aria-invalid', true)
    expect(screen.getByText('Geçerli bir e-posta yazın.')).toBeOnTheScreen()
  })

  it('bildirim eylemi çalışır ve bildirim kapanır', async () => {
    const undo = jest.fn()
    function Example() {
      const toast = useToast()
      return (
        <Button
          label="Sil"
          onPress={() => toast.show({ message: 'Silindi.', action: { label: 'Geri al', onAction: undo } })}
        />
      )
    }
    await render(
      <Providers>
        <Example />
      </Providers>,
    )
    const user = userEvent.setup()
    await user.press(screen.getByRole('button', { name: 'Sil' }))
    expect(screen.getByText('Silindi.')).toBeOnTheScreen()
    await user.press(screen.getByRole('button', { name: 'Geri al' }))
    expect(undo).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Silindi.')).not.toBeOnTheScreen()
  })

  it('onay penceresi: onay true, Vazgeç ve Android geri tuşu false döner', async () => {
    const answers: boolean[] = []
    function Example() {
      const confirm = useConfirm()
      return (
        <Button
          label="Sor"
          onPress={() =>
            void confirm({ title: 'Silinsin mi?', message: 'Geri alınamaz.', confirmLabel: 'Sil' }).then((ok) =>
              answers.push(ok),
            )
          }
        />
      )
    }
    await render(
      <Providers>
        <Example />
      </Providers>,
    )
    const user = userEvent.setup()
    await user.press(screen.getByRole('button', { name: 'Sor' }))
    await user.press(screen.getByRole('button', { name: 'Sil' }))
    await user.press(screen.getByRole('button', { name: 'Sor' }))
    await user.press(screen.getByRole('button', { name: 'Vazgeç' }))
    await user.press(screen.getByRole('button', { name: 'Sor' }))
    const modal = screen.container.queryAll((node) => node.type === 'Modal')[0]
    expect(modal).toBeDefined()
    await fireEvent(modal!, 'requestClose')
    expect(answers).toEqual([true, false, false])
  })
})

/**
 * Arayüz bileşenleri: erişilebilirlik sözleşmesi (adlar, roller, aria-* bağları) ve klavye davranışı.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Pencil, Trash } from 'lucide-react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import {
  Button,
  ConfirmDialog,
  Dialog,
  IconButton,
  Menu,
  Switch,
  Tabs,
  TextField,
  ToastProvider,
  useToast,
} from '../../src/ui/index.ts'

describe('Button / IconButton', () => {
  it('yüklenirken kilitlenir ve meşgul olduğunu bildirir; simge düğmesinin adı okunur', () => {
    render(
      <>
        <Button loading>Kaydet</Button>
        <IconButton icon={Pencil} label="Düzenle" />
      </>,
    )
    expect(screen.getByRole('button', { name: 'Kaydet' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Kaydet' })).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('button', { name: 'Düzenle' })).toBeEnabled()
  })
})

describe('TextField', () => {
  it('hata iletisi alana bağlıdır (aria-invalid + aria-describedby)', () => {
    render(<TextField label="Başlık" error="Göreve bir başlık yazın." hint="İpucu" />)
    const input = screen.getByRole('textbox', { name: 'Başlık' })
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Göreve bir başlık yazın.')
    expect(screen.queryByText('İpucu')).not.toBeInTheDocument() // hata varken ipucu yerine hata görünür
  })
})

describe('Dialog / ConfirmDialog', () => {
  it('Esc ile kapanır; başlık pencerenin adıdır', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <Dialog open onClose={onClose} title="Liste ekle">
        <TextField label="Ad" />
      </Dialog>,
    )
    expect(screen.getByRole('dialog', { name: 'Liste ekle' })).toBeInTheDocument()
    screen.getByRole('dialog').dispatchEvent(new Event('cancel', { cancelable: true }))
    expect(onClose).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: 'Kapat' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('onay işlemi hata verirse ileti pencerede kalır, pencere kapanmaz', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <ConfirmDialog
        open
        onClose={onClose}
        title="Silinsin mi?"
        confirmLabel="Sil"
        tone="danger"
        onConfirm={() => Promise.reject(new Error('x'))}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Sil' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Beklenmeyen bir sorun oldu.')
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('Menu', () => {
  it('açılır, oklarla gezilir, seçilen eylem çalışır ve odak düğmeye döner', async () => {
    const user = userEvent.setup()
    const remove = vi.fn()
    render(
      <Menu
        label="Seçenekler"
        items={[
          { label: 'Düzenle', icon: Pencil, onSelect: () => {} },
          { label: 'Sil', icon: Trash, tone: 'danger', onSelect: remove },
        ]}
      />,
    )
    const trigger = screen.getByRole('button', { name: 'Seçenekler' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Düzenle' })).toHaveFocus())
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Sil' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(remove).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('Esc menüyü kapatır', async () => {
    const user = userEvent.setup()
    render(<Menu label="Seçenekler" items={[{ label: 'Düzenle', onSelect: () => {} }]} />)
    await user.click(screen.getByRole('button', { name: 'Seçenekler' }))
    await waitFor(() => expect(screen.getByRole('menuitem')).toHaveFocus())
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})

describe('Tabs / Switch', () => {
  function TabsDemo() {
    const [value, setValue] = useState<'a' | 'b' | 'c'>('a')
    return (
      <Tabs
        label="Durum"
        value={value}
        onChange={setValue}
        tabs={[
          { value: 'a', label: 'Açık', count: 2 },
          { value: 'b', label: 'Biten' },
          { value: 'c', label: 'Tümü' },
        ]}
      >
        <p>Panel {value}</p>
      </Tabs>
    )
  }

  it('sekmeler ←/→ ile değişir; panel etkin sekmeyle adlanır', async () => {
    const user = userEvent.setup()
    render(<TabsDemo />)
    await user.click(screen.getByRole('tab', { name: /Açık/ }))
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Biten' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Biten' })).toHaveFocus()
    expect(screen.getByRole('tabpanel', { name: 'Biten' })).toHaveTextContent('Panel b')
    await user.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(screen.getByRole('tab', { name: 'Tümü' })).toHaveAttribute('aria-selected', 'true')
  })

  it('anahtar (switch) Boşluk tuşuyla değişir', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Switch label="Yüksek karşıtlık" checked={false} onChange={onChange} />)
    screen.getByRole('switch', { name: 'Yüksek karşıtlık' }).focus()
    await user.keyboard(' ')
    expect(onChange).toHaveBeenCalledWith(true)
  })
})

describe('Toast', () => {
  function Demo({ onUndo }: { onUndo: () => void }) {
    const toast = useToast()
    return (
      <Button onClick={() => toast.show({ message: 'Silindi.', action: { label: 'Geri al', onAction: onUndo } })}>
        Göster
      </Button>
    )
  }

  it('ileti duyurulur; eylem düğmesi çalışır ve bildirimi kapatır', async () => {
    const user = userEvent.setup()
    const onUndo = vi.fn()
    render(
      <ToastProvider>
        <Demo onUndo={onUndo} />
      </ToastProvider>,
    )
    await user.click(screen.getByRole('button', { name: 'Göster' }))
    const region = screen.getByRole('region', { name: 'Bildirimler' })
    expect(region).toHaveTextContent('Silindi.')
    await user.click(screen.getByRole('button', { name: 'Geri al' }))
    expect(onUndo).toHaveBeenCalledOnce()
    expect(region).not.toHaveTextContent('Silindi.')
  })
})

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PhonePreview } from './PhonePreview'

describe('PhonePreview', () => {
  it('shows display name, call reason, formatted number and verified mark', () => {
    render(<PhonePreview displayName="Örnek Banka" callReason="Kart işleminiz hakkında" tn="+902125550000" logoUrl="https://cdn.example.com/logo.png" />)
    const phone = screen.getByTestId('phone-preview')
    expect(screen.getByTestId('phone-name')).toHaveTextContent('Örnek Banka')
    expect(screen.getByTestId('phone-reason')).toHaveTextContent('Kart işleminiz hakkında')
    expect(phone).toHaveTextContent('+90 212 555 00 00')
    expect(phone).toHaveTextContent('Doğrulanmış arayan')
    expect(phone.querySelector('img')).toHaveAttribute('src', 'https://cdn.example.com/logo.png')
    expect(screen.getByRole('img', { name: /Gelen arama önizlemesi, Örnek Banka/ })).toBeInTheDocument()
  })

  it('uses Turkish uppercase initials when there is no https logo', () => {
    render(<PhonePreview displayName="istanbul ilaç" logoUrl="http://insecure.example.com/l.png" />)
    const phone = screen.getByTestId('phone-preview')
    expect(phone.querySelector('img')).toBeNull()
    expect(phone).toHaveTextContent('İİ')
  })

  it('falls back to initials when the logo fails to load', () => {
    render(<PhonePreview displayName="Kargo Hızlı" logoUrl="https://cdn.example.com/missing.png" />)
    const img = screen.getByTestId('phone-preview').querySelector('img')!
    fireEvent.error(img)
    expect(screen.getByTestId('phone-preview').querySelector('img')).toBeNull()
    expect(screen.getByTestId('phone-preview')).toHaveTextContent('KH')
  })

  it('shows a placeholder and unverified state', () => {
    render(<PhonePreview displayName="  " verified={false} />)
    expect(screen.getByTestId('phone-name')).toHaveTextContent('Marka adı')
    expect(screen.getByTestId('phone-preview')).toHaveTextContent('Doğrulanmamış numara')
    expect(screen.queryByTestId('phone-reason')).toBeNull()
  })
})

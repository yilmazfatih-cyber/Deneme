/**
 * Bileşen kataloğu: her bölüm hatasız çizilir (yeni bileşen eklenince örneği de burada denenmiş olur).
 */
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { CatalogPage } from '../../src/features/catalog/CatalogPage.tsx'
import { ToastProvider } from '../../src/ui/index.ts'

describe('Bileşen kataloğu', () => {
  it('bütün örnek bölümleri çizilir', () => {
    render(
      <ToastProvider>
        <MemoryRouter>
          <CatalogPage />
        </MemoryRouter>
      </ToastProvider>,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Bileşen kataloğu' })).toBeInTheDocument()
    for (const name of ['Button · IconButton · ButtonLink', 'TextField · TextAreaField · SelectField', 'Menu · Tabs']) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument()
    }
  })
})

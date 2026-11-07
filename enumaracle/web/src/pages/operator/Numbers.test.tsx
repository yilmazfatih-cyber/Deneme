import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setCsrfToken } from '../../api'
import { adminUser, mockFetch, renderWithProviders } from '../../test-utils'
import { NumbersPage } from './Numbers'

afterEach(() => {
  vi.unstubAllGlobals()
  setCsrfToken('')
})

const numbers = [
  {
    id: 'n1',
    entity_id: 'e1',
    range_start: '+902125550000',
    range_end: '+902125550099',
    count: 100,
    kind: 'geographic',
    use_case: 'customer_service',
    call_reason: 'Müşteri hizmetleri',
    status: 'pending_verification',
    carrier_confirmed: false,
    created_at: '2026-11-01T10:00:00Z',
    updated_at: '2026-11-02T10:00:00Z',
  },
  {
    id: 'n2',
    entity_id: 'e1',
    range_start: '+905321234567',
    range_end: '+905321234567',
    count: 1,
    kind: 'mobile',
    use_case: 'delivery',
    call_reason: '',
    status: 'active',
    carrier_confirmed: true,
    created_at: '2026-11-01T10:00:00Z',
    updated_at: '2026-11-02T10:00:00Z',
  },
]

function setup(role: 'operator_admin' | 'operator_analyst') {
  const scopes = role === 'operator_admin' ? ['admin', 'admin:read', 'carrier:read', 'carrier:write'] : ['admin:read', 'carrier:read']
  return mockFetch({
    'GET /auth/me': { body: { user: { ...adminUser, role }, csrf_token: 'csrf-9', scopes } },
    'GET /v1/admin/entities': { body: { items: [{ id: 'e1', legal_name: 'Örnek Kargo A.Ş.', trade_name: 'Örnek Kargo' }], total: 1 } },
    'GET /v1/admin/numbers': { body: { items: numbers, total: 2 } },
    'POST /v1/admin/numbers/n1/status': (c) => ({ body: { ...numbers[0], ...(c.body as object) } }),
  })
}

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/operator/numaralar" element={<NumbersPage />} />
    </Routes>,
    '/operator/numaralar',
  )
}

describe('NumbersPage', () => {
  it('renders numbers with readable ranges, entity names and text status badges', async () => {
    setup('operator_admin')
    renderPage()
    const table = await screen.findByRole('table')
    const rows = within(table).getAllByRole('row')
    expect(rows).toHaveLength(3)
    expect(rows[1]).toHaveTextContent('+90 212 555 00 00 – +90 212 555 00 99')
    expect(rows[1]).toHaveTextContent('Doğrulama bekliyor')
    expect(rows[1]).toHaveTextContent('Coğrafi (sabit)')
    expect(rows[2]).toHaveTextContent('+90 532 123 45 67')
    expect(rows[2]).toHaveTextContent('Etkin')
    await waitFor(() => expect(rows[1]).toHaveTextContent('Örnek Kargo'))
    expect(screen.getByText('Toplam 2 kayıt')).toBeInTheDocument()
  })

  it('activates with carrier confirmation after a confirmation dialog', async () => {
    const calls = setup('operator_admin')
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Etkinleştir' }))
    const dialog = screen.getByRole('dialog', { name: 'Numarayı etkinleştir' })
    expect(within(dialog).getByRole('checkbox')).toBeChecked()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Etkinleştir' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const post = calls.find((c) => c.method === 'POST')!
    expect(post.url).toBe('/v1/admin/numbers/n1/status')
    expect(post.body).toEqual({ status: 'active', carrier_confirmed: true })
    expect(post.headers['X-CSRF-Token']).toBe('csrf-9')
  })

  it('hides write actions for analysts', async () => {
    setup('operator_analyst')
    renderPage()
    await screen.findByRole('table')
    await waitFor(() => expect(screen.getByText('Toplam 2 kayıt')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Etkinleştir' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Askıya al' })).toBeNull()
  })
})

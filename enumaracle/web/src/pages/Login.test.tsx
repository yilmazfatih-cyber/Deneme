import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../App'
import { setCsrfToken } from '../api'
import { adminUser, mockFetch, renderWithProviders } from '../test-utils'

afterEach(() => {
  vi.unstubAllGlobals()
  setCsrfToken('')
})

describe('login flow', () => {
  it('redirects to login, signs in and lands on the operator dashboard', async () => {
    let loggedIn = false
    const calls = mockFetch({
      'GET /auth/me': () =>
        loggedIn
          ? { body: { user: adminUser, csrf_token: 'csrf-1', scopes: ['admin', 'admin:read', 'carrier:read', 'carrier:write'] } }
          : { status: 401, body: { title: 'Unauthorized', status: 401 } },
      'POST /auth/login': (c) => {
        const b = c.body as { email: string; password: string }
        if (b.password !== 'dogru-parola-123') return { status: 401, body: { title: 'Unauthorized', status: 401 } }
        loggedIn = true
        return { body: { user: adminUser, csrf_token: 'csrf-1' } }
      },
      'GET /v1/admin/stats': {
        body: { entities: { in_review: 3, verified: 7 }, numbers: { active: 12 }, branding: { pending_review: 2 } },
      },
      'GET /v1/admin/reputation-stats': { body: { labels: { clean: 10, spam: 1 }, events_24h: 1500, feedback_7d: 4 } },
    })

    renderWithProviders(<App />, '/operator')
    expect(await screen.findByRole('heading', { name: 'Giriş yap' })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/E-posta/), { target: { value: 'admin@operator.com.tr' } })
    fireEvent.change(screen.getByLabelText(/Parola/), { target: { value: 'yanlis' } })
    fireEvent.click(screen.getByRole('button', { name: 'Giriş yap' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('E-posta veya parola hatalı.')

    fireEvent.change(screen.getByLabelText(/Parola/), { target: { value: 'dogru-parola-123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Giriş yap' }))

    expect(await screen.findByRole('heading', { name: 'Genel bakış' })).toBeInTheDocument()
    expect(await screen.findByText('İnceleme bekleyen şirket')).toBeInTheDocument()
    expect(screen.getByText('Ayşe Yılmaz')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Ana menü' })).toHaveTextContent('Doğrulama kuyruğu')

    const login = calls.filter((c) => c.method === 'POST' && c.url === '/auth/login').at(-1)!
    expect(login.body).toEqual({ email: 'admin@operator.com.tr', password: 'dogru-parola-123' })

    // The CSRF token from the session is echoed on the next unsafe request.
    fireEvent.click(screen.getByRole('button', { name: 'Çıkış yap' }))
    await waitFor(() => expect(calls.some((c) => c.url === '/auth/logout')).toBe(true))
    const logout = calls.find((c) => c.url === '/auth/logout')!
    expect(logout.headers['X-CSRF-Token']).toBe('csrf-1')
  })

  it('sends enterprise users to their company page', async () => {
    const owner = { ...adminUser, id: 'u2', role: 'enterprise_owner', entity_id: 'e1', name: 'Mehmet Kaya' }
    mockFetch({
      'GET /auth/me': { body: { user: owner, csrf_token: 'c', scopes: ['enterprise:read', 'enterprise:write'] } },
      'GET /v1/enterprise/entity': {
        body: {
          id: 'e1',
          legal_name: 'Örnek Kargo A.Ş.',
          trade_name: 'Örnek Kargo',
          status: 'pending',
          vkn: '1234567890',
          mersis: '',
          sector: 'Kargo',
          website: '',
          city: 'İzmir',
          contact_name: 'Mehmet Kaya',
          contact_email: 'mehmet@ornek.com.tr',
          contact_phone: '+905321112233',
          country: 'TR',
          iys_registered: false,
          risk_tier: '',
          created_at: '2026-11-01T10:00:00Z',
          updated_at: '2026-11-01T10:00:00Z',
        },
      },
      'GET /v1/enterprise/entity/documents': { body: { items: [] } },
    })
    renderWithProviders(<App />, '/giris')
    expect(await screen.findByRole('heading', { name: 'Şirketim' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'İncelemeye gönder' })).toBeInTheDocument()
  })
})

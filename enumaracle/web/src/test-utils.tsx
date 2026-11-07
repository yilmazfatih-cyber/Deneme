import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { AuthProvider } from './auth'

export interface MockCall {
  method: string
  url: string
  headers: Record<string, string>
  body: unknown
  credentials?: RequestCredentials
}

type Handler = { status?: number; body?: unknown; contentType?: string } | ((call: MockCall) => { status?: number; body?: unknown; contentType?: string })

/** Installs a fetch mock keyed by "METHOD /path" (query string ignored). Returns the recorded calls. */
export function mockFetch(routes: Record<string, Handler>): MockCall[] {
  const calls: MockCall[] = []
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = (init?.method ?? 'GET').toUpperCase()
    const call: MockCall = {
      method,
      url,
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      credentials: init?.credentials,
    }
    calls.push(call)
    const key = `${method} ${url.split('?')[0]}`
    const h = routes[key]
    if (!h) {
      return new Response(JSON.stringify({ title: 'Not Found', status: 404 }), {
        status: 404,
        headers: { 'Content-Type': 'application/problem+json' },
      })
    }
    const r = typeof h === 'function' ? h(call) : h
    const status = r.status ?? 200
    if (status === 204) return new Response(null, { status })
    return new Response(JSON.stringify(r.body ?? {}), {
      status,
      headers: { 'Content-Type': r.contentType ?? (status >= 400 ? 'application/problem+json' : 'application/json') },
    })
  })
  vi.stubGlobal('fetch', fn)
  return calls
}

export function renderWithProviders(ui: ReactElement, path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>{ui}</AuthProvider>
    </MemoryRouter>,
  )
}

export const adminUser = {
  id: 'u1',
  email: 'admin@operator.com.tr',
  name: 'Ayşe Yılmaz',
  role: 'operator_admin' as const,
  active: true,
  created_at: '2026-11-01T10:00:00Z',
}

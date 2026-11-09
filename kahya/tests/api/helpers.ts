import type { z } from 'zod'
import type { StructuredLLM, StructuredResult } from '../../server/ai/claude.ts'
import { AIService } from '../../server/ai/service.ts'
import { createApp } from '../../server/app.ts'
import { resetRateLimits } from '../../server/auth/auth.ts'
import { testConfig, type Config } from '../../server/config.ts'
import { openDb } from '../../server/db/db.ts'
import { DEMO_PASSWORD, seedDemo } from '../../server/db/seed.ts'
import type { Deps } from '../../server/http.ts'
import { Messaging } from '../../server/integrations/messaging.ts'
import { Payments } from '../../server/integrations/payments.ts'

export const NOW = new Date('2026-11-09T09:00:00Z')

/** Claude yerine geçen sahte model: istemleri kaydeder, verilen yanıtı döner. */
export class FakeLLM implements StructuredLLM {
  readonly model = 'sahte-model'
  prompts: { system: string; user: string }[] = []
  private respond: (user: string) => unknown
  constructor(respond: (user: string) => unknown) {
    this.respond = respond
  }
  async structured<S extends z.ZodType>(p: {
    system: string
    user: string
    schema: S
  }): Promise<StructuredResult<z.infer<S>>> {
    this.prompts.push({ system: p.system, user: p.user })
    return { data: p.schema.parse(this.respond(p.user)), model: this.model, inputTokens: 100, outputTokens: 50 }
  }
}

export async function setup(
  opts: { llm?: StructuredLLM; config?: Partial<Config>; fetch?: typeof fetch; seed?: boolean } = {},
) {
  resetRateLimits()
  const db = openDb(':memory:')
  if (opts.seed !== false) await seedDemo(db, { now: NOW })
  const config = testConfig({
    demo: true,
    ...opts.config,
    ai: { engine: opts.llm ? 'claude' : 'kural', model: 'sahte-model', maskPii: true },
  })
  const deps: Deps = {
    db,
    config,
    ai: new AIService(config, opts.llm ?? null),
    messaging: new Messaging(config, { log: () => {}, fetch: opts.fetch }),
    payments: new Payments(config, opts.fetch),
    now: () => NOW,
  }
  const app = createApp(deps)

  const call = async (
    method: string,
    path: string,
    o: { cookie?: string; body?: unknown; headers?: Record<string, string> } = {},
  ) => {
    const headers: Record<string, string> = { ...(o.headers ?? {}) }
    if (o.cookie) headers.cookie = o.cookie
    if (o.body !== undefined && !headers['content-type']) headers['content-type'] = 'application/json'
    const res = await app.request(path, {
      method,
      headers,
      body: o.body === undefined ? undefined : typeof o.body === 'string' ? o.body : JSON.stringify(o.body),
    })
    const text = await res.text()
    let data: unknown = text
    try {
      data = JSON.parse(text)
    } catch {
      /* düz metin */
    }
    return { status: res.status, data: data as any, headers: res.headers } // eslint-disable-line @typescript-eslint/no-explicit-any
  }

  const login = async (email: string, password = DEMO_PASSWORD) => {
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    if (res.status !== 200) throw new Error(`Giriş başarısız: ${res.status} ${await res.text()}`)
    return res.headers.get('set-cookie')!.split(';')[0]!
  }

  const residentLogin = async (phone: string) => {
    const r1 = await call('POST', '/api/auth/otp', { body: { phone } })
    const code = r1.data.demoCode as string
    const res = await app.request('/api/auth/otp/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone, code }),
    })
    if (res.status !== 200) throw new Error(`Sakin girişi başarısız: ${await res.text()}`)
    return res.headers.get('set-cookie')!.split(';')[0]!
  }

  return { app, deps, db, call, login, residentLogin }
}

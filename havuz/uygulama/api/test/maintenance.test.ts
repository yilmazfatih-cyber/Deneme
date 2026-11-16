import { API_PATHS } from '@uygulama/shared'
import { afterEach, describe, expect, it } from 'vitest'
import { RETENTION, runMaintenance } from '../src/maintenance.ts'
import { signUp, TestClient } from './support/client.ts'
import { createTestServer, type TestServer } from './support/harness.ts'
import { createShared, invite } from './support/workspaces.ts'

let t: TestServer
afterEach(async () => {
  await t.close()
})

const count = (table: string) => t.db.get<{ total: number }>(`SELECT count(*) AS total FROM ${table}`)?.total

describe('bakım işi', () => {
  it('süresi dolmuş oturumları, eski belirteçleri, davetleri, denetim ve e-posta kayıtlarını siler; tazeleri tutar', async () => {
    t = createTestServer()
    const ayse = await signUp(t)
    await invite(ayse, await createShared(ayse))
    await new TestClient(t).post(API_PATHS.forgotPassword, { email: ayse.email })
    await t.idle()
    expect(runMaintenance(t.ctx)).toEqual({ sessions: 0, passwordResets: 0, invites: 0, audit: 0, outbox: 0 })

    t.clock.advanceDays(RETENTION.auditDays + 1)
    const result = runMaintenance(t.ctx)
    expect(result).toEqual({ sessions: 1, passwordResets: 1, invites: 1, audit: expect.any(Number), outbox: 1 })
    expect(result.audit).toBeGreaterThan(0)
    for (const table of ['sessions', 'password_resets', 'invites', 'audit_log', 'mail_outbox'])
      expect(count(table)).toBe(0)
    expect(count('users')).toBe(1)
  })
})

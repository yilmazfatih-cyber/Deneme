/**
 * mixpanel:import komutu: argümanlar, rapor biçimi, doğrudan kip (geçici veri klasörü; deneme, gerçek, yinelenen;
 * kilit) ve --server kipi (çalışan sunucuya stüdyo anahtarıyla akış gönderimi).
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestApp } from '../server/test/helpers'
import { formatImportReport, parseImportArgs, runImport } from './mixpanel-import'
import { ROOT_DIR } from './lib/content'

const SAMPLE = join(ROOT_DIR, 'content', 'analytics', 'ornek-mixpanel.jsonl')
const dirs: string[] = []
const saved = { ...process.env }
beforeEach(() => {
  const d = mkdtempSync(join(tmpdir(), 'tvplus-mpcli-'))
  dirs.push(d)
  process.env.TVP_DATA_DIR = d
  process.env.TVP_SECRET = 'cli-test-secret'
})
afterEach(() => {
  process.env = { ...saved }
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true })
})

describe('mixpanel:import', () => {
  it('argümanlar', () => {
    expect(parseImportArgs(['--file', 'a.jsonl', '--dry-run'])).toEqual({
      file: 'a.jsonl',
      from: null,
      to: null,
      dryRun: true,
      server: null,
    })
    expect(
      parseImportArgs(['--from', '2026-10-01', '--to', '2026-10-02', '--server', 'http://127.0.0.1:8787']),
    ).toMatchObject({
      from: '2026-10-01',
      server: 'http://127.0.0.1:8787',
    })
    expect(() => parseImportArgs([])).toThrow(/Kullanım/)
    expect(() => parseImportArgs(['--file'])).toThrow(/değer/)
    expect(() => parseImportArgs(['--file', 'a', '--from', '2026-10-01', '--to', '2026-10-02'])).toThrow(/birlikte/)
    expect(() => parseImportArgs(['--from', '2026-10-05', '--to', '2026-10-01'])).toThrow(/önce/)
    expect(() => parseImportArgs(['--file', 'a', '--server', 'ftp://x'])).toThrow(/--server/)
  })

  it('doğrudan kip: deneme yazmaz; gerçek içe aktarma yazar; ikinci çalıştırma yinelenen', async () => {
    const dry = await runImport({ file: SAMPLE, from: null, to: null, dryRun: true, server: null })
    expect(dry).toMatchObject({ accepted: 110, duplicates: 1, rejected: 3 })
    const text = formatImportReport(dry, true)
    expect(text).toContain('DENEME')
    expect(text).toContain('Page View')
    expect(text).toContain('cnt_99999')
    const real = await runImport({ file: SAMPLE, from: null, to: null, dryRun: false, server: null })
    expect(real).toMatchObject({ accepted: 110, duplicates: 1 })
    const again = await runImport({ file: SAMPLE, from: null, to: null, dryRun: false, server: null })
    expect(again).toMatchObject({ accepted: 0, duplicates: 111 })
  })

  it('doğrudan kip: depo başka canlı süreçte açıksa reddeder', async () => {
    const dir = join(process.env.TVP_DATA_DIR!, 'viewing')
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'LOCK'), String(process.ppid))
    await expect(runImport({ file: SAMPLE, from: null, to: null, dryRun: false, server: null })).rejects.toThrow(
      /--server/,
    )
  })

  it('--server kipi: çalışan sunucuya stüdyo anahtarıyla gönderir', async () => {
    const app = await createTestApp({ studioAccess: 'member', studioKey: 'cli-anahtar' })
    try {
      await app.listen({ port: 0, host: '127.0.0.1' })
      const origin = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`
      await expect(runImport({ file: SAMPLE, from: null, to: null, dryRun: false, server: origin })).rejects.toThrow(
        /401/,
      )
      process.env.TVP_STUDIO_KEY = 'cli-anahtar'
      const r = await runImport({ file: SAMPLE, from: null, to: null, dryRun: false, server: origin })
      expect(r).toMatchObject({ accepted: 110 })
      expect(app.services.viewing.sources().find((s) => s.source === 'MIXPANEL')!.events).toBe(110)
      const pull = runImport({ file: null, from: '2026-10-01', to: '2026-10-02', dryRun: false, server: origin })
      await expect(pull).rejects.toThrow(/501/)
    } finally {
      await app.close()
    }
  })
})

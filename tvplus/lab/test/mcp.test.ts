/**
 * MCP sunucusu (lab/mcp.ts), gerçek bir alt süreçle: protokol el sıkışması, tek araç, toplu komut, ajan kipi kısıtları
 * (gizlilik ayarı, depo sıfırlama, lab klasörü), stdout'un yalnız protokol satırı taşıması ve denetim günlüğü.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const root = resolve(__dirname, '..', '..')
const dir = mkdtempSync(join(tmpdir(), 'lab-mcp-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

interface Reply {
  id: number | null
  result?: {
    protocolVersion?: string
    capabilities?: Record<string, unknown>
    serverInfo?: { name: string }
    instructions?: string
    tools?: {
      name: string
      description: string
      inputSchema: { required?: string[]; properties: Record<string, unknown> }
    }[]
    content?: { type: string; text: string }[]
    isError?: boolean
  }
  error?: { code: number; message: string }
}

/** Sunucuyu başlatır, istekleri satır satır gönderir, stdin kapanınca tüm yanıtları döner. */
function session(requests: unknown[]): Promise<{ replies: Reply[]; rawLines: string[]; stderr: string }> {
  return new Promise((done, fail) => {
    const child = spawn(
      process.execPath,
      [join(root, 'node_modules/tsx/dist/cli.mjs'), join(root, 'lab/mcp.ts'), '--lab', dir],
      {
        cwd: root,
        env: { ...process.env, TVP_LAB_SECRET: 'mcp-test' },
      },
    )
    let out = ''
    let err = ''
    child.stdout.on('data', (c: Buffer) => (out += c.toString('utf8')))
    child.stderr.on('data', (c: Buffer) => (err += c.toString('utf8')))
    child.on('error', fail)
    child.on('close', () => {
      const rawLines = out.split('\n').filter((l) => l.trim())
      try {
        done({ replies: rawLines.map((l) => JSON.parse(l) as Reply), rawLines, stderr: err })
      } catch (e) {
        fail(new Error(`stdout protokol dışı satır içeriyor: ${String(e)}\n${out.slice(0, 500)}`))
      }
    })
    for (const r of requests) child.stdin.write(typeof r === 'string' ? `${r}\n` : `${JSON.stringify(r)}\n`)
    child.stdin.end()
  })
}

const call = (id: number, komut: string): unknown => ({
  jsonrpc: '2.0',
  id,
  method: 'tools/call',
  params: { name: 'lab', arguments: { komut } },
})
const textOf = (r: Reply | undefined): string => r?.result?.content?.[0]?.text ?? ''

describe('MCP sunucusu', () => {
  let replies: Reply[]
  let rawLines: string[]
  const byId = (id: number | null): Reply | undefined => replies.find((r) => r.id === id)

  beforeAll(async () => {
    const s = await session([
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '0' } },
      },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      call(3, 'durum'),
      call(4, 'yardim; sozluk; ayar --k 5; durum --lab /tmp/baska; al yok.jsonl --sifirla'),
      call(5, 'bilinmeyen-komut'),
      call(6, 'a;b;c;d;e;f;g;h;i'),
      'bu json değil',
      { jsonrpc: '2.0', id: 7, method: 'olmayan/yontem' },
      { jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'baska', arguments: {} } },
      { jsonrpc: '2.0', id: 9, method: 'ping' },
      call(10, ''),
    ])
    replies = s.replies
    rawLines = s.rawLines
  }, 120_000)

  it('el sıkışma: istenen protokol sürümü, araç yeteneği ve yönergeler', () => {
    const r = byId(1)?.result
    expect(r?.protocolVersion).toBe('2025-03-26')
    expect(r?.capabilities).toHaveProperty('tools')
    expect(r?.serverInfo?.name).toBe('tvplus-lab')
    expect(r?.instructions).toContain('lab')
  })

  it('tek ve kısa bir araç tanımı vardır', () => {
    const tools = byId(2)?.result?.tools ?? []
    expect(tools).toHaveLength(1)
    expect(tools[0].name).toBe('lab')
    expect(tools[0].inputSchema.required).toEqual(['komut'])
    expect(Object.keys(tools[0].inputSchema.properties)).toEqual(['komut'])
    // Araç tanımı her oturumda bağlama yüklenir: kısa kalmalı
    expect(JSON.stringify(tools[0]).length).toBeLessThan(1200)
  })

  it('komut çalışır; boş komut durum sayılır', () => {
    expect(byId(3)?.result?.isError).toBe(false)
    expect(textOf(byId(3))).toContain('LAB ·')
    expect(textOf(byId(10))).toContain('LAB ·')
  })

  it("toplu komut: ';' ile ayrılanlar sırayla çalışır, biri hata verse de ötekiler sürer", () => {
    const text = textOf(byId(4))
    expect(byId(4)?.result?.isError).toBe(false)
    expect(text).toContain('▸ yardim')
    expect(text).toContain('TV+ LAB')
    expect(text).toContain('▸ sozluk')
    expect(text).toContain('SÖZLÜK')
    // Ajan kipi kısıtları
    expect(text).toMatch(/▸ ayar --k 5\nHata: Gizlilik ayarını değiştirmek ajan kipinde kapalıdır/)
    expect(text).toMatch(/▸ durum --lab \/tmp\/baska\nHata: Ajan kipinde lab klasörü değiştirilemez/)
    expect(text).toMatch(/▸ al yok\.jsonl --sifirla\nHata: /)
    expect(existsSync(join(dir, 'ayar.json'))).toBe(false)
  })

  it('tek komut hata verirse yanıt hata olarak işaretlenir; çok fazla komut reddedilir', () => {
    expect(byId(5)?.result?.isError).toBe(true)
    expect(textOf(byId(5))).toContain('Bilinmeyen komut')
    expect(byId(6)?.result?.isError).toBe(true)
    expect(textOf(byId(6))).toContain('en çok 8 komut')
  })

  it('protokol hataları JSON-RPC hata kodlarıyla döner; bildirim yanıtlanmaz', () => {
    expect(byId(null)?.error?.code).toBe(-32700)
    expect(byId(7)?.error?.code).toBe(-32601)
    expect(byId(8)?.error?.code).toBe(-32602)
    expect(byId(9)?.result).toEqual({})
    // 10 istek + 1 ayrıştırma hatası; bildirim için satır yok
    expect(rawLines).toHaveLength(11)
  })

  it('ajana dönen her çıktı denetim günlüğüne yazılır', () => {
    const log = readFileSync(join(dir, 'gunluk', 'ciktilar.ndjson'), 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as { komut: string; cikti: string })
    expect(log.map((l) => l.komut)).toEqual(expect.arrayContaining(['durum', 'yardim', 'sozluk']))
    expect(log.find((l) => l.komut === 'durum')?.cikti).toBe(textOf(byId(3)))
  })
})

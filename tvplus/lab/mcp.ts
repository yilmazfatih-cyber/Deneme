/**
 * TV+ Lab MCP sunucusu (stdio): bir ajanın (Claude Code vb.) lab'la konuştuğu tek kapı.
 *
 *   Başlatma   npx tsx lab/mcp.ts [--lab <klasör>]      (depo kökündeki .mcp.json bunu tanımlar)
 *   Araç       lab { komut }                            komut = lab komut satırı; ';' ile birden çok komut
 *
 * Neden tek araç: araç tanımı her oturumda bağlama yüklenir; onlarca araç yerine tek, kısa bir tanım ve
 * kendi kendini anlatan komutlar ('durum', 'yardim') en az yeri tutar. Bir çağrıda birden çok komut tur sayısını,
 * kompakt tablolar ve çıktı bütçesi de yanıt boyunu düşürür.
 *
 * Gizlilik: araç yalnız toplam döndürür (lab'ın tüm komutları öyledir); ajan kipinde gizlilik ayarı değiştirilemez,
 * depo boşaltılamaz, lab klasörü değiştirilemez. Dönen her metin denetim günlüğüne yazılır (`lab gunluk`).
 *
 * Protokol: satır başına bir JSON-RPC 2.0 iletisi. stdout yalnız protokol içindir; başka her yazı stderr'e gider.
 */
import { createInterface } from 'node:readline'
import { parseArgs, splitBatch, splitCommandLine } from './src/cli/args'
import { execute } from './src/cli/commands'
import { EXTRA_COMMANDS } from './src/cli/extra'

const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05']
const MAX_CHARS = Math.max(1000, Number(process.env.TVP_LAB_MCP_MAX) || 8000)
const MAX_COMMANDS = 8

const TOOL = {
  name: 'lab',
  description: [
    'TV+ Lab: yerel Mixpanel verisi üzerinde churn nedeni analizi, uygulama simülasyonu ve A/B deneyleri.',
    'Ham veri makineden çıkmaz; çıktı yalnız toplamdır (küçük gruplar gizlenir) ve kompakt metindir.',
    "komut: bir lab komut satırı; ';' ile ayrılan komutlar tek çağrıda sırayla çalışır.",
    "Başlangıç 'durum' (sıradaki adımı söyler) · komut listesi 'yardim' · terimler 'sozluk'.",
    "Örnek: 'churn neden; churn tetik' · 'sorgu gun --grup cihaz --olc n,ort(watch_sec)' · 'deney calistir sayfa-siralama' · 'deney guc'.",
    "Uzun sürenler: 'sim karne' 1–2 dk, 'deney calistir' ~1 dk.",
  ].join(' '),
  inputSchema: {
    type: 'object',
    properties: { komut: { type: 'string', description: "Lab komut satırı, ör. 'churn neden --limit 5'" } },
    required: ['komut'],
  },
}

const INSTRUCTIONS = [
  "TV+ Lab'ın tek aracı `lab`. Her sayı bu araçtan gelir; tahmin etmeyin, yuvarlayıp değiştirmeyin.",
  'Kullanıcıdan ham veri, kimlik ya da anahtar yapıştırmasını istemeyin; veri onun makinesindeki lab klasöründedir.',
  "Çıktıda 'SENTETİK' yazıyorsa veri demodur; bulguları öyle etiketleyerek aktarın.",
  "Simülasyon sonucu gerçek A/B'nin yerini tutmaz: gerçeklik karnesi puanıyla birlikte aktarın ve gerçek deney için 'deney guc' ile süre önerin.",
].join('\n')

interface Request {
  jsonrpc?: string
  id?: number | string | null
  method?: string
  params?: Record<string, unknown>
}

// stdout'u protokole ayır: lab ya da uygulama kodu yanlışlıkla stdout'a yazarsa akış bozulmasın
const send = process.stdout.write.bind(process.stdout)
process.stdout.write = ((chunk: string | Uint8Array): boolean =>
  process.stderr.write(chunk)) as typeof process.stdout.write
console.log = (...args: unknown[]): void => console.error(...args)
console.info = console.log

const reply = (id: Request['id'], result: unknown): void => {
  send(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`)
}
const fail = (id: Request['id'], code: number, message: string): void => {
  send(`${JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } })}\n`)
}

const labDirArg = (): string | undefined => {
  const i = process.argv.indexOf('--lab')
  return i > 0 ? process.argv[i + 1] : undefined
}
const LAB_DIR = labDirArg()

/** Bir araç çağrısı: komutları sırayla çalıştırır; biri hata verirse ötekiler yine çalışır. */
async function callTool(
  args: Record<string, unknown>,
  progressToken: unknown,
): Promise<{ text: string; isError: boolean }> {
  const line = typeof args.komut === 'string' ? args.komut : ''
  const commands = splitBatch(line)
  if (!commands.length) commands.push('durum')
  if (commands.length > MAX_COMMANDS)
    return { text: `Bir çağrıda en çok ${MAX_COMMANDS} komut çalışır (verilen: ${commands.length}).`, isError: true }
  const parts: string[] = []
  let failed = 0
  let left = MAX_CHARS
  let step = 0
  for (const command of commands) {
    let out: string
    try {
      out = await execute(splitCommandLine(command), parseArgs, EXTRA_COMMANDS, true, {
        agent: true,
        dir: LAB_DIR,
        maxChars: Math.max(600, left),
        onProgress: (message) => {
          if (progressToken === undefined) return
          step++
          send(
            `${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/progress', params: { progressToken, progress: step, message } })}\n`,
          )
        },
      })
    } catch (err) {
      failed++
      out = `Hata: ${err instanceof Error ? err.message : String(err)}`
    }
    left -= out.length
    parts.push(commands.length > 1 ? `▸ ${command}\n${out}` : out)
  }
  return { text: parts.join('\n\n'), isError: failed === commands.length }
}

async function handle(req: Request): Promise<void> {
  const { id, method, params } = req
  // Bildirimler (id yok) yanıtlanmaz
  if (id === undefined || id === null) return
  switch (method) {
    case 'initialize': {
      const wanted = typeof params?.protocolVersion === 'string' ? params.protocolVersion : ''
      reply(id, {
        protocolVersion: PROTOCOLS.includes(wanted) ? wanted : PROTOCOLS[0],
        capabilities: { tools: {} },
        serverInfo: { name: 'tvplus-lab', version: '1.0.0' },
        instructions: INSTRUCTIONS,
      })
      return
    }
    case 'ping':
      reply(id, {})
      return
    case 'tools/list':
      reply(id, { tools: [TOOL] })
      return
    case 'tools/call': {
      if (params?.name !== TOOL.name) {
        fail(id, -32602, `Bilinmeyen araç: ${String(params?.name)}`)
        return
      }
      const args = (params.arguments ?? {}) as Record<string, unknown>
      const meta = (params._meta ?? {}) as Record<string, unknown>
      const r = await callTool(args, meta.progressToken)
      reply(id, { content: [{ type: 'text', text: r.text }], isError: r.isError })
      return
    }
    case 'resources/list':
      reply(id, { resources: [] })
      return
    case 'prompts/list':
      reply(id, { prompts: [] })
      return
    default:
      fail(id, -32601, `Desteklenmeyen yöntem: ${String(method)}`)
  }
}

// İstekler sırayla işlenir: ağır komutlar (simülasyon) üst üste binmez
let queue: Promise<void> = Promise.resolve()
const rl = createInterface({ input: process.stdin, crlfDelay: Infinity })
rl.on('line', (line) => {
  const text = line.trim()
  if (!text) return
  let req: Request
  try {
    req = JSON.parse(text) as Request
  } catch {
    fail(null, -32700, 'Geçersiz JSON')
    return
  }
  // Yoklama sıraya girmez: uzun bir komut sürerken de istemci sunucunun ayakta olduğunu görebilmeli
  if (req.method === 'ping' && req.id !== undefined && req.id !== null) {
    reply(req.id, {})
    return
  }
  queue = queue.then(() =>
    handle(req).catch((err: unknown) => {
      fail(req.id ?? null, -32603, err instanceof Error ? err.message : String(err))
    }),
  )
})
rl.on('close', () => {
  void queue.then(() => process.exit(0))
})

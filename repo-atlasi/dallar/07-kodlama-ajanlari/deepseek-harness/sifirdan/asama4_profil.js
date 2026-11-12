// Aşama 4 — Profil, paket (bundle) ve yama (patch) ile kompozisyon
//
// deepseek-harness'ta çalışan bir `dsh`, açılışta sıralı katmanlardan kurulan bir eklenti ağacıdır:
// profilin paketleri (ör. dsh-base + dsh-headless), profilin cordis.patch.yml'si, ev dizini yaması ve
// komut satırındaki --patch katmanları boş satır listesine sırayla uygulanır. Yama bir satırı kimliğiyle
// hedefler ve config'ini BÜTÜNÜYLE değiştirir ya da yeni satır ekler (docs/architecture.md, "Profiles
// and bundles"; packages/bundle/base/cordis.patch.yml). `dsh --profile web --dump-config` sonucu gösterir.
// Burada satırlar YAML yerine düz nesnedir; eklenti adları bir katalogdan çözülür (yükleyicinin işi).

import { App } from './asama2_baglam.js'
import {
  AgentLoop,
  ApprovalService,
  fsTools,
  LlmService,
  permissionGate,
  SessionLog,
  ToolsService,
  UiChannel,
} from './asama3_harness.js'

/** Ad → eklenti kataloğu (gerçekte paket adı → npm modülü çözümü). */
export const catalog = {
  'dsh-session': SessionLog,
  'dsh-llm': LlmService,
  'dsh-tools': ToolsService,
  'dsh-approval': ApprovalService,
  'dsh-permission': permissionGate,
  'dsh-agent-loop': AgentLoop,
  'dsh-fs-tools': fsTools,
  'dsh-ui': UiChannel,
}

/** Ortak taban paketi: her profilin ilk katmanı. */
export const baseBundle = [
  {
    insert: [
      { id: 'session', name: 'dsh-session' },
      { id: 'llm', name: 'dsh-llm' },
      { id: 'tools', name: 'dsh-tools' },
      { id: 'approval', name: 'dsh-approval' },
      { id: 'permission', name: 'dsh-permission', config: { default: 'ask', rules: { read_file: 'allow' } } },
      { id: 'agent-loop', name: 'dsh-agent-loop', config: { maxSteps: 8 } },
    ],
  },
]

/** Etkileşimli arayüz paketi: arayüz kanalını ekler. */
export const interactiveBundle = [{ insert: [{ id: 'ui', name: 'dsh-ui', config: { answers: [] } }] }]

/** Başsız (headless) paket: soracak kimse yok; onay servisi kapanır, sorulacaklar reddedilir. */
export const headlessBundle = [
  { id: 'approval', disabled: true },
  { id: 'permission', config: { default: 'deny', rules: { read_file: 'allow' } } },
]

/**
 * Katmanları sırayla uygular. İşlemler: { insert: [satır…] } ya da { id, config?, disabled?, name? }.
 * Var olmayan satırı hedefleyen yama sessizce atlanmaz: mini hata fırlatır. dsh'nin kuralı da "yanlış yapılandırma
 * yüksek sesle düşer" (AGENTS.md: "Misconfiguration fails loud"); gömülü yükleyici ise böyle bir yamayı bir uyarı
 * yazıp atlar (vendor/include/src/patch.ts, applyPatches). Mini burada bilerek daha katıdır.
 */
export function applyLayers(...layers) {
  const rows = []
  for (const layer of layers) {
    for (const operation of layer) {
      if (operation.insert) {
        for (const row of operation.insert) {
          if (rows.some((existing) => existing.id === row.id)) throw new Error(`Satır kimliği tekrarlandı: ${row.id}`)
          rows.push({ ...row })
        }
        continue
      }
      const index = rows.findIndex((row) => row.id === operation.id)
      if (index === -1) throw new Error(`Yama bilinmeyen satırı hedefliyor: ${operation.id}`)
      const { id: _id, ...changes } = operation
      rows[index] = { ...rows[index], ...changes } // config bütünüyle değişir, birleştirilmez
    }
  }
  return rows
}

/** Satırları uygulamaya bağlar. Sıra yükleme sırasını belirlemez: inject belirler. */
export function compose(rows, options = {}) {
  const app = new App(options)
  const fibers = new Map()
  for (const row of rows) {
    if (row.disabled) continue
    const plugin = (options.catalog ?? catalog)[row.name]
    if (!plugin) throw new Error(`Katalogda yok: ${row.name}`)
    fibers.set(row.id, app.ctx.plugin(plugin, row.config))
  }
  return { app, fibers }
}

/** `--dump-config` benzeri okunur çıktı. */
export function dumpConfig(rows) {
  return rows
    .map(
      (row) =>
        `${row.disabled ? '#' : '-'} ${row.id}: ${row.name}${row.config ? ` ${JSON.stringify(row.config)}` : ''}`,
    )
    .join('\n')
}

// Aşama 3c — Eklenti sunucusu tarafı (worker_threads içinde çalışır).
//
// Görevleri: (1) eklentileri tembel yüklemek ve etkinleştirmek, (2) her eklentiye kendi `vscode`
// API nesnesini vermek, (3) eklentinin kaydettiği komutları ana tarafa bildirmek ve ana taraf
// çağırınca çalıştırmak.
// Gerçek dosyalar:
//   src/vs/workbench/api/common/extHostExtensionService.ts   (etkinleştirme, activate/deactivate)
//   src/vs/workbench/api/common/extHostCommands.ts            (ExtHostCommands)
//   src/vs/workbench/api/common/extHost.api.impl.ts           (eklenti başına API fabrikası)
//   src/vs/workbench/api/node/extHostExtensionService.ts      (require('vscode') yakalayıcısı)

import Module, { createRequire } from 'node:module'
import path from 'node:path'
import { parentPort, workerData } from 'node:worker_threads'
import { RpcProtocol } from './asama3_rpc.js'

if (!parentPort) throw new Error('Bu dosya bir worker_threads iş parçacığı olarak çalıştırılmalı')

const require = createRequire(import.meta.url)
const rpc = new RpcProtocol(parentPort)
const anaKomutlar = rpc.getProxy('MainThreadCommands')
const anaPencere = rpc.getProxy('MainThreadWindow')

/** @type {{ id: string, dizin: string, main?: string, activationEvents: string[] }[]} */
const eklentiler = workerData.eklentiler
/** @type {Map<string, Function>} bu sunucudaki komut işleyicileri */
const yerelKomutlar = new Map()
/** @type {Map<string, Promise<{ modul: any, baglam: any }>>} */
const etkinler = new Map()
/** @type {Map<string, object>} eklenti başına API nesnesi */
const apiler = new Map()

/** Eklentiye özel `vscode` nesnesi. Her eklenti kendi kopyasını alır (kimin çağırdığı bilinir). */
function apiAl(eklenti) {
  let api = apiler.get(eklenti.id)
  if (api) return api
  api = Object.freeze({
    commands: Object.freeze({
      registerCommand(id, isleyici) {
        if (yerelKomutlar.has(id)) throw new Error(`'${id}' komutu zaten kayıtlı`)
        yerelKomutlar.set(id, isleyici)
        void anaKomutlar.$registerCommand(id)
        return {
          dispose() {
            yerelKomutlar.delete(id)
            void anaKomutlar.$unregisterCommand(id)
          },
        }
      },
      executeCommand(id, ...args) {
        const yerel = yerelKomutlar.get(id)
        if (yerel) return Promise.resolve().then(() => yerel(...args))
        return anaKomutlar.$executeCommand(id, args)
      },
    }),
    window: Object.freeze({
      showInformationMessage: (metin) => anaPencere.$showMessage('bilgi', String(metin), eklenti.id),
      showErrorMessage: (metin) => anaPencere.$showMessage('hata', String(metin), eklenti.id),
    }),
    extension: Object.freeze({ id: eklenti.id }),
  })
  apiler.set(eklenti.id, api)
  return api
}

// require('vscode') çağrısını yakala: hangi eklentinin dosyasından geliyorsa ona ait API'yi ver.
// (Gerçek kod da Module._load'u bu amaçla sarar.)
const asilYukle = Module._load
Module._load = function (istek, ebeveyn, ...geriKalan) {
  if (istek === 'vscode') {
    const dosya = ebeveyn && ebeveyn.filename ? ebeveyn.filename : ''
    const sahibi = eklentiler.find((e) => dosya.startsWith(e.dizin + path.sep))
    if (!sahibi) throw new Error(`'vscode' modülü yalnızca eklenti kodundan istenebilir (${dosya})`)
    return apiAl(sahibi)
  }
  return asilYukle.call(this, istek, ebeveyn, ...geriKalan)
}

/** @param {{ id: string, dizin: string, main?: string }} eklenti */
function etkinlestir(eklenti) {
  let p = etkinler.get(eklenti.id)
  if (!p) {
    p = (async () => {
      if (!eklenti.main) return { modul: {}, baglam: { subscriptions: [] } }
      const modul = require(path.join(eklenti.dizin, eklenti.main))
      const baglam = { subscriptions: [], extensionPath: eklenti.dizin }
      if (typeof modul.activate === 'function') await modul.activate(baglam)
      return { modul, baglam }
    })()
    etkinler.set(eklenti.id, p)
  }
  return p
}

rpc.set('ExtHostExtensionService', {
  $hazirMi: () => true,
  /** @param {string} olay */
  $activateByEvent: async (olay) => {
    const hedefler = eklentiler.filter((e) => e.activationEvents.includes(olay))
    // Bir eklentinin hatası diğerlerini durdurmaz: her biri ayrı raporlanır.
    const sonuclar = await Promise.allSettled(hedefler.map((e) => etkinlestir(e)))
    return sonuclar.map((s, i) =>
      s.status === 'fulfilled'
        ? { id: hedefler[i].id, basarili: true }
        : { id: hedefler[i].id, basarili: false, hata: `${hedefler[i].id} etkinleşemedi: ${s.reason?.message}` },
    )
  },
  $deactivateAll: async () => {
    for (const p of etkinler.values()) {
      try {
        const { modul, baglam } = await p
        if (typeof modul.deactivate === 'function') await modul.deactivate()
        for (const d of baglam.subscriptions) d.dispose?.()
      } catch {
        // etkinleşememiş eklentiyi atla
      }
    }
  },
})

rpc.set('ExtHostCommands', {
  /** @param {string} id @param {...unknown} args */
  $executeContributedCommand: async (id, ...args) => {
    const isleyici = yerelKomutlar.get(id)
    if (!isleyici) throw new Error(`Eklenti sunucusunda '${id}' komutu yok`)
    return await isleyici(...args)
  },
})

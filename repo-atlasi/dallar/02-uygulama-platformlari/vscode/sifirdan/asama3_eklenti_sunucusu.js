// Aşama 3b — Ana taraf: eklenti sunucusunu (extension host) ayrı bir iş parçacığında başlatır.
//
// Neden ayrı? Eklentiler üçüncü taraf koddur. Biri sonsuz döngüye girerse ya da çökerse
// arayüz donmamalı. VS Code masaüstünde eklentileri ayrı bir Node sürecinde (Electron
// "utility process") çalıştırır; tarayıcıda Web Worker'da. Biz `worker_threads` kullanıyoruz.
// Gerçek dosyalar:
//   src/vs/workbench/services/extensions/common/extensionHostManager.ts  (sunucuyu yönetir)
//   src/vs/workbench/api/browser/mainThreadCommands.ts                   (MainThreadCommands)
//   src/vs/platform/extensions/electron-main/extensionHostStarter.ts      (süreci başlatır)

import { Worker } from 'node:worker_threads'
import { RpcProtocol } from './asama3_rpc.js'

/**
 * @typedef {{ id: string, dizin: string, main?: string, activationEvents: string[] }} EklentiTanimi
 * @typedef {{ seviye: string, metin: string, eklenti?: string }} Mesaj
 */

export class ExtensionHost {
  /** @type {Worker | null} */
  #isci = null
  /** @type {RpcProtocol | null} */
  #rpc = null
  /** @type {Map<string, { dispose: () => void }>} eklentilerin ana tarafta açtığı komutlar */
  #komutKayitlari = new Map()
  /** @type {Map<string, Promise<void>>} biten/süren etkinleştirme olayları */
  #olaylar = new Map()

  /**
   * @param {{
   *   eklentiler: EklentiTanimi[],
   *   kayit: import('./asama2_komutlar.js').CommandRegistry,
   *   komutlar: import('./asama2_komutlar.js').CommandService,
   * }} secenek
   */
  constructor({ eklentiler, kayit, komutlar }) {
    this.eklentiler = eklentiler
    this.kayit = kayit
    this.komutlar = komutlar
    /** @type {Mesaj[]} eklentilerin showInformationMessage ile gösterdikleri */
    this.mesajlar = []
    /** @type {'kapali' | 'calisiyor' | 'coktu'} */
    this.durum = 'kapali'
    this.cikisKodu = /** @type {number | null} */ (null)
  }

  async start() {
    const isci = new Worker(new URL('./asama3_eklenti_isci.js', import.meta.url), {
      workerData: { eklentiler: this.eklentiler },
    })
    this.#isci = isci
    const rpc = new RpcProtocol(isci)
    this.#rpc = rpc
    const extHostCommands = rpc.getProxy('ExtHostCommands')

    // Ana tarafın eklentilere açtığı yüzey (gerçek: MainContext.* vekil kimlikleri).
    rpc.set('MainThreadCommands', {
      $registerCommand: (id) => {
        // Komut ana kayda eklenir; çağrılınca istek eklenti sunucusuna geri gider.
        const kayit = this.kayit.registerCommand(id, (...args) =>
          extHostCommands.$executeContributedCommand(id, ...args),
        )
        this.#komutKayitlari.set(id, kayit)
      },
      $unregisterCommand: (id) => {
        this.#komutKayitlari.get(id)?.dispose()
        this.#komutKayitlari.delete(id)
      },
      $executeCommand: (id, args) => this.komutlar.executeCommand(id, ...args),
    })
    rpc.set('MainThreadWindow', {
      $showMessage: (seviye, metin, eklenti) => {
        this.mesajlar.push({ seviye, metin, eklenti })
        return 'Tamam'
      },
    })

    isci.on('error', (e) => this.#coktu(`hata: ${e.message}`))
    isci.on('exit', (kod) => {
      this.cikisKodu = kod
      if (this.durum === 'calisiyor') this.#coktu(`beklenmedik çıkış (kod ${kod})`)
    })

    this.durum = 'calisiyor'
    await rpc.getProxy('ExtHostExtensionService').$hazirMi()
    // '*' isteyen eklentiler açılışta etkinleşir (gerçek: _activateByEvent('*')).
    await this.activateByEvent('*')
  }

  /** @param {string} sebep */
  #coktu(sebep) {
    this.durum = 'coktu'
    this.#rpc?.dispose(`Eklenti sunucusu kapandı: ${sebep}`)
    for (const k of this.#komutKayitlari.values()) k.dispose()
    this.#komutKayitlari.clear()
    this.mesajlar.push({ seviye: 'hata', metin: `Eklenti sunucusu beklenmedik biçimde sonlandı (${sebep})` })
  }

  /**
   * Bir olayı bekleyen eklentileri uyandırır. Aynı olay ikinci kez gelirse aynı Promise döner.
   * @param {string} olay ör. "onCommand:metin.buyukHarf"
   */
  activateByEvent(olay) {
    if (this.durum !== 'calisiyor' || !this.#rpc) return Promise.resolve()
    const ilgilenen = this.eklentiler.some((e) => e.activationEvents.includes(olay))
    if (!ilgilenen) return Promise.resolve()
    let p = this.#olaylar.get(olay)
    if (!p) {
      p = this.#rpc
        .getProxy('ExtHostExtensionService')
        .$activateByEvent(olay)
        .then(
          (sonuclar) => {
            for (const s of sonuclar) {
              if (!s.basarili) this.mesajlar.push({ seviye: 'hata', metin: s.hata, eklenti: s.id })
            }
          },
          (e) => {
            this.mesajlar.push({ seviye: 'hata', metin: e.message })
          },
        )
      this.#olaylar.set(olay, p)
    }
    return p
  }

  /** @param {string} olay */
  activationEventIsDone(olay) {
    return this.#olaylar.has(olay)
  }

  /** Eklentilere deactivate şansı verip iş parçacığını kapatır. */
  async stop() {
    if (this.durum === 'calisiyor' && this.#rpc) {
      try {
        await this.#rpc.getProxy('ExtHostExtensionService').$deactivateAll()
      } catch {
        // kapanırken hata önemli değil
      }
    }
    this.durum = 'kapali'
    this.#rpc?.dispose('Eklenti sunucusu durduruldu')
    await this.#isci?.terminate()
  }
}

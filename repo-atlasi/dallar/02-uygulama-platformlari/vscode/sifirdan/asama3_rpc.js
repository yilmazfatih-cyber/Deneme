// Aşama 3a — İki süreç (burada: iki iş parçacığı) arasında JSON-RPC benzeri protokol.
//
// VS Code'da arayüz (renderer) ile eklenti sunucusu (extension host) ayrı süreçlerdir ve
// birbirlerinin nesnelerini "vekil" (proxy) üzerinden çağırır: ana taraf `MainThreadCommands`,
// eklenti tarafı `ExtHostCommands` gibi adlarla nesne yayımlar; karşı taraf `getProxy(ad)` ile
// alır ve `$` ile başlayan yöntemleri sanki yerelmiş gibi çağırır. Her çağrı bir istek mesajı
// olur, yanıt bir Promise'i çözer ya da reddeder.
// Gerçek: src/vs/workbench/services/extensions/common/rpcProtocol.ts (ikili MessageBuffer,
// iptal belirteçleri, gecikme ölçümü) ve proxyIdentifier.ts.

/**
 * @typedef {{ postMessage: (m: unknown) => void, on: (olay: 'message', f: (m: any) => void) => unknown }} Port
 * @typedef {{ tip: 'istek', no: number, hedef: string, yontem: string, argumanlar: unknown[] }} IstekMesaji
 * @typedef {{ tip: 'yanit', no: number, deger?: unknown, hata?: { ad: string, mesaj: string } }} YanitMesaji
 */

export class RpcProtocol {
  /** @type {Port} */
  #port
  /** @type {Map<string, object>} bu tarafta yayımlanan nesneler */
  #yereller = new Map()
  /** @type {Map<number, { resolve: (v: unknown) => void, reject: (e: Error) => void }>} */
  #bekleyenler = new Map()
  /** @type {Map<string, object>} */
  #vekiller = new Map()
  #sayac = 0
  #kapali = false

  /** @param {Port} port */
  constructor(port) {
    this.#port = port
    port.on('message', (m) => {
      if (m && m.tip === 'istek') void this.#istegiIsle(m)
      else if (m && m.tip === 'yanit') this.#yanitiIsle(m)
    })
  }

  /**
   * Bu taraftaki bir nesneyi karşı tarafa açar (gerçek: rpcProtocol.set(identifier, instance)).
   * @template T
   * @param {string} ad
   * @param {T} nesne
   * @returns {T}
   */
  set(ad, nesne) {
    this.#yereller.set(ad, /** @type {object} */ (nesne))
    return nesne
  }

  /**
   * Karşı taraftaki nesnenin vekili. Yalnızca `$` ile başlayan adlar uzak çağrıya dönüşür.
   * @param {string} ad
   * @returns {Record<string, (...args: unknown[]) => Promise<any>>}
   */
  getProxy(ad) {
    let vekil = this.#vekiller.get(ad)
    if (!vekil) {
      vekil = new Proxy(Object.create(null), {
        get: (hedef, ozellik) => {
          if (typeof ozellik === 'string' && ozellik.startsWith('$') && !hedef[ozellik]) {
            hedef[ozellik] = (...argumanlar) => this.#uzaktanCagir(ad, ozellik, argumanlar)
          }
          return hedef[ozellik]
        },
      })
      this.#vekiller.set(ad, vekil)
    }
    return /** @type {any} */ (vekil)
  }

  /** @param {string} hedef @param {string} yontem @param {unknown[]} argumanlar */
  #uzaktanCagir(hedef, yontem, argumanlar) {
    if (this.#kapali) return Promise.reject(new Error('RPC kanalı kapalı'))
    const no = ++this.#sayac
    return new Promise((resolve, reject) => {
      this.#bekleyenler.set(no, { resolve, reject })
      try {
        // postMessage "yapısal kopya" yapar: fonksiyonlar karşıya gidemez (gerçekte JSON).
        this.#port.postMessage({ tip: 'istek', no, hedef, yontem, argumanlar })
      } catch (e) {
        this.#bekleyenler.delete(no)
        reject(e)
      }
    })
  }

  /** @param {IstekMesaji} m */
  async #istegiIsle(m) {
    /** @type {YanitMesaji} */
    let yanit
    try {
      const nesne = this.#yereller.get(m.hedef)
      if (!nesne) throw new Error(`Bilinmeyen aktör: ${m.hedef}`)
      const f = nesne[m.yontem]
      if (!m.yontem.startsWith('$') || typeof f !== 'function') {
        throw new Error(`${m.hedef} üzerinde ${m.yontem} yöntemi yok`)
      }
      const deger = await f.apply(nesne, m.argumanlar)
      yanit = { tip: 'yanit', no: m.no, deger }
    } catch (e) {
      const hata = e instanceof Error ? e : new Error(String(e))
      yanit = { tip: 'yanit', no: m.no, hata: { ad: hata.name, mesaj: hata.message } }
    }
    if (!this.#kapali) this.#port.postMessage(yanit)
  }

  /** @param {YanitMesaji} m */
  #yanitiIsle(m) {
    const bekleyen = this.#bekleyenler.get(m.no)
    if (!bekleyen) return
    this.#bekleyenler.delete(m.no)
    if (m.hata) {
      const e = new Error(m.hata.mesaj)
      e.name = m.hata.ad
      bekleyen.reject(e)
    } else {
      bekleyen.resolve(m.deger)
    }
  }

  /** Karşı taraf öldüğünde bekleyen tüm çağrıları reddet. @param {string} sebep */
  dispose(sebep = 'RPC kanalı kapandı') {
    this.#kapali = true
    for (const { reject } of this.#bekleyenler.values()) reject(new Error(sebep))
    this.#bekleyenler.clear()
  }

  get bekleyenSayisi() {
    return this.#bekleyenler.size
  }
}

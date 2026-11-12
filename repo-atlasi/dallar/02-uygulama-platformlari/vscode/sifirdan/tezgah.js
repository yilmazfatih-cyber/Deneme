// Dört aşamayı birleştiren küçük "tezgâh" (workbench).
// Gerçekte bu montaj src/vs/workbench/browser/workbench.ts ve workbench.desktop.main.ts'te,
// yüzlerce servis bağımlılık enjeksiyonuyla (src/vs/platform/instantiation) kurulur.

import { ParcaTablosu } from './asama1_parca_tablosu.js'
import {
  CommandRegistry,
  CommandService,
  ContextKeyService,
  KeybindingDispatcher,
  KeybindingResolver,
} from './asama2_komutlar.js'
import { ExtensionHost } from './asama3_eklenti_sunucusu.js'
import { eklentileriTara, katkilariDagit, varsayilanNoktalar } from './asama4_katki_noktalari.js'

/** Yerleşik kısayollar (gerçekte KeybindingsRegistry'ye kod içinden kaydedilir). */
const YERLESIK_KISAYOLLAR = [
  { key: 'ctrl+shift+p', command: 'workbench.action.showCommands' },
  { key: 'ctrl+a', command: 'editor.selectAll', when: 'editorTextFocus' },
]

/**
 * @param {{ eklentiKoku: string, metin?: string, kullaniciKisayollari?: any[],
 *           kullaniciAyarlari?: Record<string, unknown> }} secenek
 */
export async function tezgahKur({ eklentiKoku, metin = '', kullaniciKisayollari = [], kullaniciAyarlari = {} }) {
  const tampon = new ParcaTablosu(metin)
  const baglam = new ContextKeyService()
  baglam.set('editorTextFocus', true)
  baglam.set('editorReadonly', false)

  const kayit = new CommandRegistry()
  /** @type {ExtensionHost | null} */
  let host = null
  const komutlar = new CommandService(kayit, {
    activateByEvent: (olay) => (host ? host.activateByEvent(olay) : Promise.resolve()),
  })

  // Katkı noktalarını oku: kod çalıştırmadan palet, kısayol ve ayarlar hazır olur.
  const noktalar = varsayilanNoktalar()
  const { eklentiler, hatalar } = eklentileriTara(eklentiKoku, noktalar)
  /** @type {{ id: string, etiket: string, eklenti: string }[]} */
  const paletKatkilari = []
  const eklentiKisayollari = []
  /** @type {Record<string, unknown>} */
  const varsayilanAyarlar = {}
  noktalar.setHandler('commands', (katkilar) => {
    for (const { eklenti, deger } of katkilar) {
      for (const k of Array.isArray(deger) ? deger : [deger]) {
        paletKatkilari.push({ id: k.command, etiket: k.category ? `${k.category}: ${k.title}` : k.title, eklenti })
      }
    }
  })
  noktalar.setHandler('keybindings', (katkilar) => {
    for (const { deger } of katkilar) eklentiKisayollari.push(...(Array.isArray(deger) ? deger : [deger]))
  })
  noktalar.setHandler('configuration', (katkilar) => {
    for (const { deger } of katkilar) {
      for (const [anahtar, sema] of Object.entries(deger.properties)) varsayilanAyarlar[anahtar] = sema.default
    }
  })
  katkilariDagit(eklentiler, noktalar)

  const ayarlar = { ...varsayilanAyarlar, ...kullaniciAyarlari }
  const cozumleyici = new KeybindingResolver([...YERLESIK_KISAYOLLAR, ...eklentiKisayollari], kullaniciKisayollari)
  const dagitici = new KeybindingDispatcher(cozumleyici, komutlar, baglam)
  const palet = () => paletKatkilari.map((p) => ({ ...p, kisayol: cozumleyici.lookupKeybinding(p.id) }))

  // Yerleşik komutlar (gerçekte src/vs/editor/contrib/* ve src/vs/workbench/contrib/* altında).
  kayit.registerCommand('editor.getText', () => tampon.getValue())
  kayit.registerCommand('editor.setText', (yeni) => {
    tampon.delete(0, tampon.getLength())
    tampon.insert(0, String(yeni))
    return true
  })
  kayit.registerCommand('editor.selectAll', () => ({ bas: 0, bit: tampon.getLength() }))
  kayit.registerCommand('workbench.action.showCommands', () => palet().map((p) => p.etiket))
  kayit.registerCommand('workbench.getConfiguration', (anahtar) => ayarlar[String(anahtar)])

  host = new ExtensionHost({ eklentiler, kayit, komutlar })
  await host.start()

  return {
    tampon,
    baglam,
    kayit,
    komutlar,
    cozumleyici,
    dagitici,
    host,
    palet,
    ayarlar,
    taramaHatalari: hatalar,
    kapat: () => /** @type {ExtensionHost} */ (host).stop(),
  }
}

// Aşama 4 — BuildOwner, kare döngüsü ve test yardımcısı.
//
// setState → markNeedsBuild → BuildOwner.scheduleBuildFor (kirli listeye ekle, kare iste)
// → (vsync) → drawFrame: buildScope (kirlileri derinlik sırasıyla yeniden build et)
// → flushLayout → flushPaint → finalizeTree (ağaçtan düşenleri sök).
// Gerçek: packages/flutter/lib/src/widgets/framework.dart (BuildOwner: scheduleBuildFor, buildScope,
//         finalizeTree), widgets/binding.dart (WidgetsBinding.drawFrame, runApp),
//         rendering/binding.dart (RendererBinding.drawFrame), scheduler/binding.dart (scheduleFrame,
//         handleBeginFrame, handleDrawFrame), packages/flutter_test (WidgetTester.pumpWidget, pump, tap).

import { Offset, Size } from './asama1_kisitlar.js'
import { PipelineOwner, RenderPointerListener, RenderView } from './asama2_render.js'
import { RenderObjectWidget, SingleChildRenderObjectElement } from './asama3_widget_element.js'

export class BuildOwner {
  /** @type {import('./asama3_widget_element.js').Element[]} */
  dirtyElements = []
  /** @type {Set<import('./asama3_widget_element.js').Element>} */
  inactive = new Set()
  /** @type {(() => void) | null} */
  onBuildScheduled = null
  /** Öğretim için: hangi widget türü kaç kez build edildi */
  buildSayilari = new Map()

  /** @param {import('./asama3_widget_element.js').Element} e */
  scheduleBuildFor(e) {
    if (e._dirtyListede) return
    if (this.dirtyElements.length === 0) this.onBuildScheduled?.()
    this.dirtyElements.push(e)
    e._dirtyListede = true
  }

  /** @param {import('./asama3_widget_element.js').Element} e */
  buildSay(e) {
    const ad = e.widget.constructor.name
    this.buildSayilari.set(ad, (this.buildSayilari.get(ad) ?? 0) + 1)
  }

  /** Kirli Element'leri sığdan derine yeniden build eder. Build sırasında kirlenenler de bu turda işlenir. */
  buildScope() {
    let i = 0
    this.dirtyElements.sort((a, b) => a.depth - b.depth)
    while (i < this.dirtyElements.length) {
      const e = this.dirtyElements[i]
      e.rebuild()
      i++
      // Liste büyüdüyse (ör. InheritedWidget bağımlıları kirlendi) kalan kısmı yeniden sırala.
      if (i < this.dirtyElements.length) {
        const kalan = this.dirtyElements.slice(i).sort((a, b) => a.depth - b.depth)
        this.dirtyElements.splice(i, kalan.length, ...kalan)
      }
    }
    for (const e of this.dirtyElements) e._dirtyListede = false
    this.dirtyElements = []
  }

  /** Bu karede ağaçtan düşen Element'leri kalıcı olarak sök (State.dispose burada çağrılır). */
  finalizeTree() {
    for (const e of this.inactive) e.unmount()
    this.inactive.clear()
  }
}

/** Kök widget: RenderView'i ağaca bağlar (gerçek: RenderObjectToWidgetAdapter / RootWidget). */
class RootWidget extends RenderObjectWidget {
  /** @param {RenderView} renderView @param {import('./asama3_widget_element.js').Widget} child */
  constructor(renderView, child) {
    super()
    this.renderView = renderView
    this.child = child
  }

  createElement() {
    return new SingleChildRenderObjectElement(this)
  }

  createRenderObject() {
    return this.renderView
  }
}

export class Binding {
  /** @param {{ genislik: number, yukseklik: number }} ekran */
  constructor({ genislik, yukseklik }) {
    this.buildOwner = new BuildOwner()
    this.pipelineOwner = new PipelineOwner()
    this.renderView = new RenderView(new Size(genislik, yukseklik))
    this.pipelineOwner.rootNode = this.renderView
    this.renderView.attach(this.pipelineOwner)
    this.kareIstendi = false
    this.kareSayisi = 0
    /** @type {SingleChildRenderObjectElement | null} */
    this.rootElement = null
    // Kirli build ya da yerleşim olunca "kare iste" (gerçekte motordan vsync beklenir).
    this.buildOwner.onBuildScheduled = () => this.scheduleFrame()
    this.pipelineOwner.onNeedVisualUpdate = () => this.scheduleFrame()
  }

  /** @param {import('./asama3_widget_element.js').Widget} uygulama */
  runApp(uygulama) {
    const kok = new RootWidget(this.renderView, uygulama)
    if (!this.rootElement) {
      const e = /** @type {SingleChildRenderObjectElement} */ (kok.createElement())
      e.owner = this.buildOwner
      e.mount(null, null)
      this.rootElement = e
    } else {
      this.rootElement.update(kok)
    }
    this.scheduleFrame()
  }

  scheduleFrame() {
    this.kareIstendi = true
  }

  /** Bir kare üretir ve ASCII görüntüyü döndürür. */
  drawFrame() {
    this.kareIstendi = false
    this.kareSayisi++
    this.buildOwner.buildScope()
    this.pipelineOwner.flushLayout()
    const goruntu = this.pipelineOwner.flushPaint()
    this.buildOwner.finalizeTree()
    return goruntu
  }
}

/**
 * flutter_test'teki WidgetTester'ın küçük kopyası.
 * @param {import('./asama3_widget_element.js').Widget} widget
 * @param {{ genislik?: number, yukseklik?: number }} [ekran]
 */
export function pumpWidget(widget, { genislik = 30, yukseklik = 8 } = {}) {
  const binding = new Binding({ genislik, yukseklik })
  binding.runApp(widget)
  const tester = {
    binding,
    kare: binding.drawFrame(),
    /** Bekleyen kare varsa çiz (setState sonrası). */
    pump() {
      if (binding.kareIstendi) tester.kare = binding.drawFrame()
      return tester.kare
    },
    /** Yeni kök widget ver (aynı ağaç güncellenir, State'ler korunur). @param {any} yeni */
    pumpWidget(yeni) {
      binding.runApp(yeni)
      return tester.pump()
    },
    /** @param {Function} Tur */
    elementler(Tur) {
      const bulunan = []
      const gez = (e) => {
        if (e.widget instanceof Tur) bulunan.push(e)
        e.visitChildren(gez)
      }
      if (binding.rootElement) gez(binding.rootElement)
      return bulunan
    },
    /** @param {Function} Tur */
    state(Tur) {
      return tester.elementler(Tur)[0]?.state
    },
    /** (x, y) hücresine dokun: isabet testi yolundaki en derin onTap kazanır. */
    dokun(x, y) {
      const sonuc = { yol: [] }
      binding.renderView.hitTest(sonuc, new Offset(x, y))
      const hedef = sonuc.yol.find((r) => r instanceof RenderPointerListener && r.onTap)
      hedef?.onTap?.()
      return Boolean(hedef)
    },
  }
  return tester
}

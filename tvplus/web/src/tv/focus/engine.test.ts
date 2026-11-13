import { describe, expect, it, vi } from 'vitest'
import { FocusEngine, ROOT_SCOPE } from './engine'
import type { Rect } from './geometry'

/** Sahte kayıt defteri: elle çalıştırılan zamanlayıcı ve sabit dikdörtgenler. */
function setup() {
  const queue: (() => void)[] = []
  const engine = new FocusEngine({ schedule: (fn) => queue.push(fn) })
  const tick = () => {
    while (queue.length) queue.shift()!()
  }
  const rects = new Map<string, Rect | null>()
  const unregs = new Map<string, () => void>()
  const node = (id: string, scopeId: string, rect: Rect | null, extra: Record<string, unknown> = {}) => {
    rects.set(id, rect)
    unregs.set(id, engine.registerNode({ id, scopeId, getRect: () => rects.get(id) ?? null, ...extra }))
  }
  return { engine, tick, rects, unregs, node }
}
const r = (left: number, top: number, width = 100, height = 60): Rect => ({ left, top, width, height })

/** İki yatay satırlı ekran: satır k, sütun i → r(i*110, k*100) */
function rows(s: ReturnType<typeof setup>, counts: number[]) {
  s.engine.registerScope({ id: 'ekran', trap: true })
  counts.forEach((n, k) => {
    s.engine.registerScope({ id: `satir${k}`, parentId: 'ekran', orientation: 'horizontal' })
    for (let i = 0; i < n; i++) s.node(`k${k}-${i}`, `satir${k}`, r(i * 110, k * 100))
  })
  s.engine.setScreen('ekran')
}

describe('FocusEngine — temel', () => {
  it('ilk kayıtta odak kendiliğinden kurulur (odaksız an kalmaz)', () => {
    const s = setup()
    rows(s, [3])
    expect(s.engine.current()).toBeNull()
    s.tick()
    expect(s.engine.current()).toBe('k0-0')
  })

  it('aynı anda tek odak; odak değişince önceki bilgilendirilir', () => {
    const s = setup()
    const changes: string[] = []
    s.engine.registerScope({ id: 'ekran' })
    s.node('a', 'ekran', r(0, 0), { onFocusedChange: (f: boolean) => changes.push(`a:${f}`) })
    s.node('b', 'ekran', r(110, 0), { onFocusedChange: (f: boolean) => changes.push(`b:${f}`) })
    s.engine.focus('a')
    s.engine.dispatchKey('RIGHT')
    expect(s.engine.current()).toBe('b')
    expect(changes).toEqual(['a:true', 'a:false', 'b:true'])
  })

  it('OK odaktakinin onEnter işlevini çağırır', () => {
    const s = setup()
    const onEnter = vi.fn()
    s.node('a', ROOT_SCOPE, r(0, 0), { onEnter })
    s.tick()
    expect(s.engine.dispatchKey('OK')).toBe(true)
    expect(onEnter).toHaveBeenCalledOnce()
  })

  it('onArrow true dönerse yön tüketilir', () => {
    const s = setup()
    s.node('a', ROOT_SCOPE, r(0, 0), { onArrow: (d: string) => d === 'right' })
    s.node('b', ROOT_SCOPE, r(110, 0))
    s.engine.focus('a')
    s.engine.dispatchKey('RIGHT')
    expect(s.engine.current()).toBe('a')
    s.engine.dispatchKey('LEFT')
    expect(s.engine.current()).toBe('a')
  })
})

describe('FocusEngine — kapsam hafızası', () => {
  it('↓ / ↑ satır değiştirirken her satır son odaklanan kartını hatırlar', () => {
    const s = setup()
    rows(s, [6, 6])
    s.tick()
    s.engine.dispatchKey('RIGHT')
    s.engine.dispatchKey('RIGHT')
    s.engine.dispatchKey('RIGHT') // k0-3
    s.engine.dispatchKey('DOWN')
    expect(s.engine.current()).toBe('k1-3') // hafıza yok → yataydaki en yakın
    s.engine.dispatchKey('LEFT')
    s.engine.dispatchKey('LEFT') // k1-1
    s.engine.dispatchKey('UP')
    expect(s.engine.current()).toBe('k0-3') // satır 0 hatırladı
    s.engine.dispatchKey('DOWN')
    expect(s.engine.current()).toBe('k1-1') // satır 1 hatırladı
  })

  it('hafıza yoksa kısa satırda en yakın karta iner', () => {
    const s = setup()
    rows(s, [6, 2])
    s.engine.focus('k0-5')
    s.engine.dispatchKey('DOWN')
    expect(s.engine.current()).toBe('k1-1')
  })

  it('kapsamın varsayılanı hafızadan sonra gelir', () => {
    const s = setup()
    s.engine.registerScope({ id: 'menu', defaultFocusId: 'm2' })
    s.node('m1', 'menu', r(0, 0))
    s.node('m2', 'menu', r(0, 70))
    s.engine.focusScope('menu')
    expect(s.engine.current()).toBe('m2')
    s.engine.focus('m1')
    s.node('x', ROOT_SCOPE, r(300, 0))
    s.engine.focus('x')
    s.engine.focusScope('menu')
    expect(s.engine.current()).toBe('m1')
  })

  it('yatay satırda ↑/↓ satır içinde aday aramaz', () => {
    const s = setup()
    s.engine.registerScope({ id: 'satir', orientation: 'horizontal' })
    s.node('a', 'satir', r(0, 0))
    s.node('b', 'satir', r(0, 100)) // satırın içinde ama altta (yapay)
    s.node('dis', ROOT_SCOPE, r(0, 300))
    s.engine.focus('a')
    s.engine.dispatchKey('DOWN')
    expect(s.engine.current()).toBe('dis')
  })
})

describe('FocusEngine — mühürlü eksen', () => {
  it('satırın sonunda → başka satıra ya da yukarıdaki düğmelere kaymaz', () => {
    const s = setup()
    rows(s, [1, 3])
    s.node('dugme', 'ekran', r(300, -100)) // sağ üstte vitrin düğmesi
    s.engine.focus('k0-0')
    s.engine.dispatchKey('RIGHT')
    expect(s.engine.current()).toBe('k0-0')
    s.engine.focus('k1-2')
    s.engine.dispatchKey('RIGHT')
    expect(s.engine.current()).toBe('k1-2')
    // dikey yön mühürlü değildir
    s.engine.focus('k0-0')
    s.engine.dispatchKey('UP')
    expect(s.engine.current()).toBe('dugme')
  })

  it('mühürlü olsa da kenar işleyicileri çalışır', () => {
    const s = setup()
    const onEdge = vi.fn(() => true)
    s.engine.registerScope({ id: 'ekran', onEdge })
    s.engine.registerScope({ id: 'satir', parentId: 'ekran', orientation: 'horizontal' })
    s.node('k0', 'satir', r(100, 0))
    s.node('sol', 'ekran', r(0, 0, 50, 60)) // solda öğe olsa da kenar işleyicisi kazanır
    s.engine.focus('k0')
    s.engine.dispatchKey('LEFT')
    expect(onEdge).toHaveBeenCalledWith('left')
    expect(s.engine.current()).toBe('k0')
  })
})

describe('FocusEngine — kapsam hafızası kalıcılığı', () => {
  it('kapsam kalkıp aynı kimlikle gelince hafızası geri yüklenir (ekrana dönüş)', () => {
    const s = setup()
    const off = s.engine.registerScope({ id: 'satir', orientation: 'horizontal' })
    s.node('a', 'satir', r(0, 0))
    s.node('b', 'satir', r(110, 0))
    s.node('dis', ROOT_SCOPE, r(0, 200))
    s.engine.focus('b')
    s.engine.focus('dis')
    s.unregs.get('a')!()
    s.unregs.get('b')!()
    off()
    s.engine.registerScope({ id: 'satir', orientation: 'horizontal' })
    s.node('a', 'satir', r(0, 0))
    s.node('b', 'satir', r(110, 0))
    s.engine.dispatchKey('UP')
    expect(s.engine.current()).toBe('b')
  })

  it("StrictMode'daki çift bağlamada pencerenin dönüş hedefi kaybolmaz; pencere her açılışta varsayılandan başlar", () => {
    const s = setup()
    s.node('ac', ROOT_SCOPE, r(0, 0))
    s.node('baska', ROOT_SCOPE, r(110, 0))
    s.engine.focus('ac')
    const open = () => {
      const off = s.engine.registerScope({
        id: 'pencere',
        trap: true,
        restore: true,
        modal: true,
        defaultFocusId: 'hayir',
      })
      s.node('evet', 'pencere', r(500, 500))
      s.node('hayir', 'pencere', r(610, 500))
      s.engine.focusScope('pencere')
      return () => {
        s.unregs.get('evet')!()
        s.unregs.get('hayir')!()
        off()
      }
    }
    // bağla → (StrictMode) kaldır → yeniden bağla
    open()()
    const close = open()
    s.tick()
    expect(s.engine.current()).toBe('hayir')
    s.engine.dispatchKey('LEFT')
    expect(s.engine.current()).toBe('evet')
    close()
    s.tick()
    expect(s.engine.current()).toBe('ac')
    open()
    expect(s.engine.current()).toBe('hayir')
  })
})

describe('FocusEngine — tuzak ve kenarlar', () => {
  it('tuzaklı kapsamdan yön tuşuyla çıkılamaz', () => {
    const s = setup()
    s.engine.registerScope({ id: 'pencere', trap: true })
    s.node('p1', 'pencere', r(500, 300))
    s.node('p2', 'pencere', r(610, 300))
    s.node('arka', ROOT_SCOPE, r(0, 300))
    s.engine.focus('p1')
    expect(s.engine.dispatchKey('LEFT')).toBe(true)
    expect(s.engine.current()).toBe('p1')
    s.engine.dispatchKey('RIGHT')
    expect(s.engine.current()).toBe('p2')
  })

  it('onEdge: ilk karttayken ← kenar işleyicisine gider (yan menüyü açar)', () => {
    const s = setup()
    const onEdge = vi.fn((d: string) => {
      if (d !== 'left') return false
      s.engine.focusScope('menu')
      return true
    })
    s.engine.registerScope({ id: 'menu', trap: true, onEdge: (d) => d === 'right' && s.engine.focusScreen() })
    s.node('menu-ana', 'menu', r(0, 0, 50, 50))
    s.engine.registerScope({ id: 'ekran', trap: true, onEdge })
    s.engine.setScreen('ekran')
    s.engine.registerScope({ id: 'satir', parentId: 'ekran', orientation: 'horizontal' })
    s.node('k0', 'satir', r(100, 0))
    s.node('k1', 'satir', r(210, 0))
    s.engine.focus('k1')
    s.engine.dispatchKey('LEFT')
    expect(s.engine.current()).toBe('k0')
    expect(onEdge).not.toHaveBeenCalled()
    s.engine.dispatchKey('LEFT')
    expect(onEdge).toHaveBeenCalledWith('left')
    expect(s.engine.current()).toBe('menu-ana')
    expect(s.engine.isWithin('menu')).toBe(true)
    s.engine.dispatchKey('RIGHT')
    expect(s.engine.current()).toBe('k0') // ekran hafızası
  })
})

describe('FocusEngine — yedeğe geçiş', () => {
  it('odaktaki düğüm kalkarsa sonraki tikte kapsamın hatırladığına / ilk çocuğuna geçer', () => {
    const s = setup()
    rows(s, [3, 3])
    s.engine.focus('k1-0')
    s.engine.focus('k1-2')
    s.unregs.get('k1-2')!()
    expect(s.engine.current()).toBeNull()
    s.tick()
    expect(s.engine.current()).toBe('k1-0')
  })

  it('kapsam tamamen kalkarsa üst kapsama, oradan ekranın hafızasına düşer', () => {
    const s = setup()
    rows(s, [3, 3])
    s.engine.focus('k0-1')
    s.engine.focus('k1-2')
    for (const id of ['k1-0', 'k1-1', 'k1-2']) s.unregs.get(id)!()
    s.tick()
    expect(s.engine.current()).toBe('k0-0') // ekranın hatırladığı k1-2 yok → ilk düğüm
  })

  it('devre dışı kalan düğüm odağı bırakır', () => {
    const s = setup()
    s.engine.registerScope({ id: 'ekran' })
    s.node('a', 'ekran', r(0, 0))
    s.node('b', 'ekran', r(110, 0))
    s.engine.focus('b')
    s.engine.updateNode('b', { disabled: true })
    s.tick()
    expect(s.engine.current()).toBe('a')
    s.engine.dispatchKey('RIGHT')
    expect(s.engine.current()).toBe('a')
  })

  it('restore: iletişim kutusu kapanınca açılmadan önceki düğüme döner', () => {
    const s = setup()
    s.engine.registerScope({ id: 'ekran' })
    s.node('a', 'ekran', r(0, 0))
    s.node('b', 'ekran', r(110, 0))
    s.engine.focus('b')
    const unscope = s.engine.registerScope({ id: 'pencere', trap: true, restore: true, modal: true })
    s.node('tamam', 'pencere', r(500, 500))
    s.engine.focusScope('pencere')
    expect(s.engine.current()).toBe('tamam')
    // React sırası: önce düğüm, sonra kapsam temizlenir (ya da tersi) — ikisi de çalışmalı.
    s.unregs.get('tamam')!()
    unscope()
    s.tick()
    expect(s.engine.current()).toBe('b')
  })

  it('restore: kapsam düğümden önce kalksa da döner', () => {
    const s = setup()
    s.node('a', ROOT_SCOPE, r(0, 0))
    s.node('b', ROOT_SCOPE, r(110, 0))
    s.engine.focus('b')
    const unscope = s.engine.registerScope({ id: 'pencere', trap: true, restore: true })
    s.node('tamam', 'pencere', r(500, 500))
    s.engine.focusScope('pencere')
    unscope()
    s.unregs.get('tamam')!()
    s.tick()
    expect(s.engine.current()).toBe('b')
  })

  it('modal kapsam açıkken dışarıya tıklama yok sayılır', () => {
    const s = setup()
    s.node('arka', ROOT_SCOPE, r(0, 0))
    s.engine.registerScope({ id: 'pencere', trap: true, modal: true })
    s.node('tamam', 'pencere', r(500, 500))
    s.engine.focus('tamam')
    expect(s.engine.click('arka')).toBe(false)
    expect(s.engine.current()).toBe('tamam')
  })

  it('kendiliğinden kurulan odak, sonradan gelen autoFocus düğümüne devredilir; kullanıcı tuşa bastıysa devredilmez', () => {
    const s = setup()
    s.engine.registerScope({ id: 'ekran' })
    s.engine.setScreen('ekran')
    s.node('geri', 'ekran', r(0, 0))
    s.tick()
    expect(s.engine.current()).toBe('geri')
    s.node('ilk-kart', 'ekran', r(0, 200), { autoFocus: true })
    s.tick()
    expect(s.engine.current()).toBe('ilk-kart')

    const t = setup()
    t.node('geri', ROOT_SCOPE, r(0, 0))
    t.node('ileri', ROOT_SCOPE, r(110, 0))
    t.tick()
    t.engine.dispatchKey('RIGHT')
    t.node('gec', ROOT_SCOPE, r(0, 200), { autoFocus: true })
    t.tick()
    expect(t.engine.current()).toBe('ileri')
  })

  it('aynı kimlikle yeniden bağlanan düğüm odağını korur (StrictMode)', () => {
    const s = setup()
    s.node('a', ROOT_SCOPE, r(0, 0))
    s.node('b', ROOT_SCOPE, r(110, 0))
    s.engine.focus('b')
    s.unregs.get('b')!()
    s.node('b', ROOT_SCOPE, r(110, 0))
    s.tick()
    expect(s.engine.current()).toBe('b')
  })
})

describe('FocusEngine — ekran odak talebi (geç gelen içerik)', () => {
  /** Yan menü + boş ekran: menüde OK'a basılmış, ekran veri bekliyor. */
  function railAndEmptyScreen() {
    const s = setup()
    s.engine.registerScope({ id: 'menu', trap: true })
    s.node('menu-profil', 'menu', r(0, 0, 50, 50))
    s.node('menu-diziler', 'menu', r(0, 100, 50, 50))
    s.engine.focus('menu-diziler')
    s.engine.dispatchKey('OK') // yan menüden seçim (yol değişir)
    s.engine.registerScope({ id: 'ekran', trap: true })
    s.engine.setScreen('ekran')
    s.engine.claimScope('ekran')
    return s
  }

  it('içerik tuşa basıldıktan sonra gelse de odak ilk karta iner', () => {
    const s = railAndEmptyScreen()
    expect(s.engine.current()).toBe('menu-diziler')
    s.node('kart-0', 'ekran', r(200, 300))
    s.node('kart-1', 'ekran', r(310, 300))
    s.tick()
    expect(s.engine.current()).toBe('kart-0')
  })

  it('izleyici bu arada tuşa bastıysa talep düşer', () => {
    const s = railAndEmptyScreen()
    s.engine.dispatchKey('UP')
    expect(s.engine.current()).toBe('menu-profil')
    s.node('kart-0', 'ekran', r(200, 300))
    s.tick()
    expect(s.engine.current()).toBe('menu-profil')
  })

  it('odak yedeğe (menünün profil öğesine) düştüyse içerik gelince ekrana döner', () => {
    const s = setup()
    s.engine.registerScope({ id: 'menu', trap: true })
    s.node('menu-profil', 'menu', r(0, 0, 50, 50))
    const off = s.engine.registerScope({ id: 'ekran', trap: true })
    s.engine.setScreen('ekran')
    s.node('eski', 'ekran', r(200, 300))
    s.engine.claimScope('ekran')
    expect(s.engine.current()).toBe('eski')
    // aynı adreste yeniden bağlanma: eski içerik kalkar, yenisi henüz yok
    s.unregs.get('eski')!()
    off()
    s.tick()
    expect(s.engine.current()).toBe('menu-profil')
    s.engine.registerScope({ id: 'ekran', trap: true })
    s.engine.setScreen('ekran')
    s.engine.claimScope('ekran')
    s.node('yeni', 'ekran', r(200, 300))
    s.tick()
    expect(s.engine.current()).toBe('yeni')
  })

  it('hatırlanan kart geç çizilirse genel öğeden ona geçilir', () => {
    const s = setup()
    const off = s.engine.registerScope({ id: 'ekran', trap: true })
    s.node('geri', 'ekran', r(0, 0))
    s.node('kart-7', 'ekran', r(200, 300))
    s.engine.focus('kart-7')
    s.unregs.get('geri')!()
    s.unregs.get('kart-7')!()
    off()
    // ekrana dönüş: önce yalnız Geri düğmesi, kart veri gelince
    s.engine.registerScope({ id: 'ekran', trap: true })
    s.node('geri', 'ekran', r(0, 0))
    s.engine.claimScope('ekran')
    expect(s.engine.current()).toBe('geri')
    s.node('kart-7', 'ekran', r(200, 300))
    s.tick()
    expect(s.engine.current()).toBe('kart-7')
    expect(s.engine.pendingClaim()).toBeNull()
  })

  it('kapsam dışındaki modal pencereye dokunmaz', () => {
    const s = setup()
    s.engine.registerScope({ id: 'pencere', trap: true, modal: true })
    s.node('tamam', 'pencere', r(500, 500))
    s.engine.focus('tamam', 'auto')
    s.engine.registerScope({ id: 'ekran', trap: true })
    s.engine.claimScope('ekran')
    s.node('kart', 'ekran', r(0, 0))
    s.tick()
    expect(s.engine.current()).toBe('tamam')
  })
})

describe('FocusEngine — tuş kesiciler', () => {
  it('öncelik sırası, eşitlikte son eklenen önce; true tüketir', () => {
    const s = setup()
    s.node('a', ROOT_SCOPE, r(0, 0))
    s.node('b', ROOT_SCOPE, r(110, 0))
    s.engine.focus('a')
    const seen: string[] = []
    s.engine.addInterceptor((k) => {
      seen.push(`kabuk:${k}`)
      return k === 'BACK'
    }, -100)
    const off = s.engine.addInterceptor((k) => {
      seen.push(`oynatici:${k}`)
      return k === 'RIGHT'
    }, 100)
    s.engine.addInterceptor((k) => {
      seen.push(`ekran:${k}`)
    })
    expect(s.engine.dispatchKey('RIGHT')).toBe(true)
    expect(s.engine.current()).toBe('a')
    expect(seen).toEqual(['oynatici:RIGHT'])
    off()
    seen.length = 0
    s.engine.dispatchKey('RIGHT')
    expect(s.engine.current()).toBe('b')
    expect(seen).toEqual(['ekran:RIGHT', 'kabuk:RIGHT'])
    expect(s.engine.dispatchKey('BACK')).toBe(true)
    expect(s.engine.dispatchKey('HOME')).toBe(false)
  })
})

describe('FocusEngine — rastgele gezinti', () => {
  it('200 rastgele yön tuşundan sonra her adımda tam bir odak vardır', () => {
    const s = setup()
    rows(s, [7, 3, 5, 1, 6])
    s.tick()
    let seed = 7
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31
      return seed / 2 ** 31
    }
    const keys = ['UP', 'DOWN', 'LEFT', 'RIGHT'] as const
    for (let i = 0; i < 200; i++) {
      s.engine.dispatchKey(keys[Math.floor(rand() * 4)]!)
      // Arada bir düğüm kalkıp geri gelir.
      if (i % 37 === 0) {
        const cur = s.engine.current()!
        const scope = `satir${cur.slice(1, cur.indexOf('-'))}`
        s.unregs.get(cur)!()
        s.tick()
        s.node(cur, scope, s.rects.get(cur) ?? null)
      }
      expect(s.engine.current()).not.toBeNull()
    }
  })
})

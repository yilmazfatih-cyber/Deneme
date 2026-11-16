import { describe, expect, it } from 'vitest'
import {
  aabbManifold,
  aabbOverlap,
  ActionMap,
  Animation,
  Camera,
  circleAabbManifold,
  circleManifold,
  createBody,
  defineComponent,
  FixedLoop,
  frameFromMasks,
  freeFall,
  InputState,
  integrate,
  ParticlePool,
  pollGamepads,
  resolveStatic,
  Rng,
  SceneManager,
  SpatialHash,
  TileMap,
  World,
  type Aabb,
} from '../../src/oyun_motoru/index.ts'

describe('sabit adımlı döngü', () => {
  it('geçen süreyi sabit adımlara böler, artanı alpha olarak verir, uzun kareyi kırpar', () => {
    const updates: number[] = []
    const alphas: number[] = []
    const loop = new FixedLoop({ step: 1 / 60, update: (dt) => updates.push(dt), render: (a) => alphas.push(a) })
    expect(loop.advance(1 / 30 + 1 / 120)).toBe(2)
    expect(alphas.at(-1)).toBeCloseTo(0.5, 6)
    expect(loop.advance(0.01)).toBe(1)
    expect(loop.advance(10)).toBe(15)
    expect(updates.every((dt) => dt === 1 / 60)).toBe(true)
  })

  it('istek/iptal işlevleriyle başlar ve durur', () => {
    const callbacks: ((t: number) => void)[] = []
    let updates = 0
    const loop = new FixedLoop({
      update: () => updates++,
      now: () => 0,
      requestFrame: (cb) => callbacks.push(cb),
      cancelFrame: () => undefined,
    })
    loop.start()
    callbacks.shift()!(50)
    expect(updates).toBe(3)
    loop.stop()
    expect(loop.running).toBe(false)
  })
})

describe('ECS', () => {
  const Pos = defineComponent<{ x: number }>('Pos')
  const Tag = defineComponent<true>('Tag')

  it('sorgu tüm bileşenleri isteyen varlıkları verir; silme kare sonuna ertelenir', () => {
    const world = new World()
    const a = world.create()
    const b = world.create()
    world.add(a, Pos, { x: 1 })
    world.add(b, Pos, { x: 2 })
    world.add(b, Tag, true)
    expect(world.query(Pos, Tag)).toEqual([b])
    for (const e of world.query(Pos)) world.destroy(e)
    expect(world.isAlive(a)).toBe(false)
    expect(world.query(Pos)).toEqual([])
    expect(world.count).toBe(2)
    world.flush()
    expect(world.count).toBe(0)
    expect(() => world.add(a, Pos, { x: 0 })).toThrow(/önce world.create/)
    const c = world.create()
    expect(() => world.need(c, Pos)).toThrow(/"Pos" bileşeni yok/)
  })
})

describe('girdi', () => {
  const map = new ActionMap(['sol', 'sag', 'zipla'] as const)

  it('maskeden basıldı/bırakıldı kenarlarını çıkarır; kısa dokunuş kaybolmaz', () => {
    const frame = frameFromMasks(0b011, 0b110)
    expect([map.wasPressed(frame, 'zipla'), map.wasReleased(frame, 'sol'), map.isDown(frame, 'sag')]).toEqual([
      true,
      true,
      true,
    ])
    const input = new InputState(map)
    input.setSource('klavye', 'zipla', true)
    input.setSource('klavye', 'zipla', false)
    expect(map.wasPressed(input.sample(), 'zipla')).toBe(true)
    expect(input.sample().mask).toBe(0)
  })

  it('birden çok kaynak aynı eylemi tutar; oyun kolu yoklanır', () => {
    const input = new InputState(map)
    input.setSource('klavye', 'sol', true)
    input.setSource('dokunma', 'sol', true)
    input.setSource('klavye', 'sol', false)
    expect(map.isDown(input.sample(), 'sol')).toBe(true)
    const pad = { axes: [0.9, 0], buttons: [{ pressed: true }] } as unknown as Gamepad
    pollGamepads(input, { buttons: { zipla: [0] }, axes: { sag: { axis: 0, direction: 1 } } }, [pad, null])
    const frame = input.sample()
    expect([map.isDown(frame, 'zipla'), map.isDown(frame, 'sag')]).toEqual([true, true])
    expect(() => map.bit('uç' as never)).toThrow(/Bilinmeyen eylem "uç"/)
  })
})

describe('çarpışma', () => {
  it('kutu-kutu: en az geçen eksen, A→B normali', () => {
    expect(aabbManifold({ x: 0, y: 0, w: 10, h: 10 }, { x: 8, y: 1, w: 10, h: 10 })).toEqual({ nx: 1, ny: 0, depth: 2 })
    expect(aabbManifold({ x: 0, y: 0, w: 10, h: 10 }, { x: 1, y: -9, w: 10, h: 10 })).toEqual({
      nx: 0,
      ny: -1,
      depth: 1,
    })
    expect(aabbOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 5, h: 5 })).toBe(false)
  })

  it('daire-daire ve daire-kutu (merkez içerideyken de)', () => {
    const m = circleManifold({ x: 0, y: 0, r: 2 }, { x: 3, y: 0, r: 2 })!
    expect([m.nx, m.ny, m.depth]).toEqual([1, 0, 1])
    expect(circleManifold({ x: 0, y: 0, r: 1 }, { x: 3, y: 0, r: 1 })).toBeNull()
    const side = circleAabbManifold({ x: -1, y: 5, r: 2 }, { x: 0, y: 0, w: 10, h: 10 })!
    expect([side.nx, side.ny, side.depth]).toEqual([1, 0, 1])
    const inside = circleAabbManifold({ x: 5, y: 1, r: 2 }, { x: 0, y: 0, w: 10, h: 10 })!
    expect([inside.nx, inside.ny, inside.depth]).toEqual([0, 1, 3])
  })

  it('uzamsal karma, kaba kuvvetle bulunan tüm çakışmaları aday olarak verir', () => {
    const rng = new Rng(42)
    const boxes: Aabb[] = Array.from({ length: 120 }, () => ({
      x: rng.range(0, 300),
      y: rng.range(0, 300),
      w: rng.range(2, 30),
      h: rng.range(2, 30),
    }))
    const hash = new SpatialHash(24)
    boxes.forEach((b, i) => hash.insert(i, b))
    const candidates = new Set(hash.pairs().map(([a, b]) => `${a}|${b}`))
    let overlaps = 0
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        if (aabbOverlap(boxes[i]!, boxes[j]!)) {
          overlaps++
          expect(candidates.has(`${i}|${j}`)).toBe(true)
        }
      }
    }
    expect(overlaps).toBeGreaterThan(0)
    expect(candidates.size).toBeLessThan((120 * 119) / 2 / 4)
  })
})

describe('fizik ve karo haritası', () => {
  it('serbest düşüş kapalı formüle yakınsar (yarı örtük Euler hatası adım boyuyla orantılı)', () => {
    const pos = { x: 0, y: 0 }
    const body = createBody()
    for (let i = 0; i < 60; i++) integrate(pos, body, 1 / 60, 900)
    expect(body.vy).toBeCloseTo(900, 6)
    expect(Math.abs(pos.y - freeFall(0, 0, 900, 1))).toBeLessThan(900 / 60)
  })

  it('sekme: normal hız tersine döner ve katsayıyla çarpılır; teğet hız korunur', () => {
    const pos = { x: 0, y: 10 }
    const body = createBody({ vx: 3, vy: 10, restitution: 0.5 })
    resolveStatic(pos, body, { nx: 0, ny: 1, depth: 2 })
    expect([pos.y, body.vx, body.vy, body.onGround]).toEqual([8, 3, -5, true])
  })

  it('kutu yere iner, duvarda durur, hızlı harekette duvardan geçmez', () => {
    const map = TileMap.fromRows(['#....#', '#....#', '######'], 16, { '#': 1 })
    const fall = map.moveBox({ x: 20, y: 0, w: 12, h: 12 }, 0, 40)
    expect([fall.y, fall.onGround, fall.hitY]).toEqual([20, true, true])
    const wall = map.moveBox({ x: 20, y: 4, w: 12, h: 12 }, 100, 0)
    expect([wall.x, wall.hitX]).toEqual([68, true])
    const left = map.moveBox({ x: 20, y: 4, w: 12, h: 12 }, -1000, 0)
    expect(left.x).toBe(16)
  })
})

describe('kamera, parçacık, animasyon, sahne', () => {
  it('kamera hedefi izler ve dünya sınırında durur', () => {
    const cam = new Camera(100, 50, { x: 0, y: 0, w: 300, h: 100 })
    cam.snapTo(10, 10)
    expect([cam.x, cam.y]).toEqual([0, 0])
    for (let i = 0; i < 200; i++) cam.follow(1000, 1000, 1 / 60)
    expect([cam.x, cam.y]).toEqual([200, 50])
    expect(cam.worldToScreen(250, 60)).toEqual({ x: 50, y: 10 })
  })

  it('parçacık havuzu belleği yeniden kullanır; aynı tohum aynı parçacıkları üretir', () => {
    const run = () => {
      const pool = new ParticlePool(8)
      const rng = new Rng(3)
      pool.emit(0, 0, { count: 12, speed: [10, 20], life: [0.5, 1], color: 0xffffff }, rng)
      pool.update(0.1)
      return [pool.aliveCount, pool.x[0], pool.y[0]]
    }
    expect(run()).toEqual(run())
    expect(run()[0]).toBe(8)
  })

  it('animasyon kare sürelerine göre ilerler; tekrarsız animasyon son karede biter', () => {
    const anim = new Animation([0.1, 0.2], false)
    anim.update(0.15)
    expect(anim.frame).toBe(1)
    anim.update(0.3)
    expect([anim.frame, anim.finished]).toEqual([1, true])
    const looping = new Animation([0.1, 0.1])
    looping.update(0.25)
    expect(looping.frame).toBe(0)
  })

  it('sahne yığını: yalnız üstteki güncellenir, hepsi alttan üste çizilir', () => {
    const log: string[] = []
    const scene = (name: string) => ({
      name,
      update: () => log.push(`güncelle ${name}`),
      render: () => log.push(`çiz ${name}`),
      exit: () => log.push(`çık ${name}`),
    })
    const scenes = new SceneManager()
    scenes.push(scene('oyun'))
    scenes.push(scene('duraklat'))
    scenes.update(1)
    scenes.render(0)
    scenes.replace(scene('menü'))
    expect(log).toEqual(['güncelle duraklat', 'çiz oyun', 'çiz duraklat', 'çık duraklat', 'çık oyun'])
    expect(scenes.top?.name).toBe('menü')
  })
})

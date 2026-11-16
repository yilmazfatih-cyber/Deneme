// "Damla": motorun özgün örnek oyunu (başsız mantık; çizim render.ts'te). Bir su damlası mağarada dolaşıp
// tohumları toplar; tüm tohumlar toplanınca kaynak açılır ve damla oraya ulaşınca kazanır. Sekerek dolaşan
// korlar damlayı buharlaştırır (can azalır), yağmur damlaları can verir. Her şey programla çizilir.
// Mantık yalnız (tohum, adım başına girdi) ile ilerler: aynı kayıt → aynı oyun (test: durum özeti).
// Görsel rastgelelik (parçacık, sarsıntı) ayrı bir RNG kullanır: çizim kapatılsa da oyun mantığı değişmez.
// Genişletme: yeni varlık türü = `Kind`'e üye + `spawn`'da kurulum + `touch`'ta etkileşim kuralı.
import { Camera } from '../camera.ts'
import { circleAabbManifold, circleBounds, circleManifold, type Aabb } from '../collision.ts'
import { defineComponent, World, type Entity } from '../ecs.ts'
import { ActionMap, frameFromMasks, type InputFrame } from '../input.ts'
import { ParticlePool } from '../particles.ts'
import { createBody, resolveStatic, type Body } from '../physics.ts'
import { hashNumbers, type Recording } from '../replay.ts'
import { Rng } from '../rng.ts'
import { SpatialHash } from '../spatial_hash.ts'
import { TileMap } from '../tilemap.ts'
import { LEVEL_1, TILE } from './level.ts'

export const ACTIONS = ['left', 'right', 'jump'] as const
export type Action = (typeof ACTIONS)[number]
export const actions = new ActionMap<Action>(ACTIONS)

export const STEP = 1 / 60
export const PHYSICS = { gravity: 900, jumpSpeed: 330, runSpeed: 120, maxFall: 420, emberSpeed: 70 } as const
export const MAX_HEALTH = 3

export type Kind = 'player' | 'seed' | 'ember' | 'rain' | 'exit'
export const Position = defineComponent<{ x: number; y: number; px: number; py: number }>('Position')
export const Size = defineComponent<{ w: number; h: number }>('Size')
export const Radius = defineComponent<{ r: number }>('Radius')
export const Motion = defineComponent<Body>('Motion')
export const KindOf = defineComponent<Kind>('Kind')

export type GameEvent = 'seed' | 'hurt' | 'rain' | 'jump' | 'exit-open' | 'win' | 'lose'
export type Status = 'playing' | 'won' | 'lost'

export class DropletGame {
  readonly world = new World()
  readonly map: TileMap
  readonly rng: Rng
  readonly fx: Rng
  readonly particles = new ParticlePool(300)
  readonly camera: Camera
  readonly seedsTotal: number
  player: Entity = 0
  seedsLeft = 0
  health = MAX_HEALTH
  invulnerable = 0
  time = 0
  ticks = 0
  status: Status = 'playing'
  /** Bu adımda olanlar (ses ve duyurular için); her adımda sıfırlanır. */
  events: GameEvent[] = []
  private coyote = 0
  private jumpBuffer = 0
  private readonly broad = new SpatialHash(TILE * 2)

  constructor(seed: number, rows: readonly string[] = LEVEL_1, view = { w: 320, h: 180 }) {
    this.rng = new Rng(seed)
    this.fx = new Rng(seed ^ 0x9e3779b9)
    this.map = TileMap.fromRows(rows, TILE, { '#': 1 }, (ch, tx, ty) => this.spawn(ch, tx, ty))
    this.seedsTotal = this.seedsLeft
    this.camera = new Camera(view.w, view.h, { x: 0, y: 0, w: this.map.width * TILE, h: this.map.height * TILE })
    const p = this.world.need(this.player, Position)
    this.camera.snapTo(p.x, p.y)
  }

  private spawn(ch: string, tx: number, ty: number): void {
    const cx = tx * TILE + TILE / 2
    const cy = ty * TILE + TILE / 2
    const make = (kind: Kind, x: number, y: number) => {
      const e = this.world.create()
      this.world.add(e, KindOf, kind)
      this.world.add(e, Position, { x, y, px: x, py: y })
      return e
    }
    if (ch === 'P') {
      this.player = make('player', tx * TILE + 2, ty * TILE + 4)
      this.world.add(this.player, Size, { w: 12, h: 12 })
      this.world.add(this.player, Motion, createBody())
    } else if (ch === 's' || ch === 'y') {
      const e = make(ch === 's' ? 'seed' : 'rain', cx, cy)
      this.world.add(e, Radius, { r: 4 })
      if (ch === 's') this.seedsLeft++
    } else if (ch === 'k') {
      const e = make('ember', cx, cy)
      this.world.add(e, Radius, { r: 5 })
      const angle = this.rng.range(0, Math.PI * 2)
      this.world.add(
        e,
        Motion,
        createBody({
          vx: Math.cos(angle) * PHYSICS.emberSpeed,
          vy: Math.sin(angle) * PHYSICS.emberSpeed,
          restitution: 1,
          gravityScale: 0,
        }),
      )
    } else if (ch === 'E') {
      const e = make('exit', tx * TILE, ty * TILE - TILE)
      this.world.add(e, Size, { w: TILE, h: TILE * 2 })
    }
  }

  playerBox(): Aabb {
    const p = this.world.need(this.player, Position)
    const s = this.world.need(this.player, Size)
    return { x: p.x, y: p.y, w: s.w, h: s.h }
  }

  /** Bir fizik adımı. Oyun bittiyse yalnız görsel etkiler ilerler. */
  tick(frame: InputFrame, dt = STEP): void {
    this.events = []
    for (const e of this.world.query(Position)) {
      const p = this.world.need(e, Position)
      p.px = p.x
      p.py = p.y
    }
    if (this.status === 'playing') {
      this.controlPlayer(frame, dt)
      this.moveEmbers(dt)
      this.resolveContacts()
      this.time += dt
      this.invulnerable = Math.max(0, this.invulnerable - dt)
    }
    this.particles.update(dt)
    const p = this.world.need(this.player, Position)
    this.camera.follow(p.x + 6, p.y + 6, dt)
    this.camera.update(dt, this.fx)
    this.world.flush()
    this.ticks++
  }

  private controlPlayer(frame: InputFrame, dt: number): void {
    const body = this.world.need(this.player, Motion)
    const p = this.world.need(this.player, Position)
    const dir = (actions.isDown(frame, 'right') ? 1 : 0) - (actions.isDown(frame, 'left') ? 1 : 0)
    const accel = body.onGround ? 14 : 7
    body.vx += (dir * PHYSICS.runSpeed - body.vx) * Math.min(1, accel * dt)
    this.coyote = body.onGround ? 0.1 : Math.max(0, this.coyote - dt)
    this.jumpBuffer = actions.wasPressed(frame, 'jump') ? 0.12 : Math.max(0, this.jumpBuffer - dt)
    if (this.jumpBuffer > 0 && this.coyote > 0) {
      body.vy = -PHYSICS.jumpSpeed
      this.jumpBuffer = 0
      this.coyote = 0
      this.events.push('jump')
    }
    if (actions.wasReleased(frame, 'jump') && body.vy < -120) body.vy = -120
    body.vy = Math.min(PHYSICS.maxFall, body.vy + PHYSICS.gravity * dt)
    const moved = this.map.moveBox(this.playerBox(), body.vx * dt, body.vy * dt)
    p.x = moved.x
    p.y = moved.y
    if (moved.hitX) body.vx = 0
    if (moved.hitY) body.vy = 0
    body.onGround = moved.onGround
  }

  private moveEmbers(dt: number): void {
    for (const e of this.world.query(Motion, Radius)) {
      const p = this.world.need(e, Position)
      const body = this.world.need(e, Motion)
      const r = this.world.need(e, Radius).r
      p.x += body.vx * dt
      p.y += body.vy * dt
      this.map.forTilesIn(circleBounds({ x: p.x, y: p.y, r }), (tx, ty) => {
        if (!this.map.isSolid(tx, ty)) return
        const m = circleAabbManifold({ x: p.x, y: p.y, r }, this.map.tileBox(tx, ty))
        if (m) resolveStatic(p, body, m)
      })
    }
  }

  /** Geniş evre: uzamsal karma; dar evre: daire/kutu sınamaları. */
  private resolveContacts(): void {
    this.broad.clear()
    const bounds = new Map<Entity, Aabb>()
    for (const e of this.world.query(Position, KindOf)) {
      const p = this.world.need(e, Position)
      const radius = this.world.get(e, Radius)
      const size = this.world.get(e, Size)
      const box = radius
        ? circleBounds({ x: p.x, y: p.y, r: radius.r })
        : { x: p.x, y: p.y, w: size?.w ?? 0, h: size?.h ?? 0 }
      bounds.set(e, box)
      this.broad.insert(e, box)
    }
    for (const [a, b] of this.broad.pairs()) {
      if (a === this.player || b === this.player) this.touch(a === this.player ? b : a)
      else this.bounceEmbers(a, b)
    }
  }

  private bounceEmbers(a: Entity, b: Entity): void {
    if (this.world.get(a, KindOf) !== 'ember' || this.world.get(b, KindOf) !== 'ember') return
    const pa = this.world.need(a, Position)
    const pb = this.world.need(b, Position)
    const ra = this.world.need(a, Radius).r
    const rb = this.world.need(b, Radius).r
    const m = circleManifold({ x: pa.x, y: pa.y, r: ra }, { x: pb.x, y: pb.y, r: rb })
    if (!m) return
    const va = this.world.need(a, Motion)
    const vb = this.world.need(b, Motion)
    const relative = (vb.vx - va.vx) * m.nx + (vb.vy - va.vy) * m.ny
    if (relative >= 0) return
    va.vx += relative * m.nx
    va.vy += relative * m.ny
    vb.vx -= relative * m.nx
    vb.vy -= relative * m.ny
  }

  private touch(other: Entity): void {
    const kind = this.world.get(other, KindOf)
    const p = this.world.need(other, Position)
    const box = this.playerBox()
    if (kind === 'exit') {
      const size = this.world.need(other, Size)
      const inside = box.x < p.x + size.w && p.x < box.x + box.w && box.y < p.y + size.h && p.y < box.y + box.h
      if (inside && this.seedsLeft === 0) this.finish('won')
      return
    }
    const radius = this.world.get(other, Radius)
    if (!radius || !circleAabbManifold({ x: p.x, y: p.y, r: radius.r }, box)) return
    if (kind === 'seed' || kind === 'rain') {
      this.world.destroy(other)
      this.particles.emit(
        p.x,
        p.y,
        { count: 14, speed: [30, 90], life: [0.3, 0.7], color: kind === 'seed' ? 0x7ee787 : 0x79c0ff },
        this.fx,
      )
      if (kind === 'rain') {
        this.health = Math.min(MAX_HEALTH, this.health + 1)
        this.events.push('rain')
        return
      }
      this.seedsLeft--
      this.events.push('seed')
      if (this.seedsLeft === 0) this.events.push('exit-open')
    } else if (kind === 'ember' && this.invulnerable <= 0) {
      this.health--
      this.invulnerable = 1.2
      const body = this.world.need(this.player, Motion)
      body.vx = box.x + 6 < p.x ? -150 : 150
      body.vy = -180
      this.camera.shake(4, 0.4)
      this.particles.emit(
        box.x + 6,
        box.y + 6,
        { count: 20, speed: [40, 120], life: [0.3, 0.8], gravity: -60, color: 0xffa657 },
        this.fx,
      )
      this.events.push('hurt')
      if (this.health <= 0) this.finish('lost')
    }
  }

  private finish(status: Status): void {
    this.status = status
    this.events.push(status === 'won' ? 'win' : 'lose')
  }

  /** Oyun mantığı durumunun özeti (görsel etkiler hariç). */
  hash(): string {
    const values: number[] = [this.ticks, this.time, this.health, this.seedsLeft, this.invulnerable, this.rng.state]
    values.push(this.status === 'playing' ? 0 : this.status === 'won' ? 1 : 2)
    for (const e of this.world.query(Position)) {
      const p = this.world.need(e, Position)
      const body = this.world.get(e, Motion)
      values.push(e, p.x, p.y, body?.vx ?? 0, body?.vy ?? 0)
    }
    return hashNumbers(values)
  }
}

/** Kaydı baştan oynatır ve son durumu döndürür (tarayıcısız). */
export function simulate(recording: Recording, rows?: readonly string[]): DropletGame {
  const game = new DropletGame(recording.seed, rows)
  let previous = 0
  for (const mask of recording.frames) {
    game.tick(frameFromMasks(previous, mask))
    previous = mask
  }
  return game
}

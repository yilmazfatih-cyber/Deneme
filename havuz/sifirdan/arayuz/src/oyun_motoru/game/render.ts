// "Damla"nın Canvas çizimi (yalnız tarayıcı). Mantık durumunu okur, hiçbir şeyi değiştirmez. Konumlar önceki
// ve şimdiki fizik adımı arasında `alpha` ile ara değerlenir (akıcı hareket). Oyuncu kareleri bir kez
// programla çizilip saklanır (`bakeFrames`) ve bir `Animation` ile döndürülür: hareket ederken hızlanır.
// Renkler tek bir paletten gelir; koyu/açık tema için palet değiştirilir.
// Genişletme: yeni varlık türünün çizimi `drawEntity`'deki `switch`'e bir dal olarak eklenir.
import { Animation, bakeFrames, type FrameCanvas } from '../sprite.ts'
import { KindOf, Motion, Position, type DropletGame } from './droplet.ts'
import { TILE } from './level.ts'

export interface Palette {
  background: string
  wall: string
  wallEdge: string
  seed: string
  rain: string
  ember: string
  emberGlow: string
  player: string
  playerShine: string
  exitClosed: string
  exitOpen: string
}

export const DARK_PALETTE: Palette = {
  background: '#0d1117',
  wall: '#30363d',
  wallEdge: '#484f58',
  seed: '#7ee787',
  rain: '#79c0ff',
  ember: '#ffa657',
  emberGlow: 'rgba(255,166,87,0.25)',
  player: '#58a6ff',
  playerShine: '#cae8ff',
  exitClosed: '#6e7681',
  exitOpen: '#56d4dd',
}

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

/** Damla biçimi: üstte sivri, altta yuvarlak; `squash` 0..1 basıklık. */
function dropletPath(ctx: Ctx, cx: number, bottom: number, size: number, squash: number): void {
  const w = size * (0.5 + squash * 0.12)
  const h = size * (1 - squash * 0.18)
  ctx.beginPath()
  ctx.moveTo(cx, bottom - h)
  ctx.bezierCurveTo(cx + w * 0.4, bottom - h * 0.55, cx + w, bottom - h * 0.35, cx + w, bottom - h * 0.3 + h * 0.05)
  ctx.arc(cx, bottom - w, w, 0, Math.PI, false)
  ctx.bezierCurveTo(cx - w, bottom - h * 0.35, cx - w * 0.4, bottom - h * 0.55, cx, bottom - h)
  ctx.closePath()
}

export class DropletRenderer {
  private readonly frames: FrameCanvas[]
  private readonly animation = new Animation([0.18, 0.12, 0.18, 0.12])
  private readonly palette: Palette

  constructor(palette: Palette = DARK_PALETTE) {
    this.palette = palette
    this.frames = bakeFrames(32, 32, 4, (ctx, frame) => {
      const squash = [0, 0.5, 1, 0.5][frame] as number
      dropletPath(ctx, 16, 30, 26, squash)
      ctx.fillStyle = palette.player
      ctx.fill()
      ctx.beginPath()
      ctx.ellipse(11, 18, 2.5, 4, -0.4, 0, Math.PI * 2)
      ctx.fillStyle = palette.playerShine
      ctx.fill()
    })
  }

  /** Bir kare çizer. `scale`: dünya pikselinden tuval pikseline büyütme. */
  draw(ctx: CanvasRenderingContext2D, game: DropletGame, alpha: number, scale: number, dt: number): void {
    const p = this.palette
    const cam = game.camera
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    ctx.fillStyle = p.background
    ctx.fillRect(0, 0, cam.width, cam.height)
    game.map.forEachVisible(cam.view(), (tx, ty) => {
      const s = cam.worldToScreen(tx * TILE, ty * TILE)
      ctx.fillStyle = p.wall
      ctx.fillRect(Math.round(s.x), Math.round(s.y), TILE, TILE)
      if (!game.map.isSolid(tx, ty - 1)) {
        ctx.fillStyle = p.wallEdge
        ctx.fillRect(Math.round(s.x), Math.round(s.y), TILE, 3)
      }
    })
    for (const e of game.world.query(Position, KindOf)) this.drawEntity(ctx, game, e, alpha, dt)
    game.particles.forEachAlive((i, fade) => {
      const s = cam.worldToScreen(game.particles.x[i] as number, game.particles.y[i] as number)
      ctx.globalAlpha = fade
      ctx.fillStyle = `#${(game.particles.color[i] as number).toString(16).padStart(6, '0')}`
      const size = game.particles.size[i] as number
      ctx.fillRect(s.x - size / 2, s.y - size / 2, size, size)
    })
    ctx.globalAlpha = 1
  }

  private drawEntity(ctx: CanvasRenderingContext2D, game: DropletGame, e: number, alpha: number, dt: number): void {
    const p = this.palette
    const pos = game.world.need(e, Position)
    const s = game.camera.worldToScreen(pos.px + (pos.x - pos.px) * alpha, pos.py + (pos.y - pos.py) * alpha)
    const kind = game.world.need(e, KindOf)
    switch (kind) {
      case 'seed':
        ctx.fillStyle = p.seed
        ctx.beginPath()
        ctx.ellipse(s.x, s.y, 3, 4.5, 0.5, 0, Math.PI * 2)
        ctx.fill()
        break
      case 'rain':
        dropletPath(ctx, s.x, s.y + 5, 10, 0)
        ctx.fillStyle = p.rain
        ctx.fill()
        break
      case 'ember':
        ctx.fillStyle = p.emberGlow
        ctx.beginPath()
        ctx.arc(s.x, s.y, 9, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = p.ember
        ctx.beginPath()
        ctx.arc(s.x, s.y, 5, 0, Math.PI * 2)
        ctx.fill()
        break
      case 'exit': {
        const open = game.seedsLeft === 0
        ctx.fillStyle = open ? p.exitOpen : p.exitClosed
        ctx.globalAlpha = open ? 0.6 + 0.4 * Math.abs(Math.sin(game.time * 4)) : 0.8
        ctx.beginPath()
        ctx.ellipse(s.x + TILE / 2, s.y + TILE, 6, TILE - 2, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
        break
      }
      case 'player': {
        const body = game.world.need(e, Motion)
        this.animation.update(dt * (Math.abs(body.vx) > 20 ? 2 : 1))
        if (game.invulnerable > 0 && Math.floor(game.invulnerable * 12) % 2 === 0) break
        const frame = this.frames[this.animation.frame] as FrameCanvas
        ctx.drawImage(frame, s.x - 4, s.y - 8, 20, 20)
        break
      }
    }
  }
}

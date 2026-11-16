import { describe, expect, it } from 'vitest'
import {
  actions,
  DropletGame,
  frameFromMasks,
  KindOf,
  LEVELS,
  parseRecording,
  Position,
  Recorder,
  Rng,
  simulate,
} from '../../src/oyun_motoru/index.ts'
import { KindOf as Kind, Position as Pos } from '../../src/oyun_motoru/game/droplet.ts'

/** Tohumlu rastgele bir oynanış kaydı: tuşlar birkaç kare basılı kalır (insan gibi). */
function randomRecording(seed: number, frames: number) {
  const rng = new Rng(seed)
  const recorder = new Recorder(seed)
  let mask = 0
  for (let i = 0; i < frames; i++) {
    if (i % 12 === 0) mask = rng.int(0, 7)
    recorder.record(mask)
  }
  return recorder.toJSON()
}

describe('Damla — belirlenimcilik', () => {
  it('aynı kayıt her zaman aynı durum özetini verir; tek bir kare farkı özeti değiştirir', () => {
    const recording = randomRecording(2026, 900)
    const first = simulate(recording).hash()
    expect(simulate(recording).hash()).toBe(first)
    const changed = { ...recording, frames: [...recording.frames] }
    changed.frames[450] = changed.frames[450]! ^ actions.bit('jump')
    expect(simulate(changed).hash()).not.toBe(first)
    const reloaded = parseRecording(JSON.parse(JSON.stringify(recording)))
    expect(simulate(reloaded).hash()).toBe(first)
  })

  it('canlı oyun ile kayıttan oynatma aynı sonuca varır', () => {
    const recording = randomRecording(7, 300)
    const live = new DropletGame(recording.seed)
    let previous = 0
    for (const mask of recording.frames) {
      live.tick(frameFromMasks(previous, mask))
      previous = mask
    }
    expect(live.hash()).toBe(simulate(recording).hash())
  })

  it('bozuk kaydı açıklayıcı hatayla reddeder', () => {
    expect(() => parseRecording({ seed: 1, frames: [1, -2] })).toThrow(/Geçersiz kayıt/)
  })
})

describe('Damla — kurallar', () => {
  const idle = frameFromMasks(0, 0)
  const findAll = (game: DropletGame, kind: string) =>
    game.world.query(Position, KindOf).filter((e) => game.world.get(e, KindOf) === kind)
  const teleport = (game: DropletGame, x: number, y: number) => {
    const p = game.world.need(game.player, Position)
    p.x = p.px = x
    p.y = p.py = y
  }

  it('damla yere düşer ve durur; zıplama tuşu yerdeyken zıplatır', () => {
    const game = new DropletGame(1)
    for (let i = 0; i < 60; i++) game.tick(idle)
    const y = game.world.need(game.player, Position).y
    for (let i = 0; i < 30; i++) game.tick(idle)
    expect(game.world.need(game.player, Position).y).toBe(y)
    game.tick(frameFromMasks(0, actions.bit('jump')))
    expect(game.events).toContain('jump')
  })

  it('tohum toplanır; tümü bitince kaynak açılır ve ulaşınca kazanılır', () => {
    const game = new DropletGame(1)
    const seeds = findAll(game, 'seed')
    expect(seeds.length).toBe(game.seedsTotal)
    const [first, ...rest] = seeds
    const p = game.world.need(first!, Position)
    teleport(game, p.x - 6, p.y - 6)
    game.tick(idle)
    expect(game.events).toContain('seed')
    expect(game.seedsLeft).toBe(game.seedsTotal - 1)
    const exit = findAll(game, 'exit')[0]!
    const e = game.world.need(exit, Pos)
    teleport(game, e.x + 2, e.y + 10)
    game.tick(idle)
    expect(game.status).toBe('playing')
    for (const seed of rest) game.world.destroy(seed)
    game.world.flush()
    game.seedsLeft = 0
    teleport(game, e.x + 2, e.y + 10)
    game.tick(idle)
    expect(game.status).toBe('won')
    expect(game.events).toContain('win')
  })

  it('kor can azaltır, kısa süre dokunulmazlık verir; can bitince oyun kaybedilir', () => {
    const game = new DropletGame(1)
    const ember = findAll(game, 'ember')[0]!
    const hit = () => {
      const p = game.world.need(ember, Position)
      teleport(game, p.x - 6, p.y - 6)
      game.tick(idle)
    }
    hit()
    expect([game.health, game.events.includes('hurt')]).toEqual([2, true])
    hit()
    expect(game.health).toBe(2)
    for (let i = 0; i < 2; i++) {
      game.invulnerable = 0
      hit()
    }
    expect(game.status).toBe('lost')
    expect(game.world.get(game.player, Kind)).toBe('player')
  })

  it('kural testi: bölümler dikdörtgen, kenarları duvar, tek başlangıç ve tek çıkış', () => {
    for (const rows of LEVELS) {
      const width = rows[0]!.length
      expect(rows.every((r) => r.length === width)).toBe(true)
      expect(rows[0]!.replace(/#/g, '')).toBe('')
      expect(rows.at(-1)!.replace(/#/g, '')).toBe('')
      expect(rows.every((r) => r.startsWith('#') && r.endsWith('#'))).toBe(true)
      expect(rows.join('').split('P').length - 1).toBe(1)
      expect(rows.join('').split('E').length - 1).toBe(1)
    }
  })
})

/**
 * Çevrimdışı açılış: gömme vektörleri depodaki çözümleme dosyalarından kurulur — ağ isteği yok, ffmpeg (alt süreç) yok.
 * undici ve node:child_process sahtelenir; herhangi bir çağrı kaydedilir ve testi düşürür.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const calls = vi.hoisted(() => ({ net: [] as string[], proc: [] as string[] }))

vi.mock('undici', async (orig) => {
  const real = await orig<typeof import('undici')>()
  return {
    ...real,
    fetch: (url: unknown) => {
      calls.net.push(String(url))
      return Promise.reject(new Error('ağ yasak'))
    },
  }
})
vi.mock('node:child_process', async (orig) => {
  const real = await orig<typeof import('node:child_process')>()
  const deny =
    (name: string) =>
    (...args: unknown[]) => {
      calls.proc.push(`${name} ${String(args[0])}`)
      throw new Error('alt süreç yasak')
    }
  return {
    ...real,
    spawn: deny('spawn'),
    exec: deny('exec'),
    execFile: deny('execFile'),
    execFileSync: deny('execFileSync'),
    execSync: deny('execSync'),
    spawnSync: deny('spawnSync'),
  }
})

import { execFileSync } from 'node:child_process'
import type { FastifyInstance } from 'fastify'
import { fetch as undiciFetch } from 'undici'
import type { EmbeddingInfo } from '../../shared/intelligence'
import { embeddingsInternals } from '../src/services/embeddings/plugin'
import { createTestApp } from './helpers'

// Bu dosyanın beklentileri taban sağlayıcısına göredir: content/models altında bir model olsa da açıkça taban seçilir.
process.env.TVP_EMBEDDING_PROVIDER ??= 'taban'

describe('çevrimdışı açılış', () => {
  let app: FastifyInstance
  const realFetch = globalThis.fetch
  beforeAll(async () => {
    globalThis.fetch = ((url: unknown) => {
      calls.net.push(String(url))
      return Promise.reject(new Error('ağ yasak'))
    }) as typeof fetch
    app = await createTestApp()
  })
  afterAll(async () => {
    globalThis.fetch = realFetch
    await app.close()
  })

  it('açılış anında; kurulum ağsız ve ffmpeg’siz tamamlanır', async () => {
    expect(embeddingsInternals(app).lastBuild()).toBeNull() // açılış kurulumu beklemedi
    const res = await app.inject({ method: 'POST', url: '/api/studio/embeddings/rebuild' })
    expect(res.statusCode).toBe(200)
    const info = res.json<EmbeddingInfo>()
    expect(info.titles).toBeGreaterThan(50)
    expect(info.sceneDetected).toBe(2)
    const img = await app.inject({ method: 'GET', url: '/api/studio/embeddings/videos/80010002/shots/3/keyframe.jpg' })
    expect(img.statusCode).toBe(200)
    expect(calls.net).toEqual([])
    expect(calls.proc).toEqual([])
  })

  it('sahteler gerçekten devrede (sağlama)', async () => {
    await expect(undiciFetch('https://ornek.invalid/')).rejects.toThrow('ağ yasak')
    expect(() => execFileSync('ffmpeg', ['-version'])).toThrow('alt süreç yasak')
    expect(calls.net).toEqual(['https://ornek.invalid/'])
    expect(calls.proc).toEqual(['execFileSync ffmpeg'])
  })
})

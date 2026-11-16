import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createStaticServer, resolveFile } from '../../scripts/serve.ts'

let root = ''
let alt = ''
let url = ''
let close: () => void = () => undefined

beforeAll(async () => {
  root = mkdtempSync(path.join(tmpdir(), 'site-sunucu-'))
  alt = mkdtempSync(path.join(tmpdir(), 'site-sunucu-alt-'))
  mkdirSync(path.join(root, 'blog'))
  writeFileSync(path.join(root, 'index.html'), 'ana')
  writeFileSync(path.join(root, 'blog/index.html'), 'blog')
  writeFileSync(path.join(root, '404.html'), 'yok')
  writeFileSync(path.join(alt, 'index.html'), 'alt ana')
  const server = createStaticServer([
    { prefix: '/', root },
    { prefix: '/alt/klasor/', root: alt },
  ])
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  url = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`
  close = () => server.close()
})

afterAll(() => {
  close()
  rmSync(root, { recursive: true, force: true })
  rmSync(alt, { recursive: true, force: true })
})

describe('statik sunucu', () => {
  it('klasörü index.html olarak sunar, yoksa 404.html döner', async () => {
    expect(await (await fetch(`${url}/blog/`)).text()).toBe('blog')
    const missing = await fetch(`${url}/olmayan/`)
    expect(missing.status).toBe(404)
    expect(await missing.text()).toBe('yok')
  })

  it('alt klasör derlemesini kendi yolunda sunar', async () => {
    expect(await (await fetch(`${url}/alt/klasor/`)).text()).toBe('alt ana')
    const redirect = await fetch(`${url}/alt/klasor`, { redirect: 'manual' })
    expect(redirect.status).toBe(301)
  })

  it('kök dışına çıkan yolları reddeder', async () => {
    expect(await resolveFile({ prefix: '/', root }, '/../../etc/passwd')).toBeNull()
    expect(await resolveFile({ prefix: '/', root }, '/%2e%2e/%2e%2e/etc/passwd')).toBeNull()
  })
})

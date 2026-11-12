import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const kok = fileURLToPath(new URL('..', import.meta.url))

test('demo sayfasının içe aktardığı modüller var', () => {
  const html = readFileSync(`${kok}demo/index.html`, 'utf8')
  const yollar = [...html.matchAll(/from '(\.\.\/src\/[\w./]+)'/g)].map((m) => m[1])
  assert.ok(yollar.length >= 3)
  for (const y of yollar) assert.ok(existsSync(new URL(y, `file://${kok}demo/`)), y)
})

test('statik sunucu demo sayfasını ve modülleri verir, klasör dışına çıkmaya izin vermez, bozuk URL ile düşmez', async () => {
  const port = 18000 + Math.floor(Math.random() * 1000)
  const surec = spawn(process.execPath, [`${kok}scripts/sunucu.js`], { env: { ...process.env, PORT: String(port) } })
  try {
    await new Promise((coz, red) => {
      surec.stdout.on('data', coz)
      surec.on('error', red)
    })
    const sayfa = await fetch(`http://127.0.0.1:${port}/`)
    assert.equal(sayfa.status, 200)
    assert.match(await sayfa.text(), /Mini Bootstrap/)
    const modul = await fetch(`http://127.0.0.1:${port}/src/uretec.js`)
    assert.match(modul.headers.get('content-type'), /javascript/)
    // %2f URL ayrıştırıcısında ayraç sayılmaz; çözüldükten sonra ../../ olur → sunucu 403 vermeli
    const kacak = await fetch(`http://127.0.0.1:${port}/..%2f..%2fpackage.json`)
    assert.equal(kacak.status, 403)
    // Bozuk yüzde kodlaması: decodeURIComponent hata fırlatır → 400; sunucu ayakta kalmalı
    const bozuk = await fetch(`http://127.0.0.1:${port}/%E0%A4%A`)
    assert.equal(bozuk.status, 400)
    const sonra = await fetch(`http://127.0.0.1:${port}/`)
    assert.equal(sonra.status, 200)
  } finally {
    surec.kill()
  }
})

import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const csp = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html)?.[1] ?? ''
const yonerge = (ad) =>
  csp
    .split(';')
    .find((x) => x.trim().startsWith(ad + ' '))
    ?.trim() ?? ''

test('dış dosyalar sabit sürümlü, SRI özetli ve içerik politikasında adıyla izinli', () => {
  const betikler = [
    ...html.matchAll(/<script\s+src="(https:[^"]+)"\s+integrity="sha384-[^"]+"\s+crossorigin="anonymous"/g),
  ]
  const stiller = [...html.matchAll(/href="(https:[^"]+)"\s+integrity="sha384-[^"]+"\s+crossorigin="anonymous"/g)]
  assert.equal(betikler.length, 1)
  assert.equal(stiller.length, 1)
  assert.equal((html.match(/(?:src|href)="https:\/\/cdn/g) ?? []).length, 2) // SRI'sız dış dosya yok
  assert.ok(yonerge('script-src').split(' ').includes(betikler[0][1]))
  assert.ok(yonerge('style-src').split(' ').includes(stiller[0][1]))
  assert.match(betikler[0][1], /vue@\d+\.\d+\.\d+\//)
  assert.match(stiller[0][1], /bootstrap@\d+\.\d+\.\d+\//)
})

test('içerik politikası veri gönderimini engeller', () => {
  assert.equal(yonerge('connect-src'), "connect-src 'none'")
  assert.equal(yonerge('form-action'), "form-action 'none'")
  assert.equal(yonerge('object-src'), "object-src 'none'")
})

test('kapsam, ücret uyarıları ve serbest zamanın yeri sayfada', () => {
  assert.ok(html.includes('Kapsam ve sınırlar'))
  assert.ok(html.includes('Bu aracın denetlediği kurallar bakımından sınır aşımı görünmüyor'))
  assert.ok(!html.includes('Girilen dönemde kanuni sınır aşımı görünmüyor'))
  assert.ok(html.includes('arabulucuya'))
  assert.ok(html.includes('bordroda ödenmiş'))
  const fsc = html.indexOf('Fazla sürelerle çalışma ücreti')
  const serbest = html.indexOf('Bu iki ücret yerine, işçi isterse')
  const ubgt = html.indexOf('UBGT ilave ücreti (')
  assert.ok(fsc < serbest && serbest < ubgt, 'serbest zaman yalnız fazla çalışma ücretlerinin yanında')
  assert.ok(html.includes('aylık brüt / 225 (Yargıtay uygulaması'))
  assert.ok(html.includes('Aylık çıplak brüt ücret (TL, yan ödemeler hariç)'))
})

test('kurallar listesi kanunla uygulamayı ayırır', () => {
  assert.ok(!html.includes('Günlük çalışma 11 saati aşamaz; denkleştirmede dönem ortalamasına bakılır'))
  assert.ok(html.includes('günlük 11 saat sınırı her gün için geçerlidir (md. 63)'))
  assert.ok(html.includes('yönetmelikteki ölçüt; madde doğrulanmadı'))
  assert.ok(html.includes('6 ay içinde, ücret kesilmeden (md. 41)'))
})

test('kaynak dosyalarda görünmez karakter yok (BOM gibi değerler kaçış dizisiyle yazılır)', () => {
  const kok = new URL('../', import.meta.url)
  const dosyalar = [
    ...readdirSync(kok).filter((ad) => /\.(js|html|css|md)$/.test(ad)),
    ...readdirSync(new URL('test/', kok)).map((ad) => 'test/' + ad),
  ]
  const gorunmez = /[\u00a0\u00ad\u200b-\u200f\u2028\u2029\u202a-\u202e\u2060\u2066-\u2069\ufeff]/
  for (const ad of dosyalar) {
    assert.ok(!gorunmez.test(readFileSync(new URL(ad, kok), 'utf8')), ad)
  }
})

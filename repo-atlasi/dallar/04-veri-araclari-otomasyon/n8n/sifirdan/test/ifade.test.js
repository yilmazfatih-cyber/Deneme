import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { IfadeHatasi, degeriCoz, ifadeOrtami, parametreleriCoz, sablonParcala } from '../asama1_ifade.js'

const calismaVerisi = {
  Musteriler: [{ data: { main: [[{ json: { ad: 'Ayşe' } }, { json: { ad: 'Mehmet' } }]] } }],
}
const ortam = ifadeOrtami({
  ogeler: [{ json: { ad: 'ılgaz', tutar: 150, etiketler: ['a', 'b'], adres: { il: 'İzmir' } } }, { json: { ad: 'x' } }],
  indeks: 0,
  calismaVerisi,
  akis: { id: 'a1', name: 'Deneme' },
  yurutmeId: 'y1',
})
const coz = (/** @type {string} */ ifade) => degeriCoz(ifade, ortam)

describe('ifade dili', () => {
  test('ifade olmayan değer olduğu gibi kalır', () => {
    assert.equal(coz('düz metin {{ x }}'), 'düz metin {{ x }}')
    assert.equal(degeriCoz(42, ortam), 42)
  })

  test('tek ifade ham değeri döndürür, şablon metin üretir', () => {
    assert.equal(coz('={{ $json.tutar }}'), 150)
    assert.equal(coz('={{ $json.tutar * 2 + 1 }}'), 301)
    assert.equal(coz('=Toplam: {{ $json.tutar }} TL, il: {{ $json.adres.il }}'), 'Toplam: 150 TL, il: İzmir')
    assert.equal(coz('={{ $json.adres }} '), '{"il":"İzmir"} ')
    assert.deepEqual(coz('={{ $json.etiketler }}'), ['a', 'b'])
  })

  test('işleçler, öncelik, koşul ve ??', () => {
    assert.equal(coz('={{ 2 + 3 * 4 }}'), 14)
    assert.equal(coz('={{ (2 + 3) * 4 }}'), 20)
    assert.equal(coz('={{ $json.tutar > 100 && !false ? "büyük" : "küçük" }}'), 'büyük')
    assert.equal(coz('={{ $json.yok ?? "yedek" }}'), 'yedek')
    assert.equal(coz('={{ $json.yok?.alt }}'), undefined)
    assert.equal(coz("={{ '1' == 1 }}"), true)
    assert.equal(coz("={{ '1' === 1 }}"), false)
  })

  test('izinli metotlar ve Türkçe büyük harf', () => {
    assert.equal(coz("={{ $json.ad.toLocaleUpperCase('tr-TR') }}"), 'ILGAZ')
    assert.equal(coz('={{ $json.etiketler.join("-") }}'), 'a-b')
    assert.equal(coz('={{ $json.ad.length }}'), 5)
    assert.equal(coz('={{ $json.tutar.toFixed(2) }}'), '150.00')
    assert.equal(coz('={{ Math.round(7.6) }}'), 8)
    assert.equal(coz('={{ [1, 2, 3].includes(2) }}'), true)
  })

  test('$input, $() ve $node', () => {
    assert.equal(coz('={{ $input.all().length }}'), 2)
    assert.equal(coz('={{ $input.first().json.ad }}'), 'ılgaz')
    assert.equal(coz('={{ $input.item.json.tutar }}'), 150)
    assert.equal(coz("={{ $('Musteriler').last().json.ad }}"), 'Mehmet')
    assert.equal(coz("={{ $node['Musteriler'].json.ad }}"), 'Ayşe')
    assert.equal(coz('={{ $workflow.name }} / {{ $execution.id }} / {{ $itemIndex }}'), 'Deneme / y1 / 0')
    assert.throws(() => coz("={{ $('Olmayan').first() }}"), /henüz çalışmadı/)
  })

  test("tırnak içindeki '}}' ifadeyi bitirmez", () => {
    assert.deepEqual(sablonParcala("a {{ '}}' }} b"), [{ metin: 'a ' }, { ifade: " '}}' " }, { metin: ' b' }])
    assert.equal(coz("={{ '}}' }}"), '}}')
  })

  test('iç içe parametreler', () => {
    const sonuc = parametreleriCoz({ liste: [{ deger: '={{ $json.tutar }}' }, 'sabit'], n: 1 }, ortam)
    assert.deepEqual(sonuc, { liste: [{ deger: 150 }, 'sabit'], n: 1 })
  })

  test('güvenlik: prototip, global ve kod üretimi yolları kapalı', () => {
    const saldirilar = [
      '={{ $json.constructor }}',
      '={{ $json["__proto__"] }}',
      '={{ $json.ad.constructor.constructor("return process")() }}',
      '={{ process.exit(1) }}',
      '={{ globalThis }}',
      '={{ this }}',
      '={{ eval("1") }}',
      '={{ $json.toString() }}',
      '={{ $input.all.constructor }}',
      '={{ "a".padStart(100000000) }}',
      '={{ Math.round.call(null, 1) }}',
    ]
    for (const saldiri of saldirilar) assert.throws(() => coz(saldiri), IfadeHatasi, saldiri)
  })

  test('sözdizimi hataları anlaşılır mesaj verir', () => {
    assert.throws(() => coz('={{ $json.tutar + }}'), /erken bitti/)
    assert.throws(() => coz('={{ (1 + 2 }}'), /'\)' bekleniyordu/)
    assert.throws(() => coz('={{ 1 # 2 }}'), /Beklenmeyen karakter/)
    assert.throws(() => coz('={{ 1 '), /Kapanmamış/)
  })
})

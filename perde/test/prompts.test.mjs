import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ACTIONS, EFFORT, SYSTEM_PROMPT, buildSystem, buildUserContent, isAction } from '../lib/prompts.mjs'
import { validateAiRequest } from '../lib/request.mjs'

const script = 'Title: Deneme\n\n.İÇ. EV - GÜN\n\nAnne çay demler.\n'

test('her eylem için iki blok: önbellekli senaryo + eyleme özgü talimat', () => {
  for (const action of ACTIONS) {
    const blocks = buildUserContent({
      action,
      script,
      scene: { number: 1, heading: 'İÇ. EV - GÜN' },
      selection: '@ANNE\nGel.',
      instruction: 'daha kısa',
    })
    assert.equal(blocks.length, 2, action)
    assert.equal(blocks[0].type, 'text')
    assert.ok(blocks[0].text.includes(script), 'blok 1 senaryoyu içerir')
    assert.deepEqual(blocks[0].cache_control, { type: 'ephemeral' })
    assert.equal(blocks[1].cache_control, undefined, 'talimat bloğu önbelleğe alınmaz')
  }
})

test('blok 1 eylemden bağımsızdır (önbellek önekini paylaşırlar)', () => {
  const texts = ACTIONS.map((action) => buildUserContent({ action, script, selection: 'x' })[0].text)
  assert.equal(new Set(texts).size, 1)
})

test('talimat bloğu eyleme göre değişir ve gerekli parçaları taşır', () => {
  const t = (action, extra = {}) =>
    buildUserContent({ action, script, scene: { number: 2, heading: 'DIŞ. YOL' }, ...extra })[1].text
  assert.match(t('continue'), /DEVAM ETTİR[\s\S]*2\. sahne \(DIŞ\. YOL\)[\s\S]*3 ile 8 öğe/)
  assert.match(
    t('rewrite', { selection: '@ALİ\nSelam.', instruction: 'sertleştir' }),
    /<secim>\n@ALİ\nSelam\.\n<\/secim>\nTalimat: sertleştir/,
  )
  assert.match(t('rewrite', { selection: 'x' }), /Talimat: Sahnenin tonunu/)
  const analyze = t('analyze')
  for (const h of ['Yapı', 'Tempo', 'Karakter', 'Diyalog', 'Yapımcı gözüyle']) assert.ok(analyze.includes(h), h)
  assert.match(t('shots'), /No \| Çekim ölçeği \| Açı \/ hareket \| Açıklama/)
  assert.notEqual(t('continue'), t('analyze'))
})

test('sistem istemi tek önbellekli blok ve her çağrıda bayt bayt aynı', () => {
  const a = buildSystem()
  const b = buildSystem()
  assert.equal(a.length, 1)
  assert.deepEqual(a[0].cache_control, { type: 'ephemeral' })
  assert.equal(a[0].text, SYSTEM_PROMPT)
  assert.ok(Buffer.from(a[0].text).equals(Buffer.from(b[0].text)))
  assert.equal(JSON.stringify(a), JSON.stringify(b))
  // Önbelleği bozacak değişken içerik yok: tarih, kimlik, saat
  assert.doesNotMatch(a[0].text, /\b(20\d\d-\d\d-\d\d|[0-9a-f]{8}-[0-9a-f]{4})\b/i)
})

test('istem içeriği: zanaat ilkeleri ve Fountain biçimi', () => {
  assert.match(SYSTEM_PROMPT, /şimdiki zaman/)
  assert.match(SYSTEM_PROMPT, /alt metin/)
  assert.match(SYSTEM_PROMPT, /senaryonun diliyle/)
  assert.match(SYSTEM_PROMPT, /Fountain/)
})

test('eylem sabitleri', () => {
  assert.deepEqual([...ACTIONS], ['continue', 'rewrite', 'analyze', 'shots'])
  assert.deepEqual({ ...EFFORT }, { continue: 'low', rewrite: 'low', analyze: 'medium', shots: 'medium' })
  assert.ok(isAction('shots'))
  assert.ok(!isAction('hack'))
})

test('istek doğrulama', () => {
  const ok = validateAiRequest({ action: 'continue', script: 'x', sceneIndex: 0 })
  assert.ok(ok.ok)
  assert.equal(validateAiRequest({ action: 'nope', script: 'x' }).ok, false)
  assert.equal(validateAiRequest({ action: 'continue', script: '   ' }).ok, false)
  assert.equal(validateAiRequest({ action: 'continue', script: 'x', sceneIndex: -1 }).ok, false)
  assert.equal(validateAiRequest({ action: 'continue', script: 'x', sceneIndex: 1.5 }).ok, false)
  assert.equal(validateAiRequest({ action: 'rewrite', script: 'x' }).ok, false)
  assert.equal(validateAiRequest({ action: 'rewrite', script: 'x', selection: 'y' }).ok, true)
  assert.equal(validateAiRequest({ action: 'analyze', script: 'x', instruction: 'a'.repeat(3000) }).ok, false)
  assert.equal(validateAiRequest(null).ok, false)
  assert.equal(validateAiRequest([]).ok, false)
})

// Aşama 3 testleri: oturum anahtarları, bağlamalar, DM politikası, anılma kapısı, eşleştirme deposu.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildAgentPeerSessionKey,
  decideDmAccess,
  PAIRING_ALPHABET,
  PairingStore,
  passesMentionGate,
  resolveAgentRoute,
} from '../asama3_yonlendirme.js'

test('oturum anahtarı biçimleri', () => {
  const dm = { agentId: 'main', channel: 'Telegram', peerKind: 'direct', peerId: '42' }
  assert.equal(buildAgentPeerSessionKey(dm), 'agent:main:main')
  assert.equal(buildAgentPeerSessionKey({ ...dm, dmScope: 'per-peer' }), 'agent:main:direct:42')
  assert.equal(buildAgentPeerSessionKey({ ...dm, dmScope: 'per-channel-peer' }), 'agent:main:telegram:direct:42')
  const grup = { agentId: 'main', channel: 'discord', peerKind: 'group', peerId: 'G1' }
  assert.equal(buildAgentPeerSessionKey(grup), 'agent:main:discord:group:g1')
  assert.equal(buildAgentPeerSessionKey({ ...grup, groupScope: 'main' }), 'agent:main:main')
})

test('en özgül bağlama kazanır, eşleşme yoksa varsayılan ajan', () => {
  const cfg = {
    defaultAgentId: 'main',
    bindings: [
      { agentId: 'is', match: { channel: 'slack' } },
      { agentId: 'aile', match: { channel: 'slack', peerKind: 'group', peerId: 'aile-kanali' } },
    ],
  }
  const env = (peerId, peerKind = 'group', channel = 'slack') => ({ channel, peerKind, peerId })
  assert.equal(resolveAgentRoute(cfg, env('aile-kanali')).agentId, 'aile')
  assert.equal(resolveAgentRoute(cfg, env('genel')).agentId, 'is')
  const r = resolveAgentRoute(cfg, env('42', 'direct', 'telegram'))
  assert.deepEqual([r.agentId, r.sessionKey, r.matchedBy], ['main', 'agent:main:main', 'default'])
})

test('DM politikası kararları', () => {
  const karar = (o) => decideDmAccess({ senderId: '42', ...o }).decision
  assert.equal(karar({}), 'pairing') // varsayılan: eşleştirme
  assert.equal(karar({ storeAllowFrom: ['42'] }), 'allow')
  assert.equal(karar({ dmPolicy: 'allowlist', allowFrom: ['7'] }), 'block')
  assert.equal(karar({ dmPolicy: 'allowlist', storeAllowFrom: ['42'] }), 'block') // depo allowlist'i genişletmez
  assert.equal(karar({ dmPolicy: 'open', allowFrom: ['*'] }), 'allow')
  assert.equal(karar({ dmPolicy: 'open', allowFrom: ['7'] }), 'block') // '*' yoksa open herkese açık değil
  assert.equal(karar({ dmPolicy: 'disabled', allowFrom: ['42'] }), 'block')
})

test('grupta anılma kapısı', () => {
  assert.equal(passesMentionGate({ peerKind: 'group', wasMentioned: false }), false)
  assert.equal(passesMentionGate({ peerKind: 'group', wasMentioned: true }), true)
  assert.equal(passesMentionGate({ peerKind: 'group', requireMention: false }), true)
  assert.equal(passesMentionGate({ peerKind: 'direct' }), true)
})

test('eşleştirme kodu: biçim, aynı kişiye aynı kod, hesap başına 3 bekleyen, 1 saat ömür', () => {
  let saat = 0
  const depo = new PairingStore({ now: () => saat })
  const ilk = depo.request('telegram', 'default', 'u1')
  assert.equal(ilk.code.length, 8)
  assert.ok([...ilk.code].every((c) => PAIRING_ALPHABET.includes(c)))
  assert.deepEqual(depo.request('telegram', 'default', 'u1'), { code: ilk.code, created: false })
  depo.request('telegram', 'default', 'u2')
  depo.request('telegram', 'default', 'u3')
  assert.equal(depo.request('telegram', 'default', 'u4'), null)
  assert.ok(depo.request('telegram', 'is-hesabi', 'u4')) // başka hesap, ayrı kota
  assert.equal(depo.approve('discord', ilk.code), null) // yanlış kanal
  assert.equal(depo.approve('telegram', ilk.code.toLowerCase()).senderId, 'u1')
  assert.deepEqual(depo.allowFrom('telegram', 'default'), ['u1'])
  saat += 60 * 60 * 1000 + 1
  assert.equal(depo.list('telegram').length, 0) // süresi dolanlar temizlendi
})

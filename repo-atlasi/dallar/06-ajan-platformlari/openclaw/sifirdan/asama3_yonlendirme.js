// Aşama 3 — Yönlendirme ve erişim: hangi ajan, hangi oturum, bu kişi konuşabilir mi?
//
// Gerçek karşılığı: src/routing/resolve-route.ts (resolveAgentRoute, bağlamalar), src/routing/session-key.ts
// (buildAgentPeerSessionKey), src/channels/direct-dm-access.ts (dmPolicy kararı), src/channels/mention-gating.ts,
// src/pairing/pairing-store.ts, docs/channels/channel-routing.md, docs/channels/pairing.md.
//
// Oturum anahtarı biçimleri (gerçek belgelerden):
//   agent:<agentId>:main                         → varsayılan: tüm DM'ler ajanın ana oturumunda birleşir
//   agent:<agentId>:direct:<peer>                → dmScope: per-peer
//   agent:<agentId>:<channel>:direct:<peer>      → dmScope: per-channel-peer
//   agent:<agentId>:<channel>:group:<id>         → gruplar kendi oturumunda (groupScope: per-group)
// Model kanalı seçmez: cevap mesajın geldiği yere döner.

import { randomInt } from 'node:crypto'

export const PAIRING_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // 0O1I yok
const CODE_LENGTH = 8
const CODE_TTL_MS = 60 * 60 * 1000
const MAX_PENDING_PER_ACCOUNT = 3

const lower = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()

/**
 * @param {{agentId: string, channel: string, peerKind: string, peerId: string, dmScope?: string, groupScope?: string}} p
 */
export function buildAgentPeerSessionKey({
  agentId,
  channel,
  peerKind,
  peerId,
  dmScope = 'main',
  groupScope = 'per-group',
}) {
  const agent = lower(agentId)
  if (peerKind === 'direct') {
    if (dmScope === 'per-channel-peer') return `agent:${agent}:${lower(channel)}:direct:${lower(peerId)}`
    if (dmScope === 'per-peer') return `agent:${agent}:direct:${lower(peerId)}`
    return `agent:${agent}:main`
  }
  if (groupScope === 'main') return `agent:${agent}:main`
  return `agent:${agent}:${lower(channel)}:${peerKind}:${lower(peerId)}`
}

/**
 * Bağlamalar (bindings) mesajı bir ajana yönlendirir; en özgül eşleşme kazanır (peer > channel > varsayılan).
 * @param {{defaultAgentId?: string, bindings?: any[], session?: {dmScope?: string, groupScope?: string}}} cfg
 * @param {{channel: string, peerKind: string, peerId: string}} envelope
 */
export function resolveAgentRoute(cfg, envelope) {
  let best = null
  for (const binding of cfg.bindings ?? []) {
    const m = binding.match ?? {}
    if (m.channel && m.channel !== envelope.channel) continue
    if (m.peerKind && m.peerKind !== envelope.peerKind) continue
    if (m.peerId && lower(m.peerId) !== lower(envelope.peerId)) continue
    const score = (m.peerId ? 4 : 0) + (m.peerKind ? 2 : 0) + (m.channel ? 1 : 0)
    if (!best || score > best.score) best = { binding, score }
  }
  const agentId = best?.binding.agentId ?? cfg.defaultAgentId ?? 'main'
  const session = { ...cfg.session, ...best?.binding.session }
  return {
    agentId,
    sessionKey: buildAgentPeerSessionKey({
      agentId,
      ...envelope,
      dmScope: session.dmScope,
      groupScope: session.groupScope,
    }),
    matchedBy: best ? `binding:${best.score}` : 'default',
  }
}

/**
 * DM erişim kararı. dmPolicy: pairing (varsayılan) | allowlist | open | disabled.
 * @returns {{decision: 'allow'|'pairing'|'block', reason: string}}
 */
export function decideDmAccess({ dmPolicy = 'pairing', allowFrom = [], storeAllowFrom = [], senderId }) {
  if (dmPolicy === 'disabled') return { decision: 'block', reason: 'dm-disabled' }
  const configured = allowFrom.map(lower)
  if (dmPolicy === 'open' && configured.includes('*')) return { decision: 'allow', reason: 'open' }
  // pairing modunda onaylanmış kişiler de izinlidir; open/allowlist'te eşleştirme deposu erişimi GENİŞLETMEZ
  const effective = dmPolicy === 'pairing' ? [...configured, ...storeAllowFrom.map(lower)] : configured
  if (effective.includes(lower(senderId))) return { decision: 'allow', reason: 'allowlisted' }
  if (dmPolicy === 'pairing') return { decision: 'pairing', reason: 'unknown-sender' }
  return { decision: 'block', reason: 'not-allowlisted' }
}

/** Gruplarda varsayılan: bot ancak anılırsa (@claw) cevap verir. */
export function passesMentionGate({ peerKind, requireMention = true, wasMentioned }) {
  return peerKind === 'direct' || !requireMention || Boolean(wasMentioned)
}

export class PairingStore {
  constructor({ now = Date.now } = {}) {
    this.now = now
    /** @type {Map<string, {channel: string, accountId: string, senderId: string, createdAt: number}>} */
    this.pending = new Map()
    /** @type {Map<string, Set<string>>} kanal:hesap → onaylı gönderenler */
    this.approved = new Map()
  }

  #prune() {
    for (const [code, req] of this.pending) if (this.now() - req.createdAt > CODE_TTL_MS) this.pending.delete(code)
  }

  /** @returns {{code: string, created: boolean}|null} null: kapasite dolu, istek yok sayılır */
  request(channel, accountId, senderId) {
    this.#prune()
    for (const [code, req] of this.pending) {
      if (req.channel === channel && req.accountId === accountId && req.senderId === senderId)
        return { code, created: false }
    }
    const open = [...this.pending.values()].filter((r) => r.channel === channel && r.accountId === accountId)
    if (open.length >= MAX_PENDING_PER_ACCOUNT) return null
    let code = ''
    for (let i = 0; i < CODE_LENGTH; i++) code += PAIRING_ALPHABET[randomInt(PAIRING_ALPHABET.length)]
    this.pending.set(code, { channel, accountId, senderId, createdAt: this.now() })
    return { code, created: true }
  }

  approve(channel, code) {
    this.#prune()
    const req = this.pending.get(String(code).trim().toUpperCase())
    if (!req || req.channel !== channel) return null
    this.pending.delete(String(code).trim().toUpperCase())
    const key = `${req.channel}:${req.accountId}`
    if (!this.approved.has(key)) this.approved.set(key, new Set())
    this.approved.get(key).add(req.senderId)
    return req
  }

  list(channel) {
    this.#prune()
    return [...this.pending.entries()]
      .filter(([, r]) => !channel || r.channel === channel)
      .map(([code, r]) => ({ code, ...r }))
  }

  allowFrom(channel, accountId) {
    return [...(this.approved.get(`${channel}:${accountId}`) ?? [])]
  }
}

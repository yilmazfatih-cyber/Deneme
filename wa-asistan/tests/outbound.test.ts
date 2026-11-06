import type { WAMessage, WASocket } from 'baileys'
import { describe, expect, it, vi } from 'vitest'
import { createSender } from '../src/wa/outbound.js'

function fakeSocket() {
  const sendMessage = vi.fn(async (_jid: string, _content: unknown, opts?: { messageId?: string }) => ({
    key: { id: opts?.messageId ?? 'srv-id' },
    message: { conversation: 'x' },
  }))
  const sendPresenceUpdate = vi.fn(async () => {})
  const sock = { user: { id: '905321234567:3@s.whatsapp.net' }, sendMessage, sendPresenceUpdate } as unknown as WASocket
  return { sock, sendMessage, sendPresenceUpdate }
}

describe('createSender', () => {
  it('announces the id before sending and sends exactly that id', async () => {
    const { sock, sendMessage } = fakeSocket()
    const order: string[] = []
    const beforeSend = vi.fn((id: string) => order.push(`before:${id}`))
    sendMessage.mockImplementationOnce(async (_j, _c, opts) => {
      order.push(`send:${opts?.messageId}`)
      return { key: { id: opts?.messageId }, message: {} } as never
    })
    const s = createSender({ current: () => sock }, { beforeSend, minGapMs: 0 })
    const id = await s.sendText('905551112233@s.whatsapp.net', 'selam')
    const sentId = order[1]?.replace('send:', '')
    expect(order[0]).toBe(`before:${sentId}`)
    expect(id).toBe(sentId)
    expect(sendMessage).toHaveBeenCalledWith(
      '905551112233@s.whatsapp.net',
      { text: 'selam' },
      expect.objectContaining({ messageId: sentId }),
    )
  })

  it('quotes a remembered message and remembers what it sent', async () => {
    const { sock, sendMessage } = fakeSocket()
    const original = { key: { id: 'IN1' }, message: { conversation: 'soru' } } as unknown as WAMessage
    const remember = vi.fn()
    const s = createSender(
      { current: () => sock },
      { recent: (id) => (id === 'IN1' ? original : undefined), remember, minGapMs: 0 },
    )
    await s.sendText('c@s.whatsapp.net', 'yanıt', { quoteId: 'IN1' })
    expect(sendMessage.mock.calls[0]?.[2]).toMatchObject({ quoted: original })
    expect(remember).toHaveBeenCalledOnce()
    await s.sendText('c@s.whatsapp.net', 'yanıt', { quoteId: 'bilinmeyen' })
    expect(sendMessage.mock.calls[1]?.[2]).not.toHaveProperty('quoted')
  })

  it('waits so that two messages to the same chat are at least minGapMs apart', async () => {
    const { sock } = fakeSocket()
    let t = 10_000
    const sleep = vi.fn(async (ms: number) => void (t += ms))
    const s = createSender({ current: () => sock }, { minGapMs: 800, sleep, now: () => t })
    await s.sendText('a@s.whatsapp.net', '1')
    await s.sendText('a@s.whatsapp.net', '2')
    expect(sleep).toHaveBeenCalledTimes(1)
    expect(sleep.mock.calls[0]?.[0]).toBe(800)
    await s.sendText('b@s.whatsapp.net', 'başka sohbet')
    expect(sleep).toHaveBeenCalledTimes(1)
  })

  it('sends presence updates and swallows their failures', async () => {
    const { sock, sendPresenceUpdate } = fakeSocket()
    const s = createSender({ current: () => sock })
    await s.typing('a@s.whatsapp.net', true)
    await s.typing('a@s.whatsapp.net', false)
    expect(sendPresenceUpdate.mock.calls.map((c) => (c as unknown[])[0])).toEqual(['composing', 'paused'])
    sendPresenceUpdate.mockRejectedValueOnce(new Error('kapalı'))
    await expect(s.typing('a@s.whatsapp.net', true)).resolves.toBeUndefined()
  })

  it('throws a Turkish error when there is no connection, but typing stays silent', async () => {
    const s = createSender({ current: () => undefined })
    await expect(s.sendText('a@s.whatsapp.net', 'x')).rejects.toThrow('WhatsApp bağlantısı')
    await expect(s.typing('a@s.whatsapp.net', true)).resolves.toBeUndefined()
  })
})

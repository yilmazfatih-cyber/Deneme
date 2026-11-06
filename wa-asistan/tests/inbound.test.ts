import type { WAMessage } from 'baileys'
import { describe, expect, it, vi } from 'vitest'
import { toInbound } from '../src/wa/inbound.js'

const ME_PN = '905321234567@s.whatsapp.net'
const ME_LID = '111222333@lid'
const download = vi.fn(async () => Buffer.from('x'))
const ctx = { selfJids: [ME_PN, ME_LID], download }

const wam = (
  key: Record<string, unknown>,
  message: Record<string, unknown> | null,
  extra: Record<string, unknown> = {},
) => ({ key: { id: 'ABC123', ...key }, message, messageTimestamp: 1_788_000_000, ...extra }) as unknown as WAMessage

describe('toInbound', () => {
  it('maps a plain text DM from a contact', () => {
    const m = toInbound(
      wam(
        { remoteJid: '905551112233@s.whatsapp.net', fromMe: false },
        { conversation: '  Merhaba  ' },
        { pushName: 'Ayşe' },
      ),
      ctx,
    )
    expect(m).toMatchObject({
      id: 'ABC123',
      chatJid: '905551112233@s.whatsapp.net',
      senderJid: '905551112233@s.whatsapp.net',
      fromMe: false,
      isSelfChat: false,
      isGroup: false,
      pushName: 'Ayşe',
      text: 'Merhaba',
      timestamp: 1_788_000_000_000,
    })
  })

  it('recognises the note-to-self chat in phone form, from the phone itself', () => {
    const m = toInbound(wam({ remoteJid: ME_PN, fromMe: true }, { conversation: 'not' }), ctx)
    expect(m).toMatchObject({ isSelfChat: true, fromMe: true, senderJid: ME_PN })
  })

  it('recognises the note-to-self chat in LID form and with device suffixes', () => {
    const m = toInbound(wam({ remoteJid: '111222333:7@lid', fromMe: true }, { conversation: 'not' }), ctx)
    expect(m).toMatchObject({ isSelfChat: true, chatJid: ME_LID, senderJid: ME_PN })
  })

  it('uses remoteJidAlt to find the phone number behind a LID chat', () => {
    const m = toInbound(
      wam(
        { remoteJid: '999888@lid', remoteJidAlt: '905559998877@s.whatsapp.net', fromMe: false },
        { conversation: 'selam' },
      ),
      ctx,
    )
    expect(m).toMatchObject({ chatJid: '999888@lid', senderJid: '905559998877@s.whatsapp.net', isSelfChat: false })
  })

  it('detects self chat through remoteJidAlt', () => {
    const m = toInbound(wam({ remoteJid: '555@lid', remoteJidAlt: ME_PN, fromMe: true }, { conversation: 'x' }), ctx)
    expect(m?.isSelfChat).toBe(true)
  })

  it('reads extended text with the quoted message text', () => {
    const m = toInbound(
      wam(
        { remoteJid: ME_PN, fromMe: true },
        {
          extendedTextMessage: { text: 'bunu özetle', contextInfo: { quotedMessage: { conversation: 'uzun metin' } } },
        },
      ),
      ctx,
    )
    expect(m).toMatchObject({ text: 'bunu özetle', quotedText: 'uzun metin' })
  })

  it('maps an image with caption and exposes a lazy download', async () => {
    const m = toInbound(
      wam(
        { remoteJid: ME_PN, fromMe: true },
        { imageMessage: { caption: 'bu ne?', mimetype: 'image/png', fileLength: 2048 } },
      ),
      ctx,
    )
    expect(m).toMatchObject({ text: 'bu ne?', media: { kind: 'image', mime: 'image/png', sizeBytes: 2048 } })
    expect(download).not.toHaveBeenCalled()
    await m?.media?.download()
    expect(download).toHaveBeenCalledOnce()
  })

  it('accepts protobuf Long values for sizes and timestamps', () => {
    const long = { toNumber: () => 4096 }
    const m = toInbound(
      wam(
        { remoteJid: ME_PN, fromMe: true },
        { documentMessage: { fileName: 'a.txt', mimetype: 'text/plain', fileLength: long } },
        {
          messageTimestamp: { toNumber: () => 1_788_000_001 },
        },
      ),
      ctx,
    )
    expect(m).toMatchObject({
      media: { kind: 'document', fileName: 'a.txt', sizeBytes: 4096 },
      timestamp: 1_788_000_001_000,
    })
  })

  it('maps a voice note', () => {
    const m = toInbound(
      wam(
        { remoteJid: ME_PN, fromMe: true },
        { audioMessage: { ptt: true, seconds: 7, mimetype: 'audio/ogg; codecs=opus' } },
      ),
      ctx,
    )
    expect(m).toMatchObject({ text: '', media: { kind: 'audio', seconds: 7, mime: 'audio/ogg; codecs=opus' } })
  })

  it('maps video and sticker as media (the handler answers with a notice)', () => {
    expect(
      toInbound(wam({ remoteJid: ME_PN, fromMe: true }, { videoMessage: { mimetype: 'video/mp4', seconds: 3 } }), ctx)
        ?.media?.kind,
    ).toBe('video')
    expect(
      toInbound(wam({ remoteJid: ME_PN, fromMe: true }, { stickerMessage: { mimetype: 'image/webp' } }), ctx)?.media
        ?.kind,
    ).toBe('sticker')
  })

  it('unwraps ephemeral and view-once wrappers', () => {
    const eph = toInbound(
      wam({ remoteJid: ME_PN, fromMe: true }, { ephemeralMessage: { message: { conversation: 'gizli' } } }),
      ctx,
    )
    expect(eph?.text).toBe('gizli')
    const once = toInbound(
      wam(
        { remoteJid: ME_PN, fromMe: true },
        { viewOnceMessage: { message: { imageMessage: { caption: 'tek', mimetype: 'image/jpeg' } } } },
      ),
      ctx,
    )
    expect(once).toMatchObject({ text: 'tek', media: { kind: 'image' } })
  })

  it('flags groups but drops status, broadcast and newsletters', () => {
    expect(toInbound(wam({ remoteJid: '120363@g.us', fromMe: false }, { conversation: 'x' }), ctx)?.isGroup).toBe(true)
    expect(toInbound(wam({ remoteJid: 'status@broadcast', fromMe: false }, { conversation: 'x' }), ctx)).toBeUndefined()
    expect(toInbound(wam({ remoteJid: '123@newsletter', fromMe: false }, { conversation: 'x' }), ctx)).toBeUndefined()
  })

  it('ignores reactions, protocol messages, polls and empty stubs', () => {
    const key = { remoteJid: ME_PN, fromMe: true }
    expect(toInbound(wam(key, { reactionMessage: { text: '👍' } }), ctx)).toBeUndefined()
    expect(toInbound(wam(key, { protocolMessage: { type: 0 } }), ctx)).toBeUndefined()
    expect(toInbound(wam(key, { pollCreationMessage: { name: 'x' } }), ctx)).toBeUndefined()
    expect(toInbound(wam(key, null), ctx)).toBeUndefined()
    expect(toInbound(wam({ fromMe: true }, { conversation: 'x' }), ctx)).toBeUndefined()
  })

  it('treats an empty text message as nothing', () => {
    expect(toInbound(wam({ remoteJid: ME_PN, fromMe: true }, { conversation: '   ' }), ctx)).toBeUndefined()
  })
})

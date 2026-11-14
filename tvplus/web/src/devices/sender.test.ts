import { describe, expect, it } from 'vitest'
import type { RemoteCommand } from '../../../shared/devices'
import { CommandQueue, MAX_QUEUE } from './sender'

function deferredSend() {
  const calls: { id: string; cmd: RemoteCommand; resolve: (v: boolean) => void; reject: (e: unknown) => void }[] = []
  const send = (id: string, cmd: RemoteCommand) =>
    new Promise<boolean>((resolve, reject) => calls.push({ id, cmd, resolve, reject }))
  return { calls, send }
}
const tick = () => new Promise((r) => setTimeout(r, 0))

describe('komut kuyruğu', () => {
  it('sırayla, birer birer yollar', async () => {
    const d = deferredSend()
    const q = new CommandQueue({ send: d.send })
    const a = q.enqueue('tv', { type: 'KEY', key: 'LEFT' })
    void q.enqueue('tv', { type: 'KEY', key: 'RIGHT' })
    await tick()
    expect(d.calls.length).toBe(1)
    d.calls[0]!.resolve(true)
    expect(await a).toBe('delivered')
    await tick()
    expect(d.calls.map((c) => (c.cmd.type === 'KEY' ? c.cmd.key : ''))).toEqual(['LEFT', 'RIGHT'])
  })
  it('bekleyen SEEK yenisiyle değişir', async () => {
    const d = deferredSend()
    const q = new CommandQueue({ send: d.send })
    void q.enqueue('tv', { type: 'KEY', key: 'OK' })
    void q.enqueue('tv', { type: 'SEEK', positionSec: 10 })
    void q.enqueue('tv', { type: 'SEEK', positionSec: 20 })
    await tick()
    d.calls[0]!.resolve(true)
    await tick()
    expect(d.calls[1]!.cmd).toEqual({ type: 'SEEK', positionSec: 20 })
    d.calls[1]!.resolve(true)
    await tick()
    expect(d.calls.length).toBe(2)
  })
  it('TEXT birleşince submit korunur', async () => {
    const d = deferredSend()
    const q = new CommandQueue({ send: d.send })
    void q.enqueue('tv', { type: 'KEY', key: 'OK' })
    void q.enqueue('tv', { type: 'TEXT', text: 'sin', submit: true })
    void q.enqueue('tv', { type: 'TEXT', text: 'sint' })
    await tick()
    d.calls[0]!.resolve(true)
    await tick()
    expect(d.calls[1]!.cmd).toEqual({ type: 'TEXT', text: 'sint', submit: true })
  })
  it('hata ve teslim edilmeme sonucu bildirilir; kuyruk sürer', async () => {
    const d = deferredSend()
    const results: string[] = []
    const q = new CommandQueue({ send: d.send, onResult: (_c, r) => results.push(r) })
    const a = q.enqueue('tv', { type: 'KEY', key: 'UP' })
    const b = q.enqueue('tv', { type: 'KEY', key: 'DOWN' })
    await tick()
    d.calls[0]!.reject(new Error('HTTP_500'))
    expect(await a).toBe('error')
    await tick()
    d.calls[1]!.resolve(false)
    expect(await b).toBe('undelivered')
    expect(results).toEqual(['error', 'undelivered'])
  })
  it('TV yanıt vermezken biriken tuşların en eskileri atılır', async () => {
    const d = deferredSend()
    const q = new CommandQueue({ send: d.send })
    const first = q.enqueue('tv', { type: 'KEY', key: 'UP' })
    const extra: Promise<string>[] = []
    for (let i = 0; i < MAX_QUEUE + 3; i++) extra.push(q.enqueue('tv', { type: 'KEY', key: 'DOWN' }))
    expect(await extra[0]).toBe('undelivered')
    expect(q.size).toBe(MAX_QUEUE + 1)
    d.calls[0]!.resolve(true)
    expect(await first).toBe('delivered')
  })
})

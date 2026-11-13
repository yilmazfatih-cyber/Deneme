/**
 * SSE bağlantı merkezi: her açık `GET /api/devices/stream` bir bağlantıdır. Aynı cihazın birden çok sekmesi ayrı
 * bağlantı açar ve her olayı hepsi alır. 15 sn'de bir `: ping` yorumu bağlantıyı (ve ara vekilleri) canlı tutar.
 */
import type { ServerResponse } from 'node:http'

export interface StreamConn {
  id: number
  deviceId: string
  accountId: string
  res: ServerResponse
  ping: NodeJS.Timeout
}

export interface Hub {
  open(deviceId: string, accountId: string, res: ServerResponse, onClose: (conn: StreamConn) => void): StreamConn
  /** Olayı o cihazın tüm akışlarına yollar; ulaştığı akış sayısını döndürür. */
  sendToDevice(deviceId: string, event: string, data: unknown): number
  send(conn: StreamConn, event: string, data: unknown): boolean
  connsOfAccount(accountId: string): StreamConn[]
  countOf(deviceId: string): number
  /** O cihazın akışlarını kapatır (uzaktan çıkışta). */
  closeDevice(deviceId: string): void
  closeAll(): void
}

export const PING_MS = 15_000

export function createHub(): Hub {
  const conns = new Set<StreamConn>()
  let seq = 0

  const writable = (res: ServerResponse) => !res.writableEnded && !res.destroyed

  const send = (conn: StreamConn, event: string, data: unknown): boolean => {
    if (!writable(conn.res)) return false
    conn.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    return true
  }

  const end = (conn: StreamConn) => {
    clearInterval(conn.ping)
    if (writable(conn.res)) conn.res.end()
  }

  return {
    open(deviceId, accountId, res, onClose) {
      const conn: StreamConn = {
        id: ++seq,
        deviceId,
        accountId,
        res,
        ping: setInterval(() => {
          if (writable(res)) res.write(': ping\n\n')
        }, PING_MS),
      }
      // Canlı tutma zamanlayıcısı süreci (testleri) açık tutmasın.
      conn.ping.unref()
      conns.add(conn)
      res.on('close', () => {
        clearInterval(conn.ping)
        if (conns.delete(conn)) onClose(conn)
      })
      return conn
    },
    send,
    sendToDevice(deviceId, event, data) {
      let n = 0
      for (const c of conns) if (c.deviceId === deviceId && send(c, event, data)) n++
      return n
    },
    connsOfAccount(accountId) {
      return [...conns].filter((c) => c.accountId === accountId)
    },
    countOf(deviceId) {
      let n = 0
      for (const c of conns) if (c.deviceId === deviceId && writable(c.res)) n++
      return n
    },
    closeDevice(deviceId) {
      for (const c of [...conns]) if (c.deviceId === deviceId) end(c)
    },
    closeAll() {
      for (const c of [...conns]) end(c)
    },
  }
}

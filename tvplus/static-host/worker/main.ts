/**
 * Worker girişi. SharedWorker olarak açılırsa her sekme/çerçeve bir `connect` ile bağlanır; düz Worker olarak açılırsa
 * (SharedWorker'ı olmayan tarayıcılar) tek istemcisi onu açan lider sekmedir.
 */
import './prelude'
import type { ToBackend } from '../shared/protocol'
import { attach, type PortLike } from './backend'

interface MessagePortLike extends PortLike {
  onmessage: ((e: MessageEvent<ToBackend>) => void) | null
  start?: () => void
}

const scope = globalThis as unknown as {
  onconnect?: ((e: MessageEvent) => void) | null
  postMessage: PortLike['postMessage']
  onmessage: ((e: MessageEvent<ToBackend>) => void) | null
  SharedWorkerGlobalScope?: unknown
}

if (typeof scope.SharedWorkerGlobalScope === 'function' && globalThis instanceof (scope.SharedWorkerGlobalScope as typeof Object)) {
  scope.onconnect = (e: MessageEvent) => {
    const port = e.ports[0] as unknown as MessagePortLike
    const deliver = attach(port)
    port.onmessage = (ev) => deliver(ev.data)
    port.start?.()
  }
} else {
  const deliver = attach({ postMessage: (msg, transfer) => scope.postMessage(msg, transfer) })
  scope.onmessage = (ev) => deliver(ev.data)
}

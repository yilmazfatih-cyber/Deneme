/**
 * `undici` yedeği: tarayıcının kendi `fetch`'i. Vekil ajanları ve `dispatcher` seçeneği yok sayılır
 * (tarayıcı kendi ağ ayarlarını kullanır; uzak kaynaklara erişim CORS'a bağlıdır).
 */

export const fetch = (input: RequestInfo | URL, init?: RequestInit & { dispatcher?: unknown }): Promise<Response> => {
  if (init && 'dispatcher' in init) {
    const { dispatcher: _ignored, ...rest } = init
    void _ignored
    return globalThis.fetch(input, rest)
  }
  return globalThis.fetch(input, init)
}

export class Dispatcher {
  close(): Promise<void> {
    return Promise.resolve()
  }
  destroy(): Promise<void> {
    return Promise.resolve()
  }
}
export class Agent extends Dispatcher {}
export class ProxyAgent extends Dispatcher {}
export class EnvHttpProxyAgent extends Dispatcher {}
export class MockAgent extends Dispatcher {}

export const setGlobalDispatcher = (): void => {}
export const getGlobalDispatcher = (): Dispatcher => new Agent()
export const Headers = globalThis.Headers
export const Request = globalThis.Request
export const Response = globalThis.Response

export default { fetch, Agent, ProxyAgent, EnvHttpProxyAgent, Dispatcher, setGlobalDispatcher, getGlobalDispatcher }

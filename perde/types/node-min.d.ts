// Yalnızca bu projenin kullandığı Node API'lerinin en küçük tip bildirimi.
// Çalışma zamanı bağımlılığı eklememek için @types/node yerine kullanılır.

declare module 'node:http' {
  export interface IncomingMessage extends AsyncIterable<Uint8Array> {
    method?: string
    url?: string
    headers: Record<string, string | string[] | undefined>
    on(event: 'data', cb: (chunk: Uint8Array) => void): this
    on(event: 'end' | 'close', cb: () => void): this
    on(event: 'error', cb: (err: Error) => void): this
    resume(): this
    destroy(): this
  }
  export interface ServerResponse {
    writableEnded: boolean
    writableFinished: boolean
    headersSent: boolean
    writeHead(status: number, headers?: Record<string, string>): this
    setHeader(name: string, value: string): this
    flushHeaders(): void
    write(chunk: string | Uint8Array): boolean
    end(chunk?: string | Uint8Array, cb?: () => void): this
    on(event: 'close' | 'finish', cb: () => void): this
  }
  export interface Server {
    listen(port: number, host: string, cb?: () => void): this
    close(cb?: (err?: Error) => void): this
    closeAllConnections?(): void
    address(): { port: number; address: string } | string | null
    on(event: 'error', cb: (err: Error) => void): this
  }
  export function createServer(handler: (req: IncomingMessage, res: ServerResponse) => void): Server
  const http: { createServer: typeof createServer }
  export default http
}

declare module 'node:fs/promises' {
  export function readFile(path: string): Promise<Uint8Array>
}

declare module 'node:path' {
  export const sep: string
  export function resolve(...parts: string[]): string
  export function join(...parts: string[]): string
  export function dirname(p: string): string
  export function extname(p: string): string
  const path: {
    sep: string
    resolve: typeof resolve
    join: typeof join
    dirname: typeof dirname
    extname: typeof extname
  }
  export default path
}

declare module 'node:url' {
  export function fileURLToPath(url: string | URL): string
  export function pathToFileURL(path: string): URL
}

declare const process: {
  env: Record<string, string | undefined>
  argv: string[]
  stdout: { write(s: string): boolean }
  stderr: { write(s: string): boolean }
  on(event: string, cb: () => void): void
  exit(code?: number): never
}

declare const Buffer: {
  from(data: Uint8Array | string): Uint8Array & { toString(enc?: string): string }
  concat(list: Uint8Array[]): Uint8Array & { toString(enc?: string): string }
  byteLength(s: string): number
}

interface ImportMeta {
  url: string
}

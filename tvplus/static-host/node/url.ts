/** `node:url` karşılığı. Paketlenmiş kodda `import.meta.url` bir http adresidir; yolu olduğu gibi döner. */

export const URL = globalThis.URL
export const URLSearchParams = globalThis.URLSearchParams

export function fileURLToPath(u: string | URL): string {
  const url = typeof u === 'string' ? new globalThis.URL(u) : u
  return decodeURIComponent(url.pathname)
}

export function pathToFileURL(p: string): URL {
  return new globalThis.URL(`file://${encodeURI(p.startsWith('/') ? p : `/${p}`)}`)
}

export default { URL, URLSearchParams, fileURLToPath, pathToFileURL }

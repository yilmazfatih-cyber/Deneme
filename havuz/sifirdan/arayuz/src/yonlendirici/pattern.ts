// Yol desenleri: `/kullanici/:id`, isteğe bağlı parça `/arama/:sorgu?`, joker `/dosya/*` (ya da `*yol`).
// Desen parçalara ayrılır; isteğe bağlı parçalar "var/yok" çeşitlemelerine açılır; her çeşitleme bir puan alır
// (sabit parça > parametre > joker). Birden çok desen eşleşirse en yüksek puanlı kazanır; eşitlikte tanım sırası.
// Genişletme: parametreye kısıt (ör. `:id(\d+)`) eklemek için `Segment`'e `test` alanı ekleyip `matchSegments`'te sınayın.

export type Segment =
  { kind: 'static'; value: string } | { kind: 'param'; name: string } | { kind: 'wildcard'; name: string }

export type Params = Record<string, string>

const STATIC_SCORE = 10
const PARAM_SCORE = 3
const WILDCARD_PENALTY = -2

/** "/a//b/" → ["a", "b"] */
export function splitPath(path: string): string[] {
  return path.split('/').filter((part) => part.length > 0)
}

export function joinPaths(parent: string, child: string): string {
  if (child.startsWith('/')) return child
  const joined = `${parent.replace(/\/+$/, '')}/${child}`
  return joined.startsWith('/') ? joined : `/${joined}`
}

/** Deseni çözümler; isteğe bağlı parçalar için tüm "var/yok" çeşitlemelerini döndürür. */
export function expandPattern(pattern: string): Segment[][] {
  let variants: Segment[][] = [[]]
  const parts = splitPath(pattern)
  parts.forEach((part, index) => {
    if (part === '*' || part.startsWith('*')) {
      if (index !== parts.length - 1) throw new Error(`Joker (*) yalnız desenin sonunda olabilir: "${pattern}"`)
      const segment: Segment = { kind: 'wildcard', name: part.length > 1 ? part.slice(1) : '*' }
      variants = variants.map((v) => [...v, segment])
      return
    }
    if (part.startsWith(':')) {
      const optional = part.endsWith('?')
      const name = part.slice(1, optional ? -1 : undefined)
      if (!/^[A-Za-z_][\w]*$/.test(name)) throw new Error(`Geçersiz parametre adı "${part}" (desen: "${pattern}")`)
      const segment: Segment = { kind: 'param', name }
      variants = optional ? variants.flatMap((v) => [[...v, segment], v]) : variants.map((v) => [...v, segment])
      return
    }
    variants = variants.map((v) => [...v, { kind: 'static', value: part }])
  })
  return variants
}

export function scoreSegments(segments: readonly Segment[]): number {
  let score = segments.length
  for (const segment of segments) {
    if (segment.kind === 'static') score += STATIC_SCORE
    else if (segment.kind === 'param') score += PARAM_SCORE
    else score += WILDCARD_PENALTY
  }
  return score
}

function decode(part: string): string {
  try {
    return decodeURIComponent(part)
  } catch {
    return part // bozuk yüzde kodlaması: ham hâliyle bırak
  }
}

/** Parçaları yol ile eşleştirir; eşleşirse parametreleri döndürür. */
export function matchSegments(segments: readonly Segment[], pathname: string): Params | null {
  const parts = splitPath(pathname)
  const params: Params = {}
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i] as Segment
    if (segment.kind === 'wildcard') {
      params[segment.name] = parts.slice(i).map(decode).join('/')
      return params
    }
    const part = parts[i]
    if (part === undefined) return null
    if (segment.kind === 'static') {
      if (decode(part) !== segment.value) return null
    } else {
      params[segment.name] = decode(part)
    }
  }
  return parts.length === segments.length ? params : null
}

/** Parametreleri desene yerleştirerek yol üretir: `buildPath('/kullanici/:id', { id: 'ayşe' })`. */
export function buildPath(pattern: string, params: Params = {}): string {
  const out: string[] = []
  for (const part of splitPath(pattern)) {
    if (part.startsWith('*')) {
      const value = params[part.length > 1 ? part.slice(1) : '*']
      if (value) out.push(...value.split('/').map(encodeURIComponent))
    } else if (part.startsWith(':')) {
      const optional = part.endsWith('?')
      const name = part.slice(1, optional ? -1 : undefined)
      const value = params[name]
      if (value === undefined || value === '') {
        if (optional) continue
        throw new Error(`"${pattern}" için "${name}" parametresi eksik.`)
      }
      out.push(encodeURIComponent(value))
    } else out.push(part)
  }
  return `/${out.join('/')}`
}

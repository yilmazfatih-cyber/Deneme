/**
 * cografya — küre üzerinde coğrafi hesap: iki nokta arası büyük daire uzaklığı (haversine), ilk yön açısı, verilen
 * yön ve uzaklıktaki nokta, bir merkezin çevresindeki sınır kutusu (veritabanında ön süzme için), kutu içinde mi,
 * en yakın noktalar.
 *
 * Kullanım:
 *   haversineDistance({ lat: 41.0082, lon: 28.9784 }, { lat: 39.9334, lon: 32.8597 })   // ≈ 349 km (metre döner)
 *   const kutu = boundingBox(merkez, 5000)          // 5 km yarıçap → { minLat, minLon, maxLat, maxLon }
 *   // SQL: WHERE lat BETWEEN minLat AND maxLat AND lon BETWEEN minLon AND maxLon, sonra haversine ile kesinleştir
 *   nearest(konum, subeler, { key: (s) => s.konum, limit: 3 })
 *
 * Sınırlar: Dünya küre kabul edilir (ortalama yarıçap 6 371 008,8 m); gerçek (elipsoit) uzaklıktan sapma %0,5'e
 * kadar çıkabilir. Metre altı hassasiyet gerekiyorsa Vincenty/Karney yöntemleri gerekir. Sınır kutusu 180. boylamı
 * aşarsa minLon > maxLon olur (isInBoundingBox bunu bilir); kutu bir kutbu içerirse boylam aralığı tümüdür.
 *
 * Genişletme: Yeni işlev derece alıp derece döndürür, girdiyi `checkPoint` ile denetler; Python eşine
 * (kutuphane/cografya.py) aynı formülle eklenir ve `vektorler/cografya.json`'a örnek yazılır.
 */

export interface LatLon {
  lat: number
  lon: number
}

export interface BoundingBox {
  minLat: number
  minLon: number
  maxLat: number
  maxLon: number
}

/** Ortalama Dünya yarıçapı (IUGG, metre). */
export const EARTH_RADIUS_M = 6_371_008.8

export class GeoError extends Error {
  override name = 'GeoError'
}

const RAD = Math.PI / 180

function checkPoint(point: LatLon, label = 'nokta'): void {
  const { lat, lon } = point
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new GeoError(`${label}: enlem −90 ile 90 arasında olmalı (${lat}).`)
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
    throw new GeoError(`${label}: boylam −180 ile 180 arasında olmalı (${lon}).`)
  }
}

function normalizeLon(lon: number): number {
  const wrapped = ((((lon + 180) % 360) + 360) % 360) - 180
  return wrapped === -180 && lon > 0 ? 180 : wrapped
}

/** Büyük daire uzaklığı (metre), haversine formülü. */
export function haversineDistance(a: LatLon, b: LatLon, radius: number = EARTH_RADIUS_M): number {
  checkPoint(a, 'a')
  checkPoint(b, 'b')
  const dLat = (b.lat - a.lat) * RAD
  const dLon = (b.lon - a.lon) * RAD
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** a'dan b'ye ilk yön açısı (derece; 0 = kuzey, 90 = doğu). */
export function initialBearing(a: LatLon, b: LatLon): number {
  checkPoint(a, 'a')
  checkPoint(b, 'b')
  const φ1 = a.lat * RAD
  const φ2 = b.lat * RAD
  const Δλ = (b.lon - a.lon) * RAD
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return ((Math.atan2(y, x) / RAD) + 360) % 360
}

/** Başlangıçtan `bearing` yönünde `distance` metre ilerideki nokta. */
export function destinationPoint(start: LatLon, bearing: number, distance: number, radius: number = EARTH_RADIUS_M): LatLon {
  checkPoint(start, 'başlangıç')
  const δ = distance / radius
  const θ = bearing * RAD
  const φ1 = start.lat * RAD
  const λ1 = start.lon * RAD
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ))
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2))
  return { lat: φ2 / RAD, lon: normalizeLon(λ2 / RAD) }
}

/** Merkezin `radiusM` metre çevresini kapsayan en küçük enlem/boylam kutusu (J. Matuschek yöntemi). */
export function boundingBox(center: LatLon, radiusM: number, radius: number = EARTH_RADIUS_M): BoundingBox {
  checkPoint(center, 'merkez')
  if (!(radiusM >= 0)) throw new GeoError('Yarıçap 0 veya daha büyük olmalı.')
  const δ = radiusM / radius
  const lat = center.lat * RAD
  let minLat = lat - δ
  let maxLat = lat + δ
  let minLon: number
  let maxLon: number
  if (minLat > -Math.PI / 2 && maxLat < Math.PI / 2) {
    const Δλ = Math.asin(Math.min(1, Math.sin(δ) / Math.cos(lat)))
    minLon = normalizeLon(center.lon - Δλ / RAD)
    maxLon = normalizeLon(center.lon + Δλ / RAD)
  } else {
    minLat = Math.max(minLat, -Math.PI / 2)
    maxLat = Math.min(maxLat, Math.PI / 2)
    minLon = -180
    maxLon = 180
  }
  return { minLat: minLat / RAD, minLon, maxLat: maxLat / RAD, maxLon }
}

/** Nokta kutunun içinde mi? (180. boylamı aşan kutuyu da doğru değerlendirir.) */
export function isInBoundingBox(point: LatLon, box: BoundingBox): boolean {
  checkPoint(point)
  if (point.lat < box.minLat || point.lat > box.maxLat) return false
  return box.minLon <= box.maxLon
    ? point.lon >= box.minLon && point.lon <= box.maxLon
    : point.lon >= box.minLon || point.lon <= box.maxLon
}

/** Hedefe en yakın `limit` öğe (uzaklık metre), yakından uzağa; eşitlikte listedeki sıra. */
export function nearest<T>(
  target: LatLon,
  items: readonly T[],
  options: { key?: (item: T) => LatLon; limit?: number } = {},
): { item: T; distance: number }[] {
  const key = options.key ?? ((item: T) => item as unknown as LatLon)
  return items
    .map((item, index) => ({ item, index, distance: haversineDistance(target, key(item)) }))
    .sort((x, y) => x.distance - y.distance || x.index - y.index)
    .slice(0, options.limit ?? 1)
    .map(({ item, distance }) => ({ item, distance }))
}

// Malzeme: yüzeyin ışığa nasıl tepki verdiği. Lambert (dağınık) + Phong (parlak nokta) + yansıma + kırılma.
//   diffuse   : dağınık yansıyan ışık oranı (mat boya)
//   specular  : parlak nokta gücü; shininess büyüdükçe nokta küçülür ve keskinleşir
//   reflect   : ayna oranı (0 = hiç, 1 = tam ayna)
//   transparent: saydamlık (cam); ior kırılma indisi (hava 1, su 1,33, cam 1,5)
// Dama (checker) deseni düzlemi yerde konumla iki renk arasında değiştirir.
// Genişletme: doku (resim) için `colorAt`'e UV koordinatı ve doku örnekleyici ekleyin.
import { vec, type Vec3 } from './vec.ts'

export interface Material {
  color: Vec3
  diffuse: number
  specular: number
  shininess: number
  reflect: number
  transparent: number
  ior: number
  checker?: { size: number; color: Vec3 }
}

export function material(partial: Partial<Material> & { color: Vec3 }): Material {
  return { diffuse: 0.9, specular: 0.3, shininess: 32, reflect: 0, transparent: 0, ior: 1.5, ...partial }
}

export function colorAt(m: Material, point: Vec3): Vec3 {
  if (!m.checker) return m.color
  const s = m.checker.size
  const parity = (Math.floor(point.x / s) + Math.floor(point.z / s)) & 1
  return parity === 0 ? m.color : m.checker.color
}

export const WHITE = vec(1, 1, 1)

// Örnek sahne: dama desenli zemin, cam küre, ayna küre, mat küreler ve üçgenlerden bir piramit, iki ışık.
// Gösterim ve "piksel özeti sabit" testi bu sahneyi kullanır: sahneyi değiştirirseniz testteki özeti de
// güncellemeniz gerekir (bilinçli olarak).
// Genişletme: yeni şekil eklemek için `shapes` dizisine bir öğe yazın; BVH kendiliğinden kurulur.
import type { Shape } from './geometry.ts'
import { material } from './material.ts'
import { Scene } from './scene.ts'
import { vec, type Vec3 } from './vec.ts'

function pyramid(base: Vec3, size: number, height: number, color: Vec3): Shape[] {
  const m = material({ color, diffuse: 0.85, specular: 0.4, shininess: 48 })
  const h = size / 2
  const a = vec(base.x - h, base.y, base.z - h)
  const b = vec(base.x + h, base.y, base.z - h)
  const c = vec(base.x + h, base.y, base.z + h)
  const d = vec(base.x - h, base.y, base.z + h)
  const top = vec(base.x, base.y + height, base.z)
  return [
    { kind: 'triangle', a, b: top, c: b, material: m },
    { kind: 'triangle', a: b, b: top, c, material: m },
    { kind: 'triangle', a: c, b: top, c: d, material: m },
    { kind: 'triangle', a: d, b: top, c: a, material: m },
  ]
}

export function exampleScene(): Scene {
  return new Scene({
    shapes: [
      {
        kind: 'plane',
        point: vec(0, 0, 0),
        normal: vec(0, 1, 0),
        material: material({ color: vec(0.85, 0.85, 0.8), specular: 0.1, reflect: 0.15, checker: { size: 1, color: vec(0.12, 0.13, 0.16) } }),
      },
      { kind: 'sphere', center: vec(0, 1, 0), radius: 1, material: material({ color: vec(1, 1, 1), transparent: 0.92, ior: 1.5, specular: 0.9, shininess: 128 }) },
      { kind: 'sphere', center: vec(-2.3, 0.9, -1.2), radius: 0.9, material: material({ color: vec(0.9, 0.9, 0.95), reflect: 0.85, specular: 1, shininess: 256 }) },
      { kind: 'sphere', center: vec(2.1, 0.6, -0.6), radius: 0.6, material: material({ color: vec(0.9, 0.35, 0.2) }) },
      { kind: 'sphere', center: vec(1.2, 0.35, 1.4), radius: 0.35, material: material({ color: vec(0.25, 0.7, 0.4) }) },
      ...pyramid(vec(2.9, 0, -3.4), 1.8, 2, vec(0.35, 0.5, 0.95)),
    ],
    lights: [
      { position: vec(-4, 7, 5), color: vec(1, 0.96, 0.9), intensity: 0.9 },
      { position: vec(5, 4, 2), color: vec(0.6, 0.7, 1), intensity: 0.4 },
    ],
    ambient: vec(0.08, 0.09, 0.11),
    sky: { top: vec(0.25, 0.42, 0.75), bottom: vec(0.85, 0.88, 0.95) },
    camera: { position: vec(0, 2.2, 6), target: vec(0, 0.8, 0), up: vec(0, 1, 0), fov: 45 },
    maxDepth: 5,
  })
}

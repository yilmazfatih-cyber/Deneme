// Gölgelendirme (Whitted tarzı ışın izleme): ışının çarptığı noktada
//   renk = ortam + Σ ışık [ gölge? 0 : Lambert (N·L) + Phong (R·V)^parlaklık ] + yansıma + kırılma
// Gölge: noktadan ışığa bir ışın atılır; arada cisim varsa ışık katkısı yok (saydam cisim kısmen geçirir).
// Yansıma ve kırılma özyinelemelidir; derinlik sınırı sonsuz aynada döngüyü keser. Camda yansıma/kırılma
// oranı Fresnel'dir (Schlick): dik bakışta az, yalayarak bakışta çok yansıma. Işın cismin içinden çıkarken
// normal ters çevrilir ve indisler yer değiştirir; tam iç yansımada yalnız yansıma kalır.
// Genişletme: yol izleme (global aydınlatma) için yansıma yönünü yarım küreden rastgele örnekleyin.
import { EPS, normalAt, type Ray } from './geometry.ts'
import { colorAt } from './material.ts'
import type { Scene } from './scene.ts'
import { add, dot, lerp, mul, neg, normalize, reflect, refract, scale, schlick, sub, vec, ZERO, type Vec3 } from './vec.ts'

function sky(scene: Scene, dir: Vec3): Vec3 {
  const t = 0.5 * (dir.y + 1)
  return lerp(scene.spec.sky.bottom, scene.spec.sky.top, t)
}

/** Noktadan ışığa: arada cisim var mı? 0 = tam gölge, 1 = açık. Saydam cisim ışığı kısmen geçirir. */
function lightVisibility(scene: Scene, point: Vec3, toLight: Vec3, distance: number): number {
  const ray = { origin: point, dir: toLight }
  const blocker = scene.closest(ray, distance)
  if (!blocker) return 1
  return blocker.shape.material.transparent * 0.8
}

export function trace(scene: Scene, ray: Ray, depth = 0): Vec3 {
  const hit = scene.closest(ray)
  if (!hit) return sky(scene, ray.dir)
  const m = hit.shape.material
  const point = add(ray.origin, scale(ray.dir, hit.t))
  let normal = normalAt(hit.shape, point)
  const inside = dot(ray.dir, normal) > 0
  if (inside) normal = neg(normal)
  const base = colorAt(m, point)
  const over = add(point, scale(normal, EPS * 10))
  const view = neg(ray.dir)

  let color = mul(scene.spec.ambient, base)
  for (const light of scene.spec.lights) {
    const toLight = sub(light.position, point)
    const distance = Math.sqrt(dot(toLight, toLight))
    const l = scale(toLight, 1 / distance)
    const lambert = dot(normal, l)
    if (lambert <= 0) continue
    const visible = lightVisibility(scene, over, l, distance)
    if (visible === 0) continue
    const lightColor = scale(light.color, light.intensity * visible)
    color = add(color, scale(mul(base, lightColor), m.diffuse * lambert))
    const specular = Math.max(0, dot(reflect(neg(l), normal), view)) ** m.shininess
    color = add(color, scale(lightColor, m.specular * specular))
  }

  if (depth >= scene.maxDepth) return color
  const reflectDir = normalize(reflect(ray.dir, normal))
  if (m.transparent > 0) {
    const [n1, n2] = inside ? [m.ior, 1] : [1, m.ior]
    const cosine = Math.min(1, dot(view, normal))
    const refracted = refract(ray.dir, normal, n1 / n2)
    const kr = refracted ? schlick(cosine, n1, n2) : 1
    const reflected = trace(scene, { origin: over, dir: reflectDir }, depth + 1)
    const through = refracted ? trace(scene, { origin: sub(point, scale(normal, EPS * 10)), dir: normalize(refracted) }, depth + 1) : ZERO
    const glass = add(scale(reflected, kr), scale(mul(through, lerp(vec(1, 1, 1), base, 0.15)), 1 - kr))
    color = lerp(color, glass, m.transparent)
  } else if (m.reflect > 0) {
    color = lerp(color, trace(scene, { origin: over, dir: reflectDir }, depth + 1), m.reflect)
  }
  return color
}

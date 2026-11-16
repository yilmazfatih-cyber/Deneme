import { describe, expect, it } from 'vitest'
import {
  Bvh,
  cross,
  dot,
  intersectPlane,
  intersectSphere,
  intersectTriangle,
  length,
  material,
  normalAt,
  normalize,
  reflect,
  refract,
  schlick,
  vec,
  type Shape,
} from '../../src/isin_izleyici/index.ts'

const close = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => {
  expect(a.x).toBeCloseTo(b.x, 10)
  expect(a.y).toBeCloseTo(b.y, 10)
  expect(a.z).toBeCloseTo(b.z, 10)
}

describe('vektörler', () => {
  it('dış çarpım sağ el kuralı; birim vektör; sıfır vektör hatası', () => {
    close(cross(vec(1, 0, 0), vec(0, 1, 0)), vec(0, 0, 1))
    expect(length(normalize(vec(3, 4, 12)))).toBeCloseTo(1, 12)
    expect(() => normalize(vec(0, 0, 0))).toThrow(/Sıfır uzunluklu/)
  })

  it('yansıma ve kırılma Snell yasasına uyar; tam iç yansıma yakalanır', () => {
    close(reflect(normalize(vec(1, -1, 0)), vec(0, 1, 0)), normalize(vec(1, 1, 0)))
    const incoming = normalize(vec(Math.sin(Math.PI / 4), -Math.cos(Math.PI / 4), 0))
    const out = refract(incoming, vec(0, 1, 0), 1 / 1.5)!
    const sinOut = Math.sqrt(1 - dot(out, vec(0, -1, 0)) ** 2)
    expect(1 * Math.sin(Math.PI / 4)).toBeCloseTo(1.5 * sinOut, 10)
    expect(length(out)).toBeCloseTo(1, 10)
    const grazing = normalize(vec(Math.sin(1.2), -Math.cos(1.2), 0))
    expect(refract(grazing, vec(0, 1, 0), 1.5)).toBeUndefined()
    expect(schlick(1, 1, 1.5)).toBeCloseTo(0.04, 10)
    expect(schlick(0, 1, 1.5)).toBeCloseTo(1, 10)
  })
})

describe('kesişimler', () => {
  const ray = (o: [number, number, number], d: [number, number, number]) => ({
    origin: vec(...o),
    dir: normalize(vec(...d)),
  })

  it('küre: dıştan, içten, ıskalama', () => {
    expect(intersectSphere(ray([0, 0, -5], [0, 0, 1]), vec(0, 0, 0), 1)).toBeCloseTo(4, 12)
    expect(intersectSphere(ray([0, 0, 0], [0, 0, 1]), vec(0, 0, 0), 1)).toBeCloseTo(1, 12)
    expect(intersectSphere(ray([0, 2, -5], [0, 0, 1]), vec(0, 0, 0), 1)).toBe(Infinity)
    expect(intersectSphere(ray([0, 0, 5], [0, 0, 1]), vec(0, 0, 0), 1)).toBe(Infinity)
  })

  it('düzlem: önde, arkada, paralel', () => {
    expect(intersectPlane(ray([0, 3, 0], [0, -1, 0]), vec(0, 0, 0), vec(0, 1, 0))).toBeCloseTo(3, 12)
    expect(intersectPlane(ray([0, 3, 0], [0, 1, 0]), vec(0, 0, 0), vec(0, 1, 0))).toBe(Infinity)
    expect(intersectPlane(ray([0, 3, 0], [1, 0, 0]), vec(0, 0, 0), vec(0, 1, 0))).toBe(Infinity)
  })

  it('üçgen (Möller–Trumbore): içeride, dışarıda, normal yönü', () => {
    const [a, b, c] = [vec(0, 0, 0), vec(1, 0, 0), vec(0, 1, 0)]
    expect(intersectTriangle(ray([0.2, 0.2, 1], [0, 0, -1]), a, b, c)).toBeCloseTo(1, 12)
    expect(intersectTriangle(ray([0.8, 0.8, 1], [0, 0, -1]), a, b, c)).toBe(Infinity)
    expect(intersectTriangle(ray([-0.1, 0.2, 1], [0, 0, -1]), a, b, c)).toBe(Infinity)
    const tri: Shape = { kind: 'triangle', a, b, c, material: material({ color: vec(1, 1, 1) }) }
    close(normalAt(tri, vec(0.2, 0.2, 0)), vec(0, 0, 1))
  })
})

describe('BVH', () => {
  it('kaba kuvvetle aynı en yakın kesişimi bulur ve çok daha az şekil sınar', () => {
    let seed = 99
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    const m = material({ color: vec(1, 1, 1) })
    const shapes: Shape[] = []
    for (let i = 0; i < 300; i++) {
      const c = vec(random() * 40 - 20, random() * 40 - 20, random() * 40 - 20)
      if (i % 2 === 0) shapes.push({ kind: 'sphere', center: c, radius: 0.2 + random(), material: m })
      else
        shapes.push({
          kind: 'triangle',
          a: c,
          b: vec(c.x + random() * 3, c.y, c.z + 1),
          c: vec(c.x, c.y + random() * 3, c.z),
          material: m,
        })
    }
    const bvh = new Bvh(shapes)
    let bruteTests = 0
    for (let r = 0; r < 200; r++) {
      const ray = {
        origin: vec(random() * 10 - 5, random() * 10 - 5, -40),
        dir: normalize(vec(random() - 0.5, random() - 0.5, 1)),
      }
      let best = Infinity
      let bestIndex = -1
      shapes.forEach((s, i) => {
        bruteTests++
        const t =
          s.kind === 'sphere'
            ? intersectSphere(ray, s.center, s.radius)
            : s.kind === 'triangle'
              ? intersectTriangle(ray, s.a, s.b, s.c)
              : Infinity
        if (t < best) {
          best = t
          bestIndex = i
        }
      })
      const hit = bvh.intersect(ray)
      expect(hit?.index ?? -1).toBe(bestIndex)
      if (hit) expect(hit.t).toBeCloseTo(best, 9)
    }
    expect(bvh.stats.shapeTests).toBeLessThan(bruteTests / 5)
  })
})

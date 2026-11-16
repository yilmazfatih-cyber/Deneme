// Sahne: şekiller (BVH'de), düzlemler (ayrı liste), ışıklar, ortam ışığı, gökyüzü renkleri ve kamera.
// Kamera "şuradan şuraya bak" (look-at) biçimindedir: konum, hedef, yukarı yönü ve dikey görüş açısı.
// `primaryRay(u, v)`: görüntü düzleminde (0..1, 0..1) noktadan geçen ışın; v = 0 üst kenardır.
// Genişletme: alan ışığı (yumuşak gölge) için `Light`'a boyut ekleyip shade.ts'te birden çok gölge ışını atın.
import { Bvh } from './bvh.ts'
import { intersect, type Ray, type Shape } from './geometry.ts'
import { add, cross, normalize, scale, sub, type Vec3 } from './vec.ts'

export interface Light {
  position: Vec3
  color: Vec3
  intensity: number
}

export interface CameraSpec {
  position: Vec3
  target: Vec3
  up: Vec3
  /** Dikey görüş açısı (derece). */
  fov: number
}

export interface SceneSpec {
  shapes: Shape[]
  lights: Light[]
  ambient: Vec3
  sky: { top: Vec3; bottom: Vec3 }
  camera: CameraSpec
  maxDepth?: number
}

export class Scene {
  readonly spec: SceneSpec
  readonly bvh: Bvh
  readonly planes: Shape[]
  private readonly forward: Vec3
  private readonly right: Vec3
  private readonly upVec: Vec3

  constructor(spec: SceneSpec) {
    this.spec = spec
    this.planes = spec.shapes.filter((s) => s.kind === 'plane')
    this.bvh = new Bvh(spec.shapes.filter((s) => s.kind !== 'plane'))
    const c = spec.camera
    this.forward = normalize(sub(c.target, c.position))
    this.right = normalize(cross(this.forward, c.up))
    this.upVec = cross(this.right, this.forward)
  }

  get maxDepth(): number {
    return this.spec.maxDepth ?? 5
  }

  primaryRay(u: number, v: number, aspect: number): Ray {
    const h = Math.tan((this.spec.camera.fov * Math.PI) / 360)
    const x = (2 * u - 1) * h * aspect
    const y = (1 - 2 * v) * h
    const dir = normalize(add(this.forward, add(scale(this.right, x), scale(this.upVec, y))))
    return { origin: this.spec.camera.position, dir }
  }

  /** En yakın kesişen şekil (BVH + düzlemler). */
  closest(ray: Ray, limit = Infinity): { shape: Shape; t: number } | undefined {
    let best: { shape: Shape; t: number } | undefined
    const hit = this.bvh.intersect(ray, limit)
    if (hit) best = { shape: this.bvh.shapes[hit.index] as Shape, t: hit.t }
    for (const plane of this.planes) {
      const t = intersect(ray, plane)
      if (t < (best?.t ?? limit)) best = { shape: plane, t }
    }
    return best
  }
}

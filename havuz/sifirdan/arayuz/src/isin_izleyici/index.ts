// isin_izleyici — ışın izleyici: vektör matematiği, küre/düzlem/üçgen kesişimi, Lambert + Phong + gölge +
// yansıma + kırılma (Fresnel), kenar yumuşatma, BVH, gama düzeltme, PPM ve sıfırdan PNG kodlayıcı.
// Web Worker girişi worker.ts'tedir (buradan dışa aktarılmaz; `new Worker(new URL(...))` ile yüklenir).
// Ayrıntılı anlatım: README.md.
// Genişletme: yeni şekil ya da çıktı biçimi ayrı dosyada yazılıp buradan dışa aktarılır.
export * from './vec.ts'
export {
  EPS,
  intersect,
  intersectSphere,
  intersectPlane,
  intersectTriangle,
  normalAt,
  type Ray,
  type Shape,
} from './geometry.ts'
export { material, colorAt, type Material } from './material.ts'
export { Bvh, hitBox, shapeBox, type Box } from './bvh.ts'
export { Scene, type SceneSpec, type Light, type CameraSpec } from './scene.ts'
export { trace } from './shade.ts'
export { render, renderTile, renderPixel, tiles, type RenderOptions, type Tile } from './render.ts'
export { linearToSrgb, toByte, encodePpm, pixelHash, type RgbaImage } from './image.ts'
export { crc32, adler32, zlibStore, filterRows, encodePng, encodePngStored } from './png.ts'
export { exampleScene } from './example_scene.ts'

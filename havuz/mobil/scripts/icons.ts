/**
 * Uygulama simgelerini ve açılış görselini ÜRETİR (kopyalanmış görsel yok): aşağıdaki SVG çizimi → assets/*.png.
 *   icon.png                  1024×1024, dolu zemin (iOS saydamlığı kabul etmez; köşeleri iOS yuvarlar)
 *   adaptive-icon.png         Android uyarlanabilir simgenin ön planı (saydam, güvenli alan %66 içinde)
 *   adaptive-icon-mono.png    Android 13+ temalı simge (tek renk)
 *   splash-icon.png           açılış ekranının ortasındaki görsel (zemin rengi app.config.ts'te)
 *   favicon.png               web derlemesi sekme simgesi
 *
 * Kullanım: npm run icons    Genişletme: çizimi değiştirmek için GLYPH'i, rengi değiştirmek için BRAND'i düzenleyin
 * (BRAND app.config.ts'teki `BRAND_COLOR` ile aynı olmalı).
 */
import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'assets')
export const BRAND = '#0e6157'

/** Üst üste iki yapı taşı (64×64 tuval). `fill`: taşların rengi. */
function glyph(fill: string): string {
  return [
    `<rect x="14" y="34" width="36" height="14" rx="4" fill="${fill}"/>`,
    `<rect x="20" y="16" width="24" height="14" rx="4" fill="${fill}" opacity="0.72"/>`,
  ].join('')
}

/** `scale`: çizimin tuvaldeki payı (1 = tam). Arka plan verilmezse saydam. */
function svg(size: number, options: { background?: string; fill: string; scale: number; radius?: number }): string {
  const inner = 64 * options.scale
  const offset = (64 - inner) / 2
  const bg = options.background
    ? `<rect width="64" height="64" rx="${options.radius ?? 0}" fill="${options.background}"/>`
    : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">${bg}<g transform="translate(${offset} ${offset}) scale(${options.scale})">${glyph(options.fill)}</g></svg>`
}

const TARGETS = [
  { file: 'icon.png', size: 1024, svg: svg(1024, { background: BRAND, fill: '#ffffff', scale: 1 }) },
  { file: 'adaptive-icon.png', size: 1024, svg: svg(1024, { fill: '#ffffff', scale: 0.62 }) },
  { file: 'adaptive-icon-mono.png', size: 1024, svg: svg(1024, { fill: '#000000', scale: 0.62 }) },
  { file: 'splash-icon.png', size: 512, svg: svg(512, { fill: '#ffffff', scale: 1 }) },
  { file: 'favicon.png', size: 48, svg: svg(48, { background: BRAND, fill: '#ffffff', scale: 1, radius: 14 }) },
] as const

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true })
  for (const target of TARGETS) {
    await sharp(Buffer.from(target.svg)).resize(target.size, target.size).png().toFile(join(OUT, target.file))
    console.log(`assets/${target.file} (${target.size}×${target.size})`)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()

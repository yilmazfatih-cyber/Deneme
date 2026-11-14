/**
 * Durağan barındırma derlemesi (GitHub Pages): `npm run build:pages` → dist-pages/
 *   1. Kalıcı GraphQL sorgu kayıt defteri (npm run persisted)
 *   2. Önceden üretilen görseller/altyazılar (scripts/build-pages-assets.ts → pages-assets/; betik yoksa atlanır)
 *   3. vite build -c vite.pages.config.ts (uygulama + tarayıcıdaki arka uç worker'ı + içerik paketi)
 *   4. pages-assets/** → dist-pages/ (site yollarıyla), .nojekyll
 * Çıktı göreli tabanlıdır: her alt yolda (ör. https://<kullanıcı>.github.io/Deneme/) çalışır.
 */
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const OUT = join(ROOT, 'dist-pages')
const ASSETS = join(ROOT, 'pages-assets')

const run = (cmd: string, args: string[]): void => {
  execFileSync(cmd, args, { cwd: ROOT, stdio: 'inherit' })
}

const t0 = Date.now()
console.log('› kalıcı sorgular')
run('npx', ['tsx', 'scripts/build-persisted.ts'])

if (existsSync(join(ROOT, 'scripts', 'build-pages-assets.ts'))) {
  console.log('› önceden üretilen görseller (scripts/build-pages-assets.ts)')
  run('npx', ['tsx', 'scripts/build-pages-assets.ts'])
} else console.log('› scripts/build-pages-assets.ts yok: görsel üretimi atlandı')

console.log('› vite build (vite.pages.config.ts)')
run('npx', ['vite', 'build', '-c', 'vite.pages.config.ts'])

if (existsSync(ASSETS)) {
  console.log('› pages-assets → dist-pages')
  cpSync(ASSETS, OUT, { recursive: true })
}
writeFileSync(join(OUT, '.nojekyll'), '')

/* ───────────── özet ───────────── */

const sizeOf = (p: string): number =>
  statSync(p).isDirectory() ? readdirSync(p).reduce((n, f) => n + sizeOf(join(p, f)), 0) : statSync(p).size
const mb = (n: number): string => `${(n / 1048576).toFixed(2)} MB`
const assetsDir = join(OUT, 'assets')
const files = readdirSync(assetsDir).map((f) => ({ f, size: statSync(join(assetsDir, f)).size }))
files.sort((a, b) => b.size - a.size)
console.log(`\nToplam: ${mb(sizeOf(OUT))} (${relative(ROOT, OUT)}/), ${((Date.now() - t0) / 1000).toFixed(1)} sn`)
console.log(`  içerik paketi  ${mb(statSync(join(OUT, 'tvp-icerik.json')).size)}`)
for (const { f, size } of files.slice(0, 4)) console.log(`  assets/${f}  ${mb(size)}`)
if (existsSync(join(OUT, 'img'))) console.log(`  img/  ${mb(sizeOf(join(OUT, 'img')))}`)

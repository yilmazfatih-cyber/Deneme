// Testlerin ortak örnek projesi: bellekteki dosya sistemi + aynı dosyaları diske yazma yardımcısı.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

export const PROJECT: Record<string, string> = {
  '/src/main.js': `import { area, PI_YAKLASIK } from './geometry/index.js'
import * as text from './text.js'
import defaultGreeter, { greet } from './greet.js'
import './side-effect.js'

export const result = [area(2), text.upper('istanbul'), defaultGreeter('Ayşe'), greet('Ali'), PI_YAKLASIK, globalThis.__yanEtki]
export { counter, increment } from './counter.js'
export default function main() {
  return 'ana'
}
`,
  '/src/geometry/index.js': `export * from './circle.js'
export { square } from './square.js'
`,
  '/src/geometry/circle.js': `const PI = 3.14
export const PI_YAKLASIK = PI
export function area(r) {
  return round(PI * r * r)
}
function round(x) {
  return Math.round(x * 100) / 100 // bölme: düzenli ifade değil
}
export function circumference(r) {
  return 2 * PI * r
}
`,
  '/src/geometry/square.js': `export function square(x) {
  return x * x
}
`,
  '/src/text.js': `export function upper(s) {
  return s.toLocaleUpperCase('tr-TR')
}
export const lower = (s) => s.toLocaleLowerCase('tr-TR')
`,
  '/src/greet.js': `export default function (name) {
  return \`Merhaba \${name}\`
}
export const greet = (name) => \`Selam \${name}\`
export const unused = 'KULLANILMAYAN_DEGER'
`,
  '/src/side-effect.js': `globalThis.__yanEtki = 'yan etki çalıştı'
`,
  '/src/counter.js': `export let counter = 0
export function increment() {
  counter++
  return counter
}
`,
  '/src/cycle/entry.js': `import { a } from './a.js'
export const value = a()
`,
  '/src/cycle/a.js': `import { b } from './b.js'
export function a() {
  return 'a' + b()
}
export function fromA() {
  return 'A'
}
`,
  '/src/cycle/b.js': `import { fromA } from './a.js'
export function b() {
  return 'b' + fromA()
}
`,
}

export const memoryFs = (files: Record<string, string> = PROJECT) => ({ readFile: (path: string) => files[path] })

/** Dosyaları geçici bir klasöre yazar (özgün ESM'yi Node'da çalıştırmak için); kök yolu döndürür. */
export function writeProject(files: Record<string, string> = PROJECT): string {
  const root = mkdtempSync(join(tmpdir(), 'paketleyici-'))
  for (const [path, content] of Object.entries(files)) {
    const target = join(root, path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, content)
  }
  return root
}

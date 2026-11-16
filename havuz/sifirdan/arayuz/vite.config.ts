// Gösterim sitesi: kökteki index.html (dizin) + her sistem için demo/<ad>/index.html. Sayfa listesi tek bir
// kayıt dosyasından (demo/gosterimler.json) gelir: yeni gösterim oraya eklenince derlemeye de girer.
// `base: './'`: çıktı herhangi bir alt klasörde (GitHub Pages dahil) çalışır.
// Genişletme: yeni gösterim için `npm run gen -- <ad>` çalıştırın; bu dosyaya dokunmanız gerekmez.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

const demos = JSON.parse(readFileSync(resolve(import.meta.dirname, 'demo/gosterimler.json'), 'utf8')) as {
  ad: string
}[]

export default defineConfig({
  base: './',
  oxc: { jsx: { runtime: 'classic', pragma: 'h', pragmaFrag: 'Fragment', development: false } },
  server: { port: 8450, strictPort: false },
  preview: { port: 8451, strictPort: false },
  worker: { format: 'es' },
  build: {
    outDir: 'dist',
    target: 'es2023',
    rolldownOptions: {
      input: {
        index: resolve(import.meta.dirname, 'index.html'),
        ...Object.fromEntries(demos.map((d) => [d.ad, resolve(import.meta.dirname, `demo/${d.ad}/index.html`)])),
      },
    },
  },
})

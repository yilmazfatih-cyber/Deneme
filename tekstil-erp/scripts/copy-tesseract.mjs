// tesseract.js worker ve WASM çekirdeğini public/tesseract altına kopyalar.
// Böylece OCR, CDN'e gerek kalmadan (çevrimdışı / kapalı ağlarda) çalışır.
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'tesseract');
mkdirSync(out, { recursive: true });
copyFileSync(join(root, 'node_modules/tesseract.js/dist/worker.min.js'), join(out, 'worker.min.js'));
const coreDir = join(root, 'node_modules/tesseract.js-core');
let n = 1;
for (const f of readdirSync(coreDir)) {
  if (/^tesseract-core.*lstm.*\.(js|wasm)$/.test(f)) {
    copyFileSync(join(coreDir, f), join(out, f));
    n++;
  }
}
console.log(`tesseract: ${n} dosya public/tesseract/ altına kopyalandı`);

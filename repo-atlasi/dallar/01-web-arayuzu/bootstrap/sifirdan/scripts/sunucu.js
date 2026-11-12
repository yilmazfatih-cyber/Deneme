// Demo için en küçük statik sunucu (yalnızca node:http). ES modülleri file:// üzerinden yüklenmediği için gerekir.
// Kullanım: node scripts/sunucu.js  →  http://127.0.0.1:8080/
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const kok = fileURLToPath(new URL('..', import.meta.url))
const turler = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
}
const port = Number(process.env.PORT) || 8080

createServer(async (istek, yanit) => {
  let yol
  try {
    yol = decodeURIComponent(new URL(istek.url, 'http://yerel').pathname)
  } catch {
    // Bozuk yüzde kodlaması (ör. /%E0%A4%A) URIError fırlatır; yakalanmazsa tek istek sunucuyu düşürür.
    yanit.writeHead(400).end('geçersiz istek')
    return
  }
  const dosya = normalize(join(kok, yol === '/' ? 'demo/index.html' : yol))
  if (!dosya.startsWith(kok)) {
    yanit.writeHead(403).end('yasak') // ../ ile klasör dışına çıkma denemesi
    return
  }
  try {
    const icerik = await readFile(dosya)
    yanit.writeHead(200, { 'content-type': turler[extname(dosya)] ?? 'application/octet-stream' }).end(icerik)
  } catch {
    yanit.writeHead(404).end('bulunamadı')
  }
}).listen(port, '127.0.0.1', () => console.log(`Demo: http://127.0.0.1:${port}/`))

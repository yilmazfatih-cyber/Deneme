// Model klasörünü yükler: manifest.json + model.bin + tokenizer.json.
// Tarayıcıda `loadFromUrl` (fetch), Node testlerinde `loadFromFiles` kullanılır.
// Genişletme: Başka bir kaynaktan (ör. IndexedDB önbelleği) yüklemek için aynı üçlüyü
// okuyup `build` işlevine verin.

import { loadModel } from './model.js'
import { Tokenizer } from './tokenizer.js'

export async function build(manifest, buffer, tokenizerData) {
  const model = await loadModel(manifest, buffer)
  return { model, tokenizer: new Tokenizer(tokenizerData), manifest }
}

/** `baseUrl` sonunda / olan klasör adresidir (ör. '../ornek-model/tarayici/'). */
export async function loadFromUrl(baseUrl) {
  const get = async (name, kind) => {
    const response = await fetch(new URL(name, baseUrl))
    if (!response.ok) throw new Error(`${name} yüklenemedi (HTTP ${response.status}).`)
    return kind === 'json' ? response.json() : response.arrayBuffer()
  }
  const manifest = await get('manifest.json', 'json')
  const [buffer, tokenizerData] = await Promise.all([
    get(manifest.files.model, 'binary'),
    get(manifest.files.tokenizer, 'json'),
  ])
  return build(manifest, buffer, tokenizerData)
}

/** Node: klasördeki dosyaları okur (yalnız testler ve komut satırı için). */
export async function loadFromFiles(folder) {
  const { readFile } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const manifest = JSON.parse(await readFile(join(folder, 'manifest.json'), 'utf8'))
  const binary = await readFile(join(folder, manifest.files.model))
  const buffer = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength)
  const tokenizerData = JSON.parse(await readFile(join(folder, manifest.files.tokenizer), 'utf8'))
  return build(manifest, buffer, tokenizerData)
}

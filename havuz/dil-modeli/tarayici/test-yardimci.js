// Testlerin ortak yardımcıları: sınama vektörlerini ve modelleri okur.
// Genişletme: Yeni bir sınama dosyası eklerseniz okuyucusunu buraya yazın.

import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { loadFromFiles } from './loader.js'

export const SINAMA = fileURLToPath(new URL('./sinama/', import.meta.url))
export const ORNEK = fileURLToPath(new URL('../ornek-model/tarayici/', import.meta.url))
export const HAS_EXAMPLE = existsSync(`${ORNEK}manifest.json`) && existsSync(`${SINAMA}ornek-model.json`)

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

export const loadFixture = () => loadFromFiles(SINAMA)
export const loadExample = () => loadFromFiles(ORNEK)

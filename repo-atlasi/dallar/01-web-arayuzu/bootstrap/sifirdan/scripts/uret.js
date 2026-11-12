// Belirteçlerden CSS üretir.  Kullanım: node scripts/uret.js [v5|v6] [çıktı-dosyası]
// Dosya verilmezse standart çıktıya yazar. Üretilen dosyalar cikti/ altına konursa .gitignore onları dışarıda tutar.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { v5Tokenlar, v6Tokenlar, yardimciHaritasi } from '../src/tokenlar.js'
import { cssUret } from '../src/uretec.js'

const lehce = process.argv[2] ?? 'v6'
if (lehce !== 'v5' && lehce !== 'v6') {
  console.error('lehçe v5 ya da v6 olmalı')
  process.exit(1)
}
const tokenlar = lehce === 'v5' ? v5Tokenlar : v6Tokenlar
const css = cssUret(tokenlar, yardimciHaritasi(tokenlar))
const hedef = process.argv[3]
if (hedef) {
  mkdirSync(dirname(hedef), { recursive: true })
  writeFileSync(hedef, css + '\n')
  console.error(`${hedef}: ${css.split('\n').length} satır, ${Buffer.byteLength(css)} bayt`)
} else {
  process.stdout.write(css + '\n')
}

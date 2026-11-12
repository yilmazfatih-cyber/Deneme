// Planı diske uygular, sahiplik durumunu tutar, sapmayı (drift) denetler ve güvenle kaldırır.
//
// ECC'nin kurulum çizgisi: plan → durum (install-state.json) → uygula. Durum dosyası "bu dosyayı ben
// yazdım ve içeriği şuydu" bilgisini tutar; böylece yeniden kurulum kendi dosyalarını günceller,
// kullanıcının dosyalarına dokunmaz, kaldırma yalnızca kendi yazdığı ve değişmemiş dosyaları siler.
// superpowers'ın taşıma kılavuzundaki ikinci kural da aynı: "Kullanıcının dosyalarını asla düzenleme."

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { ozet } from './uretici.js'

export const DURUM_DOSYASI = '.beceri-kurulum.json'

export class KurulumHatasi extends Error {}

/** Göreli yolu kökün içinde tutar ve yol üzerindeki sembolik bağlantıları reddeder. */
export function guvenliYol(kok, goreli) {
  const parcalar = goreli.split(/[\\/]/) // 'a//b' boş parça üretir ve reddedilir
  if (path.isAbsolute(goreli) || parcalar.includes('..') || parcalar.includes('')) {
    throw new KurulumHatasi(`güvensiz yol: ${goreli}`)
  }
  let simdiki = kok
  for (const parca of parcalar) {
    simdiki = path.join(simdiki, parca)
    let bilgi
    try {
      bilgi = lstatSync(simdiki)
    } catch (hata) {
      if (hata.code === 'ENOENT') break
      throw hata
    }
    if (bilgi.isSymbolicLink()) throw new KurulumHatasi(`sembolik bağlantı üzerinden yazma reddedildi: ${goreli}`)
  }
  return path.join(kok, ...parcalar)
}

export function durumuOku(kok) {
  const yol = path.join(kok, DURUM_DOSYASI)
  if (!existsSync(yol)) return { surum: 1, dosyalar: {} }
  return JSON.parse(readFileSync(yol, 'utf8'))
}

function durumuYaz(kok, durum) {
  const yol = path.join(kok, DURUM_DOSYASI)
  const gecici = yol + '.gecici'
  writeFileSync(gecici, JSON.stringify(durum, null, 2) + '\n')
  renameSync(gecici, yol) // yarım yazılmış durum dosyası kalmasın
}

function diskOzeti(tamYol) {
  return existsSync(tamYol) ? ozet(readFileSync(tamYol, 'utf8')) : null
}

/**
 * Planı uygular. Dönen rapor: { yazilan, ayni, atlanan: [{ yol, neden }], silinen, korunan }.
 * zorla=true yalnızca bilerek kullanılmalı: kullanıcının değiştirdiği dosyaların üzerine yazar.
 */
export function uygula(plan, kok, { zorla = false, kaynakSurumu = '' } = {}) {
  mkdirSync(kok, { recursive: true })
  const eski = durumuOku(kok)
  const yeni = { surum: 1, kaynak_surumu: kaynakSurumu, dosyalar: {} }
  const rapor = { yazilan: [], ayni: [], atlanan: [], silinen: [], korunan: [] }

  for (const islem of plan.islemler) {
    const tam = guvenliYol(kok, islem.yol)
    const kayit = eski.dosyalar[islem.yol]
    const diskte = diskOzeti(tam)
    if (diskte === islem.sha256) {
      rapor.ayni.push(islem.yol)
      yeni.dosyalar[islem.yol] = { sha256: islem.sha256, hedef: islem.hedef }
      continue
    }
    if (diskte !== null && !zorla) {
      if (!kayit) {
        rapor.atlanan.push({ yol: islem.yol, neden: 'kullanıcının dosyası (sahibi biz değiliz)' })
        continue
      }
      if (kayit.sha256 !== diskte) {
        rapor.atlanan.push({ yol: islem.yol, neden: 'kurulumdan sonra elle değiştirilmiş' })
        yeni.dosyalar[islem.yol] = kayit // sahipliği koru, içeriğe dokunma
        continue
      }
    }
    mkdirSync(path.dirname(tam), { recursive: true })
    writeFileSync(tam, islem.icerik)
    rapor.yazilan.push(islem.yol)
    yeni.dosyalar[islem.yol] = { sha256: islem.sha256, hedef: islem.hedef }
  }

  // Artık üretilmeyen (yetim) dosyalar: değişmemişse sil, değişmişse koru.
  for (const [yol, kayit] of Object.entries(eski.dosyalar)) {
    if (yol in yeni.dosyalar) continue
    const tam = guvenliYol(kok, yol)
    const diskte = diskOzeti(tam)
    if (diskte === kayit.sha256) {
      unlinkSync(tam)
      bosKlasorleriSil(kok, path.dirname(tam))
      rapor.silinen.push(yol)
    } else if (diskte !== null) {
      rapor.korunan.push(yol)
    }
  }
  durumuYaz(kok, yeni)
  return rapor
}

/** Diskteki durumu planla karşılaştırır; hiçbir şey yazmaz. */
export function denetle(plan, kok) {
  const durum = durumuOku(kok)
  const sonuc = { tamam: [], eksik: [], eski: [], elle_degismis: [], sahipsiz: [], yetim: [] }
  const planlanan = new Set()
  for (const islem of plan.islemler) {
    planlanan.add(islem.yol)
    const diskte = diskOzeti(guvenliYol(kok, islem.yol))
    const kayit = durum.dosyalar[islem.yol]
    if (diskte === null) sonuc.eksik.push(islem.yol)
    else if (diskte === islem.sha256) sonuc.tamam.push(islem.yol)
    else if (!kayit) sonuc.sahipsiz.push(islem.yol)
    else if (kayit.sha256 !== diskte) sonuc.elle_degismis.push(islem.yol)
    else sonuc.eski.push(islem.yol) // bizim yazdığımız, dokunulmamış ama kaynak değişmiş
  }
  for (const yol of Object.keys(durum.dosyalar)) {
    if (!planlanan.has(yol)) sonuc.yetim.push(yol)
  }
  return sonuc
}

/** Yalnızca bizim yazdığımız ve değişmemiş dosyaları siler; değişenleri bırakıp raporlar. */
export function kaldir(kok) {
  const durum = durumuOku(kok)
  const rapor = { silinen: [], korunan: [] }
  for (const [yol, kayit] of Object.entries(durum.dosyalar)) {
    const tam = guvenliYol(kok, yol)
    const diskte = diskOzeti(tam)
    if (diskte === kayit.sha256) {
      unlinkSync(tam)
      bosKlasorleriSil(kok, path.dirname(tam))
      rapor.silinen.push(yol)
    } else if (diskte !== null) {
      rapor.korunan.push(yol)
    }
  }
  const durumYolu = path.join(kok, DURUM_DOSYASI)
  if (existsSync(durumYolu)) unlinkSync(durumYolu)
  return rapor
}

function bosKlasorleriSil(kok, klasor) {
  let simdiki = klasor
  while (simdiki.startsWith(kok + path.sep) && existsSync(simdiki) && readdirSync(simdiki).length === 0) {
    rmdirSync(simdiki)
    simdiki = path.dirname(simdiki)
  }
}

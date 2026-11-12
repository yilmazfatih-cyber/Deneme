// Belirteçlerden (tokens) CSS üreten mini tasarım sistemi üreteci.
// Sass'taki karşılıkları (v6 main):
//   scss/layout/_breakpoints.scss → breakpoint-min, breakpoint-prefix, media-breakpoint-up
//   scss/mixins/_grid.scss → make-row, make-col-ready, make-col, make-col-offset, make-grid-columns
//   scss/layout/_grid.scss, _containers.scss → .row, .col-*, .container
//   scss/mixins/_utilities.scss → generate-utility, generate-utilities-loop ; scss/utilities/_api.scss
// v5 (v5-dev) karşılıkları: scss/mixins/_breakpoints.scss (breakpoint-infix), scss/mixins/_grid.scss, scss/utilities/_api.scss

import { kural, medya, katman, kacis, yazdir } from './css.js'

const yuzde = (pay, payda) => `${+((pay / payda) * 100).toFixed(8)}%`

/** En küçük kırılım noktası (min 0) medya sorgusu almaz: "mobil önce" (mobile-first). */
function medyaSorgusu(t, ad) {
  const min = t.breakpoints[ad]
  if (!min) return null
  return t.lehce === 'v6' ? `(width >= ${min}px)` : `(min-width: ${min}px)`
}

/**
 * Kırılım noktası adı + sınıf kökü → sınıf adı.
 *   v5 "infix": col + -md + -6 → col-md-6        v6 "prefix": md: + col-6 → md:col-6
 */
export function sinifAdi(t, kirilim, kok, sonek) {
  const temel = t.breakpoints[kirilim] ? kirilim : null
  const govde = sonek == null || sonek === '' ? kok : kok === '' ? String(sonek) : `${kok}-${sonek}`
  if (!temel) return govde
  if (t.lehce === 'v6') return `${temel}:${govde}`
  if (kok === '') return `${temel}-${sonek}`
  return sonek == null || sonek === '' ? `${kok}-${temel}` : `${kok}-${temel}-${sonek}`
}

const sec = (ad) => `.${kacis(ad)}`
const v = (t, ad) => `--${t.degiskenOneki}${ad}`

/** .row, .row > *, kırılım başına .col*, .row-cols-*, .offset-*, .g-* (make-grid-columns'ın JS hâli). */
export function gridUret(t) {
  const n = t.gridSutun
  const yatay =
    t.lehce === 'v6'
      ? [['padding-inline', `calc(var(${v(t, 'gutter-x')}) * .5)`]]
      : [
          ['padding-right', `calc(var(${v(t, 'gutter-x')}) * .5)`],
          ['padding-left', `calc(var(${v(t, 'gutter-x')}) * .5)`],
        ]
  const satirKenar =
    t.lehce === 'v6'
      ? [['margin-inline', `calc(-.5 * var(${v(t, 'gutter-x')}))`]]
      : [
          ['margin-right', `calc(-.5 * var(${v(t, 'gutter-x')}))`],
          ['margin-left', `calc(-.5 * var(${v(t, 'gutter-x')}))`],
        ]
  const temel = [
    kural('.row', [
      [v(t, 'gutter-x'), t.gutter],
      [v(t, 'gutter-y'), '0'],
      ['display', 'flex'],
      ['flex-wrap', 'wrap'],
      ...satirKenar,
      ['margin-top', `calc(-1 * var(${v(t, 'gutter-y')}))`],
    ]),
    kural('.row > *', [
      ['flex-shrink', '0'],
      ['width', '100%'],
      ['max-width', '100%'],
      ...yatay,
      ['margin-top', `var(${v(t, 'gutter-y')})`],
    ]),
  ]

  const katmanlar = Object.keys(t.breakpoints).map((bp) => {
    const kurallar = [kural(sec(sinifAdi(t, bp, 'col', null)), [['flex', '1 0 0']])]
    kurallar.push(
      kural(`${sec(sinifAdi(t, bp, 'row-cols', 'auto'))} > *`, [
        ['flex', '0 0 auto'],
        ['width', 'auto'],
      ]),
    )
    for (let i = 1; i <= t.gridSatirSutun; i++) {
      kurallar.push(
        kural(`${sec(sinifAdi(t, bp, 'row-cols', i))} > *`, [
          ['flex', '0 0 auto'],
          ['width', yuzde(1, i)],
        ]),
      )
    }
    kurallar.push(
      kural(sec(sinifAdi(t, bp, 'col', 'auto')), [
        ['flex', '0 0 auto'],
        ['width', 'auto'],
      ]),
    )
    for (let i = 1; i <= n; i++) {
      kurallar.push(
        kural(sec(sinifAdi(t, bp, 'col', i)), [
          ['flex', '0 0 auto'],
          ['width', yuzde(i, n)],
        ]),
      )
    }
    const kenar = t.lehce === 'v6' ? 'margin-inline-start' : 'margin-left'
    for (let i = 0; i < n; i++) {
      if (i === 0 && !t.breakpoints[bp]) continue // işe yaramayan .offset-0 üretilmez
      kurallar.push(kural(sec(sinifAdi(t, bp, 'offset', i)), [[kenar, i === 0 ? '0' : yuzde(i, n)]]))
    }
    for (const [anahtar, deger] of Object.entries(t.bosluklar)) {
      kurallar.push(
        kural(sec(sinifAdi(t, bp, 'g', anahtar)), [
          [v(t, 'gutter-x'), deger],
          [v(t, 'gutter-y'), deger],
        ]),
      )
      kurallar.push(kural(sec(sinifAdi(t, bp, 'gx', anahtar)), [[v(t, 'gutter-x'), deger]]))
      kurallar.push(kural(sec(sinifAdi(t, bp, 'gy', anahtar)), [[v(t, 'gutter-y'), deger]]))
    }
    return medya(medyaSorgusu(t, bp), kurallar)
  })
  return [...temel, ...katmanlar]
}

/** .container: her kırılım noktasında bir üst sınır (max-width). */
export function containerUret(t) {
  const yatay =
    t.lehce === 'v6'
      ? [
          ['padding-inline', '.75rem'],
          ['margin-inline', 'auto'],
        ]
      : [
          ['padding-right', '.75rem'],
          ['padding-left', '.75rem'],
          ['margin-right', 'auto'],
          ['margin-left', 'auto'],
        ]
  const temel = kural('.container', [['width', '100%'], ...yatay])
  const sinirlar = Object.entries(t.containerGenislikleri).map(([bp, px]) =>
    medya(medyaSorgusu(t, bp), [kural('.container', [['max-width', `${px}px`]])]),
  )
  return [temel, ...sinirlar]
}

/** Yardımcı API'nin tek bir girdisi için kurallar (generate-utility). */
export function yardimciUret(t, girdi, kirilim, onek = null) {
  const degerler = Array.isArray(girdi.values) ? Object.fromEntries(girdi.values.map((x) => [x, x])) : girdi.values
  const ozellikler = [girdi.property].flat()
  const kok = girdi.class ?? ozellikler[0]
  const onemli = t.onemli ? ' !important' : ''
  return Object.entries(degerler).map(([anahtar, deger]) => {
    const sonek = anahtar === 'null' ? null : anahtar
    let ad = sinifAdi(t, kirilim, kok, sonek)
    if (onek) ad = t.lehce === 'v6' ? `${onek}:${ad}` : `${kok}-${onek}${sonek == null ? '' : `-${sonek}`}`
    return kural(
      sec(ad),
      ozellikler.map((o) => [o, `${deger}${onemli}`]),
    )
  })
}

/** Tüm harita: önce taban, sonra her kırılım noktası (responsive olanlar), en sonda yazdırma (generate-utilities-loop). */
export function yardimcilarUret(t, harita) {
  const girdiler = Object.values(harita).filter((g) => g && g.enabled !== false)
  const bloklar = Object.keys(t.breakpoints).map((bp) => {
    const kurallar = girdiler.filter((g) => g.responsive || !t.breakpoints[bp]).flatMap((g) => yardimciUret(t, g, bp))
    return medya(medyaSorgusu(t, bp), kurallar)
  })
  const yazdirma = girdiler.filter((g) => g.print).flatMap((g) => yardimciUret(t, g, 'xs', 'print'))
  if (yazdirma.length > 0) bloklar.push(medya('print', yazdirma))
  return bloklar
}

/** Hepsi bir arada. v6: CSS katmanları (@layer) sırası özgüllük savaşını !important olmadan çözer. */
export function cssUret(t, harita) {
  const yerlesim = [...containerUret(t), ...gridUret(t)]
  const yardimcilar = yardimcilarUret(t, harita)
  if (t.lehce === 'v6') {
    // Katman sırası baştan bildirilir; sonra gelen katman (utilities) her zaman kazanır.
    return `@layer layout, utilities;\n${yazdir([katman('layout', yerlesim), katman('utilities', yardimcilar)])}`
  }
  return yazdir([...yerlesim, ...yardimcilar])
}

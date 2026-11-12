// Tasarım belirteçleri (design tokens): tek doğruluk kaynağı. Sass'ta bunlar `!default` değişkenler ve haritalardır;
// kullanıcı `@use "bootstrap" with ($grid-columns: 16)` diyerek ezer. Burada düz JS nesneleri.
// Değerler incelenen commit'lerden alındı:
//   v6 (main, 9062790): scss/_config.scss → $breakpoints, $grid-columns, $grid-gutter-x, $spacers, $container-max-widths
//   v5 (v5-dev, ea8d6a2): scss/_variables.scss → $grid-breakpoints, $grid-gutter-width, $spacers, $container-max-widths

const REM = (n) => (n === 0 ? '0' : `${n}rem`)

/** Bootstrap 5.3: infix adlandırma (.col-md-6), --bs- önekli değişkenler, !important yardımcı sınıflar. */
export const v5Tokenlar = {
  lehce: 'v5',
  degiskenOneki: 'bs-',
  breakpoints: { xs: 0, sm: 576, md: 768, lg: 992, xl: 1200, xxl: 1400 },
  containerGenislikleri: { sm: 540, md: 720, lg: 960, xl: 1140, xxl: 1320 },
  gridSutun: 12,
  gridSatirSutun: 6, // .row-cols-1 … .row-cols-6
  gutter: '1.5rem',
  bosluklar: { 0: REM(0), 1: REM(0.25), 2: REM(0.5), 3: REM(1), 4: REM(1.5), 5: REM(3) },
  onemli: true, // $enable-important-utilities: true
}

/** Bootstrap 6 (alfa): önek adlandırma (.md:col-6), öneksiz değişkenler, mantıksal özellikler, @layer. */
export const v6Tokenlar = {
  lehce: 'v6',
  degiskenOneki: '',
  breakpoints: { xs: 0, sm: 576, md: 768, lg: 1024, xl: 1280, '2xl': 1536 },
  containerGenislikleri: { sm: 540, md: 720, lg: 960, xl: 1200, '2xl': 1440 },
  gridSutun: 12,
  gridSatirSutun: 6,
  gutter: '1.5rem',
  bosluklar: {
    0: REM(0),
    1: REM(0.25),
    2: REM(0.375),
    3: REM(0.5),
    4: REM(0.75),
    5: REM(1),
    6: REM(1.25),
    7: REM(1.5),
    8: REM(1.75),
    9: REM(2),
    10: REM(2.25),
    11: REM(2.5),
    12: REM(3),
  },
  onemli: false, // v6'da yardımcıları !important değil, en sondaki `utilities` katmanı kazandırır
}

/**
 * $utilities haritasının küçük bir alt kümesi. Anahtarlar Bootstrap'teki gibi:
 *   property: tek özellik ya da liste; class: sınıf kökü (yoksa ilk özelliğin adı);
 *   values: liste (değer = ad) ya da harita (ad → değer; null anahtar → sonek yok);
 *   responsive: her kırılım noktası için de üret; print: yazdırma varyantı.
 * @param {typeof v5Tokenlar} t
 */
export function yardimciHaritasi(t) {
  const mantiksal = t.lehce === 'v6'
  return {
    display: {
      property: 'display',
      class: 'd',
      values: ['none', 'inline', 'inline-block', 'block', 'flex', 'grid'],
      responsive: true,
      print: true,
    },
    margin: { property: 'margin', class: 'm', values: { ...t.bosluklar, auto: 'auto' }, responsive: true },
    'margin-x': {
      property: mantiksal ? 'margin-inline' : ['margin-right', 'margin-left'],
      class: 'mx',
      values: { ...t.bosluklar, auto: 'auto' },
      responsive: true,
    },
    padding: { property: 'padding', class: 'p', values: t.bosluklar, responsive: true },
    'text-align': {
      property: 'text-align',
      class: 'text',
      values: mantiksal
        ? { start: 'start', center: 'center', end: 'end' }
        : { start: 'left', center: 'center', end: 'right' },
      responsive: true,
    },
    opacity: { property: 'opacity', values: { 0: '0', 25: '.25', 50: '.5', 75: '.75', 100: '1' } },
    shadow: {
      property: 'box-shadow',
      class: 'shadow',
      values: { null: '0 .5rem 1rem rgba(0, 0, 0, .15)', sm: '0 .125rem .25rem rgba(0, 0, 0, .075)', none: 'none' },
    },
  }
}

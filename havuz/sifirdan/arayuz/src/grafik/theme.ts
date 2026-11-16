// Tema: renkler CSS değişkenleriyle verilir; koyu/açık tema `prefers-color-scheme`'e ya da sayfadaki
// `data-tema="koyu" | "acik"` özniteliğine göre değişir. Seri renkleri renk körlüğüne dikkat edilerek seçildi
// (mavi/turuncu/yeşil/mor/pembe/camgöbeği) ve iki temada da zemine karşı en az 3:1 karşıtlık hedeflendi.
// Bu CSS sayfaya bir kez eklenir (`chartCss`); tek başına SVG dosyası için `standaloneStyle` gömülür.
// Genişletme: kurum renkleri için yalnız `--g-s1`…`--g-s6` değişkenlerini sayfanızda yeniden tanımlayın.

const LIGHT =
  '--g-metin:#1f2328;--g-ikincil:#59636e;--g-izgara:#d1d9e0;--g-eksen:#818b98;--g-s1:#0969da;--g-s2:#bc4c00;--g-s3:#1a7f37;--g-s4:#8250df;--g-s5:#bf3989;--g-s6:#0b7285;'
const DARK =
  '--g-metin:#e6edf3;--g-ikincil:#9198a1;--g-izgara:#30363d;--g-eksen:#656c76;--g-s1:#4493f8;--g-s2:#f0883e;--g-s3:#3fb950;--g-s4:#ab7df8;--g-s5:#f778ba;--g-s6:#39c5cf;'

export const SERIES_COUNT = 6

export const chartCss = `
.grafik{${LIGHT}font:12px system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--g-metin)}
@media (prefers-color-scheme:dark){:root:not([data-tema="acik"]) .grafik{${DARK}}}
[data-tema="koyu"] .grafik{${DARK}}
.grafik svg{display:block;width:100%;height:auto;overflow:visible}
.grafik .izgara line{stroke:var(--g-izgara);stroke-width:1}
.grafik .eksen line,.grafik .eksen path{stroke:var(--g-eksen)}
.grafik .eksen text,.grafik .eksen-ad{fill:var(--g-ikincil)}
.grafik .seri{fill:none;stroke-width:2.25;stroke-linejoin:round;stroke-linecap:round}
.grafik .alan{stroke:none;fill-opacity:.18}
.grafik .sutun,.grafik .dilim{stroke:none}
.grafik .dilim{stroke:var(--g-zemin,transparent)}
.grafik .vurgu{fill:none;stroke:var(--g-metin);stroke-width:2}
${Array.from({ length: SERIES_COUNT }, (_, i) => `.grafik .s${i}{color:var(--g-s${i + 1})}`).join('')}
.grafik .seri,.grafik .nokta{stroke:currentColor}
.grafik .alan,.grafik .sutun,.grafik .dilim,.grafik .nokta,.grafik .renk{fill:currentColor}
.grafik .renk{display:inline-block;width:.8em;height:.8em;border-radius:2px;margin-inline-end:.35em;background:currentColor;vertical-align:-.05em}
`

/** Tek başına açılan SVG dosyası için gömülü stil (sayfa CSS'i yokken de renkli görünsün). */
export function standaloneStyle(): string {
  return `<style>${chartCss.replace(/\.grafik(?![-\w])/g, '.grafik-svg').replace(/\n/g, '')}</style>`
}

/** SVG dizgisinin içine stili gömer: indirilen dosya tarayıcıda tek başına açılınca da doğru görünür. */
export function standaloneSvg(svg: string): string {
  return svg.replace(/^<svg([^>]*)>/, `<svg$1>${standaloneStyle()}`)
}

export const seriesClass = (index: number) => `s${index % SERIES_COUNT}`

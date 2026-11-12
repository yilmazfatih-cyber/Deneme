// Sadaka Taşı — grafikler. Çubuklar ve eksenler HTML/CSS ile çizilir (telefonda yazılar küçülmez);
// çizgiler SVG'dir (kalınlık ölçekten bağımsız). Her grafik bir tablo görünümüyle gelir.
// İpuçları (data-ipucu) app.mjs'teki tek işleyiciyle, textContent kullanılarak gösterilir.
import { sayiYaz } from './kurallar.mjs'

export function esc(s) {
  return String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  )
}

/** İpucu verisi: başlık ve [ad, değer metni, renk] satırları. */
function ipucu(baslik, satirlar) {
  return esc(JSON.stringify({ b: baslik, r: satirlar }))
}

const TEK_ONDALIK = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 })

/** Eksen yazısı (kuruştan): 0 · 250 bin · 1,5 mn */
export function eksenYaz(kurus) {
  const tl = kurus / 100
  if (tl === 0) return '0'
  if (Math.abs(tl) >= 1e6) return `${TEK_ONDALIK.format(tl / 1e6)} mn`
  if (Math.abs(tl) >= 1e4) return `${TEK_ONDALIK.format(tl / 1e3)} bin`
  return sayiYaz(tl)
}

/** Yuvarlak eksen adımları: en büyük değeri kapsayan 3–5 çizgi. */
export function guzelOlcek(enBuyuk, adet = 4) {
  if (!(enBuyuk > 0)) return { adim: 1, ust: 1, cizgiler: [0, 1] }
  const kaba = enBuyuk / adet
  const us = 10 ** Math.floor(Math.log10(kaba))
  const oran = kaba / us
  const adim = (oran <= 1 ? 1 : oran <= 2 ? 2 : oran <= 2.5 ? 2.5 : oran <= 5 ? 5 : 10) * us
  const ust = Math.ceil(enBuyuk / adim) * adim
  const cizgiler = []
  for (let v = 0; v <= ust + adim / 2; v += adim) cizgiler.push(v)
  return { adim, ust, cizgiler }
}

function tabloGorunumu(basliklar, satirlar) {
  return `<details class="tablo-gorunum"><summary>Tablo olarak göster</summary><div class="tablo-kap"><table>
    <thead><tr>${basliklar.map((b, i) => `<th scope="col"${i ? ' class="sayi"' : ''}>${esc(b)}</th>`).join('')}</tr></thead>
    <tbody>${satirlar
      .map(
        (s) =>
          `<tr>${s.map((h, i) => (i ? `<td class="sayi">${esc(h)}</td>` : `<th scope="row">${esc(h)}</th>`)).join('')}</tr>`,
      )
      .join('')}</tbody></table></div></details>`
}

function lejant(seriler, bicim = 'kutu') {
  if (seriler.length < 2) return ''
  return `<ul class="lejant" aria-hidden="true">${seriler
    .map((s) => `<li><i class="${bicim} renk-${s.renk}"></i>${esc(s.ad)}</li>`)
    .join('')}</ul>`
}

/**
 * Parçalı çubuk: bir bütünün parçaları. Yazı yalnızca sığdığı bloğa basılır (payı ≥ %15).
 * parcalar: [{ ad, deger, renk, etiket }]; ince: 8px, yazısız.
 */
export function parcaliCubuk(parcalar, { ince = false, aria = '' } = {}) {
  const gorunen = parcalar.filter((p) => p.deger > 0)
  const toplam = gorunen.reduce((a, p) => a + p.deger, 0) || 1
  const bloklar = gorunen
    .map((p) => {
      const pay = p.deger / toplam
      const yazi = !ince && pay >= 0.15 ? `<span class="parca-yazi">${esc(p.etiket)}</span>` : ''
      const ipucuVeri = ince
        ? ''
        : ` data-ipucu="${ipucu(p.ad, [[p.ad, `${p.etiket} · %${sayiYaz(pay * 100)}`, p.renk]])}" tabindex="0"`
      return `<span class="parca renk-${p.renk}" style="flex-grow:${p.deger}"${ipucuVeri}>${yazi}</span>`
    })
    .join('')
  return `<div class="parcali${ince ? ' ince' : ''}" role="img" aria-label="${esc(aria)}">${bloklar}</div>`
}

/** Ölçer: bir değerin bir sınıra oranı; iz, dolgunun açık tonudur. */
export function olcer(deger, ust, { renk = 'cini', aria = '' } = {}) {
  const oran = ust > 0 ? Math.max(0, Math.min(1, deger / ust)) : 0
  return `<div class="olcer olcer-${renk}" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(
    oran * 100,
  )}" aria-label="${esc(aria)}"><i style="width:${(oran * 100).toFixed(2)}%"></i></div>`
}

/**
 * Yığılmış sütun grafiği. seriler: [{ ad, renk, degerler: [kuruş] }] — ilk seri en altta.
 * bicim: değeri ipucu ve tabloda yazan fonksiyon.
 */
export function sutunGrafigi({ etiketler, seriler, bicim, yukseklik = 210, etiketAdimi = 1, aria = '' }) {
  const toplamlar = etiketler.map((_, i) => seriler.reduce((a, s) => a + (s.degerler[i] || 0), 0))
  const { ust, cizgiler } = guzelOlcek(Math.max(0, ...toplamlar))
  const yuzde = (v) => `${((v / ust) * 100).toFixed(3)}%`
  const sutunlar = etiketler
    .map((etiket, i) => {
      const satirlar = seriler.map((s) => [s.ad, bicim(s.degerler[i] || 0), s.renk])
      const dilimler = seriler
        .filter((s) => (s.degerler[i] || 0) > 0)
        .map((s) => `<i class="dilim renk-${s.renk}" style="flex-grow:${s.degerler[i]}"></i>`)
        .join('')
      const okunur = `${etiket}: ${satirlar.map((r) => `${r[0]} ${r[1]}`).join(', ')}`
      return `<div class="sutun-yuva" tabindex="0" aria-label="${esc(okunur)}" data-ipucu="${ipucu(etiket, satirlar)}">
        <div class="sutun" style="height:${yuzde(toplamlar[i])}">${dilimler}</div></div>`
    })
    .join('')
  // Etiketler en yeni aydan geriye doğru seçilir: son ay her zaman yazılır, komşular çakışmaz.
  const xEtiketleri = etiketler
    .map((e, i) => `<span>${(etiketler.length - 1 - i) % etiketAdimi === 0 ? esc(e) : ''}</span>`)
    .join('')
  return `<figure class="grafik" aria-label="${esc(aria)}">
    ${lejant(seriler)}
    <div class="sutun-alan" style="--yukseklik:${yukseklik}px">
      <div class="y-eksen" aria-hidden="true">${cizgiler.map((v) => `<span style="bottom:${yuzde(v)}">${eksenYaz(v)}</span>`).join('')}</div>
      <div class="cizim">
        ${cizgiler.map((v) => `<i class="izgara${v === 0 ? ' taban' : ''}" style="bottom:${yuzde(v)}"></i>`).join('')}
        <div class="sutunlar">${sutunlar}</div>
      </div>
      <div class="x-eksen" aria-hidden="true">${xEtiketleri}</div>
    </div>
    ${tabloGorunumu(
      ['Ay', ...seriler.map((s) => s.ad), 'Toplam'],
      etiketler.map((e, i) => [e, ...seriler.map((s) => bicim(s.degerler[i] || 0)), bicim(toplamlar[i])]),
    )}
  </figure>`
}

/**
 * Çizgi grafiği. seriler: [{ ad, renk, degerler, alan?: bool }]. Kalınlık 2px, uçta 8px nokta.
 * İmleç x'i bulur: her ay için bir dokunma şeridi, o aydaki tüm serileri gösterir.
 */
export function cizgiGrafigi({ etiketler, seriler, bicim, yukseklik = 200, etiketAdimi = 1, aria = '', tablo = true }) {
  const n = etiketler.length
  const enBuyuk = Math.max(0, ...seriler.flatMap((s) => s.degerler))
  const { ust, cizgiler } = guzelOlcek(enBuyuk)
  const x = (i) => (n === 1 ? 500 : (i / (n - 1)) * 1000)
  const y = (v) => 100 - (v / ust) * 100
  const yollar = seriler
    .map((s) => {
      const noktalar = s.degerler.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(3)}`).join(' L')
      const alan = s.alan
        ? `<path class="alan renk-${s.renk}" d="M${x(0)},100 L${noktalar} L${x(n - 1)},100 Z"></path>`
        : ''
      return `${alan}<path class="cizgi renk-${s.renk}" d="M${noktalar}" vector-effect="non-scaling-stroke"></path>`
    })
    .join('')
  const uclar = seriler
    .map((s) => {
      const v = s.degerler[n - 1] || 0
      return `<i class="uc-nokta renk-${s.renk}" style="left:${x(n - 1) / 10}%;bottom:${100 - y(v)}%"></i>`
    })
    .join('')
  const seritGenislik = n > 1 ? 100 / (n - 1) : 100
  const seritler = etiketler
    .map((etiket, i) => {
      const satirlar = seriler.map((s) => [s.ad, bicim(s.degerler[i] || 0), s.renk])
      const sol = n > 1 ? x(i) / 10 - seritGenislik / 2 : 0
      return `<div class="serit" tabindex="0" style="left:${sol}%;width:${seritGenislik}%" aria-label="${esc(
        `${etiket}: ${satirlar.map((r) => `${r[0]} ${r[1]}`).join(', ')}`,
      )}" data-ipucu="${ipucu(etiket, satirlar)}"></div>`
    })
    .join('')
  const xEtiketleri = etiketler
    .map((e, i) => {
      if ((n - 1 - i) % etiketAdimi !== 0) return ''
      const konum = x(i) / 10
      const kaydir = konum < 8 ? '0' : konum > 92 ? '-100%' : '-50%'
      return `<span style="left:${konum}%;transform:translateX(${kaydir})">${esc(e)}</span>`
    })
    .join('')
  return `<figure class="grafik" aria-label="${esc(aria)}">
    ${lejant(seriler, 'cizgi-anahtar')}
    <div class="cizgi-alan" style="--yukseklik:${yukseklik}px">
      <div class="y-eksen" aria-hidden="true">${cizgiler.map((v) => `<span style="bottom:${100 - y(v)}%">${eksenYaz(v)}</span>`).join('')}</div>
      <div class="cizim">
        ${cizgiler.map((v) => `<i class="izgara${v === 0 ? ' taban' : ''}" style="bottom:${100 - y(v)}%"></i>`).join('')}
        <svg viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">${yollar}</svg>
        ${uclar}${seritler}
      </div>
      <div class="x-eksen konumlu" aria-hidden="true">${xEtiketleri}</div>
    </div>
    ${
      tablo
        ? tabloGorunumu(
            ['Ay', ...seriler.map((s) => s.ad)],
            etiketler.map((e, i) => [e, ...seriler.map((s) => bicim(s.degerler[i] || 0))]),
          )
        : ''
    }
  </figure>`
}

/** Sıralı yatay çubuklar (en büyük üstte), tek renk; değer çubuğun ucunda. ogeler: [{ ad, deger }] */
export function yatayCubuklar(ogeler, { renk = 'akce', bicim, aria = '' } = {}) {
  const sirali = [...ogeler].sort((a, b) => b.deger - a.deger)
  const enBuyuk = Math.max(1, ...sirali.map((o) => o.deger))
  const satirlar = sirali
    .map(
      (o) => `<li data-ipucu="${ipucu(o.ad, [[o.ad, bicim(o.deger), renk]])}">
        <span class="yatay-ad">${esc(o.ad)}</span>
        <span class="yatay-iz"><i class="yatay-cubuk renk-${renk}" style="width:${((o.deger / enBuyuk) * 100).toFixed(2)}%"></i><span class="yatay-deger">${esc(bicim(o.deger))}</span></span>
      </li>`,
    )
    .join('')
  return `<figure class="grafik" aria-label="${esc(aria)}"><ul class="yatay">${satirlar}</ul>
    ${tabloGorunumu(
      ['Alan', 'Tutar'],
      sirali.map((o) => [o.ad, bicim(o.deger)]),
    )}</figure>`
}

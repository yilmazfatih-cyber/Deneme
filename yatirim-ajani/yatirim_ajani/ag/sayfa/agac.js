// Ağaç görünümü: tuval üstünde en küçük kapsayan ağaç; gez, yakınlaş, hisse seç, sektör vurgula.
function gorunumAgac(kok) {
  const A = V.agac;
  if (!A || !A.dugum || !A.dugum.length) { kok.append(p('Ağaç verisi bulunamadı.')); return; }
  const D = A.dugum;
  const N = D.length;
  const I = { h: 0, sek: 1, grup: 2, pd: 3, x: 4, y: 5, tx: 6, ty: 7, eb: 8, teb: 9, ky: 10, beta: 11, ad: 12 };
  const sira = new Map(D.map((d, i) => [d[0], i]));
  const O = A.ozet || {};
  const komsu = { ham: Array.from({ length: N }, () => []), tema: Array.from({ length: N }, () => []) };
  A.kenar.forEach(([a, b, c]) => { komsu.ham[a].push([b, c]); komsu.ham[b].push([a, c]); });
  A.tkenar.forEach(([a, b, c]) => { komsu.tema[a].push([b, c]); komsu.tema[b].push([a, c]); });
  const durum = { mod: 'ham', vurgu: 'katman', secili: sira.has(A.kok) ? sira.get(A.kok) : 0, uzeri: -1, k: 1, ox: 0, oy: 0 };
  // Üstte kalması gerekenler en son çizilir: önce küçük katmanlar, en son BIST 30
  const katmanSirasi = D.map((_, i) => i).sort((a, b) => D[b][I.grup] - D[a][I.grup] || D[a][I.pd] - D[b][I.pd]);
  const kokIdx = () => sira.get(durum.mod === 'ham' ? A.kok : A.tkok);
  const kenarlar = () => (durum.mod === 'ham' ? A.kenar : A.tkenar);
  const ebAlan = () => (durum.mod === 'ham' ? I.eb : I.teb);

  kok.append(giris('Hisseler birbirine nasıl tutunuyor?',
    `Her hisse, getirisi en çok benzeyen hisseye bağlanır; ${tam(N)} hisse ${tam(N - 1)} bağla tek bir ağaç olur. Ortalama iki hissenin günlük getiri korelasyonu **${sy(O.ort_kor_ham, 2)}**; ` +
    `endeksin etkisi çıkarılınca **${sy(O.ort_kor_piyasa_artik, 2)}**, küçük hisselerin ortak dalgası da çıkarılınca **${sy(O.ort_kor_artik, 2)}** kalır. ` +
    'Yani BIST iki ortak dalgayla hareket eder: endeks ve küçük hisseler. Geriye kalan bağların en güçlüleri aynı gruba ait şirketlerdir.'));

  // --- Tuval ---
  const cv = h('canvas', { role: 'img', 'aria-label': 'BIST ağacı. Düğümler hisse, çizgiler en güçlü bağ. Ayrıntılar aşağıdaki tabloda.' });
  const ctx = cv.getContext('2d');
  let W = 0, Hh = 0, dpr = 1, R = null, sinir = null;
  const renkOku = () => {
    R = { surface: css('--surface'), ink: css('--ink'), ink2: css('--ink-2'), muted: css('--muted'), axis: css('--axis'), dim: css('--dim'), accent: css('--accent'),
      s2: css('--s2'), o: [css('--o1'), css('--o2'), css('--o3'), css('--o4'), css('--o5')] };
  };
  const sinirBul = () => {
    const xi = durum.mod === 'ham' ? I.x : I.tx;
    let a = 1e9, b = -1e9, c = 1e9, d = -1e9;
    for (const n of D) { a = Math.min(a, n[xi]); b = Math.max(b, n[xi]); c = Math.min(c, n[xi + 1]); d = Math.max(d, n[xi + 1]); }
    sinir = { cx: (a + b) / 2, cy: (c + d) / 2, gx: b - a || 1, gy: d - c || 1 };
  };
  const olcek = () => Math.min((W - 64) / sinir.gx, (Hh - 64) / sinir.gy) * durum.k;
  const ekran = i => {
    const n = D[i], xi = durum.mod === 'ham' ? I.x : I.tx, s = olcek();
    return [W / 2 + durum.ox + (n[xi] - sinir.cx) * s, Hh / 2 + durum.oy + (n[xi + 1] - sinir.cy) * s];
  };
  const yaricap = i => (2.1 + 0.95 * Math.log10(1 + D[i][I.pd])) * Math.min(1.9, Math.pow(durum.k, 0.35));
  const dugumRenk = i => (durum.vurgu === 'katman' ? R.o[D[i][I.grup]] : D[i][I.sek] === durum.vurgu ? R.accent : R.dim);
  const derece = i => komsu[durum.mod][i].length;
  function kokeYol(i) {
    const eb = ebAlan(), out = [i];
    let g = 0;
    while (D[i][eb] >= 0 && g++ < 400) { i = D[i][eb]; out.push(i); }
    return out;
  }

  function boya() {
    if (!W) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, Hh);
    const P = new Array(N);
    for (let i = 0; i < N; i++) P[i] = ekran(i);
    const yol = kokeYol(durum.secili);
    const yolKume = new Set(yol);
    const komsuKume = new Set(komsu[durum.mod][durum.secili].map(x => x[0]));
    // Kenarlar
    ctx.lineCap = 'round';
    ctx.strokeStyle = R.axis;
    for (const [a, b, c] of kenarlar()) {
      ctx.globalAlpha = 0.45 + 0.5 * Math.min(1, c);
      ctx.lineWidth = Math.min(3.2, (0.5 + 1.6 * c) * Math.sqrt(durum.k));
      ctx.beginPath(); ctx.moveTo(P[a][0], P[a][1]); ctx.lineTo(P[b][0], P[b][1]); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // Seçili hisseden köke giden yol ve doğrudan bağları
    ctx.strokeStyle = R.accent;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let j = 0; j + 1 < yol.length; j++) { ctx.moveTo(P[yol[j]][0], P[yol[j]][1]); ctx.lineTo(P[yol[j + 1]][0], P[yol[j + 1]][1]); }
    for (const b of komsuKume) { ctx.moveTo(P[durum.secili][0], P[durum.secili][1]); ctx.lineTo(P[b][0], P[b][1]); }
    ctx.stroke();
    // Düğümler: önce soluklar, sonra vurgulular
    const nokta = i => {
      const r = yaricap(i);
      ctx.beginPath(); ctx.arc(P[i][0], P[i][1], r + 1.2, 0, 6.2832); ctx.fillStyle = R.surface; ctx.fill();
      ctx.beginPath(); ctx.arc(P[i][0], P[i][1], r, 0, 6.2832); ctx.fillStyle = dugumRenk(i); ctx.fill();
    };
    if (durum.vurgu === 'katman') {
      for (const i of katmanSirasi) nokta(i);
    } else {
      for (let i = 0; i < N; i++) if (D[i][I.sek] !== durum.vurgu) nokta(i);
      for (let i = 0; i < N; i++) if (D[i][I.sek] === durum.vurgu) nokta(i);
    }
    // Kök ve seçili halka
    const halka = (i, renk, pay) => { ctx.beginPath(); ctx.arc(P[i][0], P[i][1], yaricap(i) + pay, 0, 6.2832); ctx.strokeStyle = renk; ctx.lineWidth = 2; ctx.stroke(); };
    halka(kokIdx(), R.ink, 3.5);
    halka(durum.secili, R.accent, 3.5);
    if (durum.uzeri >= 0 && durum.uzeri !== durum.secili) halka(durum.uzeri, R.ink2, 3);
    // Etiketler: öncelik sırasıyla, çakışmayanlar
    const aday = [];
    const ekleAday = (i, on) => aday.push([on, i]);
    ekleAday(durum.secili, 1e6);
    if (durum.uzeri >= 0) ekleAday(durum.uzeri, 9e5);
    ekleAday(kokIdx(), 8e5);
    komsuKume.forEach(i => ekleAday(i, 7e5));
    yol.forEach(i => ekleAday(i, 6e5));
    const hepsi = durum.k >= 2.4;
    for (let i = 0; i < N; i++) {
      if (P[i][0] < -20 || P[i][0] > W + 20 || P[i][1] < -20 || P[i][1] > Hh + 20) continue;
      if (hepsi || derece(i) >= 5 || D[i][I.pd] >= 150) ekleAday(i, derece(i) * 100 + D[i][I.pd]);
    }
    aday.sort((a, b) => b[0] - a[0]);
    ctx.font = '500 11px "IBM Plex Mono", ui-monospace, Menlo, monospace';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    const dolu = [];
    const gorulen = new Set();
    for (const [, i] of aday) {
      if (gorulen.has(i)) continue;
      gorulen.add(i);
      const ad = D[i][0];
      const tw = ctx.measureText(ad).width;
      const r = yaricap(i);
      const sagda = P[i][0] + r + 5 + tw < W - 2;
      const x = sagda ? P[i][0] + r + 5 : P[i][0] - r - 5 - tw;
      const y = P[i][1];
      const kutu = [x - 2, y - 7, x + tw + 2, y + 7];
      if (dolu.some(d => kutu[0] < d[2] && kutu[2] > d[0] && kutu[1] < d[3] && kutu[3] > d[1])) continue;
      dolu.push(kutu);
      ctx.strokeStyle = R.surface; ctx.lineWidth = 3.5; ctx.strokeText(ad, x, y);
      ctx.fillStyle = i === durum.secili || yolKume.has(i) ? R.ink : R.ink2; ctx.fillText(ad, x, y);
    }
  }
  function boyutla() {
    const r = cv.getBoundingClientRect();
    if (r.width < 40) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = r.width; Hh = r.height;
    cv.width = Math.round(W * dpr); cv.height = Math.round(Hh * dpr);
    boya();
  }
  function yakinlas(f, px, py) {
    if (px == null) { px = W / 2; py = Hh / 2; }
    const k2 = Math.max(1, Math.min(16, durum.k * f));
    const g = k2 / durum.k;
    durum.ox = px - W / 2 - (px - W / 2 - durum.ox) * g;
    durum.oy = py - Hh / 2 - (py - Hh / 2 - durum.oy) * g;
    durum.k = k2;
    if (k2 === 1) { durum.ox = 0; durum.oy = 0; }
    cv.style.touchAction = k2 > 1 ? 'none' : 'pan-y';
    boya();
  }
  function ortala(i) {
    durum.k = Math.max(durum.k, 4);
    const n = D[i], xi = durum.mod === 'ham' ? I.x : I.tx, s = olcek();
    durum.ox = -(n[xi] - sinir.cx) * s;
    durum.oy = -(n[xi + 1] - sinir.cy) * s;
    cv.style.touchAction = 'none';
  }
  function enYakin(mx, my, esik) {
    let en = -1, d2 = esik * esik;
    for (let i = 0; i < N; i++) {
      const [x, y] = ekran(i);
      const d = (x - mx) * (x - mx) + (y - my) * (y - my);
      if (d < d2) { d2 = d; en = i; }
    }
    return en;
  }
  const dugumIpucu = i => {
    const n = D[i];
    return [tipBaslik(n[0], adDuzelt(n[I.ad]) || null), tipSatir('Sektör', sekAd(A.sektor[n[I.sek]])), tipSatir('Pazar katmanı', grupAd(AD.grup_sira[n[I.grup]])),
      tipSatir('Piyasa değeri', sy(n[I.pd], n[I.pd] < 10 ? 1 : 0) + ' mlr TL'), tipSatir('Bağ sayısı', String(derece(i)))];
  };

  // İşaretçi: sürükle = gez, dokun/tıkla = seç, iki parmak = yakınlaş
  const parmak = new Map();
  let bas = null, kistir = 0;
  cv.addEventListener('pointerdown', e => {
    const r = cv.getBoundingClientRect();
    parmak.set(e.pointerId, [e.clientX - r.left, e.clientY - r.top]);
    bas = { x: e.clientX, y: e.clientY, ox: durum.ox, oy: durum.oy, hareket: false, tur: e.pointerType };
    if (e.pointerType === 'mouse' || durum.k > 1) { try { cv.setPointerCapture(e.pointerId); } catch (_) { /* yok say */ } }
    if (parmak.size === 2) { const [a, b] = [...parmak.values()]; kistir = Math.hypot(a[0] - b[0], a[1] - b[1]); }
  });
  cv.addEventListener('pointermove', e => {
    const r = cv.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    if (parmak.has(e.pointerId)) parmak.set(e.pointerId, [mx, my]);
    if (parmak.size === 2 && kistir > 0) {
      const [a, b] = [...parmak.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (d > 0) { yakinlas(d / kistir, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); kistir = d; }
      return;
    }
    if (bas && parmak.size === 1 && (bas.tur === 'mouse' || durum.k > 1)) {
      const dx = e.clientX - bas.x, dy = e.clientY - bas.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) bas.hareket = true;
      if (bas.hareket) { durum.ox = bas.ox + dx; durum.oy = bas.oy + dy; cv.classList.add('surukle'); tipGizle(); boya(); return; }
    }
    const i = enYakin(mx, my, e.pointerType === 'mouse' ? 16 : 24);
    if (i !== durum.uzeri) { durum.uzeri = i; boya(); }
    if (i >= 0) tipGoster(e, dugumIpucu(i)); else tipGizle();
  });
  const birak = e => {
    const r = cv.getBoundingClientRect();
    if (bas && !bas.hareket && parmak.size <= 1 && e.type === 'pointerup') {
      const i = enYakin(e.clientX - r.left, e.clientY - r.top, e.pointerType === 'mouse' ? 16 : 26);
      if (i >= 0) sec(i, false);
    }
    parmak.delete(e.pointerId);
    if (parmak.size < 2) kistir = 0;
    if (!parmak.size) bas = null;
    cv.classList.remove('surukle');
  };
  cv.addEventListener('pointerup', birak);
  cv.addEventListener('pointercancel', birak);
  cv.addEventListener('pointerleave', () => { if (durum.uzeri !== -1) { durum.uzeri = -1; boya(); } tipGizle(); });
  cv.addEventListener('wheel', e => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const r = cv.getBoundingClientRect();
    yakinlas(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });

  // --- Denetimler ---
  const gostergeKap = h('div');
  function gostergeYaz() {
    gostergeKap.replaceChildren(durum.vurgu === 'katman'
      ? gosterge(AD.grup_sira.map((g, i) => ({ ad: grupAd(g), renk: ORDINAL[i], tur: 'nokta' })).concat([{ ad: 'Halka: kök (siyah), seçili (mavi)', renk: 'transparent' }]))
      : gosterge([{ ad: sekAd(A.sektor[durum.vurgu]), renk: 'var(--accent)', tur: 'nokta' }, { ad: 'Diğer hisseler', renk: 'var(--dim)', tur: 'nokta' }]));
  }
  const vurguSec = h('select', { id: 'agac-vurgu', 'aria-label': 'Renklendirme', onchange: e => {
    durum.vurgu = e.target.value === 'katman' ? 'katman' : Number(e.target.value);
    gostergeYaz(); boya();
  } }, h('option', { value: 'katman', text: 'Pazar katmanına göre' }),
    h('optgroup', { label: 'Bir sektörü vurgula' }, A.sektor.map((s, i) => [sekAd(s), i]).sort((a, b) => a[0].localeCompare(b[0], 'tr')).map(([ad, i]) => h('option', { value: i, text: ad }))));
  const araGirdi = h('input', { type: 'search', id: 'agac-ara', placeholder: 'THYAO', list: 'agac-liste', 'aria-label': 'Hisse ara', autocomplete: 'off', spellcheck: 'false' });
  const ara = () => {
    const i = sira.get(araGirdi.value.trim().toLocaleUpperCase('tr-TR').replace(/İ/g, 'I'));
    if (i != null) sec(i, true);
  };
  araGirdi.addEventListener('change', ara);
  araGirdi.addEventListener('keydown', e => { if (e.key === 'Enter') ara(); });
  const modSec = seg([{ k: 'ham', ad: 'Endeks ayıklanmış' }, { k: 'tema', ad: 'Endeks + küçük hisse dalgası ayıklanmış' }], 'ham', k => {
    durum.mod = k; durum.k = 1; durum.ox = 0; durum.oy = 0; cv.style.touchAction = 'pan-y';
    sinirBul(); modNot(); secimYaz(); boya();
  }, 'Ağaç türü');
  const modNotEl = h('p', { class: 'okuma' });
  function modNot() {
    modNotEl.replaceChildren(...metin(durum.mod === 'ham'
      ? `Yalnız endeksin etkisi çıkarıldı. Kök **${A.kok}**: küçük hisselerin ortak dalgasını en iyi taşıyan hisse, bu yüzden onlarca hisse doğrudan ona bağlanıyor. BIST 30 hisseleri (en koyu) tek bir dalda toplanır; bağların ${yzp(O.kenar_ayni_sektor_orani)}'i aynı sektörden iki hisse arasındadır (rastgele olsa ${yzp(O.rastgele_ayni_sektor_orani)}).`
      : `Endeks ve küçük hisse dalgası birlikte çıkarıldı; kalan bağlar şirkete ve gruba özgü. Kök **${A.tkok}**. Ağaç uzun zincirlere dönüşür: tek bir merkez kalmaz. Bağların ${yzp(A.tema_ayni)}'i aynı sektörden iki hisse arasındadır.`));
  }

  // --- Seçili hisse paneli ---
  const panel = h('div', { class: 'secili' });
  function secimYaz() {
    const i = durum.secili, n = D[i];
    const ks = komsu[durum.mod][i].slice().sort((a, b) => b[1] - a[1]);
    const enb = Math.max(...ks.map(x => x[1]), 0.01);
    const yol = kokeYol(i);
    panel.replaceChildren(...[
      h('div', { class: 'ust' }, h('span', { class: 'kod', text: n[0] }), i === kokIdx() ? hap('uygula', 'Kök') : null, h('span', { class: 'ad', text: adDuzelt(n[I.ad]) })),
      h('dl', { class: 'kunye' },
        h('dt', { text: 'Sektör' }), h('dd', { text: sekAd(A.sektor[n[I.sek]]) }),
        h('dt', { text: 'Pazar katmanı' }), h('dd', { text: grupAd(AD.grup_sira[n[I.grup]]) }),
        h('dt', { text: 'Piyasa değeri' }), h('dd', { class: 'num', text: sy(n[I.pd], n[I.pd] < 10 ? 1 : 0) + ' mlr TL' }),
        h('dt', { text: 'Endekse duyarlılık' }), h('dd', { class: 'num', text: sy(n[I.beta], 2) + ' (beta)' }),
        h('dt', { text: 'Küçük hisse dalgası' }), h('dd', { class: 'num', text: sy(n[I.ky], 2) + ' (yük)' })),
      h('div', { class: 'kbaslik', text: `Bağlı olduğu ${ks.length} hisse` }),
      h('ul', { class: 'komsu' }, ks.slice(0, 14).map(([j, c]) => h('li', null,
        h('button', { type: 'button', text: D[j][0], title: D[j][I.ad] || D[j][0], onclick: () => sec(j, true) }),
        h('div', { class: 'metre', title: 'Artık getiri korelasyonu' }, h('i', { style: `width:${Math.round((c / enb) * 100)}%` })),
        h('span', { class: 'num', text: sy(c, 2) })))),
      ks.length > 14 ? h('p', { class: 'alt', text: `ve ${ks.length - 14} hisse daha (tabloda).` }) : null,
      h('div', { class: 'kbaslik', text: yol.length > 1 ? `Köke ${yol.length - 1} adım` : 'Ağacın kökü' }),
      h('div', { class: 'yol' }, yol.map((j, s) => [s ? '›' : null, h('button', { type: 'button', text: D[j][0], onclick: () => sec(j, true) })]))].filter(Boolean));
  }
  function sec(i, ortalaMi) {
    durum.secili = i;
    if (ortalaMi) ortala(i);
    araGirdi.value = D[i][0];
    secimYaz(); boya();
  }

  const yakinDugme = h('div', { class: 'yakin' },
    h('button', { class: 'dugme', type: 'button', 'aria-label': 'Yakınlaş', text: '+', onclick: () => yakinlas(1.6) }),
    h('button', { class: 'dugme', type: 'button', 'aria-label': 'Uzaklaş', text: '−', onclick: () => yakinlas(1 / 1.6) }),
    h('button', { class: 'dugme', type: 'button', 'aria-label': 'Tümünü göster', text: 'Tümü', onclick: () => yakinlas(0) }));
  const tabloSatir = () => D.map((n, i) => [h('span', { class: 'mono', text: n[0] }), adDuzelt(n[I.ad]), sekAd(A.sektor[n[I.sek]]), GRUP_KISA[AD.grup_sira[n[I.grup]]],
    sy(n[I.pd], 1), String(derece(i)), n[ebAlan()] >= 0 ? D[n[ebAlan()]][0] : 'kök']);

  kok.append(h('div', { class: 'grid' },
    h('figure', { class: 'fig y8' },
      h('header', null, h('h3', { text: 'En güçlü bağlardan kurulan ağaç' }),
        h('p', { class: 'alt', text: 'Düğüm büyüklüğü piyasa değeri, çizgi kalınlığı bağın gücü. Bir hisseye dokunun: köke giden yol ve doğrudan bağları belirir.' })),
      h('div', { class: 'ctl' }, modSec),
      h('div', { class: 'ctl' }, h('label', null, 'Renk', vurguSec), h('label', null, 'Hisse', araGirdi),
        h('datalist', { id: 'agac-liste' }, D.map(n => h('option', { value: n[0] })))),
      h('div', { class: 'agac-kap' }, cv, yakinDugme),
      gostergeKap, modNotEl,
      h('p', { class: 'alt', text: 'Gezmek için sürükleyin; yakınlaşmak için düğmeleri, iki parmağı ya da Ctrl + tekerleği kullanın. Yakınlaştıkça tüm hisse kodları görünür.' }),
      tabloAc([{ ad: 'Hisse' }, { ad: 'Şirket' }, { ad: 'Sektör' }, { ad: 'Katman' }, { ad: 'PD (mlr TL)', n: 1 }, { ad: 'Bağ', n: 1 }, { ad: 'Bağlandığı' }], tabloSatir, 'Ağacı tablo olarak göster')),
    h('figure', { class: 'fig y4' }, h('header', null, h('h3', { text: 'Seçili hisse' })), panel)));

  // --- Altındaki şekiller ---
  const katmanEl = cizimKutusu(), butEl = cizimKutusu(), kayanEl = cizimKutusu();
  const yillar = Object.keys(A.yil || {}).sort();
  kok.append(h('div', { class: 'grid' },
    sekil({ baslik: 'Ortak dalgalar çıkarıldıkça bağ zayıflar', cls: 'y5', alt: 'İki hissenin günlük getirileri arasındaki ortalama korelasyon.' }, katmanEl,
      p(`Aynı sektörden iki hisse arasında kalan korelasyon **${sy(O.ort_kor_ayni_sektor_artik, 3)}**, farklı sektörlerde **${sy(O.ort_kor_farkli_sektor_artik, 3)}**: sektör etiketi tek başına çok az şey söyler.`, 'okuma')),
    sekil({ baslik: 'Hangi sektörler gerçekten birlikte hareket ediyor?', cls: 'y7', alt: 'İki ortak dalga çıkarıldıktan sonra sektör içindeki ortalama korelasyon. Sıfıra yakın sektörlerde hisseler birbirinden bağımsız.' }, butEl,
      tabloAc([{ ad: 'Sektör' }, { ad: 'Hisse', n: 1 }, { ad: 'Kalan korelasyon', n: 1 }, { ad: 'Ham korelasyon', n: 1 }], A.butunluk.map(b => [sekAd(b[0]), String(b[1]), sy(b[2], 3), sy(b[3], 2)]))),
    sekil({ baslik: 'En güçlü 40 bağ', cls: 'y7', alt: 'Endeks ve küçük hisse dalgası çıkarıldıktan sonra. Çoğu aynı sermaye grubunun şirketleri: biri hareket edince diğeri aynı gün izler.' },
      tablo([{ ad: 'Çift' }, { ad: 'Şirketler' }, { ad: 'Korelasyon', n: 1 }, { ad: 'Aynı sektör' }],
        A.baglar.map(b => [h('span', { class: 'mono', text: `${b[0]} – ${b[1]}` }), `${kisalt(adDuzelt(b[3]), 36)} · ${kisalt(adDuzelt(b[4]), 36)}`, sy(b[2], 2), b[5] ? 'evet' : 'hayır']), { sinirli: true, genis: true })),
    sekil({ baslik: 'Ağaç her yıl yeniden kurulur', cls: 'y5', alt: 'Bir yılın bağlarından ertesi yıl da duranların payı ve ağacın merkezindeki hisseler.' },
      tablo([{ ad: 'Yıl' }, { ad: 'Kök' }, { ad: 'Merkezdekiler' }, { ad: 'Ort. kor.', n: 1 }, { ad: 'Aynı sektör bağı', n: 1 }],
        yillar.map(y => [y, h('span', { class: 'mono', text: A.yil[y].kok }), h('span', { class: 'mono', text: (A.yil[y].merkez || []).slice(1, 5).join(' ') }), sy(A.yil[y].ham, 2), yzp(A.yil[y].ayni)]), { genis: true }),
      p((A.kalicilik || []).map(k => `${k.donem}: bağların **${yzp(k.kalan_kenar_orani)}**'i durdu`).join(' · ') + '. Geçen yılın ağacına bakıp bu yılın çiftini seçmek işe yaramaz; kalıcı olan sermaye grubu bağlarıdır.', 'okuma'),
      h('div', { class: 'kbaslik', text: '60 günlük ortalama korelasyon' }), kayanEl)));
  cubukYatay(katmanEl, { baslik: 'Korelasyon katmanları', seri: [{ ad: 'Ortalama korelasyon', renk: 'var(--s1)' }], bicim: v => sy(v, 2), etiketGen: 210,
    satir: [{ ad: 'Ham getiri', v: [O.ort_kor_ham] }, { ad: 'Endeks çıkarılınca', v: [O.ort_kor_piyasa_artik] }, { ad: 'Küçük hisse dalgası da çıkarılınca', v: [Math.max(0, O.ort_kor_artik)] }] });
  cubukYatay(butEl, { baslik: 'Sektör bütünlüğü', seri: [{ ad: 'Sektör içi kalan korelasyon', renk: 'var(--s1)' }], bicim: v => sy(v, 2), etiketGen: 190,
    satir: A.butunluk.map(b => ({ ad: sekAd(b[0]), alt: `${b[1]} hisse`, v: [b[2]] })) });
  cizgi(kayanEl, { baslik: '60 günlük ortalama korelasyon', x: A.kayan.map(k => k[0].slice(0, 7)), seri: [{ ad: 'Ortalama korelasyon', renk: 'var(--s1)', v: A.kayan.map(k => k[1]) }],
    bicim: v => sy(v, 2), yukseklik: 170, sifirdan: true });

  renkOku(); sinirBul(); gostergeYaz(); modNot(); secimYaz();
  araGirdi.value = D[durum.secili][0];
  new ResizeObserver(boyutla).observe(cv);
  temaDinleyici.push(() => { renkOku(); boya(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(boya);
  boyutla();
}

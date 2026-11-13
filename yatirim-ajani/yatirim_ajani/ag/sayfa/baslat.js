// Başlatma: künye, sekmeler, adres çubuğundaki bölüm adı, bölümlerin ilk gösterimde kurulması.
(function () {
  const G = { agac: gorunumAgac, yayilim: gorunumYayilim, zaman: gorunumZaman, yatirimci: gorunumYatirimci, fonlar: gorunumFonlar, bildirim: gorunumBildirim, kurallar: gorunumKurallar };
  const kuruldu = new Set();
  document.documentElement.lang = 'tr';
  const veri = V.veri || {};
  const tarih = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? `${Number(m[3])} ${AD.ay[Number(m[2]) - 1]} ${m[1]}` : ''; };
  const donem = veri.donem || [];
  document.getElementById('kunye-ust').textContent = `Borsa İstanbul · ${tam(veri.hisse)} hisse · ${tarih(donem[0])} – ${tarih(donem[1])}`;
  document.getElementById('alt-veri').textContent =
    `Veri: İş Yatırım (düzeltilmiş kapanış, hacim, piyasa değeri, mali tablolar), Yahoo (açılış, saatlik çubuklar, küresel seriler), TradingView (şirket bilgisi), KAP. ${tam(veri.gun)} işlem günü. Üretim: ${tarih(V.uretim)}.`;
  const dugmeler = [...document.querySelectorAll('.tabs button')];
  const kap = document.querySelector('.tabs-kap');

  function goster(g, kaydir) {
    if (!G[g]) g = 'agac';
    dugmeler.forEach(b => { const s = b.dataset.g === g; b.setAttribute('aria-selected', String(s)); b.tabIndex = s ? 0 : -1; });
    document.querySelectorAll('main .view').forEach(v => { v.hidden = v.id !== 'v-' + g; });
    const panel = document.getElementById('v-' + g);
    if (!kuruldu.has(g)) {
      kuruldu.add(g);
      try { G[g](panel); } catch (e) { panel.append(p('Bu bölüm çizilemedi: ' + e.message)); console.error(e); }
    }
    tipGizle();
    if (kaydir) {
      const y = kap.getBoundingClientRect().top + window.scrollY;
      if (window.scrollY > y) window.scrollTo({ top: y });
      const secili = dugmeler.find(b => b.dataset.g === g);
      if (secili && secili.scrollIntoView) secili.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }
  const git = g => { if (location.hash !== '#' + g) location.hash = g; else goster(g, true); };
  dugmeler.forEach((b, i) => {
    b.addEventListener('click', () => git(b.dataset.g));
    b.addEventListener('keydown', e => {
      const yon = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!yon) return;
      e.preventDefault();
      const hedef = dugmeler[(i + yon + dugmeler.length) % dugmeler.length];
      hedef.focus();
      git(hedef.dataset.g);
    });
  });
  addEventListener('hashchange', () => goster(location.hash.slice(1), true));
  goster(location.hash.slice(1) || 'agac', false);
})();

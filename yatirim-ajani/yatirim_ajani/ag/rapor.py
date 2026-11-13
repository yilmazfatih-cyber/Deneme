"""Ağ analizinin Türkçe raporu (Markdown). Girdi: `calistir.calistir` sonuç sözlüğü + araştırma ajanı JSON'ları."""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

GRUP_AD = {"bist30": "BIST 30", "bist100_30": "BIST 100 (30 dışı)", "yildiz_diger": "Yıldız Pazar (100 dışı)", "ana_pazar": "Ana Pazar", "alt_pazar": "Alt Pazar",
           "bist100": "BIST 100", "bist100_disi": "BIST 100 dışı"}  # fmt: skip
OZELLIK_AD = {
    "getiri_1g": "Bugünkü getiri", "getiri_5g": "Son 5 gün getirisi", "getiri_20g": "Son 20 gün getirisi", "momentum_120_20": "6 aylık momentum (son ay hariç)",
    "oynaklik_20g": "Oynaklık (20 gün)", "max_20g": "Son 20 günün en yüksek günlük getirisi", "buyukluk": "Piyasa değeri", "halka_acik_deger": "Halka açık piyasa değeri",
    "halka_aciklik": "Halka açıklık oranı", "devir_hizi_20g": "Devir hızı (hacim / halka açık değer)", "hacim_soku": "Hacim patlaması (bugün / 60 gün ort.)",
    "gece_20g": "Son 20 günün gece getirisi ort.", "gunici_20g": "Son 20 günün gün içi getirisi ort.", "zirveye_yakinlik": "52 hafta zirvesine yakınlık",
    "dolar_getiri_120g": "Dolar bazlı 6 aylık getiri", "defter_piyasa": "Defter değeri / piyasa değeri", "kazanc_verimi": "Kazanç verimi (kâr / piyasa değeri)",
    "satis_piyasa": "Satış / piyasa değeri", "roe": "Özkaynak kârlılığı",
}  # fmt: skip
SERI_AD = {"ES=F": "S&P 500 vadeli", "NQ=F": "Nasdaq vadeli", "GC=F": "Altın", "SI=F": "Gümüş", "HG=F": "Bakır", "PL=F": "Platin", "BZ=F": "Brent petrol", "NG=F": "Doğal gaz",
           "USDTRY=X": "Dolar/TL", "EURUSD=X": "Euro/dolar", "TUR": "ABD'deki Türkiye fonu (TUR)"}  # fmt: skip
AYLAR = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"]
SEKTOR_AD = {
    "banka": "bankalar", "sigorta": "sigorta", "leasing_faktoring": "leasing ve faktoring", "araci_kurum": "aracı kurumlar", "yatirim_ortakligi": "yatırım ortaklıkları",
    "gyo": "GYO", "spor": "spor", "telekom": "telekom", "madencilik": "madencilik", "ulastirma": "ulaştırma", "turizm": "turizm", "insaat": "inşaat", "elektrik": "elektrik",
    "ticaret": "ticaret", "bilisim": "bilişim", "kimya_petrol": "kimya ve petrol", "gida": "gıda", "metal_esya_makine": "metal eşya ve makine", "ana_metal": "ana metal",
    "tas_toprak": "çimento ve taş-toprak", "tekstil": "tekstil", "kagit_orman": "kâğıt ve orman", "holding": "holdingler", "teknoloji": "teknoloji ve savunma",
    "sanayi_diger": "diğer sanayi", "hizmet_diger": "diğer hizmetler", "mali_diger": "diğer mali", "diger": "diğer",
}  # fmt: skip
MEVSIM_AD = {"kis": "kış", "ilkbahar": "ilkbahar", "yaz": "yaz", "sonbahar": "sonbahar"}


def sek(x) -> str:
    return SEKTOR_AD.get(str(x), str(x))


def bn(n) -> str:
    """Tam sayı, binlik noktalı."""
    try:
        return f"{int(n):,}".replace(",", ".")
    except (TypeError, ValueError):
        return "-"


def baslik_tr(x: str) -> str:
    """Türkçe'ye uygun baş harf büyütme (İ/ı sorunu olmadan)."""
    kucuk = str(x).replace("İ", "i").replace("I", "ı").lower()

    def buyut(k: str) -> str:
        return k.replace("i", "İ").replace("ı", "I").upper()

    return " ".join(buyut(k) if ("." in k and len(k) <= 7) else (buyut(k[:1]) + k[1:]) if k else k for k in kucuk.split(" "))


def y(x, n: int = 1) -> str:
    if x is None or x != x:
        return "-"
    govde = f"{abs(x) * 100:.{n}f}"
    isaret = "" if float(govde) == 0 else ("+" if x >= 0 else "−")
    return f"{isaret}%{govde}".replace(".", ",")


def s(x, n: int = 2) -> str:
    if x is None or x != x:
        return "-"
    m = f"{x:.{n}f}"
    if float(m) == 0:
        m = m.lstrip("-")
    return m.replace(".", ",").replace("-", "−")


def tt(d: dict | None, anahtar: str = "t") -> str:
    v = (d or {}).get(anahtar)
    return "-" if v is None else s(v, 1)


def _al(d, *yol, varsayilan=None):
    for k in yol:
        if not isinstance(d, dict) or k not in d:
            return varsayilan
        d = d[k]
    return d


KONU_AD = {"geri_alim_ilk": "Pay geri alımı (ilk bildirim)", "bedelsiz_ilk": "Bedelsiz sermaye artırımı (ilk bildirim)", "bedelsiz_onay": "Bedelsiz: SPK onayı",
           "bedelli_ilk": "Bedelli sermaye artırımı (ilk bildirim)", "tahsisli_ilk": "Tahsisli sermaye artırımı (ilk bildirim)", "kar_payi_yk": "Kâr payı: yönetim kurulu kararı",
           "birlesme_ilk": "Birleşme (ilk bildirim)", "pay_kap_ilk": "Ortaklık payı eşik bildirimi (ilk)", "pay_portfoy": "Portföy şirketi pay bildirimi",
           "pay_sirket_ilk": "Şirketin başka şirkette pay alımı (ilk)"}  # fmt: skip
KURAL_AD = {"geri_alim_acilis_5g": "İlk geri alım: ertesi açılışta al, 5 gün tut", "geri_alim_kapanis_5g": "İlk geri alım: kapanışta al, 5 gün tut",
            "geri_alim_kapanis_20g": "İlk geri alım: 20 gün tut", "geri_alim_kapanis_60g": "İlk geri alım: 60 gün tut", "kar_payi_20g": "Kâr payı kararı: 20 gün tut",
            "portfoy_alim_20g": "Portföy şirketi alım bildirimi: 20 gün tut", "portfoy_20g": "Portföy şirketi bildirimi: 20 gün tut", "portfoy_satim_20g": "Portföy şirketi satım bildirimi: 20 gün tut",
            "sirket_alimi_20g": "Şirketin pay alımı: 20 gün tut", "kap_esik_alim_20g": "Eşik bildirimi, pay artışı: 20 gün tut", "kap_esik_20g": "Ortaklık payı eşik bildirimi: 20 gün tut",
            "kap_esik_satim_20g": "Eşik bildirimi, pay azalışı: 20 gün tut", "bedelli_20g": "Bedelli kararı: 20 gün tut", "bedelsiz_60g": "Bedelsiz kararı: 60 gün tut",
            "bedelsiz_20g": "Bedelsiz kararı: 20 gün tut", "kalan_pay_20g": "Bedelliden kalan pay satışı: 20 gün tut", "kalan_pay_5g": "Bedelliden kalan pay satışı: 5 gün tut"}  # fmt: skip
YON_AD = {"alim": "alım", "satim": "satım"}
ALICI_AD = {"gercek_kisi": "gerçek kişiler", "fon": "yatırım fonları", "yerli_tuzel": "yerli şirketler", "yabanci_kurum": "yabancı kurumlar"}


def bp(x, n: int = 1) -> str:
    """Baz puan (kesirden), işaretli."""
    if x is None:
        return "-"
    return s(x * 1e4, n) if x < 0 else "+" + s(x * 1e4, n)


def _kap_bolumu(S: dict) -> list[str]:
    """KAP bildirimleri, portföy şirketleri, yabancı payı, sektör endeksleri ve madenlerin gece-seans ayrımı."""
    O, F, R = S.get("kap_olay") or {}, S.get("kap_fon") or {}, S.get("kap_kural") or {}
    AZ, ES = S.get("kap_arz") or {}, S.get("kap_esik") or {}
    YK, YG, SM, MS = S.get("yabanci_kesit") or {}, S.get("yabanci_gecmis") or {}, S.get("sektor_mevsim") or {}, S.get("maden_saat") or {}
    if not (O or YK or SM or MS):
        return []
    L: list[str] = ["## 7. KAP bildirimleri, fonların gerçek kayıtları, yabancı payı ve sektör takvimi", ""]
    if O.get("konu"):
        an = O.get("an_sayim", {})
        toplam = sum(an.values()) or 1
        L += [f"KAP'ın bildirim sorgusundan {O['donem'][0]} – {O['donem'][1]} arasında seçili konularda {bn(O['bildirim'])} bildirim alındı (Tera grubu hariç). Her bildirim yayım saatine göre fiyatın ilk tepki "
              f"verebildiği işlem gününe bağlandı: seans kapandıktan sonra gelenlerin payı %{an.get('sonrasi', 0) / toplam * 100:.0f}, açılıştan önce gelenlerin payı %{an.get('oncesi', 0) / toplam * 100:.0f}. "
              "Getiriler hissenin kendi pazar katmanına göre fazla getiridir.", "",
              "### Bildirim türüne göre fiyat tepkisi (olay ortalamaları)", "",
              "| Bildirim | Olay | Önceki 20 gün | Açılış boşluğu | İlk gün, gün içi | Sonraki 5 gün | Sonraki 20 gün |", "| --- | ---: | ---: | ---: | ---: | ---: | ---: |"]  # fmt: skip
        for k, ad in KONU_AD.items():
            o = O["konu"].get(k)
            if not o or o.get("olay", 0) < 20:
                continue
            h = lambda c: f"{y(_al(o, c, 'ort'))} ({tt(o.get(c))})"  # noqa: E731
            L.append(f"| {ad} | {bn(o['olay'])} | {h('once_20g')} | {h('gece_0')} | {h('gunici_0')} | {h('sonra_5g')} | {h('sonra_20g')} |")
        L += ["", "Parantez içi t değeridir (aynı günün bildirimleri tek gözlem). Olay ortalaması birkaç hisseye ve bildirimlerin yığıldığı günlere fazla ağırlık verir; karar aşağıdaki sepet testine göre verilir.", ""]
    if R:
        L += ["### Aynı bildirimler kurala dönüşünce (takvim zamanlı sepet, gidiş-dönüş 30 bp maliyet)", "",
              "| Kural | Alınan | Net yıllık | Kıyas yıllık | Fazla (bp/gün) | t | İlk yarı | İkinci yarı | Deflated Sharpe |", "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"]
        satir = [(k, ad, R[k]) for k, ad in KURAL_AD.items() if isinstance(R.get(k), dict) and _al(R[k], "net", "fazla_ort") is not None]
        for k, ad, r in sorted(satir, key=lambda x: -(_al(x[2], "net", "fazla_ort") or 0)):
            n = r.get("net", {})
            yr = n.get("fazla_yari") or [None, None]
            L.append(f"| {ad} | {bn(r.get('alinan'))} | {y(n.get('yillik'), 0)} | {y(_al(r, 'kiyas', 'yillik'), 0)} | {bp(n.get('fazla_ort'))} | {tt(n, 'fazla_t')} | {bp(yr[0])} | {bp(yr[1])} | {s(r.get('dsr_fazla'))} |")
        ga = R.get("geri_alim_acilis_5g") or {}
        L += ["", "Okuma:", "",
              f"- **Bedelsiz, bedelli ve eşik bildirimlerinin ardından almak düzenli biçimde kaybettiriyor**: dönemin iki yarısında ve her yıl aynı yönde. Bedelsizde hisse haberden önceki 20 günde "
              f"{y(_al(O, 'konu', 'bedelsiz_ilk', 'once_20g', 'ort'))} yükseliyor, haber sabahı açılışta {y(_al(O, 'konu', 'bedelsiz_ilk', 'gece_0', 'ort'))} sıçrıyor, sonraki 20 günde {y(_al(O, 'konu', 'bedelsiz_ilk', 'sonra_20g', 'ort'))} veriyor.",
              f"- **Tek olumlu aday ilk geri alım bildirimi**: ertesi açılışta alıp 5 gün tutmak maliyet sonrası yılda {y(_al(ga, 'net', 'yillik'), 0)}, günlük fazla getiri {bp(_al(ga, 'net', 'fazla_ort'))} bp (t {tt(ga.get('net'), 'fazla_t')}), "
              f"yıllara göre fazla getiri {', '.join(f'{k} {y(v, 0)}' for k, v in (ga.get('yil_fazla') or {}).items())}. Deflated Sharpe {s(ga.get('dsr_fazla'))}: çoklu deneme eşiğinin (0,95) altında, bu yüzden aday.",
              "- Kâr payı kararı ve şirketlerin başka şirkette pay alımı için alım yönünde kanıt yok.", ""]  # fmt: skip
    if F.get("hepsi"):
        hep = F["hepsi"]
        ho = F.get("hedef_ozellikleri", {})
        L += ["### Portföy şirketlerinin pay bildirimleri (KAP kayıtları)", "",
              f"Portföy yönetim şirketleri {bn(F['bildirim'])} pay alım satım bildirimi verdi ({F['sirket_sayisi']} şirket, {F['hisse_sayisi']} hisse). Bildirim, bir şirketteki pay %5 ve katlarını geçince verilir. "
              f"Hedef hisseler içinde BIST 100 dışında olanların payı %{(1 - (hep.get('bist100_payi') or 0)) * 100:.0f}; ortadaki hissenin halka açık değeri {s(hep.get('hao_medyan_mlr'), 1)} milyar TL; "
              f"son bir yılda halka arz olanların payı %{(hep.get('yeni_arz_payi') or 0) * 100:.0f}.", "",
              "Hedef hissenin bildirimden bir gün önceki kesit sırası (medyan yüzdelik; 50 = ortadaki hisse): "
              + ", ".join(f"{OZELLIK_AD.get(k, k).lower()} {v['medyan'] * 100:.0f} (t {s(v['t'], 1)})" for k, v in sorted(ho.items(), key=lambda kv: -kv[1]["medyan"])) + ".", "",
              "| Şirket | Bildirim | Hisse | Dönem | En çok bildirim verilen hisseler | Oynaklık | Momentum | Devir | Defter/piyasa | BIST 100 payı | Medyan halka açık değer (mlr TL) |",
              "| --- | ---: | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |"]  # fmt: skip
        om = lambda p, k: "-" if _al(p, "ozellik_medyan", k) is None else f"{_al(p, 'ozellik_medyan', k) * 100:.0f}"  # noqa: E731
        for ad, p in sorted(F.get("sirket", {}).items(), key=lambda kv: -kv[1]["bildirim"])[:16]:
            L.append(f"| {ad} | {p['bildirim']} | {p['hisse_sayisi']} | {p['ilk'][:7]} – {p['son'][:7]} | {' '.join(x[0] for x in p.get('hisseler', [])[:6])} | {om(p, 'oynaklik_20g')} | {om(p, 'momentum_120_20')} | "
                     f"{om(p, 'devir_hizi_20g')} | {om(p, 'defter_piyasa')} | %{(p.get('bist100_payi') or 0) * 100:.0f} | {s(p.get('hao_medyan_mlr'), 1)} |")
        ag = F.get("ortak_hisse_agi", [])[:8]
        if ag:
            L += ["", "Aynı hissede buluşan şirketler (ortak hisse sayısı): " + "; ".join(f"{b['a']} – {b['b']} {b['adet']} ({', '.join(b['ortak'][:5])})" for b in ag) + ".", ""]
        pdn = R.get("portfoy_donem") or {}
        if pdn:
            L += ["| Dönem | Bildirim | Önceki 20 gün | İlk gün | Sonraki 5 gün | Sonraki 20 gün |", "| --- | ---: | ---: | ---: | ---: | ---: |"]
            for ad, d in pdn.items():
                L.append(f"| {ad} | {bn(d.get('bildirim'))} | {y(_al(d, 'once_20g', 'ort'))} | {y(_al(d, 'gun_0', 'ort'))} | {y(_al(d, 'sonra_5g', 'ort'))} | {y(_al(d, 'sonra_20g', 'ort'))} |")
            L += ["", "Fon bildirimi 2025'e kadar yükselişin ortasında geliyordu; fon rehberi değiştikten sonra bildirimin öncesi de sonrası da eksi.", ""]
        if any(k in R for k in ("portfoy_alim_20g", "portfoy_satim_20g")):
            L += ["Bildirim metninden ayrıştırılan yöne göre (20 gün tutma, günlük fazla getiri): "
                  + "; ".join(f"{'alım' if 'alim' in k else 'satım'} {bp(_al(R[k], 'net', 'fazla_ort'))} bp (t {tt(R[k].get('net'), 'fazla_t')}, {R[k].get('alinan')} bildirim)" for k in ("portfoy_alim_20g", "portfoy_satim_20g") if k in R) + ".", ""]
        TP = F.get("tutulan_pay") or {}
        if TP.get("halka_acik"):
            ha, hep_a, hep_s = TP["halka_acik"], hep.get("alim") or {}, hep.get("satim") or {}
            pen = (("once_20g", "Önceki 20 gün"), ("gun_0", "Bildirim günü"), ("sonra_5g", "Sonraki 5 gün"), ("sonra_20g", "Sonraki 20 gün"), ("sonra_60g", "Sonraki 60 gün"))
            L += ["### Fon bir şirketin ne kadarını tutuyor? (bildirim sayfalarındaki tablodan)", "",
                  f"{bn(F['bildirim'])} bildirimin {bn(TP['yon_bulunan'])} tanesinde yön ve işlem sonrası pay okunabildi ({bn(TP['alim'])} alım, {bn(TP['satim'])} satım; kalanında ayrıntı ekte). "
                  f"Her şirket ve hisse çifti için son bildirilen konum alındığında {TP['konum']} konum çıkıyor: sermayedeki pay medyan %{s(TP['oran']['medyan'], 1)} "
                  f"(çeyrekler %{s(TP['oran']['c25'], 1)} – %{s(TP['oran']['c75'], 1)}, en yüksek %{s(TP['oran']['en_yuksek'], 1)}). Halka açık paya oran (sermayedeki pay / halka açıklık oranı; yaklaşık ölçü) "
                  f"medyan %{ha['medyan'] * 100:.0f}; {ha['ceyrek_ustu']} konumda fon dolaşımdaki payın dörtte birinden fazlasını, {ha['yari_ustu']} konumda yarısından fazlasını tutuyor.", "",
                  "| Şirket | Hisse | Sermayedeki pay | Halka açık paya oranı | Son işlem | Tarih |", "| --- | --- | ---: | ---: | --- | --- |"]  # fmt: skip
            for x in TP.get("en_yogun", [])[:14]:
                hp = "-" if x["halka_acik_pay"] is None else f"%{x['halka_acik_pay'] * 100:.0f}"
                L.append(f"| {x['sirket']} | {x['hisse']} | %{s(x['oran'], 1)} | {hp} | {YON_AD.get(x['yon'], '-')} | {x['gun']} |")
            L += ["", "| Şirket | Konum | Medyan sermaye payı | Medyan halka açık paya oranı | Dörtte birden büyük konum | Alım / satım | Alım sonrası 20 gün | Satım sonrası 20 gün |", "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"]
            konumlu = [(ad, p) for ad, p in F.get("sirket", {}).items() if _al(p, "konum", "hisse", varsayilan=0) >= 3]
            for ad, p in sorted(konumlu, key=lambda kv: -(kv[1]["konum"].get("halka_acik_pay_medyan") or 0)):
                k = p["konum"]
                hm = k.get("halka_acik_pay_medyan")
                hp = "-" if hm is None else f"%{hm * 100:.0f}"
                L.append(f"| {ad} | {k['hisse']} | %{s(k['oran_medyan'], 1)} | {hp} | {k['halka_acik_ceyrek_ustu']} | {_al(p, 'alim', 'bildirim', varsayilan=0)} / {_al(p, 'satim', 'bildirim', varsayilan=0)} | "
                         f"{y(_al(p, 'alim', 'sonra_20g', 'ort'))} | {y(_al(p, 'satim', 'sonra_20g', 'ort'))} |")
            L += ["", "| Pencere | Alım bildirimi: ortalama (t) | medyan | Satım bildirimi: ortalama (t) | medyan |", "| --- | ---: | ---: | ---: | ---: |"]
            for k, ad in pen:
                L.append(f"| {ad} | {y(_al(hep_a, k, 'ort'))} ({tt(hep_a.get(k))}) | {y(_al(hep_a, k, 'medyan'))} | {y(_al(hep_s, k, 'ort'))} ({tt(hep_s.get(k))}) | {y(_al(hep_s, k, 'medyan'))} |")
            L += ["", "Alım bildirimi yükselişin ardından geliyor; sonraki ortalamaları art arda bildirim gelen birkaç hisse taşıyor ve sepet testinde alım bildirimini izlemek kaybettiriyor. Satım bildirimi günü hisse belirgin düşüyor. "
                  "Halka açık payın büyük bölümünü tek bir fonun tuttuğu hissede fiyatı fonun kendi alımı taşır; fon satıcıya dönünce karşısında alıcı kalmaz.", ""]
    if _al(AZ, "sinif", "kalan_pay"):
        kp, hz, ki, G = AZ["sinif"]["kalan_pay"], AZ["sinif"].get("halka_arz") or {}, AZ.get("kisi") or {}, AZ.get("kalan_pay_getiri") or {}
        k5 = R.get("kalan_pay_5g") or {}
        fonlar = [x for x in AZ.get("kurum", []) if x["tur"] == "fon"]
        L += ["### Bedelliden kalan payları ve halka arzda büyük payı kim alıyor?", "",
              f"Ortakların kullanmadığı rüçhan haklarından kalan paylar borsanın birincil piyasasında satılır; payların %5'inden fazlasını alanlar bildirilir. {kp['bildirim']} satışın ({kp['hisse']} şirket) {kp['alicili']} tanesinde "
              f"en az bir büyük alıcı var; ortadaki satışta büyük alıcıların toplam payı %{s(kp.get('toplam_oran_medyan'), 0)}, {kp['yari_ustu_tek_alici']} satışta tek alıcı payların yarısından fazlasını aldı. "
              "Alınan payın dağılımı: " + ", ".join(f"{ALICI_AD[t]} %{v['oran_payi'] * 100:.0f} ({v['kayit']} kayıt)" for t, v in kp["tur"].items() if v["kayit"]) + ". "
              f"{ki.get('kisi_sayisi')} gerçek kişiden {ki.get('bes_ustu_kisi')} tanesi beş ve daha çok satışta alıcı ve kişi kayıtlarının %{(ki.get('bes_ustu_kayit_payi') or 0) * 100:.0f}'ini oluşturuyor; "
              f"en sık görülen kişi {(ki.get('en_sik') or [0])[0]} ayrı satışta yer alıyor (gerçek kişilerin adı rapora yazılmaz). "
              + (("Fon tarafında " + "; ".join(f"{x['ad']} fonları {x['kayit']} satışta ortalama %{x['oran_ort']:.0f}, en yüksek %{x['oran_en_yuksek']:.0f} ({', '.join(x['hisseler'][:6])})" for x in fonlar[:3]) + ". ") if fonlar else "")
              + f"İlk halka arzlarda durum farklı: {hz.get('bildirim')} halka arzın yalnız {hz.get('alicili')} tanesinde payların %5'inden fazlasını alan biri var.", "",
              "| Kalan pay satışı | Satış | Önceki 20 gün | Sonraki 5 gün | Sonraki 20 gün | Sonraki 60 gün |", "| --- | ---: | ---: | ---: | ---: | ---: |"]  # fmt: skip
        for ad, g in G.items():
            L.append(f"| {'Tüm satışlar' if ad == 'hepsi' else ad[0].upper() + ad[1:]} | {g.get('bildirim')} | " + " | ".join(f"{y(_al(g, c, 'ort'))} ({tt(g.get(c))})" for c in ("once_20g", "sonra_5g", "sonra_20g", "sonra_60g")) + " |")
        L += ["", f"Satış sonucunun bildirilmesini izleyen beş günde hisse katmanının gerisinde kalıyor (satışların %{(_al(G, 'hepsi', 'sonra_5g', 'pozitif') or 0) * 100:.0f}'inde artı); sepet testinde bu beş günü taşımak "
              f"günlük {bp(_al(k5, 'net', 'fazla_ort'))} bp (t {tt(k5.get('net'), 'fazla_t')}). Payı toplu alan alıcı ilk günlerde piyasaya satıyor: bedelli süreci kalan payların satışıyla bitmiyor.", ""]
    if ES.get("tur"):
        ad = {"gercek_kisi": "gerçek kişi", "yerli_tuzel": "yerli şirket, holding, vakıf", "yabanci_kurum": "yabancı kurum"}
        L += [f"**Eşik bildirimlerinin sahibi** (merkezi kayıt kuruluşunun otomatik bildirimleri; {bn(ES['bildirim'])} bildirimin metni okunan {ES['metni_cekilen']} tanesi): "
              + ", ".join(f"{ad.get(t, t)} {v['bildirim']} bildirim ({v['sahip']} ayrı sahip)" for t, v in ES["tur"].items()) + ". Yabancı kurum tarafında "
              + ", ".join(f"{x['ad']} ({x['bildirim']})" for x in ES.get("yabanci_kurum", [])[:3]) + "; bu paylar büyük olasılıkla müşteriler adına tutulan saklama hesaplarıdır. Bu grupta yön bildirimin ekinde olduğu için ayrılamadı.", ""]
    if YK.get("ozellik"):
        g = YK.get("grup", {})
        oz = YK["ozellik"]
        L += ["### Yabancı neyi tutuyor (İş Yatırım, güncel kesit)", "",
              f"{YK['hisse']} hissede halka açık paylar içindeki yabancı payı: piyasa değeri ağırlıklı ortalama %{s(YK.get('pd_agirlikli'), 1)}, ortadaki hisse %{s(YK.get('medyan'), 1)}; "
              f"yabancı payı %10'un altında kalan hisselerin oranı %{(YK.get('yuzde10_alti_payi') or 0) * 100:.0f}. Katmanlara göre ortalama: "
              + ", ".join(f"{GRUP_AD.get(k, k)} %{s(g[k]['ort'], 1)}" for k in ("bist30", "bist100_30", "yildiz_diger", "ana_pazar", "alt_pazar") if k in g) + ".", "",
              "| Özellik | Sıra korelasyonu (tüm hisseler) | t | BIST 100 içinde |", "| --- | ---: | ---: | ---: |"]  # fmt: skip
        for k in ("halka_acik_deger", "buyukluk", "roe", "kazanc_verimi", "momentum_120_20", "zirveye_yakinlik", "defter_piyasa", "oynaklik_20g", "max_20g", "halka_aciklik"):
            if k in oz:
                L.append(f"| {OZELLIK_AD.get(k, k)} | {s(oz[k]['sira_kor'])} | {s(oz[k]['t'], 1)} | {s(oz[k].get('bist100_sira_kor'))} |")
        L += ["", "Yabancı önce büyüklüğe ve derinliğe bakıyor; BIST 100 içinde payı yüksek hisseler yükselmiş, kârlı ve düşük oynaklıklı. Fonların büyük pay aldığı hisse tipinin tersi.", ""]
    if YG.get("getiri"):
        gt, yo = YG["getiri"], YG.get("ozellik", {})
        L += [f"**Yabancı payının haftalık değişimi** ({YG['hafta']} hafta, {YG['donem'][0]} – {YG['donem'][1]}). Payın arttığı hisseler aynı hafta {y(_al(gt, 'ust_alt_ayni', 'ort'))} daha iyi getiri sağlıyor "
              f"(t {tt(gt.get('ust_alt_ayni'))}); sonraki hafta fark {y(_al(gt, 'ust_alt_sonra', 'ort'), 2)} (t {tt(gt.get('ust_alt_sonra'))}), sonraki 20 gün {y(_al(gt, 'ust_alt_sonra20', 'ort'), 2)} (t {tt(gt.get('ust_alt_sonra20'))}). "
              f"Önceki 20 günün getirisiyle pay değişiminin sıra korelasyonu {s(_al(gt, 'once_kor', 'ort'))} (t {tt(gt.get('once_kor'))}).",
              "Pay artışının önceki hafta sonundaki özelliklerle sıra korelasyonu: " + ", ".join(f"{OZELLIK_AD.get(k, k).lower()} {s(v['ort'])} (t {s(v['t'], 1)})" for k, v in yo.items() if v.get("t") is not None and abs(v["t"]) >= 2) + ".", ""]  # fmt: skip
    if SM.get("sureklilik"):
        su = SM["sureklilik"]
        anlamli = sum(1 for x in SM.get("en_belirgin", []) if abs(x["t"]) >= 2)
        L += ["### Sektör endeksleri, 2010–2026", "",
              f"{SM['ay_sayisi']} ay, {len(SM['sektor'])} sektör endeksi (BIST 100'e göre fazla getiri). {SM['test_sayisi']} sektör-ay çiftinden {anlamli} tanesinde |t| ≥ 2; hiçbir etki olmasa şans eseri beklenen "
              f"sayı yaklaşık {SM['test_sayisi'] * 0.046:.0f}. Sektörlerin güvenilir bir ay takvimi yok.", "",
              "| Bakılan dönem | Sıra korelasyonu | t | En iyi 3 sektör, ertesi ay | t | En kötü 3 sektör, ertesi ay | t |", "| --- | ---: | ---: | ---: | ---: | ---: | ---: |"]  # fmt: skip
        for k, v in su.items():
            L.append(f"| {k.replace('ay', ' ay')} | {s(v['sira_kor'], 3)} | {s(v['t'], 1)} | {y(v['ust3_fazla'], 2)} | {s(v['ust3_t'], 1)} | {y(v['alt3_fazla'], 2)} | {s(v['alt3_t'], 1)} |")
        L += ["", "Uzun dönemde zayıf ama ölçülebilir bir süreklilik var: son 12 ayın en kötü üç sektörü ertesi ay ortalamanın gerisinde kalmaya devam ediyor. 2024–2026 hisse panelinde görülmeyen bu etki 17 yıllık endeks verisinde çıkıyor.", ""]
    if MS.get("varlik"):
        L += ["### Madenler ve dolar: getirinin oluştuğu saatler", "", "| Varlık | BIST kapalıyken (bp/gün) | t | Seans içinde (bp/gün) | t |", "| --- | ---: | ---: | ---: | ---: |"]
        for ad, v in sorted(MS["varlik"].items(), key=lambda kv: -(_al(kv[1], "gece", "ort") or 0)):
            L.append(f"| {ad} | {bp(_al(v, 'gece', 'ort'))} | {tt(v.get('gece'))} | {bp(_al(v, 'seans', 'ort'))} | {tt(v.get('seans'))} |")
        L += ["", "Altın, gümüş ve doların TL getirisi BIST kapalıyken (18:00 → 10:00, hafta sonları dahil) oluşuyor. Borsada işlem gören altın ve gümüş fonlarını gün içinde alıp satmak getirinin oluştuğu saatleri dışarıda bırakır. "
              "(Fonların kendi fiyat geçmişi yok; hesap ons fiyatı × dolar/TL üzerinden, saatlik veriyle.)", ""]
    return L


def rapor_yaz(S: dict, arastirma: Path | None = None) -> str:
    L: list[str] = []
    V = S.get("veri", {})
    A, Z, K = S.get("agac", {}), S.get("zaman", {}), S.get("kuresel", {})
    ST = S.get("strateji", {})
    bas, bit = (V.get("donem") or ["?", "?"])[:2]
    L += [f"# BIST ağ analizi — bağlantılar, para akışı, yatırımcı tipleri ve günlük kurallar ({date.today():%d.%m.%Y})", "",
          f"Veri: {V.get('hisse', '?')} hisse, {bas} → {bit} ({V.get('gun', '?')} işlem günü); 251 hissenin saatlik çubukları (Kas 2024→); sektör endeksleri, madenler ve küresel "
          "seriler (2010→ günlük, son 2 yıl saatlik); fon şirketlerinin KAP pay bildirimleri (araştırma ajanı derlemesi). Tera grubu hisseleri kapsam dışıdır. "
          "Bulgular tanımlayıcıdır; yatırım tavsiyesi değildir.", ""]  # fmt: skip

    # ---------------------------------------------------------------- özet
    g = S.get("gecikme", {})
    kf = g.get("kucuk_faktor", {})
    tav, tab = _al(S, "tavan", "tavan", varsayilan={}), _al(S, "tavan", "taban", varsayilan={})
    ta = S.get("taban_alimi", {})
    ha = S.get("halka_arz", {})
    fon = S.get("fon", {})
    L += ["## Özet", ""]
    oz = []
    if A:
        oz.append(f"**BIST iki katmanlı bir ağ.** Hisselerin birlikte hareketinin büyük kısmı iki ortak etkenden geliyor: endeks (XU100) ve endeksin açıklamadığı "
                  f"\"küçük hisse\" hareketi. Ham ortalama korelasyon {s(A.get('ort_kor_ham'))}; endeks ayıklanınca {s(A.get('ort_kor_piyasa_artik'))}; ikisi de ayıklanınca sıfır.")  # fmt: skip
        oz.append("**Gerçek sektör bağı az, grup bağı çok.** İki etken ayıklandıktan sonra en güçlü bağlar aynı gruba ait şirketler arasında (holding–iştirak, pay grupları). "
                  "Sektör olarak birlikte hareket edenler: bankalar, savunma/teknoloji, sigorta, spor, madencilik, çimento. Holding, ticaret, inşaat ve ulaştırma etiketleri fiyatta bir bağ oluşturmuyor.")  # fmt: skip
    if K:
        e = _al(K, "bist30", "ES=F", "bosluk", varsayilan={})
        u = _al(K, "bist30", "USDTRY=X", "bosluk", varsayilan={})
        oz.append(f"**Haber önce büyük hisselere gece girer.** BIST 30'un açılış boşluğu gece S&P vadelisiyle {s(e.get('kor'))}, dolar/TL ile {s(u.get('kor'))} korelasyonlu; "
                  "açılıştan sonra aynı yönde devam yok. Küçük hisseler bu habere yarı şiddette ve gecikmeli tepki veriyor.")  # fmt: skip
    if kf:
        oz.append(f"**Büyük hisse lider, küçük hisse takipçi.** Endeksin bugünkü getirisi küçük hisse etkeninin yarınki getirisiyle {s(kf.get('piyasa_once'))} korelasyonlu; tersi yok "
                  f"({s(kf.get('kucuk_once'))}). Küçük hisselerin piyasa duyarlılığının yaklaşık beşte biri 1–4 gün gecikmeyle geliyor.")  # fmt: skip
    gg = V.get("gece_gunici", {})
    if gg.get("bist30"):
        oz.append(f"**Getiri gecede, kayıp gün içinde.** BIST 30'da ortalama gece getirisi günlük {y(gg['bist30']['gece'], 2)}, gün içi {y(gg['bist30']['gunici'], 2)}. "
                  "Gün içinde en zayıf dilimler 11:30–14:30 ve son yarım saat.")  # fmt: skip
    fk = _al(S, "faktor", "ozellik", varsayilan={})
    if fk:
        kv, dv, zy = fk.get("kazanc_verimi", {}), fk.get("devir_hizi_20g", {}), fk.get("zirveye_yakinlik", {})
        oz.append(f"**İki yatırımcı kitlesi iki ayrı ölçüye bakıyor.** BIST 100'de ödüllendirilen tek ölçü kazanç verimi (20 günde üst–alt fark {y(_al(kv, 'bist100', 'ust_alt'))}). "
                  f"BIST 100 dışında fiyatı dikkat ve kalabalık belirliyor: devir hızı yüksek hisseler {y(_al(dv, 'bist100_disi', 'ust_alt'))}, zirvesine yakın hisseler {y(_al(zy, 'bist100_disi', 'ust_alt'))}.")  # fmt: skip
    if tav:
        b = tav.get("dizi_bitince", {})
        oz.append(f"**Bireysel yatırımcının üç tuzağı ölçülebilir.** Tavan serisi bozulduktan sonraki 5 günde hisse ortalamadan {y(_al(b, 'sonraki_5g', 'ort'))} geride. "
                  f"Tabandan alım kâğıt üstünde {y(_al(ta, 'hepsi', 'olculen_ort'))} görünüyor; satılamama hesaba katılınca {y(_al(ta, 'hepsi', 'gercek_ort'))}. "
                  f"Halka arzda tavan serisi bittikten sonra alanların 20 günlük medyan getirisi {y(_al(ha, 'sonra_20g', 'medyan'))}.")  # fmt: skip
    if fon:
        tas = _al(S, "tasfiye", "donem", varsayilan={})
        oz.append(f"**Yoğun pozisyon alan fonların hisseleri önce çok kazandırdı, sonra çöktü.** Bu fonların bildirim verdiği hisseler 2025'te ortalama {y(_al(tas, '2025', 'kume_ort'), 0)} "
                  f"(diğer küçük hisseler {y(_al(tas, '2025', 'kiyas_ort'), 0)}); SPK'nın 17 Eylül 2026 kararından sonraki ayda {y(_al(tas, '17 Eyl–15 Eki 2026', 'kume_ort'), 0)} "
                  f"(diğerleri {y(_al(tas, '17 Eyl–15 Eki 2026', 'kiyas_ort'), 0)}). Fon satış bildiriminden sonraki 20 günde ortalama {y(_al(fon, 'satim', 'sonra_20g', 'ort'), 0)}.")  # fmt: skip
    if ST:
        g1, bl = ST.get("gece_bist100", {}), ST.get("bilesik", {})
        oz.append(f"**Sınanan kurallardan çoklu deneme düzeltmesini geçen yok; iki aday var.** (1) BIST 100'de kapanışta alıp açılışta satmak brüt günlük {y(_al(g1, 'brut', 'ort'), 2)}: "
                  f"gidiş-dönüş maliyet 10 bp ise yıllık {y(_al(g1, 'net_10bp', 'yillik'), 0)}, 30 bp ise {y(_al(g1, 'net_30bp', 'yillik'), 0)}. "
                  f"(2) BIST 100 dışında bileşik puanla seçim kıyasını 20 günde {y(_al(bl, 'net_30bp', 'fazla_ort'))} geçiyor (t {tt(bl.get('net_30bp'), 'fazla_t')}), ama küçük hisse düşüşünde mutlak getirisi sıfıra iniyor.")  # fmt: skip
    L += [f"{i}. {x}" for i, x in enumerate(oz, 1)] + [""]

    # ---------------------------------------------------------------- 1. ağaç
    L += ["## 1. BIST bir ağaç olarak: bağlantılar nasıl kuruluyor", ""]
    if A:
        L += [f"- {A.get('hisse')} hissenin günlük getirilerinde ortalama ikili korelasyon **{s(A.get('ort_kor_ham'))}**. Endeks etkisi çıkarılınca {s(A.get('ort_kor_piyasa_artik'))} kalıyor: "
              "bu, endeksin dışında kalan hisselerin kendi aralarında birlikte hareket ettiğini gösteriyor (\"küçük hisse etkeni\").",
              f"- Küçük hisse etkeni: günlük oynaklığı {y(kf.get('gunluk_std'), 2).lstrip('+')}, bir gün önceki değeriyle korelasyonu {s(kf.get('oz_iliski'))} (kalıcı), "
              f"endeksin önceki günüyle korelasyonu {s(kf.get('piyasa_once'))}. Endeksin kendi günlük öz-ilişkisi yalnız {s(kf.get('xu100_oz_iliski'))}.",
              f"- İki etken ayıklandıktan sonra aynı sektördeki hisselerin ortalama korelasyonu {s(A.get('ort_kor_ayni_sektor_artik'), 3)}, farklı sektörlerdekilerin {s(A.get('ort_kor_farkli_sektor_artik'), 3)}. "
              "Sektör etiketi tek başına zayıf bir bağ.",
              f"- En küçük kapsayan ağaçta aynı sektörden iki hisseyi bağlayan kenarların oranı %{(A.get('kenar_ayni_sektor_orani') or 0) * 100:.0f} (rastgele beklenti %{(A.get('rastgele_ayni_sektor_orani') or 0) * 100:.0f}).", ""]  # fmt: skip
        sb = A.get("sektor_butunlugu") or []
        if sb:
            L += ["**Hangi sektörler gerçekten birlikte hareket ediyor** (iki etken ayıklanmış ortalama korelasyon):", "", "| Sektör | Hisse | Sektör içi | Sektör dışıyla |", "| --- | --- | --- | --- |"]
            L += [f"| {sek(x['sektor'])} | {x['hisse']} | {s(x['ic_kor'], 3)} | {s(x['dis_kor'], 3)} |" for x in sb[:10]]
            L += ["", "Bütünlüğü olmayanlar (iç ≈ dış): " + ", ".join(sek(x["sektor"]) for x in sb[-6:]) + ".", ""]
    B = S.get("baglar") or []
    if B:
        L += ["**En güçlü 25 bağ** (iki etken ayıklanmış korelasyon). Çoğu aynı gruba ait şirketler:", "", "| Hisse | Hisse | Korelasyon | Şirketler |", "| --- | --- | --- | --- |"]
        L += [f"| {x['a']} | {x['b']} | {s(x['kor'])} | {baslik_tr(x['a_ad'])[:28]} ~ {baslik_tr(x['b_ad'])[:28]} |" for x in B[:25]] + [""]
    if Z:
        yil = Z.get("yil", {})
        if yil:
            L += ["**Ağaç yıldan yıla değişiyor.** Ham korelasyon ağacının merkezi her yıl başka bir hisse; kenarların yalnız küçük bir kısmı ertesi yıla kalıyor:", "",
                  "| Yıl | Ortalama korelasyon | Ağacın merkezi | En çok bağlı 3 hisse |", "| --- | --- | --- | --- |"]  # fmt: skip
            L += [f"| {a} | {s(d.get('ort_kor_ham'))} | {d.get('kok')} | {', '.join(str(x[0]) for x in (d.get('en_bagli') or [])[:3])} |" for a, d in yil.items()]
            kal = Z.get("kalicilik") or []
            if kal:
                L += ["", "Kenar kalıcılığı: " + "; ".join(f"{k['donem']} %{k['kalan_kenar_orani'] * 100:.0f}" for k in kal) + ". Ağaç sabit bir harita değil; grup bağları ve banka kümesi dışında yapı kayıyor."]
        kk = Z.get("kayan_kor_60g") or {}
        if kk:
            enb, enk = max(kk, key=kk.get), min(kk, key=kk.get)
            L += [f"- Likit 100 hissenin 60 günlük ortalama korelasyonu {enk} tarihinde {s(kk[enk])} ile en düşük, {enb} tarihinde {s(kk[enb])} ile en yüksek. "
                  "Korelasyon satış dalgalarında yükseliyor (herkes birlikte düşüyor), yükseliş dönemlerinde düşüyor (hisse seçimi öne çıkıyor)."]  # fmt: skip
        mv = Z.get("mevsim") or {}
        if mv:
            L += ["- Mevsimlere göre ham korelasyon: " + ", ".join(f"{MEVSIM_AD.get(k, k)} {s(v.get('ort_kor_ham'))}" for k, v in mv.items()) + ". Üç yıllık veriyle bu, mevsim etkisinden çok belirli dönemlerin (Mart–Nisan 2025, Eylül 2026) izidir."]
        L += [""]

    # ---------------------------------------------------------------- 2. yayılım
    L += ["## 2. Bilgi ve para nasıl yayılıyor", ""]
    if K:
        L += ["**Küresel → BIST 30 → küçük hisseler.** BIST kapanışından (18:00) ertesi açılışa (10:00) kadar küresel serilerin hareketi ile hisselerin açılış boşluğu ve açılıştan kapanışa getirisi "
              f"({K.get('gun')} gün; hisselerin kendi açılış fiyatlarıyla):", "",
              "| Gece hareketi | BIST 30 boşluk (kor.) | Beta | Açılıştan sonra devam | BIST 100 dışı boşluk | Beta | Devam |", "| --- | --- | --- | --- | --- | --- | --- |"]  # fmt: skip
        for sx in ("ES=F", "TUR", "USDTRY=X", "BZ=F", "SI=F", "GC=F", "HG=F", "EURUSD=X"):
            a, b = _al(K, "bist30", sx, varsayilan={}), _al(K, "bist100_disi", sx, varsayilan={})
            if a:
                L.append(f"| {SERI_AD.get(sx, sx)} | {s(_al(a, 'bosluk', 'kor'))} (t {tt(a.get('bosluk'))}) | {s(_al(a, 'bosluk', 'beta'))} | {s(_al(a, 'devam', 'kor'))} (t {tt(a.get('devam'))}) | "
                         f"{s(_al(b, 'bosluk', 'kor'))} | {s(_al(b, 'bosluk', 'beta'))} | {s(_al(b, 'devam', 'kor'))} (t {tt(b.get('devam'))}) |")  # fmt: skip
        L += ["", "- Beta: gece %1'lik harekete boşluğun tepkisi. S&P vadelisi gece %1 yükselirse BIST 30 ortalama "
              f"{y(_al(K, 'bist30', 'ES=F', 'bosluk', 'beta', varsayilan=0) / 100, 2)} yukarıda açılıyor; BIST 100 dışı hisseler bunun yaklaşık yarısı kadar.",
              "- \"Devam\" sütunu sıfıra yakın: açılış fiyatı gece haberini içine alıyor, açılışta alıp aynı yönde kazanç beklemek için dayanak yok.", ""]  # fmt: skip
        sk = [x for x in (K.get("sektor") or []) if x.get("anlamli") and x.get("tutarli")]
        if sk:
            tst = K.get("sektor_test", {})
            L += [f"**Maden ve küresel seri → sektör bağları** (sektörün piyasa ortalamasına göre fazla getirisi; {tst.get('test')} testten yanlış keşif oranı %10 ile {tst.get('anlamli')} tanesi anlamlı, "
                  f"bunların {tst.get('anlamli_tutarli')} tanesi iki yarıda aynı işaretli):", "", "| Seri | Sektör | Ne zaman | Korelasyon | t | Beta |", "| --- | --- | --- | --- | --- | --- |"]  # fmt: skip
            tur_ad = {"bosluk": "gece → açılış boşluğu", "devam": "gece → açılıştan kapanışa", "esanli": "seans içi eşzamanlı"}
            L += [f"| {SERI_AD.get(x['seri'], x['seri'])} | {sek(x['sektor'])} | {tur_ad[x['tur']]} | {s(x['kor'])} | {s(x['t'], 1)} | {s(x['beta'])} |" for x in sk[:18]]
            L += ["", "Okuma: petrol yükselince savunma/teknoloji ayrışıyor ve havacılık geriliyor (jeopolitik gerilim); gümüş, altın, platin ve bakır madencilik hisselerini taşıyor; "
                  "bankalar küresel risk iştahına en duyarlı sektör. Havacılıkta gece gelen iyi haberin açılıştaki tepkisi gün içinde kısmen geri veriliyor.", ""]  # fmt: skip
    og = S.get("oncu_grup", {})
    if og:
        L += ["**Gruplar arası günlük öncü-takipçi ilişkisi** (bir grubun bugünkü getirisi ile diğerinin yarınki getirisi):", "", "| Öncü | Takipçi | Korelasyon | t | 1. yarı | 2. yarı |", "| --- | --- | --- | --- | --- | --- |"]
        sec = [k for k in og.get("kenarlar", []) if k["oncu"] in ("bist30", "bist100_30") and k["takipci"] in ("yildiz_diger", "ana_pazar", "alt_pazar")][:5]
        sec += [k for k in og.get("kenarlar", []) if k["oncu"] in ("yildiz_diger", "ana_pazar") and k["takipci"] == "bist30"][:2]
        L += [f"| {GRUP_AD.get(k['oncu'], k['oncu'])} | {GRUP_AD.get(k['takipci'], k['takipci'])} | {s(k['kor'])} | {s(k['t'], 1)} | {s(k.get('yari1'))} | {s(k.get('yari2'))} |" for k in sec]
        oi = og.get("oz_iliski", {})
        L += ["", "Günlük öz-ilişki (bugün ↔ yarın): " + ", ".join(f"{GRUP_AD.get(k, k)} {s(v)}" for k, v in oi.items()) + ". Küçük gruplarda bunun bir kısmı tavan/taban kilidinin mekanik etkisidir.", ""]
    if g.get("grup"):
        L += ["**Fiyat gecikmesi** (hissenin endeks haberine geç tepki verme ölçüsü; Hou–Moskowitz):", "", "| Grup | Endeks duyarlılığı (beta) | Gecikmeli duyarlılık toplamı | Gecikme ölçüsü | Endeksin açıkladığı pay |", "| --- | --- | --- | --- | --- |"]
        for k in ("bist30", "bist100_30", "yildiz_diger", "ana_pazar", "alt_pazar"):
            d = g["grup"].get(k)
            if d:
                L.append(f"| {GRUP_AD[k]} | {s(d['beta'])} | {s(d['gecikmeli_beta_toplam'])} | {s(d['gecikme_olcusu'], 3)} | %{d['r2_esanli'] * 100:.0f} |")
        L += [""]
    osk = S.get("oncu_sektor", {})
    if osk:
        anl = [k for k in osk.get("kenarlar", []) if k.get("anlamli") and k["oncu"] != k["takipci"]]
        L += [f"**Sektörler arası** (iki etken ayıklanmış): {osk.get('test')} çift içinde anlamlı olan yalnız {len(anl)} tane. Başlıcaları: "
              + "; ".join(f"{sek(k['oncu'])} → {sek(k['takipci'])} ({s(k['kor'])})" for k in anl[:6]) + ". Etkiler küçük (korelasyon ≈ 0,11–0,14); tek başına işlem kuralı için yetersiz.", ""]  # fmt: skip
    osa = S.get("oncu_saatlik", {})
    if osa:
        L += ["**Saat içi:** önceki saatin getirisi ile sonraki saatin getirisi arasındaki gruplar arası ilişki ilk yılda vardı (≈ 0,13–0,16), ikinci yılda kayboldu; "
              "Alt Pazar'ın gecikmesi dışında kalıcı değil. Saatlik öncü-takipçi kuralı önerilmez.", ""]  # fmt: skip

    # ---------------------------------------------------------------- 3. zaman
    L += ["## 3. Saatten saate, günden güne, mevsimden mevsime, yıldan yıla", ""]
    sp = S.get("saat_profili", {})
    if sp:
        dil = [d for d in sp.get("dilimler", []) if any(d in v for v in sp.get("grup", {}).values())]
        L += ["**Saat dilimine göre ortalama getiri** (%; gece = önceki kapanış → açılış; 09:30 = açılış → 10:30; 17:30 = son yarım saat; kalın: |t| ≥ 2):", "",
              "| Grup | " + " | ".join(dil) + " |", "| --- |" + " --- |" * len(dil)]  # fmt: skip
        for k in ("bist30", "bist100_30", "yildiz_diger", "ana_pazar"):
            row = sp["grup"].get(k)
            if row:
                hucre = []
                for d in dil:
                    v = row.get(d)
                    if not v:
                        hucre.append("-")
                        continue
                    m = s(v["ort"] * 100, 3)
                    hucre.append(f"**{m}**" if v.get("t") is not None and abs(v["t"]) >= 2 else m)
                L.append(f"| {GRUP_AD[k]} | " + " | ".join(hucre) + " |")
        hp = sp.get("hacim_payi", {})
        if hp.get("bist30"):
            L += ["", "İşlem hacminin saatlere dağılımı (BIST 30): " + ", ".join(f"{d} %{v * 100:.0f}" for d, v in hp["bist30"].items()) + ". En yoğun saat 10:30–11:30, en sakin öğle arası.", ""]
    tk = S.get("saat_takvim", {})
    if tk.get("haftanin_gunu"):
        L += ["**Haftanın günü** (251 hisse ortalaması, %): " + "; ".join(f"{k}: gece {s(v['gece'] * 100)}, gün içi {s(v['gunici'] * 100)}" for k, v in tk["haftanin_gunu"].items())
              + ". İki yıllık veri; gün etkisi için kanıt zayıf.", ""]  # fmt: skip
    ms = S.get("mevsimsellik", {})
    if ms:
        L += ["**Aylık mevsimsellik, 2010–2026** (ortalama aylık getiri %; kalın: |t| ≥ 2):", "", "| Seri | " + " | ".join(AYLAR) + " | Ort. |", "| --- |" + " --- |" * 13]
        for ad in ("BIST 100", "BIST 100 (dolar)", "Bankalar", "Sanayi", "Altın (TL)", "Gümüş (TL)", "Dolar/TL"):
            d = ms.get(ad)
            if d:
                hucre = []
                for m in range(1, 13):
                    v = d["aylar"].get(m) or d["aylar"].get(str(m))
                    if not v:
                        hucre.append("-")
                        continue
                    x = s(v["ort"] * 100, 1)
                    hucre.append(f"**{x}**" if v.get("t") is not None and abs(v["t"]) >= 2 else x)
                L.append(f"| {ad} | " + " | ".join(hucre) + f" | {s(d['tum_ort'] * 100, 1)} |")
        L += ["", "Okuma: BIST 100'de Ocak, Nisan ve Kasım ortalamanın belirgin üstünde; dolar bazında Mayıs zayıf. Altın (TL) için Ağustos en güçlü ay. "
              "17 yıl, ay başına 16–17 gözlem demek; 84 hücrelik bir tabloda birkaç \"anlamlı\" hücre şansla da çıkar.", ""]  # fmt: skip
    vr = S.get("varlik", {})
    if vr:
        L += ["**Yıldan yıla: borsa, altın, gümüş, dolar (TL getirisi)**", "", "| Yıl | BIST 100 | Altın | Gümüş | Dolar | Kazanan |", "| --- | --- | --- | --- | --- | --- |"]
        ad_tr = {"bist": "BIST 100", "altin": "Altın", "gumus": "Gümüş", "dolar": "Dolar"}
        for yl, d in vr.get("yillik", {}).items():
            L.append(f"| {yl} | {y(d.get('bist'), 0)} | {y(d.get('altin'), 0)} | {y(d.get('gumus'), 0)} | {y(d.get('dolar'), 0)} | {ad_tr.get(vr['kazanan'].get(yl), '-')} |")
        k6 = _al(vr, "kural", "6ay", varsayilan={})
        if k6:
            at = k6.get("al_tut", {})
            L += ["", f"Aylık \"son 6 ayın kazananına geç\" kuralı 2010'dan bu yana parayı {s(1 + k6['kumulatif'], 0)} katına çıkarıyor; yalnız altın tutmak {s(1 + at.get('altin', 0), 0)}, "
                  f"dördünü eşit tutmak {s(1 + k6['esit_agirlik'], 0)}, yalnız BIST 100 {s(1 + at.get('bist', 0), 0)} katı. Kural ilk yarıda eşit ağırlığı geçti, ikinci yarıda geçemedi; "
                  "sağlam bir üstünlük yok. Not: mevduat/para piyasası fonu getirisi seride yok.", ""]  # fmt: skip
    rt = S.get("rotasyon", {})
    if rt:
        L += ["**Sektör liderliği yıldan yıla kalıcı değil** (eşit ağırlıklı sektör sepetleri):", "", "| Yıl | Sektör ortalaması | En iyi 3 | En kötü 3 |", "| --- | --- | --- | --- |"]
        for yl, d in rt.get("yil", {}).items():
            L.append(f"| {yl} | {y(d['ortalama'], 0)} | {', '.join(f'{sek(k)} {y(v, 0)}' for k, v in d['en_iyi'][:3])} | {', '.join(f'{sek(k)} {y(v, 0)}' for k, v in d['en_kotu'][-3:])} |")
        kl = rt.get("kalicilik", {})
        L += ["", "Sıra korelasyonu: yıldan yıla " + ", ".join(f"{k} {s(v)}" for k, v in rt.get("yildan_yila", {}).items())
              + f"; aydan aya {s(_al(kl, '1ay', 'sira_kor'))} (t {tt(kl.get('1ay'))}), 3 aylık geçmişle {s(_al(kl, '3ay', 'sira_kor'))} (t {tt(kl.get('3ay'))}). "
              "Geçen yılın kazanan sektörü bu yılın kazananı değil; yalnız bir aylık kısa bir devam var.", ""]  # fmt: skip
    ig = S.get("ilgi_grup", {})
    isk = S.get("ilgi_sektor", {})
    if ig:
        L += ["**İşlem ilgisi nereye kayıyor** (TL işlem hacmindeki pay):", "", "| Yıl | " + " | ".join(GRUP_AD[k] for k in ("bist30", "bist100_30", "yildiz_diger", "ana_pazar", "alt_pazar")) + " |", "| --- | --- | --- | --- | --- | --- |"]
        for yl, d in ig.get("yillik_pay", {}).items():
            L.append(f"| {yl} | " + " | ".join(f"%{d.get(k, 0) * 100:.1f}".replace(".", ",") for k in ("bist30", "bist100_30", "yildiz_diger", "ana_pazar", "alt_pazar")) + " |")
        if isk:
            L += ["", f"Sektör bazında ilgi getiriyi aynı ay içinde izliyor (sıra korelasyonu {s(_al(isk, 'esanli', 'sira_kor'))}, t {tt(isk.get('esanli'))}); geçen ayın ilgisi bu ayın getirisini öngörmüyor "
                  f"({s(_al(isk, 'ilgi_sonra_getiri', 'sira_kor'))}, t {tt(isk.get('ilgi_sonra_getiri'))}). İşlem hacmi payı para girişi değildir; her işlemin bir alıcısı ve bir satıcısı vardır.", ""]  # fmt: skip

    # ---------------------------------------------------------------- 4. yatırımcı tipleri
    L += ["## 4. Kim neye göre alıyor: büyük ve küçük yatırımcı", ""]
    yd = None
    if arastirma and (arastirma / "yatirimci_davranisi.json").exists():
        try:
            yd = json.loads((arastirma / "yatirimci_davranisi.json").read_text(encoding="utf-8"))
        except Exception:  # noqa: BLE001
            yd = None
    if yd:
        anahtar = ["Pay senedi yatırımcı sayısı - 2025 yıl sonu", "Milyoner (≥1 milyon TL)", "Milyonerlerin pay senedi portföy değeri payı", "Yabancı payı (portföy değeri) - 2025 sonu",
                   "Yabancıların pay senedi işlem hacmi payı", "Yabancı net hisse işlemi - 2025", "Halka arz sayısı ve büyüklüğü - 2024", "Halka arz sayısı ve katılım - 2026", "Emeklilik fonlarının en büyük"]  # fmt: skip
        tum = yd.get("istatistikler", [])
        sec = [next((x for x in tum if str(x.get("olcu", "")).startswith(a) and (x.get("guven") or 0) >= 0.5), None) for a in anahtar]
        sec = [x for x in sec if x]
        L += ["**Resmi istatistikler** (araştırma ajanı derlemesi; arama özetlerinden):", ""]
        L += [f"- {x['olcu']}: {x['deger']} ({x.get('tarih')}; [kaynak]({x.get('kaynak')}))" for x in sec] + [""]
    L += ["Hesap bazında veri yok. Bu yüzden iki vekil kullanıldı: BIST 100 içi (yabancı ve kurumsal ağırlıklı fiyatlama) ve BIST 100 dışı (bireysel ağırlıklı). "
          "Bir özelliğin bir grupta ödüllendirilmesi, o grubun fiyatı belirleyen yatırımcısının o ölçüye baktığına işarettir.", ""]  # fmt: skip
    if fk:
        L += ["**Hangi özellik hangi grupta ödüllendiriliyor** (özelliğe göre en yüksek beşte birlik − en düşük beşte birlik, sonraki 20 gün; tavan/tabanda kapananlar ve günlük hacmi 2 mn TL altı hariç):", "",
              "| Özellik | BIST 100 | t | BIST 100 dışı | t | Dışı: 1. / 2. yarı |", "| --- | --- | --- | --- | --- | --- |"]  # fmt: skip
        sira = ["kazanc_verimi", "defter_piyasa", "roe", "zirveye_yakinlik", "gunici_20g", "getiri_20g", "getiri_5g", "momentum_120_20", "devir_hizi_20g", "halka_acik_deger", "oynaklik_20g", "max_20g", "hacim_soku", "gece_20g", "halka_aciklik"]
        for k in sira:
            d = fk.get(k)
            if d:
                a, b = d.get("bist100", {}), d.get("bist100_disi", {})
                L.append(f"| {OZELLIK_AD.get(k, k)} | {y(a.get('ust_alt'))} | {tt(a)} | {y(b.get('ust_alt'))} | {tt(b)} | {y(b.get('yari1'))} / {y(b.get('yari2'))} |")
        L += ["", "- **BIST 100:** yalnız kazanç verimi anlamlı. Momentum, oynaklık, hacim gibi ölçüler bir şey söylemiyor; bu kesim bu ölçülere göre zaten fiyatlanmış.",
              "- **BIST 100 dışı:** zirvesine yakın ve gün içinde güçlenen hisseler devam ediyor; çok el değiştiren, son günlerde sıçrama yapmış, oynak ve hacmi patlamış hisseler geride kalıyor. "
              "Bunlar bireysel ilginin izleri: dikkat çeken hisseye geç girilmiş oluyor.", ""]  # fmt: skip
    kv2 = S.get("kisa_vade", {})
    if kv2:
        L += ["**Ertesi güne etkiler** (BIST 100 dışı; üst − alt beşte birlik, günlük):", "", "| Bugünkü özellik | Ertesi gece | t | Ertesi gün içi | t | Sonraki 5 gün | t |", "| --- | --- | --- | --- | --- | --- | --- |"]
        for k in ("hacim_soku", "max_20g", "gece_20g", "gunici_20g", "getiri_1g"):
            d = _al(kv2, k, "bist100_disi", varsayilan={})
            if d:
                L.append(f"| {OZELLIK_AD.get(k, k)} | {y(_al(d, 'ertesi_gece', 'ust_alt'), 2)} | {tt(d.get('ertesi_gece'))} | {y(_al(d, 'ertesi_gunici', 'ust_alt'), 2)} | {tt(d.get('ertesi_gunici'))} | "
                         f"{y(_al(d, 'sonraki_5g', 'ust_alt'), 2)} | {tt(d.get('sonraki_5g'))} |")  # fmt: skip
        L += ["", "Gece getirisi yüksek hisseler gece kazanmaya, gün içinde kaybetmeye devam ediyor; toplamda geride kalıyor. Bu, açılışta alım yapan kitle ile gün içinde satan kitlenin ayrıştığına işaret ediyor "
              "(Lou, Polk ve Skouras'ın \"gece–gündüz çekişmesi\" bulgusuyla uyumlu). Gün içinde güçlenen hisseler ise sonraki haftalarda öne geçiyor.", ""]  # fmt: skip
    if tav:
        L += [f"**Tavan ve taban dizileri.** {bn(tav.get('gun'))} tavan günü var (tüm hisse-günlerin {y(tav.get('hisse_gun_orani')).lstrip('+')} kadarı); bunların yalnız {bn(tav.get('bist100_gun'))} tanesi BIST 100'de. "
              f"Taban günü sayısı {bn(tab.get('gun'))}; yıllara göre {', '.join(f'{k}: {bn(v)}' for k, v in (tab.get('yillik') or {}).items())}.", "",
              "| Dizinin kaçıncı günü | Tavan: ertesi gün yine tavan | Ertesi gece | Ertesi gün içi | Taban: ertesi gün yine taban | Ertesi gece | Ertesi gün içi |", "| --- | --- | --- | --- | --- | --- | --- |"]  # fmt: skip
        for k in ("1", "2", "3", "4", "5+"):
            a, b = _al(tav, "dizi", k, varsayilan={}), _al(tab, "dizi", k, varsayilan={})
            if a or b:
                L.append(f"| {k} | %{(a.get('ertesi_gun_devam') or 0) * 100:.0f} | {y(a.get('ertesi_gece'))} | {y(a.get('ertesi_gunici'))} | %{(b.get('ertesi_gun_devam') or 0) * 100:.0f} | {y(b.get('ertesi_gece'))} | {y(b.get('ertesi_gunici'))} |")
        bt, bb = tav.get("dizi_bitince", {}), tab.get("dizi_bitince", {})
        L += ["", f"- Tavan serisi bozulduğu gün ortalama {y(bt.get('bitis_gunu_getiri'))}; sonraki 1 gün {y(_al(bt, 'sonraki_1g', 'ort'))} (t {tt(bt.get('sonraki_1g'))}), 5 gün {y(_al(bt, 'sonraki_5g', 'ort'))} (t {tt(bt.get('sonraki_5g'))}), "
              f"20 gün {y(_al(bt, 'sonraki_20g', 'ort'))} (ortalama hisseye göre). Kazanç seriyi elinde tutana gece boşluğuyla geliyor; ertesi sabah alan gün içinde kaybediyor.",
              f"- İlk tavan gününü görüp ertesi açılışta alanın 5 günlük ham getirisi {y(_al(tav, 'ilk_gunden_sonra_acilistan_5g', 'ort'))} (t {tt(tav.get('ilk_gunden_sonra_acilistan_5g'))}).",
              f"- Taban serisi bitince toparlanma yok: sonraki 5 gün {y(_al(bb, 'sonraki_5g', 'ort'))}, 20 gün {y(_al(bb, 'sonraki_20g', 'ort'))}.", ""]  # fmt: skip
    if ta.get("hepsi"):
        h_, k_, c_ = ta["hepsi"], ta.get("kilitli", {}), ta.get("ayni_gun_cikilabilen", {})
        L += [f"**Tabandan alım gerçekte ne kazandırıyor?** {bn(ta.get('olay'))} olay. Taban kapanışının ertesi günü açılışta alıp kapanışta satmak kâğıt üstünde {y(h_.get('olculen_ort'))} görünüyor. "
              f"Ama her 100 olayın {(h_.get('kilitli_kalan') or 0) * 100:.0f} tanesinde hisse yine tabanda kapanıyor ve satılamıyor. Tabanda kapanmayan ilk güne kadar taşıyınca gerçekleşen ortalama **{y(h_.get('gercek_ort'))}** "
              f"(medyan {y(h_.get('gercek_medyan'))}). Aynı gün çıkılabilenlerde {y(c_.get('gercek_ort'))}, kilitli kalanlarda {y(k_.get('gercek_ort'))}. "
              f"BIST 100 içinde {y(_al(ta, 'bist100', 'gercek_ort'))} (kilit oranı %{(_al(ta, 'bist100', 'kilitli_kalan') or 0) * 100:.0f}).", ""]  # fmt: skip
    if ha.get("hisse"):
        L += [f"**Halka arzlar.** Örneklemde işlem görmeye başlayan {ha['hisse']} pay ({', '.join(f'{k}: {v}' for k, v in ha.get('yillara_gore', {}).items())}). "
              f"Ortalama {s(ha.get('tavan_dizisi_ort'), 1)} günlük tavan serisi, seri boyunca ortalama {y(ha.get('dizi_getirisi_ort'), 0)}. Seri bittikten sonra alan için endekse göre getiri:", "",
              "| Ufuk | Ortalama | Medyan | Endeksi geçen pay oranı |", "| --- | --- | --- | --- |"]  # fmt: skip
        for k, ad in (("sonra_5g", "5 gün"), ("sonra_20g", "20 gün"), ("sonra_60g", "60 gün"), ("sonra_120g", "120 gün"), ("bugune", "Bugüne kadar")):
            d = ha.get(k, {})
            L.append(f"| {ad} | {y(d.get('ort'))} | {y(d.get('medyan'))} | %{(d.get('pozitif') or 0) * 100:.0f} |")
        L += ["", f"Halka açık değeri küçük olan arzlarda seri daha uzun ({s(_al(ha, 'halka_acik_deger_kucuk', 'tavan_dizisi'), 1)} güne karşı {s(_al(ha, 'halka_acik_deger_buyuk', 'tavan_dizisi'), 1)} gün). "
              "Kazanç dağıtımdan pay alana kalıyor; seri sonrası alanların çoğu endeksin gerisinde.", ""]  # fmt: skip
    ia = S.get("isaretli_akis", {})
    if ia:
        L += ["**Bir dürüstlük örneği: işaretli hacim.** Saatlik çubuklarda kapanışın çubuk içindeki yerinden bir alıcı/satıcı baskısı ölçüsü kuruldu. Ham sonuç çok güçlü görünüyor: "
              f"baskının en yüksek olduğu beşte birlik ertesi gece {y(_al(ia, 'ham', 'ertesi_gece', 'ust_alt'), 2)} daha fazla kazanıyor (t {tt(_al(ia, 'ham', 'ertesi_gece'))}). "
              f"Tavan ve tabanda kapanan hisseler çıkarılınca fark {y(_al(ia, 'tavan_taban_haric', 'ertesi_gece', 'ust_alt'), 2)} (t {tt(_al(ia, 'tavan_taban_haric', 'ertesi_gece'))}): etki, alınamayan hisselerden geliyordu. "
              f"Geriye kalan gerçek etki: BIST 100 dışında satış baskısı ertesi gün içinde de sürüyor (fark {y(_al(ia, 'bist100_disi', 'ertesi_gunici', 'ust_alt'), 2)}, t {tt(_al(ia, 'bist100_disi', 'ertesi_gunici'))}).", ""]  # fmt: skip

    # ---------------------------------------------------------------- 5. fonlar
    L += ["## 5. Fon şirketleri nasıl karar alıyor", ""]
    L += ["**Olay:** SPK 17 Eylül 2026'da yedi portföy yönetim şirketinin (Tera, Pusula, Hedef, Atlas, A1 Capital, Pardus, Bulls) TEFAS'taki fonlarını işleme kapattı ve bir kısmının tasfiyesine karar verdi; "
          "28 Ağustos 2026 tarihli fon rehberi serbest fonların bir şirketin fiili dolaşımındaki payına üst sınır getirdi (geçiş 31.12.2026). "
          "Kaynak: [Capital](https://www.capital.com.tr/piyasalar/borsa/spk-7-portfoy-yonetim-sirketinin-bazi-fonlarinin-tasfiyesine-karar-verdi), "
          "[Gazete Oksijen](https://gazeteoksijen.com/ekonomi/spkdan-7-portfoy-yonetim-sirketinin-fonlarina-tasfiye-karari-289771), "
          "[NTV](https://ntv.com.tr/turkiye/fon-sorusturmasi-spk-fonlarin-tasfiye-surecini-6-aya-cikardi-1742738). Kullanıcı kuralı gereği Tera grubu hisseleri bu analizde yoktur.", ""]  # fmt: skip
    if fon.get("olay"):
        ho = fon.get("hedef_ozellikleri_yuzdelik", {})
        ad2 = {"oynaklik_20g": "oynaklık", "momentum_120_20": "6 aylık momentum", "buyukluk": "piyasa değeri", "halka_acik_deger": "halka açık değer", "devir_hizi_20g": "devir hızı",
               "defter_piyasa": "defter/piyasa", "kazanc_verimi": "kazanç verimi", "halka_aciklik": "halka açıklık", "getiri_20g": "son 20 gün getirisi", "zirveye_yakinlik": "zirveye yakınlık"}  # fmt: skip
        L += [f"**Bildirim verilen hisselerin profili** ({fon['olay']} bildirim, {fon['hisse']} hisse; değer = hissenin o günkü kesitteki yüzdelik sırası, 0,50 tipik hisse): "
              + ", ".join(f"{ad2.get(k, k)} {s(v['medyan'])}" for k, v in sorted(ho.items(), key=lambda kv: -abs(kv[1]['medyan'] - 0.5))[:7])
              + ". Yani hedefler çok oynak, pahalı (defter değerine göre), son altı ayda yükselmiş, orta büyüklükte hisseler.", "",
              "| Bildirim | Önceki 20 gün | Bildirim günü | Sonraki 5 gün | Sonraki 20 gün | t | Medyan (20 gün) | Olay |", "| --- | --- | --- | --- | --- | --- | --- | --- |"]  # fmt: skip
        for yon, ad in (("alim", "Alım"), ("satim", "Satım")):
            d = fon.get(yon, {})
            L.append(f"| {ad} | {y(_al(d, 'once_20g', 'ort'))} | {y(_al(d, 'gun_0', 'ort'))} | {y(_al(d, 'sonra_5g', 'ort'))} | {y(_al(d, 'sonra_20g', 'ort'))} | {tt(d.get('sonra_20g'))} | {y(_al(d, 'sonra_20g', 'medyan'))} | {_al(d, 'sonra_20g', 'n')} |")
        L += ["", "Getiriler tüm hisse ortalamasına göredir. Alım bildirimi yükselişin ardından geliyor ve sonrası ortalamanın altında; satım bildiriminden sonra düşüş sürüyor.", "",
              "| Şirket | Bildirim (alım/satım) | Hedef: oynaklık | Halka açık değer | Defter/piyasa | Alım sonrası 20 gün | Satım sonrası 20 gün | Hisseler |", "| --- | --- | --- | --- | --- | --- | --- | --- |"]  # fmt: skip
        for ad, d in sorted(fon.get("sirket", {}).items(), key=lambda kv: -kv[1]["olay"]):
            om = d.get("ozellik_medyan", {})
            L.append(f"| {ad.replace(' Portföy Yönetimi', '')} | {d['alim']}/{d['satim']} | {s(om.get('oynaklik_20g'))} | {s(om.get('halka_acik_deger'))} | {s(om.get('defter_piyasa'))} | {y(d.get('alim_sonra_20g'), 0)} | "
                     f"{y(d.get('satim_sonra_20g'), 0)} | {', '.join(d['hisse'][:5])} |")  # fmt: skip
        L += [""]
    tas = S.get("tasfiye", {})
    if tas.get("donem"):
        L += [f"**Tasfiye edilen fonların bildirim verdiği {len(tas.get('hisseler', []))} hisse, diğer BIST 100 dışı hisselere karşı:**", "",
              "| Dönem | Fon hisseleri (ort.) | Medyan | Diğer küçük hisseler (ort.) | Medyan | Taban günü oranı (fon / diğer) |", "| --- | --- | --- | --- | --- | --- |"]  # fmt: skip
        for ad, d in tas["donem"].items():
            tg = d.get("tavan_taban_gun", {})
            L.append(f"| {ad} | {y(d.get('kume_ort'), 0)} | {y(d.get('kume_medyan'), 0)} | {y(d.get('kiyas_ort'), 0)} | {y(d.get('kiyas_medyan'), 0)} | "
                     f"%{tg.get('kume_taban', 0) / max(1, tg.get('kume_gun', 1)) * 100:.1f} / %{tg.get('kiyas_taban', 0) / max(1, tg.get('kiyas_gun', 1)) * 100:.1f} |".replace(".", ","))  # fmt: skip
        L += ["", "Ağustos 2026'da, karardan önce, bu hisseler zaten geride kalmaya ve tabana düşmeye başlamıştı; fonların satış bildirimleri de aynı aya denk geliyor. Erken işaret oradaydı.", ""]
    fs = None
    if arastirma and (arastirma / "fon_stratejileri.json").exists():
        try:
            fs = json.loads((arastirma / "fon_stratejileri.json").read_text(encoding="utf-8"))
        except Exception:  # noqa: BLE001
            fs = None
    if fs:
        sec = [x for x in fs.get("sirketler", []) if (x.get("guven") or 0) >= 0.3 and x.get("karar_olcutleri")]
        if sec:
            L += ["**Beyan edilen ve gözlenen karar ölçütleri** (araştırma ajanı; yalnız arama özetlerinden, güven sütunu düşükse temkinli okuyun):", "", "| Şirket | Tür | Baktığı ölçüler | Güven |", "| --- | --- | --- | --- |"]
            tur_ad = {"bagimsiz": "bağımsız", "banka_bagli": "banka bağlı", "araci_kurum_bagli": "aracı kurum bağlı", "holding_bagli": "holding bağlı", "katilim": "katılım"}
            L += [f"| {x['ad']} | {tur_ad.get(x.get('tur'), x.get('tur'))} | {'; '.join(x['karar_olcutleri'])[:170]} | {s(x.get('guven'))} |" for x in sec[:10]] + [""]
        L += ["İki tip ayrışıyor. **Yoğun pozisyon alanlar** (Pardus, Pusula, Hedef, Bulls, Atlas): az sayıda, oynak ve pahalı orta/küçük hissede sermayenin %10–33'üne varan paylar; fiyatı kendileri taşıyor, "
              "çıkarken ya da çıkmak zorunda kalınca hisse çöküyor. **Endeks ve tema izleyenler** (banka bağlı büyükler): BIST 30 ve teknoloji/tema endeksleri, eşik aşan pay yok, fiyat etkisi görünmüyor. "
              "Arada **seçici değer yöneticileri** (Marmara Capital, Azimut): %3–5 paylar, daha ucuz ve sakin hisseler.", ""]  # fmt: skip

    # ---------------------------------------------------------------- 6. kurallar
    L += ["## 6. Günlük kurallar: ne sınandı, ne çıktı", "",
          "Tüm testlerde: sinyal geçmiş veriden; tavanda kapanan alınmaz, tabanda kapanan satılamaz; likidite eşiği; gidiş-dönüş maliyet düşülür. "
          f"Yaklaşık {ST.get('deneme_sayisi', 60)} kural çeşidi denendi; Deflated Sharpe bu sayıya göre düzeltilmiş başarı olasılığıdır (0,95 üstü \"şansla açıklanamaz\" eşiği).", ""]  # fmt: skip
    if ST:
        L += ["### Sınanan alım kuralları", "", "| Kural | Brüt | Net (düşük maliyet) | Net (yüksek maliyet) | Sharpe (net, düşük) | En büyük düşüş | 1. / 2. yarı | Deflated Sharpe |", "| --- | --- | --- | --- | --- | --- | --- | --- |"]
        for k, ad in (("gece_bist100", "Gece taşıma, BIST 100 tümü (kapanışta al, açılışta sat)"), ("gece_bist100_gece20", "Gece taşıma, BIST 100'de gece getirisi en yüksek %20"),
                      ("gece_kucuk_gece20", "Gece taşıma, BIST 100 dışında gece getirisi en yüksek %20")):  # fmt: skip
            d = ST.get(k, {})
            if d:
                L.append(f"| {ad} | günlük {y(_al(d, 'brut', 'ort'), 2)} | yıllık {y(_al(d, 'net_10bp', 'yillik'), 0)} (10 bp) | yıllık {y(_al(d, 'net_30bp', 'yillik'), 0)} (30 bp) | {s(_al(d, 'net_10bp', 'sharpe'), 1)} | "
                         f"{y(_al(d, 'net_10bp', 'en_buyuk_dusus'), 0)} | {y(_al(d, 'brut', 'yari1_ort'), 2)} / {y(_al(d, 'brut', 'yari2_ort'), 2)} | {s(d.get('dsr_10bp'))} (brüt {s(d.get('dsr_brut'))}) |")  # fmt: skip
        bl = ST.get("bilesik", {})
        if bl:
            L.append(f"| Bileşik puan, BIST 100 dışı, 20 günde bir (en iyi %20) | dönem {y(_al(bl, 'brut', 'ort'))} | yıllık {y(_al(bl, 'net_30bp', 'yillik'), 0)} (30 bp) | yıllık {y(_al(bl, 'net_60bp', 'yillik'), 0)} (60 bp) | "
                     f"{s(_al(bl, 'net_30bp', 'sharpe'), 1)} | {y(_al(bl, 'net_30bp', 'en_buyuk_dusus'), 0)} | {y(_al(bl, 'net_30bp', 'yari1_ort'))} / {y(_al(bl, 'net_30bp', 'yari2_ort'))} | "
                     f"kıyasa göre {s(bl.get('dsr_fazla'))}, mutlak {s(bl.get('dsr_mutlak'))} |")  # fmt: skip
            rj = bl.get("rejimli", {})
            if rj:
                L.append(f"| Aynısı, küçük hisse etkeni son 20 günde artıdaysa (değilse nakit) | - | yıllık {y(rj.get('yillik'), 0)} (30 bp) | - | {s(rj.get('sharpe'), 1)} | {y(rj.get('en_buyuk_dusus'), 0)} | "
                         f"{y(rj.get('yari1_ort'))} / {y(rj.get('yari2_ort'))} | 5 süzgeçten seçildi |")  # fmt: skip
        bk = ST.get("bist100_kazanc", {})
        if bk:
            L.append(f"| Kazanç verimi en yüksek %20, BIST 100, 20 günde bir | dönem {y(_al(bk, 'brut', 'ort'))} | yıllık {y(_al(bk, 'net_20bp', 'yillik'), 0)} (20 bp) | yıllık {y(_al(bk, 'net_40bp', 'yillik'), 0)} (40 bp) | "
                     f"{s(_al(bk, 'net_20bp', 'sharpe'), 1)} | {y(_al(bk, 'net_20bp', 'en_buyuk_dusus'), 0)} | {y(_al(bk, 'net_20bp', 'yari1_ort'))} / {y(_al(bk, 'net_20bp', 'yari2_ort'))} | kıyası geçmiyor (t {tt(bk.get('net_20bp'), 'fazla_t')}) |")  # fmt: skip
        L += [""]
        g1 = ST.get("gece_bist100", {})
        if g1:
            yl = g1.get("yil", {})
            L += [f"- **Gece taşıma** istatistik olarak en sağlam etki (brüt Deflated Sharpe {s(g1.get('dsr_brut'))}); kârlılığı tamamen maliyete bağlı. Başabaş gidiş-dönüş maliyet {s((g1.get('basabas_maliyet') or 0) * 1e4, 0)} bp. "
                  "Yıllara göre brüt günlük getiri: " + ", ".join(f"{k} {y(v, 2)}" for k, v in yl.items()) + ". Etki azalıyor.",
                  f"- Kapanış ve açılış seanslarında (tek fiyat) işlem yapılırsa alım-satım farkı ödenmez; maliyet iki komisyona iner. Tek yön komisyon {s((g1.get('basabas_maliyet') or 0) * 1e4 / 2, 0)} bp'ye "
                  f"yaklaştıkça kâr sıfırlanır; 2026'nın brüt getirisiyle bu eşik {s((list(yl.values())[-1] if yl else 0) * 1e4 / 2, 0)} bp."]  # fmt: skip
        if bl:
            L += [f"- **Bileşik puan** ({', '.join(('+' if v > 0 else '−') + OZELLIK_AD.get(k, k).lower() for k, v in (bl.get('agirlik') or {}).items())}): alınabilir küçük hisse evrenini "
                  f"20 günde {y(_al(bl, 'net_30bp', 'fazla_ort'))} geçiyor (t {tt(bl.get('net_30bp'), 'fazla_t')}); örneklem dışı ikinci yarıda {y(_al(bl, 'ikinci_yari', 'net_30bp', 'fazla_ort'))} "
                  f"(t {tt(_al(bl, 'ikinci_yari', 'net_30bp'), 'fazla_t')}). Ama ikinci yarıda mutlak getirisi dönem başına {y(_al(bl, 'ikinci_yari', 'net_30bp', 'ort'))}: küçük hisseler topluca düşerken seçim zararı azaltıyor, kâra çevirmiyor."]  # fmt: skip
        L += [""]
        lt = ST.get("lider_takipci", {})
        kg, ig2 = ST.get("kotu_gece", {}), ST.get("iyi_gece", {})
        hp2 = ST.get("hacim_patlamasi", {})
        L += ["### Zamanlama ve kaçınma kuralları (kanıtı en güçlü olanlar)", "", "| Kural | Kanıt | Güven |", "| --- | --- | --- |"]
        if gg.get("bist30"):
            L.append(f"| Alımı kapanışa, satışı açılışa yakın yap; gün içinde beklemenin ödülü yok | Gece {y(gg['bist30']['gece'], 2)}, gün içi {y(gg['bist30']['gunici'], 2)} (BIST 30, günlük ort.); son yarım saat ve 11:30–14:30 negatif | Yüksek |")
        if tav:
            L.append(f"| Tavan serisi bozulan hisseyi elde tutma; tavan görüp ertesi sabah alma | Seri bozulunca sonraki 5 gün {y(_al(tav, 'dizi_bitince', 'sonraki_5g', 'ort'))} (t {tt(_al(tav, 'dizi_bitince', 'sonraki_5g'))}, {bn(_al(tav, 'dizi_bitince', 'n'))} olay) | Yüksek |")
        if ta.get("hepsi"):
            L.append(f"| Tabandaki hisseyi alma (BIST 100 dışı) | Gerçekleşebilir ortalama {y(_al(ta, 'bist100_disi', 'gercek_ort'))}; her 100 alımın {(_al(ta, 'bist100_disi', 'kilitli_kalan') or 0) * 100:.0f} tanesi o gün satılamıyor | Yüksek |")
        if hp2.get("bist100_disi"):
            d = hp2["bist100_disi"]
            L.append(f"| BIST 100 dışında hacmi 3 katına çıkan hisseyi alma; elindeyse çıkış düşün | Sonraki 5 gün {y(_al(d, 'sonraki_5g', 'ort'))} (t {tt(d.get('sonraki_5g'))}), 20 gün {y(_al(d, 'sonraki_20g', 'ort'))} ({bn(d.get('olay'))} olay); BIST 100'de etki yok | Yüksek |")
        if ha.get("hisse"):
            L.append(f"| Halka arzı tavan serisi bittikten sonra alma | 20 günde medyan {y(_al(ha, 'sonra_20g', 'medyan'))}, bugüne medyan {y(_al(ha, 'bugune', 'medyan'))} (endekse göre, {ha['hisse']} arz) | Yüksek |")
        if fon.get("satim"):
            L.append(f"| Fon şirketi satış bildirimi yaptıysa hisseden çık; yoğun fon payı olan hisseye girme | Satım bildirimi sonrası 20 gün {y(_al(fon, 'satim', 'sonra_20g', 'ort'), 0)} (t {tt(_al(fon, 'satim', 'sonra_20g'))}, {_al(fon, 'satim', 'sonra_20g', 'n')} olay; çoğu 2026) | Orta |")
        if kg.get("bist100"):
            L.append(f"| S&P vadelisi gece %0,5'ten fazla düştüyse o sabah alım yapma; satacaksan açılışta sat | O günlerde gün içi {y(_al(kg, 'bist100', 'brut', 'ort'), 2)} (BIST 100, {_al(kg, 'bist100', 'gun')} gün, t {tt(_al(kg, 'bist100', 'brut'))}); "
                     f"iyi gecelerde gün içi {y(_al(ig2, 'bist100', 'brut', 'ort'), 2)} | Orta |")  # fmt: skip
        if lt.get("bist100_disi"):
            a, b = lt["bist100_disi"].get("guclu_gun_sonrasi", {}), lt["bist100_disi"].get("zayif_gun_sonrasi", {})
            L.append(f"| Endeksin %1'den fazla düştüğü günün kapanışında küçük hisse alma; güçlü günün ertesinde satışta acele etme | Zayıf gün sonrası ertesi gün {y(_al(b, 'brut', 'ort'), 2)} (t {tt(b.get('brut'))}), güçlü gün sonrası {y(_al(a, 'brut', 'ort'), 2)} "
                     f"(t {tt(a.get('brut'))}); ikinci yarıda zayıfladı ({y(_al(a, 'brut', 'yari2_ort'), 2)}) | Orta |")  # fmt: skip
        L.append("| Madencilik hisselerinde gümüş/altın/bakırın gece hareketini, havacılıkta petrolü, savunmada jeopolitik gerilimi izle | Açılış boşluğu bu serilerle anlamlı; açılıştan sonra devam yok, yani bilgi alım için değil beklenti için | Orta |")
        L += [""]
        if bl.get("son_secim"):
            L += [f"**Bugünkü durum (yalnız tarama çıktısı, emir değildir).** Küçük hisse etkeni son 20 günde {'artıda: rejim süzgeci açık' if bl.get('rejim_acik_mi') else 'ekside: rejim süzgeci kapalı (kural nakit bekler)'}. "
                  "Bileşik puanı en yüksek 15 BIST 100 dışı hisse: " + ", ".join(bl["son_secim"]) + ".", ""]  # fmt: skip

    # ---------------------------------------------------------------- 7. KAP, yabancı, sektör, maden
    kap_bolumu = _kap_bolumu(S)
    L += kap_bolumu

    # ---------------------------------------------------------------- sınırlar
    kap_var = bool(S.get("kap_olay"))
    L += [f"## {8 if kap_bolumu else 7}. Sınırlar ve bilinmeyenler", "",
          "- **Hesap bazında yatırımcı verisi yok.** " + ("Yabancı payının güncel kesiti ve (çekilebildiği kadar) haftalık geçmişi var; " if S.get("yabanci_kesit") else "Yabancı payı geçmişi çekilemedi; ")
          + "fon fiyatları (TEFAS) çekilemedi. Büyük/küçük yatırımcı ayrımı hisse grubu üzerinden bir vekildir.",
          ("- **Fon bildirimleri** KAP listesinden alındı; bildirimin alım mı satım mı olduğu metinden ayrıştırılır ve her zaman kesin değildir. Şirket bazındaki sayılar küçük örneklemdir."
           if kap_var else "- **Fon bildirimleri** arama özetlerinden derlendi (87 kayıt; çoğu 2026). Şirket bazındaki sayılar küçük örneklemdir."),
          "- **Olay ortalaması ile sepet testi farklı sonuç verebilir.** Ortalama, birkaç hisseye ve kalabalık günlere fazla ağırlık verir; kurallar takvim zamanlı sepet testine göre sınıflandı.",
          "- **Dönem tek bir rejim içeriyor:** 2024–2025 yükselişi ve 2026 küçük hisse çöküşü. Üç yıllık veriyle mevsim ve yıl etkileri ayrıştırılamaz; uzun dönem mevsimsellik yalnız dört endeks ve madenler için var.",
          "- **Tavan/taban kilidi** fiyat verisinden (kapanış getirisi ≥ %9,5) tahmin edildi; gerçek emir defteri yok. Tek fiyat ya da brüt takas tedbirindeki hisseler ayrıca işaretlenmedi.",
          "- **Maliyet** varsayımdır. Düşük fiyatlı hisselerde tek fiyat adımı %0,3'ü bulabilir; Midas'ta gerçekleşen fiyat farklı olabilir.",
          "- **Çoklu deneme:** yüzlerce karşılaştırma yapıldı. Tablolardaki tek tek t değerleri bu yüzden iyimserdir; iki yarıda da aynı işareti taşıyan ve büyük örnekleme dayanan bulgulara ağırlık verildi.", ""]  # fmt: skip
    if S.get("hata"):
        L += ["Çalışmayan adımlar: " + "; ".join(f"{k}: {v}" for k, v in S["hata"].items()), ""]
    return "\n".join(L)


def rapor_yenile(cikti: str | Path, arastirma: str | Path | None, rapor_yolu: str | Path) -> str:
    """Kaydedilmiş JSON çıktılarından raporu yeniden üretir (analizi yeniden çalıştırmadan)."""
    cikti = Path(cikti)

    def oku(ad: str) -> dict:
        p = cikti / ad
        return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}

    oz = oku("ozet.json")
    ag = oku("agac.json")
    S: dict = {"veri": oz.get("veri", {}), "hata": oz.get("hata", {}), "agac": ag, "baglar": ag.get("en_guclu_baglar"), "zaman": oku("zaman.json"), "strateji": oku("strateji.json")}
    for dosya in ("oncu.json", "akis.json", "yatirimci.json"):
        S.update({k: v for k, v in oku(dosya).items() if v is not None})
    kp, yb = oku("kap.json"), oku("yabanci.json")
    S.update({"kap_veri": kp.get("veri"), "kap_olay": kp.get("olay"), "kap_fon": kp.get("fon"), "kap_kural": kp.get("kural"), "kap_arz": kp.get("arz"), "kap_esik": kp.get("esik"), "yabanci_kesit": yb.get("kesit"), "yabanci_gecmis": yb.get("gecmis"),
              "sektor_mevsim": oku("sektor_mevsim.json")})  # fmt: skip
    metin = rapor_yaz(S, Path(arastirma) if arastirma else None)
    Path(rapor_yolu).parent.mkdir(parents=True, exist_ok=True)
    Path(rapor_yolu).write_text(metin, encoding="utf-8")
    return metin

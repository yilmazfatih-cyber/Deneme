"""Kaynaktan bağımsız analiz hesapları: dönemler, katkı/sapma analizi, oran ayrıştırma, yerel huni, tutunma özeti.

Bu fonksiyonlar API'ye dokunmaz; Mixpanel yanıtı, CSV ya da sentetik veriyle aynı şekilde çalışır.
"""

from __future__ import annotations

import datetime as dt
import re
import statistics
from collections import defaultdict
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

from . import istatistik

DIGER = "(diğer)"
TANIMSIZ = "(tanımsız)"

# --- dönemler -------------------------------------------------------------------------------------

Aralik = Tuple[dt.date, dt.date]


def tarih(metin: str) -> dt.date:
    try:
        return dt.date.fromisoformat(metin.strip())
    except ValueError:
        raise ValueError(f"Tarih YYYY-AA-GG biçiminde olmalı: {metin!r}") from None


def aralik_coz(metin: str) -> Aralik:
    """'2026-11-01:2026-11-07' ya da tek gün '2026-11-01'."""
    if ":" in metin:
        bas, bit = metin.split(":", 1)
        a, b = tarih(bas), tarih(bit)
    else:
        a = b = tarih(metin)
    if b < a:
        raise ValueError(f"Aralığın sonu başından önce: {metin}")
    return a, b


def donem_coz(ifade: str, bugun: dt.date) -> Tuple[Aralik, Aralik, str]:
    """Güncel (A) ve kıyas (B) aralıkları + okunur etiket.

    gun  : dün vs bir hafta önceki aynı gün (haftanın günü etkisi elenir)
    hafta: son 7 tam gün vs önceki 7 gün
    Ng   : son N tam gün vs önceki N gün (ör. 28g)
    """
    ifade = (ifade or "gun").strip().lower()
    dun = bugun - dt.timedelta(days=1)
    if ifade in ("gun", "gün", "dun", "dün", "1g"):
        b = dun - dt.timedelta(days=7)
        return (dun, dun), (b, b), "dün vs geçen haftanın aynı günü"
    if ifade == "hafta":
        ifade = "7g"
    eslesme = re.fullmatch(r"(\d+)g", ifade)
    if not eslesme:
        raise ValueError("Dönem 'gun', 'hafta' ya da '28g' gibi olmalı.")
    n = int(eslesme.group(1))
    if n < 1:
        raise ValueError("Dönem en az 1 gün olmalı.")
    a = (dun - dt.timedelta(days=n - 1), dun)
    b = (a[0] - dt.timedelta(days=n), a[0] - dt.timedelta(days=1))
    return a, b, f"son {n} gün vs önceki {n} gün"


def aralik_metni(aralik: Aralik) -> str:
    a, b = aralik
    return a.isoformat() if a == b else f"{a.isoformat()} → {b.isoformat()}"


def gunler(aralik: Aralik) -> List[str]:
    a, b = aralik
    return [(a + dt.timedelta(days=i)).isoformat() for i in range((b - a).days + 1)]


def topla_aralik(seri: Dict[str, float], aralik: Aralik) -> float:
    """Günlük seriyi ({'2026-11-01': 12, ...}) bir aralık için toplar."""
    return float(sum(seri.get(g, 0) or 0 for g in gunler(aralik)))


# --- katkı ve sapma analizi -----------------------------------------------------------------------


def katki(
    a: Dict[str, float],
    b: Dict[str, float],
    a_toplam: Optional[float] = None,
    b_toplam: Optional[float] = None,
) -> Dict:
    """Bir boyutun segmentlerinde A (güncel) ve B (kıyas) değerleri → değişim, katkı, z, sapma z.

    a_toplam/b_toplam verilirse ilk N segment dışındaki kalan "(diğer)" satırı olarak eklenir.
    katki   : segment farkının toplam farka oranı (toplam fark 0 ise None)
    z       : segmentin kendi değişiminin kaba anlamlılığı
    sapma_z : segment genelle aynı oranda değişseydi beklenenden sapma (yerelleşmiş sorun göstergesi)
    """
    a = {k: float(v or 0) for k, v in a.items()}
    b = {k: float(v or 0) for k, v in b.items()}
    toplam_a = sum(a.values()) if a_toplam is None else float(a_toplam)
    toplam_b = sum(b.values()) if b_toplam is None else float(b_toplam)
    kalan_a = toplam_a - sum(a.values())
    kalan_b = toplam_b - sum(b.values())
    if a_toplam is not None and b_toplam is not None and (abs(kalan_a) > 0.5 or abs(kalan_b) > 0.5):
        a[DIGER] = a.get(DIGER, 0.0) + max(0.0, kalan_a)
        b[DIGER] = b.get(DIGER, 0.0) + max(0.0, kalan_b)
    fark_toplam = toplam_a - toplam_b
    satirlar = []
    for segment in set(a) | set(b):
        va, vb = a.get(segment, 0.0), b.get(segment, 0.0)
        fark = va - vb
        satirlar.append(
            {
                "segment": segment,
                "a": va,
                "b": vb,
                "fark": fark,
                "degisim": (fark / vb) if vb else None,
                "katki": (fark / fark_toplam) if fark_toplam else None,
                "z": istatistik.sayim_z(va, vb),
                "sapma_z": istatistik.sapma_z(va, vb, toplam_a, toplam_b),
            }
        )
    satirlar.sort(key=lambda s: (-abs(s["fark"]), s["segment"]))
    return {
        "a_toplam": toplam_a,
        "b_toplam": toplam_b,
        "fark": fark_toplam,
        "degisim": (fark_toplam / toplam_b) if toplam_b else None,
        "z": istatistik.sayim_z(toplam_a, toplam_b),
        "satirlar": satirlar,
    }


def oran_ayristir(
    pay_a: Dict[str, float],
    payda_a: Dict[str, float],
    pay_b: Dict[str, float],
    payda_b: Dict[str, float],
) -> Dict:
    """Oran metriği (pay/payda) değişimini segment karması ve segment içi oran etkisine ayırır.

    Segment başına (R_b = genel B oranı, w = payda payı, r = segment oranı):
      karma = (w_a - w_b) · (r_b - R_b)   → payı büyüyen segmentin oranı ortalamanın altındaysa negatif
      oran  = w_a · (r_a - r_b)           → segmentin kendi oranındaki değişim
    Σ(karma + oran) = R_a - R_b (Σ(w_a - w_b) = 0 olduğundan R_b terimi toplamda düşer).
    Yeni segmentte r_b yerine r_a, kaybolan segmentte r_a yerine r_b kullanılır (oran etkisi 0).
    """
    top_pay_a, top_payda_a = sum(pay_a.values()), sum(payda_a.values())
    top_pay_b, top_payda_b = sum(pay_b.values()), sum(payda_b.values())
    oran_a = top_pay_a / top_payda_a if top_payda_a else None
    oran_b = top_pay_b / top_payda_b if top_payda_b else None
    referans = oran_b or 0.0
    satirlar = []
    for segment in set(payda_a) | set(payda_b):
        na, nb = float(payda_a.get(segment, 0)), float(payda_b.get(segment, 0))
        xa, xb = float(pay_a.get(segment, 0)), float(pay_b.get(segment, 0))
        wa = na / top_payda_a if top_payda_a else 0.0
        wb = nb / top_payda_b if top_payda_b else 0.0
        ra = xa / na if na else None
        rb = xb / nb if nb else None
        seviye = rb if rb is not None else (ra if ra is not None else referans)
        karma = (wa - wb) * (seviye - referans)
        oran_etkisi = wa * (ra - rb) if ra is not None and rb is not None else 0.0
        z = None
        if ra is not None and rb is not None and xa <= na and xb <= nb:
            z = istatistik.iki_oran_testi(int(xb), int(nb), int(xa), int(na))["z"]
        satirlar.append(
            {
                "segment": segment,
                "payda_a": na,
                "payda_b": nb,
                "pay_a": wa,
                "pay_b": wb,
                "oran_a": ra,
                "oran_b": rb,
                "karma": karma,
                "oran_etkisi": oran_etkisi,
                "toplam_etki": karma + oran_etkisi,
                "z": z,
            }
        )
    satirlar.sort(key=lambda s: (-abs(s["toplam_etki"]), s["segment"]))
    z_genel = None
    if oran_a is not None and oran_b is not None and top_pay_a <= top_payda_a and top_pay_b <= top_payda_b:
        z_genel = istatistik.iki_oran_testi(int(top_pay_b), int(top_payda_b), int(top_pay_a), int(top_payda_a))["z"]
    return {
        "oran_a": oran_a,
        "oran_b": oran_b,
        "fark": (oran_a - oran_b) if oran_a is not None and oran_b is not None else None,
        "z": z_genel,
        "karma_toplam": sum(s["karma"] for s in satirlar),
        "oran_toplam": sum(s["oran_etkisi"] for s in satirlar),
        "satirlar": satirlar,
    }


# --- yerel huni (ham olaylardan) ------------------------------------------------------------------


def huni_hesapla(
    olaylar: Iterable[Tuple[str, str, float, Optional[str]]],
    adimlar: Sequence[str],
    pencere_sn: float,
    giris_bas: float,
    giris_bit: float,
) -> Dict:
    """Sıralı huni (Mixpanel'in tekil kullanıcı mantığına yakın).

    olaylar   : (kullanıcı, olay_adı, zaman_sn, kırılım_değeri) — kırılım yalnız 1. adım olayında anlamlı
    pencere_sn: dönüşüm penceresi, 1. adımdan itibaren
    giris_*   : 1. adımın sayılacağı zaman aralığı (sonraki adımlar aralık bitiminden sonra da olabilir)

    Her kullanıcıda aralıktaki her 1. adım bir deneme başlatır; en ileri giden deneme sayılır. Bir adıma
    ulaşan denemeler içinde en geç başlayanı tutmak, pencere içinde ilerleme şansını en yüksek yapar (O(n)).
    """
    k = len(adimlar)
    if k < 2:
        raise ValueError("Huni en az 2 adım ister.")
    indeks: Dict[str, List[int]] = defaultdict(list)
    for i, ad in enumerate(adimlar):
        indeks[ad].append(i)
    kullanici_olaylari: Dict[str, List[Tuple[float, str, Optional[str]]]] = defaultdict(list)
    for kullanici, olay, zaman, kirilim in olaylar:
        if olay in indeks:
            kullanici_olaylari[kullanici].append((zaman, olay, kirilim))

    toplam = [0] * k
    segmentler: Dict[str, List[int]] = defaultdict(lambda: [0] * k)
    sureler: List[List[float]] = [[] for _ in range(k)]
    for liste in kullanici_olaylari.values():
        liste.sort(key=lambda o: o[0])
        en_iyi: List[Optional[Tuple[float, Optional[str]]]] = [None] * k
        ilk_ulasma: List[Optional[float]] = [None] * k
        for zaman, olay, kirilim in liste:
            for i in reversed(indeks[olay]):
                if i == 0:
                    if giris_bas <= zaman <= giris_bit:
                        en_iyi[0] = (zaman, kirilim)
                        if ilk_ulasma[0] is None:
                            ilk_ulasma[0] = 0.0
                    continue
                onceki = en_iyi[i - 1]
                if onceki is None or zaman - onceki[0] > pencere_sn:
                    continue
                if en_iyi[i] is None or onceki[0] > en_iyi[i][0]:
                    en_iyi[i] = onceki
                if ilk_ulasma[i] is None:
                    ilk_ulasma[i] = zaman - onceki[0]
            if en_iyi[k - 1] is not None:
                break
        derinlik = max((i + 1 for i in range(k) if en_iyi[i] is not None), default=0)
        if derinlik == 0:
            continue
        kirilim = en_iyi[derinlik - 1][1]
        segment = TANIMSIZ if kirilim in (None, "") else str(kirilim)
        for i in range(derinlik):
            toplam[i] += 1
            segmentler[segment][i] += 1
            if ilk_ulasma[i] is not None and i > 0:
                sureler[i].append(ilk_ulasma[i])
    return {
        "adimlar": list(adimlar),
        "toplam": toplam,
        "segmentler": dict(segmentler),
        "medyan_sure": [statistics.median(s) if s else None for s in sureler],
    }


def huni_satirlari(sayilar: Sequence[float]) -> List[Dict]:
    """Adım sayılarından adım/toplam dönüşüm ve kayıp."""
    satirlar = []
    for i, n in enumerate(sayilar):
        onceki = sayilar[i - 1] if i else None
        satirlar.append(
            {
                "n": n,
                "adim_donusum": (n / onceki) if onceki else None,
                "toplam_donusum": (n / sayilar[0]) if sayilar[0] else None,
                "kayip": (onceki - n) if onceki is not None else None,
            }
        )
    return satirlar


# --- tutunma --------------------------------------------------------------------------------------


def tutunma_ozet(kohortlar: Dict[str, Dict]) -> Dict:
    """Kohort tablosundan ağırlıklı ortalama tutunma eğrisi.

    kohortlar: {'2026-10-05': {'first': 1200, 'counts': [c0, c1, ...]}, ...}
    Bir aralığa henüz ulaşmamış (counts dizisi kısa) kohortlar o aralığın ortalamasına girmez.
    """
    uzunluk = max((len(v.get("counts") or []) for v in kohortlar.values()), default=0)
    pay = [0.0] * uzunluk
    payda = [0.0] * uzunluk
    for v in kohortlar.values():
        ilk = float(v.get("first") or 0)
        if ilk <= 0:
            continue
        for i, c in enumerate(v.get("counts") or []):
            if c is None:
                continue
            pay[i] += float(c)
            payda[i] += ilk
    return {
        "ortalama": [(pay[i] / payda[i]) if payda[i] else None for i in range(uzunluk)],
        "kohort_sayisi": [sum(1 for v in kohortlar.values() if len(v.get("counts") or []) > i) for i in range(uzunluk)],
        "toplam_kullanici": sum(float(v.get("first") or 0) for v in kohortlar.values()),
    }

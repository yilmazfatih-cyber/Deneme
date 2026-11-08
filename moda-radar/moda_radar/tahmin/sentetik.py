"""Sentetik sinyal + gözlem üretici. GERÇEK VERİ DEĞİLDİR; yalnız yöntemin mekaniğini sınamak içindir.

Üretim süreci (bilinen doğru):
- Her podyum sezonunda ``giris_sayisi`` yeni renk girer; yaşam eğrisi giriş (0,4·tepe) → yükseliş (tepe) → çıkış
  (0,5·tepe), tepe payı log-normal (medyan %6). Marka sayısı payla orantılı, gürültülü.
- ``kalici_sayisi`` temel renk her sezon düşük podyum payıyla görünür ve segment rafında sürekli durur.
- Yeni renk, her podyum sezonundan ``gecikme_sezon`` sonra (± 15 gün) segment rafına düşer. Raf payı
  ``eşik · exp(0,5 · z)``, ``z`` = sürüm 0 podyum ve yön terimleri + değerin segment yatkınlığı ``a ~ N(0, yatkinlik)``
  (her sezon aynı; raf payının kalıcılığı) + lojistik gürültü.

Model aynı fonksiyonel biçimi kullandığından bu veri modelin *doğru kurulduğunu* sınar, gerçek dünyadaki
isabetini değil. Gerçek karne gerçek veriyle ayrı yazılır.
"""

from __future__ import annotations

import math
import random
from datetime import timedelta

from moda_radar.sema import GozlemKaydi, SinyalKaydi, Yon
from moda_radar.tahmin import model as md
from moda_radar.tahmin import sezon as sz

VARSAYILAN_SEZONLAR = ("SS23", "FW23", "SS24", "FW24")
EGRI = ((0.4, Yon.GIRIS), (1.0, Yon.YUKSELIS), (0.5, Yon.CIKIS))


def _lojistik(r: random.Random) -> float:
    u = min(max(r.random(), 1e-9), 1 - 1e-9)
    return math.log(u / (1 - u))


def _podyum_logit(pay: float, marka: int, yon: Yon) -> float:
    return (
        md.K_PAY * (math.log1p(100 * pay) - math.log1p(100 * md.PAY_REF))
        + md.K_MARKA * (math.log1p(marka) - math.log1p(md.MARKA_REF))
        + md.YON_ETKISI[yon]
    )


def uret(
    sezonlar=VARSAYILAN_SEZONLAR,
    segment: str = "orta",
    gecikme_sezon: float = 3.0,
    kategori: str = "kadin-ust",
    ulke: str = "TR",
    giris_sayisi: int = 12,
    kalici_sayisi: int = 8,
    esik: float = md.ESIK_RAF_PAYI,
    yatkinlik: float = 0.7,
    tohum: int = 7,
) -> tuple[list[SinyalKaydi], list[GozlemKaydi]]:
    """``(sinyaller, gozlemler)`` üretir; aynı tohum aynı veriyi verir."""
    r = random.Random(tohum)
    sezonlar = sz.sirala(sezonlar)
    sinyaller: list[SinyalKaydi] = []
    gozlemler: list[GozlemKaydi] = []

    def sinyal(sezon, deger, pay, marka):
        sinyaller.append(
            SinyalKaydi(
                sezon=sezon,
                nitelik_ekseni="renk",
                nitelik_degeri=deger,
                podyum_payi=round(min(pay, 1.0), 5),
                marka_sayisi=marka,
                kaynak_turu="gorsel",
                kaynak_url=f"sentetik://podyum/{sezon}/{deger}",
                kaynak_tarihi=sz.defile_tarihi(sezon) + timedelta(days=10),
                guven=0.8,
            )
        )

    def gozlem(deger, ilk, son, raf, url):
        gozlemler.append(
            GozlemKaydi(
                ulke=ulke,
                segment=segment,
                marka="sentetik-marka",
                kategori=kategori,
                nitelik_ekseni="renk",
                nitelik_degeri=deger,
                ilk_gorulme=ilk,
                son_gorulme=son,
                urun_sayisi=max(1, round(raf * 400)),
                raf_payi=round(raf, 5),
                kaynak_url=url,
                kaynak_turu="site",
            )
        )

    sira = 0
    for i_giris, giris_sezonu in enumerate(sezonlar):
        for _ in range(giris_sayisi):
            deger = f"13-{1000 + sira:04d} TCX"
            sira += 1
            tepe = min(max(math.exp(r.gauss(math.log(0.06), 0.6)), 0.005), 0.3)
            a = r.gauss(0, yatkinlik)
            for faz, (carpan, yon) in enumerate(EGRI):
                if i_giris + faz >= len(sezonlar):
                    break
                sezon = sezonlar[i_giris + faz]
                pay = tepe * carpan
                marka = max(1, round(pay * 150 * r.uniform(0.6, 1.4)))
                sinyal(sezon, deger, pay, marka)
                z = _podyum_logit(pay, marka, yon) + a + _lojistik(r)
                raf = min(max(esik * math.exp(0.5 * z), 0.001), 0.3)
                ilk = sz.raf_tarihi(sezon, gecikme_sezon) + timedelta(days=round(r.gauss(0, 15)))
                son = ilk + timedelta(days=round(r.uniform(100, 140)))
                gozlem(deger, ilk, son, raf, f"sentetik://raf/{segment}/{sezon}/{deger}")

    ilk_raf = sz.ufuk_sezonu(sezonlar[0], 0)
    son_raf = sz.ekle(sz.ufuk_sezonu(sezonlar[-1], gecikme_sezon), 1)
    raf_sezonlari = [sz.ekle(ilk_raf, i) for i in range(-1, sz.fark(ilk_raf, son_raf) + 1)]
    for k in range(kalici_sayisi):
        deger = f"19-{4000 + k:04d} TCX"
        temel_raf = r.uniform(0.01, 0.10)
        temel_pay = r.uniform(0.01, 0.04)
        for sezon in sezonlar:
            sinyal(sezon, deger, temel_pay * r.uniform(0.92, 1.08), r.randint(3, 8))
        for rs in raf_sezonlari:
            bas, bit = sz.raf_penceresi(rs)
            gozlem(
                deger,
                bas + timedelta(days=r.randint(0, 20)),
                bit - timedelta(days=r.randint(0, 20)),
                min(temel_raf * math.exp(r.gauss(0, 0.15)), 0.3),
                f"sentetik://raf/{segment}/{rs}/{deger}",
            )
    return sinyaller, gozlemler

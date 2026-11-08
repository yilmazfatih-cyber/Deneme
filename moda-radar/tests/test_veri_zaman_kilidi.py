from datetime import date

import pytest

from moda_radar.sema import Kaynak, KaynakTuru, NitelikKaydi, SinyalKaydi
from moda_radar.veri.depo import Depo
from moda_radar.veri.zaman_kilidi import KilitDelinmesi, kilitle

KILIT = date(2026, 9, 30)


def _nitelik(url, t):
    k = Kaynak(tur=KaynakTuru.PODYUM, url=url, tarama_tarihi=t, sezon="SS27", marka="Prada")
    return NitelikKaydi(
        kaynak=k, parca_id="p", kategori="kadin-ust", parca_konumu="ust", siluet="oversize", etiketleyen_model="m"
    )


@pytest.fixture
def depo(tmp_path):
    with Depo(tmp_path / "moda.db") as d:
        d.ekle_parca_nitelik([_nitelik("https://a/once.jpg", date(2026, 9, 20))])
        d.ekle_parca_nitelik([_nitelik("https://a/sonra.jpg", date(2026, 10, 5))])
        d.ekle_sinyaller(
            [
                SinyalKaydi(
                    sezon="SS27",
                    nitelik_ekseni="desen",
                    nitelik_degeri=f"d{i}",
                    podyum_payi=0.1,
                    marka_sayisi=1,
                    kaynak_turu="rapor",
                    kaynak_url=f"https://r/{i}",
                    kaynak_tarihi=t,
                )
                for i, t in enumerate((date(2026, 9, 30), date(2026, 10, 1)))
            ]
        )
        k = {"segment": "orta", "marka": "LCW", "kategori": "kadin-ust"}
        u1 = d.upsert_perakende_urun(**k, url="https://lcw/1", tarih=date(2026, 9, 1))
        d.upsert_perakende_urun(**k, url="https://lcw/1", tarih=date(2026, 11, 1))  # kilitten sonra
        u2 = d.upsert_perakende_urun(**k, url="https://lcw/2", tarih=date(2026, 10, 15))  # yalnız kilitten sonra
        for uid, url, t in ((u1, "https://lcw/1", date(2026, 9, 1)), (u2, "https://lcw/2", date(2026, 10, 15))):
            kk = Kaynak(tur=KaynakTuru.PERAKENDE, url=url, tarama_tarihi=t, sezon="FW26", segment="orta")
            d.ekle_perakende_nitelik(
                uid,
                [
                    NitelikKaydi(
                        kaynak=kk,
                        parca_id="p",
                        kategori="kadin-ust",
                        parca_konumu="ust",
                        siluet="oversize",
                        etiketleyen_model="m",
                    )
                ],
            )
        yield d


def test_kilitten_sonraki_podyum_kaydi_gorunmez(depo):
    acik = {(s.nitelik_ekseni, s.nitelik_degeri): s for s in depo.sinyaller("SS27")}
    assert acik[("siluet", "oversize")].podyum_payi == 1.0
    assert acik[("siluet", "oversize")].not_ == "2/2 parça"
    kilitli = kilitle(depo, KILIT).sinyaller("SS27")
    gorulen = {(s.nitelik_ekseni, s.nitelik_degeri): s for s in kilitli}
    assert gorulen[("siluet", "oversize")].not_ == "1/1 parça"  # 5 Ekim taraması sayılmadı
    assert ("desen", "d0") in gorulen and ("desen", "d1") not in gorulen
    assert all(s.kaynak_tarihi <= KILIT for s in kilitli)


def test_kilitten_sonraki_raf_gorulmesi_gorunmez(depo):
    acik = depo.gozlemler("TR", "orta", "kadin-ust")
    assert acik[0].urun_sayisi == 2 and acik[0].son_gorulme == date(2026, 11, 1)
    kilitli = kilitle(depo, KILIT).gozlemler("TR", "orta", "kadin-ust")
    assert len(kilitli) == 1
    g = kilitli[0]
    assert (g.urun_sayisi, g.ilk_gorulme, g.son_gorulme, g.raf_payi) == (1, date(2026, 9, 1), date(2026, 9, 1), 1.0)


def test_kilitli_depo_salt_okunur(depo):
    k = kilitle(depo, KILIT)
    with pytest.raises(KilitDelinmesi):
        k.baglanti  # noqa: B018
    with pytest.raises(KilitDelinmesi):
        k.ekle_sinyaller([])
    with pytest.raises(KilitDelinmesi):
        k.tarih = date(2030, 1, 1)


def test_kilit_once_tum_veriden_bos(depo):
    k = kilitle(depo, date(2020, 1, 1))
    assert k.sinyaller() == [] and k.gozlemler() == []

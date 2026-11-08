import sqlite3
from datetime import date

import pytest

from moda_radar.sema import (
    DefileTanimi,
    GozlemKaydi,
    Kaynak,
    KaynakTuru,
    Lab,
    NitelikKaydi,
    PantoneEslesme,
    RenkKaydi,
    SinyalKaydi,
)
from moda_radar.veri.depo import TABLOLAR, Depo


def kaynak(url, t=date(2026, 10, 1), tur=KaynakTuru.PODYUM, sezon="SS27", marka="Prada", segment=None):
    return Kaynak(tur=tur, url=url, tarama_tarihi=t, sezon=sezon, marka=marka, segment=segment)


def nitelik(url, parca="p1", **eksen):
    return NitelikKaydi(
        kaynak=eksen.pop("kaynak", None) or kaynak(url),
        parca_id=parca,
        kategori="kadin-ust",
        parca_konumu="ust",
        etiketleyen_model="test-model",
        **eksen,
    )


def renk(url, kod="17-1564 TCX", rol="baskin", parca="p1", k=None):
    return RenkKaydi(
        kaynak=k or kaynak(url),
        parca_id=parca,
        rol=rol,
        pay=0.6,
        lab=Lab(L=50, a=40, b=30),
        hex="#c04a30",
        pantone=PantoneEslesme(kod=kod, hex="#C04A30", delta_e=1.2),
    )


@pytest.fixture
def depo(tmp_path):
    with Depo(tmp_path / "moda.db") as d:
        yield d


def test_tablolar_kurulur(depo):
    adlar = {r[0] for r in depo.baglanti.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert set(TABLOLAR) <= adlar
    assert depo.butunluk()


def test_gorsel_bayti_icin_sutun_yok(depo):
    sutunlar = {r[1] for r in depo.baglanti.execute("PRAGMA table_info(gorsel)")}
    assert sutunlar == {"id", "defile_id", "url", "tarama_tarihi", "sira"}  # ADR-002: blob yok


def test_defile_ve_gorsel_tekil(depo):
    d = DefileTanimi(sezon="SS27", marka="Prada", sehir="Milano", kaynak="vogue", kaynak_kimligi="x/prada")
    did = depo.ekle_defile(d)
    assert depo.ekle_defile(d) == did
    g1 = depo.ekle_gorsel(did, "https://a/1.jpg", date(2026, 10, 1), 1)
    assert depo.ekle_gorsel(did, "https://a/1.jpg", date(2026, 10, 2), 1) == g1
    assert depo.ozet()["satir"]["gorsel"] == 1


def test_sinyaller_parca_sayimindan(depo):
    depo.ekle_parca_nitelik(
        [
            nitelik("https://a/1.jpg", siluet="oversize", kumas_gorunumu="keten"),
            nitelik("https://a/2.jpg", siluet="oversize", kaynak=kaynak("https://a/2.jpg", marka="Gucci")),
            nitelik("https://a/3.jpg", siluet="dar"),
            nitelik("https://a/4.jpg"),  # hepsi bilinmiyor: paydada sayılır, payda sayılmaz
        ]
    )
    depo.ekle_parca_renk([renk("https://a/1.jpg"), renk("https://a/2.jpg", kod="19-4052 TCX")])
    depo.ekle_parca_renk([renk("https://a/1.jpg", kod="11-0601 TCX", rol="vurgu")])
    s = {(x.nitelik_ekseni, x.nitelik_degeri): x for x in depo.sinyaller("SS27")}
    assert s[("siluet", "oversize")].podyum_payi == 0.5
    assert s[("siluet", "oversize")].marka_sayisi == 2
    assert s[("siluet", "dar")].podyum_payi == 0.25
    assert s[("renk", "17-1564 TCX")].podyum_payi == 0.5
    assert ("renk", "11-0601 TCX") not in s  # vurgu sayılmaz
    assert ("siluet", "bilinmiyor") not in s
    assert all(x.kaynak_turu == "gorsel" for x in s.values())
    assert depo.sinyaller("FW26") == []
    satirlar = depo.parca_renkleri("SS27")
    assert len(satirlar) == 3 and {"marka", "pay", "lab_L", "lab_a", "lab_b", "hex"} <= set(satirlar[0])


def test_ekle_sinyaller_ve_gozlemler(depo):
    s = SinyalKaydi(
        sezon="SS27",
        nitelik_ekseni="desen",
        nitelik_degeri="cizgili",
        podyum_payi=0.1,
        marka_sayisi=4,
        kaynak_turu="rapor",
        kaynak_url="https://r/1",
        kaynak_tarihi=date(2026, 10, 9),
    )
    assert depo.ekle_sinyaller([s, s]) == 2
    assert [x for x in depo.sinyaller() if x.kaynak_turu == "rapor"] == [s]
    g = GozlemKaydi(
        segment="orta",
        marka="LCW",
        kategori="kadin-ust",
        nitelik_ekseni="desen",
        nitelik_degeri="cizgili",
        ilk_gorulme=date(2027, 3, 1),
        son_gorulme=date(2027, 5, 1),
        urun_sayisi=3,
        kaynak_url="https://saha/1",
        kaynak_turu="saha",
    )
    depo.ekle_gozlemler([g])
    assert depo.gozlemler("TR", "orta") == [g]
    assert depo.gozlemler("TR", "luks") == []


def test_upsert_ilk_gorulme_korunur(depo):
    a = {"segment": "orta", "marka": "LCW", "kategori": "kadin-ust", "url": "https://lcw/u1", "baslik": "Gömlek"}
    uid = depo.upsert_perakende_urun(**a, tarih=date(2027, 3, 1), fiyat=500)
    assert depo.upsert_perakende_urun(**a, tarih=date(2027, 3, 8), fiyat=450, indirim_yuzde=10) == uid
    depo.upsert_perakende_urun(**a, tarih=date(2027, 2, 20))  # geç gelen eski tarama da doğru işlenir
    r = depo.baglanti.execute("SELECT * FROM perakende_urun WHERE id=?", (uid,)).fetchone()
    assert (r["ilk_gorulme"], r["son_gorulme"], r["fiyat"], r["aktif"]) == ("2027-02-20", "2027-03-08", 450, 1)
    assert depo.ozet()["satir"]["perakende_gorulme"] == 3
    assert depo.pasiflestir("orta", "LCW", "kadin-ust", []) == 1


def test_gozlemler_perakendeden_raf_payi(depo):
    k = {"segment": "orta", "marka": "LCW", "kategori": "kadin-ust"}
    u1 = depo.upsert_perakende_urun(**k, url="https://lcw/1", tarih=date(2027, 3, 1))
    depo.upsert_perakende_urun(**k, url="https://lcw/1", tarih=date(2027, 4, 1))
    u2 = depo.upsert_perakende_urun(**k, url="https://lcw/2", tarih=date(2027, 3, 15))
    depo.upsert_perakende_urun(**k, url="https://lcw/3", tarih=date(2027, 3, 15))
    pk = kaynak("https://lcw/1", tur=KaynakTuru.PERAKENDE, segment="orta", marka="LCW")
    depo.ekle_perakende_renk(u1, [renk("https://lcw/1", k=pk)])
    depo.ekle_perakende_renk(u2, [renk("https://lcw/2", k=pk.model_copy(update={"url": "https://lcw/2"}))])
    depo.ekle_perakende_nitelik(u2, [nitelik("https://lcw/2", siluet="oversize", kaynak=pk)])
    g = {(x.nitelik_ekseni, x.nitelik_degeri): x for x in depo.gozlemler("TR", "orta", "kadin-ust")}
    r = g[("renk", "17-1564 TCX")]
    assert (r.ilk_gorulme, r.son_gorulme, r.urun_sayisi) == (date(2027, 3, 1), date(2027, 4, 1), 2)
    assert r.raf_payi == pytest.approx(2 / 3)
    assert r.kaynak_url == "https://lcw/1"
    assert g[("siluet", "oversize")].urun_sayisi == 1


def test_bos_liste_yazimi_guvenli(depo):
    assert depo.ekle_parca_nitelik([]) == 0
    assert depo.ekle_parca_renk([]) == 0


def test_yazim_hatasi_transaction_geri_alinir(depo):
    iyi = SinyalKaydi(
        sezon="SS27",
        nitelik_ekseni="desen",
        nitelik_degeri="duz",
        podyum_payi=0.1,
        marka_sayisi=1,
        kaynak_turu="rapor",
        kaynak_url="https://r/1",
        kaynak_tarihi=date(2026, 10, 1),
    )
    bozuk = iyi.model_copy(update={"kaynak_url": "https://r/2", "podyum_payi": None})  # NOT NULL ihlali
    with pytest.raises(sqlite3.IntegrityError):
        depo.ekle_sinyaller([iyi, bozuk])
    assert depo.ozet()["satir"]["sinyal"] == 0  # ilk satır da geri alındı
    assert depo.butunluk()


def test_ozet(depo):
    d = DefileTanimi(sezon="FW26", marka="Gucci", sehir="Milano", kaynak="vogue", kaynak_kimligi="y/gucci")
    depo.ekle_gorsel(depo.ekle_defile(d), "https://a/x.jpg", date(2026, 3, 1), 1)
    depo.upsert_perakende_urun(segment="luks", marka="Beymen", kategori="kadin-ust", url="u", tarih=date(2026, 3, 1))
    o = depo.ozet()
    assert o["satir"]["defile"] == 1
    assert o["sezon"]["gorsel"] == {"FW26": 1}
    assert o["segment"]["perakende_urun"] == {"luks": 1}

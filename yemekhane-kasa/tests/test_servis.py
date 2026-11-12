"""Servis döngüsünün davranışı: kareler doğrudan `adim`a, yapay zamanla verilir (0,3 sn'de bir yoklama)."""

import json
from datetime import datetime
from itertools import pairwise

import pytest

from tests.conftest import BOS, BosKaynak, EtiketliTaniyici, KayitliPos, ayarlar_olustur, oynat, sonuc
from yemekhane_kasa.cli import _SahteSaat
from yemekhane_kasa.demo import demo_calistir
from yemekhane_kasa.servis import servis_olustur
from yemekhane_kasa.tanima import TanimaSonucu

TEPSI = ("mercimek_corbasi", "kuru_fasulye", "pirinc_pilavi", "ayran")
SONUCLAR = {
    "bos": BOS,
    "A": sonuc(*TEPSI),
    "A_isik": sonuc(*TEPSI),
    "A_tatli": sonuc(*TEPSI, "sutlac"),
    "B": sonuc(*TEPSI),
    "C": sonuc("kuru_fasulye", "sutlac"),
}


def _servis(tmp_path, pos=None, taniyici=None, ayar=None):
    ayarlar = ayarlar_olustur(tmp_path, **(ayar or {}))
    saat = iter(range(10_000))
    return servis_olustur(
        ayarlar,
        kaynak=BosKaynak(),
        taniyici=taniyici or EtiketliTaniyici(SONUCLAR),
        pos=pos or KayitliPos(),
        simdi=lambda: datetime(2026, 11, 12, 12, 0, next(saat) % 60).astimezone(),
    )


def test_tam_akis_cift_ucret_yok_revizyon_ve_ikinci_musteri(tmp_path):
    pos, taniyici = KayitliPos(), EtiketliTaniyici(SONUCLAR)
    servis = _servis(tmp_path, pos, taniyici)
    oynat(servis, [("bos", 3), ("A", 9), ("A_isik", 6), ("A_tatli", 6), ("bos", 3), ("B", 6), ("bos", 3)])

    assert [(m["islem"], m["revizyon"], m["toplam_kurus"]) for m in pos.mesajlar] == [
        ("yeni", 1, 23500),  # 260 TL − 25 TL fiks menü
        ("guncelle", 2, 29000),  # + sütlaç
        ("yeni", 1, 23500),  # aynı yemekler, yeni müşteri
    ]
    assert pos.mesajlar[0]["siparis_no"] == pos.mesajlar[1]["siparis_no"] != pos.mesajlar[2]["siparis_no"]
    # Yapay zekâ yalnız boş tezgâhı öğrenmek, yeni tepsi ve değişen tepsi için çağrıldı; bekleyen tepsi ve ışık
    # değişimi çağrı yapmadı (9 + 6 sn boyunca 3,5 sn'de bir çekim yapıldığı hâlde)
    assert taniyici.cagrilar == ["bos", "A", "A_tatli", "B"]
    assert servis.sayac["cekim"] > len(taniyici.cagrilar)

    gun = next((tmp_path / "kayitlar").iterdir())
    olaylar = [json.loads(s) for s in (gun / "olaylar.jsonl").read_text(encoding="utf-8").splitlines()]
    assert [o["olay"] for o in olaylar].count("tanima") == 4
    assert [o["siparis_no"] for o in olaylar if o["olay"] == "tepsi_gitti"] == [
        pos.mesajlar[0]["siparis_no"],
        pos.mesajlar[2]["siparis_no"],
    ]
    assert sorted(p.suffix for p in gun.iterdir()).count(".jpg") == 3  # her gönderimin tepsi görüntüsü
    assert (tmp_path / "kalibrasyon" / "arka_plan.json").is_file()  # öğrenilen boş tezgâh kaydedildi


def test_yeni_tepsi_bosluktan_sonra_hemen_taninir(tmp_path):
    pos = KayitliPos()
    servis = _servis(tmp_path, pos)
    an = oynat(servis, [("bos", 1.2)])
    oynat(servis, [("A", 0.9)], baslangic=an)  # tepsi gelir gelmez, bir sonraki sabit yoklamada
    assert len(pos.mesajlar) == 1


def test_hareketli_tepside_cekim_ertelenir(tmp_path):
    taniyici = EtiketliTaniyici(SONUCLAR)
    servis = _servis(tmp_path, taniyici=taniyici)
    an = oynat(servis, [("bos", 1.2)])
    # Tepsi kayıyor: her yoklamada görüntü değişiyor → sabit değil
    an = oynat(servis, [("A", 0.3), ("C", 0.3), ("A", 0.3), ("C", 0.3)], baslangic=an)
    assert taniyici.cagrilar == ["bos"]
    oynat(servis, [("A", 0.6)], baslangic=an)  # durdu
    assert taniyici.cagrilar == ["bos", "A"]


def test_hareket_hic_durmazsa_bir_aralik_sonra_yine_cekilir(tmp_path):
    taniyici = EtiketliTaniyici(SONUCLAR)
    servis = _servis(tmp_path, taniyici=taniyici)
    an = oynat(servis, [("bos", 1.2)])
    oynat(servis, [("A", 0.3), ("C", 0.3)] * 7, baslangic=an)  # 4,2 sn boyunca sürekli değişim
    assert len(taniyici.cagrilar) >= 2


def test_pos_kesintisinde_tepsi_durdukca_yeniden_dener(tmp_path):
    pos = KayitliPos(basarisiz=2)
    servis = _servis(tmp_path, pos)
    oynat(servis, [("bos", 1.2), ("A", 9)])
    assert pos.denemeler == 3 and len(pos.mesajlar) == 1 and pos.mesajlar[0]["revizyon"] == 1
    assert servis.sayac["gonderim_hatasi"] == 2 and servis.sayac["iletilemedi"] == 0


def test_pos_hic_ulasilmazsa_tepsi_gidince_kayda_gecer(tmp_path):
    pos = KayitliPos(basarisiz=99)
    servis = _servis(tmp_path, pos)
    oynat(servis, [("bos", 1.2), ("A", 5), ("bos", 1.2), ("B", 1.2)])
    assert pos.mesajlar == [] and servis.sayac["iletilemedi"] == 1
    olaylar = (next((tmp_path / "kayitlar").iterdir()) / "olaylar.jsonl").read_text(encoding="utf-8")
    assert '"olay": "iletilemedi"' in olaylar


def test_tanima_hatasinda_gonderim_yok_sonraki_cekimde_yeniden(tmp_path):
    hatali = TanimaSonucu(hata="zaman aşımı")
    taniyici = EtiketliTaniyici({**SONUCLAR, "A": hatali})
    pos = KayitliPos()
    servis = _servis(tmp_path, pos, taniyici)
    an = oynat(servis, [("bos", 1.2), ("A", 8)])
    assert pos.mesajlar == [] and taniyici.cagrilar.count("A") >= 2 and servis.sayac["tanima_hatasi"] >= 2
    taniyici.sonuclar["A"] = sonuc(*TEPSI)
    oynat(servis, [("A", 4)], baslangic=an)
    assert len(pos.mesajlar) == 1


def test_surekli_gonder_ve_kapanis_bildir(tmp_path):
    pos = KayitliPos()
    servis = _servis(tmp_path, pos, ayar={"pos": {"surekli_gonder": True, "kapanis_bildir": True}})
    oynat(servis, [("bos", 1.2), ("A", 9), ("bos", 1.2)])
    islemler = [(m["islem"], m["revizyon"]) for m in pos.mesajlar]
    assert islemler[0] == ("yeni", 1) and islemler[-1] == ("kapandi", 1)
    assert islemler.count(("yeni", 1)) >= 3  # tepsi durdukça aynı numara ve revizyonla yeniden
    assert len({m["siparis_no"] for m in pos.mesajlar}) == 1


def test_dusuk_guven_ve_model_notu_kontrol_ister(tmp_path):
    belirsiz = sonuc("kuru_fasulye", guven=0.4)
    belirsiz.not_ = "tabağın yarısı görüntü dışında"
    pos = KayitliPos()
    servis = _servis(tmp_path, pos, EtiketliTaniyici({**SONUCLAR, "A": belirsiz}))
    oynat(servis, [("bos", 1.2), ("A", 1.2)])
    mesaj = pos.mesajlar[0]
    assert mesaj["kontrol_gerekli"] and mesaj["toplam_kurus"] == 12000
    assert mesaj["kontrol_nedenleri"] == [
        "Kuru fasulye için emin değilim (güven %40)",
        "Not: tabağın yarısı görüntü dışında",
    ]


def test_demo_uctan_uca(tmp_path, capsys):
    saat = _SahteSaat()
    servis = demo_calistir(tmp_path, saat=saat, uyku=saat.uyu)
    cikti = capsys.readouterr().out
    assert cikti.count("YENİ SİPARİŞ") == 2 and cikti.count("GÜNCELLEME (rev. 2)") == 1
    assert "290,00 TL" in cikti
    assert servis.sayac["tanima"] == 4 and servis.sayac["gonderim"] == 3


@pytest.mark.parametrize("aralik", [3.0, 3.5, 4.0])
def test_tepsi_durdukca_cekim_araligi_3_4_sn(tmp_path, aralik):
    servis = _servis(tmp_path, ayar={"kamera": {"cekim_araligi_sn": aralik}})
    anlar = []
    asil = servis._cekim

    def kaydet(kare, imza):
        anlar.append(kare.an)
        asil(kare, imza)

    servis._cekim = kaydet
    oynat(servis, [("bos", 1.2), ("A", 20)])
    araliklar = [b - a for a, b in pairwise(anlar[1:])]  # ilk çekim boş tezgâh
    assert len(araliklar) >= 4
    assert all(aralik - 1e-6 <= fark <= aralik + 0.3 + 1e-6 for fark in araliklar)  # yoklama adımı kadar sapma

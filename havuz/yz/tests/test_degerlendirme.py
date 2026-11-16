"""Değerlendirme testleri: puanlayıcılar, tanım/veri doğrulama, koşu, rapor, gerileme, karşılaştırma."""

import json
from pathlib import Path

import pytest

from yz.degerlendirme import (
    KosuSonucu,
    PuanBaglami,
    PuanlayiciAyari,
    gerileme_bul,
    karsilastir,
    karsilastirma_raporu,
    kosu_html,
    kosu_md,
    kosu_yap,
    ornekleri_yukle,
    puanla,
    sema_yukle,
    tanim_yukle,
)
from yz.hatalar import SaglayiciHatasi, VeriHatasi
from yz.saglayici import FiyatTablosu, ModelFiyati, Sahte
from yz.yapili.semalar import Fatura

GOREVLER = Path(__file__).resolve().parent.parent / "gorevler"


def _p(tur: str, cikti: str, beklenen: object, **ayar: object):
    return puanla(cikti, None, beklenen, PuanlayiciAyari(tur=tur, **ayar), PuanBaglami())  # type: ignore[arg-type]


def test_puanlayicilar():
    assert _p("tam_eslesme", " İade. ", "iade").gecti
    assert not _p("tam_eslesme", "Kategori: iade", "iade").gecti
    assert _p("tam_eslesme", "evet", ["evet", "e"]).gecti  # eş değer yanıtlar
    assert not _p("tam_eslesme", "Iade", "iade", buyuk_kucuk=True).gecti
    assert _p("icerme", "Kategori: İADE", "iade").gecti
    assert _p("duzenli_ifade", "Toplam: 1250 TL", None, desen=r"\d{4}\s*TL").gecti
    assert _p("sayisal", "Sonuç yaklaşık 1.250,50 TL", 1250.5, tolerans=0.01).gecti
    assert not _p("sayisal", "1300", 1250, tolerans=10).gecti
    assert _p("sayisal", "1300", 1250, tolerans=0.05, goreli=True).gecti
    assert not _p("sayisal", "sayı yok", 1).gecti
    yanit = "1250 TL tutarının %18'i 225 TL olur."  # gerçek deneme çıktısı (Qwen2.5-0.5B)
    assert not _p("sayisal", yanit, 225, tolerans=0.01).gecti  # ilk sayı 1250
    assert _p("sayisal", yanit, 225, tolerans=0.01, konum="son").gecti
    assert _p(
        "sayisal", "Sonuç: 225, yani 1250'nin %18'i", 225, tolerans=0.01, konum="herhangi"
    ).gecti
    assert _p("gomme_benzerligi", "iade süresi 14 gün", "iade süresi on dört gün", esik=0.3).gecti
    assert (
        _p("json_sema", '```json\n{"a": 1}\n```', None).gecti
        and not _p("json_sema", "yok", None).gecti
    )


def test_json_sema_ve_alan_puanlama():
    baglam = PuanBaglami(sema=Fatura)
    cikti = '{"fatura_no": "A-1", "toplam": 70, "para_birimi": "TRY"}'
    assert puanla(cikti, None, None, PuanlayiciAyari(tur="json_sema"), baglam).gecti
    assert not puanla(
        '{"fatura_no": "A-1"}', None, None, PuanlayiciAyari(tur="json_sema"), baglam
    ).gecti
    beklenen = {"fatura_no": "A-1", "toplam": 70.0}
    assert puanla(
        cikti, None, beklenen, PuanlayiciAyari(tur="sayisal", alan="toplam", tolerans=0.01), baglam
    ).gecti
    assert puanla(
        cikti,
        json.loads(cikti),
        beklenen,
        PuanlayiciAyari(tur="tam_eslesme", alan="fatura_no"),
        baglam,
    ).gecti
    with pytest.raises(ValueError, match="Bilinmeyen puanlayıcı"):
        puanla("x", None, None, PuanlayiciAyari(tur="sihir"), baglam)


def test_hakem_puanlayici():
    hakem = Sahte(kural=lambda istek: "EVET" if "Ankara" in istek.mesajlar[-1].icerik else "HAYIR")
    baglam = PuanBaglami(hakem=hakem)
    ayar = PuanlayiciAyari(tur="hakem")
    assert puanla("Başkent Ankara'dır", None, "Ankara", ayar, baglam, girdi="Başkent?").gecti
    assert not puanla("İstanbul", None, "x", ayar, baglam).gecti
    assert "hakem: EVET" in puanla("Ankara", None, "Ankara", ayar, baglam).aciklama
    assert not puanla("x", None, "x", ayar, PuanBaglami()).gecti


@pytest.mark.parametrize(
    "yaml_adi", ["siniflandirma", "json_cikarim", "ozet_denetimi", "arac_kullanimi"]
)
def test_ornek_gorev_kumeleri_gecerli(yaml_adi):
    """Kural: her örnek görev kümesi yüklenir ve 10–20 örnek içerir."""
    tanim = tanim_yukle(GOREVLER / f"{yaml_adi}.yaml")
    ornekler = ornekleri_yukle(tanim.yol(tanim.veri))
    assert 10 <= len(ornekler) <= 20
    if tanim.sema:
        sema_yukle(tanim.sema)


def test_tanim_ve_veri_hatalari(tmp_path):
    with pytest.raises(VeriHatasi, match="bulunamadı"):
        tanim_yukle(tmp_path / "yok.yaml")
    (tmp_path / "t.yaml").write_text("ad: x\nveri: v.jsonl\npuanlayicilar: []\n", encoding="utf-8")
    with pytest.raises(VeriHatasi, match="puanlayicilar"):
        tanim_yukle(tmp_path / "t.yaml")
    (tmp_path / "v.jsonl").write_text(
        '{"kimlik": "a", "girdi": "x"}\n{"kimlik": "a", "girdi": "y"}\n', encoding="utf-8"
    )
    with pytest.raises(VeriHatasi, match="iki kez"):
        ornekleri_yukle(tmp_path / "v.jsonl")
    (tmp_path / "v.jsonl").write_text("bozuk\n", encoding="utf-8")
    with pytest.raises(VeriHatasi, match=":1:"):
        ornekleri_yukle(tmp_path / "v.jsonl")
    with pytest.raises(VeriHatasi, match="Şema bulunamadı"):
        sema_yukle("yz.yapili.semalar:Yok")


def _siniflandirici(istek):
    mesaj = istek.mesajlar[-1].icerik.split("Mesaj:")[-1].lower()
    for kategori, ipucu in [("iade", "iade"), ("iade", "geri"), ("fatura", "fatura"), ("kargo", "kargo"),
                            ("kargo", "paket"), ("teknik", "uygulama"), ("teknik", "şifre")]:  # fmt: skip
        if ipucu in mesaj:
            return kategori
    return "diger"


def test_sohbet_kosusu_paralel_ve_kayit(tmp_path):
    tanim = tanim_yukle(GOREVLER / "siniflandirma.yaml")
    tablo = FiyatTablosu(fiyatlar={"kural": ModelFiyati(girdi=1.0, cikti=2.0)})
    kosu = kosu_yap(
        tanim, Sahte(kural=_siniflandirici, model="kural", fiyatlar=tablo), es_zamanlilik=2
    )
    assert [o.kimlik for o in kosu.ornekler] == [f"s{i:02d}" for i in range(1, 16)]  # sıra korunur
    assert kosu.dogruluk >= 0.8 and kosu.bicim_gecerliligi == 1.0 and kosu.maliyet is not None
    kosu.kaydet(tmp_path / "k")
    yuklenen = KosuSonucu.yukle(tmp_path / "k")
    assert yuklenen.dogruluk == kosu.dogruluk and yuklenen.ozet()["ornek_sayisi"] == 15
    with pytest.raises(VeriHatasi):
        KosuSonucu.yukle(tmp_path / "yok")


def test_cikarim_kosusu_katman_notlari():
    tanim = tanim_yukle(GOREVLER / "json_cikarim.yaml")
    yanit = '```json\n{"fatura_no": "A-2024-001", "toplam": "70,00 TL", "para_birimi": "TRY",}\n```'
    kosu = kosu_yap(tanim, Sahte(kural=lambda _: yanit), sinir=2, es_zamanlilik=1)
    ilk, ikinci = kosu.ornekler
    assert (
        ilk.gecti and ilk.bicim_gecerli and "katman=sema" in ilk.notlar and "kod_citi" in ilk.notlar
    )
    assert not ikinci.gecti and ikinci.puanlar["json_sema"]["gecti"]  # biçim doğru, içerik yanlış


def test_arac_kosusu():
    tanim = tanim_yukle(GOREVLER / "arac_kullanimi.yaml")

    def kural(istek):
        if istek.mesajlar[-1].rol == "tool":
            return istek.mesajlar[-1].icerik
        return Sahte.arac_yaniti("hesapla", {"ifade": "1250 * 18 / 100"})

    kosu = kosu_yap(tanim, Sahte(kural=kural), sinir=1, es_zamanlilik=1)
    assert kosu.ornekler[0].gecti and "arac=hesapla" in kosu.ornekler[0].notlar


def test_rag_kosusu(tmp_path):
    (tmp_path / "belgeler").mkdir()
    (tmp_path / "belgeler" / "a.md").write_text(
        "# İade\n\nİade süresi 14 gündür.", encoding="utf-8"
    )
    (tmp_path / "v.jsonl").write_text(
        '{"kimlik": "r1", "girdi": "İade süresi kaç gün?", "beklenen": "14"}\n', encoding="utf-8"
    )
    (tmp_path / "t.yaml").write_text(
        "ad: rag\ngorev: rag\nveri: v.jsonl\nbelgeler: belgeler\npuanlayicilar:\n  - tur: icerme\n",
        encoding="utf-8",
    )
    kosu = kosu_yap(
        tanim_yukle(tmp_path / "t.yaml"), Sahte(kural=lambda _: "İade süresi 14 gündür [1].")
    )
    assert kosu.ornekler[0].gecti and "atif=[1]" in kosu.ornekler[0].notlar


def test_saglayici_hatasi_kosuyu_durdurmaz():
    tanim = tanim_yukle(GOREVLER / "siniflandirma.yaml")
    sayac = {"n": 0}

    def kural(istek):
        sayac["n"] += 1
        if sayac["n"] == 2:
            raise SaglayiciHatasi("sunucu düştü")
        return "iade"

    kosu = kosu_yap(tanim, Sahte(kural=kural), sinir=3, es_zamanlilik=1)
    assert kosu.hata_sayisi == 1 and kosu.ornekler[1].hata == "sunucu düştü"
    assert "HATA" in kosu_md(kosu)


def test_raporlar_kacis_ve_gerileme_karsilastirma():
    tanim = tanim_yukle(GOREVLER / "siniflandirma.yaml")
    iyi = kosu_yap(tanim, Sahte(kural=_siniflandirici, model="iyi"), sinir=5, es_zamanlilik=1)
    kotu = kosu_yap(
        tanim,
        Sahte(kural=lambda _: "<script>alert(1)</script>", model="kotu"),
        sinir=5,
        es_zamanlilik=1,
    )
    html = kosu_html(kotu)
    assert "<script>alert" not in html and "&lt;script&gt;" in html
    gerileme = gerileme_bul(iyi, kotu)
    assert gerileme.gerileme_var and len(gerileme.bozulan) == sum(o.gecti for o in iyi.ornekler)
    assert "Bozulan örnekler" in gerileme.md()
    kosular = karsilastir(
        tanim,
        [Sahte(kural=_siniflandirici, model="iyi"), Sahte(kural=lambda _: "x", model="kotu")],
        sinir=5,
    )
    rapor = karsilastirma_raporu(tanim, kosular)
    assert "En iyi sonuç: **iyi**" in rapor and "| kotu | %0.0 |" in rapor

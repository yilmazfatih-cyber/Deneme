"""Ajan döngüsü senaryoları: hatalı argüman, bilinmeyen araç, sonsuz döngü, sınırlar, kip geçişi, döküm."""

import json

import pytest

from yz.ajan import Ajan, AjanAyari, IsAdimi, IsAkisi, coz
from yz.arac import AracKutusu, arac
from yz.arac.hazir import hesap_araci
from yz.hatalar import DesteklenmiyorHatasi
from yz.saglayici import Kullanim, Sahte, Yanit

A = Sahte.arac_yaniti


def _ajan(betik, **ayar):
    sahte = Sahte(betik)
    return Ajan(sahte, [hesap_araci], ayar=AjanAyari(**ayar)), sahte


def test_arac_cagirip_yanit_verir_ve_gecmisi_dogru_kurar():
    ajan, sahte = _ajan([A("hesapla", {"ifade": "1250*18/100"}), "Sonuç 225 TL."])
    sonuc = ajan.calistir("1250'nin %18'i?")
    assert (sonuc.yanit, sonuc.durma_nedeni, sonuc.kip) == ("Sonuç 225 TL.", "yanit", "yerel")
    assert [a.tur for a in sonuc.adimlar] == ["model", "arac", "model"]
    ikinci = sahte.istekler[1].mesajlar
    assert ikinci[-2].rol == "assistant" and ikinci[-2].arac_cagrilari[0].ad == "hesapla"
    assert (
        ikinci[-1].rol == "tool"
        and ikinci[-1].icerik == "225"
        and ikinci[-1].arac_cagri_kimligi == "cagri_1"
    )
    assert sahte.istekler[0].araclar[0].ad == "hesapla"


def test_hatali_arguman_gozlem_olur_ve_model_duzeltir():
    ajan, sahte = _ajan(
        [A("hesapla", {"formul": "2+2"}), A("hesapla", {"ifade": "2+2"}, kimlik="c2"), "4"]
    )
    sonuc = ajan.calistir("2+2?")
    assert sonuc.yanit == "4" and sonuc.arac_cagrilari[0].hata and not sonuc.arac_cagrilari[1].hata
    assert (
        "ifade: eksik alan" in sahte.istekler[1].mesajlar[-1].icerik
        and sahte.istekler[1].mesajlar[-1].arac_hatasi
    )


def test_bilinmeyen_arac_kullanilabilirleri_listeler():
    ajan, sahte = _ajan([A("hava_durumu", {"il": "Van"}), "Bu bilgiye erişemiyorum."])
    sonuc = ajan.calistir("Van'da hava?")
    assert (
        sonuc.durma_nedeni == "yanit"
        and "Kullanılabilen araçlar: hesapla" in sahte.istekler[1].mesajlar[-1].icerik
    )


def test_sonsuz_dongu_korumasi():
    ajan, _ = _ajan([A("hesapla", {"ifade": "1+1"}, kimlik=f"c{i}") for i in range(10)])
    sonuc = ajan.calistir("x")
    assert sonuc.durma_nedeni == "dongu"
    calisan = [a for a in sonuc.arac_cagrilari if not a.hata]
    assert len(calisan) == 2 and "zaten çağırdın" in sonuc.arac_cagrilari[-1].icerik


def test_adim_siniri_ve_son_yanit():
    betik = [A("hesapla", {"ifade": f"{i}+1"}, kimlik=f"c{i}") for i in range(3)] + [
        "Elimdeki bilgiyle: 3"
    ]
    ajan, sahte = _ajan(betik, azami_adim=3)
    sonuc = ajan.calistir("x")
    assert sonuc.durma_nedeni == "adim_siniri" and sonuc.yanit == "Elimdeki bilgiyle: 3"
    assert not sahte.istekler[-1].araclar  # son yanıt araçsız istenir
    ajan, _ = _ajan(betik[:3], azami_adim=3, son_yanit_iste=False)
    assert ajan.calistir("x").yanit == ""


def test_belirtec_butcesi():
    ajan, _ = _ajan(
        [
            Yanit(
                metin="",
                arac_cagrilari=A("hesapla", {"ifade": "1"}).arac_cagrilari,
                bitis_nedeni="arac",
                kullanim=Kullanim(girdi_belirteci=900, cikti_belirteci=200),
            )
        ],
        belirtec_butcesi=1000,
    )
    assert ajan.calistir("x").durma_nedeni == "butce"


def test_ardisik_arac_hatalari_durdurur():
    betik = [A("hesapla", {"ifade": f"{i}/0"}, kimlik=f"c{i}") for i in range(5)]
    ajan, _ = _ajan(betik, ardisik_hata_siniri=3)
    sonuc = ajan.calistir("x")
    assert sonuc.durma_nedeni == "hata_dongusu" and len(sonuc.arac_cagrilari) == 3


def test_bos_yanit_ve_ret():
    ajan, _ = _ajan(["", ""])
    assert ajan.calistir("x").durma_nedeni == "bos_yanit"
    ajan, _ = _ajan([Yanit(metin="Yardımcı olamam.", bitis_nedeni="ret")])
    assert ajan.calistir("x").durma_nedeni == "ret"


def test_desteklenmezse_metin_kipine_gecer():
    ajan, sahte = _ajan(
        [
            DesteklenmiyorHatasi("araç yok"),
            'Düşünce: hesap\nEylem: hesapla\nGirdi: {"ifade": "7*6"}',
            "Yanıt: 42",
        ]
    )
    sonuc = ajan.calistir("7*6?")
    assert (sonuc.yanit, sonuc.kip) == ("42", "metin")
    assert "ARAÇLAR:" in sahte.istekler[1].mesajlar[0].icerik and not sahte.istekler[1].araclar
    assert sahte.istekler[2].mesajlar[-1].icerik == "Gözlem: 42"
    assert "\nGözlem:" in sahte.istekler[1].dur


def test_yerel_kipte_metinle_cagri_algilanir():
    ajan, _ = _ajan(
        [
            '<tool_call>{"name": "hesapla", "arguments": {"ifade": "3*3"}}</tool_call>',
            "**Final Answer:** 9",
        ]
    )
    sonuc = ajan.calistir("3*3?")
    assert (sonuc.yanit, sonuc.kip) == ("9", "metin") and sonuc.arac_cagrilari[0].icerik == "9"


def test_metin_kipinde_bicim_bozuklugu():
    ajan, sahte = _ajan(["Eylem:", "Eylem:"], kip="metin")
    assert ajan.calistir("x").durma_nedeni == "bicim"
    assert "Biçim anlaşılmadı" in sahte.istekler[1].mesajlar[-1].icerik


def test_metin_kipinde_etiketsiz_duz_yanit_kabul_edilir():
    ajan, _ = _ajan(["Merhaba, size nasıl yardımcı olabilirim?"], kip="metin")
    assert ajan.calistir("selam").yanit == "Merhaba, size nasıl yardımcı olabilirim?"


def test_onaysiz_tehlikeli_arac_calismaz():
    calisti: list[str] = []

    @arac(tehlikeli=True)
    def gonder(alici: str) -> str:
        """E-posta gönderir."""
        calisti.append(alici)
        return "gönderildi"

    sahte = Sahte([A("gonder", {"alici": "a@b.c"}), "Gönderemedim."])
    sonuc = Ajan(sahte, AracKutusu([gonder])).calistir("e-posta at")
    assert calisti == [] and sonuc.arac_cagrilari[0].hata


def test_dokum_kaydi_ve_olay_kancasi(tmp_path):
    olaylar: list[str] = []
    sahte = Sahte([A("hesapla", {"ifade": "2*3"}), "6"])
    sonuc = Ajan(sahte, [hesap_araci], olay=lambda a: olaylar.append(a.tur)).calistir("2*3?")
    sonuc.dokum_kaydet(tmp_path / "d.jsonl")
    satirlar = [
        json.loads(s) for s in (tmp_path / "d.jsonl").read_text(encoding="utf-8").splitlines()
    ]
    assert [s["tur"] for s in satirlar] == ["model", "arac", "model", "sonuc"]
    assert satirlar[-1]["durma_nedeni"] == "yanit" and olaylar == ["model", "arac", "model"]


@pytest.mark.parametrize(
    ("metin", "tur", "arac_adi", "girdi"),
    [
        ('Action: hesapla\nAction Input: {"ifade": "1+1"}', "eylem", "hesapla", {"ifade": "1+1"}),
        ('hesapla(ifade="2*3")', "eylem", "hesapla", {"ifade": "2*3"}),
        ("hesapla('5-1')", "eylem", "hesapla", {"ifade": "5-1"}),
        ('{"arac": "Hesapla", "girdi": {"ifade": "9/3"}}', "eylem", "hesapla", {"ifade": "9/3"}),
        (
            '{"name": "hesapla", "arguments": "{\\"ifade\\": \\"1\\"}"}',
            "eylem",
            "hesapla",
            {"ifade": "1"},
        ),
        ("Eylem: `hesapla`\nGirdi: 2+2", "eylem", "hesapla", {"ifade": "2+2"}),
        (
            '**Düşünce:** x\n**Eylem:** hesapla\n**Girdi:** ```json\n{"ifade": "4*4"}\n```',
            "eylem",
            "hesapla",
            {"ifade": "4*4"},
        ),
        (
            'Düşünce: ...\nEylem: hesapla\nGirdi: {"ifade": "1+1"}\nGözlem: 2\nYanıt: 2',
            "eylem",
            "hesapla",
            {"ifade": "1+1"},
        ),
        ('Eylem: uçak_bileti\nGirdi: {"il": "Van"}', "eylem", "uçak_bileti", {"il": "Van"}),
        ("Yanıt: Merhaba", "yanit", "", {}),
        ("YANIT: Tamam", "yanit", "", {}),
        ("Final Answer: 9", "yanit", "", {}),
        ("Sadece düz bir yanıt.", "yanit", "", {}),
        ("", "belirsiz", "", {}),
        ("Düşünce: düşünüyorum ama karar yok", "belirsiz", "", {}),
    ],
)
def test_metin_kipi_ayristirici(metin, tur, arac_adi, girdi):
    karar = coz(metin, [hesap_araci.tanim()])
    assert (karar.tur, karar.arac, karar.girdi) == (tur, arac_adi, girdi)


def test_is_akisi_dogrulama_ve_yeniden_deneme():
    denemeler: list[str | None] = []

    def planla(baglam: dict[str, object]) -> list[str]:
        denemeler.append(baglam.get("_onceki_hata"))  # type: ignore[arg-type]
        return ["adım"] if baglam.get("_onceki_hata") else []

    akis = IsAkisi([
        IsAdimi("plan", planla, dogrula=lambda c: None if c else "plan boş", yeniden_deneme=1),
        IsAdimi("ozet", lambda b: f"{len(b['plan'])} adım: {b['konu']}"),
    ])  # fmt: skip
    sonuc = akis.calistir({"konu": "taşınma"})
    assert sonuc.basarili and sonuc["ozet"] == "1 adım: taşınma" and denemeler == [None, "plan boş"]
    basarisiz = IsAkisi([IsAdimi("a", lambda b: 1 / 0)]).calistir({})
    assert not basarisiz.basarili and "ZeroDivisionError" in basarisiz.hata
    with pytest.raises(ValueError, match="tekil"):
        IsAkisi([IsAdimi("a", lambda b: 1), IsAdimi("a", lambda b: 2)])

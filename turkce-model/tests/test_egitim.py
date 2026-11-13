"""Eğitim döngüsü: kaldığı yerden devam, Ctrl+C, güvenli kayıt, kısa eğitim ayarları, cihaz denetimi.

Sentetik bir çalışma klasöründe küçük bir modelle çalışır. Gömme değerleri yalnız test içindir, öneri değildir.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
import torch
from conftest import calisma_kur, sentetik_sorular

from turkce_model import meb
from turkce_model.ayarlar import AyarHatasi, EgitimAyarlari, ayarlari_yukle
from turkce_model.cli import main
from turkce_model.egitim import (
    cihaz_dogrula,
    degerlendir,
    egit,
    egitim_durumu_oku,
    guvenli_kaydet,
    kisa_egitim_ayarlari,
    kontrol_noktasi_yukle,
)


def _sus(*_a, **_k) -> None:
    pass


@pytest.fixture(scope="module")
def calisma(tmp_path_factory) -> Path:
    """Tokenizer'ı ve hazır verisi (MEB soruları dahil) olan bir çalışma klasörü."""
    kok = tmp_path_factory.mktemp("calisma")
    ayar = calisma_kur(kok)
    (kok / "veri" / "meb").mkdir(parents=True)
    meb.soru_yaz(sentetik_sorular(60), kok / "veri" / "meb" / "meb_pdf.jsonl")
    for komut in ("tdk-derlem", "tokenizer-egit", "veri-hazirla"):
        assert main([komut, "--ayarlar", str(ayar)]) == 0
    return kok


def _ayarlar(kok: Path, deney: str, *gecersiz_kilma: str):
    a = ayarlari_yukle(kok / "ayarlar.toml", list(gecersiz_kilma))
    a.deney = deney
    return a


# Dropout açık: kaldığı yerden devamda torch'un RNG durumu da geri yüklenmeli.
KESINTI_AYARLARI = ("model.dropout=0.1", "gomme.dropout=0.1", "egitim.tdk.en_fazla_adim=6")


def _gunluk_adimlari(klasor: Path) -> list[int]:
    return [json.loads(s)["adim"] for s in (klasor / "gunluk.jsonl").read_text(encoding="utf-8").splitlines()]


def test_ctrl_c_ve_devam_kesintisiz_egitimle_ayni_agirliklari_verir(calisma):
    duz = _ayarlar(calisma, "duz", *KESINTI_AYARLARI)
    egit(duz, "tdk", cihaz="cpu", yaz=_sus)

    kesik = _ayarlar(calisma, "kesik", *KESINTI_AYARLARI)

    def kes(metin: str) -> None:  # 2. adımın optimizer adımı ve günlük kaydı yapıldıktan sonra Ctrl+C
        if metin.lstrip().startswith("adım 2/"):
            raise KeyboardInterrupt

    sonuc = egit(kesik, "tdk", cihaz="cpu", yaz=kes)
    klasor = kesik.deney_klasoru / "tdk"
    assert sonuc == {"durduruldu": True, "adim": 2}
    assert kontrol_noktasi_yukle(klasor / "son.pt")["adim"] == 2  # tamamlanan adım, bir eksik değil
    assert egitim_durumu_oku(klasor)["durum"] == "durduruldu"
    jsonl = calisma / "ciktilar" / "ilerleme.jsonl"
    assert not jsonl.exists() or "kesik" not in jsonl.read_text(encoding="utf-8")  # durdurulunca değerlendirme yok

    egit(kesik, "tdk", devam=True, cihaz="cpu", yaz=_sus)
    a = kontrol_noktasi_yukle(duz.deney_klasoru / "tdk" / "son.pt")["model"]
    b = kontrol_noktasi_yukle(klasor / "son.pt")["model"]
    assert all(torch.equal(a[k], b[k]) for k in a)  # aynı yığınlar, aynı dropout maskeleri: bit bit aynı
    adimlar = _gunluk_adimlari(klasor)
    assert adimlar == sorted(set(adimlar)) and adimlar[-1] == 6  # tekrarlanan adım yok
    assert egitim_durumu_oku(klasor)["durum"] == "bitti"
    assert sum("kesik" in s for s in jsonl.read_text(encoding="utf-8").splitlines()) == 1


def test_devam_kilitli_egitim_ayarini_reddeder_digerine_not_duser(calisma):
    egit(_ayarlar(calisma, "kilit", *KESINTI_AYARLARI), "tdk", cihaz="cpu", yaz=_sus)
    with pytest.raises(AyarHatasi, match="ogrenme_orani"):
        egit(_ayarlar(calisma, "kilit", *KESINTI_AYARLARI, "egitim.tdk.ogrenme_orani=0.01"), "tdk", devam=True, yaz=_sus)
    satirlar: list[str] = []
    sonuc = egit(
        _ayarlar(calisma, "kilit", *KESINTI_AYARLARI, "egitim.tdk.degerlendirme_yigini=3"),
        "tdk",
        devam=True,
        cihaz="cpu",
        yaz=satirlar.append,
    )
    assert sonuc["zaten_bitti"]  # bitmiş eğitim yeniden değerlendirilmez, tabloya satır eklenmez
    assert any("degerlendirme_yigini" in s and "Not" in s for s in satirlar)


def test_uzerine_yaz_denetimler_gecmeden_eski_modeli_silmez(calisma):
    ayar = ("egitim.tdk.en_fazla_adim=2", "egitim.meb.en_fazla_adim=2")
    a = _ayarlar(calisma, "silinmez", *ayar)
    egit(a, "meb", sifirdan=True, cihaz="cpu", yaz=_sus)
    meb_model = a.deney_klasoru / "meb" / "en_iyi.pt"
    assert meb_model.exists()
    with pytest.raises(AyarHatasi, match="TDK modelinden başlar"):  # --sifirdan unutuldu; TDK modeli yok
        egit(a, "meb", uzerine_yaz=True, cihaz="cpu", yaz=_sus)
    assert meb_model.exists()


def test_bozuk_kontrol_noktasi_anlasilir_hata_verir(calisma, tmp_path):
    a = _ayarlar(calisma, "bozuk", "egitim.tdk.en_fazla_adim=2")
    egit(a, "tdk", cihaz="cpu", yaz=_sus)
    son = a.deney_klasoru / "tdk" / "son.pt"
    veri = son.read_bytes()
    son.write_bytes(veri[: len(veri) // 2])  # yarım yazılmış dosya
    with pytest.raises(AyarHatasi, match="okunamadı"):
        egit(a, "tdk", devam=True, cihaz="cpu", yaz=_sus)
    metin = tmp_path / "ayarlar.toml"
    metin.write_text("[gomme]\n", encoding="utf-8")
    with pytest.raises(AyarHatasi, match="okunamadı"):
        kontrol_noktasi_yukle(metin)
    with pytest.raises(AyarHatasi, match="yok"):
        kontrol_noktasi_yukle(tmp_path / "yok.pt")


def test_gorulen_token_birikimli_ve_degerlendirilen_dosyanin_kendi_sayisi(calisma):
    a = _ayarlar(calisma, "dosyadan", "egitim.tdk.en_fazla_adim=2", "egitim.meb.en_fazla_adim=2")
    egit(a, "tdk", cihaz="cpu", yaz=_sus)
    egit(a, "meb", cihaz="cpu", yaz=_sus)  # TDK modelinden başlar
    tdk_kn = kontrol_noktasi_yukle(a.deney_klasoru / "tdk" / "en_iyi.pt")
    meb_kn = kontrol_noktasi_yukle(a.deney_klasoru / "meb" / "son.pt")
    assert meb_kn["gorulen_token"] > tdk_kn["gorulen_token"] > 0  # MEB aşaması TDK'de görülenleri de sayar

    # --model ile başka bir deneyin dosyası: aşama ve deney adı dosyanın kendi kaydından gelir.
    yol = a.deney_klasoru / "tdk" / "en_iyi.pt"
    sonuc = degerlendir(_ayarlar(calisma, "baska"), cihaz="cpu", yaz=_sus, kontrol_noktasi=yol)
    assert sonuc["asama"] == "tdk" and sonuc["deney"] == "dosyadan (en_iyi.pt)"
    assert sonuc["gorulen_token"] == tdk_kn["gorulen_token"] and sonuc["adim"] == tdk_kn["adim"]


class _Zararli:
    """Yüklenirken dosya oluşturmaya çalışan bir nesne (``weights_only`` bunu engellemeli)."""

    def __init__(self, yol: Path) -> None:
        self.yol = yol

    def __reduce__(self):
        return (Path.touch, (self.yol,))


def test_kontrol_noktasi_kod_calistiramaz(tmp_path):
    isaret = tmp_path / "calisti"
    yol = tmp_path / "zararli.pt"
    torch.save({"model": {}, "ayarlar": {}, "x": _Zararli(isaret)}, yol)
    with pytest.raises(AyarHatasi):
        kontrol_noktasi_yukle(yol)
    assert not isaret.exists()


def test_guvenli_kaydet_yarida_kesilirse_eski_dosya_saglam(tmp_path, monkeypatch):
    yol = tmp_path / "son.pt"
    guvenli_kaydet({"adim": 1}, yol)
    assert not list(tmp_path.glob("*.yaziliyor"))
    gercek_kaydet = torch.save

    def yarim_kaydet(veri, hedef):
        Path(hedef).write_bytes(b"yarim")
        raise KeyboardInterrupt

    monkeypatch.setattr(torch, "save", yarim_kaydet)
    with pytest.raises(KeyboardInterrupt):
        guvenli_kaydet({"adim": 2}, yol)
    monkeypatch.setattr(torch, "save", gercek_kaydet)
    assert torch.load(yol, weights_only=True) == {"adim": 1}


def test_kisa_egitimde_degerlendirme_ve_isinma_uyarlanir():
    ea = EgitimAyarlari(degerlendirme_her=100, isinma_adimi=50)
    assert kisa_egitim_ayarlari(ea, 82) == (8, 16)  # bir kitapçık: ~10 değerlendirme, ısınma ≤ 1/5
    assert kisa_egitim_ayarlari(ea, 5000) == (100, 50)  # uzun eğitimde ayarlar aynen
    assert kisa_egitim_ayarlari(EgitimAyarlari(isinma_adimi=0), 30) == (3, 0)  # ısınmasız kalır
    assert kisa_egitim_ayarlari(ea, 1) == (1, 1)


def test_cihaz_denetimi():
    with pytest.raises(AyarHatasi, match="Bilinmeyen cihaz"):
        cihaz_dogrula("tpu")
    assert cihaz_dogrula("cpu") == "cpu"
    if not torch.cuda.is_available():
        with pytest.raises(AyarHatasi, match="CUDA"):
            cihaz_dogrula("cuda")

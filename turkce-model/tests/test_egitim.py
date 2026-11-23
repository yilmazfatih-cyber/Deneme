"""Eğitim döngüsü: kaldığı yerden devam, Ctrl+C, güvenli kayıt, aşama kilidi, veri imzaları, kısa eğitim ayarları.

Sentetik bir çalışma klasöründe küçük bir modelle çalışır. Gömme değerleri yalnız test içindir, öneri değildir.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from dataclasses import replace
from pathlib import Path

import pytest
import torch
from conftest import calisma_kur, sentetik_sorular

import turkce_model
from turkce_model import egitim, meb, veri
from turkce_model.ayarlar import AyarHatasi, EgitimAyarlari, ayarlari_yukle
from turkce_model.cli import main
from turkce_model.egitim import (
    cihaz_dogrula,
    degerlendir,
    durumu_yukle,
    egit,
    egitim_durumu_oku,
    egitim_kilidi,
    egitim_suruyor_mu,
    guvenli_kaydet,
    kisa_egitim_ayarlari,
    kontrol_noktasi_yukle,
    ogrenme_orani,
    sabit_dogrulama_yiginlari,
    tokenizer_yukle,
    veri_klasoru,
)
from turkce_model.metin import binlik
from turkce_model.model import TurkceGPT
from turkce_model.tokenizer import PAD
from turkce_model.veri import AkisVeri, SoruVeri, dosya_imzasi, meta_oku


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


def _kopya(calisma: Path, hedef: Path) -> Path:
    """Çalışma klasörünün (deneyler hariç) kopyası: hazır veriyi değiştiren testler ortak klasörü bozmasın."""
    shutil.copytree(calisma, hedef, ignore=shutil.ignore_patterns("deneyler", "ilerleme.*"))
    return hedef


# Dropout açık: kaldığı yerden devamda torch'un RNG durumu da geri yüklenmeli. 6 adımlık eğitimde her adım
# değerlendirilir (kısa eğitim kuralı); adım başına 4 mikro yığın vardır (varsayılan birikim).
KESINTI_AYARLARI = ("model.dropout=0.1", "gomme.dropout=0.1", "egitim.tdk.en_fazla_adim=6")


@pytest.fixture(scope="module")
def duz(calisma):
    """Kesintisiz karşılaştırma eğitimi (``KESINTI_AYARLARI``)."""
    a = _ayarlar(calisma, "duz", *KESINTI_AYARLARI)
    egit(a, "tdk", cihaz="cpu", yaz=_sus)
    return a


def _gunluk(klasor: Path) -> list[dict]:
    return [json.loads(s) for s in (klasor / "gunluk.jsonl").read_text(encoding="utf-8").splitlines()]


def _gunluk_adimlari(klasor: Path) -> list[int]:
    return [g["adim"] for g in _gunluk(klasor)]


def _satir_sayisi(kok: Path, deney: str) -> int:
    """İlerleme tablosunda bu deneyin satır sayısı."""
    yol = kok / "ciktilar" / "ilerleme.jsonl"
    if not yol.exists():
        return 0
    return sum(json.loads(s)["deney"] == deney for s in yol.read_text(encoding="utf-8").splitlines())


def _dosya_ozetleri(klasor: Path) -> dict[str, str]:
    return {y.name: hashlib.sha256(y.read_bytes()).hexdigest() for y in klasor.iterdir() if y.name != "egitim.kilit"}


def _ayni_egitim(beklenen: Path, klasor: Path) -> None:
    """Kesilip sürdürülen eğitim, kesintisiz eğitimle aynı yere varmış mı: ağırlıklar, RNG, en iyi model, günlük."""
    a, b = kontrol_noktasi_yukle(beklenen / "son.pt"), kontrol_noktasi_yukle(klasor / "son.pt")
    assert all(torch.equal(a["model"][k], b["model"][k]) for k in a["model"])  # aynı yığınlar, aynı dropout maskeleri
    assert a["rng"]["numpy"] == b["rng"]["numpy"] and torch.equal(a["rng"]["torch"], b["rng"]["torch"])
    for anahtar in ("adim", "en_iyi", "sabir", "gorulen_token", "bekleyen"):
        assert a[anahtar] == b[anahtar], anahtar
    assert kontrol_noktasi_yukle(beklenen / "en_iyi.pt")["adim"] == kontrol_noktasi_yukle(klasor / "en_iyi.pt")["adim"]
    alanlar = ("adim", "ogrenme_orani", "egitim_kaybi", "tdk_kayip", "gorulen_token")
    assert [[g[k] for k in alanlar] for g in _gunluk(beklenen)] == [[g[k] for k in alanlar] for g in _gunluk(klasor)]
    assert egitim_durumu_oku(klasor)["durum"] == egitim_durumu_oku(beklenen)["durum"]
    assert not list(klasor.glob("*.yaziliyor")) and not list(klasor.glob("*.eski"))


def _ileride_kes(monkeypatch, n: int, hata: BaseException | type[BaseException] = KeyboardInterrupt) -> None:
    """``n``. eğitim kipi ileri geçişinden SONRA ``hata`` fırlatır: o adımın yığını çekilmiş, dropout maskeleri
    üretilmiştir (gerçek bir Ctrl+C çoğunlukla buraya, ileri/geri geçişin ortasına düşer)."""
    asil = TurkceGPT.forward
    sayac = {"n": 0}

    def ileri(self, *a, **k):
        sonuc = asil(self, *a, **k)
        if self.training:
            sayac["n"] += 1
            if sayac["n"] == n:
                raise hata
        return sonuc

    monkeypatch.setattr(TurkceGPT, "forward", ileri)


def _dogrulamada_kes(monkeypatch, n: int) -> None:
    """Eğitim sırasındaki ``n``. doğrulamanın başında (``model.eval()``) Ctrl+C: adım tamamlanmış, günlüğe yazılmamış."""
    asil = TurkceGPT.train
    sayac = {"n": 0}

    def train(self, kip: bool = True):
        if not kip:
            sayac["n"] += 1
            if sayac["n"] == n:
                raise KeyboardInterrupt
        return asil(self, kip)

    monkeypatch.setattr(TurkceGPT, "train", train)


# --------------------------------------------------------------------------------------------
# Ctrl+C ve --devam
# --------------------------------------------------------------------------------------------


def test_ctrl_c_ve_devam_kesintisiz_egitimle_ayni_agirliklari_verir(calisma, duz):
    kesik = _ayarlar(calisma, "kesik", *KESINTI_AYARLARI)

    def kes(metin: str) -> None:  # 2. adımın günlük satırı yazıldıktan sonra, kontrol noktası kaydedilmeden Ctrl+C
        if metin.lstrip().startswith("adım 2/"):
            raise KeyboardInterrupt

    sonuc = egit(kesik, "tdk", cihaz="cpu", yaz=kes)
    klasor = kesik.deney_klasoru / "tdk"
    assert sonuc == {"durduruldu": True, "adim": 2}
    kn = kontrol_noktasi_yukle(klasor / "son.pt")
    assert kn["adim"] == 2  # tamamlanan adım, bir eksik değil
    assert set(kn["bekleyen"]) == {"ogrenme_orani", "egitim_kaybi", "token_sn"}  # 2. adımın değerlendirmesi yarım
    assert egitim_durumu_oku(klasor)["durum"] == "durduruldu"
    assert _satir_sayisi(calisma, "kesik") == 0  # durdurulunca değerlendirme yok

    egit(kesik, "tdk", devam=True, cihaz="cpu", yaz=_sus)
    _ayni_egitim(duz.deney_klasoru / "tdk", klasor)  # bit bit aynı; günlükte tekrarlanan ya da atlanan adım yok
    assert _gunluk_adimlari(klasor) == [1, 2, 3, 4, 5, 6]
    durum = egitim_durumu_oku(klasor)
    assert durum["durum"] == "bitti" and durum["kosu"] == kn["kosu"]  # sürdürülen eğitim aynı koşudur
    assert _satir_sayisi(calisma, "kesik") == 1


def test_adimin_ortasinda_gelen_ctrl_c_bit_bit_ayni_surer(calisma, monkeypatch):
    ayar = (*KESINTI_AYARLARI, "egitim.tdk.birikim=2")
    duz2 = _ayarlar(calisma, "duz_birikim2", *ayar)
    egit(duz2, "tdk", cihaz="cpu", yaz=_sus)

    mikro = _ayarlar(calisma, "mikro", *ayar)
    _ileride_kes(monkeypatch, 5)  # 3. adımın ilk mikro yığını: yığın çekildi, dropout maskeleri üretildi
    assert egit(mikro, "tdk", cihaz="cpu", yaz=_sus) == {"durduruldu": True, "adim": 2}
    assert kontrol_noktasi_yukle(mikro.deney_klasoru / "tdk" / "son.pt")["bekleyen"] is None
    egit(mikro, "tdk", devam=True, cihaz="cpu", yaz=_sus)
    # Kontrol noktası adım sınırındaki RNG'yi taşır: yarım kalan adım aynı yığınlarla yeniden yapılır.
    _ayni_egitim(duz2.deney_klasoru / "tdk", mikro.deney_klasoru / "tdk")


def test_dogrulamasi_kesilen_adim_devamda_yeniden_degerlendirilir(calisma, duz, monkeypatch):
    a = _ayarlar(calisma, "dogrulama_ortasi", *KESINTI_AYARLARI)
    _dogrulamada_kes(monkeypatch, 2)
    assert egit(a, "tdk", cihaz="cpu", yaz=_sus) == {"durduruldu": True, "adim": 2}
    klasor = a.deney_klasoru / "tdk"
    assert _gunluk_adimlari(klasor) == [1]
    satirlar: list[str] = []
    egit(a, "tdk", devam=True, cihaz="cpu", yaz=satirlar.append)
    assert "  Yarıda kesilen değerlendirme yeniden yapılıyor: adım 2" in satirlar
    # 2. adım günlükte atlanmaz; en iyi model adaylığı ve erken durdurma sayacı kesintisiz eğitimdeki gibidir.
    _ayni_egitim(duz.deney_klasoru / "tdk", klasor)


@pytest.mark.parametrize("nerede", ["dogrulama", "en_iyi_kaydi", "durum"])
def test_son_adimlarin_degerlendirmesi_kesilirse_devam_egitimi_bitirir(calisma, duz, monkeypatch, nerede):
    a = _ayarlar(calisma, f"son_{nerede}", *KESINTI_AYARLARI)
    klasor = a.deney_klasoru / "tdk"
    adim = 6
    if nerede == "dogrulama":  # son adımın doğrulaması başlarken
        _dogrulamada_kes(monkeypatch, 6)
    elif nerede == "en_iyi_kaydi":  # en iyi model yazılırken (torch.save yarım dosya bırakır)
        adim = kontrol_noktasi_yukle(duz.deney_klasoru / "tdk" / "en_iyi.pt")["adim"]
        asil_kaydet = egitim.guvenli_kaydet

        def kaydet(veri_, yol):
            if Path(yol).name == "en_iyi.pt" and veri_["adim"] == adim:
                Path(yol).with_name("en_iyi.pt.yaziliyor").write_bytes(b"yarim")
                raise KeyboardInterrupt
            return asil_kaydet(veri_, yol)

        monkeypatch.setattr(egitim, "guvenli_kaydet", kaydet)
    else:  # son adımın "bitti" durumu yazılırken: bütün dosyalar tamam, yalnız durum.json eksik
        asil_yaz = egitim._egitim_durumu_yaz

        def durum_yaz(k, d):
            if d["durum"] == "bitti":
                raise KeyboardInterrupt
            return asil_yaz(k, d)

        monkeypatch.setattr(egitim, "_egitim_durumu_yaz", durum_yaz)
    assert egit(a, "tdk", cihaz="cpu", yaz=_sus) == {"durduruldu": True, "adim": adim}
    monkeypatch.undo()
    assert egitim_durumu_oku(klasor)["durum"] == "durduruldu"
    assert kontrol_noktasi_yukle(klasor / "son.pt")["bekleyen"] is not None

    sonuc = egit(a, "tdk", devam=True, cihaz="cpu", yaz=_sus)
    assert "zaten_bitti" not in sonuc  # "zaten bitmiş" deyip değerlendirmeden dönmez
    _ayni_egitim(duz.deney_klasoru / "tdk", klasor)
    durum = egitim_durumu_oku(klasor)
    assert durum["durum"] == "bitti" and durum["degerlendirildi"] is True
    assert _satir_sayisi(calisma, f"son_{nerede}") == 1


def test_bitmis_egitimin_bayat_durumu_devamda_onarilir(calisma):
    a = _ayarlar(calisma, "bayat", *KESINTI_AYARLARI)
    egit(a, "tdk", cihaz="cpu", yaz=_sus)
    klasor = a.deney_klasoru / "tdk"
    # Eski sürümün bıraktığı durum: son adımda kesilmiş, durum.json "durduruldu" kalmış, yarım bir kayıt dosyası.
    (klasor / "durum.json").write_text(json.dumps({"durum": "durduruldu", "adim": 6, "toplam_adim": 6}), encoding="utf-8")
    (klasor / "en_iyi.pt.yaziliyor").write_bytes(b"yarim")
    satirlar: list[str] = []
    sonuc = egit(a, "tdk", devam=True, cihaz="cpu", yaz=satirlar.append, komut_eki=" --deney bayat")
    assert sonuc == {"zaten_bitti": True, "adim": 6}
    durum = egitim_durumu_oku(klasor)
    assert durum["durum"] == "bitti" and durum["degerlendirildi"] is False
    assert durum["en_iyi_adim"] == kontrol_noktasi_yukle(klasor / "en_iyi.pt")["adim"]
    assert not list(klasor.glob("*.yaziliyor"))
    assert any(s.endswith("python -m turkce_model degerlendir --asama tdk --deney bayat") for s in satirlar)

    degerlendir(a, "tdk", cihaz="cpu", yaz=_sus)  # elle değerlendirme "değerlendirilmedi" işaretini kaldırır
    assert egitim_durumu_oku(klasor)["degerlendirildi"] is True
    egit(a, "tdk", devam=True, cihaz="cpu", yaz=_sus)  # durumu doğru olan bitmiş eğitime dokunulmaz
    assert egitim_durumu_oku(klasor)["degerlendirildi"] is True


def test_devam_gunlukte_yeniden_yapilacak_ve_bozuk_satirlari_atar(calisma, monkeypatch):
    a = _ayarlar(calisma, "gunluk", *KESINTI_AYARLARI)
    _ileride_kes(monkeypatch, 9)  # 3. adımın başı: 2 adım kaydedildi
    assert egit(a, "tdk", cihaz="cpu", yaz=_sus)["adim"] == 2
    klasor = a.deney_klasoru / "tdk"
    with (klasor / "gunluk.jsonl").open("a", encoding="utf-8") as f:  # kaydedilmemiş bir adımın satırı + yarım satır
        f.write(json.dumps({"adim": 3, "tdk_kayip": 1.0}) + "\n" + '{"adim": 4, "tdk_')
    egit(a, "tdk", devam=True, cihaz="cpu", yaz=_sus)
    assert _gunluk_adimlari(klasor) == [1, 2, 3, 4, 5, 6]


def test_devam_surdurulecek_egitim_yoksa_hata_verir(calisma):
    a = _ayarlar(calisma, "hic_baslamadi")
    with pytest.raises(AyarHatasi, match=r"sürdürülecek eğitim yok \(.*son\.pt\)\. Yeni bir eğitim için --devam'sız"):
        egit(a, "tdk", devam=True, cihaz="cpu", yaz=_sus)
    assert not a.deney_klasoru.exists()  # sessizce baştan başlamaz, klasör de bırakmaz


def test_devam_ve_uzerine_yaz_birlikte_reddedilir(calisma, duz):
    with pytest.raises(AyarHatasi, match="--devam ve --uzerine-yaz birlikte kullanılamaz"):
        egit(duz, "tdk", devam=True, uzerine_yaz=True, cihaz="cpu", yaz=_sus)
    assert egitim_durumu_oku(duz.deney_klasoru / "tdk")["durum"] == "bitti"


def test_yazilan_komutlar_deneyi_secen_secenekleri_tasir(calisma, monkeypatch):
    a = _ayarlar(calisma, "komut", *KESINTI_AYARLARI)
    ek = " --ayarlar baska.toml --ayar egitim.tdk.en_fazla_adim=6 --deney komut --cihaz cpu"
    _ileride_kes(monkeypatch, 9)
    satirlar: list[str] = []
    egit(a, "tdk", cihaz="cpu", yaz=satirlar.append, komut_eki=ek)
    assert f"Sürdürmek için: python -m turkce_model egit --asama tdk --devam{ek}" in satirlar
    assert f"O ana kadarki en iyi modeli değerlendirmek için: python -m turkce_model degerlendir --asama tdk{ek}" in satirlar


def test_devam_kilitli_egitim_ayarini_reddeder_digerine_not_duser(calisma):
    egit(_ayarlar(calisma, "kilit", *KESINTI_AYARLARI), "tdk", cihaz="cpu", yaz=_sus)
    # degerlendirme_yigini de kilitli: en iyi modelin seçildiği doğrulama kümesini belirler.
    for ayar, alan in (("egitim.tdk.ogrenme_orani=0.01", "ogrenme_orani"), ("egitim.tdk.degerlendirme_yigini=3", "degerlendirme_yigini")):
        with pytest.raises(AyarHatasi, match=alan):
            egit(_ayarlar(calisma, "kilit", *KESINTI_AYARLARI, ayar), "tdk", devam=True, yaz=_sus)
    satirlar: list[str] = []
    sonuc = egit(
        _ayarlar(calisma, "kilit", *KESINTI_AYARLARI, "egitim.tdk.degerlendirme_her=3", "egitim.tdk.hassasiyet=fp32"),
        "tdk",
        devam=True,
        cihaz="cpu",
        yaz=satirlar.append,
    )
    assert sonuc["zaten_bitti"]  # bitmiş eğitim yeniden değerlendirilmez, tabloya satır eklenmez
    for alan in ("degerlendirme_her", "hassasiyet"):
        assert any(alan in s and "Not" in s for s in satirlar)


def test_devam_hazir_veri_degismisse_reddeder(calisma, tmp_path, monkeypatch):
    kok = _kopya(calisma, tmp_path / "ws")
    a = _ayarlar(kok, "veri_degisti", "egitim.tdk.en_fazla_adim=3")  # adım sayısı sınırlı: veri büyüse de 3 kalır
    _ileride_kes(monkeypatch, 5)
    assert egit(a, "tdk", cihaz="cpu", yaz=_sus)["adim"] == 1
    ek = kok / "veri" / "ek_metin"
    ek.mkdir()
    (ek / "ek.txt").write_text("\n\n".join(f"Ek paragraf {i}: kitap ve kalem güzel." for i in range(40)), encoding="utf-8")
    assert main(["veri-hazirla", "--ayarlar", str(kok / "ayarlar.toml")]) == 0
    with pytest.raises(AyarHatasi, match="Hazır veri değişmiş.*TDK eğitim akışı değişmiş") as hata:
        egit(a, "tdk", devam=True, cihaz="cpu", yaz=_sus)
    assert "doğrulama" not in str(hata.value)  # ek metin TDK doğrulamasına karışmaz: yalnız değişen akış anılır


def test_isinma_kaydedilir_eski_kontrol_noktasinda_kisaltilmaz(calisma, monkeypatch):
    ayar = ("egitim.tdk.en_fazla_adim=6", "egitim.tdk.isinma_adimi=4")
    a = _ayarlar(calisma, "isinma", *ayar)
    _ileride_kes(monkeypatch, 5)  # 2. adımın başı
    assert egit(a, "tdk", cihaz="cpu", yaz=_sus)["adim"] == 1
    klasor = a.deney_klasoru / "tdk"
    kn = kontrol_noktasi_yukle(klasor / "son.pt")
    assert kn["isinma"] == 1  # 6 adımlık eğitimde ısınma 4 değil 1 adımdır; kontrol noktası bunu taşır

    # Sürdürülen eğitim ısınmayı ayarlardan yeniden türetmez, kontrol noktasındakine uyar (burada elle 3 yapıldı):
    # kısaltma kuralı ileride değişse de yarıda kalmış bir eğitimin öğrenme oranı eğrisi aynı kalır.
    kayitli = _ayarlar(calisma, "isinma_kayitli", *ayar)
    (kayitli.deney_klasoru / "tdk").mkdir(parents=True)
    torch.save({**kn, "isinma": 3}, kayitli.deney_klasoru / "tdk" / "son.pt")
    # Aynı kontrol noktası, ısınmayı kısaltmayan eski sürümün biçiminde (toplam_adim, rng, isinma… yok).
    eski = _ayarlar(calisma, "isinma_eski", *ayar)
    (eski.deney_klasoru / "tdk").mkdir(parents=True)
    for anahtar in ("toplam_adim", "isinma", "rng", "sabir", "olcekleyici", "kosu", "veri", "bekleyen", "baslangic", "dogrulama_carpani"):
        del kn[anahtar]
    torch.save(kn, eski.deney_klasoru / "tdk" / "son.pt")
    carpanlar: list[int] = []
    asil = egitim.sabit_dogrulama_yiginlari
    monkeypatch.setattr(egitim, "sabit_dogrulama_yiginlari", lambda *p: (carpanlar.append(p[4]), asil(*p))[1])
    satirlar: list[str] = []
    egit(eski, "tdk", devam=True, cihaz="cpu", yaz=satirlar.append)
    egit(a, "tdk", devam=True, cihaz="cpu", yaz=_sus)
    egit(kayitli, "tdk", devam=True, cihaz="cpu", yaz=_sus)

    def oran(k: Path) -> float:  # sürdürülen ilk adımın (2. adım) öğrenme oranı
        return next(g["ogrenme_orani"] for g in _gunluk(k) if g["adim"] == 2)

    assert any("eski bir sürümle" in s and "ısınma 4 adım" in s for s in satirlar)
    assert oran(eski.deney_klasoru / "tdk") == pytest.approx(ogrenme_orani(1, 6, eski.tdk))  # ısınma sürüyor: yarı oran
    assert oran(klasor) == pytest.approx(ogrenme_orani(1, 6, replace(a.tdk, isinma_adimi=1)))
    assert oran(kayitli.deney_klasoru / "tdk") == pytest.approx(ogrenme_orani(1, 6, replace(a.tdk, isinma_adimi=3)))
    # Eski eğitim kendi doğrulama kümesini (çarpan 1) korur; yeni eğitimde küme birikimle ölçeklenir.
    assert carpanlar == [1, a.tdk.birikim, a.tdk.birikim]


# --------------------------------------------------------------------------------------------
# --uzerine-yaz ve yarıda kalan başlangıçlar
# --------------------------------------------------------------------------------------------


def test_uzerine_yaz_denetimler_gecmeden_eski_modeli_silmez(calisma):
    ayar = ("egitim.tdk.en_fazla_adim=2", "egitim.meb.en_fazla_adim=2")
    a = _ayarlar(calisma, "silinmez", *ayar)
    egit(a, "meb", sifirdan=True, cihaz="cpu", yaz=_sus)
    meb_model = a.deney_klasoru / "meb" / "en_iyi.pt"
    assert meb_model.exists()
    with pytest.raises(AyarHatasi, match="TDK modelinden başlar"):  # --sifirdan unutuldu; TDK modeli yok
        egit(a, "meb", uzerine_yaz=True, cihaz="cpu", yaz=_sus)
    assert meb_model.exists()


@pytest.mark.parametrize("hata", [RuntimeError("bellek yetmedi"), KeyboardInterrupt()], ids=["bellek", "ctrl_c"])
def test_uzerine_yaz_ilk_adimi_tamamlayamazsa_eski_egitim_geri_gelir(calisma, monkeypatch, hata):
    a = _ayarlar(calisma, f"uz_{type(hata).__name__}", "egitim.tdk.en_fazla_adim=2")
    egit(a, "tdk", cihaz="cpu", yaz=_sus)
    klasor = a.deney_klasoru / "tdk"
    once = _dosya_ozetleri(klasor)
    assert set(once) == {"son.pt", "en_iyi.pt", "gunluk.jsonl", "durum.json"}
    _ileride_kes(monkeypatch, 1, hata)  # ilk ileri geçiş: yeni ayarlar belleğe sığmadı ya da Ctrl+C
    satirlar: list[str] = []
    if isinstance(hata, KeyboardInterrupt):
        assert egit(a, "tdk", uzerine_yaz=True, cihaz="cpu", yaz=satirlar.append) == {"durduruldu": True, "adim": 0}
        assert not any("--devam" in s for s in satirlar)  # sürdürülecek yeni eğitim yok
    else:
        with pytest.raises(RuntimeError, match="bellek yetmedi"):
            egit(a, "tdk", uzerine_yaz=True, cihaz="cpu", yaz=satirlar.append)
    assert any("eski eğitim geri getirildi" in s for s in satirlar)
    assert _dosya_ozetleri(klasor) == once  # eski model, günlük ve durum olduğu gibi; kenarda dosya kalmadı


def test_uzerine_yaz_eski_egitimi_ilk_adimdan_sonra_siler(calisma, monkeypatch):
    a = _ayarlar(calisma, "uz_siler", "egitim.tdk.en_fazla_adim=3")
    egit(a, "tdk", cihaz="cpu", yaz=_sus)
    klasor = a.deney_klasoru / "tdk"
    eski_kosu = egitim_durumu_oku(klasor)["kosu"]
    kenardakiler: list[list[str]] = []
    asil = egitim._eskileri_sil
    monkeypatch.setattr(egitim, "_eskileri_sil", lambda k: (kenardakiler.append(sorted(y.name for y in k.glob("*.eski"))), asil(k))[1])
    _ileride_kes(monkeypatch, 9)  # 3. adımın başı
    assert egit(a, "tdk", uzerine_yaz=True, cihaz="cpu", yaz=_sus) == {"durduruldu": True, "adim": 2}
    # İlk adım bitene kadar eski eğitim kenarda bekledi, sonra bir kez silindi.
    assert kenardakiler == [["durum.json.eski", "en_iyi.pt.eski", "gunluk.jsonl.eski", "son.pt.eski"]]
    assert not list(klasor.glob("*.eski"))
    assert egitim_durumu_oku(klasor)["kosu"] != eski_kosu  # yeni koşu
    assert _gunluk_adimlari(klasor) == [1, 2]  # eski günlüğün üstüne eklenmedi


def test_yarim_kalmis_uzerine_yaz_sonraki_calistirmada_toparlanir(calisma):
    a = _ayarlar(calisma, "uz_artik", "egitim.tdk.en_fazla_adim=2")
    egit(a, "tdk", cihaz="cpu", yaz=_sus)
    klasor = a.deney_klasoru / "tdk"
    once = _dosya_ozetleri(klasor)
    # Süreç, eski eğitimi kenara aldıktan sonra ilk adımını bitiremeden öldürülmüş gibi (ör. bellek tükenince).
    for ad in ("durum.json", "gunluk.jsonl", "en_iyi.pt", "son.pt"):
        os.replace(klasor / ad, klasor / (ad + ".eski"))
    (klasor / "durum.json").write_text(json.dumps({"durum": "suruyor", "adim": 0, "toplam_adim": 9}), encoding="utf-8")
    (klasor / "gunluk.jsonl").write_text("", encoding="utf-8")
    satirlar: list[str] = []
    sonuc = egit(a, "tdk", devam=True, cihaz="cpu", yaz=satirlar.append)
    assert sonuc["zaten_bitti"] and any("eski eğitim geri getirildi" in s for s in satirlar)
    assert _dosya_ozetleri(klasor) == once


def _olmus_uzerine_yaz(klasor: Path) -> None:
    """--uzerine-yaz'ın süreci, eski eğitimi kenara alıp yeni koşunun durum.json'unu yazdıktan sonra ilk adımını
    bitiremeden öldürülmüş gibi (kill -9, elektrik kesintisi; gerçek süreçle test_cli'de sınanır)."""
    for ad in ("durum.json", "gunluk.jsonl", "en_iyi.pt", "son.pt"):
        os.replace(klasor / ad, klasor / (ad + ".eski"))
    yeni = {"durum": "suruyor", "adim": 0, "toplam_adim": 9, "kosu": "yeni0001"}
    (klasor / "durum.json").write_text(json.dumps(yeni), encoding="utf-8")
    (klasor / "gunluk.jsonl").write_text("", encoding="utf-8")


def test_degerlendir_kenarda_kalan_eski_egitimi_yerine_koyar(calisma):
    a = _ayarlar(calisma, "uz_deg", "egitim.tdk.en_fazla_adim=2")
    egit(a, "tdk", cihaz="cpu", yaz=_sus)
    klasor = a.deney_klasoru / "tdk"
    once = _dosya_ozetleri(klasor)
    for asama in ("tdk", None):  # açık aşama ve varsayılan (MEB modeli yok → TDK)
        _olmus_uzerine_yaz(klasor)
        satirlar: list[str] = []
        sonuc = degerlendir(a, asama, cihaz="cpu", yaz=satirlar.append)  # eskiden "Değerlendirilecek model yok"
        assert sonuc["asama"] == "tdk" and sonuc["adim"] == 2
        assert any(f"{klasor} içinde yarıda kalmış" in s and "eski eğitim geri getirildi" in s for s in satirlar)
        assert _dosya_ozetleri(klasor) == once


def test_suren_uzerine_yazin_kenardaki_dosyalarina_dokunulmaz(calisma, capsys):
    a = _ayarlar(calisma, "uz_suren", "egitim.tdk.en_fazla_adim=2", "egitim.meb.en_fazla_adim=2")
    egit(a, "tdk", cihaz="cpu", yaz=_sus)
    klasor = a.deney_klasoru / "tdk"
    _olmus_uzerine_yaz(klasor)
    kenarda = _dosya_ozetleri(klasor)
    with egitim_kilidi(klasor):  # --uzerine-yaz şu an başka bir süreçte, ilk adımından önce
        with pytest.raises(AyarHatasi, match="yeniden eğitiliyor; eski model yeni eğitimin ilk adımına kadar kenarda"):
            degerlendir(a, "tdk", cihaz="cpu", yaz=_sus)
        with pytest.raises(AyarHatasi, match="MEB aşaması TDK modelinden başlar.*yeniden eğitiliyor"):
            egit(a, "meb", cihaz="cpu", yaz=_sus)
        assert main(["uret", "kitap", "--ayarlar", str(calisma / "ayarlar.toml"), "--deney", "uz_suren"]) == 2
        hata = capsys.readouterr().err  # "model yok" denmez: eski model kenarda, aşama yeniden eğitiliyor
        assert "yeniden eğitiliyor" in hata and "eğitilmiş model yok" not in hata
        assert _dosya_ozetleri(klasor) == kenarda  # kenardakiler süren eğitimindir: yerinde kaldı
    assert not (a.deney_klasoru / "meb").exists()


def test_meb_egitimi_kenardaki_tdk_modelinden_baslar(calisma):
    a = _ayarlar(calisma, "uz_meb", "egitim.tdk.en_fazla_adim=2", "egitim.meb.en_fazla_adim=2")
    egit(a, "tdk", cihaz="cpu", yaz=_sus)
    klasor = a.deney_klasoru / "tdk"
    tdk_kosu = egitim_durumu_oku(klasor)["kosu"]
    _olmus_uzerine_yaz(klasor)
    satirlar: list[str] = []
    egit(a, "meb", cihaz="cpu", yaz=satirlar.append)  # eskiden "MEB aşaması TDK modelinden başlar ama … yok"
    assert any("eski eğitim geri getirildi" in s for s in satirlar)
    assert egitim_durumu_oku(a.deney_klasoru / "meb")["baslangic"] == {"kosu": tdk_kosu, "adim": 2}


def test_devam_kenardaki_bitmis_egitimi_ayarlar_farkli_olsa_da_geri_getirir(calisma):
    a = _ayarlar(calisma, "uz_devam", "egitim.tdk.en_fazla_adim=2")
    egit(a, "tdk", cihaz="cpu", yaz=_sus)
    klasor = a.deney_klasoru / "tdk"
    once = _dosya_ozetleri(klasor)
    _olmus_uzerine_yaz(klasor)
    # --uzerine-yaz'ın denediği yeni ayar: --devam'da kilitli. Geri getirme yine de "zaten bitmiş" ile biter.
    yeni = _ayarlar(calisma, "uz_devam", "egitim.tdk.en_fazla_adim=2", "egitim.tdk.yigin=8")
    satirlar: list[str] = []
    assert egit(yeni, "tdk", devam=True, cihaz="cpu", yaz=satirlar.append, komut_eki=" --deney uz_devam") == {
        "zaten_bitti": True,
        "adim": 2,
    }
    assert any("eski eğitim geri getirildi" in s for s in satirlar)
    assert any(
        "Bu eğitim zaten bitmiş (adım 2/2)" in s and "degerlendir --asama tdk --deney uz_devam" in s for s in satirlar
    )
    assert _dosya_ozetleri(klasor) == once
    with pytest.raises(AyarHatasi, match="yigin"):  # geri geldikten sonra sıradan bir --devam: ayar farkı söylenir
        egit(yeni, "tdk", devam=True, cihaz="cpu", yaz=_sus)


def test_devam_kenardaki_yarim_egitimi_geri_getirip_surdurur(calisma, duz, monkeypatch):
    a = _ayarlar(calisma, "uz_yarim", *KESINTI_AYARLARI)
    _ileride_kes(monkeypatch, 9)  # 3. adımın başı: 2 adım kaydedildi
    assert egit(a, "tdk", cihaz="cpu", yaz=_sus) == {"durduruldu": True, "adim": 2}
    monkeypatch.undo()
    klasor = a.deney_klasoru / "tdk"
    _olmus_uzerine_yaz(klasor)
    satirlar: list[str] = []
    egit(a, "tdk", devam=True, cihaz="cpu", yaz=satirlar.append)
    assert any("eski eğitim geri getirildi" in s for s in satirlar) and "Kaldığı yerden devam: adım 2/6" in satirlar
    _ayni_egitim(duz.deney_klasoru / "tdk", klasor)  # kesintisiz eğitimle aynı yere vardı


def test_veri_iletileri_veri_komut_ekini_tasir(calisma, tmp_path):
    kok = _kopya(calisma, tmp_path / "ws")
    (kok / "ciktilar" / "veri" / "meta.json").unlink()
    a = _ayarlar(kok, "ek")
    ek, veri_eki = " --ayarlar x.toml --cihaz cpu", " --ayarlar x.toml"
    with pytest.raises(AyarHatasi, match=r"Önce: python -m turkce_model veri-hazirla --ayarlar x\.toml$"):
        egit(a, "tdk", cihaz="cpu", yaz=_sus, komut_eki=ek, veri_komut_eki=veri_eki)
    with pytest.raises(AyarHatasi, match=r"veri-hazirla --ayarlar x\.toml --cihaz cpu$"):  # verilmezse komut_eki
        egit(a, "tdk", cihaz="cpu", yaz=_sus, komut_eki=ek)
    with pytest.raises(AyarHatasi, match=r"Önce: python -m turkce_model veri-hazirla --ayarlar x\.toml$"):
        degerlendir(a, "tdk", cihaz="cpu", yaz=_sus, komut_eki=veri_eki)


def test_tek_adim_tamamlamayan_yeni_egitim_iz_birakmaz(calisma, monkeypatch):
    a = _ayarlar(calisma, "izsiz", "egitim.tdk.en_fazla_adim=2")
    _ileride_kes(monkeypatch, 1)
    assert egit(a, "tdk", cihaz="cpu", yaz=_sus) == {"durduruldu": True, "adim": 0}
    klasor = a.deney_klasoru / "tdk"
    # durum.json "durduruldu" kalsaydı durum komutu, olmayan bir eğitim için --devam önerirdi.
    assert [y.name for y in klasor.iterdir()] == ["egitim.kilit"]
    egit(a, "tdk", cihaz="cpu", yaz=_sus)
    assert egitim_durumu_oku(klasor)["durum"] == "bitti"


# --------------------------------------------------------------------------------------------
# Aşama kilidi
# --------------------------------------------------------------------------------------------


def test_ayni_asamada_ikinci_egitim_reddedilir(calisma):
    a = _ayarlar(calisma, "kilitli", "egitim.tdk.en_fazla_adim=1")
    klasor = a.deney_klasoru / "tdk"
    assert egitim_suruyor_mu(klasor) is False  # kilit dosyası yok
    with egitim_kilidi(klasor):  # bu aşamayı başka bir eğitim tutuyor
        assert egitim_suruyor_mu(klasor) is True
        for secenek in ({}, {"devam": True}, {"uzerine_yaz": True}):
            with pytest.raises(AyarHatasi, match="başka bir süreçte eğitiliyor"):
                egit(a, "tdk", cihaz="cpu", yaz=_sus, **secenek)
        assert [y.name for y in klasor.iterdir()] == ["egitim.kilit"]
    assert egitim_suruyor_mu(klasor) is False

    tutuldu: list[bool] = []
    egit(a, "tdk", cihaz="cpu", yaz=lambda _s: tutuldu.append(egitim_suruyor_mu(klasor)))
    assert tutuldu and all(tutuldu)  # başlıktan sondaki otomatik değerlendirmeye kadar kilitli
    assert egitim_suruyor_mu(klasor) is False and (klasor / "egitim.kilit").exists()  # kilit bırakıldı, dosyası kalır


def test_kilit_surecler_arasinda_calisir_ve_surec_olunce_kalkar(tmp_path):
    klasor = tmp_path / "tdk"
    kod = (
        "import sys, time\n"
        "from pathlib import Path\n"
        "from turkce_model.egitim import egitim_kilidi\n"
        "with egitim_kilidi(Path(sys.argv[1])):\n"
        "    print('kilitli', flush=True)\n"
        "    time.sleep(120)\n"
    )
    paket_koku = str(Path(turkce_model.__file__).resolve().parent.parent)
    ortam = {**os.environ, "PYTHONPATH": os.pathsep.join(filter(None, [paket_koku, os.environ.get("PYTHONPATH")]))}
    surec = subprocess.Popen([sys.executable, "-c", kod, str(klasor)], stdout=subprocess.PIPE, env=ortam, text=True)
    try:
        assert surec.stdout.readline().strip() == "kilitli"
        assert egitim_suruyor_mu(klasor) is True
        with pytest.raises(AyarHatasi, match="başka bir süreçte eğitiliyor"), egitim_kilidi(klasor):
            pass
    finally:
        surec.kill()  # süreç ölünce kilidi işletim sistemi kaldırır: bayat kilit kalmaz
        surec.wait()
        surec.stdout.close()
    assert egitim_suruyor_mu(klasor) is False
    with egitim_kilidi(klasor):
        assert egitim_suruyor_mu(klasor) is True


# --------------------------------------------------------------------------------------------
# Hazır verinin sürümü ve imzaları; koşu kimliği
# --------------------------------------------------------------------------------------------


def test_dosya_imzasi_icerigin_ozetidir(tmp_path):
    icerik = os.urandom(2 * (1 << 20) + 5)  # okuma parçasından (1 MiB) büyük
    (tmp_path / "akis.bin").write_bytes(icerik)
    (tmp_path / "bos.bin").write_bytes(b"")
    assert dosya_imzasi(tmp_path / "akis.bin") == hashlib.sha256(icerik).hexdigest()[:16]
    assert dosya_imzasi(tmp_path / "bos.bin") == hashlib.sha256(b"").hexdigest()[:16]


def test_veri_hazirla_surum_ve_icerik_imzalarini_yazar(calisma, tmp_path):
    kok = _kopya(calisma, tmp_path / "ws")
    vk = kok / "ciktilar" / "veri"
    once = meta_oku(vk)
    assert once["surum"] == veri.VERI_SURUMU == 2
    assert set(once["imza"]) == {"tdk_egitim", "tdk_dogrulama", "meb_egitim", "meb_dogrulama"}
    assert once["imza"]["tdk_egitim"] == dosya_imzasi(vk / "tdk_egitim.bin")
    assert once["imza"]["meb_dogrulama"] == dosya_imzasi(vk / "meb_dogrulama.npz")

    ayar = ["--ayarlar", str(kok / "ayarlar.toml")]
    assert main(["veri-hazirla", *ayar]) == 0
    assert meta_oku(vk)["imza"] == once["imza"]  # girdiler aynıysa imzalar aynı: yeniden hazırlamak modeli eskitmez

    ek = kok / "veri" / "ek_metin"
    ek.mkdir()
    (ek / "ek.txt").write_text("\n\n".join(f"Ek paragraf {i}: deniz ve yol güzel." for i in range(400)), encoding="utf-8")
    assert main(["veri-hazirla", *ayar]) == 0
    sonra = meta_oku(vk)["imza"]
    assert sonra["tdk_egitim"] != once["imza"]["tdk_egitim"] and sonra["tdk_dogrulama"] == once["imza"]["tdk_dogrulama"]
    assert sonra["ek_dogrulama"] == dosya_imzasi(vk / "ek_dogrulama.bin")


def test_eski_surumle_hazirlanmis_veri_reddedilir(calisma, tmp_path):
    kok = _kopya(calisma, tmp_path / "ws")
    meta_yolu = kok / "ciktilar" / "veri" / "meta.json"
    meta = json.loads(meta_yolu.read_text(encoding="utf-8"))
    del meta["surum"], meta["imza"]  # önceki sürümün yazdığı meta.json
    meta_yolu.write_text(json.dumps(meta), encoding="utf-8")
    a = _ayarlar(kok, "eski_veri", "egitim.tdk.en_fazla_adim=1")
    for calistir in (lambda: egit(a, "tdk", cihaz="cpu", yaz=_sus), lambda: degerlendir(a, "tdk", cihaz="cpu", yaz=_sus)):
        with pytest.raises(AyarHatasi, match="Hazır veri eski bir sürümle hazırlanmış.*python -m turkce_model veri-hazirla"):
            calistir()
    assert not a.deney_klasoru.exists()
    assert main(["veri-hazirla", "--ayarlar", str(kok / "ayarlar.toml")]) == 0
    egit(a, "tdk", cihaz="cpu", yaz=_sus)


def test_veri_hazirla_kesilirse_eski_meta_kalmaz(calisma, tmp_path, monkeypatch):
    kok = _kopya(calisma, tmp_path / "ws")
    vk = kok / "ciktilar" / "veri"
    asil = veri.AkisYazici.ekle
    sayac = {"n": 0}

    def ekle(self, metin):
        sayac["n"] += 1
        if sayac["n"] == 20:
            raise KeyboardInterrupt
        return asil(self, metin)

    monkeypatch.setattr(veri.AkisYazici, "ekle", ekle)
    assert main(["veri-hazirla", "--ayarlar", str(kok / "ayarlar.toml")]) == 130
    monkeypatch.undo()
    # Akışlar boşaltıldı; eski meta.json yanlarında kalsaydı veri "hazır" görünür, eğitim izleme dökümüyle çökerdi.
    assert not (vk / "meta.json").exists()
    with pytest.raises(AyarHatasi, match="Hazır veri yok"):
        egit(_ayarlar(kok, "yarim_veri"), "tdk", cihaz="cpu", yaz=_sus)


def test_durum_ve_kontrol_noktasi_kosuyu_veriyi_ve_tokenizeri_tanimlar(calisma):
    a = _ayarlar(calisma, "kimlik", "egitim.tdk.en_fazla_adim=3")
    sonuc = egit(a, "tdk", cihaz="cpu", yaz=_sus)
    klasor = a.deney_klasoru / "tdk"
    durum = egitim_durumu_oku(klasor)
    son, en_iyi = kontrol_noktasi_yukle(klasor / "son.pt"), kontrol_noktasi_yukle(klasor / "en_iyi.pt")
    meta = meta_oku(veri_klasoru(a))
    assert durum["durum"] == "bitti" and (durum["adim"], durum["toplam_adim"]) == (3, 3)
    assert re.fullmatch("[0-9a-f]{8}", durum["kosu"]) and son["kosu"] == en_iyi["kosu"] == durum["kosu"]
    assert durum["en_iyi_adim"] == en_iyi["adim"] == sonuc["adim"]
    assert durum["tokenizer"] == son["tokenizer"] == meta["tokenizer"]
    assert durum["veri"] == meta["imza"]["tdk_egitim"]
    assert son["veri"] == {ad: meta["imza"][ad] for ad in ("tdk_egitim", "tdk_dogrulama")}
    assert durum["baslangic"] is None and son["baslangic"] is None and son["bekleyen"] is None
    assert durum["degerlendirildi"] is True  # eğitim sonundaki tam değerlendirme tabloya yazıldı
    assert sonuc["olcum"] == 2 and sonuc["meb_secenek"] == {"4": meta["meb_egitim"]["soru"]}

    egit(a, "tdk", uzerine_yaz=True, cihaz="cpu", yaz=_sus)
    assert egitim_durumu_oku(klasor)["kosu"] != durum["kosu"]  # her yeni eğitim yeni bir koşudur


def test_meb_yarim_tdk_modelinden_baslarken_not_duser_ve_baslangici_kaydeder(calisma, monkeypatch):
    ayar = ("egitim.tdk.en_fazla_adim=4", "egitim.meb.en_fazla_adim=2")
    a = _ayarlar(calisma, "yarim_tdk", *ayar)
    _ileride_kes(monkeypatch, 9)  # 3. adımın başı
    assert egit(a, "tdk", cihaz="cpu", yaz=_sus)["adim"] == 2
    tdk, meb_klasoru = a.deney_klasoru / "tdk", a.deney_klasoru / "meb"
    satirlar: list[str] = []
    egit(a, "meb", cihaz="cpu", yaz=satirlar.append, komut_eki=" --deney yarim_tdk")
    assert (
        "  Not: TDK aşaması bitmemiş (adım 2/4); bitirmek için: python -m turkce_model egit --asama tdk --devam --deney yarim_tdk"
        in satirlar
    )
    # MEB modeli hangi TDK koşusunun hangi adımından başladığını taşır (durum komutu TDK yeniden eğitilince anlar).
    tdk_durumu, meta = egitim_durumu_oku(tdk), meta_oku(veri_klasoru(a))
    baslangic = {"kosu": tdk_durumu["kosu"], "adim": tdk_durumu["en_iyi_adim"]}
    assert baslangic["adim"] == kontrol_noktasi_yukle(tdk / "en_iyi.pt")["adim"]
    meb_durumu, meb_son = egitim_durumu_oku(meb_klasoru), kontrol_noktasi_yukle(meb_klasoru / "son.pt")
    assert meb_durumu["baslangic"] == meb_son["baslangic"] == baslangic
    assert meb_durumu["veri"] == meta["imza"]["meb_egitim"]
    assert meb_son["veri"] == {ad: meta["imza"][ad] for ad in ("tdk_egitim", "tdk_dogrulama", "meb_egitim", "meb_dogrulama")}

    sifirdan = _ayarlar(calisma, "sifirdan", *ayar)
    egit(sifirdan, "meb", sifirdan=True, cihaz="cpu", yaz=_sus)
    assert egitim_durumu_oku(sifirdan.deney_klasoru / "meb")["baslangic"] is None


# --------------------------------------------------------------------------------------------
# İletiler, doğrulama kümesi, değerlendirme
# --------------------------------------------------------------------------------------------


def test_baslik_asamanin_kendi_verisini_gosterir_not_boyut_onermez(calisma):
    a = _ayarlar(calisma, "baslik", "egitim.tdk.en_fazla_adim=1", "egitim.meb.en_fazla_adim=1")
    meta = meta_oku(veri_klasoru(a))
    tdk: list[str] = []
    egit(a, "tdk", cihaz="cpu", yaz=tdk.append)
    assert tdk[0].splitlines()[-1] == f"  Eğitim akışı {binlik(meta['tdk_egitim']['token'])} token | toplam 1 adım"
    notu = next(s for s in tdk if "parametre başına" in s)
    assert "model veriyi ezberleyebilir, doğrulama kaybını izle (erken durdurma açık)." in notu
    assert 'GOMME_KARARLARI.md\'deki "Önce bağlam" bölümüne bak; daha fazla metin: veri/ek_metin.' in notu
    assert "boyut" not in notu  # gömme kararı için yön göstermez

    satirlar: list[str] = []
    egit(a, "meb", cihaz="cpu", yaz=satirlar.append)
    baslik = next(s for s in satirlar if s.startswith("Aşama meb"))
    m = meta["meb_egitim"]
    assert baslik.splitlines()[-1] == (
        f"  MEB eğitim soruları {m['soru']} ({binlik(m['token'])} token) + TDK karışımı %25 | toplam 1 adım"
    )

    kapali: list[str] = []
    egit(_ayarlar(calisma, "baslik_kapali", "egitim.tdk.en_fazla_adim=1", "egitim.tdk.erken_durdurma=0"), "tdk", cihaz="cpu", yaz=kapali.append)
    assert "doğrulama kaybını izle. Veri/parametre" in next(s for s in kapali if "parametre başına" in s)


def test_meb_egitim_sorulari_yoksa_mesaj_kitapciklari_ister(calisma, tmp_path):
    kok = _kopya(calisma, tmp_path / "ws")
    (kok / "ciktilar" / "veri" / "meb_egitim.npz").unlink()
    with pytest.raises(AyarHatasi, match="MEB eğitim soruları hazırlanmamış.*meb-pdf, sonra veri-hazirla") as hata:
        egit(_ayarlar(kok, "sorusuz"), "meb", sifirdan=True, cihaz="cpu", yaz=_sus)
    assert "TurkishMMLU yalnız değerlendirme içindir" in str(hata.value) and "meb-mmlu" not in str(hata.value)


@pytest.mark.parametrize("kayip", ["tum", "cevap"])
def test_sabit_dogrulama_kumesi_yigin_birikim_takasinda_ayni_kalir(calisma, kayip):
    a = _ayarlar(calisma, "kume")
    tok, vk = tokenizer_yukle(a), veri_klasoru(a)
    akis, sorular = AkisVeri(vk / "tdk_dogrulama.bin", tok.boyut), SoruVeri(vk / "meb_dogrulama.npz")
    kumeler = []
    for yigin, birikim in ((8, 2), (2, 8), (4, 4)):  # adım başına hep 16 dizi
        ea = EgitimAyarlari(yigin=yigin, birikim=birikim, degerlendirme_yigini=3, kayip=kayip)
        tdk, meb_yiginlari = sabit_dogrulama_yiginlari(akis, sorular, ea, a.model.baglam)
        assert len(tdk) == len(meb_yiginlari) == 3 * birikim and all(x.shape[0] == yigin for x, _ in tdk)
        pencereler = torch.cat([torch.cat((x, y), dim=1) for x, y in tdk])
        # MEB yığınları kendi içinde dolguludur: dolgu atılınca soru dizileri aynı olmalı.
        sorulanlar = [
            (x[r][x[r] != PAD].tolist(), y[r][y[r] != -100].tolist()) for x, y in meb_yiginlari for r in range(len(x))
        ]
        kumeler.append((pencereler, sorulanlar))
    assert kumeler[0][0].shape[0] == 48 and len(kumeler[0][1]) == 48
    for pencereler, sorulanlar in kumeler[1:]:
        assert torch.equal(pencereler, kumeler[0][0]) and sorulanlar == kumeler[0][1]
    # Eski sürümle başlamış bir eğitimin kümesi (çarpan 1): degerlendirme_yigini yığın.
    tdk, meb_yiginlari = sabit_dogrulama_yiginlari(akis, None, EgitimAyarlari(yigin=8, birikim=4, degerlendirme_yigini=3), a.model.baglam, 1)
    assert len(tdk) == 3 and meb_yiginlari == []


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


def test_model_ile_celisen_asama_reddedilir(calisma, duz):
    yol = duz.deney_klasoru / "tdk" / "en_iyi.pt"
    with pytest.raises(AyarHatasi, match="en_iyi.pt bir tdk aşaması kontrol noktası; --model ile --asama verme"):
        degerlendir(duz, "meb", cihaz="cpu", yaz=_sus, kontrol_noktasi=yol)
    assert _satir_sayisi(calisma, "duz (en_iyi.pt)") == 0  # yanlış aşama etiketiyle satır yazılmadı
    assert degerlendir(duz, "tdk", cihaz="cpu", yaz=_sus, kontrol_noktasi=yol)["asama"] == "tdk"  # aynı aşama sorun değil


def test_model_ile_verilen_yarim_egitim_durduruldu_notu_alir(calisma, duz, monkeypatch):
    a = _ayarlar(calisma, "yarim_model", *KESINTI_AYARLARI)
    _ileride_kes(monkeypatch, 9)
    egit(a, "tdk", cihaz="cpu", yaz=_sus)
    baska = _ayarlar(calisma, "baska")
    for ad in ("son.pt", "en_iyi.pt"):
        sonuc = degerlendir(baska, cihaz="cpu", yaz=_sus, kontrol_noktasi=a.deney_klasoru / "tdk" / ad)
        assert sonuc["durduruldu"] is True  # --model ile de yanındaki durum.json'a bakılır
    bitmis = degerlendir(baska, cihaz="cpu", yaz=_sus, kontrol_noktasi=duz.deney_klasoru / "tdk" / "en_iyi.pt")
    assert "durduruldu" not in bitmis


def test_son_degerlendirme_kesilirse_egitim_bitmis_kalir_sonradan_degerlendirilir(calisma, monkeypatch):
    a = _ayarlar(calisma, "son_deg", "egitim.tdk.en_fazla_adim=2")

    def kes(*_a, **_k):
        raise KeyboardInterrupt

    monkeypatch.setattr(egitim, "akis_kaybi", kes)  # yalnız eğitim sonundaki tam değerlendirme çağırır
    satirlar: list[str] = []
    sonuc = egit(a, "tdk", cihaz="cpu", yaz=satirlar.append, komut_eki=" --deney son_deg")
    monkeypatch.undo()
    assert sonuc == {"durduruldu": True, "adim": 2}
    klasor = a.deney_klasoru / "tdk"
    durum = egitim_durumu_oku(klasor)
    assert durum["durum"] == "bitti" and durum["degerlendirildi"] is False
    assert satirlar[-1] == (
        "\nDeğerlendirme yarıda kesildi; eğitim kaydedildi. Değerlendirmek için: "
        "python -m turkce_model degerlendir --asama tdk --deney son_deg"
    )
    assert _satir_sayisi(calisma, "son_deg") == 0

    degerlendir(a, "tdk", cihaz="cpu", yaz=_sus)  # elle değerlendirme eksik satırı tamamlar
    assert egitim_durumu_oku(klasor)["degerlendirildi"] is True and _satir_sayisi(calisma, "son_deg") == 1


def test_tam_degerlendirme_egitim_yigini_kadar_pencereyle_yapilir(calisma, duz, monkeypatch):
    yiginlar: list[int] = []
    asil = egitim.akis_kaybi
    monkeypatch.setattr(egitim, "akis_kaybi", lambda *p, **k: (yiginlar.append(k["yigin"]), asil(*p, **k))[1])
    kucuk = degerlendir(duz, "tdk", cihaz="cpu", yaz=_sus)
    buyuk = degerlendir(_ayarlar(calisma, "duz", *KESINTI_AYARLARI, "egitim.tdk.yigin=64"), "tdk", cihaz="cpu", yaz=_sus)
    assert yiginlar == [4, 16]  # min(16, egitim.tdk.yigin): eğitime sığan yığın değerlendirmeye de sığar
    assert kucuk["bpc"] == pytest.approx(buyuk["bpc"], rel=1e-5)  # sonuç yığın boyundan bağımsız


# --------------------------------------------------------------------------------------------
# Kontrol noktası dosyaları
# --------------------------------------------------------------------------------------------


def test_bozuk_kontrol_noktasi_anlasilir_hata_verir(calisma, tmp_path):
    a = _ayarlar(calisma, "bozuk", "egitim.tdk.en_fazla_adim=2")
    egit(a, "tdk", cihaz="cpu", yaz=_sus)
    son = a.deney_klasoru / "tdk" / "son.pt"
    icerik = son.read_bytes()
    son.write_bytes(icerik[: len(icerik) // 2])  # yarım yazılmış dosya
    with pytest.raises(AyarHatasi, match="okunamadı"):
        egit(a, "tdk", devam=True, cihaz="cpu", yaz=_sus)
    metin = tmp_path / "ayarlar.toml"
    metin.write_text("[gomme]\n", encoding="utf-8")
    with pytest.raises(AyarHatasi, match="okunamadı"):
        kontrol_noktasi_yukle(metin)
    with pytest.raises(AyarHatasi, match="yok"):
        kontrol_noktasi_yukle(tmp_path / "yok.pt")


def test_kontrol_noktasi_olmayan_dosya_izleme_dokumu_vermez(calisma, tmp_path):
    # torch, zip olmayan dosyayı eski biçim pickle sayar: "b", "h" gibi ilk harfler IndexError / KeyError verirdi.
    for ad, icerik in (("not.pt", "bu bir metin\n"), ("h.pt", "hu bir metin\n")):
        (tmp_path / ad).write_text(icerik, encoding="utf-8")
        with pytest.raises(AyarHatasi, match="okunamadı"):
            kontrol_noktasi_yukle(tmp_path / ad)
    with pytest.raises(AyarHatasi, match="okunamadı"):  # komutların kullandığı yoldan da
        degerlendir(_ayarlar(calisma, "baska"), cihaz="cpu", yaz=_sus, kontrol_noktasi=tmp_path / "not.pt")

    saglam = {"model": {"w": torch.zeros(2000)}, "ayarlar": {"gomme": {}, "model": {}}, "adim": 3}
    eski_bicim = tmp_path / "eski_bicim.pt"
    torch.save(saglam, eski_bicim, _use_new_zipfile_serialization=False)
    assert kontrol_noktasi_yukle(eski_bicim)["adim"] == 3  # eski (zip olmayan) biçimin tamamı okunur
    icerik = eski_bicim.read_bytes()
    for n in range(10, 1000, 30):  # başından kesilmiş eski biçim: struct.error / IndexError kaçardı
        (tmp_path / "kesik.pt").write_bytes(icerik[:n])
        with pytest.raises(AyarHatasi, match="okunamadı"):
            kontrol_noktasi_yukle(tmp_path / "kesik.pt")

    yanlis_turler = (
        {"model": {}, "ayarlar": []},
        {"model": None, "ayarlar": {"gomme": {}, "model": {}}},
        {"model": {}, "ayarlar": {"gomme": None, "model": {}}},
        {"model": {}, "ayarlar": {"gomme": {}}},
        [1, 2],
    )
    for bozuk in yanlis_turler:
        torch.save(bozuk, tmp_path / "tur.pt")
        with pytest.raises(AyarHatasi, match="bir turkce-model kontrol noktası değil"):
            kontrol_noktasi_yukle(tmp_path / "tur.pt")
    katman = torch.nn.Linear(2, 2)
    for kn in ({"model": None}, {}, {"model": {"weight": "metin"}}):
        with pytest.raises(AyarHatasi, match="yüklenemedi"):
            durumu_yukle(katman, kn, tmp_path / "tur.pt")


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

    def yarim_kaydet(veri_, hedef):
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

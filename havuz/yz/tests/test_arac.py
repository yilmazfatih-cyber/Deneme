"""Araç tanımı testleri: imza + belge dizgisi → şema, doğrulama, zaman aşımı, kutu (izin/onay)."""

import time
from typing import Literal

import pytest

from yz.ajan.onay import hepsini_onayla, hepsini_reddet, konsoldan_sor, listeden_onayla
from yz.arac import Arac, AracKutusu, arac, belge_dizgisini_coz
from yz.arac.tanim import AracSonucu, SemaliArac, cikti_metni
from yz.guvenlik import AracIzinListesi
from yz.hatalar import AracHatasi
from yz.saglayici import AracCagrisi


@arac
def kur_cevir(
    tutar: float,
    kur: float = 1.0,
    birim: Literal["TRY", "USD"] = "TRY",
    etiketler: list[str] | None = None,
) -> str:
    """Tutarı verilen kurla çevirir.

    Bu ikinci paragraf açıklamaya girmez.

    Args:
        tutar: Çevrilecek tutar.
        kur: Çevirme kuru; varsayılan 1.
            İkinci satır da açıklamaya eklenir.
        birim: Sonucun para birimi.

    Returns:
        Metin olarak sonuç.
    """
    return f"{tutar * kur:.2f} {birim}"


def test_semasi_imza_ve_belge_dizgisinden_cikar():
    tanim = kur_cevir.tanim()
    assert tanim.ad == "kur_cevir" and tanim.aciklama == "Tutarı verilen kurla çevirir."
    ozellik = tanim.parametreler["properties"]
    assert ozellik["tutar"] == {"type": "number", "description": "Çevrilecek tutar."}
    assert ozellik["kur"]["default"] == 1.0 and "İkinci satır" in ozellik["kur"]["description"]
    assert ozellik["birim"]["enum"] == ["TRY", "USD"]
    assert tanim.parametreler["required"] == ["tutar"]
    assert "title" not in str(tanim.parametreler)  # gereksiz başlıklar atılır


def test_dogrulama_ve_duzeltme():
    assert (
        kur_cevir.calistir({"tutar": "1.250,50", "kur": 2}).icerik == "2501.00 TRY"
    )  # Türkçe sayı
    assert (
        kur_cevir.calistir({"Tutar": 10, "birim": "usd"}).icerik == "10.00 USD"
    )  # anahtar ve enum eşleme
    sonuc = kur_cevir.calistir({"kur": 2})
    assert (
        sonuc.hata
        and "tutar: eksik alan" in sonuc.icerik
        and "Beklenen argümanlar: tutar, kur" in sonuc.icerik
    )
    assert kur_cevir.calistir("bozuk").hata  # type: ignore[arg-type]
    assert kur_cevir(3, 2) == "6.00 TRY"  # doğrudan çağrı


def test_istisna_gozleme_doner_ve_zaman_asimi():
    @arac(zaman_asimi_sn=0.2)
    def yavas(sure: float) -> str:
        """Bekler."""
        time.sleep(sure)
        return "bitti"

    @arac
    def patlar() -> str:
        """Hata verir."""
        raise RuntimeError("disk dolu")

    baslangic = time.perf_counter()
    sonuc = yavas.calistir({"sure": 5})
    assert sonuc.hata and "zaman aşımı" in sonuc.icerik and time.perf_counter() - baslangic < 2
    assert yavas.calistir({"sure": 0}).icerik == "bitti"
    assert patlar.calistir({}) == AracSonucu(
        "Hata: `patlar` çalışırken sorun çıktı: disk dolu", hata=True
    )


def test_cikti_metne_cevrilir_ve_kirpilir():
    @arac
    def buyuk() -> dict[str, object]:
        """Büyük çıktı."""
        return {"veri": "x" * 10_000, "tr": "çğış"}

    sonuc = buyuk.calistir({})
    assert len(sonuc.icerik) <= 4000 and sonuc.icerik.endswith("…") and not sonuc.hata
    assert cikti_metni(None) == "(boş sonuç)" and cikti_metni([1, "ğ"]) == '[1, "ğ"]'


def test_tanim_hatalari():
    def aciklamasiz(x: int) -> int:
        return x

    def tipsiz(x):
        """Tip yok."""
        return x

    def yildizli(*args: int) -> int:
        """Yıldızlı."""
        return 0

    with pytest.raises(AracHatasi, match="belge dizgisi"):
        Arac(aciklamasiz)
    with pytest.raises(AracHatasi, match="tip ipucu"):
        Arac(tipsiz)
    with pytest.raises(AracHatasi, match=r"\*args"):
        Arac(yildizli)
    with pytest.raises(AracHatasi, match="Araç adı"):
        Arac(kur_cevir.islev, ad="kur çevir")


def test_belge_dizgisi_turkce_bolum_adi():
    aciklama, parametreler = belge_dizgisini_coz(
        "Kısa açıklama.\n\nParametreler:\n    a (int): Birinci.\n    b: İkinci.\n"
    )
    assert aciklama == "Kısa açıklama." and parametreler == {"a": "Birinci.", "b": "İkinci."}


def test_kutu_bilinmeyen_izinsiz_ve_onay():
    @arac(tehlikeli=True)
    def sil(yol: str) -> str:
        """Dosya siler."""
        return f"silindi: {yol}"

    cagri = AracCagrisi(kimlik="1", ad="sil", argumanlar={"yol": "x"})
    assert AracKutusu([kur_cevir, sil]).cagir(cagri).hata  # onay kancası yok → ret
    assert AracKutusu([sil], onay=hepsini_reddet).cagir(cagri).icerik.startswith("Kullanıcı")
    assert AracKutusu([sil], onay=hepsini_onayla).cagir(cagri).icerik == "silindi: x"
    assert AracKutusu([sil], onay=listeden_onayla(["sil"])).cagir(cagri).icerik == "silindi: x"
    yanit = AracKutusu([sil]).cagir(AracCagrisi(kimlik="1", ad="uydurma", argumanlar={}))
    assert yanit.hata and "Kullanılabilen araçlar: sil" in yanit.icerik
    kisitli = AracKutusu([kur_cevir, sil], izin=AracIzinListesi.yalniz({"kur_cevir"}))
    assert kisitli.adlar == ["kur_cevir"] and [t.ad for t in kisitli.tanimlar()] == ["kur_cevir"]
    assert kisitli.cagir(cagri).hata and "kapalı" in kisitli.cagir(cagri).icerik
    with pytest.raises(AracHatasi, match="zaten var"):
        AracKutusu([sil, sil])


def test_konsoldan_sor():
    sorular: list[str] = []
    kanca = konsoldan_sor(girdi=lambda s: "Evet", cikti=sorular.append)
    assert kanca(kur_cevir, {"tutar": 1}) and any("kur_cevir" in s for s in sorular)
    assert not konsoldan_sor(girdi=lambda s: "h", cikti=lambda s: None)(kur_cevir, {})


def test_semali_arac():
    gelen: list[dict[str, object]] = []

    def calistirici(argumanlar: dict[str, object]) -> AracSonucu:
        gelen.append(argumanlar)
        return AracSonucu("sonuç", hata=False)

    sema = {"type": "object", "properties": {"q": {"type": "string"}}, "required": ["q"]}
    semali = SemaliArac("uzak-arac", "Uzaktaki araç.", sema, calistirici)
    assert semali.calistir({"q": "x"}).icerik == "sonuç" and gelen == [{"q": "x"}]
    assert semali.calistir({}).hata and "eksik argüman: q" in semali.calistir({}).icerik
    assert semali.tanim().parametreler["required"] == ["q"]


def test_onay_kancasi_calisacak_argumanlari_gorur():
    """Tehlikeli araçta onay, aracın GERÇEKTEN çalışacağı (düzeltilmiş) argümanlar üzerinden sorulur.

    Küçük-model düzeltmesi "Yol" anahtarını "yol"a eşler ve ilk geleni seçer; kanca ham argümana bakarsa
    "tmp/x"i onaylar ama araç "onemli.txt" ile çalışırdı.
    """
    silinen: list[str] = []

    @arac(tehlikeli=True)
    def dosya_sil(yol: str) -> str:
        """Dosyayı siler."""
        silinen.append(yol)
        return f"silindi: {yol}"

    gorulen: list[dict[str, object]] = []

    def yalniz_tmp(arac_: Arac, argumanlar: dict[str, object]) -> bool:
        gorulen.append(dict(argumanlar))
        return str(argumanlar.get("yol", "")).startswith("tmp/")

    kutu = AracKutusu([dosya_sil], onay=yalniz_tmp)
    hileli = AracCagrisi(kimlik="1", ad="dosya_sil", argumanlar={"Yol": "onemli.txt", "yol": "tmp/x"})
    sonuc = kutu.cagir(hileli)
    assert silinen == [] and sonuc.hata
    assert gorulen == [{"yol": "onemli.txt"}]
    sarili = AracCagrisi(kimlik="2", ad="dosya_sil", argumanlar={"girdi": {"yol": "onemli.txt"}})
    assert kutu.cagir(sarili).hata and silinen == []
    assert kutu.cagir(AracCagrisi(kimlik="3", ad="dosya_sil", argumanlar={"yol": "tmp/a"})).icerik == (
        "silindi: tmp/a"
    )
    assert silinen == ["tmp/a"]
    # Geçersiz argümanda kanca hiç sorulmaz (onaylanacak bir şey yok).
    gorulen.clear()
    assert kutu.cagir(AracCagrisi(kimlik="4", ad="dosya_sil", argumanlar={})).hata and gorulen == []

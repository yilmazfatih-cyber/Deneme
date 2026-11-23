"""``[moduller]`` ayarları: yerel model sunucusu ve rollerin modelleri. Varsayılan: hepsi kapalı.

Bu dosya ``turkce_model.ayarlar``'ı modül düzeyinde içe aktarmaz (o dosya bunu içe aktarır); ``AyarHatasi``
işlevlerin içinde alınır.
"""

from __future__ import annotations

from dataclasses import dataclass, field, fields, replace
from typing import Any
from urllib.parse import urlsplit

VARSAYILAN_ADRES = "http://localhost:11434/v1"
"""Ollama'nın OpenAI uyumlu adresi. llama.cpp: http://localhost:8080/v1, LM Studio: http://localhost:1234/v1,
vLLM: http://localhost:8000/v1."""
EN_BUYUK_ZAMAN_ASIMI = 7 * 24 * 3600
"""``zaman_asimi``nin üst sınırı (bir hafta, saniye). Çok büyük değer (1e10) istek kurulurken taşma hatası verirdi."""


@dataclass
class OcrAyarlari:
    model: str = ""
    """Sunucudaki modelin adı (ör. ``"deepseek-ocr"``). Boşsa OCR modülü kapalıdır."""
    istem: str = "Free OCR."
    """DeepSeek-OCR'ın resmî düz metin istemi (soru fotoğrafı, genel kullanım). Model istemin yazımına
    duyarlıdır; değiştirme gereği yoksa dokunma."""
    belge_istemi: str = "<|grounding|>Convert the document to markdown."
    """Kitapçık sayfaları için resmî istem: düzeni korur ve şekillerin yerini işaretler (şekilli sorular
    böylece elenebilir)."""
    dpi: int = 150
    """PDF sayfaları bu çözünürlükte görüntüye çevrilir."""
    en_fazla_token: int = 4096
    ek_istek: dict = field(default_factory=dict)
    """İsteğe eklenen sunucuya özel alanlar (ör. vLLM'in tekrar önleyici ayarları)."""


@dataclass
class MetinAyarlari:
    model: str = ""
    """Sunucudaki modelin adı (ör. ``"deepseek-r1:1.5b"``). Boşsa kıyas modülü kapalıdır."""
    en_fazla_token: int = 1024
    """Cevap + (varsa) düşünme için üst sınır."""
    ek_istek: dict = field(default_factory=dict)


@dataclass
class ModulAyarlari:
    adres: str = VARSAYILAN_ADRES
    zaman_asimi: float = 900
    """Bir istek için saniye. CPU'da bir sayfanın OCR'ı dakikalar sürebilir."""
    uzak_sunucu: bool = False
    """``true`` olmadıkça yalnız bu bilgisayardaki ya da yerel ağdaki adresler kabul edilir: TDK/MEB içeriği
    dışarı gönderilmez."""
    ocr: OcrAyarlari = field(default_factory=OcrAyarlari)
    metin: MetinAyarlari = field(default_factory=MetinAyarlari)


_ALT_BOLUMLER = {"ocr": OcrAyarlari, "metin": MetinAyarlari}


def _hata(mesaj: str) -> Exception:
    from ..ayarlar import AyarHatasi

    return AyarHatasi(mesaj)


def _alanlari_uygula(nesne: Any, veriler: Any, yol: str) -> Any:
    if not isinstance(veriler, dict):
        raise _hata(f"{yol} bir bölümdür, tek bir değer olamaz; bir alanı değiştirmek için: --ayar {yol}.<alan>=<değer>")
    gecerli = {f.name for f in fields(nesne)}
    for anahtar in veriler:
        if anahtar not in gecerli:
            raise _hata(f"Bilinmeyen ayar: {yol}.{anahtar}. Geçerli alanlar: {', '.join(sorted(gecerli))}")
    return replace(nesne, **veriler)


def moduller_uygula(mevcut: ModulAyarlari, ham: Any) -> ModulAyarlari:
    """Ayar dosyasının ``[moduller]`` bölümünü (ve ``[moduller.ocr]``, ``[moduller.metin]``) uygular, doğrular."""
    if not isinstance(ham, dict):
        raise _hata("moduller bir bölümdür, tek bir değer olamaz; örneğin: --ayar moduller.ocr.model=deepseek-ocr")
    ham = dict(ham)
    alt = {ad: ham.pop(ad) for ad in _ALT_BOLUMLER if ad in ham}
    yeni = _alanlari_uygula(mevcut, ham, "moduller")
    for ad, veriler in alt.items():
        setattr(yeni, ad, _alanlari_uygula(getattr(yeni, ad), veriler, f"moduller.{ad}"))
    modulleri_dogrula(yeni)
    return yeni


def _tam_sayi(x: Any) -> bool:
    return isinstance(x, int) and not isinstance(x, bool)


def _adres_gecerli(adres: str) -> bool:
    """Adres ayrıştırılabiliyor mu? Kapanmamış köşeli ayraç ("http://[::1/v1"), sayı olmayan ya da aralık dışı
    kapı, boş ya da boşluk içeren sunucu adı geçersizdir."""
    try:
        parca = urlsplit(adres)
        ana, _ = parca.hostname, parca.port  # kapı okunamazsa ValueError
    except ValueError:
        return False
    return bool(ana) and not any(c.isspace() for c in parca.netloc)


def modulleri_dogrula(m: ModulAyarlari) -> None:
    hatalar: list[str] = []
    if not isinstance(m.adres, str) or not m.adres.startswith(("http://", "https://")):
        hatalar.append(f"moduller.adres http:// ile başlayan bir adres olmalı (şu an: {m.adres!r}); ör. {VARSAYILAN_ADRES}")
    elif not _adres_gecerli(m.adres):
        hatalar.append(f"moduller.adres geçerli bir adres değil (şu an: {m.adres!r}); ör. {VARSAYILAN_ADRES}")
    # Karşılaştırma nan'ı, sonsuzu ve float'a çevrilemeyecek kadar büyük tam sayıyı da (math.isfinite taşardı) reddeder.
    if (
        isinstance(m.zaman_asimi, bool)
        or not isinstance(m.zaman_asimi, (int, float))
        or not 0 < m.zaman_asimi <= EN_BUYUK_ZAMAN_ASIMI
    ):
        hatalar.append(
            f"moduller.zaman_asimi pozitif bir sayı (saniye) olmalı, en çok {EN_BUYUK_ZAMAN_ASIMI} (bir hafta) "
            f"(şu an: {m.zaman_asimi!r})"
        )
    if not isinstance(m.uzak_sunucu, bool):
        hatalar.append(f"moduller.uzak_sunucu true ya da false olmalı (şu an: {m.uzak_sunucu!r})")
    for ad in _ALT_BOLUMLER:
        b = getattr(m, ad)
        if not isinstance(b.model, str):
            hatalar.append(f'moduller.{ad}.model tırnak içinde bir model adı olmalı (şu an: {b.model!r}); kapatmak için ""')
        if not _tam_sayi(b.en_fazla_token) or b.en_fazla_token <= 0:
            hatalar.append(f"moduller.{ad}.en_fazla_token pozitif bir tam sayı olmalı (şu an: {b.en_fazla_token!r})")
        if not isinstance(b.ek_istek, dict):
            hatalar.append(f"moduller.{ad}.ek_istek bir tablo olmalı; ör. ek_istek = {{ skip_special_tokens = false }}")
    for alan, varsayilan in (("istem", "Free OCR."), ("belge_istemi", "<|grounding|>Convert the document to markdown.")):
        deger = getattr(m.ocr, alan)
        if not isinstance(deger, str) or not deger.strip():
            hatalar.append(f'moduller.ocr.{alan} boş olamaz; varsayılan: "{varsayilan}"')
    if not _tam_sayi(m.ocr.dpi) or not 50 <= m.ocr.dpi <= 600:
        hatalar.append(f"moduller.ocr.dpi 50 ile 600 arasında bir tam sayı olmalı (şu an: {m.ocr.dpi!r})")
    if hatalar:
        raise _hata("Modül ayarlarında sorun var:\n  • " + "\n  • ".join(hatalar))

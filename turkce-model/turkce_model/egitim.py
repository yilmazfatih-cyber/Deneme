"""Eğitim döngüsü: aşama 1 (TDK derlemi) ve aşama 2 (MEB soruları ile ince ayar)."""

from __future__ import annotations

import contextlib
import errno
import json
import math
import os
import secrets
import time
from collections import Counter
from dataclasses import asdict, replace
from functools import partial
from pathlib import Path

import numpy as np
import torch

from .ayarlar import (
    HASSASIYETLER,
    Ayarlar,
    AyarHatasi,
    EgitimAyarlari,
    GommeAyarlari,
    ModelAyarlari,
    egitimi_dogrula,
    gommeyi_dogrula,
)
from .degerlendirme import OLCUM_SURUMU, akis_kaybi, bpc, coktan_secmeli, ilerleme_ekle
from .metin import binlik
from .model import TurkceGPT
from .tokenizer import PAD, TurkceTokenizer
from .veri import VERI_SURUMU, AkisVeri, SoruVeri, meta_oku, tokenizer_gomme_imzasi, tokenizer_imzasi

ASAMALAR = ("tdk", "meb")
CIHAZLAR = ("cpu", "cuda", "mps")
_AUTOCAST_TURLERI = {"bf16": torch.bfloat16, "fp16": torch.float16}

# --devam'da değiştirilemeyen eğitim ayarları: adım sayısını, öğrenme oranı eğrisini, veri akışını ya da en iyi
# modelin seçildiği doğrulama kümesini belirlerler.
# Diğerleri (degerlendirme_her, erken_durdurma, hassasiyet, derle) bir notla değişebilir.
KILITLI_EGITIM_ALANLARI = (
    "donem",
    "en_fazla_adim",
    "yigin",
    "birikim",
    "ogrenme_orani",
    "min_oran",
    "isinma_adimi",
    "agirlik_azaltma",
    "gradyan_kirpma",
    "degerlendirme_yigini",
    "tohum",
    "kayip",
    "tdk_karisim",
)

BOLUM_ADLARI = {"dogrulama": "doğrulama", "test": "test"}

# durum.json'daki "durum" değerleri: biten ve yarıda kalan eğitim.
BITMIS_DURUMLAR = ("bitti", "erken_durdu")
YARIM_DURUMLAR = ("suruyor", "durduruldu")

KILIT_DOSYASI = "egitim.kilit"
# Bir aşamanın dosyaları, --uzerine-yaz'da kenara alınma sırasıyla. son.pt en son alınır: kenara alma yarıda
# kaldıysa son.pt hâlâ yerindedir ve bundan anlaşılır.
_ASAMA_DOSYALARI = ("durum.json", "gunluk.jsonl", "en_iyi.pt", "son.pt")
# Her aşamanın kullandığı hazır veri dosyaları (meta.json "imza" anahtarları) ve iletilerdeki adları.
_ASAMA_AKISLARI = {
    "tdk": ("tdk_egitim", "tdk_dogrulama"),
    "meb": ("tdk_egitim", "tdk_dogrulama", "meb_egitim", "meb_dogrulama"),
}
_AKIS_ADLARI = {
    "tdk_egitim": "TDK eğitim akışı",
    "tdk_dogrulama": "TDK doğrulama akışı",
    "meb_egitim": "MEB eğitim soruları",
    "meb_dogrulama": "MEB doğrulama soruları",
}


def cihaz_sec() -> str:
    if torch.cuda.is_available():
        return "cuda"
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def cihaz_dogrula(cihaz: str | None) -> str:
    """İstenen cihaz bu bilgisayarda kullanılabilir mi? ``None`` ise en iyisini seçer."""
    if cihaz is None:
        return cihaz_sec()
    if cihaz not in CIHAZLAR:
        raise AyarHatasi(f"Bilinmeyen cihaz: {cihaz!r} ({' | '.join(CIHAZLAR)})")
    if cihaz == "cuda" and not torch.cuda.is_available():
        raise AyarHatasi(
            "--cihaz cuda seçildi ama CUDA kullanılamıyor: NVIDIA ekran kartı, sürücüsü ya da CUDA destekli PyTorch "
            "yok. README'deki 'Kurulum' bölümüne bak ya da --cihaz vermeden otomatik seçime bırak."
        )
    if cihaz == "mps" and not (getattr(torch.backends, "mps", None) and torch.backends.mps.is_available()):
        raise AyarHatasi("--cihaz mps seçildi ama MPS kullanılamıyor (Apple Silicon'lu Mac ve MPS destekli PyTorch gerekir).")
    return cihaz


def hassasiyet_sec(istenen: str, cihaz: str) -> str:
    if istenen not in HASSASIYETLER:
        raise AyarHatasi(f"hassasiyet şunlardan biri olmalı: {', '.join(HASSASIYETLER)} (şu an: {istenen!r})")
    if istenen != "otomatik":
        return istenen
    if cihaz == "cuda":
        return "bf16" if torch.cuda.is_bf16_supported() else "fp16"
    return "fp32"


def baglam_yoneticisi(cihaz: str, hassasiyet: str):
    if hassasiyet == "fp32":
        return contextlib.nullcontext
    if hassasiyet not in _AUTOCAST_TURLERI:
        raise AyarHatasi(f"Bilinmeyen hassasiyet: {hassasiyet!r} (fp32 | bf16 | fp16)")
    return partial(torch.autocast, device_type=cihaz, dtype=_AUTOCAST_TURLERI[hassasiyet])


def ogrenme_orani(adim: int, toplam: int, ea: EgitimAyarlari) -> float:
    """Doğrusal ısınma + kosinüs düşüş (ogrenme_orani × min_oran'a kadar)."""
    if adim < ea.isinma_adimi:
        return ea.ogrenme_orani * (adim + 1) / ea.isinma_adimi
    oran = min(1.0, (adim - ea.isinma_adimi) / max(1, toplam - ea.isinma_adimi))
    katsayi = 0.5 * (1.0 + math.cos(math.pi * oran))
    return ea.ogrenme_orani * (ea.min_oran + (1.0 - ea.min_oran) * katsayi)


def kisa_egitim_ayarlari(ea: EgitimAyarlari, toplam_adim: int) -> tuple[int, int]:
    """Kısa eğitimlerde değerlendirme aralığı ve ısınma: ``(her, isinma)``.

    Değerlendirme en az ~10 kez yapılır (yoksa erken durdurma ve en iyi model seçimi çalışmaz); ısınma toplam
    adımın beşte birini geçmez (yoksa öğrenme oranı hedefine hiç ulaşmaz). Uzun eğitimlerde ayarlar aynen kalır.
    Yalnız ayarlardan ve veri boyundan türediği için ``--devam`` ile tutarlıdır.
    """
    her = min(ea.degerlendirme_her, max(1, toplam_adim // 10))
    isinma = min(ea.isinma_adimi, max(1, toplam_adim // 5))
    return her, isinma


def sabit_dogrulama_yiginlari(
    akis: AkisVeri, sorular: SoruVeri | None, ea: EgitimAyarlari, baglam: int, carpan: int | None = None
) -> tuple[list, list]:
    """Eğitim sırasında en iyi modeli seçen sabit doğrulama kümeleri: ``(TDK yığınları, MEB yığınları)``.

    Küme ``degerlendirme_yigini × birikim`` yığın × ``yigin`` dizidir; yani adım başına dizi sayısıyla
    (``yigin × birikim``) ölçeklenir. Pencereler aynı üreteçten sırayla çekildiği için yigin'i küçültüp birikim'i
    aynı oranda büyütmek tam aynı pencereleri puanlar. ``carpan`` yalnız eski bir sürümle başlamış eğitim
    sürdürülürken verilir (o sürümde küme ``degerlendirme_yigini`` yığındı: çarpan 1).
    """
    adet = ea.degerlendirme_yigini * (ea.birikim if carpan is None else carpan)
    secim = np.random.default_rng(0)  # sabit: her değerlendirmede aynı, birbirinden farklı yığınlar
    tdk = [akis.yigin(ea.yigin, baglam, secim) for _ in range(adet)]
    meb: list = []
    if sorular is not None and len(sorular):
        secim = np.random.default_rng(1)
        meb = [sorular.yigin(ea.yigin, baglam, secim, ea.kayip) for _ in range(adet)]
    return tdk, meb


# --------------------------------------------------------------------------------------------
# Yollar ve yükleme
# --------------------------------------------------------------------------------------------


def tokenizer_klasoru(ayarlar: Ayarlar) -> Path:
    return ayarlar.cikti_klasoru / "tokenizer"


def veri_klasoru(ayarlar: Ayarlar) -> Path:
    return ayarlar.cikti_klasoru / "veri"


def tokenizer_yukle(ayarlar: Ayarlar, komut_eki: str = "") -> TurkceTokenizer:
    """Kayıtlı tokenizer. ``komut_eki``: yazılan komutun sonuna eklenen seçenekler (``cli._komut_eki``)."""
    klasor = tokenizer_klasoru(ayarlar)
    if not (klasor / "sozcukler.tsv").exists():
        raise AyarHatasi(f"Tokenizer bulunamadı ({klasor}). Önce: python -m turkce_model tokenizer-egit{komut_eki}")
    return TurkceTokenizer.yukle(klasor)


def hazir_veri(ayarlar: Ayarlar, tok: TurkceTokenizer, komut_eki: str = "") -> dict:
    """Hazır verinin ``meta.json``'u; veri yoksa, başka tokenizer'la ya da eski biçimde hazırlanmışsa ``AyarHatasi``.

    ``komut_eki``: yazılan ``veri-hazirla`` komutunun sonuna eklenen, çağrının ``--ayarlar`` / ``--ayar`` / ``--deney``
    seçenekleri (``cli._komut_eki``). Böylece kopyalanan komut başka bir ayar dosyasının verisini hazırlamaz.
    """
    klasor = veri_klasoru(ayarlar)
    meta = meta_oku(klasor)
    komut = f"python -m turkce_model veri-hazirla{komut_eki}"
    if meta is None:
        raise AyarHatasi(f"Hazır veri yok ({klasor}). Önce: {komut}")
    if meta.get("tokenizer") != tokenizer_imzasi(tok):
        raise AyarHatasi(f"Veri başka bir tokenizer'la hazırlanmış. Yeniden çalıştır: {komut}")
    surum = meta.get("surum", 1)
    if not isinstance(surum, int) or surum < VERI_SURUMU:
        raise AyarHatasi(
            "Hazır veri eski bir sürümle hazırlanmış (ek metnin doğrulama payı TDK doğrulamasına karışık olabilir). "
            f"Yeniden çalıştır: {komut}"
        )
    return meta


def _veri_imzalari(meta: dict, asama: str) -> dict:
    """Aşamanın kullandığı hazır veri dosyalarının imzaları (``meta.json`` "imza"); olmayan dosya ``None``."""
    imza = meta.get("imza")
    imza = imza if isinstance(imza, dict) else {}
    return {ad: imza.get(ad) for ad in _ASAMA_AKISLARI[asama]}


def model_kur(gomme: GommeAyarlari, model_ayar: ModelAyarlari, tok: TurkceTokenizer) -> TurkceGPT:
    gommeyi_dogrula(gomme, model_ayar)
    return TurkceGPT.tokenizer_ile(gomme, model_ayar, tok)


def kontrol_noktasi_yukle(yol: Path, cihaz: str = "cpu") -> dict:
    """Kontrol noktasını yükler. ``weights_only``: dosyada yalnız tensör ve basit değerler olabilir, başkasından
    gelen bir dosya kod çalıştıramaz. Bozuk, yarım ya da başka türden dosya açıklamalı ``AyarHatasi`` verir."""
    yol = Path(yol)
    if not yol.is_file():
        raise AyarHatasi(f"Model dosyası yok: {yol}")
    try:
        kn = torch.load(yol, map_location=cihaz, weights_only=True)
    except Exception as e:  # weights_only kod çalıştırmaz; Ctrl+C (KeyboardInterrupt) yine yukarı çıkar
        ayrinti = str(e).strip().splitlines()[0][:200] if str(e).strip() else ""
        raise AyarHatasi(
            f"{yol} okunamadı: geçerli bir turkce-model kontrol noktası değil ya da yarım yazılmış/bozuk. "
            f"({type(e).__name__}{': ' + ayrinti if ayrinti else ''})"
        ) from e
    ayar = kn.get("ayarlar") if isinstance(kn, dict) else None
    if not (
        isinstance(ayar, dict)
        and isinstance(kn.get("model"), dict)
        and all(isinstance(ayar.get(bolum), dict) for bolum in ("gomme", "model"))
    ):
        raise AyarHatasi(f"{yol} bir turkce-model kontrol noktası değil.")
    return kn


def _kayitli_adim(yol: Path) -> int | None:
    """Bir kontrol noktasının adımı; dosya yoksa ya da okunamıyorsa ``None``."""
    try:
        return int(kontrol_noktasi_yukle(yol)["adim"])
    except (AyarHatasi, KeyError, TypeError, ValueError):
        return None


def guvenli_kaydet(veri: dict, yol: Path) -> None:
    """Önce geçici dosyaya yazar, sonra yerine taşır: yazarken kesilse de eski dosya sağlam kalır."""
    gecici = yol.with_name(yol.name + ".yaziliyor")
    torch.save(veri, gecici)
    os.replace(gecici, yol)


def egitim_durumu_oku(klasor: Path, dosya: str = "durum.json") -> dict | None:
    """Bir aşamanın ``durum.json`` dosyası; yoksa ya da okunamıyorsa ``None``. Alanlar (eski koşularda bir kısmı yok)::

        {"durum": "suruyor" | "bitti" | "erken_durdu" | "durduruldu", "adim": …, "toplam_adim": …, "zaman": "…",
         "kosu": "<koşu kimliği>", "en_iyi_adim": <en_iyi.pt'nin adımı | null>, "tokenizer": "<imza>",
         "veri": "<aşamanın eğitim verisinin imzası>", "baslangic": {"kosu": …, "adim": …} | null,
         "degerlendirildi": true | false}

    ``dosya="durum.json.eski"``: yarıda kalmış bir ``--uzerine-yaz``ın kenara aldığı eski eğitimin kaydı.
    """
    yol = Path(klasor) / dosya
    try:
        durum = json.loads(yol.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return durum if isinstance(durum, dict) else None


def _egitim_durumu_yaz(klasor: Path, durum: dict) -> None:
    gecici = klasor / "durum.json.yaziliyor"
    gecici.write_text(json.dumps(durum, ensure_ascii=False), encoding="utf-8")
    os.replace(gecici, klasor / "durum.json")


def _degerlendirildi_isaretle(klasor: Path, kosu: str | None) -> None:
    """Bitmiş eğitimin tam değerlendirmesi tabloya yazıldı: ``durum.json``'da "degerlendirildi" doğru olur.

    Yalnız aynı koşunun bitmiş ve değerlendirilmemiş kaydına dokunur; süren ya da başka bir koşunun kaydını ezmez.
    """
    durum = egitim_durumu_oku(klasor)
    if (
        durum
        and durum.get("durum") in BITMIS_DURUMLAR
        and durum.get("degerlendirildi") is False
        and durum.get("kosu") == kosu
    ):
        _egitim_durumu_yaz(klasor, {**durum, "degerlendirildi": True})


# --------------------------------------------------------------------------------------------
# Aşama kilidi ve --uzerine-yaz'da eski eğitimin kenara alınması
# --------------------------------------------------------------------------------------------


def _kilit_al(dosya) -> bool | None:
    """Açık dosyaya beklemeyen, dışlayıcı işletim sistemi kilidi koyar.

    ``True``: alındı; ``False``: başka bir süreçte (ya da başka bir açık dosyada); ``None``: bu dosya sistemi
    kilit desteklemiyor. Kilidi işletim sistemi tutar: süreç ölünce kendiliğinden kalkar, bayat kilit kalmaz.
    """
    try:
        if os.name == "nt":
            import msvcrt

            dosya.seek(0)
            msvcrt.locking(dosya.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl

            fcntl.flock(dosya.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError as e:
        dolu = (errno.EWOULDBLOCK, errno.EAGAIN, errno.EACCES, getattr(errno, "EDEADLOCK", errno.EDEADLK))
        return False if e.errno in dolu else None
    return True


def _kilit_birak(dosya) -> None:
    with contextlib.suppress(OSError):
        if os.name == "nt":
            import msvcrt

            dosya.seek(0)
            msvcrt.locking(dosya.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl

            fcntl.flock(dosya.fileno(), fcntl.LOCK_UN)


@contextlib.contextmanager
def egitim_kilidi(klasor: Path):
    """Aşama klasörünü (``klasor / "egitim.kilit"``) blok boyunca bu sürece kilitler; klasör yoksa oluşturur.

    Aynı aşama başka bir süreçte eğitiliyorsa ``AyarHatasi``: iki eğitim aynı ``son.pt`` / ``en_iyi.pt`` /
    ``gunluk.jsonl`` dosyalarına yazmasın. Kilit dosyası silinmez (boştur); kilidin kendisi süreçle birlikte biter.
    """
    klasor = Path(klasor)
    klasor.mkdir(parents=True, exist_ok=True)
    with (klasor / KILIT_DOSYASI).open("a+b") as dosya:
        for deneme in range(3):  # ``egitim_suruyor_mu`` kilidi bir an için alır; onunla çakışmayı eğitim sayma
            sonuc = _kilit_al(dosya)
            if sonuc is not False:
                break
            if deneme < 2:
                time.sleep(0.05)
        if sonuc is False:
            raise AyarHatasi(
                f"Bu aşama şu an başka bir süreçte eğitiliyor ({klasor}). Bitmesini bekle ya da o süreci durdur."
            )
        try:
            yield
        finally:
            _kilit_birak(dosya)


def egitim_suruyor_mu(klasor: Path) -> bool:
    """Bu aşamayı şu an bir süreç eğitiyor mu? Aynı kilidi dener ve hemen bırakır; kilit dosyası yoksa ``False``."""
    try:
        dosya = (Path(klasor) / KILIT_DOSYASI).open("rb")
    except OSError:
        return False
    with dosya:
        if _kilit_al(dosya) is False:
            return True
        _kilit_birak(dosya)
        return False


def _kenara_al(klasor: Path) -> bool:
    """Aşamanın eski dosyalarını silmek yerine ``<ad>.eski`` yapar; kenara alınan dosya varsa ``True``.

    Yeni eğitim ilk adımını tamamlayınca ``_eskileri_sil`` ile silinirler; tamamlayamazsa ``_yeni_kosuyu_geri_al``
    eskisini yerine koyar.
    """
    alinan = False
    for ad in _ASAMA_DOSYALARI:
        yol = klasor / ad
        if yol.exists():
            os.replace(yol, klasor / (ad + ".eski"))
            alinan = True
    return alinan


def _eskileri_sil(klasor: Path) -> None:
    for ad in reversed(_ASAMA_DOSYALARI):
        (klasor / (ad + ".eski")).unlink(missing_ok=True)


def _yeni_kosuyu_geri_al(klasor: Path) -> None:
    """Tek adım tamamlayamayan yeni eğitim iz bırakmaz: kendi ``durum.json`` / ``gunluk.jsonl`` dosyaları silinir,
    kenara alınmış eski eğitim (varsa) yerine konur."""
    for ad in ("durum.json", "gunluk.jsonl"):
        (klasor / ad).unlink(missing_ok=True)
    for ad in reversed(_ASAMA_DOSYALARI):
        eski = klasor / (ad + ".eski")
        if eski.exists():
            os.replace(eski, klasor / ad)


def _yarim_uzerine_yazmayi_toparla(klasor: Path) -> bool:
    """Önceki bir eğitim başlangıcı yarıda kaldıysa (süreç öldürüldü, elektrik kesildi) ortada kalan ``.eski``
    dosyalarını yerine koyar; bir şey geri getirildiyse ``True``.

    Yeni koşu kontrol noktası yazamadan öldüyse (canlı ``son.pt`` / ``en_iyi.pt`` yok) eski eğitim, yeni koşunun
    yarım ``durum.json`` / ``gunluk.jsonl`` dosyalarının yerine geri gelir. Kenara alma yarıda kaldıysa (canlı
    kontrol noktası duruyor) yalnız yeri boş olanlar geri konur.
    """
    eskiler = [ad for ad in _ASAMA_DOSYALARI if (klasor / (ad + ".eski")).exists()]
    if not eskiler:
        return False
    canli = (klasor / "son.pt").exists() or (klasor / "en_iyi.pt").exists()
    if not canli and "son.pt" in eskiler:  # kenara alma bitmişti: canlı durum/günlük yeni koşunun yarım dosyaları
        for ad in ("durum.json", "gunluk.jsonl"):
            (klasor / ad).unlink(missing_ok=True)
    geri = False
    for ad in reversed(eskiler):
        eski, yol = klasor / (ad + ".eski"), klasor / ad
        if not canli or not yol.exists():
            os.replace(eski, yol)
            geri = True
    return geri


def _geri_getirildi_notu(klasor: Path) -> str:
    return f"Not: {klasor} içinde yarıda kalmış bir eğitim başlangıcı bulundu; kenara alınmış eski eğitim geri getirildi."


def kenardaki_kontrol_noktasi(klasor: Path) -> Path | None:
    """``--uzerine-yaz``ın kenara aldığı eski kontrol noktası (``en_iyi.pt.eski``, yoksa ``son.pt.eski``); yoksa ``None``.

    Yeni eğitim ilk adımını tamamlayınca bunlar silinir. Süreç o adımdan önce öldürüldüyse (bellek yetmedi, elektrik
    kesildi) kenarda kalırlar; o zaman aşamanın modeli hâlâ budur ve onu kullanan her komut yerine koyar.
    """
    for ad in ("en_iyi.pt", "son.pt"):
        yol = Path(klasor) / (ad + ".eski")
        if yol.exists():
            return yol
    return None


def kenardakini_geri_getir(klasor: Path, yaz=print) -> bool:
    """Yarıda kalmış bir ``--uzerine-yaz``ın kenara aldığı eski eğitimi (``*.eski``) yerine koyar; bir şey geri
    getirildiyse ``True`` (ve bir not yazar).

    Model yükleyen komutlar (``degerlendir``, ``uret``, ``tanimla``, ``sor``, TDK modelinden başlayan MEB eğitimi)
    modeli aramadan önce bunu çağırır: süreç ilk adımdan önce öldürüldüyse model "yok" görünmez. Aşama kilidi içinde
    çalışır. Aşamayı şu an bir süreç eğitiyorsa dokunmaz: o ``.eski`` dosyaları süren ``--uzerine-yaz``ındır.
    """
    klasor = Path(klasor)
    if not any((klasor / (ad + ".eski")).exists() for ad in _ASAMA_DOSYALARI) or egitim_suruyor_mu(klasor):
        return False
    try:
        with egitim_kilidi(klasor):
            geri = _yarim_uzerine_yazmayi_toparla(klasor)
    except AyarHatasi:  # tam bu anda bir eğitim başladı: dosyalar onundur
        return False
    if geri:
        yaz(_geri_getirildi_notu(klasor))
    return geri


def yeniden_egitiliyor_notu(klasor: Path) -> str | None:
    """Aşamanın eski modeli şu an süren bir ``--uzerine-yaz`` yüzünden kenardaysa bunu söyleyen cümle; değilse None."""
    if kenardaki_kontrol_noktasi(klasor) is None or not egitim_suruyor_mu(klasor):
        return None
    return (
        f"{klasor} şu an başka bir süreçte --uzerine-yaz ile yeniden eğitiliyor; eski model yeni eğitimin ilk adımına "
        "kadar kenarda bekliyor, sonra silinir."
    )


def _gunlugu_kirp(yol: Path, son_adim: int) -> None:
    """``--devam``: ``gunluk.jsonl``'de ``son_adim``'dan sonraki (yeniden yapılacak) ve bozuk satırları atar."""
    try:
        ham = yol.read_text(encoding="utf-8", errors="replace").split("\n")
    except OSError:
        return
    satirlar = []
    for satir in ham:
        try:
            kayit = json.loads(satir)
        except ValueError:
            continue
        if isinstance(kayit, dict) and isinstance(kayit.get("adim"), int) and kayit["adim"] <= son_adim:
            satirlar.append(satir)
    if len(satirlar) != len(ham) - 1 or ham[-1] != "":  # atılacak satır ya da yarım kalmış bir son satır var
        gecici = yol.with_name(yol.name + ".yaziliyor")
        gecici.write_text("".join(s + "\n" for s in satirlar), encoding="utf-8")
        os.replace(gecici, yol)


def tokenizer_uyumu(kn: dict, tok: TurkceTokenizer, yol: Path) -> None:
    """Kontrol noktası bu tokenizer'la kullanılabilir mi? Parçalar aynı olmalı; model biçim paylaşımı ya da
    kategori gömmesi kullanıyorsa ana/biçim/kategori bağları da aynı olmalı (bunlar yüklenirken yeniden kurulur)."""
    if kn.get("tokenizer") != tokenizer_imzasi(tok):
        raise AyarHatasi(f"{yol} başka bir tokenizer'la eğitilmiş; bu tokenizer'la kullanılamaz.")
    g = kn.get("ayarlar", {}).get("gomme", {})
    kayitli = kn.get("tokenizer_gomme")
    if (g.get("bicim_paylasimi") or g.get("kategori_gommesi")) and kayitli and kayitli != tokenizer_gomme_imzasi(tok):
        raise AyarHatasi(
            f"{yol}: tokenizer'ın parçaları aynı ama ana/biçim/kategori bağları değişmiş (tokenizer yeniden eğitilmiş). "
            "Bu model biçim paylaşımı ya da kategori gömmesi kullandığı için yeniden eğitilmeli."
        )


def ayar_farklari(kayitli: dict, ayarlar: Ayarlar, devam: bool) -> list[str]:
    """Kontrol noktasının mimari ayarlarıyla şimdiki ayarlar arasındaki farklar.

    ``--devam`` için her şey aynı olmalı. MEB aşaması TDK modelinden başlarken dropout ve başlatma std'si
    farklı olabilir (ağırlıkların biçimini değiştirmezler).
    """
    serbest = set() if devam else {("gomme", "dropout"), ("gomme", "baslatma_std"), ("model", "dropout")}
    farklar = []
    for bolum in ("gomme", "model"):
        eski, yeni = kayitli.get(bolum, {}), asdict(getattr(ayarlar, bolum))
        for alan in sorted(set(eski) | set(yeni)):
            if (bolum, alan) not in serbest and eski.get(alan) != yeni.get(alan):
                farklar.append(f"{bolum}.{alan}: kayıtlı {eski.get(alan)!r}, şimdi {yeni.get(alan)!r}")
    return farklar


def egitim_farklari(kayitli: dict, ea: EgitimAyarlari, asama: str) -> tuple[list[str], list[str]]:
    """``--devam`` için ``egitim.<aşama>`` farkları: ``(engelleyenler, bilgi_notlari)``."""
    engel: list[str] = []
    bilgi: list[str] = []
    yeni = asdict(ea)
    for alan in sorted(set(kayitli) | set(yeni)):
        if kayitli.get(alan) != yeni.get(alan):
            satir = f"egitim.{asama}.{alan}: kayıtlı {kayitli.get(alan)!r}, şimdi {yeni.get(alan)!r}"
            (engel if alan in KILITLI_EGITIM_ALANLARI else bilgi).append(satir)
    return engel, bilgi


def durumu_yukle(model: TurkceGPT, kn: dict, yol: Path) -> None:
    try:
        model.load_state_dict(kn["model"])
    except (RuntimeError, TypeError, KeyError, AttributeError, ValueError) as e:
        raise AyarHatasi(f"{yol} bu modele yüklenemedi (mimari ya da tokenizer farklı): {str(e)[:300]}") from e


def modeli_yukle(yol: Path, tok: TurkceTokenizer, cihaz: str) -> tuple[TurkceGPT, dict]:
    """Kaydedilmiş modeli, kendi ayarlarıyla kurar (ayarlar.toml sonradan değişmiş olabilir)."""
    kn = kontrol_noktasi_yukle(yol, cihaz)
    tokenizer_uyumu(kn, tok, yol)
    try:
        g = GommeAyarlari(**kn["ayarlar"]["gomme"])
        m = ModelAyarlari(**kn["ayarlar"]["model"])
    except (KeyError, TypeError) as e:
        raise AyarHatasi(f"{yol}: kayıtlı ayarlar bu sürümle okunamadı ({e}).") from e
    model = model_kur(g, m, tok)
    durumu_yukle(model, kn, yol)
    return model.to(cihaz), kn


def _rng_durumu(uretec: np.random.Generator, cihaz: str) -> dict:
    durum: dict = {"numpy": uretec.bit_generator.state, "torch": torch.get_rng_state()}
    if cihaz == "cuda":
        durum["cuda"] = torch.cuda.get_rng_state_all()
    elif cihaz == "mps":
        durum["mps"] = torch.mps.get_rng_state()
    return durum


def _rng_geri_yukle(durum: dict, uretec: np.random.Generator, cihaz: str) -> None:
    uretec.bit_generator.state = durum["numpy"]
    torch.set_rng_state(durum["torch"].cpu())  # kontrol noktası cihaza yüklendi; RNG durumu CPU'da olmalı
    if cihaz == "cuda" and durum.get("cuda"):
        torch.cuda.set_rng_state_all([s.cpu() for s in durum["cuda"]])
    elif cihaz == "mps" and durum.get("mps") is not None:
        torch.mps.set_rng_state(durum["mps"].cpu())


def _dogrulama_metni(d: dict) -> str:
    parcalar = [f"TDK kaybı {d['tdk_kayip']:.4f}"]
    if "meb_kayip" in d:
        parcalar.append(f"MEB kaybı {d['meb_kayip']:.4f}")
    if "meb_dogruluk_metin" in d:
        parcalar.append(
            f"MEB doğr. metin %{100 * d['meb_dogruluk_metin']:.1f} / harf %{100 * d['meb_dogruluk_harf']:.1f}"
        )
    return " | ".join(parcalar)


# --------------------------------------------------------------------------------------------
# Eğitim
# --------------------------------------------------------------------------------------------


def egit(
    ayarlar: Ayarlar,
    asama: str,
    devam: bool = False,
    sifirdan: bool = False,
    cihaz: str | None = None,
    yaz=print,
    uzerine_yaz: bool = False,
    komut_eki: str = "",
    veri_komut_eki: str | None = None,
) -> dict:
    """Bir aşamayı eğitir; eğitim biterse en iyi modeli tam değerlendirir ve sonucunu döndürür.

    ``komut_eki``: kullanıcıya yazılan her komutun sonuna eklenen, deneyi seçen seçenekler
    (``" --ayarlar … --ayar … --deney … --cihaz …"``); komut satırı kendi çağrısından üretir. Böylece yazılan
    sürdürme ve değerlendirme komutları başka bir deneye gitmez. ``veri_komut_eki``: yazılan veri komutlarının
    (``veri-hazirla``, ``tokenizer-egit``, ``meb-pdf``) eki; ``--cihaz`` taşımaz. Verilmezse ``komut_eki``.

    Aşama klasörü eğitim boyunca (sondaki otomatik değerlendirme dahil) bu sürece kilitlidir (``egitim_kilidi``).
    """
    if asama not in ASAMALAR:
        raise AyarHatasi(f"Aşama {asama!r} değil; şunlardan biri: {', '.join(ASAMALAR)}")
    if devam and uzerine_yaz:
        raise AyarHatasi(
            "--devam ve --uzerine-yaz birlikte kullanılamaz: sürdürmek için yalnız --devam, baştan başlamak için "
            "yalnız --uzerine-yaz."
        )
    veri_eki = komut_eki if veri_komut_eki is None else veri_komut_eki
    with contextlib.ExitStack() as kilit:  # kilit _egit içinde alınır; dönüşte ya da hatada burada bırakılır
        return _egit(ayarlar, asama, devam, sifirdan, cihaz, yaz, uzerine_yaz, komut_eki, veri_eki, kilit)


def _egit(
    ayarlar: Ayarlar,
    asama: str,
    devam: bool,
    sifirdan: bool,
    cihaz: str | None,
    yaz,
    uzerine_yaz: bool,
    komut_eki: str,
    veri_eki: str,
    kilit: contextlib.ExitStack,
) -> dict:
    gommeyi_dogrula(ayarlar.gomme, ayarlar.model)
    ea: EgitimAyarlari = egitimi_dogrula(getattr(ayarlar, asama), asama)
    cihaz = cihaz_dogrula(cihaz)
    hassasiyet = hassasiyet_sec(ea.hassasiyet, cihaz)
    ctx = baglam_yoneticisi(cihaz, hassasiyet)

    tok = tokenizer_yukle(ayarlar, veri_eki)
    meta = hazir_veri(ayarlar, tok, veri_eki)
    vk = veri_klasoru(ayarlar)
    tdk_egitim = AkisVeri(vk / "tdk_egitim.bin", tok.boyut)
    tdk_dogrulama = AkisVeri(vk / "tdk_dogrulama.bin", tok.boyut)
    for ad, akis in (("eğitim", tdk_egitim), ("doğrulama", tdk_dogrulama)):
        if len(akis) < ayarlar.model.baglam + 2:
            raise AyarHatasi(
                f"TDK {ad} akışı çok kısa ({len(akis)} token, bağlam {ayarlar.model.baglam}). Daha fazla madde indir "
                "(tdk-indir) ya da model.baglam'ı küçült."
            )
    meb_egitim = meb_dogrulama = None
    dogrulama_sorulari: list = []
    if asama == "meb":
        if not (vk / "meb_egitim.npz").exists():
            raise AyarHatasi(
                f"MEB eğitim soruları hazırlanmamış. Önce MEB kitapçıklarını veri/meb/pdf klasörüne koyup meb-pdf{veri_eki}, "
                f"sonra veri-hazirla{veri_eki} çalıştır (TurkishMMLU yalnız değerlendirme içindir)."
            )
        meb_egitim = SoruVeri(vk / "meb_egitim.npz")
        meb_dogrulama = SoruVeri(vk / "meb_dogrulama.npz") if (vk / "meb_dogrulama.npz").exists() else None
        from .meb import soru_oku

        dogrulama_sorulari = [s for s in soru_oku(vk / "meb_sorular.jsonl") if s.bolum == "dogrulama"]
    tok_imza, tok_gomme_imza = tokenizer_imzasi(tok), tokenizer_gomme_imzasi(tok)
    veri_imzalari = _veri_imzalari(meta, asama)

    klasor = ayarlar.deney_klasoru / asama
    son_yol, en_iyi_yol = klasor / "son.pt", klasor / "en_iyi.pt"
    # Klasör varsa içindekiler okunmadan önce kilitlenir: başka bir süreç bu aşamayı eğitiyorsa burada durulur.
    # Yoksa bütün denetimler geçtikten sonra oluşturulup kilitlenir (başlayamayan bir eğitim klasör bırakmaz).
    kilitli = klasor.is_dir()
    geri_getirildi = False
    if kilitli:
        kilit.enter_context(egitim_kilidi(klasor))
        geri_getirildi = _yarim_uzerine_yazmayi_toparla(klasor)
        if geri_getirildi:
            yaz(_geri_getirildi_notu(klasor))
    if devam and not son_yol.exists():
        raise AyarHatasi(
            f"--devam verildi ama sürdürülecek eğitim yok ({son_yol}). Yeni bir eğitim için --devam'sız çalıştır; "
            "başka bir deney için --deney <ad> ver."
        )
    if devam and geri_getirildi:
        # Yarıda kalan --uzerine-yaz'dan geri gelen eğitim bitmişse yapılacak bir şey yok. Bu, ayar karşılaştırmasından
        # önce söylenir: --uzerine-yaz çoğu kez yeni ayarlarla denenmiştir; geri getirme o ayarlarla da başarılı biter.
        eski = egitim_durumu_oku(klasor) or {}
        if eski.get("durum") in BITMIS_DURUMLAR:
            neden = "erken durdurmayla" if eski["durum"] == "erken_durdu" else f"adım {eski.get('adim')}/{eski.get('toplam_adim')}"
            for yarim in klasor.glob("*.yaziliyor"):
                yarim.unlink(missing_ok=True)
            yaz(
                f"Bu eğitim zaten bitmiş ({neden}); sürdürülecek adım yok.\n"
                f"Değerlendirmek için: python -m turkce_model degerlendir --asama {asama}{komut_eki}"
            )
            return {"zaten_bitti": True, "adim": eski.get("adim")}
    if son_yol.exists() and not devam and not uzerine_yaz:
        raise AyarHatasi(
            f"{klasor} içinde zaten bir eğitim var. Sürdürmek için --devam, silip baştan başlamak için "
            "--uzerine-yaz, ayrı tutmak için --deney <ad> kullan."
        )

    torch.manual_seed(ea.tohum)
    uretec = np.random.default_rng(ea.tohum)
    model = model_kur(ayarlar.gomme, ayarlar.model, tok).to(cihaz)
    baslangic_adim, en_iyi, sabir, gorulen = 0, math.inf, 0, 0
    kn = None
    kosu = secrets.token_hex(4)  # koşu kimliği: her yeni (--devam'sız) eğitimde yenilenir
    baslangic = None  # MEB aşaması: başladığı TDK koşusu ve adımı; --sifirdan ise (ve TDK aşamasında) None
    bekleyen = None  # --devam: adımı tamamlanmış ama değerlendirmesi yarıda kalmışsa o adımın günlük değerleri
    kayitli_isinma = None
    carpan = ea.birikim  # sabit doğrulama kümesinin çarpanı (bkz. sabit_dogrulama_yiginlari)
    if devam:
        kn = kontrol_noktasi_yukle(son_yol, cihaz)
        tokenizer_uyumu(kn, tok, son_yol)
        farklar = ayar_farklari(kn["ayarlar"], ayarlar, devam=True)
        kayitli_egitim = kn["ayarlar"].get(asama)
        engel, bilgi = egitim_farklari(kayitli_egitim if isinstance(kayitli_egitim, dict) else {}, ea, asama)
        if farklar or engel:
            raise AyarHatasi(
                "--devam için bu ayarlar kaydedilen eğitimle aynı olmalı (mimariyi, adım sayısını, öğrenme oranı "
                "eğrisini ya da doğrulama kümesini belirlerler). Farklar:\n  • " + "\n  • ".join(farklar + engel)
                + "\nYeni ayarlarla ayrı bir deney için --deney <ad> kullan."
            )
        for satir in bilgi:
            yaz(f"  Not: {satir} (sürdürürken değişebilir)")
        durumu_yukle(model, kn, son_yol)
        try:
            baslangic_adim, en_iyi = int(kn["adim"]), float(kn["en_iyi"])
            gorulen, sabir = int(kn.get("gorulen_token", 0)), int(kn.get("sabir", 0))
            kayitli_isinma = None if kn.get("isinma") is None else int(kn["isinma"])
            # Eski sürümle başlamış eğitimde küme degerlendirme_yigini yığındı (çarpan 1): sürerken öyle kalır,
            # yoksa kayıtlı en_iyi başka bir kümeyle ölçülmüş olurdu.
            carpan = int(kn.get("dogrulama_carpani", 1))
        except (KeyError, TypeError, ValueError) as e:
            raise AyarHatasi(f"{son_yol}: kayıtlı eğitim durumu okunamadı ({type(e).__name__}: {e}).") from e
        kosu = kn.get("kosu") or kosu
        baslangic = kn.get("baslangic") if isinstance(kn.get("baslangic"), dict) else None
        bekleyen = kn.get("bekleyen") if isinstance(kn.get("bekleyen"), dict) else None
    if kn is None and asama == "meb" and not sifirdan:
        kaynak = ayarlar.deney_klasoru / "tdk" / "en_iyi.pt"
        if not kaynak.exists():  # TDK aşamasının yarıda kalan bir --uzerine-yaz'ı modeli kenarda bırakmış olabilir
            kenardakini_geri_getir(kaynak.parent, yaz)
        if not kaynak.exists():
            bekliyor = yeniden_egitiliyor_notu(kaynak.parent)
            if bekliyor:
                raise AyarHatasi(f"MEB aşaması TDK modelinden başlar. {bekliyor} TDK eğitiminin bitmesini bekle.")
            raise AyarHatasi(
                f"MEB aşaması TDK modelinden başlar ama {kaynak} yok. Önce: python -m turkce_model egit --asama tdk"
                f"{komut_eki}. Bilerek sıfırdan başlamak için --sifirdan ekle."
            )
        tdk_kn = kontrol_noktasi_yukle(kaynak, cihaz)
        tokenizer_uyumu(tdk_kn, tok, kaynak)
        farklar = ayar_farklari(tdk_kn["ayarlar"], ayarlar, devam=False)
        if farklar:
            raise AyarHatasi("TDK modelinin mimarisi şimdiki ayarlardan farklı:\n  • " + "\n  • ".join(farklar))
        durumu_yukle(model, tdk_kn, kaynak)
        gorulen = int(tdk_kn.get("gorulen_token", 0))  # görülen token birikimlidir: TDK aşaması dahil
        baslangic = {"kosu": tdk_kn.get("kosu"), "adim": tdk_kn.get("adim")}
        del tdk_kn
        yaz(f"TDK modelinden başlanıyor: {kaynak}")
        tdk_durumu = egitim_durumu_oku(kaynak.parent) or {}
        if tdk_durumu.get("durum") in YARIM_DURUMLAR:
            ilerleme = f"adım {tdk_durumu.get('adim')}/{tdk_durumu.get('toplam_adim')}"
            if egitim_suruyor_mu(kaynak.parent):
                yaz(f"  Not: TDK aşaması şu an başka bir süreçte eğitiliyor ({ilerleme}); o ana kadarki en iyi modelden başlanıyor.")
            else:
                yaz(
                    f"  Not: TDK aşaması bitmemiş ({ilerleme}); bitirmek için: "
                    f"python -m turkce_model egit --asama tdk --devam{komut_eki}"
                )

    dokum = model.parametre_dokumu()
    baglam_uzunlugu = ayarlar.model.baglam
    adim_basina_token = ea.yigin * ea.birikim * baglam_uzunlugu
    if asama == "tdk":
        toplam_adim = math.ceil(ea.donem * len(tdk_egitim) / adim_basina_token)
    else:
        meb_adim = math.ceil(ea.donem * len(meb_egitim) / (ea.yigin * ea.birikim))
        toplam_adim = math.ceil(meb_adim / max(1e-6, 1.0 - ea.tdk_karisim))
    if ea.en_fazla_adim:
        toplam_adim = min(toplam_adim, ea.en_fazla_adim)
    toplam_adim = max(toplam_adim, 1)
    if kn is not None:
        # Hazır veri eğitim başladıktan sonra değiştiyse sürdürmek tutarsız olur. Önce içerik imzaları (adım sayısı
        # en_fazla_adim ile sınırlıyken ya da küçük değişikliklerde aynı kalır), sonra adım sayısı karşılaştırılır.
        kayitli_veri = kn.get("veri")
        if isinstance(kayitli_veri, dict):
            degisen = [_AKIS_ADLARI[ad] for ad in _ASAMA_AKISLARI[asama] if kayitli_veri.get(ad) != veri_imzalari[ad]]
            if degisen:
                raise AyarHatasi(
                    f"Hazır veri değişmiş: bu eğitim başladıktan sonra {', '.join(degisen)} değişmiş (veri-hazirla "
                    "yeniden çalıştırılmış). Sürdürmek tutarsız olur; yeni bir deney için --deney <ad>, baştan "
                    "başlamak için --uzerine-yaz kullan."
                )
        if kn.get("toplam_adim") not in (None, toplam_adim):
            raise AyarHatasi(
                f"Hazır veri değişmiş: bu eğitim {kn['toplam_adim']} adım olarak başlamıştı, şimdiki veriyle {toplam_adim} "
                "adım ediyor (veri-hazirla yeniden çalıştırılmış olabilir). Sürdürmek tutarsız olur; yeni bir deney için "
                "--deney <ad>, baştan başlamak için --uzerine-yaz kullan."
            )

    en_iyi_adim: int | None = None  # en_iyi.pt'de duran kontrol noktasının adımı

    def durum_yaz(durum: str, adim: int, degerlendirildi: bool = False) -> None:
        _egitim_durumu_yaz(
            klasor,
            {
                "durum": durum,
                "adim": adim,
                "toplam_adim": toplam_adim,
                "zaman": time.strftime("%Y-%m-%d %H:%M"),
                "kosu": kosu,
                "en_iyi_adim": en_iyi_adim,
                "tokenizer": tok_imza,
                "veri": veri_imzalari["tdk_egitim" if asama == "tdk" else "meb_egitim"],
                "baslangic": baslangic,
                "degerlendirildi": degerlendirildi,
            },
        )

    if kn is not None and not bekleyen and (baslangic_adim >= toplam_adim or (ea.erken_durdurma and sabir >= ea.erken_durdurma)):
        erken = baslangic_adim < toplam_adim
        neden = "erken durdurmayla" if erken else f"adım {baslangic_adim}/{toplam_adim}"
        # Bitmiş eğitimin durum.json'u hâlâ "sürüyor" ya da "durduruldu" diyorsa (son adımda kesilmiş bir koşu)
        # onarılır; yoksa durum komutu sonsuza dek --devam önerirdi.
        if (egitim_durumu_oku(klasor) or {}).get("durum") not in BITMIS_DURUMLAR:
            en_iyi_adim = _kayitli_adim(en_iyi_yol)
            durum_yaz("erken_durdu" if erken else "bitti", baslangic_adim)
        for yarim in klasor.glob("*.yaziliyor"):
            yarim.unlink(missing_ok=True)
        yaz(
            f"Bu eğitim zaten bitmiş ({neden}); sürdürülecek adım yok.\n"
            f"Değerlendirmek için: python -m turkce_model degerlendir --asama {asama}{komut_eki}"
        )
        return {"zaten_bitti": True, "adim": baslangic_adim}
    her, isinma = kisa_egitim_ayarlari(ea, toplam_adim)
    eski_isinma = False
    if kn is not None:
        if kayitli_isinma is not None:
            isinma = kayitli_isinma  # kaydedilen eğitimin gerçekten kullandığı ısınma
        elif "toplam_adim" not in kn and isinma < ea.isinma_adimi:
            # İkinci turdan önceki kontrol noktası: o sürüm ısınmayı kısaltmıyordu; eğri yarı yolda değişmesin.
            isinma, eski_isinma = ea.isinma_adimi, True
    ea_lr = replace(ea, isinma_adimi=isinma)

    if asama == "meb":
        veri_satiri = (
            f"MEB eğitim soruları {binlik(len(meb_egitim))} ({binlik(meb_egitim.token_sayisi())} token) + "
            f"TDK karışımı %{100 * ea.tdk_karisim:g}"
        )
    else:
        veri_satiri = f"Eğitim akışı {binlik(len(tdk_egitim))} token"
    yaz(
        f"Aşama {asama} | cihaz {cihaz} ({hassasiyet}) | deney {ayarlar.deney_adi}\n"
        f"  parametre: {dokum['toplam'] / 1e6:.2f} M (gömme dışı {dokum['gömme dışı'] / 1e6:.2f} M) | "
        f"sözlük {tok.boyut} | bağlam {baglam_uzunlugu}\n"
        f"  {veri_satiri} | toplam {binlik(toplam_adim)} adım"
    )
    if her < ea.degerlendirme_her:
        yaz(f"  Not: eğitim kısa; değerlendirme {ea.degerlendirme_her} yerine her {her} adımda bir yapılacak.")
    if eski_isinma:
        yaz(
            f"  Not: bu eğitim eski bir sürümle başlamış; öğrenme oranı eğrisi yarı yolda değişmesin diye ısınma "
            f"{isinma} adım olarak kalıyor (kısaltılmıyor)."
        )
    elif isinma < ea.isinma_adimi:
        yaz(f"  Not: ısınma {ea.isinma_adimi} yerine {isinma} adım (toplam adımın en fazla beşte biri).")
    if kn is not None:
        yaz(f"Kaldığı yerden devam: adım {baslangic_adim}/{toplam_adim}")
    oran = len(tdk_egitim) / max(dokum["toplam"], 1)
    if asama == "tdk" and oran < 2:
        yaz(
            f"  Not: eğitim verisi parametre başına yalnız {oran:.2f} token; model veriyi ezberleyebilir, doğrulama "
            f"kaybını izle{' (erken durdurma açık)' if ea.erken_durdurma else ''}. Veri/parametre oranı için "
            "GOMME_KARARLARI.md'deki \"Önce bağlam\" bölümüne bak; daha fazla metin: veri/ek_metin."
        )

    iyilestirici = model.iyilestirici(ea.ogrenme_orani, ea.agirlik_azaltma, cihaz)
    olcekleyici = torch.amp.GradScaler(cihaz, enabled=(hassasiyet == "fp16"))  # fp16'da kayıp ölçekleme şart
    surduruluyor = kn is not None
    if kn is not None:
        try:
            if "iyilestirici" in kn:
                iyilestirici.load_state_dict(kn["iyilestirici"])
            if olcekleyici.is_enabled() and kn.get("olcekleyici"):
                olcekleyici.load_state_dict(kn["olcekleyici"])
            if kn.get("rng"):
                _rng_geri_yukle(kn["rng"], uretec, cihaz)
            else:  # eski kontrol noktası: RNG durumu yok; en azından ilk adımların yığınları tekrarlanmasın
                uretec = np.random.default_rng([ea.tohum, baslangic_adim])
                torch.manual_seed(ea.tohum + baslangic_adim)
        except (KeyError, TypeError, ValueError, AttributeError, RuntimeError) as e:
            raise AyarHatasi(
                f"{son_yol}: iyileştirici ya da rastgelelik durumu geri yüklenemedi ({type(e).__name__}: {str(e)[:200]}). "
                "Baştan başlamak için --uzerine-yaz kullan."
            ) from e
        del kn
        en_iyi_adim = _kayitli_adim(en_iyi_yol)
    calisan = torch.compile(model) if ea.derle and cihaz == "cuda" else model

    sabit_dogrulama, meb_sabit = sabit_dogrulama_yiginlari(tdk_dogrulama, meb_dogrulama, ea, baglam_uzunlugu, carpan)

    def dogrulama() -> dict:
        model.eval()
        sonuc: dict = {}
        with torch.no_grad():
            kayiplar = []
            for x, y in sabit_dogrulama:
                with ctx():
                    _, k = calisan(x.to(cihaz), y.to(cihaz))
                kayiplar.append(float(k))
            sonuc["tdk_kayip"] = sum(kayiplar) / len(kayiplar)
            if meb_sabit:
                kayiplar = []
                for x, y in meb_sabit:
                    with ctx():
                        _, k = calisan(x.to(cihaz), y.to(cihaz))
                    kayiplar.append(float(k))
                sonuc["meb_kayip"] = sum(kayiplar) / len(kayiplar)
        if dogrulama_sorulari:
            cs = coktan_secmeli(model, tok, dogrulama_sorulari, cihaz, ctx, en_fazla=200)
            sonuc["meb_dogruluk_metin"], sonuc["meb_dogruluk_harf"] = cs["dogruluk_metin"], cs["dogruluk_harf"]
        model.train()
        return sonuc

    def kaydet(yol: Path, adim: int, en_iyi_deger: float, sabir_deger: int, bekleyen_kayit: dict | None = None) -> None:
        guvenli_kaydet(
            {
                "model": model.state_dict(),
                "iyilestirici": iyilestirici.state_dict(),
                "olcekleyici": olcekleyici.state_dict(),
                # Adım sınırındaki RNG: Ctrl+C adımın ortasına (yığın çekildikten sonra) gelse de sürdürülen eğitim
                # o adımı aynı yığınlarla ve aynı dropout maskeleriyle yeniden yapar.
                "rng": rng_adim_sonu,
                "adim": adim,
                "toplam_adim": toplam_adim,
                "en_iyi": en_iyi_deger,
                "sabir": sabir_deger,
                "gorulen_token": gorulen,
                "asama": asama,
                "ayarlar": ayarlar.sozluk(),
                "tokenizer": tok_imza,
                "tokenizer_gomme": tok_gomme_imza,
                "kosu": kosu,
                "veri": veri_imzalari,
                "isinma": isinma,
                "dogrulama_carpani": carpan,
                "bekleyen": bekleyen_kayit,
                "baslangic": baslangic,
            },
            yol,
        )

    # Bütün denetimler geçti. Klasör yoksa şimdi oluşturulup kilitlenir.
    if not kilitli:
        kilit.enter_context(egitim_kilidi(klasor))
    for yarim in klasor.glob("*.yaziliyor"):
        yarim.unlink(missing_ok=True)
    gunluk_yolu = klasor / "gunluk.jsonl"
    gunluk = None
    # Kayıp cihazda biriktirilir; her mikro adımda .item() GPU'yu bekletirdi.
    toplanan_kayip, toplanan_sayi, toplanan_token = torch.zeros((), device=cihaz), 0, 0
    tamamlanan = baslangic_adim
    degerlendirilen = None if bekleyen else baslangic_adim  # değerlendirmesi diske işlenmiş son adım
    rng_adim_sonu = _rng_durumu(uretec, cihaz)  # tamamlanan son adımın sınırındaki RNG durumu
    erken_durdu = durduruldu = False
    basla = son_kayit_zamani = adim_zamani = time.time()

    def adim_olcumu() -> dict:
        """Tamamlanan adımın günlük satırına girecek değerler: son değerlendirmeden bu yana eğitim kaybı ve hız."""
        return {
            "ogrenme_orani": ogrenme_orani(tamamlanan - 1, toplam_adim, ea_lr),
            "egitim_kaybi": float(toplanan_kayip) / max(toplanan_sayi, 1),
            "token_sn": round(toplanan_token / max(adim_zamani - son_kayit_zamani, 1e-9)),  # değerlendirme süresi katılmaz
        }

    def adim_degerlendir(adim_no: int, lr: float, egitim_kaybi: float | None, token_sn: int | None) -> bool:
        """Tamamlanmış ``adim_no`` adımını doğrular, günlüğe yazar ve kaydeder; erken durdurma gerekiyorsa ``True``.

        ``en_iyi`` / ``sabir`` ancak her şey diske yazıldıktan sonra güncellenir. Arada Ctrl+C gelirse bu adımın
        değerlendirmesi "bekleyen" olarak kaydedilir ve ``--devam`` onu baştan yapar: adım günlükte atlanmaz,
        en iyi model adaylığını ve erken durdurma sayacındaki yerini yitirmez.
        """
        nonlocal en_iyi, sabir, degerlendirilen, en_iyi_adim
        d = dogrulama()
        kayit = {
            "adim": adim_no,
            "ogrenme_orani": lr,
            "egitim_kaybi": egitim_kaybi,
            **d,
            "gorulen_token": gorulen,
            "sure_sn": round(time.time() - basla, 1),
            "token_sn": token_sn,
        }
        gunluk.write(json.dumps(kayit, ensure_ascii=False) + "\n")
        gunluk.flush()
        ana = d.get("meb_kayip", d["tdk_kayip"]) if asama == "meb" else d["tdk_kayip"]
        yaz(
            f"  adım {adim_no}/{toplam_adim} | öğrenme oranı {lr:.2e} | eğitim kaybı "
            f"{'—' if egitim_kaybi is None else f'{egitim_kaybi:.4f}'} | {_dogrulama_metni(d)} | "
            f"{'—' if token_sn is None else binlik(token_sn)} token/sn"
        )
        if ana < en_iyi:
            kaydet(en_iyi_yol, adim_no, ana, 0)
            en_iyi_adim = adim_no
            yeni_en_iyi, yeni_sabir = ana, 0
        else:
            yeni_en_iyi, yeni_sabir = en_iyi, sabir + 1
        erken = bool(ea.erken_durdurma and yeni_sabir >= ea.erken_durdurma)
        kaydet(son_yol, adim_no, yeni_en_iyi, yeni_sabir)
        durum_yaz("erken_durdu" if erken else ("bitti" if adim_no == toplam_adim else "suruyor"), adim_no)
        en_iyi, sabir, degerlendirilen = yeni_en_iyi, yeni_sabir, adim_no  # değerlendirme işlendi
        if erken:
            yaz(f"  Erken durdurma: {sabir} değerlendirmedir doğrulama kaybı iyileşmiyor (en iyi {en_iyi:.4f}).")
        return erken

    # Yeni eğitim boş bir aşama klasöründen başlar: eski eğitim (--uzerine-yaz) ya da yarım kalmış bir koşunun
    # artıkları silinmez, kenara alınır. Yeni eğitim ilk adımını tamamlayınca silinirler; tamamlayamazsa (bellek
    # yetmedi, Ctrl+C) eski eğitim geri gelir.
    kenarda = _kenara_al(klasor) if not surduruluyor else False
    try:
        try:
            durum_yaz("suruyor", baslangic_adim)
            if surduruluyor:  # yeniden yapılacak adımların (ve bekleyen değerlendirmenin) eski satırları atılır
                _gunlugu_kirp(gunluk_yolu, baslangic_adim - 1 if bekleyen else baslangic_adim)
            gunluk = gunluk_yolu.open("a", encoding="utf-8")
            model.train()
            if bekleyen:
                yaz(f"  Yarıda kesilen değerlendirme yeniden yapılıyor: adım {baslangic_adim}")
                lr = bekleyen.get("ogrenme_orani")
                if lr is None:
                    lr = ogrenme_orani(baslangic_adim - 1, toplam_adim, ea_lr)
                erken_durdu = adim_degerlendir(baslangic_adim, lr, bekleyen.get("egitim_kaybi"), bekleyen.get("token_sn"))
            for adim in range(baslangic_adim, baslangic_adim if erken_durdu else toplam_adim):
                lr = ogrenme_orani(adim, toplam_adim, ea_lr)
                for grup in iyilestirici.param_groups:
                    grup["lr"] = lr
                adim_token = 0
                for _ in range(ea.birikim):
                    if asama == "meb" and uretec.random() >= ea.tdk_karisim:
                        x, y = meb_egitim.yigin(ea.yigin, baglam_uzunlugu, uretec, ea.kayip)
                    else:
                        x, y = tdk_egitim.yigin(ea.yigin, baglam_uzunlugu, uretec)
                    adim_token += int((x != PAD).sum())  # CPU'da sayılır: cihazı bekletmez
                    x, y = x.to(cihaz, non_blocking=True), y.to(cihaz, non_blocking=True)
                    with ctx():
                        _, kayip = calisan(x, y)
                    olcekleyici.scale(kayip / ea.birikim).backward()
                    toplanan_kayip += kayip.detach().float()
                    toplanan_sayi += 1
                if ea.gradyan_kirpma:
                    olcekleyici.unscale_(iyilestirici)
                    torch.nn.utils.clip_grad_norm_(model.parameters(), ea.gradyan_kirpma)
                olcekleyici.step(iyilestirici)
                olcekleyici.update()
                # Adım tamam: sayaçlar ve adım sınırındaki RNG görüntüsü tek atamada ilerler (Ctrl+C araya giremez).
                rng_adim_sonu, tamamlanan, gorulen, toplanan_token, adim_zamani = (
                    _rng_durumu(uretec, cihaz),
                    adim + 1,
                    gorulen + adim_token,
                    toplanan_token + adim_token,
                    time.time(),
                )
                iyilestirici.zero_grad(set_to_none=True)
                if kenarda:  # yeni eğitim ilk adımını tamamladı: kenara alınanlar artık silinebilir
                    _eskileri_sil(klasor)
                    kenarda = False

                if tamamlanan % her == 0 or tamamlanan == toplam_adim:
                    olcum = adim_olcumu()
                    erken_durdu = adim_degerlendir(tamamlanan, olcum["ogrenme_orani"], olcum["egitim_kaybi"], olcum["token_sn"])
                    toplanan_kayip, toplanan_sayi, toplanan_token = torch.zeros((), device=cihaz), 0, 0
                    son_kayit_zamani = time.time()
                    if erken_durdu:
                        break
        finally:
            if gunluk is not None:
                gunluk.close()
    except KeyboardInterrupt:
        durduruldu = True
    except BaseException:
        if not surduruluyor and tamamlanan == baslangic_adim:  # yeni eğitim tek adım tamamlayamadı (ör. bellek)
            _yeni_kosuyu_geri_al(klasor)
            if kenarda:
                yaz("Not: yeni eğitim ilk adımını tamamlayamadı; kenara alınan eski eğitim geri getirildi.")
        elif kenarda:
            _eskileri_sil(klasor)
        raise
    if kenarda and tamamlanan > baslangic_adim:  # ilk adım bitti ama kenardakiler silinirken Ctrl+C geldi
        _eskileri_sil(klasor)
        kenarda = False
    if durduruldu:
        degerlendir_komutu = f"python -m turkce_model degerlendir --asama {asama}{komut_eki}"
        if not surduruluyor and tamamlanan == baslangic_adim:
            _yeni_kosuyu_geri_al(klasor)  # tek adım tamamlamayan yeni eğitim iz bırakmaz
            yaz("\nDurduruldu (tamamlanan adım yok)." + (" Kenara alınan eski eğitim geri getirildi." if kenarda else ""))
            return {"durduruldu": True, "adim": tamamlanan}
        if degerlendirilen == tamamlanan and (
            tamamlanan >= toplam_adim or (ea.erken_durdurma and sabir >= ea.erken_durdurma)
        ):
            # Eğitim bitmiş ve son adımı kaydedilmişti: durum.json "bitti" / "erken_durdu" olarak kalır.
            yaz(f"\nEğitim bitti ama değerlendirme yapılmadan durduruldu. Değerlendirmek için: {degerlendir_komutu}")
            return {"durduruldu": True, "adim": tamamlanan}
        if tamamlanan > baslangic_adim:
            vadesi_geldi = tamamlanan % her == 0 or tamamlanan == toplam_adim
            kaydet(son_yol, tamamlanan, en_iyi, sabir, adim_olcumu() if vadesi_geldi and degerlendirilen != tamamlanan else None)
            durum_yaz("durduruldu", tamamlanan)
            yaz(f"\nDurduruldu: adım {tamamlanan}/{toplam_adim} kaydedildi.")
        else:
            durum_yaz("durduruldu", baslangic_adim)
            yaz("\nDurduruldu (bu oturumda tamamlanan adım yok).")
        if son_yol.exists():
            yaz(f"Sürdürmek için: python -m turkce_model egit --asama {asama} --devam{komut_eki}")
        if en_iyi_yol.exists():
            yaz(f"O ana kadarki en iyi modeli değerlendirmek için: {degerlendir_komutu}")
        return {"durduruldu": True, "adim": tamamlanan}

    son_durum = "erken_durdu" if erken_durdu else "bitti"
    try:
        yaz(f"Eğitim bitti ({(time.time() - basla) / 60:.1f} dk). En iyi model: {en_iyi_yol}")
        durum_yaz(son_durum, tamamlanan, degerlendirildi=False)  # tam değerlendirme satırı yazılana dek "değerlendirilmedi"
        sonuc = degerlendir(ayarlar, asama, cihaz=cihaz, yaz=yaz, komut_eki=veri_eki)
    except KeyboardInterrupt:
        yaz(
            "\nDeğerlendirme yarıda kesildi; eğitim kaydedildi. Değerlendirmek için: "
            f"python -m turkce_model degerlendir --asama {asama}{komut_eki}"
        )
        return {"durduruldu": True, "adim": tamamlanan}
    durum_yaz(son_durum, tamamlanan, degerlendirildi=True)
    sonuc["erken_durdu"] = erken_durdu
    return sonuc


def degerlendir(
    ayarlar: Ayarlar,
    asama: str | None = None,
    cihaz: str | None = None,
    yaz=print,
    kontrol_noktasi: Path | None = None,
    komut_eki: str = "",
) -> dict:
    """Bir kontrol noktasını tam değerlendirir ve ilerleme tablosuna ekler.

    Varsayılan: deneyin en iyi modeli; ``asama`` verilmezse MEB modeli varsa o, yoksa TDK modeli. ``kontrol_noktasi``
    verilirse aşama ve deney adı dosyanın kendi kaydından alınır; dosyanın kaydıyla çelişen bir ``asama`` hatadır.
    Yarıda kalmış bir ``--uzerine-yaz``ın kenara aldığı model önce yerine konur (``kenardakini_geri_getir``).
    ``komut_eki``: yazılan komutların sonuna eklenen seçenekler (``cli._komut_eki``).
    """
    cihaz = cihaz_dogrula(cihaz)
    if asama is not None and asama not in ASAMALAR:
        raise AyarHatasi(f"Aşama {asama!r} değil; şunlardan biri: {', '.join(ASAMALAR)}")
    egitimi_dogrula(ayarlar.tdk, "tdk")  # değerlendirme yığını egitim.tdk.yigin'den türer
    tok = tokenizer_yukle(ayarlar, komut_eki)
    meta = hazir_veri(ayarlar, tok, komut_eki)
    klasor = None
    if kontrol_noktasi is None:
        meb_bekliyor = None
        if asama is None:
            meb_klasoru = ayarlar.deney_klasoru / "meb"
            kenardakini_geri_getir(meb_klasoru, yaz)
            meb_var = any((meb_klasoru / ad).exists() for ad in ("en_iyi.pt", "son.pt"))
            asama = "meb" if meb_var else "tdk"
            meb_bekliyor = None if meb_var else yeniden_egitiliyor_notu(meb_klasoru)
        klasor = ayarlar.deney_klasoru / asama
        kenardakini_geri_getir(klasor, yaz)
        yol = klasor / "en_iyi.pt"
        if not yol.exists():
            yol = klasor / "son.pt"  # hiç değerlendirme yapılmadan durdurulduysa
        if not yol.exists():
            bekliyor = yeniden_egitiliyor_notu(klasor)
            if bekliyor:
                raise AyarHatasi(f"{bekliyor} Yeni eğitimin ilk kaydını bekle ya da belirli bir dosya için --model <yol> ver.")
            raise AyarHatasi(
                f"Değerlendirilecek model yok ({klasor}). Önce: python -m turkce_model egit --asama {asama}{komut_eki}. "
                "Başka bir deney için --deney <ad>, belirli bir dosya için --model <yol> ver."
            )
        if meb_bekliyor:
            yaz(f"Not: {meb_bekliyor} TDK modeli değerlendiriliyor.")
    else:
        yol = Path(kontrol_noktasi)
        if not yol.exists() and yol.name in ("en_iyi.pt", "son.pt"):  # aşama klasöründeki dosya kenarda olabilir
            kenardakini_geri_getir(yol.parent, yaz)
    model, kn = modeli_yukle(yol, tok, cihaz)
    deney = ayarlar.deney_adi
    if kontrol_noktasi is not None:
        kayitli_asama = kn.get("asama")
        if kayitli_asama in ASAMALAR:
            if asama is not None and asama != kayitli_asama:
                raise AyarHatasi(f"{yol} bir {kayitli_asama} aşaması kontrol noktası; --model ile --asama verme.")
            asama = kayitli_asama
        elif asama is None:
            asama = "tdk"
        kayitli = kn["ayarlar"]
        kendi = Ayarlar(
            gomme=GommeAyarlari(**kayitli["gomme"]), model=ModelAyarlari(**kayitli["model"]), deney=kayitli.get("deney", "")
        )
        deney = f"{kendi.deney_adi} ({yol.name})"
    ctx = baglam_yoneticisi(cihaz, hassasiyet_sec(getattr(ayarlar, asama).hassasiyet, cihaz))
    vk = veri_klasoru(ayarlar)
    yaz(f"Değerlendirilen model: {yol} (aşama {asama}, adım {kn.get('adim')})")
    # Akışlar egitim.tdk.yigin kadar (en fazla 16) pencerelik yığınlarla puanlanır: eğitime sığan yığın
    # değerlendirmeye de sığar. Her hedef tam bir kez puanlandığı için sonuç yığın boyundan bağımsızdır.
    akis_yigini = min(16, ayarlar.tdk.yigin)
    akis = akis_kaybi(model, AkisVeri(vk / "tdk_dogrulama.bin", tok.boyut), cihaz, ctx, yigin=akis_yigini)
    dokum = model.parametre_dokumu()
    sonuc = {
        "deney": deney,
        "asama": asama,
        "adim": kn.get("adim"),
        "parametre": dokum["toplam"],
        "parametre_gomme_disi": dokum["gömme dışı"],
        "gorulen_token": kn.get("gorulen_token"),  # değerlendirilen kontrol noktasının kendi sayısı
        "sozluk": {"boyut": tok.boyut, "imza": tokenizer_imzasi(tok)},
        "ek_paragraf": meta.get("ek_paragraf", 0),
        "dogrulama_kaybi": akis["kayip"],
        "sasirma": akis["sasirma"],
        "bpc": bpc(akis["toplam_nll"], meta["tdk_dogrulama"]["karakter"]),
        "gomme": asdict(GommeAyarlari(**kn["ayarlar"]["gomme"])),
        "olcum": OLCUM_SURUMU,
    }
    # Eğitimi bitmeden değerlendirilen model tabloda "durduruldu" notunu alır; --model ile verilen dosyada da
    # yanındaki durum.json'a bakılır (başka bir koşunun kaydıysa sayılmaz).
    durum = egitim_durumu_oku(klasor if klasor is not None else yol.parent)
    ayni_kosu = not durum or not durum.get("kosu") or not kn.get("kosu") or durum["kosu"] == kn["kosu"]
    if durum and durum.get("durum") in YARIM_DURUMLAR and ayni_kosu:
        sonuc["durduruldu"] = True
    yaz(f"TDK doğrulama: kayıp {akis['kayip']:.4f} | şaşkınlık {akis['sasirma']:.1f} | BPC {sonuc['bpc']:.3f}")
    ek_meta = meta.get("ek_dogrulama") or {}
    if ek_meta.get("karakter") and (vk / "ek_dogrulama.bin").exists():
        ek_akis = akis_kaybi(model, AkisVeri(vk / "ek_dogrulama.bin", tok.boyut), cihaz, ctx, yigin=akis_yigini)
        sonuc["bpc_ek"] = bpc(ek_akis["toplam_nll"], ek_meta["karakter"])
        yaz(f"Ek metin doğrulama: kayıp {ek_akis['kayip']:.4f} | BPC {sonuc['bpc_ek']:.3f}")
    soru_yolu = vk / "meb_sorular.jsonl"
    if soru_yolu.exists():
        from .meb import soru_oku

        sorular = soru_oku(soru_yolu)
        # MEB eğitim sorularının şık sayıları ("4": n, "5": m): ince ayar E şıkkını gördü mü, tabloda belli olsun.
        secenek = Counter(len(s.secenekler) for s in sorular if s.bolum == "egitim")
        if secenek:
            sonuc["meb_secenek"] = {str(n): adet for n, adet in sorted(secenek.items())}
        for bolum, anahtar in (("dogrulama", "meb_dogrulama"), ("test", "meb_test")):
            secili = [s for s in sorular if s.bolum == bolum]
            if secili:
                cs = coktan_secmeli(model, tok, secili, cihaz, ctx)
                sonuc[anahtar] = cs
                yaz(
                    f"MEB {BOLUM_ADLARI[bolum]}: {cs['n']} soru | doğruluk metin %{100 * cs['dogruluk_metin']:.1f}, "
                    f"harf %{100 * cs['dogruluk_harf']:.1f} | rastgele tahmin %{100 * cs['rastgele']:.1f}"
                )
    mmlu_yolu = ayarlar.veri_klasoru / "meb" / "turkishmmlu.jsonl"
    if mmlu_yolu.exists():
        from .meb import soru_oku

        cs = coktan_secmeli(model, tok, soru_oku(mmlu_yolu), cihaz, ctx)
        sonuc["mmlu"] = cs
        yaz(
            f"TurkishMMLU (eğitimde hiç kullanılmadı): {cs['n']} soru | doğruluk metin %{100 * cs['dogruluk_metin']:.1f}, "
            f"harf %{100 * cs['dogruluk_harf']:.1f} | rastgele tahmin %{100 * cs['rastgele']:.1f}"
        )
    md = ilerleme_ekle(ayarlar.cikti_klasoru, sonuc)
    if klasor is not None:  # aşamanın kendi (varsayılan) modeli değerlendirildi
        _degerlendirildi_isaretle(klasor, kn.get("kosu"))
    yaz(f"İlerleme tablosu güncellendi: {md}")
    return sonuc


def egitim_bellegi_gb(ayarlar: Ayarlar, sozluk_boyutu: int, yigin: int | None = None) -> float:
    """Eğitimde aktivasyon + logit belleğinin kaba tahmini (fp32, GB). Ağırlık ve AdamW durumu hariç.

    Bir dizi başına: çıkış logit'leri ve kopyaları (~5 × sözlük) + her katmanda ~20 × boyut ve dikkat matrisleri.
    Ölçümlere uyar (256 boyut, 6 katman, sözlük 32 000, bağlam 512: dizi başına ~0,46 GB).
    """
    yigin = yigin or ayarlar.tdk.yigin
    t, d, m = ayarlar.model.baglam, int(ayarlar.gomme.boyut), ayarlar.model
    bas = max(1, m.bas_sayisi(d))
    return yigin * t * 4 * (5 * sozluk_boyutu + m.katman * (20 * d + 3 * bas * t)) / 1e9


def hiz_olc(ayarlar: Ayarlar, sozluk_boyutu: int, adim: int = 5, cihaz: str | None = None) -> dict:
    """Rastgele veriyle birkaç eğitim adımı: saniyede token ve (CUDA'da) en yüksek bellek."""
    cihaz = cihaz_dogrula(cihaz)
    ea = ayarlar.tdk
    hassasiyet = hassasiyet_sec(ea.hassasiyet, cihaz)
    ctx = baglam_yoneticisi(cihaz, hassasiyet)
    from .tokenizer import KAT

    kategoriler = [KAT["kok"]] * sozluk_boyutu
    model = TurkceGPT(ayarlar.gomme, ayarlar.model, sozluk_boyutu, kategoriler, list(range(sozluk_boyutu)), [0] * sozluk_boyutu).to(cihaz)
    opt = model.iyilestirici(ea.ogrenme_orani, ea.agirlik_azaltma, cihaz)
    t = ayarlar.model.baglam
    if cihaz == "cuda":
        torch.cuda.reset_peak_memory_stats()

    def bekle() -> None:  # GPU işleri eşzamansızdır; süre ölçmeden önce bitmelerini bekle
        if cihaz == "cuda":
            torch.cuda.synchronize()
        elif cihaz == "mps":
            torch.mps.synchronize()

    sureler = []
    for i in range(adim + 1):
        x = torch.randint(0, sozluk_boyutu, (ea.yigin, t), device=cihaz)
        bekle()
        bas = time.time()
        with ctx():
            _, kayip = model(x, x)
        kayip.backward()
        opt.step()
        opt.zero_grad(set_to_none=True)
        bekle()
        if i:  # ilk adım ısınmadır
            sureler.append(time.time() - bas)
    sn = sum(sureler) / len(sureler)
    sonuc = {"cihaz": cihaz, "hassasiyet": hassasiyet, "token_sn": ea.yigin * t / sn, "adim_sn": sn, "yigin": ea.yigin}
    if cihaz == "cuda":
        sonuc["en_yuksek_bellek_gb"] = torch.cuda.max_memory_allocated() / 1e9
    return sonuc

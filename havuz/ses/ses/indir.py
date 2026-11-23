"""Model indirici: Hugging Face'ten SABİT sürümü indirir, boyutu ve sha256'yı doğrular.

Yalnız Python standart kütüphanesi (urllib) kullanır; vekil (HTTPS_PROXY) ve sertifika (SSL_CERT_FILE)
ortam değişkenlerine uyar. Hugging Face'in Xet aktarım istemcisini KULLANMAZ (düz HTTPS; bu ortamda
Xet takılabildiği için — HF_HUB_DISABLE_XET=1 ile aynı etki). Dosya önce `<ad>.part`'a yazılır,
özet tutarsa yerine taşınır; tutmazsa silinir ve hata verir. Var olan doğru dosya yeniden indirilmez.
Kim kullanır: komutlar.py (`indir`), scripts/gidis_donus.py.
Genişletme: başka bir kaynak (ör. kendi sunucunuz) → `adres` işlevini değiştirin; testte sahte
`acici` verilir (tests/test_indir.py).
"""

from __future__ import annotations

import hashlib
import json
import urllib.request
from collections.abc import Callable
from pathlib import Path
from typing import BinaryIO
from urllib.parse import quote

from ses.hatalar import BicimHatasi
from ses.katalog import KatalogDosyasi, KatalogModeli, model_klasoru

Acici = Callable[[str], BinaryIO]
Ilerleme = Callable[[str, int, int], None]
"""(dosya adı, inen bayt, toplam bayt)"""
_PARCA = 1 << 20


def adres(model: KatalogModeli, dosya: KatalogDosyasi) -> str:
    return f"https://huggingface.co/{model.hf}/resolve/{model.surum}/{quote(dosya.yol)}"


def _ac(url: str) -> BinaryIO:
    istek = urllib.request.Request(url, headers={"User-Agent": "havuz-ses/0.1"})  # noqa: S310 — https sabit
    yanit: BinaryIO = urllib.request.urlopen(istek, timeout=60)  # noqa: S310
    return yanit


def sha256_dosya(yol: Path) -> str:
    ozet = hashlib.sha256()
    with open(yol, "rb") as dosya:
        while parca := dosya.read(_PARCA):
            ozet.update(parca)
    return ozet.hexdigest()


def _dosya_indir(url: str, dosya: KatalogDosyasi, hedef: Path, acici: Acici, ilerleme: Ilerleme | None) -> None:
    gecici = hedef.with_name(hedef.name + ".part")
    ozet, inen = hashlib.sha256(), 0
    try:
        with acici(url) as kaynak, open(gecici, "wb") as cikti:
            while parca := kaynak.read(_PARCA):
                inen += len(parca)
                if inen > dosya.boyut:
                    raise BicimHatasi(f"{dosya.ad}: beklenenden büyük ({dosya.boyut} bayt); indirme durdu.")
                ozet.update(parca)
                cikti.write(parca)
                if ilerleme is not None:
                    ilerleme(dosya.ad, inen, dosya.boyut)
        if inen != dosya.boyut or ozet.hexdigest() != dosya.sha256:
            raise BicimHatasi(
                f"{dosya.ad}: sağlama özeti tutmadı (dosya bozuk ya da değişmiş). Yeniden deneyin; "
                "sürerse katalog sürümünü scripts/hf_dogrula.py ile denetleyin."
            )
        gecici.replace(hedef)
    except OSError as hata:
        raise BicimHatasi(f"{dosya.ad} indirilemedi: {hata}. Ağ bağlantısını denetleyin.") from hata
    finally:
        gecici.unlink(missing_ok=True)


def indir(
    model: KatalogModeli,
    model_dizini: Path,
    *,
    acici: Acici = _ac,
    ilerleme: Ilerleme | None = None,
) -> Path:
    """Modeli `<model_dizini>/<tür>/<ad>/`'a indirir (doğru olanları atlar); klasörü döndürür."""
    klasor = model_klasoru(model_dizini, model)
    klasor.mkdir(parents=True, exist_ok=True)
    for dosya in model.dosyalar:
        hedef = klasor / dosya.ad
        if hedef.is_file() and hedef.stat().st_size == dosya.boyut and sha256_dosya(hedef) == dosya.sha256:
            continue
        _dosya_indir(adres(model, dosya), dosya, hedef, acici, ilerleme)
    kayit = {"ad": model.ad, "hf": model.hf, "surum": model.surum, "lisans": model.lisans,
             "ticari": model.ticari, "atif": model.atif}  # fmt: skip
    (klasor / "KAYNAK.json").write_text(json.dumps(kayit, ensure_ascii=False, indent=2) + "\n", "utf-8")
    return klasor


def denetle(model: KatalogModeli, model_dizini: Path) -> list[str]:
    """İndirilmiş dosyaların sha256'sını denetler; sorunları Türkçe döndürür (boş liste: sağlam)."""
    klasor = model_klasoru(model_dizini, model)
    sorunlar = []
    for dosya in model.dosyalar:
        yol = klasor / dosya.ad
        if not yol.is_file():
            sorunlar.append(f"{dosya.ad} yok")
        elif sha256_dosya(yol) != dosya.sha256:
            sorunlar.append(f"{dosya.ad} bozuk (sha256 tutmuyor)")
    return sorunlar

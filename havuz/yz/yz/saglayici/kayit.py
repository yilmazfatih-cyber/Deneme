"""Sağlayıcı kaydı: yapılandırmadaki profil adından sağlayıcı nesnesi kurar.

Tek kayıt dosyası budur; "tur" → kurucu işlev eşlemesi `KURUCULAR` sözlüğündedir.
Kim kullanır: cli.py, sunucu, degerlendirme (koşu tanımındaki sağlayıcılar).
Genişletme: yeni sağlayıcı → `_xxx(ayar, anahtar, ortak)` kurucusunu yazıp `KURUCULAR`'a ekleyin
(aşağıda YENİ SAĞLAYICI BURAYA). Tarif: AGENTS.md "Yeni sağlayıcı ekle".
"""

from __future__ import annotations

import os
from collections.abc import Callable, Mapping
from typing import Any

from yz.ayar import Ayarlar, SaglayiciAyari
from yz.hatalar import AyarHatasi, ekstra_gerekli
from yz.saglayici.gunluk import IstekGunlugu
from yz.saglayici.maliyet import FiyatTablosu
from yz.saglayici.onbellek import DiskOnbellek
from yz.saglayici.openai_uyumlu import OpenAIUyumlu
from yz.saglayici.sahte import Sahte
from yz.saglayici.taban import Saglayici

Kurucu = Callable[[SaglayiciAyari, str | None, dict[str, Any]], Saglayici]


def _openai_uyumlu(ayar: SaglayiciAyari, anahtar: str | None, ortak: dict[str, Any]) -> Saglayici:
    if not ayar.taban_url:
        raise AyarHatasi("openai_uyumlu profili için `taban_url` gerekli (ör. http://localhost:11434/v1).")
    if not ayar.model:
        raise AyarHatasi(
            "Model adı verilmemiş. yz.yaml'da `model:` yazın ya da YZ_MODEL verin. Sunucudaki "
            "adları görmek için: python -m yz modeller"
        )
    return OpenAIUyumlu(
        ayar.taban_url,
        ayar.model,
        api_anahtari=anahtar,
        zaman_asimi_sn=ayar.zaman_asimi_sn,
        yapili_kip=ayar.yapili_kip,
        gomme_modeli=ayar.gomme_modeli,
        azami_belirtec=ayar.azami_belirtec,
        **ayar.ek,
        **ortak,
    )


def _anthropic(ayar: SaglayiciAyari, anahtar: str | None, ortak: dict[str, Any]) -> Saglayici:
    try:
        from yz.saglayici.anthropic_bagdastirici import Anthropic  # isteğe bağlı ekstra
    except ImportError as hata:
        raise ekstra_gerekli("anthropic", "anthropic") from hata
    if not ayar.model:
        raise AyarHatasi("anthropic profili için `model:` gerekli (yz.ornek.yaml'a bakın).")
    return Anthropic(
        ayar.model,
        api_anahtari=anahtar,
        taban_url=ayar.taban_url,
        zaman_asimi_sn=ayar.zaman_asimi_sn,
        azami_belirtec=ayar.azami_belirtec,
        **ayar.ek,
        **ortak,
    )


def _sahte(ayar: SaglayiciAyari, anahtar: str | None, ortak: dict[str, Any]) -> Saglayici:
    return Sahte.gosterim(azami_belirtec=ayar.azami_belirtec, **ortak)


KURUCULAR: dict[str, Kurucu] = {
    "openai_uyumlu": _openai_uyumlu,
    "anthropic": _anthropic,
    "sahte": _sahte,
    # YENİ SAĞLAYICI BURAYA: "tur_adi": _kurucu_islevi,
}


def ortak_secenekler(ayarlar: Ayarlar) -> dict[str, Any]:
    """Bütün sağlayıcıların paylaştığı hizmetler: önbellek, günlük, fiyat tablosu."""
    fiyatlar = FiyatTablosu(fiyatlar=ayarlar.fiyatlar, para_birimi=ayarlar.para_birimi)
    ortak: dict[str, Any] = {"fiyatlar": fiyatlar}
    if ayarlar.onbellek:
        ortak["onbellek"] = DiskOnbellek(ayarlar.veri_dizini / "onbellek")
    if ayarlar.gunluk:
        ortak["gunluk"] = IstekGunlugu(ayarlar.veri_dizini / "gunluk.jsonl")
    return ortak


def saglayici_olustur(
    ayarlar: Ayarlar,
    ad: str | None = None,
    *,
    model: str | None = None,
    ortam: Mapping[str, str] | None = None,
    **ortak_ek: Any,
) -> Saglayici:
    """Profil adından (verilmezse varsayılandan) sağlayıcı kurar.

    model: profildeki model adını bu çağrı için değiştirir (ör. `yz karsilastir`).
    """
    ortam = os.environ if ortam is None else ortam
    _, ayar = ayarlar.profil(ad)
    if model:
        ayar = ayar.model_copy(update={"model": model})
    kurucu = KURUCULAR.get(ayar.tur)
    if kurucu is None:
        raise AyarHatasi(
            f"Bilinmeyen sağlayıcı türü: `{ayar.tur}`. Geçerli türler: {', '.join(sorted(KURUCULAR))}."
        )
    anahtar = ortam.get(ayar.api_anahtari_ortam) if ayar.api_anahtari_ortam else None
    return kurucu(ayar, anahtar or None, {**ortak_secenekler(ayarlar), **ortak_ek})

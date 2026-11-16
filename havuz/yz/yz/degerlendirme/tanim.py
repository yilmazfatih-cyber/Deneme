"""Değerlendirme koşusu tanımı (YAML) ve örnek dosyası (JSONL).

YAML alanları (gorevler/*.yaml örneklerine bakın):
    ad, aciklama        görev kümesinin adı
    gorev               sohbet | cikarim | arac | rag
    veri                JSONL dosyası (YAML'a göre göreli yol)
    sistem, istem       istem şablonu; `{girdi}` ve örnekteki diğer alanlar kullanılabilir
    sema                cikarim için "paket.modul:Sinif" ya da JSON şeması dosyası
    araclar             arac için hazır araç adları: hesapla, zaman, dosya:<klasör>, sqlite:<db>
    belgeler            rag için belge klasörü
    puanlayicilar       [{tur: tam_eslesme, alan: ..., ...}] (degerlendirme/puanlayici.py)
    gecme_esigi         örneğin "doğru" sayılması için ağırlıklı puan eşiği (varsayılan 1.0)
    azami_belirtec, sicaklik, es_zamanlilik
JSONL satırı: {"kimlik": "…", "girdi": "…", "beklenen": …, …ek alanlar}
Kim kullanır: degerlendirme/kosu.py, cli.py (`degerlendir`, `karsilastir`).
Genişletme: yeni görev türü → `GorevTuru`'na ekleyip kosu.py `_CALISTIRICILAR`'a işlev yazın.
"""

from __future__ import annotations

import importlib
import json
from pathlib import Path
from typing import Any, Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from yz.hatalar import VeriHatasi
from yz.yapili.sema_modeli import json_semadan_model

GorevTuru = Literal["sohbet", "cikarim", "arac", "rag"]


class PuanlayiciAyari(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tur: str
    alan: str | None = None  # çıktı JSON'unda bakılacak alan ("kalemler.0.ad" gibi)
    agirlik: float = Field(default=1.0, ge=0)
    tolerans: float = 0.0  # sayisal: mutlak fark sınırı
    goreli: bool = False  # sayisal: tolerans oran mı (0.01 = %1)
    konum: Literal["ilk", "son", "herhangi"] = "ilk"  # sayisal: yanıttaki hangi sayı puanlanır
    desen: str | None = None  # duzenli_ifade: verilmezse "beklenen" desen sayılır
    esik: float = 0.8  # gomme_benzerligi: geçme eşiği (kosinüs)
    olcut: str = "Yanıt beklenenle aynı anlamı taşıyor mu?"  # hakem
    buyuk_kucuk: bool = False  # tam_eslesme/icerme: harf büyüklüğü önemli mi


class KosuTanimi(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ad: str
    aciklama: str = ""
    gorev: GorevTuru = "sohbet"
    veri: str
    sistem: str | None = None
    istem: str = "{girdi}"
    sema: str | None = None
    araclar: list[str] = Field(default_factory=list)
    belgeler: str | None = None
    puanlayicilar: list[PuanlayiciAyari] = Field(min_length=1)
    gecme_esigi: float = Field(default=1.0, ge=0, le=1)
    azami_belirtec: int | None = 300
    sicaklik: float = 0.0
    es_zamanlilik: int = Field(default=2, ge=1, le=16)
    saglayicilar: list[str] = Field(default_factory=list)  # karsilastir için varsayılan profiller
    kok: Path = Path(".")  # YAML'ın bulunduğu klasör (yükleyici doldurur)

    def yol(self, goreli: str) -> Path:
        aday = Path(goreli)
        return aday if aday.is_absolute() else self.kok / aday


def tanim_yukle(yol: str | Path) -> KosuTanimi:
    """YAML koşu tanımını okur ve doğrular."""
    yol = Path(yol)
    if not yol.is_file():
        raise VeriHatasi(f"Koşu tanımı bulunamadı: {yol}. Örnekler için gorevler/ klasörüne bakın.")
    try:
        ham = yaml.safe_load(yol.read_text(encoding="utf-8")) or {}
        return KosuTanimi.model_validate({**ham, "kok": yol.parent})
    except yaml.YAMLError as hata:
        raise VeriHatasi(f"{yol} geçerli YAML değil: {hata}") from hata
    except ValidationError as hata:
        satirlar = [f"  - {'.'.join(map(str, h['loc']))}: {h['msg']}" for h in hata.errors()]
        raise VeriHatasi(f"{yol} hatalı:\n" + "\n".join(satirlar)) from hata


class Ornek(BaseModel):
    """Görev kümesindeki bir örnek."""

    model_config = ConfigDict(extra="allow")

    kimlik: str
    girdi: str
    beklenen: Any = None

    def alanlar(self) -> dict[str, Any]:
        """İstem şablonunda kullanılabilecek bütün alanlar."""
        return self.model_dump()


def ornekleri_yukle(yol: str | Path) -> list[Ornek]:
    ornekler: list[Ornek] = []
    gorulen: set[str] = set()
    for no, satir in enumerate(Path(yol).read_text(encoding="utf-8").splitlines(), start=1):
        if not satir.strip():
            continue
        try:
            ornek = Ornek.model_validate(json.loads(satir))
        except (ValueError, ValidationError) as hata:
            raise VeriHatasi(
                f"{yol}:{no}: satır geçersiz ({hata}). Biçim: "
                '{"kimlik": "...", "girdi": "...", "beklenen": ...}'
            ) from hata
        if ornek.kimlik in gorulen:
            raise VeriHatasi(f"{yol}:{no}: `{ornek.kimlik}` kimliği iki kez kullanılmış.")
        gorulen.add(ornek.kimlik)
        ornekler.append(ornek)
    if not ornekler:
        raise VeriHatasi(f"{yol} boş; en az bir örnek gerekli.")
    return ornekler


def sema_yukle(tanim: str, kok: Path = Path(".")) -> type[BaseModel]:
    """ "paket.modul:Sinif" ya da JSON şeması dosyasından Pydantic sınıfı döndürür."""
    if ":" in tanim and not tanim.endswith(".json"):
        modul_adi, _, sinif_adi = tanim.partition(":")
        try:
            sinif = getattr(importlib.import_module(modul_adi), sinif_adi)
        except (ImportError, AttributeError) as hata:
            raise VeriHatasi(f"Şema bulunamadı: {tanim} ({hata}).") from hata
        if not (isinstance(sinif, type) and issubclass(sinif, BaseModel)):
            raise VeriHatasi(f"{tanim} bir Pydantic modeli değil.")
        return sinif
    yol = Path(tanim) if Path(tanim).is_absolute() else kok / tanim
    if not yol.is_file():
        raise VeriHatasi(f"Şema dosyası bulunamadı: {yol}")
    return json_semadan_model(json.loads(yol.read_text(encoding="utf-8")))

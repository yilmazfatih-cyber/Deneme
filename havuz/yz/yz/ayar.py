"""Yapılandırma: yz.yaml dosyası + ortam değişkenleri → doğrulanmış `Ayarlar`.

Çabuk eskiyen her bilgi (model adı, adres, fiyat, beta bayrağı) burada, yani kullanıcının
dosyasında durur; kodda durmaz. Sırlar dosyaya YAZILMAZ: dosyada yalnız sırrı taşıyan ortam
değişkeninin ADI bulunur (`api_anahtari_ortam`).
Arama sırası: açıkça verilen yol → YZ_AYAR ortam değişkeni → ./yz.yaml → (dosya yok) varsayılanlar.
Ortam değişkenleri: YZ_SAGLAYICI (varsayılan profil adı), YZ_TABAN_URL + YZ_MODEL (+ YZ_API_ANAHTARI)
→ "ortam" adlı OpenAI uyumlu profil.
Kim kullanır: cli.py, sunucu, saglayici/kayit.py. Bu modül paketin başka alt paketini içe
aktarmaz (döngü olmasın diye); öyle kalmalıdır.
Genişletme: yeni ayar → ilgili modele varsayılanıyla alan ekleyin, yz.ornek.yaml'da belgeleyin.
"""

from __future__ import annotations

import os
from collections.abc import Mapping
from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from yz.hatalar import AyarHatasi

ORNEK_DOSYA = "yz.ornek.yaml"


class ModelFiyati(BaseModel):
    """Bir modelin fiyatı: 1 milyon belirteç başına (para birimi kullanıcının seçimidir)."""

    girdi: float = Field(ge=0)
    cikti: float = Field(ge=0)


class SaglayiciAyari(BaseModel):
    """Bir sağlayıcı profili (yz.yaml → saglayicilar.<ad>)."""

    model_config = ConfigDict(extra="forbid")

    tur: str = "openai_uyumlu"  # openai_uyumlu | anthropic | sahte (bkz. saglayici/kayit.py)
    model: str = ""
    taban_url: str | None = None
    api_anahtari_ortam: str | None = None  # anahtarı taşıyan ortam değişkeninin adı
    zaman_asimi_sn: float = Field(default=120.0, gt=0)
    azami_belirtec: int | None = Field(default=1024, gt=0)  # çıktı uzunluğu sınırı
    yapili_kip: str = "json_sema"  # json_sema | json_nesne | gbnf | kapali
    gomme_modeli: str | None = None
    ek: dict[str, Any] = Field(default_factory=dict)  # bağdaştırıcıya aynen geçen ek seçenekler


class SunucuAyari(BaseModel):
    """Sohbet sunucusu ayarları (python -m yz sun)."""

    model_config = ConfigDict(extra="forbid")

    adres: str = "127.0.0.1"
    kapi: int = Field(default=8420, ge=0, le=65535)
    api_anahtari_ortam: str = "YZ_SUNUCU_ANAHTARI"
    maskele: bool = True  # kişisel veriyi modele göndermeden önce maskele
    azami_yukleme_bayt: int = Field(default=10 * 1024 * 1024, gt=0)
    izinli_kokenler: list[str] = Field(default_factory=list)  # CORS; boş = kapalı


class Ayarlar(BaseModel):
    """Bütün yapılandırma."""

    model_config = ConfigDict(extra="forbid")

    varsayilan: str = ""
    saglayicilar: dict[str, SaglayiciAyari] = Field(default_factory=dict)
    fiyatlar: dict[str, ModelFiyati] = Field(default_factory=dict)  # 1 milyon belirteç başına
    para_birimi: str = ""
    veri_dizini: Path = Path(".yz")  # önbellek, günlük, dizin ve raporlar buraya yazılır
    onbellek: bool = False
    gunluk: bool = True
    sunucu: SunucuAyari = Field(default_factory=SunucuAyari)

    def profil(self, ad: str | None = None) -> tuple[str, SaglayiciAyari]:
        """Adı verilen (ya da varsayılan) profili döndürür; yoksa yol gösteren hata fırlatır."""
        secilen = ad or self.varsayilan
        if secilen == "sahte" and "sahte" not in self.saglayicilar:
            return "sahte", SaglayiciAyari(tur="sahte", model="sahte-gosterim")
        if not secilen:
            raise AyarHatasi(
                "Hiç sağlayıcı yapılandırılmamış. Şunlardan birini yapın:\n"
                f"  1) {ORNEK_DOSYA} dosyasını yz.yaml adıyla kopyalayıp düzenleyin,\n"
                "  2) YZ_TABAN_URL ve YZ_MODEL ortam değişkenlerini verin\n"
                "     (ör. YZ_TABAN_URL=http://localhost:11434/v1 YZ_MODEL=<model adı>),\n"
                "  3) model olmadan denemek için: --saglayici sahte"
            )
        if secilen not in self.saglayicilar:
            mevcut = ", ".join(sorted({*self.saglayicilar, "sahte"}))
            raise AyarHatasi(f"`{secilen}` adlı sağlayıcı profili yok. Tanımlı profiller: {mevcut}.")
        return secilen, self.saglayicilar[secilen]


def _dosya_bul(yol: str | Path | None, ortam: Mapping[str, str]) -> Path | None:
    if yol is not None:
        aday = Path(yol)
        if not aday.is_file():
            raise AyarHatasi(f"Ayar dosyası bulunamadı: {aday}")
        return aday
    if ortam.get("YZ_AYAR"):
        aday = Path(ortam["YZ_AYAR"])
        if not aday.is_file():
            raise AyarHatasi(f"YZ_AYAR ile verilen ayar dosyası bulunamadı: {aday}")
        return aday
    yerel = Path("yz.yaml")
    return yerel if yerel.is_file() else None


def ayarlari_yukle(
    yol: str | Path | None = None, ortam: Mapping[str, str] | None = None
) -> Ayarlar:
    """Ayarları dosyadan ve ortamdan okur, doğrular."""
    ortam = os.environ if ortam is None else ortam
    dosya = _dosya_bul(yol, ortam)
    ham: dict[str, Any] = {}
    if dosya is not None:
        try:
            okunan = yaml.safe_load(dosya.read_text(encoding="utf-8")) or {}
        except yaml.YAMLError as hata:
            raise AyarHatasi(f"{dosya} geçerli YAML değil: {hata}") from hata
        if not isinstance(okunan, dict):
            raise AyarHatasi(f"{dosya} en üstte bir eşleme (anahtar: değer) içermeli.")
        ham = okunan
    try:
        ayarlar = Ayarlar.model_validate(ham)
    except ValidationError as hata:
        satirlar = [
            f"  - {'.'.join(str(p) for p in h['loc'])}: {h['msg']}" for h in hata.errors()
        ]
        raise AyarHatasi(
            f"{dosya or 'ayarlar'} hatalı:\n" + "\n".join(satirlar) + f"\nÖrnek için: {ORNEK_DOSYA}"
        ) from hata
    if ortam.get("YZ_TABAN_URL") or ortam.get("YZ_MODEL"):
        ayarlar.saglayicilar["ortam"] = SaglayiciAyari(
            tur="openai_uyumlu",
            taban_url=ortam.get("YZ_TABAN_URL") or "http://localhost:11434/v1",
            model=ortam.get("YZ_MODEL", ""),
            api_anahtari_ortam="YZ_API_ANAHTARI",
        )
        ayarlar.varsayilan = "ortam"
    if ortam.get("YZ_SAGLAYICI"):
        ayarlar.varsayilan = ortam["YZ_SAGLAYICI"]
    if ortam.get("YZ_VERI_DIZINI"):
        ayarlar.veri_dizini = Path(ortam["YZ_VERI_DIZINI"])
    return ayarlar

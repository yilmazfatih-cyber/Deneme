"""Servis ayarları: tek YAML dosyası (örnek: `ayarlar.ornek.yaml`), Pydantic ile doğrulanır.

Göreli yollar ayar dosyasının bulunduğu klasöre göre çözülür. Metinlerdeki `${DEGISKEN}` ortam değişkeniyle
değiştirilir (RTSP parolası, POS anahtarı gibi sırlar dosyaya yazılmasın diye); tanımsız değişken hatadır.
"""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Any, Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field, PrivateAttr, ValidationError, field_validator, model_validator


class AyarHatasi(ValueError):
    """Ayar dosyası okunamadı ya da kurallara uymuyor."""


def dogrulama_ozeti(hata: ValidationError) -> str:
    """Pydantic hatalarını `alan.yolu: ileti` satırlarına çevirir."""
    satirlar = []
    for ayrinti in hata.errors():
        yer = ".".join(str(p) for p in ayrinti["loc"]) or "(kök)"
        satirlar.append(f"  - {yer}: {ayrinti['msg']}")
    return "\n".join(satirlar)


_DEGISKEN = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)\}")


def ortam_degiskenlerini_ac(deger: Any) -> Any:
    if isinstance(deger, str):

        def degistir(eslesme: re.Match[str]) -> str:
            ad = eslesme.group(1)
            if ad not in os.environ:
                raise AyarHatasi(f"ortam değişkeni tanımlı değil: {ad}")
            return os.environ[ad]

        return _DEGISKEN.sub(degistir, deger)
    if isinstance(deger, dict):
        return {anahtar: ortam_degiskenlerini_ac(d) for anahtar, d in deger.items()}
    if isinstance(deger, list):
        return [ortam_degiskenlerini_ac(d) for d in deger]
    return deger


class _Kati(BaseModel):
    model_config = ConfigDict(extra="forbid")


class KameraAyari(_Kati):
    # USB kamera sırası (0, 1 ...), RTSP/HTTP akış adresi, video dosyası ya da fotoğraf klasörü (deneme).
    kaynak: int | str = 0
    # Fiyatlandırma çekimi aralığı. Tepsi değişmedikçe yapay zekâ çağrılmaz; aralık yalnız üst sınırdır.
    cekim_araligi_sn: float = Field(3.5, ge=1.0, le=30.0)
    # Boş tezgâh ve hareket denetimi (yerel, ücretsiz) bu sıklıkla yapılır.
    yoklama_sn: float = Field(0.3, ge=0.05, le=2.0)
    # Tepsi alanı: [x, y, genişlik, yükseklik], karenin oranı olarak (0–1). Boşsa karenin tamamı.
    bolge: tuple[float, float, float, float] | None = None
    genislik: int | None = Field(None, ge=160, le=7680)
    yukseklik: int | None = Field(None, ge=120, le=4320)
    # Fotoğraf klasörü kaynağında her fotoğraf bu kadar süre "kamerada" kalır.
    slayt_suresi_sn: float = Field(4.0, gt=0)

    @field_validator("bolge")
    @classmethod
    def _bolge(cls, bolge: tuple[float, float, float, float] | None) -> tuple[float, float, float, float] | None:
        if bolge is None:
            return None
        x, y, gen, yuk = bolge
        if not (0 <= x < 1 and 0 <= y < 1 and 0.05 <= gen <= 1 and 0.05 <= yuk <= 1):
            raise ValueError("bölge [x, y, genişlik, yükseklik] 0–1 aralığında olmalı (genişlik/yükseklik ≥ 0.05)")
        if x + gen > 1.0001 or y + yuk > 1.0001:
            raise ValueError("bölge karenin dışına taşıyor (x + genişlik ≤ 1, y + yükseklik ≤ 1)")
        return bolge


class EsikAyari(_Kati):
    """Değişim eşikleri. İmza = bölgenin 48×36 gri küçültmesi; oranlar 'değişen hücrelerin payı'dır."""

    hucre_esigi: float = Field(18.0, ge=1, le=255)  # bir hücre bu kadar gri düzeyi farklıysa "değişmiş" sayılır
    bos: float = Field(0.02, gt=0, lt=1)  # boş tezgâh imzasından farkı bunun altındaysa tezgâh boş
    ayni_tepsi: float = Field(0.03, gt=0, lt=1)  # son tanınan kareden farkı bunun altındaysa aynı tepsi
    hareket: float = Field(0.05, gt=0, lt=1)  # bir önceki yoklamadan farkı bunun altındaysa görüntü sabit
    yeni_tepsi: float = Field(0.5, gt=0, le=1)  # boşluk görülmeden bu kadar değiştiyse ve yemekler farklıysa yeni tepsi
    arka_plan_uyum: float = Field(0.05, ge=0, le=1)  # boş tezgâh imzası ışık değişimine bu hızla uyar


class TanimaAyari(_Kati):
    tur: Literal["claude", "sahte"] = "claude"  # sahte: fotoğrafın yanındaki .json'u okur (demo/test)
    model: str = "claude-opus-5-5"
    efor: Literal["low", "medium", "high", "xhigh", "max"] = "low"
    max_tokens: int = Field(4096, ge=512, le=64000)
    zaman_asimi_sn: float = Field(10.0, gt=0, le=120)
    # SDK içi yeniden deneme. Varsayılan 0: döngü zaten sonraki çekimde yeniden dener; uzun beklemede boşluk kaçmaz.
    tekrar_deneme: int = Field(0, ge=0, le=5)
    gorsel_uzun_kenar: int = Field(1024, ge=256, le=2576)
    referans_uzun_kenar: int = Field(384, ge=128, le=1024)
    en_dusuk_guven: float = Field(0.6, ge=0, le=1)
    # Sunucu tarafı yedek model (fallbacks: "default"); yalnız destekleyen modellerde gönderilir.
    yedek_model: bool = True


class PosAyari(_Kati):
    tur: Literal["http", "klasor", "konsol"] = "konsol"
    adres: str | None = None  # http: siparişin POST edileceği adres
    basliklar: dict[str, str] = Field(default_factory=dict)
    zaman_asimi_sn: float = Field(2.0, gt=0, le=30)
    deneme_sayisi: int = Field(3, ge=1, le=10)
    ortam_vekili: bool = False  # http: ortamdaki HTTP(S)_PROXY kullanılsın mı (yerel POS için kapalı)
    klasor: str = "pos-cikis"  # klasor: her mesaj bir JSON dosyası
    kasa_adi: str = "kasa-1"
    # Tepsi kasada durdukça son sipariş her çekimde aynı numara ve revizyonla yeniden gönderilir.
    surekli_gonder: bool = False
    # Tepsi kasadan ayrılınca {"islem": "kapandi"} mesajı gönderilir (müşteri ekranını temizlemek için).
    kapanis_bildir: bool = False

    @model_validator(mode="after")
    def _http_adresi(self) -> PosAyari:
        if self.tur == "http" and not self.adres:
            raise ValueError("pos.tur http iken pos.adres gerekli (ör. http://192.168.1.50:8099/siparis)")
        return self


class KayitAyari(_Kati):
    klasor: str = "kayitlar"
    gorsel_sakla: bool = True  # gönderilen her siparişin tepsi görüntüsü (yalnız bölge) saklanır
    saklama_gun: int | None = Field(30, ge=1)  # None: silinmez


class Ayarlar(_Kati):
    # Menü dosyası; {tarih} bugünün tarihiyle (YYYY-AA-GG) değişir: menuler/{tarih}.yaml
    menu: str = "menuler/ornek-menu.yaml"
    kalibrasyon: str = "kalibrasyon"
    kamera: KameraAyari = Field(default_factory=KameraAyari)
    esikler: EsikAyari = Field(default_factory=EsikAyari)
    tanima: TanimaAyari = Field(default_factory=TanimaAyari)
    pos: PosAyari = Field(default_factory=PosAyari)
    kayit: KayitAyari = Field(default_factory=KayitAyari)

    _temel: Path = PrivateAttr(default_factory=Path.cwd)

    @property
    def temel(self) -> Path:
        """Göreli yolların çözüldüğü klasör (ayar dosyasının klasörü)."""
        return self._temel

    def yol(self, deger: str | Path) -> Path:
        yol = Path(deger)
        return yol if yol.is_absolute() else self._temel / yol


def ayarlari_yukle(yol: str | Path) -> Ayarlar:
    yol = Path(yol)
    try:
        ham = yaml.safe_load(yol.read_text(encoding="utf-8"))
    except OSError as e:
        raise AyarHatasi(f"ayar dosyası okunamadı: {yol} ({e.strerror})") from None
    except yaml.YAMLError as e:
        raise AyarHatasi(f"{yol}: YAML hatası: {e}") from None
    if ham is None:
        ham = {}
    if not isinstance(ham, dict):
        raise AyarHatasi(f"{yol}: en üstte anahtar: değer çiftleri olmalı")
    try:
        ayarlar = Ayarlar.model_validate(ortam_degiskenlerini_ac(ham))
    except ValidationError as e:
        raise AyarHatasi(f"{yol}: ayarlar geçersiz:\n{dogrulama_ozeti(e)}") from None
    ayarlar._temel = yol.resolve().parent
    return ayarlar

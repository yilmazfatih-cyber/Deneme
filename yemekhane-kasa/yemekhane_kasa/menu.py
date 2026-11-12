"""Günün menüsü: yemekler, KDV dahil fiyatlar, yarım porsiyon ve fiks menü kuralları.

Menü bir YAML dosyasıdır (örnek: `menuler/ornek-menu.yaml`). Fiyatlar TL yazılır (`45`, `45.5`, `"45,50"`); yuvarlama
hatası olmasın diye içeride tamsayı kuruşa çevrilir. `MenuIzleyici` dosyayı izler: menü servis çalışırken
düzeltilebilir; bozuk bir sürüm kaydedilirse son geçerli menü kullanılmaya devam eder.
"""

from __future__ import annotations

import logging
import re
from collections.abc import Callable
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path

import yaml
from pydantic import BaseModel, ConfigDict, Field, PrivateAttr, ValidationError, field_validator, model_validator

from yemekhane_kasa.ayarlar import dogrulama_ozeti

log = logging.getLogger(__name__)

KIMLIK = re.compile(r"^[a-z0-9_]{1,48}$")
KIMLIK_ACIKLAMA = "küçük harf, rakam ve _ (ör. mercimek_corbasi)"
# Tepside sık görülen ama fiyatlanmayan şeyler: tanıyıcı bunları ne kaleme ne "tanınmayan"a yazar.
VARSAYILAN_YOK_SAY = ["ekmek", "peçete", "çatal, kaşık, bıçak", "boş tabak ve bardak", "tuz, baharat ve sos paketleri"]


class MenuHatasi(ValueError):
    """Menü dosyası okunamadı ya da kurallara uymuyor."""


def kurusa_cevir(deger: object) -> int:
    """`45` → 4500, `45.5` → 4550, `"45,50"` → 4550. Negatif ya da kuruştan küçük basamaklı fiyat hatadır."""
    if deger is None or isinstance(deger, bool):
        raise ValueError(f"fiyat sayı olmalı: {deger!r}")
    metin = str(deger).strip().replace(" ", "").replace(",", ".")
    try:
        tutar = Decimal(metin)
    except InvalidOperation:
        raise ValueError(f"fiyat okunamadı: {deger!r}") from None
    if not tutar.is_finite() or tutar < 0:
        raise ValueError(f"fiyat geçersiz: {deger!r}")
    kurus = tutar * 100
    if kurus != kurus.to_integral_value():
        raise ValueError(f"fiyatta en fazla iki ondalık basamak olabilir: {deger!r}")
    return int(kurus)


def tl(kurus: int) -> str:
    """4550 → '45,50 TL'; 123456 → '1.234,56 TL'; -2000 → '-20,00 TL'."""
    isaret = "-" if kurus < 0 else ""
    lira, kalan = divmod(abs(kurus), 100)
    return f"{isaret}{lira:,}".replace(",", ".") + f",{kalan:02d} TL"


def _kimlik(deger: str) -> str:
    if not KIMLIK.match(deger):
        raise ValueError(f"'{deger}' geçersiz: {KIMLIK_ACIKLAMA}")
    return deger


class Yemek(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    id: str
    ad: str = Field(min_length=1)
    fiyat_kurus: int = Field(alias="fiyat")
    yarim_fiyat_kurus: int | None = Field(None, alias="yarim_fiyat")
    kategori: str = "diger"
    kdv: int | None = Field(None, ge=0, le=100)  # boşsa menünün KDV oranı
    plu: str | None = None  # POS'taki ürün kodu
    tarif: str = ""  # görünüşü: tanımaya yardım eder ("turuncu, pürüzsüz çorba; kasede")
    gorsel: str | None = None  # referans fotoğraf (menü dosyasının klasörüne göre)

    @field_validator("id", "kategori")
    @classmethod
    def _kimlik_denetle(cls, deger: str) -> str:
        return _kimlik(deger)

    @field_validator("fiyat_kurus", "yarim_fiyat_kurus", mode="before")
    @classmethod
    def _kurus(cls, deger: object) -> int | None:
        return None if deger is None else kurusa_cevir(deger)

    @field_validator("plu", mode="before")
    @classmethod
    def _plu(cls, deger: object) -> str | None:
        return None if deger is None else str(deger)

    @model_validator(mode="after")
    def _yarim(self) -> Yemek:
        if self.yarim_fiyat_kurus is not None and self.yarim_fiyat_kurus > self.fiyat_kurus:
            raise ValueError(f"{self.id}: yarım porsiyon fiyatı tam porsiyondan yüksek olamaz")
        return self

    @property
    def yarim_var(self) -> bool:
        return self.yarim_fiyat_kurus is not None

    def birim_fiyat(self, porsiyon: str) -> int:
        if porsiyon == "yarim" and self.yarim_fiyat_kurus is not None:
            return self.yarim_fiyat_kurus
        return self.fiyat_kurus


class FiksMenu(BaseModel):
    """Listelenen kategorilerin her birinden birer tam porsiyon, tek fiyata (ör. çorba + ana yemek + yardımcı)."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    ad: str = Field(min_length=1)
    kategoriler: list[str] = Field(min_length=2)
    fiyat_kurus: int = Field(alias="fiyat")

    @field_validator("kategoriler")
    @classmethod
    def _kategoriler(cls, kategoriler: list[str]) -> list[str]:
        return [_kimlik(k) for k in kategoriler]

    @field_validator("fiyat_kurus", mode="before")
    @classmethod
    def _kurus(cls, deger: object) -> int:
        return kurusa_cevir(deger)


class Menu(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    ad: str = "Günün menüsü"
    tarih: date | None = None
    kdv: int = Field(10, ge=0, le=100)  # varsayılan KDV oranı (%), fiyatlar KDV dahil
    yemekler: list[Yemek] = Field(min_length=1)
    fiks_menuler: list[FiksMenu] = Field(default_factory=list)
    yok_say: list[str] = Field(default_factory=lambda: list(VARSAYILAN_YOK_SAY))

    _dizin: dict[str, Yemek] = PrivateAttr(default_factory=dict)
    _klasor: Path | None = PrivateAttr(None)

    @model_validator(mode="after")
    def _capraz(self) -> Menu:
        gorulen: set[str] = set()
        pluler: dict[str, str] = {}
        for yemek in self.yemekler:
            if yemek.id in gorulen:
                raise ValueError(f"aynı kimlik iki kez: {yemek.id}")
            gorulen.add(yemek.id)
            if yemek.plu is not None:
                if yemek.plu in pluler:
                    raise ValueError(f"aynı PLU iki yemekte: {yemek.plu} ({pluler[yemek.plu]}, {yemek.id})")
                pluler[yemek.plu] = yemek.id
        kategoriler = {y.kategori for y in self.yemekler}
        for fiks in self.fiks_menuler:
            eksik = sorted(set(fiks.kategoriler) - kategoriler)
            if eksik:
                raise ValueError(f"'{fiks.ad}' fiks menüsündeki kategoride yemek yok: {', '.join(eksik)}")
        return self

    def model_post_init(self, _baglam: object) -> None:
        self._dizin = {y.id: y for y in self.yemekler}

    @property
    def kimlikler(self) -> list[str]:
        return [y.id for y in self.yemekler]

    def yemek(self, kimlik: str) -> Yemek | None:
        return self._dizin.get(kimlik)

    def kdv_orani(self, yemek: Yemek) -> int:
        return self.kdv if yemek.kdv is None else yemek.kdv

    def gorsel_yolu(self, yemek: Yemek) -> Path | None:
        if not yemek.gorsel:
            return None
        yol = Path(yemek.gorsel)
        if yol.is_absolute() or self._klasor is None:
            return yol
        return self._klasor / yol


def menu_yukle(yol: str | Path) -> Menu:
    yol = Path(yol)
    try:
        ham = yaml.safe_load(yol.read_text(encoding="utf-8"))
    except OSError as e:
        raise MenuHatasi(f"menü okunamadı: {yol} ({e.strerror})") from None
    except yaml.YAMLError as e:
        raise MenuHatasi(f"{yol}: YAML hatası: {e}") from None
    if not isinstance(ham, dict):
        raise MenuHatasi(f"{yol}: en üstte anahtar: değer çiftleri olmalı (ad, yemekler ...)")
    try:
        menu = Menu.model_validate(ham)
    except ValidationError as e:
        raise MenuHatasi(f"{yol}: menü geçersiz:\n{dogrulama_ozeti(e)}") from None
    menu._klasor = yol.resolve().parent
    for yemek in menu.yemekler:
        gorsel = menu.gorsel_yolu(yemek)
        if gorsel is not None and not gorsel.is_file():
            raise MenuHatasi(f"{yol}: {yemek.id} için referans fotoğraf yok: {gorsel}")
    return menu


class MenuIzleyici:
    """Menü dosyasını izler: dosya değişince ya da gün dönünce (`{tarih}` deseni) yeniden yükler.

    İlk yüklemede hata yükselir. Sonraki hatalarda (dosya yok, YAML bozuk) son geçerli menü kullanılır ve uyarı yazılır.
    """

    def __init__(self, desen: str, temel: Path, bugun: Callable[[], date] = date.today) -> None:
        self.desen = desen
        self.temel = temel
        self._bugun = bugun
        self._menu: Menu | None = None
        self._yol: Path | None = None
        self._damga: tuple[int, int] | None = None
        self._son_uyari: str | None = None

    def yol(self) -> Path:
        yol = Path(self.desen.replace("{tarih}", self._bugun().isoformat()))
        return yol if yol.is_absolute() else self.temel / yol

    def guncel(self) -> Menu:
        yol = self.yol()
        try:
            durum = yol.stat()
            damga: tuple[int, int] | None = (durum.st_mtime_ns, durum.st_size)
        except OSError:
            damga = None
        if self._menu is not None and yol == self._yol and damga == self._damga:
            return self._menu
        if damga is None:
            if self._menu is None:
                raise MenuHatasi(f"menü dosyası yok: {yol}")
            self._uyar(f"menü dosyası yok: {yol}; son geçerli menü kullanılıyor ({self._yol})")
            return self._menu
        try:
            yeni = menu_yukle(yol)
        except MenuHatasi as e:
            if self._menu is None:
                raise
            self._uyar(f"{e}\nson geçerli menü kullanılıyor ({self._yol})")
            return self._menu
        self._menu, self._yol, self._damga, self._son_uyari = yeni, yol, damga, None
        log.info("menü yüklendi: %s (%d yemek, %d fiks menü)", yol, len(yeni.yemekler), len(yeni.fiks_menuler))
        return yeni

    def _uyar(self, ileti: str) -> None:
        if ileti != self._son_uyari:
            log.warning(ileti)
            self._son_uyari = ileti

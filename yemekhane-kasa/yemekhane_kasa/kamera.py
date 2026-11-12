"""Görüntü kaynakları.

- `OpenCvKamera`: USB kamera (0, 1 ...), RTSP/HTTP akışı (IP kamera) ya da video dosyası. Arka plandaki bir iş
  parçacığı kareleri sürekli okur ve yalnız en sonuncusunu tutar; OpenCV tamponundaki bayat kareler kullanılmaz.
  Akış koparsa yeniden bağlanır; kare uzun süre gelmezse "donmuş" sayılır ve kare verilmez.
- `KlasorKaynagi`: deneme için klasördeki fotoğrafları sırayla, her birini belli bir süre "kamerada" tutar.
"""

from __future__ import annotations

import logging
import re
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

from PIL import Image

from yemekhane_kasa.ayarlar import KameraAyari

log = logging.getLogger(__name__)

FOTOGRAF_UZANTILARI = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


class KameraHatasi(RuntimeError):
    """Kaynak açılamadı ya da bulunamadı."""


@dataclass
class Kare:
    goruntu: Image.Image
    an: float  # time.monotonic() cinsinden çekim anı
    kaynak: str | None = None  # klasör kaynağında fotoğrafın yolu (sahte tanıyıcı yanındaki .json'u okur)


class Kaynak(Protocol):
    def ac(self) -> None: ...

    def son_kare(self) -> Kare | None: ...

    def kapat(self) -> None: ...

    @property
    def bitti(self) -> bool: ...


def gizle(adres: str) -> str:
    """rtsp://kullanici:parola@host → rtsp://***@host (günlüklere parola yazılmasın)."""
    return re.sub(r"//[^/@]+@", "//***@", adres)


class OpenCvKamera:
    def __init__(
        self,
        kaynak: int | str,
        genislik: int | None = None,
        yukseklik: int | None = None,
        bayat_sn: float = 5.0,
        saat: Callable[[], float] = time.monotonic,
    ) -> None:
        self.kaynak = kaynak
        self.genislik = genislik
        self.yukseklik = yukseklik
        self.bayat_sn = bayat_sn
        self._saat = saat
        self._dosya = isinstance(kaynak, str) and Path(kaynak).is_file()
        self._kilit = threading.Lock()
        self._dur = threading.Event()
        self._son: tuple[Any, float] | None = None
        self._is: threading.Thread | None = None
        self._cap: Any = None
        self._cv2: Any = None
        self._bitti = False
        self._bayat_uyarildi = False

    @property
    def ad(self) -> str:
        return gizle(str(self.kaynak))

    @property
    def bitti(self) -> bool:
        return self._bitti

    def ac(self) -> None:
        try:
            import cv2
        except ImportError:
            raise KameraHatasi("OpenCV kurulu değil: pip install -e '.[kamera]'") from None
        self._cv2 = cv2
        self._cap = self._baglan()
        self._is = threading.Thread(target=self._oku, name="kamera-okuyucu", daemon=True)
        self._is.start()
        log.info("kamera açıldı: %s", self.ad)

    def _baglan(self) -> Any:
        cv2 = self._cv2
        cap = cv2.VideoCapture(self.kaynak)
        if self.genislik:
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.genislik)
        if self.yukseklik:
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.yukseklik)
        if not cap.isOpened():
            cap.release()
            raise KameraHatasi(f"kamera açılamadı: {self.ad}")
        return cap

    def _oku(self) -> None:
        cv2 = self._cv2
        bekleme = 1.0 / (self._cap.get(cv2.CAP_PROP_FPS) or 25.0) if self._dosya else 0.0
        hata = 0
        while not self._dur.is_set():
            tamam, kare = self._cap.read()
            if not tamam:
                if self._dosya:
                    self._bitti = True
                    return
                hata += 1
                if hata % 50 == 0:  # ~5 sn kare yok: yeniden bağlan
                    log.warning("kameradan kare gelmiyor (%s); yeniden bağlanılıyor", self.ad)
                    self._cap.release()
                    try:
                        self._cap = self._baglan()
                    except KameraHatasi as e:
                        log.warning("%s", e)
                self._dur.wait(0.1)
                continue
            hata = 0
            with self._kilit:
                self._son = (kare, self._saat())
            if bekleme:
                self._dur.wait(bekleme)  # video dosyası gerçek hızında oynasın

    def son_kare(self) -> Kare | None:
        with self._kilit:
            son = self._son
        if son is None:
            return None
        kare, an = son
        yas = self._saat() - an
        if yas > self.bayat_sn:
            if not self._bayat_uyarildi:
                log.warning("son kare %.0f sn önce geldi; kamera donmuş ya da bağlantı kopmuş olabilir", yas)
                self._bayat_uyarildi = True
            return None
        self._bayat_uyarildi = False
        rgb = self._cv2.cvtColor(kare, self._cv2.COLOR_BGR2RGB)
        return Kare(Image.fromarray(rgb), an)

    def kapat(self) -> None:
        self._dur.set()
        if self._is is not None:
            self._is.join(timeout=2.0)
        if self._cap is not None:
            self._cap.release()


class KlasorKaynagi:
    """Klasördeki fotoğrafları ad sırasıyla, her birini `sure_sn` boyunca kamera görüntüsü gibi verir."""

    def __init__(
        self, klasor: Path, sure_sn: float, saat: Callable[[], float] = time.monotonic, dongu: bool = False
    ) -> None:
        self.klasor = Path(klasor)
        self.sure_sn = sure_sn
        self.dongu = dongu
        self._saat = saat
        self._dosyalar: list[Path] = []
        self._baslangic = 0.0
        self._onbellek: tuple[int, Image.Image | None] = (-1, None)
        self._bitti = False

    @property
    def bitti(self) -> bool:
        return self._bitti

    def ac(self) -> None:
        self._dosyalar = sorted(p for p in self.klasor.iterdir() if p.suffix.lower() in FOTOGRAF_UZANTILARI)
        if not self._dosyalar:
            raise KameraHatasi(f"klasörde fotoğraf yok: {self.klasor}")
        self._baslangic = self._saat()
        log.info("fotoğraf klasörü: %s (%d fotoğraf, her biri %.1f sn)", self.klasor, len(self._dosyalar), self.sure_sn)

    def son_kare(self) -> Kare | None:
        an = self._saat()
        sira = int((an - self._baslangic) // self.sure_sn)
        if sira >= len(self._dosyalar):
            if not self.dongu:
                self._bitti = True
                return None
            sira %= len(self._dosyalar)
        if self._onbellek[0] != sira:
            with Image.open(self._dosyalar[sira]) as acik:
                self._onbellek = (sira, acik.convert("RGB"))
            log.debug("kamerada: %s", self._dosyalar[sira].name)
        goruntu = self._onbellek[1]
        assert goruntu is not None
        return Kare(goruntu, an, str(self._dosyalar[sira]))

    def kapat(self) -> None:
        self._onbellek = (-1, None)


def kaynak_olustur(ayar: KameraAyari, temel: Path) -> Kaynak:
    kaynak = ayar.kaynak
    if isinstance(kaynak, int) or kaynak.strip().isdigit():
        return OpenCvKamera(int(kaynak), ayar.genislik, ayar.yukseklik)
    if "://" in kaynak:
        return OpenCvKamera(kaynak, ayar.genislik, ayar.yukseklik)
    yol = Path(kaynak)
    if not yol.is_absolute():
        yol = temel / yol
    if yol.is_dir():
        return KlasorKaynagi(yol, ayar.slayt_suresi_sn)
    if yol.is_file():
        return OpenCvKamera(str(yol), ayar.genislik, ayar.yukseklik)
    raise KameraHatasi(f"kamera kaynağı bulunamadı: {yol} (USB için 0, IP kamera için rtsp://... yazın)")

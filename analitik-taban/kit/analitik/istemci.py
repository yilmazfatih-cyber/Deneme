"""HTTP katmanı: yeniden deneme, okunur Türkçe hatalar, disk önbelleği, akışlı satır okuma.

Gerçek ağ (`GercekTasima`) ve sentetik demo (`demo.DemoTasima`) aynı arayüzü uygular; API istemcileri
hangisiyle konuştuğunu bilmez. Kurumsal proxy için HTTPS_PROXY, kurumsal kök sertifika için SSL_CERT_FILE
ortam değişkenleri olduğu gibi kullanılır.
"""

from __future__ import annotations

import gzip
import hashlib
import json
import re
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Dict, Iterator, Optional

KULLANICI_ARACISI = "analitik-taban/1.0 (+python-urllib)"


class ApiHatasi(Exception):
    """Kullanıcıya olduğu gibi gösterilecek, ne yapılacağını söyleyen Türkçe hata."""


class HttpHatasi(Exception):
    def __init__(self, kod: int, govde: str, bekle: Optional[float] = None):
        super().__init__(f"HTTP {kod}")
        self.kod = kod
        self.govde = govde
        self.bekle = bekle


def temizle(metin: str, uzunluk: int = 300) -> str:
    """Sunucu mesajını tek satıra indirir, olası anahtar/jeton görünümlü dizileri maskeler."""
    metin = " ".join(str(metin).split())
    metin = re.sub(r"[A-Za-z0-9_\-]{32,}", "***", metin)
    return metin[:uzunluk]


def url_kur(taban: str, params: Optional[Dict[str, Any]] = None) -> str:
    if not params:
        return taban
    temiz = {}
    for anahtar, deger in params.items():
        if deger is None:
            continue
        if isinstance(deger, (list, dict)):
            deger = json.dumps(deger, ensure_ascii=False)
        elif isinstance(deger, bool):
            deger = "true" if deger else "false"
        temiz[anahtar] = deger
    return taban + ("&" if "?" in taban else "?") + urllib.parse.urlencode(temiz)


class GercekTasima:
    def __init__(self, deneme: int = 3, bekleme: float = 2.0):
        self.deneme = deneme
        self.bekleme = bekleme
        self.istek_sayisi = 0

    def _ac(self, istek: urllib.request.Request, zaman_asimi: float):
        son_hata: Optional[Exception] = None
        for sira in range(self.deneme):
            try:
                self.istek_sayisi += 1
                return urllib.request.urlopen(istek, timeout=zaman_asimi)
            except urllib.error.HTTPError as hata:
                govde = ""
                try:
                    govde = hata.read().decode("utf-8", "replace")
                except Exception:  # noqa: BLE001 - gövde okunamazsa boş geç
                    pass
                bekle = None
                if hata.headers and hata.headers.get("Retry-After", "").isdigit():
                    bekle = float(hata.headers["Retry-After"])
                yeniden = hata.code == 429 or 500 <= hata.code < 600
                if yeniden and sira < self.deneme - 1 and (bekle is None or bekle <= 30):
                    time.sleep(bekle if bekle is not None else self.bekleme * (2**sira))
                    son_hata = HttpHatasi(hata.code, govde, bekle)
                    continue
                raise HttpHatasi(hata.code, govde, bekle) from None
            except ssl.SSLError as hata:
                raise ApiHatasi(
                    "SSL doğrulaması başarısız. Şirket ağı trafiği inceliyorsa kurumsal kök sertifikayı gösterin: "
                    "SSL_CERT_FILE=/yol/kurumsal-ca.pem (bkz. docs/KURULUM.md, Sorun giderme). "
                    f"Ayrıntı: {temizle(hata, 120)}"
                ) from None
            except urllib.error.URLError as hata:
                neden = getattr(hata, "reason", hata)
                if isinstance(neden, ssl.SSLError):
                    raise ApiHatasi(
                        "SSL doğrulaması başarısız. Kurumsal kök sertifika için SSL_CERT_FILE ayarlayın "
                        "(bkz. docs/KURULUM.md, Sorun giderme)."
                    ) from None
                son_hata = hata
                if sira < self.deneme - 1:
                    time.sleep(self.bekleme * (2**sira))
                    continue
                raise ApiHatasi(
                    f"Sunucuya ulaşılamadı ({temizle(neden, 120)}). İnternet/VPN bağlantısını ve şirket proxy'si "
                    "kullanılıyorsa HTTPS_PROXY değişkenini kontrol edin."
                ) from None
            except TimeoutError:
                son_hata = TimeoutError()
                if sira < self.deneme - 1:
                    continue
                raise ApiHatasi("İstek zaman aşımına uğradı; tarih aralığını daraltıp tekrar deneyin.") from None
        if isinstance(son_hata, HttpHatasi):
            raise son_hata
        raise ApiHatasi("İstek tamamlanamadı.")

    def json_iste(
        self,
        yontem: str,
        url: str,
        basliklar: Optional[Dict[str, str]] = None,
        govde: Optional[bytes] = None,
        zaman_asimi: float = 90,
    ) -> Any:
        basliklar = {"User-Agent": KULLANICI_ARACISI, "Accept": "application/json", **(basliklar or {})}
        istek = urllib.request.Request(url, data=govde, headers=basliklar, method=yontem)
        with self._ac(istek, zaman_asimi) as yanit:
            ham = yanit.read()
            if yanit.headers.get("Content-Encoding") == "gzip":
                ham = gzip.decompress(ham)
        metin = ham.decode("utf-8", "replace")
        try:
            return json.loads(metin) if metin.strip() else None
        except json.JSONDecodeError:
            raise ApiHatasi(f"Sunucu JSON dışı yanıt verdi: {temizle(metin, 160)}") from None

    def satir_iste(
        self, url: str, basliklar: Optional[Dict[str, str]] = None, zaman_asimi: float = 600
    ) -> Iterator[str]:
        basliklar = {"User-Agent": KULLANICI_ARACISI, "Accept-Encoding": "gzip", **(basliklar or {})}
        istek = urllib.request.Request(url, headers=basliklar, method="GET")
        yanit = self._ac(istek, zaman_asimi)
        try:
            akis = gzip.GzipFile(fileobj=yanit) if yanit.headers.get("Content-Encoding") == "gzip" else yanit
            for satir in akis:
                satir = satir.decode("utf-8", "replace").strip()
                if satir:
                    yield satir
        finally:
            yanit.close()


class Onbellek:
    """Aynı sorgu tekrar sorulduğunda API kotası ve bekleme harcamaz. dizin None ise kapalıdır."""

    def __init__(self, dizin: Optional[Path]):
        self.dizin = dizin
        if dizin is not None:
            dizin.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def anahtar(*parcalar: Any) -> str:
        return hashlib.sha256(json.dumps(parcalar, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:32]

    def al(self, anahtar: str, ttl_sn: float) -> Any:
        if self.dizin is None or ttl_sn <= 0:
            return None
        yol = self.dizin / f"{anahtar}.json"
        if not yol.exists() or time.time() - yol.stat().st_mtime > ttl_sn:
            return None
        try:
            return json.loads(yol.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return None

    def koy(self, anahtar: str, veri: Any) -> None:
        if self.dizin is None:
            return
        gecici = self.dizin / f"{anahtar}.tmp"
        gecici.write_text(json.dumps(veri, ensure_ascii=False), encoding="utf-8")
        gecici.replace(self.dizin / f"{anahtar}.json")

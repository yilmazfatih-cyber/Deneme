"""Kibar tarama: dürüst User-Agent, robots.txt, `content/tarama-yasak.json`, saniyede ≤ 1 istek (ADR-002, PLAN §11).

Yanıtlar yalnız bellekte tutulur; diske hiçbir şey yazılmaz.
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
import urllib.robotparser
from pathlib import Path
from urllib.parse import urlsplit

KULLANICI_ARACISI = "ModaRadar/0.1 (+github.com/yilmazfatih-cyber/Deneme)"
YASAK_DOSYASI = Path(__file__).resolve().parents[2] / "content" / "tarama-yasak.json"


class TaramaYasak(RuntimeError):
    """robots.txt ya da tarama-yasak.json izin vermiyor."""


def yasak_alanlar(yol: Path = YASAK_DOSYASI) -> set[str]:
    try:
        return {a.lower() for a in json.loads(yol.read_text("utf-8")).get("alanlar", [])}
    except (OSError, json.JSONDecodeError):
        return set()


class Tarayici:
    """Alan başına robots.txt önbelleği ve küresel hız sınırı (varsayılan 1 istek/sn)."""

    def __init__(self, en_az_aralik: float = 1.0, zaman_asimi: float = 30.0, yasaklar: set[str] | None = None):
        self.en_az_aralik = max(1.0, en_az_aralik)
        self.zaman_asimi = zaman_asimi
        self.yasaklar = yasak_alanlar() if yasaklar is None else yasaklar
        self._robots: dict[str, urllib.robotparser.RobotFileParser] = {}
        self._son_istek = 0.0
        self.istek_sayisi = 0

    def _bekle(self) -> None:
        gecen = time.monotonic() - self._son_istek
        if gecen < self.en_az_aralik:
            time.sleep(self.en_az_aralik - gecen)
        self._son_istek = time.monotonic()

    def izinli_mi(self, url: str) -> bool:
        parca = urlsplit(url)
        alan = parca.netloc.lower()
        if any(alan == y or alan.endswith("." + y) for y in self.yasaklar):
            return False
        if alan not in self._robots:
            rp = urllib.robotparser.RobotFileParser()
            robots_url = f"{parca.scheme}://{parca.netloc}/robots.txt"
            try:
                self._bekle()
                istek = urllib.request.Request(robots_url, headers={"User-Agent": KULLANICI_ARACISI})
                with urllib.request.urlopen(istek, timeout=self.zaman_asimi) as y:
                    rp.parse(y.read().decode("utf-8", "replace").splitlines())
            except urllib.error.HTTPError as e:
                # 4xx: robots yok → izinli; 5xx: belirsiz → izin yok (kibar taraf)
                rp.parse([] if 400 <= e.code < 500 else ["User-agent: *", "Disallow: /"])
            except (urllib.error.URLError, TimeoutError, OSError):
                rp.parse(["User-agent: *", "Disallow: /"])
            self._robots[alan] = rp
        return self._robots[alan].can_fetch(KULLANICI_ARACISI, url)

    def getir(self, url: str, kabul: str = "text/html,*/*;q=0.5") -> bytes:
        """URL'yi bellekte getirir. İzin yoksa TaramaYasak."""
        if not self.izinli_mi(url):
            raise TaramaYasak(f"robots.txt / tarama-yasak.json izin vermiyor: {url}")
        self._bekle()
        istek = urllib.request.Request(
            url,
            headers={"User-Agent": KULLANICI_ARACISI, "Accept": kabul, "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.5"},
        )
        with urllib.request.urlopen(istek, timeout=self.zaman_asimi) as y:
            self.istek_sayisi += 1
            return y.read()

    def metin(self, url: str) -> str:
        return self.getir(url).decode("utf-8", "replace")

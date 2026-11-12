"""Denetim kaydı: her tanıma ve gönderim `kayitlar/YYYY-AA-GG/olaylar.jsonl` dosyasına bir satır olarak yazılır;
gönderilen her siparişin tepsi görüntüsü (yalnız tepsi bölgesi) yanına konur. Müşteri itirazında "kamera ne gördü,
model ne dedi, POS'a ne gitti" sorusunun cevabı buradadır. `saklama_gun`den eski gün klasörleri silinir (KVKK).
"""

from __future__ import annotations

import json
import logging
import shutil
from collections.abc import Callable
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

from PIL import Image

from yemekhane_kasa.ayarlar import KayitAyari
from yemekhane_kasa.goruntu import jpeg

log = logging.getLogger(__name__)


def _simdi() -> datetime:
    return datetime.now().astimezone()


class Kayitci:
    def __init__(self, ayar: KayitAyari, klasor: Path, simdi: Callable[[], datetime] = _simdi) -> None:
        self.ayar = ayar
        self.klasor = Path(klasor)
        self._simdi = simdi
        self._temizlenen_gun: date | None = None

    def _gun_klasoru(self, an: datetime) -> Path:
        klasor = self.klasor / f"{an:%Y-%m-%d}"
        klasor.mkdir(parents=True, exist_ok=True)
        return klasor

    def olay(self, tur: str, veri: dict[str, Any]) -> None:
        an = self._simdi()
        self._gerekirse_temizle(an.date())
        satir = json.dumps({"zaman": an.isoformat(timespec="milliseconds"), "olay": tur, **veri}, ensure_ascii=False)
        try:
            with open(self._gun_klasoru(an) / "olaylar.jsonl", "a", encoding="utf-8") as dosya:
                dosya.write(satir + "\n")
        except OSError as e:
            log.error("denetim kaydı yazılamadı: %s", e)

    def gorsel_yaz(self, siparis_no: str, revizyon: int, goruntu: Image.Image) -> str | None:
        if not self.ayar.gorsel_sakla:
            return None
        yol = self._gun_klasoru(self._simdi()) / f"{siparis_no}-r{revizyon}.jpg"
        try:
            yol.write_bytes(jpeg(goruntu, 1024))
        except OSError as e:
            log.error("tepsi görüntüsü yazılamadı: %s", e)
            return None
        return str(yol)

    def _gerekirse_temizle(self, bugun: date) -> None:
        if self._temizlenen_gun != bugun:
            self._temizlenen_gun = bugun
            self.temizle(bugun)

    def temizle(self, bugun: date | None = None) -> int:
        """Saklama süresini aşan gün klasörlerini siler; silinen klasör sayısını döner."""
        if self.ayar.saklama_gun is None or not self.klasor.is_dir():
            return 0
        sinir = (bugun or self._simdi().date()) - timedelta(days=self.ayar.saklama_gun)
        silinen = 0
        for alt in self.klasor.iterdir():
            try:
                gun = date.fromisoformat(alt.name)
            except ValueError:
                continue
            if alt.is_dir() and gun < sinir:
                shutil.rmtree(alt, ignore_errors=True)
                silinen += 1
        if silinen:
            log.info("saklama süresi dolan %d günlük kayıt silindi", silinen)
        return silinen

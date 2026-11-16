"""Diskte yanıt önbelleği: aynı istek ikinci kez sorulduğunda modele gidilmez.

Geliştirme ve değerlendirme içindir (hızlı tekrar, sıfır maliyet, belirlenimci sonuç).
Anahtar: sağlayıcı kimliği + isteğin tamamının SHA-256 özeti. Her kayıt ayrı bir JSON
dosyasıdır; yazma atomiktir (geçici dosya + yeniden adlandırma), bu yüzden aynı klasörü
birden çok iş parçacığı güvenle kullanabilir.
Kim kullanır: saglayici/taban.py. Sıcaklığı 0'dan büyük ve tohumsuz istekler önbelleğe
alınmaz (rastgele olması istenen yanıt dondurulmasın).
Genişletme: başka bir depo (ör. SQLite) için aynı `al` / `koy` arayüzünü sağlayan sınıf yazın.
Uyarı: önbellek dosyaları istek ve yanıt metnini düz yazı olarak içerir; klasörü paylaşmayın.
"""

from __future__ import annotations

import hashlib
import json
import os
import tempfile
from pathlib import Path
from typing import Any

from yz.saglayici.tipler import SohbetIstegi, Yanit


def istek_ozeti(saglayici_kimligi: str, istek: SohbetIstegi) -> str:
    """İsteğin belirlenimci özeti (anahtar sırası sabit JSON üzerinden SHA-256)."""
    govde = json.dumps(
        {"saglayici": saglayici_kimligi, "istek": istek.model_dump(mode="json")},
        sort_keys=True,
        ensure_ascii=False,
    )
    return hashlib.sha256(govde.encode("utf-8")).hexdigest()


def onbellege_uygun(istek: SohbetIstegi) -> bool:
    """Yalnız belirlenimci istekler önbelleğe alınır: sıcaklık 0/boş ya da tohum verilmiş."""
    return not istek.sicaklik or istek.tohum is not None


class DiskOnbellek:
    """Klasör tabanlı yanıt önbelleği."""

    def __init__(self, dizin: str | Path) -> None:
        self.dizin = Path(dizin)
        self.isabet = 0
        self.iska = 0

    def _yol(self, anahtar: str) -> Path:
        return self.dizin / anahtar[:2] / f"{anahtar}.json"

    def al(self, anahtar: str) -> Yanit | None:
        """Kayıt varsa yanıtı döndürür; yoksa ya da bozuksa None."""
        yol = self._yol(anahtar)
        try:
            veri: dict[str, Any] = json.loads(yol.read_text(encoding="utf-8"))
            yanit = Yanit.model_validate(veri["yanit"])
        except (OSError, ValueError, KeyError):
            self.iska += 1
            return None
        self.isabet += 1
        yanit.kullanim.onbellekten = True
        return yanit

    def koy(self, anahtar: str, yanit: Yanit) -> None:
        """Yanıtı atomik olarak yazar."""
        yol = self._yol(anahtar)
        yol.parent.mkdir(parents=True, exist_ok=True)
        govde = json.dumps({"yanit": yanit.model_dump(mode="json")}, ensure_ascii=False)
        tanimlayici, gecici = tempfile.mkstemp(dir=yol.parent, suffix=".tmp")
        try:
            with os.fdopen(tanimlayici, "w", encoding="utf-8") as dosya:
                dosya.write(govde)
            os.replace(gecici, yol)
        except BaseException:
            Path(gecici).unlink(missing_ok=True)
            raise

    def temizle(self) -> int:
        """Bütün kayıtları siler; silinen dosya sayısını döndürür."""
        silinen = 0
        for dosya in self.dizin.glob("*/*.json"):
            dosya.unlink(missing_ok=True)
            silinen += 1
        return silinen

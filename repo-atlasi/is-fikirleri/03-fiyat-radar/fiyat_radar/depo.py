"""Ölçüm geçmişi: tek dosyalık sqlite3 veritabanı (sunucu gerekmez, yedeklemesi kolay).

Yalnızca fiyat alanları saklanır; sayfanın HTML'i ya da metni saklanmaz (veri en aza indirme). `secure_delete` açıktır:
silinen satırlar dosyanın boş sayfalarında okunabilir kalmaz. Müşteri ayrılınca veritabanı dosyası ve rapor klasörü
silinir; yedekler ayrıca temizlenmelidir.
"""

import json
import sqlite3
from dataclasses import dataclass, field
from datetime import datetime

SEMA = """
CREATE TABLE IF NOT EXISTS olcum (
    id INTEGER PRIMARY KEY,
    zaman TEXT NOT NULL,      -- ISO 8601, saat dilimi farkıyla (ör. 2026-11-10T08:00:00+03:00)
    urun TEXT NOT NULL,
    magaza TEXT NOT NULL,
    url TEXT NOT NULL,
    fiyat INTEGER,            -- kuruş
    eski_fiyat INTEGER,       -- kuruş (üstü çizili fiyat)
    stokta INTEGER,           -- 1, 0 ya da NULL (bilinmiyor)
    kampanyalar TEXT NOT NULL DEFAULT '[]',
    kaynak TEXT,
    hata TEXT
);
CREATE INDEX IF NOT EXISTS olcum_urun_magaza ON olcum (urun, magaza, id);
-- Ürün başına son bildirilen "rakip sizden ucuz" durumu: aynı durum her tur yeniden bildirilmez.
CREATE TABLE IF NOT EXISTS ucuz_rakip (urun TEXT PRIMARY KEY, imza TEXT NOT NULL);
"""


@dataclass
class Olcum:
    zaman: str
    urun: str
    magaza: str
    url: str
    fiyat: int | None = None
    eski_fiyat: int | None = None
    stokta: bool | None = None
    kampanyalar: list[str] = field(default_factory=list)
    kaynak: str = ""
    hata: str | None = None


class Depo:
    def __init__(self, yol: str = ":memory:"):
        self.db = sqlite3.connect(yol, timeout=30)
        self.db.execute("PRAGMA secure_delete = ON")
        self.db.executescript(SEMA)

    def ekle(self, o: Olcum) -> None:
        stok = None if o.stokta is None else int(o.stokta)
        self.db.execute(
            "INSERT INTO olcum (zaman, urun, magaza, url, fiyat, eski_fiyat, stokta, kampanyalar, kaynak, hata)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (o.zaman, o.urun, o.magaza, o.url, o.fiyat, o.eski_fiyat, stok, json.dumps(o.kampanyalar, ensure_ascii=False), o.kaynak, o.hata),
        )
        self.db.commit()

    def son_basarili(self, urun: str, magaza: str) -> Olcum | None:
        satir = self.db.execute(
            "SELECT zaman, urun, magaza, url, fiyat, eski_fiyat, stokta, kampanyalar, kaynak, hata FROM olcum"
            " WHERE urun = ? AND magaza = ? AND hata IS NULL ORDER BY id DESC LIMIT 1",
            (urun, magaza),
        ).fetchone()
        if satir is None:
            return None
        stok = None if satir[6] is None else bool(satir[6])
        return Olcum(*satir[:6], stok, json.loads(satir[7]), satir[8], satir[9])

    def son_denemeler(self) -> dict[tuple[str, str], float]:
        """(ürün, mağaza) → son denemenin zamanı (Jülyen günü; başarılı ya da hatalı). Tur sırası buna göre kurulur."""
        satirlar = self.db.execute("SELECT urun, magaza, MAX(julianday(zaman)) FROM olcum GROUP BY urun, magaza")
        return {(urun, magaza): jd for urun, magaza, jd in satirlar if jd is not None}

    def ucuz_imzasi(self, urun: str) -> str | None:
        satir = self.db.execute("SELECT imza FROM ucuz_rakip WHERE urun = ?", (urun,)).fetchone()
        return None if satir is None else satir[0]

    def ucuz_imzasi_yaz(self, urun: str, imza: str) -> None:
        self.db.execute("INSERT INTO ucuz_rakip (urun, imza) VALUES (?, ?) ON CONFLICT(urun) DO UPDATE SET imza = excluded.imza", (urun, imza))
        self.db.commit()

    def eskileri_sil(self, sinir: datetime) -> int:
        """`sinir`dan eski ölçümleri siler (saklama süresi). Silinen satır sayısını döndürür."""
        imlec = self.db.execute("DELETE FROM olcum WHERE julianday(zaman) < julianday(?)", (sinir.isoformat(timespec="seconds"),))
        self.db.commit()
        return imlec.rowcount

    def kapat(self) -> None:
        self.db.close()

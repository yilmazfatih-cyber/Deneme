"""Salt-okunur SQLite sorgu aracı.

Sorguyu model yazdığı için parametreli SQL mümkün değildir; güvenlik VERİTABANI MOTORU
düzeyinde sağlanır (dize denetimiyle değil):
    1. Bağlantı `mode=ro` (salt-okunur) açılır ve `PRAGMA query_only = ON` yapılır.
    2. Yetkilendirici (authorizer) yalnız SELECT, okuma, işlev ve özyinelemeli CTE'ye izin
       verir; INSERT/UPDATE/DELETE/CREATE/DROP/ATTACH/PRAGMA reddedilir; load_extension yasak.
    3. Tek seferde tek ifade çalışır (sqlite3 birden çok ifadeyi reddeder).
    4. İlerleme kancası `zaman_asimi_sn` sonra sorguyu keser; satır sayısı sınırlıdır.
    5. Bellek: tek değer ≤ `azami_deger_bayt` (SQLITE_LIMIT_LENGTH; `randomblob(1e9)` gibi tek adımda
       GB ayıran çağrıları zaman sınırı durduramaz), sorgu ≤ `azami_sorgu_karakter`, sütun ≤ 100,
       okunan sonuç ≤ `azami_cikti_bayt` (bütçe dolunca okuma durur).
Kim kullanır: ajan (hazır araç); kendi veritabanınıza soru sordurmak için.
Genişletme: sonuç biçimini değiştirmek için `_tablo_yaz`'ı düzenleyin.
"""

from __future__ import annotations

import sqlite3
import time
from pathlib import Path
from typing import Any

from yz.arac.tanim import Arac
from yz.hatalar import GuvenlikHatasi
from yz.metin import kucuk_ascii

_IZINLI = frozenset(
    {sqlite3.SQLITE_SELECT, sqlite3.SQLITE_READ, sqlite3.SQLITE_FUNCTION, sqlite3.SQLITE_RECURSIVE}
)
_YASAK_ISLEVLER = frozenset({"load_extension", "readfile", "writefile", "edit", "fts3_tokenizer"})


def _yetkilendir(
    eylem: int, arg1: str | None, arg2: str | None, _db: str | None, _tetik: str | None
) -> int:
    if eylem not in _IZINLI:
        return sqlite3.SQLITE_DENY
    if eylem == sqlite3.SQLITE_FUNCTION and kucuk_ascii(arg2 or "") in _YASAK_ISLEVLER:
        return sqlite3.SQLITE_DENY
    return sqlite3.SQLITE_OK


def _tablo_yaz(
    sutunlar: list[str], satirlar: list[tuple[Any, ...]], fazla: bool, azami: int
) -> str:
    if not sutunlar:
        return "(sonuç yok)"
    govde = [" | ".join(sutunlar), " | ".join("---" for _ in sutunlar)]
    govde.extend(" | ".join("NULL" if d is None else str(d) for d in satir) for satir in satirlar)
    if not satirlar:
        govde.append("(0 satır)")
    if fazla:
        govde.append(
            f"(ilk {azami} satır gösterildi; daha fazlası var — LIMIT ya da WHERE kullanın)"
        )
    return "\n".join(govde)


def _boyut(satir: tuple[Any, ...]) -> int:
    return sum(len(d) if isinstance(d, str | bytes) else 8 for d in satir)


def sqlite_araclari(
    veritabani: str | Path,
    azami_satir: int = 50,
    zaman_asimi_sn: float = 5.0,
    *,
    azami_deger_bayt: int = 256 * 1024,
    azami_sorgu_karakter: int = 4000,
    azami_cikti_bayt: int = 1_000_000,
) -> list[Arac]:
    """`tablolari_listele` ve `sql_sorgula` araçlarını kurar."""
    yol = Path(veritabani).resolve()
    if not yol.is_file():
        raise GuvenlikHatasi(f"Veritabanı dosyası bulunamadı: {yol}")

    def baglan() -> sqlite3.Connection:
        baglanti = sqlite3.connect(f"{yol.as_uri()}?mode=ro", uri=True, check_same_thread=False)
        baglanti.execute("PRAGMA query_only = ON")
        baglanti.setlimit(sqlite3.SQLITE_LIMIT_LENGTH, azami_deger_bayt)
        baglanti.setlimit(sqlite3.SQLITE_LIMIT_SQL_LENGTH, azami_sorgu_karakter)
        baglanti.set_authorizer(_yetkilendir)
        bitis = time.monotonic() + zaman_asimi_sn
        baglanti.set_progress_handler(lambda: int(time.monotonic() > bitis), 1000)
        return baglanti

    def oku(imlec: sqlite3.Cursor) -> tuple[list[tuple[Any, ...]], bool]:
        """Satırları tek tek okur; satır ya da bayt bütçesi dolunca durur: (satırlar, daha var mı)."""
        if len(imlec.description or []) > 100:
            raise ValueError("en çok 100 sütun seçin.")
        satirlar: list[tuple[Any, ...]] = []
        bayt = 0
        for satir in imlec:
            if len(satirlar) >= azami_satir or bayt > azami_cikti_bayt:
                return satirlar, True
            satirlar.append(satir)
            bayt += _boyut(satir)
        return satirlar, False

    def calistir(sorgu: str) -> str:
        baglanti = baglan()
        try:
            imlec = baglanti.execute(sorgu)
            sutunlar = [d[0] for d in imlec.description or []]
            satirlar, fazla = oku(imlec)
        except sqlite3.Error as hata:
            ileti = str(hata)
            if "not authorized" in ileti:
                raise GuvenlikHatasi("yalnız okuma (SELECT) sorgularına izin var.") from None
            if "interrupted" in ileti:
                raise ValueError(
                    f"sorgu {zaman_asimi_sn:g} saniyede bitmedi; daha dar bir sorgu yaz."
                ) from None
            if "one statement" in ileti:
                raise ValueError("tek seferde tek SELECT ifadesi yazın.") from None
            if "too big" in ileti:
                raise ValueError(
                    f"değer çok büyük (sınır {azami_deger_bayt} bayt); daha küçük bir değer seçin."
                ) from None
            if "too large" in ileti:
                raise ValueError(
                    f"sorgu çok uzun (sınır {azami_sorgu_karakter} karakter); kısaltın."
                ) from None
            raise ValueError(f"SQL hatası: {ileti}") from None
        finally:
            baglanti.close()
        return _tablo_yaz(sutunlar, satirlar, fazla, len(satirlar))

    def tablolari_listele() -> str:
        """Veritabanındaki tabloları ve sütunlarını listeler. Sorgu yazmadan önce buna bak."""
        baglanti = baglan()
        try:
            tablolar = baglanti.execute(
                "SELECT name, sql FROM sqlite_master WHERE type IN ('table', 'view') "
                "AND name NOT LIKE 'sqlite_%' ORDER BY name"
            ).fetchall()
        finally:
            baglanti.close()
        return "\n".join(f"{ad}: {sql}" for ad, sql in tablolar) or "(tablo yok)"

    def sql_sorgula(sorgu: str) -> str:
        """Veritabanında salt-okunur bir SQL sorgusu (yalnız SELECT) çalıştırır.

        Args:
            sorgu: Tek bir SELECT ifadesi, ör. "SELECT ad, toplam FROM siparis LIMIT 10".
        """
        return calistir(sorgu)

    return [Arac(tablolari_listele), Arac(sql_sorgula)]

"""SQLite deposu: taramalar, ürünler (Alibaba ilanı başına bir satır) ve her taramadaki ölçümler.

Geçmiş iki işe yarar: ajan aynı ilanı yeniden aramaz, kullanıcı fiyat ve katın zamanla nasıl değiştiğini görür.
"""

from __future__ import annotations

import json
import sqlite3
from datetime import timedelta
from pathlib import Path
from typing import Iterable

from .bicim import tr_saati
from .degerlendir import Sonuc

SEMA = """
CREATE TABLE IF NOT EXISTS taramalar (
    id INTEGER PRIMARY KEY,
    an TEXT NOT NULL,
    kur_usd REAL NOT NULL,
    kur_kaynagi TEXT,
    kategoriler TEXT NOT NULL DEFAULT '[]',
    notu TEXT,
    aday_sayisi INTEGER NOT NULL DEFAULT 0,
    uygun_sayisi INTEGER NOT NULL DEFAULT 0,
    rapor TEXT
);
CREATE TABLE IF NOT EXISTS urunler (
    id INTEGER PRIMARY KEY,
    url TEXT NOT NULL UNIQUE,
    urun TEXT NOT NULL,
    kategori TEXT NOT NULL,
    tedarikci TEXT,
    ilk_gorulme TEXT NOT NULL,
    son_gorulme TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS olcumler (
    id INTEGER PRIMARY KEY,
    tarama_id INTEGER NOT NULL REFERENCES taramalar(id),
    urun_id INTEGER NOT NULL REFERENCES urunler(id),
    an TEXT NOT NULL,
    fiyat_usd REAL NOT NULL,
    moq INTEGER NOT NULL,
    agirlik_kg REAL NOT NULL,
    tr_medyan_tl REAL NOT NULL,
    tr_ilan INTEGER NOT NULL,
    birim_maliyet_tl REAL NOT NULL,
    kat REAL NOT NULL,
    durum TEXT NOT NULL,
    birim_kar_tl REAL,
    dogrula TEXT NOT NULL DEFAULT '[]',
    girdi TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS olcum_urun ON olcumler(urun_id, an);
"""


def baglan(yol: str | Path) -> sqlite3.Connection:
    if str(yol) != ":memory:":
        Path(yol).parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(str(yol))
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    db.executescript(SEMA)
    return db


def tarama_kaydet(
    db: sqlite3.Connection,
    an: str,
    kur_usd: float,
    kur_kaynagi: str,
    kategoriler: Iterable[str],
    notu: str,
    sonuclar: list[Sonuc],
    rapor: str = "",
) -> int:
    """Taramayı ve her sonucu tek işlemde yazar; tarama id döner."""
    uygun = sum(1 for s in sonuclar if s.durum in ("UYGUN", "UYGUN-DOGRULA"))
    with db:
        tarama_id = db.execute(
            "INSERT INTO taramalar (an, kur_usd, kur_kaynagi, kategoriler, notu, aday_sayisi, uygun_sayisi, rapor)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (an, kur_usd, kur_kaynagi, json.dumps(sorted(set(kategoriler)), ensure_ascii=False), notu,
             len(sonuclar), uygun, rapor),
        ).lastrowid  # fmt: skip
        for s in sonuclar:
            a = s.aday
            db.execute(
                "INSERT INTO urunler (url, urun, kategori, tedarikci, ilk_gorulme, son_gorulme) VALUES (?, ?, ?, ?, ?, ?)"
                " ON CONFLICT(url) DO UPDATE SET urun = excluded.urun, kategori = excluded.kategori,"
                " tedarikci = excluded.tedarikci, son_gorulme = excluded.son_gorulme",
                (a.url, a.urun, a.kategori, a.tedarikci, an, an),
            )
            urun_id = db.execute("SELECT id FROM urunler WHERE url = ?", (a.url,)).fetchone()["id"]
            db.execute(
                "INSERT INTO olcumler (tarama_id, urun_id, an, fiyat_usd, moq, agirlik_kg, tr_medyan_tl, tr_ilan,"
                " birim_maliyet_tl, kat, durum, birim_kar_tl, dogrula, girdi)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (tarama_id, urun_id, an, a.fiyat_usd, a.moq, a.agirlik_kg, s.tr.medyan, s.tr.adet,
                 s.dokum.birim_maliyet_tl, s.kat, s.durum, s.satis.birim_kar_tl,
                 json.dumps(s.dogrula, ensure_ascii=False), json.dumps(a.ham, ensure_ascii=False)),
            )  # fmt: skip
    return int(tarama_id)


def onceki_olcum(db: sqlite3.Connection, url: str, once: str) -> sqlite3.Row | None:
    """Bu ilanın `once` anından önceki son ölçümü (yeni mi, kat değişti mi)."""
    return db.execute(
        "SELECT o.* FROM olcumler o JOIN urunler u ON u.id = o.urun_id WHERE u.url = ? AND o.an < ?"
        " ORDER BY o.an DESC LIMIT 1",
        (url, once),
    ).fetchone()


def gecmis(db: sqlite3.Connection, gun: int | None = None, durumlar: Iterable[str] | None = None) -> list[sqlite3.Row]:
    """Her ürünün son ölçümü; en yeni önce."""
    sorgu = (
        "SELECT u.url, u.urun, u.kategori, u.tedarikci, u.ilk_gorulme, o.an, o.fiyat_usd, o.moq, o.tr_medyan_tl,"
        " o.tr_ilan, o.birim_maliyet_tl, o.kat, o.durum, o.birim_kar_tl"
        " FROM urunler u JOIN olcumler o ON o.id = ("
        "   SELECT id FROM olcumler WHERE urun_id = u.id ORDER BY an DESC, id DESC LIMIT 1)"
    )
    kosullar, degerler = [], []
    if gun is not None:
        kosullar.append("o.an >= ?")
        degerler.append((tr_saati() - timedelta(days=gun)).isoformat())
    durumlar = list(durumlar or [])
    if durumlar:
        kosullar.append(f"o.durum IN ({', '.join('?' * len(durumlar))})")
        degerler.extend(durumlar)
    if kosullar:
        sorgu += " WHERE " + " AND ".join(kosullar)
    return db.execute(sorgu + " ORDER BY o.an DESC, o.kat DESC", degerler).fetchall()


def kategori_son_tarama(db: sqlite3.Connection) -> dict[str, str]:
    """Kategori → en son tarandığı an."""
    son: dict[str, str] = {}
    for satir in db.execute("SELECT an, kategoriler FROM taramalar ORDER BY an"):
        for k in json.loads(satir["kategoriler"] or "[]"):
            son[k] = satir["an"]
    return son

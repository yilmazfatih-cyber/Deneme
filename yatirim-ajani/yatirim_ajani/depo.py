"""SQLite deposu: tezler, tahminler, sanal portföy, işlemler ve öneriler tek dosyada durur."""

from __future__ import annotations

import sqlite3
from pathlib import Path

SEMA = """
CREATE TABLE IF NOT EXISTS tezler (
    id INTEGER PRIMARY KEY,
    piyasa TEXT NOT NULL,
    hisse TEXT NOT NULL,
    an TEXT NOT NULL,
    karar TEXT NOT NULL,
    olasilik REAL NOT NULL,
    ufuk_gun INTEGER NOT NULL,
    esik_getiri REAL NOT NULL,
    adil_alt REAL,
    adil_ust REAL,
    giris_fiyati REAL,
    ozet TEXT,
    gerekce TEXT,
    riskler TEXT,
    kaynaklar TEXT,
    model TEXT,
    zaman_kilitli INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS tahminler (
    id INTEGER PRIMARY KEY,
    tez_id INTEGER REFERENCES tezler(id),
    piyasa TEXT NOT NULL,
    hisse TEXT NOT NULL,
    olusturma TEXT NOT NULL,
    vade TEXT NOT NULL,
    giris_fiyati REAL NOT NULL,
    esik_getiri REAL NOT NULL,
    olasilik REAL NOT NULL,
    sonuc INTEGER,
    gerceklesen_getiri REAL,
    cozulme TEXT
);
CREATE TABLE IF NOT EXISTS hesap (
    piyasa TEXT PRIMARY KEY,
    nakit REAL NOT NULL,
    zirve_varlik REAL NOT NULL,
    gun TEXT,
    gun_basi_varlik REAL,
    gun_islem_sayisi INTEGER NOT NULL DEFAULT 0,
    durduruldu INTEGER NOT NULL DEFAULT 0,
    durdurma_nedeni TEXT
);
CREATE TABLE IF NOT EXISTS pozisyonlar (
    piyasa TEXT NOT NULL,
    hisse TEXT NOT NULL,
    adet REAL NOT NULL,
    ort_maliyet REAL NOT NULL,
    PRIMARY KEY (piyasa, hisse)
);
CREATE TABLE IF NOT EXISTS islemler (
    id INTEGER PRIMARY KEY,
    piyasa TEXT NOT NULL,
    hisse TEXT NOT NULL,
    zaman TEXT NOT NULL,
    yon TEXT NOT NULL,
    adet REAL NOT NULL,
    fiyat REAL NOT NULL,
    maliyet REAL NOT NULL,
    neden TEXT
);
CREATE TABLE IF NOT EXISTS oneriler (
    id INTEGER PRIMARY KEY,
    zaman TEXT NOT NULL,
    piyasa TEXT NOT NULL,
    hisse TEXT NOT NULL,
    yon TEXT NOT NULL,
    adet REAL NOT NULL,
    limit_fiyat REAL NOT NULL,
    gerekce TEXT,
    durum TEXT NOT NULL DEFAULT 'bekliyor'
);
"""


def baglan(yol: str | Path) -> sqlite3.Connection:
    if str(yol) != ":memory:":
        Path(yol).parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(str(yol))
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    db.executescript(SEMA)
    return db

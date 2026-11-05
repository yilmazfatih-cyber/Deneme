-- Örnek dükkan veritabanı (SQLite). Veriler ornek/olustur.py ile eklenir.
CREATE TABLE sehirler (
  id     INTEGER PRIMARY KEY,
  ad     TEXT NOT NULL UNIQUE,
  bolge  TEXT NOT NULL
);

CREATE TABLE musteriler (
  id           INTEGER PRIMARY KEY,
  ad           TEXT NOT NULL,
  soyad        TEXT NOT NULL,
  eposta       TEXT UNIQUE,
  sehir_id     INTEGER NOT NULL REFERENCES sehirler(id),
  kayit_tarihi TEXT NOT NULL  -- YYYY-AA-GG
);

CREATE TABLE urunler (
  id        INTEGER PRIMARY KEY,
  ad        TEXT NOT NULL,
  kategori  TEXT NOT NULL,
  fiyat     REAL NOT NULL,     -- TL
  stok      INTEGER NOT NULL
);

CREATE TABLE siparisler (
  id              INTEGER PRIMARY KEY,
  musteri_id      INTEGER NOT NULL REFERENCES musteriler(id),
  siparis_tarihi  TEXT NOT NULL,  -- YYYY-AA-GG
  durum           TEXT NOT NULL   -- 'hazırlanıyor' | 'kargoda' | 'teslim edildi' | 'iptal'
);

CREATE TABLE siparis_kalemleri (
  id           INTEGER PRIMARY KEY,
  siparis_id   INTEGER NOT NULL REFERENCES siparisler(id),
  urun_id      INTEGER NOT NULL REFERENCES urunler(id),
  adet         INTEGER NOT NULL,
  birim_fiyat  REAL NOT NULL     -- sipariş anındaki fiyat, TL
);

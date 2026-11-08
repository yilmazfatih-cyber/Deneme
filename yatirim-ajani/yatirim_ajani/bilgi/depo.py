"""Bilgi veritabanı: `olaylar` tablosu (sayı + metin) ve sorgular."""

from __future__ import annotations

import json
import sqlite3
from datetime import date

import numpy as np
import pandas as pd

from .sema import SEKTORLER, Olay

SEMA = """
CREATE TABLE IF NOT EXISTS olaylar (
    id INTEGER PRIMARY KEY,
    kapsam TEXT NOT NULL,
    hisse TEXT,
    sektor TEXT,
    baslangic TEXT NOT NULL,
    bitis TEXT NOT NULL,
    tur TEXT NOT NULL,
    baslik TEXT NOT NULL,
    anlam TEXT NOT NULL,
    yon TEXT NOT NULL DEFAULT 'notr',
    yatirimci_tepkisi TEXT NOT NULL,
    tepki_aciklama TEXT,
    onden_gorulebilir TEXT NOT NULL,
    guven REAL NOT NULL,
    etiketler TEXT,
    kaynaklar TEXT,
    getiri REAL, endekse_gore REAL, oynaklik_oncesi REAL, hacim_z REAL,
    takip_5g REAL, takip_20g REAL, mom20_oncesi REAL,
    kaynak_tipi TEXT NOT NULL,
    eklenme TEXT NOT NULL,
    UNIQUE (kapsam, hisse, sektor, baslangic, bitis, tur, baslik)
);
CREATE INDEX IF NOT EXISTS olaylar_hisse ON olaylar (hisse, baslangic);
CREATE INDEX IF NOT EXISTS olaylar_sektor ON olaylar (sektor, baslangic);
"""

SAYISAL = ["getiri", "endekse_gore", "oynaklik_oncesi", "hacim_z", "mom20_oncesi"]


def hazirla(db: sqlite3.Connection) -> None:
    db.executescript(SEMA)
    sutunlar = {r[1] for r in db.execute("PRAGMA table_info(olaylar)")}
    if "yon" not in sutunlar:  # eski veritabanı
        db.execute("ALTER TABLE olaylar ADD COLUMN yon TEXT NOT NULL DEFAULT 'notr'")


def ekle(db: sqlite3.Connection, olay: Olay) -> int | None:
    """Ekler; aynı anahtarla kayıt varsa metin alanlarını ve boş sayısalları günceller."""
    hazirla(db)
    if olay.hisse and not olay.sektor:
        olay.sektor = SEKTORLER.get(olay.hisse.upper())
    d = olay.model_dump()
    d["etiketler"] = json.dumps(d["etiketler"], ensure_ascii=False)
    d["kaynaklar"] = json.dumps(d["kaynaklar"], ensure_ascii=False)
    d["eklenme"] = date.today().isoformat()
    mevcut = db.execute(
        "SELECT id FROM olaylar WHERE kapsam=? AND IFNULL(hisse,'')=IFNULL(?,'') AND IFNULL(sektor,'')=IFNULL(?,'')"
        " AND baslangic=? AND bitis=? AND tur=? AND baslik=?",
        (d["kapsam"], d["hisse"], d["sektor"], d["baslangic"], d["bitis"], d["tur"], d["baslik"]),
    ).fetchone()
    if mevcut:
        guncelle = {k: v for k, v in d.items() if k in ("anlam", "yon", "yatirimci_tepkisi", "tepki_aciklama", "onden_gorulebilir", "guven", "etiketler", "kaynaklar")}
        for k in SAYISAL + ["takip_5g", "takip_20g"]:
            if d[k] is not None:
                guncelle[k] = d[k]
        if d["kaynak_tipi"] != "sayisal":
            guncelle["kaynak_tipi"] = "birlesik"  # sayısal kayıt + anlam = birleşik
        db.execute(f"UPDATE olaylar SET {', '.join(f'{k}=?' for k in guncelle)} WHERE id=?", (*guncelle.values(), mevcut[0]))
        db.commit()
        return int(mevcut[0])
    sutunlar = list(d)
    imlec = db.execute(
        f"INSERT INTO olaylar ({', '.join(sutunlar)}) VALUES ({', '.join('?' for _ in sutunlar)})",
        [d[s] for s in sutunlar],
    )
    db.commit()
    return int(imlec.lastrowid or 0)


def sorgula(
    db: sqlite3.Connection,
    hisse: str | None = None,
    sektor: str | None = None,
    kapsam: str | None = None,
    baslangic: str | None = None,
    bitis: str | None = None,
    metin: str | None = None,
    limit: int = 50,
) -> pd.DataFrame:
    hazirla(db)
    kosul, p = ["1=1"], []
    if hisse:
        kosul.append("hisse = ?"); p.append(hisse.upper())  # noqa: E702
    if sektor:
        kosul.append("sektor = ?"); p.append(sektor)  # noqa: E702
    if kapsam:
        kosul.append("kapsam = ?"); p.append(kapsam)  # noqa: E702
    if baslangic:
        kosul.append("bitis >= ?"); p.append(baslangic)  # noqa: E702
    if bitis:
        kosul.append("baslangic <= ?"); p.append(bitis)  # noqa: E702
    if metin:
        kosul.append("(anlam LIKE ? OR baslik LIKE ? OR etiketler LIKE ? OR tepki_aciklama LIKE ?)")
        p += [f"%{metin}%"] * 4
    sql = f"SELECT * FROM olaylar WHERE {' AND '.join(kosul)} ORDER BY baslangic DESC LIMIT ?"
    return pd.read_sql_query(sql, db, params=[*p, limit])


def benzer(db: sqlite3.Connection, durum: dict[str, float], hisse: str | None = None, k: int = 5) -> pd.DataFrame:
    """Sayısal katsayılarla en yakın geçmiş olaylar (standartlaştırılmış Öklid uzaklığı).

    `durum`: bugünkü değerler, SAYISAL anahtarlarıyla. Eksik alanlar uzaklığa katılmaz.
    """
    hazirla(db)
    sql = "SELECT * FROM olaylar WHERE kaynak_tipi != 'metin'" + (" AND hisse = ?" if hisse else "")
    df = pd.read_sql_query(sql, db, params=[hisse.upper()] if hisse else [])
    if df.empty:
        return df
    alanlar = [a for a in SAYISAL if a in durum and durum[a] is not None and df[a].notna().any()]
    if not alanlar:
        return df.head(0)
    M = df[alanlar].to_numpy(dtype=float)
    ort = np.nanmean(M, axis=0)
    std = np.nanstd(M, axis=0)
    std[std == 0] = 1.0
    hedef = (np.array([durum[a] for a in alanlar]) - ort) / std
    Z = (np.where(np.isnan(M), ort, M) - ort) / std
    df = df.assign(uzaklik=np.sqrt(((Z - hedef) ** 2).sum(axis=1)))
    return df.sort_values("uzaklik").head(k)


def ozet_metni(df: pd.DataFrame, uzun: bool = False) -> str:
    if df.empty:
        return "Kayıt yok."
    satirlar = []
    for _, r in df.iterrows():
        kim = r["hisse"] or r["sektor"] or r["kapsam"]
        say = []
        if pd.notna(r.get("getiri")):
            say.append(f"getiri {r['getiri']:+.1%}")
        if pd.notna(r.get("endekse_gore")):
            say.append(f"endekse göre {r['endekse_gore']:+.1%}")
        if pd.notna(r.get("takip_20g")):
            say.append(f"sonraki 20g {r['takip_20g']:+.1%}")
        if "uzaklik" in r and pd.notna(r["uzaklik"]):
            say.append(f"uzaklık {r['uzaklik']:.2f}")
        satirlar.append(f"- [{r['baslangic']} → {r['bitis']}] {kim} · {r['tur']} · {r['baslik']}" + (f" ({', '.join(say)})" if say else ""))
        if uzun:
            satirlar.append(f"    Anlam: {r['anlam']}")
            if r.get("tepki_aciklama"):
                satirlar.append(f"    Tepki ({r['yatirimci_tepkisi']}): {r['tepki_aciklama']}")
            satirlar.append(f"    Önden görülebilir: {r['onden_gorulebilir']}, güven {r['guven']:.1f}")
    return "\n".join(satirlar)

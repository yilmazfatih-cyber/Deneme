"""SQLite deposu: olaylar, ağaçlar, kararlar, bağlar."""

from __future__ import annotations

import json
import sqlite3
from dataclasses import asdict
from datetime import datetime
from pathlib import Path
from typing import Any

from .agaclar import AGACLAR
from .baglar import elle_baglar, otomatik_baglar
from .motor import karar_ver
from .sema import SEMA_SQL, Bag, Karar, Olay

VARSAYILAN_DB = Path(__file__).resolve().parent.parent / "veri" / "kap_karar.sqlite"


def ac(yol: str | Path | None = None) -> sqlite3.Connection:
    yol = Path(yol) if yol else VARSAYILAN_DB
    yol.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(yol)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    db.executescript(SEMA_SQL)
    _agaclari_yaz(db)
    return db


def _agaclari_yaz(db: sqlite3.Connection) -> None:
    for tur, a in AGACLAR.items():
        db.execute(
            "INSERT INTO agaclar (tur, ad, kapsam, kap_turu, tanim) VALUES (?,?,?,?,?) "
            "ON CONFLICT(tur) DO UPDATE SET ad=excluded.ad, kapsam=excluded.kapsam, kap_turu=excluded.kap_turu, tanim=excluded.tanim",
            (tur, a["ad"], a["kapsam"], a.get("kap_turu"), json.dumps({k: v for k, v in a.items()}, ensure_ascii=False)),
        )
    db.commit()


def olay_ekle(db: sqlite3.Connection, o: Olay, karar_hesapla: bool = True) -> int:
    simdi = datetime.now().isoformat(timespec="seconds")
    db.execute(
        """INSERT INTO olaylar (kod, tarih, kaynak, kapsam, tur, hisse, sektor, baslik, ozet, yon, parametreler, etiketler, kaynaklar, guven, eklenme)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(kod) DO UPDATE SET tarih=excluded.tarih, kaynak=excluded.kaynak, kapsam=excluded.kapsam, tur=excluded.tur,
             hisse=excluded.hisse, sektor=excluded.sektor, baslik=excluded.baslik, ozet=excluded.ozet, yon=excluded.yon,
             parametreler=excluded.parametreler, etiketler=excluded.etiketler, kaynaklar=excluded.kaynaklar, guven=excluded.guven""",
        (o.kod, o.tarih, o.kaynak, o.kapsam, o.tur, o.hisse, o.sektor, o.baslik, o.ozet, o.yon,
         json.dumps(o.parametreler, ensure_ascii=False), json.dumps(o.etiketler, ensure_ascii=False),
         json.dumps(o.kaynaklar, ensure_ascii=False), o.guven, simdi),
    )
    oid = db.execute("SELECT id FROM olaylar WHERE kod=?", (o.kod,)).fetchone()[0]
    if karar_hesapla and o.tur in AGACLAR:
        karar_yaz(db, oid, karar_ver(o.tur, o.parametreler, o.guven))
    db.commit()
    return oid


def karar_yaz(db: sqlite3.Connection, olay_id: int, k: Karar) -> None:
    db.execute(
        """INSERT INTO kararlar (olay_id, tur, yol, sonuc_kodu, sonuc, egilim, eylem, gerekce, izlenecek, etkilenen, eksik, guven, hesaplanma)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(olay_id) DO UPDATE SET tur=excluded.tur, yol=excluded.yol, sonuc_kodu=excluded.sonuc_kodu, sonuc=excluded.sonuc,
             egilim=excluded.egilim, eylem=excluded.eylem, gerekce=excluded.gerekce, izlenecek=excluded.izlenecek, etkilenen=excluded.etkilenen,
             eksik=excluded.eksik, guven=excluded.guven, hesaplanma=excluded.hesaplanma""",
        (olay_id, k.tur, json.dumps([asdict(a) for a in k.yol], ensure_ascii=False), k.sonuc_kodu, k.sonuc, k.egilim, k.eylem, k.gerekce,
         json.dumps(k.izlenecek, ensure_ascii=False), json.dumps(k.etkilenen, ensure_ascii=False), json.dumps(k.eksik, ensure_ascii=False),
         k.guven, datetime.now().isoformat(timespec="seconds")),
    )


def satir_olay(r: sqlite3.Row) -> Olay:
    return Olay(
        kod=r["kod"], tarih=r["tarih"], kaynak=r["kaynak"], kapsam=r["kapsam"], tur=r["tur"], baslik=r["baslik"], ozet=r["ozet"],
        hisse=r["hisse"], sektor=r["sektor"], yon=r["yon"], parametreler=json.loads(r["parametreler"]), etiketler=json.loads(r["etiketler"]),
        kaynaklar=json.loads(r["kaynaklar"]), guven=r["guven"], id=r["id"],
    )


def olaylar(db: sqlite3.Connection, tur: str | None = None, hisse: str | None = None, baslangic: str | None = None,
            bitis: str | None = None, kaynak: str | None = None, arama: str | None = None, limit: int | None = None) -> list[Olay]:
    sql = "SELECT * FROM olaylar WHERE 1=1"
    args: list[Any] = []
    if tur:
        sql += " AND tur=?"; args.append(tur)
    if hisse:
        sql += " AND hisse=?"; args.append(hisse.upper())
    if kaynak:
        sql += " AND kaynak=?"; args.append(kaynak)
    if baslangic:
        sql += " AND tarih>=?"; args.append(baslangic)
    if bitis:
        sql += " AND tarih<=?"; args.append(bitis)
    if arama:
        sql += " AND (baslik LIKE ? OR ozet LIKE ? OR etiketler LIKE ?)"; args += [f"%{arama}%"] * 3
    sql += " ORDER BY tarih, id"
    if limit:
        sql += f" LIMIT {int(limit)}"
    return [satir_olay(r) for r in db.execute(sql, args)]


def olay_getir(db: sqlite3.Connection, kod_veya_id: str) -> Olay | None:
    r = db.execute("SELECT * FROM olaylar WHERE kod=? OR id=?", (kod_veya_id, kod_veya_id if str(kod_veya_id).isdigit() else -1)).fetchone()
    return satir_olay(r) if r else None


def karar_getir(db: sqlite3.Connection, olay_id: int) -> dict[str, Any] | None:
    r = db.execute("SELECT * FROM kararlar WHERE olay_id=?", (olay_id,)).fetchone()
    if not r:
        return None
    d = dict(r)
    for k in ("yol", "izlenecek", "etkilenen", "eksik"):
        d[k] = json.loads(d[k])
    return d


def baglari_yeniden_kur(db: sqlite3.Connection, elle_koru: bool = True) -> int:
    """Otomatik bağları siler, tüm olaylar için yeniden hesaplar; elle bağları (JSON'daki `bagli`) yeniden yazar."""
    tum = olaylar(db)
    kimlik = {o.kod: o.id for o in tum}
    db.execute("DELETE FROM baglar WHERE otomatik=1")
    if not elle_koru:
        db.execute("DELETE FROM baglar")
    sayac = 0
    for b in otomatik_baglar(tum):
        sayac += _bag_yaz(db, kimlik, b)
    db.commit()
    return sayac


def elle_baglari_yaz(db: sqlite3.Connection, olay_listesi: list[Olay]) -> int:
    tum = olaylar(db)
    kimlik = {o.kod: o.id for o in tum}
    sayac = 0
    for b in elle_baglar(olay_listesi):
        sayac += _bag_yaz(db, kimlik, b)
    db.commit()
    return sayac


def _bag_yaz(db: sqlite3.Connection, kimlik: dict[str, int], b: Bag) -> int:
    if b.kaynak_kod not in kimlik or b.hedef_kod not in kimlik:
        return 0
    db.execute(
        """INSERT INTO baglar (kaynak_id, hedef_id, iliski, aciklama, agirlik, otomatik) VALUES (?,?,?,?,?,?)
           ON CONFLICT(kaynak_id, hedef_id, iliski) DO UPDATE SET aciklama=excluded.aciklama, agirlik=excluded.agirlik,
             otomatik=MIN(baglar.otomatik, excluded.otomatik)""",
        (kimlik[b.kaynak_kod], kimlik[b.hedef_kod], b.iliski, b.aciklama, b.agirlik, int(b.otomatik)),
    )
    return 1


def baglar(db: sqlite3.Connection, olay_id: int, yon: str = "her_iki", en_az_agirlik: float = 0.0) -> list[dict[str, Any]]:
    """Bir olayın bağlarını döndürür. yon: 'giden' (bu olay → ...), 'gelen' (... → bu olay), 'her_iki'."""
    sonuc: list[dict[str, Any]] = []
    if yon in ("giden", "her_iki"):
        for r in db.execute(
            """SELECT b.iliski, b.aciklama, b.agirlik, b.otomatik, o.id, o.kod, o.tarih, o.tur, o.baslik, o.hisse, k.egilim, k.sonuc
               FROM baglar b JOIN olaylar o ON o.id=b.hedef_id LEFT JOIN kararlar k ON k.olay_id=o.id
               WHERE b.kaynak_id=? AND b.agirlik>=? ORDER BY b.agirlik DESC, o.tarih""", (olay_id, en_az_agirlik)):
            d = dict(r); d["yon"] = "giden"; sonuc.append(d)
    if yon in ("gelen", "her_iki"):
        for r in db.execute(
            """SELECT b.iliski, b.aciklama, b.agirlik, b.otomatik, o.id, o.kod, o.tarih, o.tur, o.baslik, o.hisse, k.egilim, k.sonuc
               FROM baglar b JOIN olaylar o ON o.id=b.kaynak_id LEFT JOIN kararlar k ON k.olay_id=o.id
               WHERE b.hedef_id=? AND b.agirlik>=? ORDER BY b.agirlik DESC, o.tarih""", (olay_id, en_az_agirlik)):
            d = dict(r); d["yon"] = "gelen"; sonuc.append(d)
    return sonuc


def zincir(db: sqlite3.Connection, olay_id: int, derinlik: int = 3, en_az_agirlik: float = 0.4) -> list[tuple[int, dict[str, Any]]]:
    """Olaydan ileriye doğru (giden bağlar) en fazla `derinlik` adım gider; (seviye, bağ) listesi döner."""
    gorulen = {olay_id}
    sonuc: list[tuple[int, dict[str, Any]]] = []
    katman = [olay_id]
    for seviye in range(1, derinlik + 1):
        yeni: list[int] = []
        for oid in katman:
            for b in baglar(db, oid, "giden", en_az_agirlik):
                if b["id"] in gorulen:
                    continue
                gorulen.add(b["id"])
                b["kaynak_id"] = oid
                sonuc.append((seviye, b))
                yeni.append(b["id"])
        katman = yeni
        if not katman:
            break
    return sonuc


def json_yukle(db: sqlite3.Connection, yol: Path) -> list[Olay]:
    veri = json.loads(Path(yol).read_text(encoding="utf-8"))
    kayitlar = veri["olaylar"] if isinstance(veri, dict) else veri
    eklenen: list[Olay] = []
    for k in kayitlar:
        o = Olay(**{a: k[a] for a in k if a in Olay.__dataclass_fields__})
        olay_ekle(db, o)
        eklenen.append(o)
    elle_baglari_yaz(db, eklenen)
    return eklenen


def ozet(db: sqlite3.Connection) -> dict[str, Any]:
    s: dict[str, Any] = {}
    s["olay"] = db.execute("SELECT COUNT(*) FROM olaylar").fetchone()[0]
    s["karar"] = db.execute("SELECT COUNT(*) FROM kararlar").fetchone()[0]
    s["bag"] = db.execute("SELECT COUNT(*) FROM baglar").fetchone()[0]
    s["agac"] = db.execute("SELECT COUNT(*) FROM agaclar").fetchone()[0]
    s["tarih_araligi"] = tuple(db.execute("SELECT MIN(tarih), MAX(tarih) FROM olaylar").fetchone())
    s["kaynaga_gore"] = {r[0]: r[1] for r in db.execute("SELECT kaynak, COUNT(*) FROM olaylar GROUP BY kaynak")}
    s["ture_gore"] = {r[0]: r[1] for r in db.execute("SELECT tur, COUNT(*) FROM olaylar GROUP BY tur ORDER BY 2 DESC")}
    s["egilime_gore"] = {r[0]: r[1] for r in db.execute("SELECT egilim, COUNT(*) FROM kararlar GROUP BY egilim")}
    return s

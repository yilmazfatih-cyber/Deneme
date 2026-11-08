"""Örnek (mock) ERP — demo ve testler için sentetik SQLite veritabanı.

Tablolar: cari, fatura, fatura_kalem, stok, satis_aylik. Dönem 2024-01 … 2026-10, sabit tohum (seed=2024).
Bütün veriler sentetiktir: unvanlar "Tedarikçi 01 A.Ş." / "Müşteri 07 Ltd. Şti." biçimindedir, gerçek bir şirket
veya kişiye ait değildir. VKN'ler 10 haneli rastgele sayıdan sağlama algoritmasıyla (GİB VKN kontrol hanesi) üretilir.

Kullanım:
    python -m aiplatform.erp.mock_erp /yol/ornek_erp.db
"""

from __future__ import annotations

import random
import sqlite3
import sys
from datetime import date, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import create_engine, text

from .connector import ErpError, make_tool
from .sql_readonly import SQLReadOnlyConnector

MOCK_TABLES = ["cari", "fatura", "fatura_kalem", "stok", "satis_aylik"]
SEED = 2024
START = (2024, 1)
END = (2026, 10)

ILLER = ["İstanbul", "Ankara", "İzmir", "Bursa", "Kocaeli", "Konya", "Gaziantep", "Kayseri", "Antalya", "Eskişehir",
         "Manisa", "Denizli", "Sakarya", "Tekirdağ", "Samsun", "Trabzon", "Mersin", "Adana"]  # fmt: skip
URUN_GRUPLARI = [("Rulman", 85), ("Kayış", 140), ("Conta seti", 45), ("Hidrolik hortum", 320), ("Filtre", 60),
                 ("Vida kutusu", 25), ("Elektrik motoru", 4200), ("Redüktör", 6800), ("Sensör", 950),
                 ("Kablo makarası", 1150), ("Rulo ambalaj", 210), ("Palet", 380)]  # fmt: skip

SCHEMA = """
CREATE TABLE cari (
  id INTEGER PRIMARY KEY,
  unvan TEXT NOT NULL,
  vkn TEXT NOT NULL UNIQUE,
  il TEXT NOT NULL,
  risk_sinifi TEXT NOT NULL CHECK (risk_sinifi IN ('A','B','C','D'))
);
CREATE TABLE stok (
  urun_kodu TEXT PRIMARY KEY,
  ad TEXT NOT NULL,
  miktar INTEGER NOT NULL,
  birim_fiyat NUMERIC NOT NULL
);
CREATE TABLE fatura (
  id INTEGER PRIMARY KEY,
  cari_id INTEGER NOT NULL REFERENCES cari(id),
  tarih TEXT NOT NULL,
  tutar NUMERIC NOT NULL,
  kdv NUMERIC NOT NULL,
  toplam NUMERIC NOT NULL,
  durum TEXT NOT NULL
);
CREATE TABLE fatura_kalem (
  id INTEGER PRIMARY KEY,
  fatura_id INTEGER NOT NULL REFERENCES fatura(id),
  urun_kodu TEXT NOT NULL REFERENCES stok(urun_kodu),
  miktar INTEGER NOT NULL,
  birim_fiyat NUMERIC NOT NULL,
  tutar NUMERIC NOT NULL
);
CREATE TABLE satis_aylik (
  ay TEXT PRIMARY KEY,
  tutar NUMERIC NOT NULL,
  adet INTEGER NOT NULL
);
CREATE INDEX ix_fatura_tarih ON fatura(tarih);
CREATE INDEX ix_fatura_cari ON fatura(cari_id);
CREATE INDEX ix_kalem_fatura ON fatura_kalem(fatura_id);
"""

KDV_ORANI = 0.20


def vkn_check_digit(first9: str) -> str:
    """GİB vergi kimlik numarası kontrol hanesi (python-stdnum `tr.vkn` ile aynı algoritma)."""
    s = 0
    for i, ch in enumerate(reversed(first9), 1):
        c1 = (int(ch) + i) % 10
        if c1:
            s += (c1 * 2**i) % 9 or 9
    return str((10 - s) % 10)


def is_valid_vkn(vkn: str) -> bool:
    return len(vkn) == 10 and vkn.isdigit() and vkn_check_digit(vkn[:9]) == vkn[9]


def synthetic_vkn(rng: random.Random) -> str:
    first9 = "".join(str(rng.randint(0, 9)) for _ in range(9))
    return first9 + vkn_check_digit(first9)


def _months():
    y, m = START
    while (y, m) <= END:
        yield y, m
        m += 1
        if m > 12:
            y, m = y + 1, 1


def _populate(con: sqlite3.Connection) -> None:
    rng = random.Random(SEED)
    cur = con.cursor()
    # cari: 20 müşteri + 12 tedarikçi
    cariler = []
    seen_vkn = set()
    for i in range(1, 33):
        if i <= 20:
            unvan = f"Müşteri {i:02d} {'Ltd. Şti.' if i % 3 else 'A.Ş.'}"
        else:
            unvan = f"Tedarikçi {i - 20:02d} {'A.Ş.' if i % 2 else 'Ltd. Şti.'}"
        vkn = synthetic_vkn(rng)
        while vkn in seen_vkn:
            vkn = synthetic_vkn(rng)
        seen_vkn.add(vkn)
        cariler.append((i, unvan, vkn, rng.choice(ILLER), rng.choices("ABCD", weights=[4, 3, 2, 1])[0]))
    cur.executemany("INSERT INTO cari VALUES (?,?,?,?,?)", cariler)
    musteriler = [c[0] for c in cariler if c[0] <= 20]
    tedarikciler = [c[0] for c in cariler if c[0] > 20]

    # stok: 36 ürün
    urunler = []
    for i in range(1, 37):
        grup, baz = URUN_GRUPLARI[(i - 1) % len(URUN_GRUPLARI)]
        fiyat = round(baz * rng.uniform(0.8, 1.3), 2)
        urunler.append(
            (
                f"URN-{i:04d}",
                f"{grup} tip {chr(64 + (i - 1) // len(URUN_GRUPLARI) + 1)}{i:02d}",
                rng.randint(0, 900),
                fiyat,
            )
        )
    cur.executemany("INSERT INTO stok VALUES (?,?,?,?)", urunler)

    fatura_id = 0
    kalem_id = 0
    aylik: dict[str, list[float]] = {}
    months = list(_months())
    for idx, (y, m) in enumerate(months):
        trend = 1 + 0.012 * idx  # hafif büyüme
        mevsim = {
            1: 0.85,
            2: 0.9,
            3: 1.05,
            4: 1.05,
            5: 1.1,
            6: 1.0,
            7: 0.9,
            8: 0.8,
            9: 1.05,
            10: 1.1,
            11: 1.15,
            12: 1.25,
        }[m]
        n_satis = int(rng.randint(14, 20) * trend * mevsim)
        n_alis = rng.randint(4, 8)
        ay = f"{y:04d}-{m:02d}"
        aylik.setdefault(ay, [0.0, 0])
        for k in range(n_satis + n_alis):
            satis = k < n_satis
            fatura_id += 1
            gun = rng.randint(1, 28)
            tarih = date(y, m, gun).isoformat()
            cari = rng.choice(musteriler if satis else tedarikciler)
            kalemler = []
            for _ in range(rng.randint(1, 4)):
                kod, _ad, _miktar, fiyat = rng.choice(urunler)
                miktar = rng.randint(1, 25)
                bf = round(fiyat * (1.0 if satis else 0.72) * rng.uniform(0.95, 1.05), 2)
                kalem_id += 1
                kalemler.append((kalem_id, fatura_id, kod, miktar, bf, round(miktar * bf, 2)))
            tutar = round(sum(k[5] for k in kalemler), 2)
            kdv = round(tutar * KDV_ORANI, 2)
            yas = len(months) - idx
            if rng.random() < 0.02:
                durum = "iptal"
            elif yas > 3:
                durum = "odendi" if rng.random() < 0.95 else "vadesi_gecti"
            else:
                durum = rng.choice(["acik", "acik", "odendi"])
            cur.execute(
                "INSERT INTO fatura VALUES (?,?,?,?,?,?,?)",
                (fatura_id, cari, tarih, tutar, kdv, round(tutar + kdv, 2), durum),
            )
            cur.executemany("INSERT INTO fatura_kalem VALUES (?,?,?,?,?,?)", kalemler)
            if satis and durum != "iptal":
                aylik[ay][0] += tutar
                aylik[ay][1] += sum(k[3] for k in kalemler)
    cur.executemany(
        "INSERT INTO satis_aylik VALUES (?,?,?)",
        [(ay, round(v[0], 2), int(v[1])) for ay, v in sorted(aylik.items())],
    )
    con.commit()


def create_mock_erp(path: str | Path, *, overwrite: bool = True) -> str:
    """Örnek ERP veritabanını oluşturur ve SQLAlchemy URL'sini döner."""
    p = Path(path).expanduser().resolve()
    p.parent.mkdir(parents=True, exist_ok=True)
    if p.exists():
        if not overwrite:
            return f"sqlite:///{p}"
        p.unlink()
    con = sqlite3.connect(p)
    try:
        con.executescript(SCHEMA)
        _populate(con)
    finally:
        con.close()
    return f"sqlite:///{p}"


class MockERPConnector(SQLReadOnlyConnector):
    """Örnek ERP: okuma araçları SQLReadOnlyConnector ile aynı; ek olarak onaylı yazma aracı 'fatura_oneri_olustur'.

    Yazma aracı yalnız `ERPConnector.execute_write` (onaylı Approval) üzerinden çalışır; `call_tool` reddeder.
    """

    kind = "mock"
    read_only = False

    def __init__(self, url: str, allowed_tables: list[str] | None = None, **kw: Any):
        super().__init__(url, allowed_tables or MOCK_TABLES, **kw)
        self._write_engine = create_engine(url, connect_args={"check_same_thread": False})

    def capabilities(self) -> dict:
        caps = super().capabilities()
        caps["read_only"] = False
        caps["note"] = "Örnek ERP: okuma salt-okunur; tek yazma aracı insan onayından sonra çalışır."
        return caps

    def list_tools(self) -> list[dict]:
        return super().list_tools() + [
            make_tool(
                "fatura_oneri_olustur",
                "Örnek ERP'de 'onay_bekliyor' durumunda öneri fatura açar. İnsan onayı gerekir.",
                {
                    "type": "object",
                    "required": ["cari_id", "kalemler"],
                    "properties": {
                        "cari_id": {"type": "integer"},
                        "tarih": {"type": "string", "format": "date"},
                        "kalemler": {
                            "type": "array",
                            "minItems": 1,
                            "items": {
                                "type": "object",
                                "required": ["urun_kodu", "miktar"],
                                "properties": {
                                    "urun_kodu": {"type": "string"},
                                    "miktar": {"type": "integer", "minimum": 1},
                                    "birim_fiyat": {"type": "number", "minimum": 0},
                                },
                            },
                        },
                    },
                },
                human_approval=True,
            )
        ]

    def _write(self, name: str, args: dict[str, Any]) -> dict:
        if name != "fatura_oneri_olustur":
            raise ErpError("unknown_tool", f"Bilinmeyen yazma aracı: '{name}'")
        try:
            cari_id = int(args["cari_id"])
            kalemler = list(args["kalemler"])
        except (KeyError, TypeError, ValueError) as e:
            raise ErpError("bad_args", "cari_id ve kalemler alanları gerekli.") from e
        if not kalemler:
            raise ErpError("bad_args", "En az bir kalem gerekli.")
        tarih = str(args.get("tarih") or datetime.now().astimezone().date().isoformat())
        with self._write_engine.begin() as conn:
            if conn.execute(text("SELECT 1 FROM cari WHERE id = :i"), {"i": cari_id}).first() is None:
                raise ErpError("bad_args", f"Cari bulunamadı: {cari_id}")
            satirlar = []
            for k in kalemler:
                kod = str(k.get("urun_kodu", ""))
                row = conn.execute(
                    text("SELECT birim_fiyat FROM stok WHERE urun_kodu = :k"), {"k": kod}
                ).first()
                if row is None:
                    raise ErpError("bad_args", f"Ürün bulunamadı: {kod}")
                miktar = int(k.get("miktar", 0))
                if miktar < 1:
                    raise ErpError("bad_args", f"Miktar en az 1 olmalı: {kod}")
                bf = float(k["birim_fiyat"]) if k.get("birim_fiyat") is not None else float(row[0])
                satirlar.append((kod, miktar, bf, round(miktar * bf, 2)))
            tutar = round(sum(s[3] for s in satirlar), 2)
            kdv = round(tutar * KDV_ORANI, 2)
            res = conn.execute(
                text(
                    "INSERT INTO fatura (cari_id, tarih, tutar, kdv, toplam, durum) VALUES (:c, :t, :tu, :k, :to, 'onay_bekliyor')"
                ),
                {"c": cari_id, "t": tarih, "tu": tutar, "k": kdv, "to": round(tutar + kdv, 2)},
            )
            fid = res.lastrowid
            for kod, miktar, bf, tt in satirlar:
                conn.execute(
                    text(
                        "INSERT INTO fatura_kalem (fatura_id, urun_kodu, miktar, birim_fiyat, tutar) VALUES (:f, :u, :m, :b, :t)"
                    ),
                    {"f": fid, "u": kod, "m": miktar, "b": bf, "t": tt},
                )
        return {
            "fatura_id": fid,
            "durum": "onay_bekliyor",
            "tutar": tutar,
            "kdv": kdv,
            "toplam": round(tutar + kdv, 2),
        }

    def close(self) -> None:
        super().close()
        self._write_engine.dispose()


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    if not argv or argv[0] in ("-h", "--help"):
        print("Kullanım: python -m aiplatform.erp.mock_erp <veritabanı-yolu>")
        return 0 if argv else 2
    url = create_mock_erp(argv[0])
    con = sqlite3.connect(argv[0])
    try:
        counts = {t: con.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for t in MOCK_TABLES}
    finally:
        con.close()
    print(f"Örnek ERP oluşturuldu: {url}")
    for t, n in counts.items():
        print(f"  {t}: {n} satır")
    print("Not: veriler sentetiktir; gerçek şirket veya kişi içermez.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

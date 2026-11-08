"""SQLite tek dosya depo (ADR-005). `veri/moda.db`; görsel baytı ve sayfa HTML'i asla yazılmaz (ADR-002).

Bütün yazımlar tek transaction içinde yapılır: yarıda kesilen bir tarama veritabanını bozmaz.
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
from collections import defaultdict
from collections.abc import Iterable
from datetime import date
from pathlib import Path
from typing import Self

from moda_radar.sema import DefileTanimi, GozlemKaydi, NitelikKaydi, RenkKaydi, SinyalKaydi

VARSAYILAN_YOL = Path("veri/moda.db")

# Sinyal ve gözlem üretiminde sayılan nitelik eksenleri (kategori, parca_konumu, renk_sayisi sayılmaz).
NITELIK_EKSENLERI = ("siluet", "boy", "yaka", "kol", "kumas_gorunumu", "desen", "detay", "doku", "kapanma")
_NITELIK_ALANLARI = (
    "kategori",
    "parca_konumu",
    "siluet",
    "boy",
    "yaka",
    "kol",
    "kumas_gorunumu",
    "desen",
    "detay",
    "doku",
    "kapanma",
    "renk_sayisi",
)
_KAYNAK_SUTUNLARI = "kaynak_tur TEXT NOT NULL, kaynak_url TEXT NOT NULL, tarama_tarihi TEXT NOT NULL, sezon TEXT NOT NULL, segment TEXT, marka TEXT"
_NITELIK_SUTUNLARI = ", ".join(f"{a} TEXT NOT NULL" for a in _NITELIK_ALANLARI)
_RENK_SUTUNLARI = (
    "parca_id TEXT NOT NULL, rol TEXT NOT NULL, pay REAL NOT NULL, lab_L REAL NOT NULL, lab_a REAL NOT NULL, "
    "lab_b REAL NOT NULL, hex TEXT NOT NULL, pantone_kod TEXT NOT NULL, pantone_hex TEXT NOT NULL, "
    "pantone_delta_e REAL NOT NULL, pantone_ad TEXT, ikinci_kod TEXT, ikinci_hex TEXT, ikinci_delta_e REAL"
)

SEMA_SQL = f"""
CREATE TABLE IF NOT EXISTS sema_surumu (surum INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS defile (
    id TEXT PRIMARY KEY, sezon TEXT NOT NULL, marka TEXT NOT NULL, sehir TEXT NOT NULL,
    kaynak TEXT NOT NULL, kaynak_kimligi TEXT NOT NULL, tarih TEXT
);
CREATE TABLE IF NOT EXISTS gorsel (
    id TEXT PRIMARY KEY, defile_id TEXT NOT NULL REFERENCES defile(id), url TEXT NOT NULL UNIQUE,
    tarama_tarihi TEXT NOT NULL, sira INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS parca_nitelik (
    id INTEGER PRIMARY KEY, gorsel_id TEXT REFERENCES gorsel(id), parca_id TEXT NOT NULL,
    {_KAYNAK_SUTUNLARI}, {_NITELIK_SUTUNLARI},
    etiketleyen_model TEXT NOT NULL, denetim INTEGER NOT NULL DEFAULT 0, gomme TEXT,
    UNIQUE (kaynak_url, parca_id, denetim)
);
CREATE TABLE IF NOT EXISTS parca_renk (
    id INTEGER PRIMARY KEY, gorsel_id TEXT REFERENCES gorsel(id), {_KAYNAK_SUTUNLARI}, {_RENK_SUTUNLARI},
    UNIQUE (kaynak_url, parca_id, rol, hex)
);
CREATE TABLE IF NOT EXISTS perakende_urun (
    id TEXT PRIMARY KEY, ulke TEXT NOT NULL DEFAULT 'TR', segment TEXT NOT NULL, marka TEXT NOT NULL,
    kategori TEXT NOT NULL, url TEXT NOT NULL UNIQUE, baslik TEXT, fiyat REAL, para TEXT, indirim_yuzde REAL,
    gorsel_url TEXT, ilk_gorulme TEXT NOT NULL, son_gorulme TEXT NOT NULL, aktif INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS perakende_gorulme (
    urun_id TEXT NOT NULL REFERENCES perakende_urun(id), tarih TEXT NOT NULL, fiyat REAL, indirim_yuzde REAL,
    PRIMARY KEY (urun_id, tarih)
);
CREATE TABLE IF NOT EXISTS perakende_nitelik (
    id INTEGER PRIMARY KEY, urun_id TEXT NOT NULL REFERENCES perakende_urun(id), parca_id TEXT NOT NULL,
    {_KAYNAK_SUTUNLARI}, {_NITELIK_SUTUNLARI},
    etiketleyen_model TEXT NOT NULL, denetim INTEGER NOT NULL DEFAULT 0, gomme TEXT,
    UNIQUE (urun_id, parca_id, denetim)
);
CREATE TABLE IF NOT EXISTS perakende_renk (
    id INTEGER PRIMARY KEY, urun_id TEXT NOT NULL REFERENCES perakende_urun(id), {_KAYNAK_SUTUNLARI},
    {_RENK_SUTUNLARI}, UNIQUE (urun_id, parca_id, rol, hex)
);
CREATE TABLE IF NOT EXISTS talep (
    kaynak TEXT NOT NULL, anahtar TEXT NOT NULL, tarih TEXT NOT NULL, deger REAL NOT NULL,
    kaynak_url TEXT NOT NULL DEFAULT '', PRIMARY KEY (kaynak, anahtar, tarih)
);
CREATE TABLE IF NOT EXISTS sinyal (
    sezon TEXT NOT NULL, nitelik_ekseni TEXT NOT NULL, nitelik_degeri TEXT NOT NULL, podyum_payi REAL NOT NULL,
    marka_sayisi INTEGER NOT NULL, kaynak_turu TEXT NOT NULL, kaynak_url TEXT NOT NULL, kaynak_tarihi TEXT NOT NULL,
    guven REAL NOT NULL, notu TEXT, PRIMARY KEY (sezon, nitelik_ekseni, nitelik_degeri, kaynak_url)
);
CREATE TABLE IF NOT EXISTS gozlem (
    ulke TEXT NOT NULL, segment TEXT NOT NULL, marka TEXT NOT NULL, kategori TEXT NOT NULL,
    nitelik_ekseni TEXT NOT NULL, nitelik_degeri TEXT NOT NULL, ilk_gorulme TEXT NOT NULL, son_gorulme TEXT NOT NULL,
    urun_sayisi INTEGER NOT NULL, raf_payi REAL, kaynak_url TEXT NOT NULL, kaynak_turu TEXT NOT NULL,
    PRIMARY KEY (ulke, segment, marka, kategori, nitelik_ekseni, nitelik_degeri, kaynak_url)
);
CREATE TABLE IF NOT EXISTS gecikme_olcum (
    segment TEXT NOT NULL, kategori TEXT NOT NULL, eksen TEXT NOT NULL, deger TEXT NOT NULL, sezon TEXT NOT NULL,
    podyum_tarihi TEXT NOT NULL, raf_tarihi TEXT NOT NULL, gecikme_gun INTEGER NOT NULL, olcum_tarihi TEXT NOT NULL,
    PRIMARY KEY (segment, kategori, eksen, deger, sezon)
);
CREATE INDEX IF NOT EXISTS ix_parca_nitelik_sezon ON parca_nitelik(sezon, tarama_tarihi);
CREATE INDEX IF NOT EXISTS ix_parca_renk_sezon ON parca_renk(sezon, tarama_tarihi);
CREATE INDEX IF NOT EXISTS ix_perakende_urun_seg ON perakende_urun(segment, kategori);
"""
SEMA_SURUMU = 1

TABLOLAR = (
    "defile",
    "gorsel",
    "parca_nitelik",
    "parca_renk",
    "perakende_urun",
    "perakende_gorulme",
    "perakende_nitelik",
    "perakende_renk",
    "talep",
    "sinyal",
    "gozlem",
    "gecikme_olcum",
)


def kimlik(metin: str) -> str:
    """URL'den kısa ve kararlı kimlik (sha1'in ilk 16 hanesi)."""
    return hashlib.sha1(metin.encode("utf-8")).hexdigest()[:16]


def _tarih(t: date | str | None) -> str | None:
    if t is None:
        return None
    return t.isoformat() if isinstance(t, date) else str(t)


class Depo:
    """SQLite deposu. `with Depo(yol) as d:` ya da `d = Depo(yol); ...; d.kapat()`."""

    def __init__(self, yol: Path | str = VARSAYILAN_YOL) -> None:
        self.yol = Path(yol)
        if str(self.yol) != ":memory:":
            self.yol.parent.mkdir(parents=True, exist_ok=True)
        self.baglanti = sqlite3.connect(str(self.yol))
        self.baglanti.row_factory = sqlite3.Row
        self.baglanti.execute("PRAGMA foreign_keys = ON")
        with self.baglanti:
            self.baglanti.executescript(SEMA_SQL)
            if self.baglanti.execute("SELECT COUNT(*) FROM sema_surumu").fetchone()[0] == 0:
                self.baglanti.execute("INSERT INTO sema_surumu VALUES (?)", (SEMA_SURUMU,))

    # --- yaşam döngüsü ---
    def kapat(self) -> None:
        self.baglanti.close()

    def __enter__(self) -> Self:
        return self

    def __exit__(self, *_: object) -> None:
        self.kapat()

    def butunluk(self) -> bool:
        """`PRAGMA integrity_check` sonucu 'ok' mu."""
        return self.baglanti.execute("PRAGMA integrity_check").fetchone()[0] == "ok"

    # --- podyum yazımları ---
    def ekle_defile(self, d: DefileTanimi) -> str:
        defile_id = f"{d.kaynak}:{d.kaynak_kimligi}"
        with self.baglanti:
            self.baglanti.execute(
                "INSERT INTO defile VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET "
                "tarih = COALESCE(excluded.tarih, defile.tarih), sehir = excluded.sehir, marka = excluded.marka",
                (defile_id, d.sezon, d.marka, d.sehir, d.kaynak, d.kaynak_kimligi, _tarih(d.tarih)),
            )
        return defile_id

    def ekle_gorsel(self, defile_id: str, url: str, tarama_tarihi: date, sira: int) -> str:
        """Yalnız URL kaydedilir; bayt asla (ADR-002). Aynı URL ikinci kez gelirse mevcut kimlik döner."""
        gorsel_id = kimlik(url)
        with self.baglanti:
            self.baglanti.execute(
                "INSERT OR IGNORE INTO gorsel VALUES (?,?,?,?,?)",
                (gorsel_id, defile_id, url, _tarih(tarama_tarihi), sira),
            )
        return gorsel_id

    @staticmethod
    def _kaynak_degerleri(k) -> tuple:
        return (k.tur.value, k.url, _tarih(k.tarama_tarihi), k.sezon, k.segment, k.marka)

    def _nitelik_satiri(self, n: NitelikKaydi) -> tuple:
        return (
            n.parca_id,
            *self._kaynak_degerleri(n.kaynak),
            *(getattr(n, a) for a in _NITELIK_ALANLARI),
            n.etiketleyen_model,
            int(n.denetim),
            json.dumps(n.gomme) if n.gomme is not None else None,
        )

    def _renk_satiri(self, r: RenkKaydi) -> tuple:
        ik = r.ikinci_aday
        return (
            *self._kaynak_degerleri(r.kaynak),
            r.parca_id,
            r.rol,
            r.pay,
            r.lab.L,
            r.lab.a,
            r.lab.b,
            r.hex,
            r.pantone.kod,
            r.pantone.hex,
            r.pantone.delta_e,
            r.pantone.ad,
            ik.kod if ik else None,
            ik.hex if ik else None,
            ik.delta_e if ik else None,
        )

    _NITELIK_INSERT = (
        "parca_id, kaynak_tur, kaynak_url, tarama_tarihi, sezon, segment, marka, "
        + ", ".join(_NITELIK_ALANLARI)
        + ", etiketleyen_model, denetim, gomme"
    )
    _RENK_INSERT = (
        "kaynak_tur, kaynak_url, tarama_tarihi, sezon, segment, marka, parca_id, rol, pay, lab_L, lab_a, lab_b, hex, "
        "pantone_kod, pantone_hex, pantone_delta_e, pantone_ad, ikinci_kod, ikinci_hex, ikinci_delta_e"
    )

    def ekle_parca_nitelik(self, kayitlar: Iterable[NitelikKaydi], gorsel_id: str | None = None) -> int:
        satirlar = [(gorsel_id, *self._nitelik_satiri(n)) for n in kayitlar]
        if not satirlar:
            return 0
        yer = ",".join("?" * len(satirlar[0]))
        with self.baglanti:
            self.baglanti.executemany(
                f"INSERT OR REPLACE INTO parca_nitelik (gorsel_id, {self._NITELIK_INSERT}) VALUES ({yer})", satirlar
            )
        return len(satirlar)

    def ekle_parca_renk(self, kayitlar: Iterable[RenkKaydi], gorsel_id: str | None = None) -> int:
        satirlar = [(gorsel_id, *self._renk_satiri(r)) for r in kayitlar]
        if not satirlar:
            return 0
        yer = ",".join("?" * len(satirlar[0]))
        with self.baglanti:
            self.baglanti.executemany(
                f"INSERT OR REPLACE INTO parca_renk (gorsel_id, {self._RENK_INSERT}) VALUES ({yer})", satirlar
            )
        return len(satirlar)

    # --- perakende yazımları ---
    def upsert_perakende_urun(
        self,
        *,
        segment: str,
        marka: str,
        kategori: str,
        url: str,
        tarih: date,
        baslik: str | None = None,
        fiyat: float | None = None,
        para: str | None = "TRY",
        indirim_yuzde: float | None = None,
        gorsel_url: str | None = None,
        ulke: str = "TR",
    ) -> str:
        """Ürünü ekler ya da günceller: `ilk_gorulme` korunur, `son_gorulme` ileri alınır, görülme günlüğe yazılır."""
        urun_id = kimlik(url)
        t = _tarih(tarih)
        with self.baglanti:
            self.baglanti.execute(
                "INSERT INTO perakende_urun (id, ulke, segment, marka, kategori, url, baslik, fiyat, para, "
                "indirim_yuzde, gorsel_url, ilk_gorulme, son_gorulme, aktif) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1) "
                "ON CONFLICT(id) DO UPDATE SET baslik = COALESCE(excluded.baslik, baslik), "
                "fiyat = COALESCE(excluded.fiyat, fiyat), para = COALESCE(excluded.para, para), "
                "indirim_yuzde = excluded.indirim_yuzde, gorsel_url = COALESCE(excluded.gorsel_url, gorsel_url), "
                "ilk_gorulme = MIN(ilk_gorulme, excluded.ilk_gorulme), "
                "son_gorulme = MAX(son_gorulme, excluded.son_gorulme), aktif = 1",
                (urun_id, ulke, segment, marka, kategori, url, baslik, fiyat, para, indirim_yuzde, gorsel_url, t, t),
            )
            self.baglanti.execute(
                "INSERT OR REPLACE INTO perakende_gorulme VALUES (?,?,?,?)", (urun_id, t, fiyat, indirim_yuzde)
            )
        return urun_id

    def pasiflestir(self, segment: str, marka: str, kategori: str, gorulen_idler: Iterable[str]) -> int:
        """Son taramada görülmeyen ürünleri `aktif = 0` yapar (silmez)."""
        gorulen = set(gorulen_idler)
        with self.baglanti:
            satirlar = self.baglanti.execute(
                "SELECT id FROM perakende_urun WHERE segment=? AND marka=? AND kategori=? AND aktif=1",
                (segment, marka, kategori),
            ).fetchall()
            kapanan = [(s["id"],) for s in satirlar if s["id"] not in gorulen]
            self.baglanti.executemany("UPDATE perakende_urun SET aktif=0 WHERE id=?", kapanan)
        return len(kapanan)

    def ekle_perakende_nitelik(self, urun_id: str, kayitlar: Iterable[NitelikKaydi]) -> int:
        satirlar = [(urun_id, *self._nitelik_satiri(n)) for n in kayitlar]
        if not satirlar:
            return 0
        yer = ",".join("?" * len(satirlar[0]))
        with self.baglanti:
            self.baglanti.executemany(
                f"INSERT OR REPLACE INTO perakende_nitelik (urun_id, {self._NITELIK_INSERT}) VALUES ({yer})", satirlar
            )
        return len(satirlar)

    def ekle_perakende_renk(self, urun_id: str, kayitlar: Iterable[RenkKaydi]) -> int:
        satirlar = [(urun_id, *self._renk_satiri(r)) for r in kayitlar]
        if not satirlar:
            return 0
        yer = ",".join("?" * len(satirlar[0]))
        with self.baglanti:
            self.baglanti.executemany(
                f"INSERT OR REPLACE INTO perakende_renk (urun_id, {self._RENK_INSERT}) VALUES ({yer})", satirlar
            )
        return len(satirlar)

    def ekle_talep(self, kaynak: str, anahtar: str, tarih: date, deger: float, kaynak_url: str = "") -> None:
        with self.baglanti:
            self.baglanti.execute(
                "INSERT OR REPLACE INTO talep VALUES (?,?,?,?,?)", (kaynak, anahtar, _tarih(tarih), deger, kaynak_url)
            )

    # --- sinyal / gözlem ---
    def ekle_sinyaller(self, kayitlar: Iterable[SinyalKaydi]) -> int:
        satirlar = [
            (
                s.sezon,
                s.nitelik_ekseni,
                s.nitelik_degeri,
                s.podyum_payi,
                s.marka_sayisi,
                s.kaynak_turu,
                s.kaynak_url,
                _tarih(s.kaynak_tarihi),
                s.guven,
                s.not_,
            )
            for s in kayitlar
        ]
        with self.baglanti:
            self.baglanti.executemany("INSERT OR REPLACE INTO sinyal VALUES (?,?,?,?,?,?,?,?,?,?)", satirlar)
        return len(satirlar)

    def ekle_gozlemler(self, kayitlar: Iterable[GozlemKaydi]) -> int:
        satirlar = [
            (
                g.ulke,
                g.segment,
                g.marka,
                g.kategori,
                g.nitelik_ekseni,
                g.nitelik_degeri,
                _tarih(g.ilk_gorulme),
                _tarih(g.son_gorulme),
                g.urun_sayisi,
                g.raf_payi,
                g.kaynak_url,
                g.kaynak_turu,
            )
            for g in kayitlar
        ]
        with self.baglanti:
            self.baglanti.executemany("INSERT OR REPLACE INTO gozlem VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", satirlar)
        return len(satirlar)

    def sinyaller(self, sezon: str | None = None, *, kadar: date | None = None) -> list[SinyalKaydi]:
        """Podyum parça sayımlarından türetilen sinyaller + `sinyal` tablosundaki (rapor) sinyaller.

        Pay = değeri taşıyan tekil parça / sezonun etiketli tekil parçası. Renk ekseni baskın rolün Pantone kodudur.
        `kadar` verilirse yalnız `tarama_tarihi ≤ kadar` kayıtlar sayılır (zaman kilidi).
        """
        sonuc = self._turetilmis_sinyaller(sezon, kadar)
        kosul, prm = ["1=1"], []
        if sezon:
            kosul.append("sezon = ?")
            prm.append(sezon)
        if kadar:
            kosul.append("kaynak_tarihi <= ?")
            prm.append(_tarih(kadar))
        for s in self.baglanti.execute(
            f"SELECT * FROM sinyal WHERE {' AND '.join(kosul)} ORDER BY sezon, nitelik_ekseni, podyum_payi DESC", prm
        ):
            sonuc.append(
                SinyalKaydi(
                    sezon=s["sezon"],
                    nitelik_ekseni=s["nitelik_ekseni"],
                    nitelik_degeri=s["nitelik_degeri"],
                    podyum_payi=s["podyum_payi"],
                    marka_sayisi=s["marka_sayisi"],
                    kaynak_turu=s["kaynak_turu"],
                    kaynak_url=s["kaynak_url"],
                    kaynak_tarihi=date.fromisoformat(s["kaynak_tarihi"]),
                    guven=s["guven"],
                    **{"not": s["notu"]},
                )
            )
        return sonuc

    def _turetilmis_sinyaller(self, sezon: str | None, kadar: date | None) -> list[SinyalKaydi]:
        kosul, prm = ["denetim = 0", "kaynak_tur = 'podyum'"], []
        if sezon:
            kosul.append("sezon = ?")
            prm.append(sezon)
        if kadar:
            kosul.append("tarama_tarihi <= ?")
            prm.append(_tarih(kadar))
        nk = " AND ".join(kosul)
        # (sezon, eksen, deger) -> {parça kimlikleri}, {markalar}, en son tarih
        sayim: dict[tuple[str, str, str], tuple[set, set, list]] = defaultdict(lambda: (set(), set(), []))
        toplam: dict[tuple[str, str], set] = defaultdict(set)  # (sezon, kaynak tablosu) -> parçalar
        for r in self.baglanti.execute(f"SELECT * FROM parca_nitelik WHERE {nk}", prm):
            parca = (r["kaynak_url"], r["parca_id"])
            toplam[(r["sezon"], "nitelik")].add(parca)
            for eksen in NITELIK_EKSENLERI:
                deger = r[eksen]
                if deger and deger != "bilinmiyor":
                    p, m, t = sayim[(r["sezon"], eksen, deger)]
                    p.add(parca)
                    m.add(r["marka"])
                    t.append(r["tarama_tarihi"])
        rk = nk.replace("denetim = 0 AND ", "") + " AND rol = 'baskin'"
        for r in self.baglanti.execute(f"SELECT * FROM parca_renk WHERE {rk}", prm):
            parca = (r["kaynak_url"], r["parca_id"])
            toplam[(r["sezon"], "renk")].add(parca)
            p, m, t = sayim[(r["sezon"], "renk", r["pantone_kod"])]
            p.add(parca)
            m.add(r["marka"])
            t.append(r["tarama_tarihi"])
        sonuc = []
        for (sz, eksen, deger), (parcalar, markalar, tarihler) in sorted(sayim.items()):
            payda = len(toplam[(sz, "renk" if eksen == "renk" else "nitelik")])
            sonuc.append(
                SinyalKaydi(
                    sezon=sz,
                    nitelik_ekseni=eksen,
                    nitelik_degeri=deger,
                    podyum_payi=round(len(parcalar) / payda, 6),
                    marka_sayisi=len({m for m in markalar if m}),
                    kaynak_turu="gorsel",
                    kaynak_url=f"moda.db#{'parca_renk' if eksen == 'renk' else 'parca_nitelik'}?sezon={sz}",
                    kaynak_tarihi=date.fromisoformat(max(tarihler)),
                    guven=0.9 if payda >= 30 else 0.6,
                    **{"not": f"{len(parcalar)}/{payda} parça"},
                )
            )
        return sonuc

    def gozlemler(
        self, ulke: str = "TR", segment: str | None = None, kategori: str | None = None, *, kadar: date | None = None
    ) -> list[GozlemKaydi]:
        """Perakende raf gözlemleri: ürün+nitelik/renk birleşiminden ilk/son görülme ve kategori içi raf payı,
        ardından `gozlem` tablosuna dışarıdan yazılmış (rapor, saha) gözlemler.

        `kadar` verilirse görülme günlüğünden yalnız `tarih ≤ kadar` satırları ve `tarama_tarihi ≤ kadar` etiketler okunur.
        """
        kosul, prm = ["u.ulke = ?"], [ulke]
        if segment:
            kosul.append("u.segment = ?")
            prm.append(segment)
        if kategori:
            kosul.append("u.kategori = ?")
            prm.append(kategori)
        if kadar:
            kosul.append("g.tarih <= ?")
            prm.append(_tarih(kadar))
        urunler = {
            r["id"]: r
            for r in self.baglanti.execute(
                "SELECT u.id, u.segment, u.marka, u.kategori, u.url, MIN(g.tarih) AS ilk, MAX(g.tarih) AS son "
                f"FROM perakende_urun u JOIN perakende_gorulme g ON g.urun_id = u.id WHERE {' AND '.join(kosul)} "
                "GROUP BY u.id",
                prm,
            )
        }
        kadar_k = " AND tarama_tarihi <= ?" if kadar else ""
        kadar_p = [_tarih(kadar)] if kadar else []
        etiketler: dict[str, set[tuple[str, str]]] = defaultdict(set)
        for r in self.baglanti.execute(f"SELECT * FROM perakende_nitelik WHERE denetim = 0{kadar_k}", kadar_p):
            if r["urun_id"] in urunler:
                for eksen in NITELIK_EKSENLERI:
                    if r[eksen] and r[eksen] != "bilinmiyor":
                        etiketler[r["urun_id"]].add((eksen, r[eksen]))
        for r in self.baglanti.execute(f"SELECT * FROM perakende_renk WHERE rol = 'baskin'{kadar_k}", kadar_p):
            if r["urun_id"] in urunler:
                etiketler[r["urun_id"]].add(("renk", r["pantone_kod"]))

        kategori_toplam: dict[tuple, int] = defaultdict(int)
        for u in urunler.values():
            kategori_toplam[(u["segment"], u["marka"], u["kategori"])] += 1
        grup: dict[tuple, list] = defaultdict(list)
        for uid, ets in etiketler.items():
            u = urunler[uid]
            for eksen, deger in ets:
                grup[(u["segment"], u["marka"], u["kategori"], eksen, deger)].append(u)
        sonuc = []
        for (seg, marka, kat, eksen, deger), us in sorted(grup.items()):
            ilk_urun = min(us, key=lambda u: (u["ilk"], u["url"]))
            sonuc.append(
                GozlemKaydi(
                    ulke=ulke,
                    segment=seg,
                    marka=marka,
                    kategori=kat,
                    nitelik_ekseni=eksen,
                    nitelik_degeri=deger,
                    ilk_gorulme=date.fromisoformat(ilk_urun["ilk"]),
                    son_gorulme=date.fromisoformat(max(u["son"] for u in us)),
                    urun_sayisi=len(us),
                    raf_payi=round(len(us) / kategori_toplam[(seg, marka, kat)], 6),
                    kaynak_url=ilk_urun["url"],
                    kaynak_turu="site",
                )
            )
        sonuc.extend(self._kayitli_gozlemler(ulke, segment, kategori, kadar))
        return sonuc

    def _kayitli_gozlemler(
        self, ulke: str, segment: str | None, kategori: str | None, kadar: date | None
    ) -> list[GozlemKaydi]:
        kosul, prm = ["ulke = ?"], [ulke]
        if segment:
            kosul.append("segment = ?")
            prm.append(segment)
        if kategori:
            kosul.append("kategori = ?")
            prm.append(kategori)
        if kadar:
            kosul.append("ilk_gorulme <= ?")
            prm.append(_tarih(kadar))
        sonuc = []
        for r in self.baglanti.execute(f"SELECT * FROM gozlem WHERE {' AND '.join(kosul)}", prm):
            son = date.fromisoformat(r["son_gorulme"])
            if kadar and son > kadar:
                son = kadar  # kilit tarihinden sonrası bilinemez
            sonuc.append(
                GozlemKaydi(
                    ulke=r["ulke"],
                    segment=r["segment"],
                    marka=r["marka"],
                    kategori=r["kategori"],
                    nitelik_ekseni=r["nitelik_ekseni"],
                    nitelik_degeri=r["nitelik_degeri"],
                    ilk_gorulme=date.fromisoformat(r["ilk_gorulme"]),
                    son_gorulme=son,
                    urun_sayisi=r["urun_sayisi"],
                    raf_payi=r["raf_payi"],
                    kaynak_url=r["kaynak_url"],
                    kaynak_turu=r["kaynak_turu"],
                )
            )
        return sonuc

    # --- yardımcı okumalar ---
    def parca_renkleri(self, sezon: str, *, kadar: date | None = None) -> list[dict]:
        """Sezonun podyum parça renkleri, düz sözlük (sezon, marka, rol, pay, lab_L/a/b, hex, pantone_kod, ...)."""
        sql, prm = "SELECT * FROM parca_renk WHERE sezon = ?", [sezon]
        if kadar:
            sql += " AND tarama_tarihi <= ?"
            prm.append(_tarih(kadar))
        return [dict(r) for r in self.baglanti.execute(sql + " ORDER BY id", prm)]

    def defile_tarihleri(self, sezon: str) -> list[date]:
        return [
            date.fromisoformat(r[0])
            for r in self.baglanti.execute("SELECT tarih FROM defile WHERE sezon=? AND tarih IS NOT NULL", (sezon,))
        ]

    def ozet(self) -> dict:
        """Tablo başına satır sayısı, sezon ve segment dağılımı."""
        b = self.baglanti
        satir = {t: b.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for t in TABLOLAR}

        def dagilim(sql: str) -> dict[str, int]:
            return {str(k): v for k, v in b.execute(sql)}

        return {
            "yol": str(self.yol),
            "sema_surumu": SEMA_SURUMU,
            "satir": satir,
            "sezon": {
                "defile": dagilim("SELECT sezon, COUNT(*) FROM defile GROUP BY sezon ORDER BY sezon"),
                "gorsel": dagilim(
                    "SELECT d.sezon, COUNT(*) FROM gorsel g JOIN defile d ON d.id = g.defile_id "
                    "GROUP BY d.sezon ORDER BY d.sezon"
                ),
                "parca_nitelik": dagilim("SELECT sezon, COUNT(*) FROM parca_nitelik GROUP BY sezon ORDER BY sezon"),
                "parca_renk": dagilim("SELECT sezon, COUNT(*) FROM parca_renk GROUP BY sezon ORDER BY sezon"),
                "sinyal": dagilim("SELECT sezon, COUNT(*) FROM sinyal GROUP BY sezon ORDER BY sezon"),
            },
            "segment": {
                "perakende_urun": dagilim(
                    "SELECT segment, COUNT(*) FROM perakende_urun GROUP BY segment ORDER BY segment"
                ),
                "perakende_aktif": dagilim(
                    "SELECT segment, COUNT(*) FROM perakende_urun WHERE aktif=1 GROUP BY segment ORDER BY segment"
                ),
                "gozlem": dagilim("SELECT segment, COUNT(*) FROM gozlem GROUP BY segment ORDER BY segment"),
                "gecikme_olcum": dagilim(
                    "SELECT segment, COUNT(*) FROM gecikme_olcum GROUP BY segment ORDER BY segment"
                ),
            },
        }

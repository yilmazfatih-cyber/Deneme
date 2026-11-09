"""Veri modeli: olay, karar ağacı, karar ve bağ.

Olay   = bir KAP bildirimi, bir gündem haberi ya da bir makro veri açıklaması.
Ağaç   = olay türüne özgü karar noktaları (düğümler) ve sonuçlar (yapraklar).
Karar  = bir olayın ağaçta izlediği yol + vardığı sonuç.
Bağ    = iki olay arasındaki ilişki (tetikler, girdi, güçlendirir, zayıflatır, ardıl, aynı tema).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

Kaynak = Literal["kap", "gundem", "makro", "kuresel"]
Kapsam = Literal["sirket", "sektor", "yerel_makro", "kuresel"]
Egilim = Literal["olumlu", "olumsuz", "notr", "karisik", "belirsiz"]
Iliski = Literal["tetikler", "girdi", "guclendirir", "zayiflatir", "ardil", "ayni_tema", "aciklar"]


@dataclass
class Olay:
    kod: str  # kararlı anahtar, ör. "2026-02-28-iran-savasi" ya da "KAP-1633957"
    tarih: str  # YYYY-MM-DD (kamuya açıldığı gün)
    kaynak: Kaynak
    kapsam: Kapsam
    tur: str  # karar ağacı türü (agaclar.AGACLAR anahtarı)
    baslik: str
    ozet: str = ""
    hisse: str | None = None
    sektor: str | None = None
    yon: Egilim = "notr"  # haberin ilk bakışta yönü (karar ağacı sonucu ayrıca hesaplanır)
    parametreler: dict[str, Any] = field(default_factory=dict)  # ağacın soracağı değerler
    etiketler: list[str] = field(default_factory=list)
    kaynaklar: list[str] = field(default_factory=list)  # URL'ler
    bagli: list[dict[str, str]] = field(default_factory=list)  # [{"kod": ..., "iliski": ..., "aciklama": ...}]
    guven: float = 0.7
    id: int | None = None


@dataclass
class Adim:
    dugum: str
    soru: str
    deger: Any
    secilen: str  # dal etiketi


@dataclass
class Karar:
    tur: str
    agac_adi: str
    yol: list[Adim]
    sonuc_kodu: str
    sonuc: str
    egilim: Egilim
    eylem: str
    gerekce: str
    izlenecek: list[str]
    etkilenen: list[str]
    eksik: list[str]  # bilinmeyen parametreler; verilirse karar netleşir
    guven: float


@dataclass
class Bag:
    kaynak_kod: str
    hedef_kod: str
    iliski: Iliski
    aciklama: str
    agirlik: float = 0.5
    otomatik: bool = True


SEMA_SQL = """
CREATE TABLE IF NOT EXISTS olaylar (
    id INTEGER PRIMARY KEY,
    kod TEXT NOT NULL UNIQUE,
    tarih TEXT NOT NULL,
    kaynak TEXT NOT NULL,
    kapsam TEXT NOT NULL,
    tur TEXT NOT NULL,
    hisse TEXT,
    sektor TEXT,
    baslik TEXT NOT NULL,
    ozet TEXT NOT NULL DEFAULT '',
    yon TEXT NOT NULL DEFAULT 'notr',
    parametreler TEXT NOT NULL DEFAULT '{}',
    etiketler TEXT NOT NULL DEFAULT '[]',
    kaynaklar TEXT NOT NULL DEFAULT '[]',
    guven REAL NOT NULL DEFAULT 0.7,
    eklenme TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS olaylar_tarih ON olaylar (tarih);
CREATE INDEX IF NOT EXISTS olaylar_tur ON olaylar (tur, tarih);
CREATE INDEX IF NOT EXISTS olaylar_hisse ON olaylar (hisse, tarih);

CREATE TABLE IF NOT EXISTS agaclar (
    tur TEXT PRIMARY KEY,
    ad TEXT NOT NULL,
    kapsam TEXT NOT NULL,
    kap_turu TEXT,
    tanim TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS kararlar (
    id INTEGER PRIMARY KEY,
    olay_id INTEGER NOT NULL REFERENCES olaylar(id) ON DELETE CASCADE,
    tur TEXT NOT NULL,
    yol TEXT NOT NULL,
    sonuc_kodu TEXT NOT NULL,
    sonuc TEXT NOT NULL,
    egilim TEXT NOT NULL,
    eylem TEXT NOT NULL,
    gerekce TEXT NOT NULL,
    izlenecek TEXT NOT NULL,
    etkilenen TEXT NOT NULL,
    eksik TEXT NOT NULL,
    guven REAL NOT NULL,
    hesaplanma TEXT NOT NULL,
    UNIQUE (olay_id)
);

CREATE TABLE IF NOT EXISTS baglar (
    id INTEGER PRIMARY KEY,
    kaynak_id INTEGER NOT NULL REFERENCES olaylar(id) ON DELETE CASCADE,
    hedef_id INTEGER NOT NULL REFERENCES olaylar(id) ON DELETE CASCADE,
    iliski TEXT NOT NULL,
    aciklama TEXT NOT NULL DEFAULT '',
    agirlik REAL NOT NULL DEFAULT 0.5,
    otomatik INTEGER NOT NULL DEFAULT 1,
    UNIQUE (kaynak_id, hedef_id, iliski)
);
CREATE INDEX IF NOT EXISTS baglar_kaynak ON baglar (kaynak_id);
CREATE INDEX IF NOT EXISTS baglar_hedef ON baglar (hedef_id);
"""

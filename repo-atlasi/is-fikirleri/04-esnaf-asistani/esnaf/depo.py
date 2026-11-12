"""sqlite3 depolama: kişiler, randevular, sohbet oturumları, insan devri talepleri.

Veri azaltma ilkesi: mesaj metinleri saklanmaz. Tek istisna, müşterinin yetkiliye iletilmesini
istediği mesajdır (devir): talep kapatılınca satır tamamen silinir, açık kalan talep de
devir_saklama_gun sonunda temizle() ile silinir. Tarihler yerel saatle ISO metni olarak saklanır.
"""

from __future__ import annotations

import json
import sqlite3
import threading
from collections.abc import Callable
from datetime import datetime, timedelta
from pathlib import Path
from typing import TypeVar

from .slotlar import Dolu

T = TypeVar("T")

SEMA = """
CREATE TABLE IF NOT EXISTS kisiler (
    sohbet_id INTEGER PRIMARY KEY, ad TEXT, aydinlatma TEXT, son_gorulme TEXT);
CREATE TABLE IF NOT EXISTS randevular (
    id INTEGER PRIMARY KEY AUTOINCREMENT, sohbet_id INTEGER NOT NULL, hizmet TEXT NOT NULL,
    kaynak TEXT NOT NULL, baslangic TEXT NOT NULL, bitis TEXT NOT NULL,
    durum TEXT NOT NULL DEFAULT 'aktif', olusturma TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS randevu_zaman ON randevular (durum, baslangic);
CREATE TABLE IF NOT EXISTS oturumlar (
    sohbet_id INTEGER PRIMARY KEY, durum TEXT NOT NULL, veri TEXT NOT NULL, guncelleme TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS devirler (
    id INTEGER PRIMARY KEY AUTOINCREMENT, sohbet_id INTEGER NOT NULL, mesaj TEXT NOT NULL,
    durum TEXT NOT NULL DEFAULT 'acik', olusturma TEXT NOT NULL);
"""


class SlotDolu(Exception):
    """Rezervasyon anında saat başka biri tarafından alınmış."""


class OturumBulunamadi(Exception):
    """Onay oturumu yok: aynı onay başka bir istekte zaten işlenmiş (çift gönderim, yeniden teslim)."""


class MusteriSiniri(Exception):
    """Müşteri sınırı: args[0] 'cakisma' (aynı saatte kendi randevusu var) ya da 'azami' (çok fazla randevu)."""


def _iso(an: datetime) -> str:
    return an.isoformat(timespec="minutes")


class Depo:
    def __init__(self, yol: str = ":memory:", salt_okunur: bool = False) -> None:
        # Webhook sunucusu iş parçacıklı çalışır: tek bağlantı + kilit, açık işlem (BEGIN) yönetimi.
        # salt_okunur: beceri/ajan çağrıları için; sqlite dosyası "mode=ro" ile açılır, yazma denemesi hata verir.
        if salt_okunur:
            hedef, uri = Path(yol).resolve().as_uri() + "?mode=ro", True
        else:
            hedef, uri = yol, False
        self._bag = sqlite3.connect(hedef, uri=uri, isolation_level=None, check_same_thread=False, timeout=5.0)
        self._bag.row_factory = sqlite3.Row
        self._kilit = threading.RLock()
        if not salt_okunur:
            # Silinen satırlar dosyanın boş sayfalarında okunabilir kalmasın (KVKK silme talebi gerçekten silsin).
            self._bag.execute("PRAGMA secure_delete = ON")
            self._bag.executescript(SEMA)

    def kapat(self) -> None:
        with self._kilit:
            self._bag.close()

    def _sorgu(self, sql: str, *param: object) -> list[sqlite3.Row]:
        with self._kilit:
            return self._bag.execute(sql, param).fetchall()

    def _islem(self, govde: Callable[[], T]) -> T:
        """BEGIN IMMEDIATE ... COMMIT; hata olursa ROLLBACK (bağlantı yarım işlemde kalmasın)."""
        with self._kilit:
            self._bag.execute("BEGIN IMMEDIATE")
            try:
                sonuc = govde()
                self._bag.execute("COMMIT")
                return sonuc
            except BaseException:
                self._bag.execute("ROLLBACK")
                raise

    # --- kişiler ve KVKK ---
    def gorulme_kaydet(self, sohbet_id: int, ad: str, an: datetime) -> bool:
        """Kişiyi kaydeder; aydınlatma metni daha önce gösterilmediyse False döndürür ve gösterildi işaretler."""
        with self._kilit:
            satir = self._bag.execute("SELECT aydinlatma FROM kisiler WHERE sohbet_id = ?", (sohbet_id,)).fetchone()
            self._bag.execute(
                "INSERT INTO kisiler (sohbet_id, ad, aydinlatma, son_gorulme) VALUES (?, ?, ?, ?) "
                "ON CONFLICT(sohbet_id) DO UPDATE SET son_gorulme = excluded.son_gorulme",
                (sohbet_id, ad[:40], _iso(an), _iso(an)),
            )
            return satir is not None

    def kisi_verilerini_sil(self, sohbet_id: int) -> dict[str, int]:
        """KVKK md. 7 ve 11: kişinin bot tarafından tutulan tüm kayıtlarını siler."""

        def sil() -> dict[str, int]:
            return {
                tablo: self._bag.execute(f"DELETE FROM {tablo} WHERE sohbet_id = ?", (sohbet_id,)).rowcount
                for tablo in ("randevular", "oturumlar", "devirler", "kisiler")
            }

        return self._islem(sil)

    def temizle(self, gun: int, simdi: datetime, devir_gun: int = 30) -> dict[str, int]:
        """Saklama süresi dolan kayıtları siler (geçmiş randevular, eski devir talepleri, bayat oturumlar).

        Bot (yoklama/webhook) bunu açılışta ve günde bir kendiliğinden çağırır; cron gerekmez.
        """
        sinir = _iso(simdi - timedelta(days=gun))

        def sil() -> dict[str, int]:
            return {
                "randevular": self._bag.execute("DELETE FROM randevular WHERE bitis < ?", (sinir,)).rowcount,
                "devirler": self._bag.execute(
                    "DELETE FROM devirler WHERE olusturma < ?", (_iso(simdi - timedelta(days=devir_gun)),)
                ).rowcount,
                "oturumlar": self._bag.execute(
                    "DELETE FROM oturumlar WHERE guncelleme < ?", (_iso(simdi - timedelta(days=1)),)
                ).rowcount,
                "kisiler": self._bag.execute(
                    "DELETE FROM kisiler WHERE son_gorulme < ? AND sohbet_id NOT IN "
                    "(SELECT sohbet_id FROM randevular WHERE durum = 'aktif') AND sohbet_id NOT IN "
                    "(SELECT sohbet_id FROM devirler)",
                    (sinir,),
                ).rowcount,
            }

        return self._islem(sil)

    # --- randevular ---
    def _dolu(self, haric_id: int | None = None) -> list[Dolu]:
        satirlar = self._bag.execute(
            "SELECT id, kaynak, baslangic, bitis FROM randevular WHERE durum = 'aktif'"
        ).fetchall()
        return [
            Dolu(s["kaynak"], datetime.fromisoformat(s["baslangic"]), datetime.fromisoformat(s["bitis"]))
            for s in satirlar
            if s["id"] != haric_id
        ]

    def dolu_araliklar(self, haric_id: int | None = None) -> list[Dolu]:
        with self._kilit:
            return self._dolu(haric_id)

    def randevu_ekle(
        self,
        sohbet_id: int,
        hizmet_kodu: str,
        bas: datetime,
        bit: datetime,
        kaynak_sec: Callable[[list[Dolu]], str | None],
        an: datetime,
        iptal_edilecek: int | None = None,
        azami: int | None = None,
        oturum_durumu: str | None = None,
    ) -> tuple[int, str]:
        """Çakışmayı işlem (transaction) içinde yeniden denetleyip randevu ekler; değişiklikte eskiyi iptal eder.

        oturum_durumu verilirse o onay oturumu aynı işlemde tüketilir: aynı "evet" iki kez gelirse
        (çift gönderim, eşzamanlı istek) ikincisi OturumBulunamadi alır, ikinci randevu yazılmaz.
        azami: müşterinin (değiştirilen hariç) en fazla kaç aktif, bitmemiş randevusu olabilir.
        """

        def ekle() -> tuple[int, str]:
            if oturum_durumu is not None:
                silinen = self._bag.execute(
                    "DELETE FROM oturumlar WHERE sohbet_id = ? AND durum = ?", (sohbet_id, oturum_durumu)
                ).rowcount
                if silinen != 1:
                    raise OturumBulunamadi()
            satirlar = self._bag.execute(
                "SELECT id, baslangic, bitis FROM randevular "
                "WHERE sohbet_id = ? AND durum = 'aktif' AND bitis > ?",
                (sohbet_id, _iso(an)),
            ).fetchall()
            kendi = [
                (datetime.fromisoformat(s["baslangic"]), datetime.fromisoformat(s["bitis"]))
                for s in satirlar
                if s["id"] != iptal_edilecek
            ]
            if any(k_bas < bit and bas < k_bit for k_bas, k_bit in kendi):
                raise MusteriSiniri("cakisma")
            if azami is not None and len(kendi) >= azami:
                raise MusteriSiniri("azami")
            kaynak = kaynak_sec(self._dolu(iptal_edilecek))
            if kaynak is None:
                raise SlotDolu()
            imlec = self._bag.execute(
                "INSERT INTO randevular (sohbet_id, hizmet, kaynak, baslangic, bitis, olusturma) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (sohbet_id, hizmet_kodu, kaynak, _iso(bas), _iso(bit), _iso(an)),
            )
            if iptal_edilecek is not None:
                self._bag.execute(
                    "UPDATE randevular SET durum = 'iptal' WHERE id = ? AND sohbet_id = ?",
                    (iptal_edilecek, sohbet_id),
                )
            return int(imlec.lastrowid), kaynak

        return self._islem(ekle)

    def randevu_iptal(self, randevu_id: int, sohbet_id: int | None = None) -> sqlite3.Row | None:
        """Aktif randevuyu iptal eder ve satırını döndürür (bildirim için); yoksa None.

        sohbet_id verilirse müşteri yalnız kendi randevusunu iptal edebilir.
        """
        sql = "SELECT * FROM randevular WHERE id = ? AND durum = 'aktif'"
        param: tuple[object, ...] = (randevu_id,)
        if sohbet_id is not None:
            sql += " AND sohbet_id = ?"
            param += (sohbet_id,)

        def iptal() -> sqlite3.Row | None:
            satir = self._bag.execute(sql, param).fetchone()
            if satir is not None:
                self._bag.execute("UPDATE randevular SET durum = 'iptal' WHERE id = ?", (randevu_id,))
            return satir

        return self._islem(iptal)

    def randevu_getir(self, randevu_id: int, sohbet_id: int) -> sqlite3.Row | None:
        satirlar = self._sorgu(
            "SELECT * FROM randevular WHERE id = ? AND sohbet_id = ? AND durum = 'aktif'", randevu_id, sohbet_id
        )
        return satirlar[0] if satirlar else None

    def kisinin_randevulari(self, sohbet_id: int, simdi: datetime) -> list[sqlite3.Row]:
        return self._sorgu(
            "SELECT * FROM randevular WHERE sohbet_id = ? AND durum = 'aktif' AND baslangic >= ? ORDER BY baslangic",
            sohbet_id,
            _iso(simdi),
        )

    def gunun_randevulari(self, gun: str) -> list[sqlite3.Row]:
        return self._sorgu(
            "SELECT r.*, k.ad FROM randevular r LEFT JOIN kisiler k USING (sohbet_id) "
            "WHERE r.durum = 'aktif' AND substr(r.baslangic, 1, 10) = ? ORDER BY r.baslangic",
            gun,
        )

    # --- sohbet oturumu (çok adımlı akışlar) ---
    def oturum_al(self, sohbet_id: int, en_eski: datetime | None = None) -> tuple[str, dict] | None:
        """Yarım kalmış akışı döndürür; en_eski'den eski oturumlar bayat sayılıp silinir."""
        satir = self._sorgu("SELECT durum, veri, guncelleme FROM oturumlar WHERE sohbet_id = ?", sohbet_id)
        if not satir:
            return None
        if en_eski and satir[0]["guncelleme"] < _iso(en_eski):
            self.oturum_sil(sohbet_id)
            return None
        return satir[0]["durum"], json.loads(satir[0]["veri"])

    def oturum_yaz(self, sohbet_id: int, durum: str, veri: dict, an: datetime) -> None:
        with self._kilit:
            self._bag.execute(
                "INSERT OR REPLACE INTO oturumlar (sohbet_id, durum, veri, guncelleme) VALUES (?, ?, ?, ?)",
                (sohbet_id, durum, json.dumps(veri, ensure_ascii=False), _iso(an)),
            )

    def oturum_sil(self, sohbet_id: int) -> None:
        with self._kilit:
            self._bag.execute("DELETE FROM oturumlar WHERE sohbet_id = ?", (sohbet_id,))

    # --- insan devri ---
    def devir_ekle(self, sohbet_id: int, mesaj: str, an: datetime) -> int:
        with self._kilit:
            imlec = self._bag.execute(
                "INSERT INTO devirler (sohbet_id, mesaj, olusturma) VALUES (?, ?, ?)",
                (sohbet_id, mesaj[:500], _iso(an)),
            )
            return int(imlec.lastrowid)

    def devir_getir(self, devir_id: int) -> sqlite3.Row | None:
        satirlar = self._sorgu("SELECT * FROM devirler WHERE id = ? AND durum = 'acik'", devir_id)
        return satirlar[0] if satirlar else None

    def acik_devirler(self) -> list[sqlite3.Row]:
        return self._sorgu(
            "SELECT d.*, k.ad FROM devirler d LEFT JOIN kisiler k USING (sohbet_id) "
            "WHERE d.durum = 'acik' ORDER BY d.id"
        )

    def devir_kapat(self, devir_id: int) -> bool:
        """Talebi kapatır: satır (mesaj metniyle birlikte) silinir; "yanıtlanana kadar tutulur" sözü böyle tutulur."""
        with self._kilit:
            return self._bag.execute("DELETE FROM devirler WHERE id = ?", (devir_id,)).rowcount == 1

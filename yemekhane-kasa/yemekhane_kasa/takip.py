"""Tepsi takibi: aynı tepsiyi iki kez fiyatlandırmamak ve iki müşteriyi birbirine karıştırmamak.

`BosTezgahDedektoru` boş tezgâhın imzasını tutar (kalibrasyonla ya da tanıyıcı "tepsi yok" dediğinde öğrenilir) ve
her yoklamada tezgâhın boş olup olmadığını yerel olarak, ücretsiz söyler.

`TepsiTakipci` durum makinesidir:
- Tezgâh boş görülünce açık sipariş kapanır; sonra gelen her tepsi YENİ siparişdir (içerik aynı olsa bile).
- Tepsi duruyorsa ve görüntü son tanımadan beri değişmediyse yapay zekâ çağrılmaz (AYNI).
- Görüntü değiştiyse yeniden tanınır: yemekler aynıysa hiçbir şey gönderilmez; farklıysa aynı sipariş numarasıyla
  GÜNCELLEME (revizyon + 1) gönderilir. Tezgâh boş görülmeden görüntünün büyük kısmı değiştiyse ve yemekler de
  farklıysa tepsi değişmiş sayılır: eski sipariş kapanır, yeni sipariş açılır.
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from pathlib import Path

import numpy as np

from yemekhane_kasa.ayarlar import EsikAyari
from yemekhane_kasa.fiyat import Adisyon
from yemekhane_kasa.goruntu import IMZA_BOYUTU, Bolge, fark_orani

log = logging.getLogger(__name__)


class BosTezgahDedektoru:
    def __init__(self, esikler: EsikAyari) -> None:
        self.esik = esikler
        self.arka_plan: np.ndarray | None = None

    @property
    def hazir(self) -> bool:
        return self.arka_plan is not None

    def fark(self, imza: np.ndarray) -> float:
        if self.arka_plan is None:
            return 1.0
        return fark_orani(imza, self.arka_plan, self.esik.hucre_esigi)

    def bos_mu(self, imza: np.ndarray) -> bool:
        return self.arka_plan is not None and self.fark(imza) < self.esik.bos

    def uyarla(self, imza: np.ndarray) -> None:
        """Boş tezgâh imzasını yavaşça güncel görüntüye yaklaştırır (gün içindeki ışık değişimi)."""
        if self.arka_plan is not None:
            oran = self.esik.arka_plan_uyum
            self.arka_plan = ((1 - oran) * self.arka_plan + oran * imza).astype(np.float32)

    def ogren(self, imza: np.ndarray) -> None:
        self.arka_plan = imza.astype(np.float32).copy()

    def kaydet(self, yol: Path, bolge: Bolge | None, gurultu: float | None = None) -> None:
        if self.arka_plan is None:
            return
        yol.parent.mkdir(parents=True, exist_ok=True)
        veri = {
            "surum": 1,
            "bolge": list(bolge) if bolge else None,
            "olusturma": datetime.now().astimezone().isoformat(timespec="seconds"),
            "gurultu": gurultu,
            "imza": np.round(self.arka_plan, 2).tolist(),
        }
        gecici = yol.with_name(yol.name + ".tmp")
        gecici.write_text(json.dumps(veri), encoding="utf-8")
        os.replace(gecici, yol)

    def yukle(self, yol: Path, bolge: Bolge | None) -> bool:
        if not yol.is_file():
            return False
        try:
            veri = json.loads(yol.read_text(encoding="utf-8"))
            imza = np.asarray(veri["imza"], dtype=np.float32)
            kayitli_bolge = tuple(veri["bolge"]) if veri.get("bolge") else None
        except (OSError, ValueError, KeyError, TypeError) as e:
            log.warning("kalibrasyon okunamadı (%s): %s", yol, e)
            return False
        if imza.shape != (IMZA_BOYUTU[1], IMZA_BOYUTU[0]):
            log.warning("kalibrasyon başka bir sürüme ait (%s); yeniden kalibre edin", yol)
            return False
        if kayitli_bolge != (tuple(bolge) if bolge else None):
            log.warning("kamera bölgesi kalibrasyondan sonra değişmiş; 'kalibre' komutunu yeniden çalıştırın")
            return False
        self.arka_plan = imza
        return True


class Karar(Enum):
    AYNI = "ayni"  # tepsi duruyor, görüntü değişmedi: yapay zekâ çağrılmaz
    TANI = "tani"  # yeni ya da değişmiş görüntü: tanınmalı


@dataclass
class Siparis:
    no: str
    revizyon: int
    islem: str  # "yeni" | "guncelle"
    zaman: datetime
    adisyon: Adisyon


class TepsiTakipci:
    def __init__(self, esikler: EsikAyari) -> None:
        self.esik = esikler
        self.tepsi_var = False
        self.son_imza: np.ndarray | None = None  # son başarılı tanımadaki imza
        self.aktif: Siparis | None = None
        self._sayac = 0

    def bos_goruldu(self) -> Siparis | None:
        """Tezgâh boş: açık sipariş (varsa) kapanır ve döndürülür."""
        kapanan = self.aktif
        self.tepsi_var = False
        self.son_imza = None
        self.aktif = None
        return kapanan

    def karar(self, imza: np.ndarray) -> Karar:
        if (
            self.tepsi_var
            and self.son_imza is not None
            and fark_orani(imza, self.son_imza, self.esik.hucre_esigi) < self.esik.ayni_tepsi
        ):
            return Karar.AYNI
        return Karar.TANI

    def sonuc_isle(self, adisyon: Adisyon, imza: np.ndarray, simdi: datetime) -> tuple[Siparis | None, Siparis | None]:
        """Tanıyıcı tepsi gördü. Döner: (gönderilecek sipariş ya da None, bu yüzden kapanan eski sipariş ya da None)."""
        onceki_imza = self.son_imza
        self.tepsi_var = True
        self.son_imza = imza
        if adisyon.bos and not adisyon.taninmayanlar:
            if self.aktif is not None:
                log.warning("tepside yemek görülmedi ama açık sipariş var (%s); sipariş korunuyor", self.aktif.no)
            return None, None
        kapanan = None
        if self.aktif is not None:
            if adisyon.kalem_imzasi() == self.aktif.adisyon.kalem_imzasi():
                return None, None
            buyuk = onceki_imza is not None and (
                fark_orani(imza, onceki_imza, self.esik.hucre_esigi) >= self.esik.yeni_tepsi
            )
            if not buyuk:
                self.aktif = Siparis(self.aktif.no, self.aktif.revizyon + 1, "guncelle", simdi, adisyon)
                return self.aktif, None
            kapanan = self.aktif
        self._sayac += 1
        self.aktif = Siparis(f"{simdi:%Y%m%d-%H%M%S}-{self._sayac % 1000:03d}", 1, "yeni", simdi, adisyon)
        return self.aktif, kapanan

"""Servis döngüsü: kamera → tepsi bölgesi → boşluk/hareket denetimi → (3–4 sn'de bir) tanıma → fiyat → POS.

Her yoklamada (varsayılan 0,3 sn) yerel ve ücretsiz iki denetim yapılır:
- Tezgâh boş mu? (boş tezgâh imzasıyla) → boşsa açık sipariş kapanır, sonraki tepsi hemen tanınır.
- Görüntü sabit mi? (bir önceki yoklamayla) → tepsi kayarken çekim yapılmaz; en çok bir aralık kadar ertelenir.
Fiyatlandırma çekimi tepsi durdukça `cekim_araligi_sn`de bir yapılır; görüntü değişmediyse yapay zekâ çağrılmaz,
yemekler değişmediyse POS'a bir şey gitmez. POS'a ulaşılamazsa tepsi kasada durdukça her çekimde yeniden denenir.
"""

from __future__ import annotations

import logging
import os
import threading
import time
from collections import Counter
from collections.abc import Callable
from datetime import datetime
from typing import Any

import numpy as np

from yemekhane_kasa.ayarlar import Ayarlar
from yemekhane_kasa.fiyat import fiyatlandir
from yemekhane_kasa.goruntu import bolge_kirp, fark_orani, imza_cikar
from yemekhane_kasa.kamera import Kare, Kaynak, kaynak_olustur
from yemekhane_kasa.kayit import Kayitci
from yemekhane_kasa.menu import MenuHatasi, MenuIzleyici
from yemekhane_kasa.pos import PosAdaptoru, anahtar, kapanis_mesaji, mesaj_olustur, pos_olustur
from yemekhane_kasa.takip import BosTezgahDedektoru, Karar, Siparis, TepsiTakipci
from yemekhane_kasa.tanima import Taniyici, taniyici_olustur

log = logging.getLogger(__name__)


def _simdi() -> datetime:
    return datetime.now().astimezone()


class Servis:
    def __init__(
        self,
        ayarlar: Ayarlar,
        menuler: MenuIzleyici,
        kaynak: Kaynak,
        taniyici: Taniyici,
        pos: PosAdaptoru,
        kayitci: Kayitci,
        dedektor: BosTezgahDedektoru,
        simdi: Callable[[], datetime] = _simdi,
    ) -> None:
        self.ayar = ayarlar
        self.menuler = menuler
        self.kaynak = kaynak
        self.taniyici = taniyici
        self.pos = pos
        self.kayitci = kayitci
        self.dedektor = dedektor
        self.takipci = TepsiTakipci(ayarlar.esikler)
        self.sayac: Counter[str] = Counter()
        self._simdi = simdi
        self._kalibrasyon_yolu = ayarlar.yol(ayarlar.kalibrasyon) / "arka_plan.json"
        self._onceki_imza: np.ndarray | None = None
        self._sonraki_cekim: float | None = None  # None: tezgâh boştu, ilk sabit karede hemen çek
        self._erteleme_basi: float | None = None  # çekim zamanı geldiği hâlde görüntü sabit değil
        self._son_mesaj: dict[str, Any] | None = None  # açık siparişin POS'a giden son mesajı
        self._bekleyen: dict[str, Any] | None = None  # POS'a ulaştırılamamış son mesaj

    # --- yoklama ---

    def adim(self, kare: Kare) -> None:
        """Bir yoklama: boşluk ve hareket denetimi; zamanı geldiyse fiyatlandırma çekimi."""
        kamera, esik = self.ayar.kamera, self.ayar.esikler
        bolge = bolge_kirp(kare.goruntu, kamera.bolge)
        imza = imza_cikar(bolge)
        sabit = self._onceki_imza is not None and fark_orani(imza, self._onceki_imza, esik.hucre_esigi) < esik.hareket
        self._onceki_imza = imza

        if self.dedektor.bos_mu(imza):
            if sabit:
                self.dedektor.uyarla(imza)
            self._tepsi_gitti()
            return
        if self._sonraki_cekim is None:
            self._sonraki_cekim = kare.an
        if kare.an < self._sonraki_cekim:
            return
        if not sabit:
            if self._erteleme_basi is None:
                self._erteleme_basi = kare.an
            if kare.an - self._erteleme_basi < kamera.cekim_araligi_sn:
                return  # tepsi hareket ediyor; bir sonraki yoklamada yeniden bakılır
        self._erteleme_basi = None
        self._sonraki_cekim = kare.an + kamera.cekim_araligi_sn
        self._cekim(Kare(bolge, kare.an, kare.kaynak), imza)

    def _cekim(self, kare: Kare, imza: np.ndarray) -> None:
        self.sayac["cekim"] += 1
        if self._bekleyen is not None:
            self._gonder(self._bekleyen, tekrar=True)
        if self.takipci.karar(imza) is Karar.AYNI:
            if self.ayar.pos.surekli_gonder and self._son_mesaj is not None and self._bekleyen is None:
                self._gonder(self._son_mesaj, tekrar=True)
            return
        try:
            menu = self.menuler.guncel()
        except MenuHatasi as e:
            log.error("%s", e)
            return

        sonuc = self.taniyici.tani(kare, menu)
        self.sayac["tanima"] += 1
        for ad, deger in sonuc.kullanim.items():
            self.sayac[ad] += deger
        self.kayitci.olay("tanima", sonuc.ozet())
        if sonuc.hata:
            self.sayac["tanima_hatasi"] += 1
            log.warning("tanıma başarısız: %s", sonuc.hata)
            return
        if not sonuc.tepsi_var:
            self.dedektor.ogren(imza)
            self._dedektoru_kaydet()
            self._tepsi_gitti()
            return

        adisyon = fiyatlandir(menu, sonuc.kalemler, self.ayar.tanima.en_dusuk_guven, sonuc.taninmayanlar)
        if sonuc.not_:
            adisyon.uyarilar.append(f"Not: {sonuc.not_}")
        siparis, kapanan = self.takipci.sonuc_isle(adisyon, imza, self._simdi())
        if kapanan is not None:
            self._kapat(kapanan)
        if siparis is None:
            return
        gorsel = self.kayitci.gorsel_yaz(siparis.no, siparis.revizyon, kare.goruntu)
        self._gonder(mesaj_olustur(siparis, self.ayar.pos.kasa_adi, gorsel))

    # --- gönderim ve kapanış ---

    def _gonder(self, mesaj: dict[str, Any], tekrar: bool = False) -> None:
        sonuc = self.pos.gonder(mesaj)
        self.sayac["gonderim" if sonuc.basarili else "gonderim_hatasi"] += 1
        olay: dict[str, Any] = {
            "anahtar": anahtar(mesaj),
            "islem": mesaj["islem"],
            "basarili": sonuc.basarili,
            "ayrinti": sonuc.ayrinti,
            "deneme": sonuc.deneme,
            "tekrar": tekrar,
        }
        if not tekrar:
            olay["mesaj"] = mesaj
        self.kayitci.olay("gonderim", olay)
        if mesaj["islem"] == "kapandi":
            return
        self._son_mesaj = mesaj
        if sonuc.basarili:
            if not tekrar:
                kontrol = " | KONTROL: " + "; ".join(mesaj["kontrol_nedenleri"]) if mesaj["kontrol_gerekli"] else ""
                log.info("POS ← %s %s: %s%s", mesaj["islem"], anahtar(mesaj), mesaj["toplam_metin"], kontrol)
            elif self._bekleyen is mesaj:
                log.info("POS'a sonunda iletildi: %s", anahtar(mesaj))
            self._bekleyen = None
        else:
            log.warning("POS'a iletilemedi (%s): %s — tepsi durdukça yeniden denenecek", anahtar(mesaj), sonuc.ayrinti)
            self._bekleyen = mesaj

    def _tepsi_gitti(self) -> None:
        self._sonraki_cekim = None
        self._erteleme_basi = None
        kapanan = self.takipci.bos_goruldu()
        if kapanan is not None:
            self._kapat(kapanan)

    def _kapat(self, kapanan: Siparis) -> None:
        if self._bekleyen is not None and self._bekleyen["siparis_no"] == kapanan.no:
            log.error("tepsi ayrıldı ama %s POS'a iletilemedi; kasiyer elle girmeli", anahtar(self._bekleyen))
            self.kayitci.olay("iletilemedi", {"anahtar": anahtar(self._bekleyen)})
            self.sayac["iletilemedi"] += 1
            self._bekleyen = None
        elif self.ayar.pos.kapanis_bildir:
            zaman = self._simdi().isoformat(timespec="seconds")
            self._gonder(kapanis_mesaji(kapanan, self.ayar.pos.kasa_adi, zaman))
        if self._son_mesaj is not None and self._son_mesaj["siparis_no"] == kapanan.no:
            self._son_mesaj = None
        self.kayitci.olay("tepsi_gitti", {"siparis_no": kapanan.no, "revizyon": kapanan.revizyon})

    def _dedektoru_kaydet(self) -> None:
        try:
            self.dedektor.kaydet(self._kalibrasyon_yolu, self.ayar.kamera.bolge)
        except OSError as e:
            log.warning("boş tezgâh imzası kaydedilemedi: %s", e)

    # --- döngü ---

    def calistir(
        self,
        durdur: threading.Event | None = None,
        saat: Callable[[], float] = time.monotonic,
        uyku: Callable[[float], Any] | None = None,
    ) -> None:
        durdur = durdur or threading.Event()
        bekle = uyku or durdur.wait
        self.kaynak.ac()
        log.info(
            "başladı | çekim aralığı %.1f sn | tanıma: %s | POS: %s",
            self.ayar.kamera.cekim_araligi_sn,
            self.ayar.tanima.model if self.ayar.tanima.tur == "claude" else self.ayar.tanima.tur,
            self.ayar.pos.adres if self.ayar.pos.tur == "http" else self.ayar.pos.tur,
        )
        try:
            while not durdur.is_set():
                basla = saat()
                kare = self.kaynak.son_kare()
                if kare is not None:
                    self.adim(kare)
                elif self.kaynak.bitti:
                    log.info("görüntü kaynağı bitti")
                    break
                kalan = self.ayar.kamera.yoklama_sn - (saat() - basla)
                if kalan > 0:
                    bekle(kalan)
        finally:
            self.kaynak.kapat()
            if self.dedektor.hazir:
                self._dedektoru_kaydet()
            log.info("durdu | %s", ", ".join(f"{ad}={sayi}" for ad, sayi in sorted(self.sayac.items())) or "-")


def servis_olustur(
    ayarlar: Ayarlar,
    *,
    kaynak: Kaynak | None = None,
    taniyici: Taniyici | None = None,
    pos: PosAdaptoru | None = None,
    simdi: Callable[[], datetime] = _simdi,
) -> Servis:
    menuler = MenuIzleyici(ayarlar.menu, ayarlar.temel)
    menuler.guncel()  # ilk yükleme: menü hatası servis başlamadan görünsün
    if taniyici is None and ayarlar.tanima.tur == "claude":
        if not (os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN")):
            log.warning("ANTHROPIC_API_KEY tanımlı değil; 'ant auth login' profili de yoksa tanıma çalışmaz")
    dedektor = BosTezgahDedektoru(ayarlar.esikler)
    if dedektor.yukle(ayarlar.yol(ayarlar.kalibrasyon) / "arka_plan.json", ayarlar.kamera.bolge):
        log.info("boş tezgâh kalibrasyonu yüklendi")
    else:
        log.info("kalibrasyon yok: boş tezgâh ilk 'tepsi yok' yanıtıyla öğrenilecek (önerilen: kalibre komutu)")
    return Servis(
        ayarlar,
        menuler,
        kaynak if kaynak is not None else kaynak_olustur(ayarlar.kamera, ayarlar.temel),
        taniyici if taniyici is not None else taniyici_olustur(ayarlar.tanima),
        pos if pos is not None else pos_olustur(ayarlar.pos, ayarlar.temel),
        Kayitci(ayarlar.kayit, ayarlar.yol(ayarlar.kayit.klasor), simdi),
        dedektor,
        simdi,
    )

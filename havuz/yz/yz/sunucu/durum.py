"""Sunucu durumu: ayarlar, sağlayıcı önbelleği, RAG dizini, API anahtarı denetimi.

Bir sunucu süreci boyunca tek `SunucuDurumu` vardır. Sağlayıcılar profil+model başına bir kez
kurulur ve yeniden kullanılır (bağlantı havuzu). RAG dizini `veri_dizini/dizin` klasöründe
kalıcıdır; belge yüklendikçe güncellenip kaydedilir.
Kim kullanır: sunucu/uygulama.py, sunucu/vekil.py.
Genişletme: testte gerçek model yerine `saglayici_fabrikasi` ile Sahte verin.
"""

from __future__ import annotations

import hmac
import os
import threading
from collections.abc import Callable, Mapping
from pathlib import Path

from fastapi import HTTPException, Request

from yz.ayar import Ayarlar
from yz.hatalar import VeriHatasi
from yz.metin import kucuk_ascii
from yz.rag.dizin import RagDizini
from yz.saglayici.kayit import saglayici_olustur
from yz.saglayici.taban import Saglayici

SaglayiciFabrikasi = Callable[[str | None, str | None], Saglayici]
ACIK_YOLLAR = frozenset({"/", "/sozluk.json", "/kayit.html", "/saglik"})


class SunucuDurumu:
    def __init__(
        self,
        ayarlar: Ayarlar,
        *,
        saglayici_fabrikasi: SaglayiciFabrikasi | None = None,
        dizin: RagDizini | None = None,
        ortam: Mapping[str, str] | None = None,
    ) -> None:
        self.ayarlar = ayarlar
        ortam = os.environ if ortam is None else ortam
        self.api_anahtari = ortam.get(ayarlar.sunucu.api_anahtari_ortam) or None
        self._fabrika = saglayici_fabrikasi or (
            lambda profil, model: saglayici_olustur(ayarlar, profil, model=model)
        )
        self._saglayicilar: dict[tuple[str | None, str | None], Saglayici] = {}
        self._kilit = threading.Lock()
        self.dizin_klasoru = ayarlar.veri_dizini / "dizin"
        self.dizin = dizin if dizin is not None else self._dizin_yukle()

    def _dizin_yukle(self) -> RagDizini:
        if (self.dizin_klasoru / "meta.json").is_file():
            try:
                return RagDizini.yukle(self.dizin_klasoru)
            except VeriHatasi:
                pass  # bozuk/uyumsuz dizin: boş başla (yeni yüklemeler üzerine yazar)
        return RagDizini()

    def saglayici(self, profil: str | None = None, model: str | None = None) -> Saglayici:
        anahtar = (profil or None, model or None)
        with self._kilit:
            if anahtar not in self._saglayicilar:
                self._saglayicilar[anahtar] = self._fabrika(*anahtar)
            return self._saglayicilar[anahtar]

    def profil_ve_model(self, ad: str | None) -> tuple[str | None, str | None]:
        """OpenAI `model` alanını (profil, model) çiftine çevirir.

        "profil" → o profil · "profil/model" → profilde model değişir · başka → varsayılan profilde
        o model adı.
        """
        if not ad:
            return None, None
        profiller = {*self.ayarlar.saglayicilar, "sahte"}
        if ad in profiller:
            return ad, None
        on, _, son = ad.partition("/")
        if son and on in profiller:
            return on, son
        return None, ad

    def dizini_kaydet(self) -> None:
        self.dizin.kaydet(self.dizin_klasoru)

    def kapat(self) -> None:
        for saglayici in self._saglayicilar.values():
            saglayici.kapat()


def anahtar_denetle(istek: Request) -> None:
    """API anahtarı tanımlıysa her istekte ister (Authorization: Bearer … ya da X-API-Key)."""
    durum: SunucuDurumu = istek.app.state.durum
    if durum.api_anahtari is None or istek.url.path in ACIK_YOLLAR:
        return
    gelen = istek.headers.get("x-api-key") or ""
    yetki = istek.headers.get("authorization") or ""
    if kucuk_ascii(yetki[:7]) == "bearer ":
        gelen = yetki[7:].strip()
    if not hmac.compare_digest(gelen.encode(), durum.api_anahtari.encode()):
        raise HTTPException(
            status_code=401,
            detail="API anahtarı eksik ya da yanlış. Authorization: Bearer <anahtar> başlığını gönderin.",
        )


def guvenli_dosya_adi(ad: str | None) -> str:
    """Yüklenen dosya adından yol parçalarını atar ("../../x.md" → "x.md")."""
    temiz = Path((ad or "belge.txt").replace("\\", "/")).name.strip()
    return temiz.lstrip(".") or "belge.txt"


def yerel_adres_mi(adres: str) -> bool:
    return adres in {"127.0.0.1", "localhost", "::1"}

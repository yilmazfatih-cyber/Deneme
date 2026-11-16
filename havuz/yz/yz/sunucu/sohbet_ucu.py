"""Arayüzün sohbet ucu: `POST /api/sohbet` → SSE olay akışı (kip: sohbet | rag | arac).

Olaylar (her biri `event:` adı + JSON `data:`):
    parca      {"metin": "…"}                       yanıt parçası (akış)
    arac       {"ad", "argumanlar", "sonuc", "hata"} ajanın bir araç adımı
    kaynaklar  {"kaynaklar": [{"numara", "ad", "metin"}]}
    son        {"yanit", "uyarilar", "atiflar", "belgede_yok", "kullanim", "model"}
    hata       {"ileti": "…"}
Maskeleme açıksa (yz.yaml sunucu.maskele) modele giden bütün metin maskelenir, yanıt açılır.
Kim kullanır: sunucu/uygulama.py; yz/web/index.html bu olayları dinler.
Genişletme: yeni kip → `_xxx_akisi(durum, istek)` yazıp `_KIPLER`'e ekleyin.
"""

from __future__ import annotations

import json
import queue
import threading
from collections.abc import Callable, Iterator
from typing import Any, Literal

from pydantic import BaseModel, Field

from yz.ajan.dongu import Adim, Ajan, AjanAyari
from yz.arac.hazir import belge_arama_araci, hesap_araci, zaman_araclari
from yz.arac.kutu import AracKutusu
from yz.arac.tanim import Arac, AracSonucu
from yz.guvenlik.maske import AkisMaskeAcici, MaskeOturumu, maskele, maskeyi_ac
from yz.hatalar import SaglayiciHatasi, YzHatasi
from yz.istem.butce import mesajlari_sigdir
from yz.metin import kirp
from yz.rag.yanit import RagHatti
from yz.saglayici.sse import sse_bicimle
from yz.saglayici.tipler import AracCagrisi, Kullanim, Mesaj
from yz.sunucu.durum import SunucuDurumu


class SohbetMesaji(BaseModel):
    rol: Literal["user", "assistant"]
    icerik: str = Field(max_length=50_000)


class SohbetIstegiGovdesi(BaseModel):
    mesajlar: list[SohbetMesaji] = Field(min_length=1, max_length=200)
    kip: Literal["sohbet", "rag", "arac"] = "sohbet"
    saglayici: str | None = None
    model: str | None = None


def olay(ad: str, veri: dict[str, Any]) -> str:
    return sse_bicimle(json.dumps(veri, ensure_ascii=False), olay=ad)


def _kullanim(k: Kullanim) -> dict[str, Any]:
    return {"girdi": k.girdi_belirteci, "cikti": k.cikti_belirteci, "tahmini": k.tahmini}


class _Baglam:
    def __init__(self, durum: SunucuDurumu, govde: SohbetIstegiGovdesi) -> None:
        self.durum = durum
        self.govde = govde
        self.saglayici = durum.saglayici(govde.saglayici, govde.model)
        self.oturum = MaskeOturumu()
        self.maske_acik = durum.ayarlar.sunucu.maskele

    def maskele(self, metin: str) -> str:
        return maskele(metin, self.oturum)[0] if self.maske_acik else metin

    def ac(self, metin: str) -> str:
        return maskeyi_ac(metin, self.oturum) if self.maske_acik else metin

    def mesajlar(self) -> list[Mesaj]:
        return [Mesaj(rol=m.rol, icerik=self.maskele(m.icerik)) for m in self.govde.mesajlar]


def _akit(
    b: _Baglam, mesajlar: list[Mesaj], azami_belirtec: int = 800
) -> Iterator[tuple[str, Any]]:
    """Modelden akışlı yanıt alır; ("parca", metin) ve sonda ("yanit", Yanit) üretir."""
    acici = AkisMaskeAcici(b.oturum)
    for p in b.saglayici.sohbet(mesajlar, akis=True, azami_belirtec=azami_belirtec):
        if p.son is not None:
            kalan = acici.bitir() if b.maske_acik else ""
            if kalan:
                yield "parca", kalan
            yield "yanit", p.son
        elif p.metin:
            acik = acici.besle(p.metin) if b.maske_acik else p.metin
            if acik:
                yield "parca", acik


def _sohbet_akisi(b: _Baglam) -> Iterator[str]:
    sistem = Mesaj.sistem("Kısa, doğru ve Türkçe yanıt veren bir yardımcısın.")
    mesajlar = mesajlari_sigdir([sistem, *b.mesajlar()], 3000)
    for tur, deger in _akit(b, mesajlar):
        if tur == "parca":
            yield olay("parca", {"metin": deger})
        else:
            yield olay("son", {"yanit": b.ac(deger.metin), "uyarilar": [], "atiflar": [], "belgede_yok": False,
                               "kullanim": _kullanim(deger.kullanim), "model": deger.model})  # fmt: skip


def _rag_akisi(b: _Baglam) -> Iterator[str]:
    soru = b.govde.mesajlar[-1].icerik
    hat = RagHatti(b.durum.dizin, b.saglayici)
    hazirlik = hat.hazirla(soru)
    kaynaklar = [{"numara": i, "ad": s.parca.goster(), "metin": kirp(s.parca.metin, 600)}
                 for i, s in enumerate(hazirlik.kaynaklar, start=1)]  # fmt: skip
    yield olay("kaynaklar", {"kaynaklar": kaynaklar})
    if hazirlik.erken_yanit is not None:
        sonuc = hazirlik.erken_yanit
        yield olay("parca", {"metin": sonuc.yanit})
        yield olay("son", {"yanit": sonuc.yanit, "uyarilar": sonuc.uyarilar, "atiflar": [], "belgede_yok": True,
                           "kullanim": _kullanim(sonuc.kullanim), "model": ""})  # fmt: skip
        return
    mesajlar = [m.model_copy(update={"icerik": b.maskele(m.icerik)}) for m in hazirlik.mesajlar]
    for tur, deger in _akit(b, mesajlar, 500):
        if tur == "parca":
            yield olay("parca", {"metin": deger})
            continue
        sonuc = hat.sonuclandir(hazirlik, b.ac(deger.metin), deger.kullanim)
        yield olay("son", {"yanit": sonuc.yanit, "uyarilar": sonuc.uyarilar, "atiflar": sonuc.atiflar,
                           "belgede_yok": sonuc.belgede_yok, "kullanim": _kullanim(sonuc.kullanim),
                           "model": deger.model})  # fmt: skip


class _MaskeliKutu(AracKutusu):
    """Araç çıktısını modele dönmeden önce maskeler (belge_ara'nın döndürdüğü belge parçası kişisel veri
    içerebilir; rag kipinde olduğu gibi bu kipte de modele maskeli gitmeli). Ekranda `ac` ile açılır."""

    def __init__(self, araclar: list[Arac], maske: Callable[[str], str]) -> None:
        super().__init__(araclar)
        self._maske = maske

    def cagir(self, cagri: AracCagrisi) -> AracSonucu:
        sonuc = super().cagir(cagri)
        return AracSonucu(self._maske(sonuc.icerik), sonuc.hata)


def _arac_akisi(b: _Baglam) -> Iterator[str]:
    kuyruk: queue.Queue[tuple[str, Any]] = queue.Queue()
    araclar = [hesap_araci, *zaman_araclari()]
    if len(b.durum.dizin):
        araclar.append(belge_arama_araci(b.durum.dizin))
    kutu = _MaskeliKutu(araclar, b.maskele)

    def adim_bildir(adim: Adim) -> None:
        if adim.tur == "arac":
            kuyruk.put(("arac", {"ad": adim.arac, "argumanlar": adim.argumanlar,
                                 "sonuc": b.ac(kirp(adim.icerik, 800)), "hata": adim.hata}))  # fmt: skip

    def calis() -> None:
        try:
            ajan = Ajan(b.saglayici, kutu, ayar=AjanAyari(azami_adim=6), olay=adim_bildir)
            kuyruk.put(("sonuc", ajan.calistir(b.mesajlar())))
        except Exception as hata:
            kuyruk.put(("hata", hata))

    threading.Thread(target=calis, daemon=True, name="sohbet-ajan").start()
    while True:
        tur, deger = kuyruk.get()
        if tur == "arac":
            yield olay("arac", deger)
        elif tur == "hata":
            raise deger
        else:
            yanit = b.ac(deger.yanit) or "Yanıt üretilemedi."
            yield olay("parca", {"metin": yanit})
            uyarilar = (
                [] if deger.durma_nedeni == "yanit" else [f"Ajan durdu: {deger.durma_nedeni}"]
            )
            yield olay("son", {"yanit": yanit, "uyarilar": uyarilar, "atiflar": [], "belgede_yok": False,
                               "kullanim": _kullanim(deger.kullanim), "model": b.saglayici.model})  # fmt: skip
            return


_KIPLER: dict[str, Callable[[_Baglam], Iterator[str]]] = {
    "sohbet": _sohbet_akisi,
    "rag": _rag_akisi,
    "arac": _arac_akisi,
    # YENİ KİP BURAYA: "ad": _ad_akisi,
}


def sohbet_akisi(durum: SunucuDurumu, govde: SohbetIstegiGovdesi) -> Iterator[str]:
    """Seçilen kipin olaylarını üretir; hataları `hata` olayına çevirir (akış yarıda kopmaz)."""
    try:
        yield from _KIPLER[govde.kip](_Baglam(durum, govde))
    except SaglayiciHatasi as hata:
        yield olay("hata", {"ileti": f"Model sunucusu hatası: {hata}"})
    except YzHatasi as hata:
        yield olay("hata", {"ileti": str(hata)})

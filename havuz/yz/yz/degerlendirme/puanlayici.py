"""Puanlayıcılar: model çıktısını beklenenle karşılaştırıp 0–1 arası puan verir.

    tam_eslesme       normalleştirilmiş metin aynı mı (Türkçe küçük harf, boşluk, sondaki nokta)
    icerme            beklenen çıktının içinde geçiyor mu
    duzenli_ifade     desen (ya da beklenen) çıktıda bulunuyor mu
    json_sema         çıktı geçerli JSON mu ve (varsa) görevin şemasına uyuyor mu = biçim geçerliliği
    sayisal           çıktıdaki sayı (konum: ilk/son/herhangi) beklenene tolerans içinde eşit mi
    gomme_benzerligi  gömme kosinüs benzerliği ≥ esik
    hakem             başka bir model EVET/HAYIR der (isteğe bağlı; maliyetlidir)
`beklenen` bir listeyse, öğelerinden HERHANGİ biri tutarsa geçer (eş değer yanıtlar için).
`alan` verilirse çıktı JSON'unun o alanı (ve beklenen sözlükse onun aynı alanı) karşılaştırılır.
Kim kullanır: degerlendirme/kosu.py.
Genişletme: yeni puanlayıcı → aynı imzada işlev yazıp `PUANLAYICILAR`'a ekleyin (YENİ PUANLAYICI
BURAYA) ve tests/test_degerlendirme.py'ye örnek koyun.
"""

from __future__ import annotations

import json
import re
from collections.abc import Callable
from dataclasses import dataclass, replace
from typing import Any

from pydantic import BaseModel, ValidationError

from yz.degerlendirme.tanim import PuanlayiciAyari
from yz.istem.sablonlar import sablon
from yz.metin import bosluk_duzelt, kucuk_tr
from yz.rag.gomme import Gomme, KarmaGomme
from yz.saglayici.taban import Saglayici
from yz.saglayici.tipler import Mesaj
from yz.yapili.json_onar import json_ayikla
from yz.yapili.sema_araclari import tum_sayilar, turkce_sayi


@dataclass(frozen=True)
class Puan:
    deger: float  # 0..1
    gecti: bool
    aciklama: str = ""


@dataclass
class PuanBaglami:
    """Puanlayıcıların paylaştığı kaynaklar."""

    sema: type[BaseModel] | None = None
    gomme: Gomme | None = None
    hakem: Saglayici | None = None
    dil: str = "tr"
    girdi: str = ""  # puanlanan örneğin girdisi (hakem istemi için; puanla() doldurur)


Puanlayici = Callable[[str, Any, PuanlayiciAyari, PuanBaglami], Puan]


def normalle(metin: Any, buyuk_kucuk: bool = False) -> str:
    duz = bosluk_duzelt(str(metin)).strip().strip("\"'`").rstrip(".!")
    return duz if buyuk_kucuk else kucuk_tr(duz)


def alan_degeri(deger: Any, yol: str) -> Any:
    """ "a.b.0.c" yolundaki değeri döndürür; yoksa None."""
    for parca in yol.split("."):
        if isinstance(deger, dict):
            deger = deger.get(parca)
        elif isinstance(deger, list) and parca.isdigit() and int(parca) < len(deger):
            deger = deger[int(parca)]
        else:
            return None
    return deger


def _secenekler(beklenen: Any) -> list[Any]:
    return beklenen if isinstance(beklenen, list) else [beklenen]


def _tam_eslesme(cikti: str, beklenen: Any, ayar: PuanlayiciAyari, _b: PuanBaglami) -> Puan:
    tutan = any(
        normalle(cikti, ayar.buyuk_kucuk) == normalle(b, ayar.buyuk_kucuk)
        for b in _secenekler(beklenen)
    )
    return Puan(float(tutan), tutan, "" if tutan else f"beklenen: {beklenen!r}")


def _icerme(cikti: str, beklenen: Any, ayar: PuanlayiciAyari, _b: PuanBaglami) -> Puan:
    metin = normalle(cikti, ayar.buyuk_kucuk)
    tutan = any(normalle(b, ayar.buyuk_kucuk) in metin for b in _secenekler(beklenen))
    return Puan(float(tutan), tutan, "" if tutan else f"çıktıda yok: {beklenen!r}")


def _duzenli_ifade(cikti: str, beklenen: Any, ayar: PuanlayiciAyari, _b: PuanBaglami) -> Puan:
    desenler = [ayar.desen] if ayar.desen else [str(b) for b in _secenekler(beklenen)]
    tutan = any(
        re.search(d, cikti, flags=0 if ayar.buyuk_kucuk else re.IGNORECASE) for d in desenler
    )
    return Puan(float(tutan), tutan, "" if tutan else f"desen bulunamadı: {desenler}")


def _json_sema(cikti: str, _beklenen: Any, _ayar: PuanlayiciAyari, baglam: PuanBaglami) -> Puan:
    ayiklama = json_ayikla(cikti, "herhangi")
    if not ayiklama.bulundu:
        return Puan(0.0, False, "JSON bulunamadı")
    if baglam.sema is not None:
        try:
            baglam.sema.model_validate(ayiklama.deger)
        except ValidationError as hata:
            return Puan(0.0, False, f"şemaya uymuyor: {hata.error_count()} hata")
    return Puan(1.0, True, "onarımla" if ayiklama.notlar else "")


def _sayisal(cikti: str, beklenen: Any, ayar: PuanlayiciAyari, _b: PuanBaglami) -> Puan:
    """Yanıttaki sayıyı beklenenle karşılaştırır. konum: "ilk" | "son" | "herhangi"."""
    sayilar = tum_sayilar(cikti) if isinstance(cikti, str) else []
    if not sayilar:
        return Puan(0.0, False, "çıktıda sayı yok")
    adaylar = {"ilk": sayilar[:1], "son": sayilar[-1:], "herhangi": sayilar}[ayar.konum]
    for b in _secenekler(beklenen):
        hedef = b if isinstance(b, int | float) else turkce_sayi(str(b))
        if hedef is None:
            continue
        sinir = ayar.tolerans * abs(float(hedef)) if ayar.goreli else ayar.tolerans
        if any(abs(d - float(hedef)) <= sinir + 1e-9 for d in adaylar):
            return Puan(1.0, True)
    return Puan(0.0, False, f"{adaylar[0]:g} ≠ {beklenen!r}")


def _gomme_benzerligi(
    cikti: str, beklenen: Any, ayar: PuanlayiciAyari, baglam: PuanBaglami
) -> Puan:
    gomme = baglam.gomme or KarmaGomme()
    vektorler = gomme.gom([cikti, *[str(b) for b in _secenekler(beklenen)]])
    en_iyi = max(float(vektorler[0] @ v) for v in vektorler[1:])
    return Puan(max(0.0, min(1.0, en_iyi)), en_iyi >= ayar.esik, f"benzerlik {en_iyi:.2f}")


def _hakem(cikti: str, beklenen: Any, ayar: PuanlayiciAyari, baglam: PuanBaglami) -> Puan:
    if baglam.hakem is None:
        return Puan(0.0, False, "hakem sağlayıcı tanımlı değil (--hakem)")
    istem = sablon(
        "hakem", baglam.dil, girdi=baglam.girdi, beklenen=beklenen, cikti=cikti, olcut=ayar.olcut
    )
    yanit = baglam.hakem.sohbet([Mesaj.kullanici(istem)], azami_belirtec=5)
    kucuk = kucuk_tr(yanit.metin)
    tutan = bool(re.search(r"\b(evet|yes)\b", kucuk)) and not re.search(r"\b(hayır|no)\b", kucuk)
    return Puan(float(tutan), tutan, f"hakem: {yanit.metin.strip()[:20]}")


PUANLAYICILAR: dict[str, Puanlayici] = {
    "tam_eslesme": _tam_eslesme,
    "icerme": _icerme,
    "duzenli_ifade": _duzenli_ifade,
    "json_sema": _json_sema,
    "sayisal": _sayisal,
    "gomme_benzerligi": _gomme_benzerligi,
    "hakem": _hakem,
    # YENİ PUANLAYICI BURAYA: "ad": _islev,
}


def puanla(
    cikti: str,
    deger: Any,
    beklenen: Any,
    ayar: PuanlayiciAyari,
    baglam: PuanBaglami,
    girdi: str = "",
) -> Puan:
    """Tek bir puanlayıcıyı çalıştırır. `deger` çıktının ayrıştırılmış hâlidir (varsa)."""
    baglam = replace(baglam, girdi=girdi)
    islev = PUANLAYICILAR.get(ayar.tur)
    if islev is None:
        raise ValueError(f"Bilinmeyen puanlayıcı: {ayar.tur}. Geçerli: {', '.join(PUANLAYICILAR)}.")
    if ayar.alan and ayar.tur != "json_sema":
        kaynak = deger if deger is not None else json_ayikla(cikti, "herhangi").deger
        alan = alan_degeri(kaynak, ayar.alan)
        cikti = (
            ""
            if alan is None
            else (alan if isinstance(alan, str) else json.dumps(alan, ensure_ascii=False))
        )
        beklenen = alan_degeri(beklenen, ayar.alan) if isinstance(beklenen, dict) else beklenen
    return islev(cikti, beklenen, ayar, baglam)

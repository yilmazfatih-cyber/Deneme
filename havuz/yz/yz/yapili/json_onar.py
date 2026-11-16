"""Model çıktısından JSON ayıklama ve onarma (sağlam ayrıştırıcı).

Küçük modeller JSON'u nadiren temiz verir: önüne açıklama yazar, kod çitine (```json) sarar,
sona virgül koyar, tek tırnak kullanır, yorum ekler ya da çıktı yarıda kesilir. `json_ayikla`
metindeki bütün JSON adaylarını bulur ve hangi onarımların yapıldığını `notlar`da bildirir.
Kim kullanır: yapili/cikar.py (şema doğrulamasından önce), ajan/metin_kipi.py,
saglayici/openai_bicim.py (bozuk araç argümanları).
Genişletme: yeni bir bozukluk türü → önce tests/test_json_onar.py'ye gerçek örneğini ekleyin,
sonra yapili/json_hosgorulu.py'de hoşgörün. Bu dosya paketin başka modülünü içe aktarmaz
(yz.metin hariç); öyle kalmalıdır.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any, Literal

from yz.metin import kucuk_ascii
from yz.yapili.json_hosgorulu import EKSIK, Okuyucu

Beklenen = Literal["nesne", "dizi", "herhangi"]

_DUSUNCE = re.compile(r"<(think|thinking)>.*?(?:</\1>|\Z)", re.DOTALL)
_GORUNMEZ = re.compile("[﻿​‌‍⁠]")
_CIT = re.compile(r"```[ \t]*([A-Za-z0-9_+-]*)[ \t]*\n?(.*?)(?:```|\Z)", re.DOTALL)
_ACILIS = re.compile(r"[{\[]")
_ILK_ANAHTAR = re.compile(r"[\"'][^\"'\n]{1,80}[\"']\s*:")


@dataclass
class Aday:
    """Metinde bulunan bir JSON adayı."""

    deger: Any
    notlar: list[str] = field(default_factory=list)  # yapılan onarımlar
    bas: int = 0
    son: int = 0
    kesik: bool = False  # girdi, yapı kapanmadan bitmiş (çıktı yarıda kesilmiş)

    @property
    def temiz(self) -> bool:
        """Hiç onarım gerekmediyse True (çıktı doğrudan geçerli JSON'du)."""
        return not self.notlar


@dataclass
class AyiklamaSonucu:
    """`json_ayikla` sonucu: en iyi adaydan başlayarak sıralı adaylar."""

    adaylar: list[Aday] = field(default_factory=list)

    @property
    def bulundu(self) -> bool:
        return bool(self.adaylar)

    @property
    def deger(self) -> Any:
        """En iyi adayın değeri; aday yoksa None."""
        return self.adaylar[0].deger if self.adaylar else None

    @property
    def notlar(self) -> list[str]:
        return self.adaylar[0].notlar if self.adaylar else []


def _tur_uygun(deger: Any, beklenen: Beklenen) -> bool:
    if beklenen == "nesne":
        return isinstance(deger, dict)
    if beklenen == "dizi":
        return isinstance(deger, list)
    return isinstance(deger, dict | list)


def _adaylari_tara(metin: str) -> list[Aday]:
    """Metni baştan sona tarar; her `{` / `[` başlangıcından bir aday okumayı dener."""
    adaylar: list[Aday] = []
    konum = 0
    while konum < len(metin):
        eslesme = _ACILIS.search(metin, konum)
        if eslesme is None:
            break
        bas = eslesme.start()
        okuyucu = Okuyucu(metin, bas)
        deger = okuyucu.deger()
        if deger is not EKSIK and deger not in ({}, []):
            adaylar.append(Aday(deger, list(okuyucu.notlar), bas, okuyucu.i, okuyucu.kesik))
        konum = max(okuyucu.i, bas + 1)
    return adaylar


def _cit_araliklari(metin: str) -> list[tuple[int, int, str]]:
    return [(m.start(2), m.end(2), kucuk_ascii(m.group(1))) for m in _CIT.finditer(metin)]


def _puan(aday: Aday, beklenen: Beklenen, citler: list[tuple[int, int, str]]) -> tuple[int, ...]:
    """Sıralama anahtarı: beklenen tür > json çiti > kesik değil > uzun olan > önce gelen."""
    json_citinde = any(b <= aday.bas < s and dil in ("json", "") for b, s, dil in citler)
    return (
        int(_tur_uygun(aday.deger, beklenen)),
        int(json_citinde),
        int(not aday.kesik),
        aday.son - aday.bas,
        -aday.bas,
    )


def json_ayikla(metin: str, beklenen: Beklenen = "nesne") -> AyiklamaSonucu:
    """Model çıktısındaki JSON adaylarını bulur, onarır ve en iyisinden başlayarak sıralar.

    beklenen: "nesne" ({...}), "dizi" ([...]) ya da "herhangi". Beklenen türdeki adaylar öne alınır.
    """
    on_notlar: list[str] = []
    temiz = _GORUNMEZ.sub("", metin)
    dusuncesiz = _DUSUNCE.sub("", temiz)
    if dusuncesiz != temiz:
        on_notlar.append("dusunce_blogu")
        temiz = dusuncesiz
    try:  # hızlı yol: çıktı zaten geçerli JSON
        dogrudan = json.loads(temiz)
    except ValueError:
        dogrudan = EKSIK
    if dogrudan is not EKSIK and isinstance(dogrudan, dict | list):
        return AyiklamaSonucu([Aday(dogrudan, on_notlar, 0, len(temiz))])
    if isinstance(dogrudan, str) and dogrudan.lstrip()[:1] in ("{", "["):
        ic = json_ayikla(dogrudan, beklenen)  # JSON, dizgi içine bir kez daha kodlanmış
        for aday in ic.adaylar:
            aday.notlar = [*on_notlar, "cift_kodlama", *aday.notlar]
        return ic

    citler = _cit_araliklari(temiz)
    adaylar = _adaylari_tara(temiz)
    if not adaylar:
        ilk = _ILK_ANAHTAR.search(temiz)
        if ilk is not None:  # süslü parantez unutulmuş: "ad": "x", "yas": 3
            okuyucu = Okuyucu("{" + temiz[ilk.start() :])
            deger = okuyucu.deger()
            if isinstance(deger, dict) and deger:
                notlar = ["suslu_eklendi", *(n for n in okuyucu.notlar)]
                adaylar.append(Aday(deger, notlar, ilk.start(), len(temiz), kesik=False))
    for aday in adaylar:
        ek: list[str] = list(on_notlar)
        if any(b <= aday.bas < s for b, s, _ in citler):
            ek.append("kod_citi")
        elif temiz[: aday.bas].strip():
            ek.append("on_metin")
        if temiz[aday.son :].strip().strip("`").strip():
            ek.append("son_metin")
        if aday.kesik and "kesik" not in aday.notlar:
            ek.append("kesik")
        aday.notlar = [*ek, *aday.notlar]
    adaylar.sort(key=lambda a: _puan(a, beklenen, citler), reverse=True)
    return AyiklamaSonucu(adaylar)


def json_coz(metin: str, beklenen: Beklenen = "nesne") -> Any:
    """En iyi adayın değerini döndürür; JSON bulunamazsa `ValueError` fırlatır."""
    sonuc = json_ayikla(metin, beklenen)
    if not sonuc.bulundu:
        raise ValueError(
            "Metinde JSON bulunamadı. Model düz yazı döndürmüş olabilir; istemde "
            '"Yalnızca JSON yaz" kuralını ve bir örnek çıktıyı denetleyin.'
        )
    return sonuc.deger

"""Çıktı süzgeçleri: model yanıtı kullanıcıya ya da başka bir sisteme gitmeden önce denetlenir.

Her süzgeç `(metin) -> list[str]` biçiminde bir işlevdir: boş liste "geçti" demektir,
dolu liste ihlal açıklamalarıdır. `suzgecleri_uygula` hepsini çalıştırıp tek sonuç döndürür.
Kim kullanır: sunucu (yanıtı göndermeden önce), ajan ve iş akışı adımları.
Genişletme: yeni süzgeç → aynı imzada bir işlev üreten fabrika yazın (aşağıdakiler örnektir).
"""

from __future__ import annotations

import json
import re
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field

from pydantic import BaseModel, ValidationError

from yz.metin import kucuk_tr

Suzgec = Callable[[str], list[str]]


@dataclass(frozen=True)
class SuzgecSonucu:
    """Süzgeçlerin toplu sonucu."""

    gecti: bool
    ihlaller: list[str] = field(default_factory=list)


def uzunluk_suzgeci(azami_karakter: int) -> Suzgec:
    """Yanıt `azami_karakter`den uzunsa ihlal bildirir."""

    def denetle(metin: str) -> list[str]:
        if len(metin) > azami_karakter:
            return [f"Yanıt çok uzun: {len(metin)} karakter (sınır {azami_karakter})."]
        return []

    return denetle


def yasakli_kalip_suzgeci(kaliplar: Sequence[str], duzenli_ifade: bool = False) -> Suzgec:
    """Yasaklı sözcük ya da düzenli ifade geçiyorsa ihlal bildirir.

    Düz sözcükler Türkçe küçük harfle karşılaştırılır ("İADE" ile "iade" eşleşir).
    """
    derlenmis = [re.compile(k) for k in kaliplar] if duzenli_ifade else []
    duz = [] if duzenli_ifade else [kucuk_tr(k) for k in kaliplar]

    def denetle(metin: str) -> list[str]:
        ihlaller = [f"Yasaklı kalıp: {k.pattern}" for k in derlenmis if k.search(metin)]
        kucuk = kucuk_tr(metin)
        ihlaller.extend(f"Yasaklı ifade: {k}" for k in duz if k in kucuk)
        return ihlaller

    return denetle


def sema_suzgeci(sema: type[BaseModel]) -> Suzgec:
    """Yanıt geçerli JSON değilse ya da şemaya uymuyorsa ihlal bildirir."""

    def denetle(metin: str) -> list[str]:
        try:
            sema.model_validate(json.loads(metin))
        except json.JSONDecodeError as hata:
            return [f"Geçerli JSON değil: {hata.msg} (satır {hata.lineno})."]
        except ValidationError as hata:
            return [
                f"Şemaya uymuyor: {'.'.join(str(p) for p in h['loc']) or '(kök)'}: {h['msg']}"
                for h in hata.errors()
            ]
        return []

    return denetle


def suzgecleri_uygula(metin: str, suzgecler: Sequence[Suzgec]) -> SuzgecSonucu:
    """Bütün süzgeçleri çalıştırır; ihlalleri tek listede toplar."""
    ihlaller: list[str] = []
    for suzgec in suzgecler:
        ihlaller.extend(suzgec(metin))
    return SuzgecSonucu(gecti=not ihlaller, ihlaller=ihlaller)

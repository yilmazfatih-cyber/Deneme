"""İş akışı: çok adımlı hat; her adımın çıktısı doğrulanır, geçmezse hata bilgisiyle yeniden denenir.

Küçük modellerde büyük bir görevi tek istemle yaptırmak yerine küçük adımlara bölmek en etkili
yöntemdir (docs/KUCUK_MODEL_REHBERI.md "Görev bölme"). Her adım:
    calistir(baglam) -> çıktı        baglam: girdi + önceki adımların çıktıları (adım adıyla)
    dogrula(çıktı)   -> hata | None  None = geçti; metin = neden geçmediği
Yeniden denemede `baglam["_onceki_hata"]` doludur; adım bunu istemine ekleyip modele söyler.
Planlayıcı → yürütücü → denetçi kalıbı da bir iş akışıdır: ornekler/coklu_ajan.py.
Kim kullanır: kendi hatlarınız; ornekler/.
Genişletme: yeni adım → `IsAdimi(ad, calistir, dogrula)`; sıralama listeyle verilir.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from typing import Any


@dataclass
class IsAdimi:
    ad: str
    calistir: Callable[[dict[str, Any]], Any]
    dogrula: Callable[[Any], str | None] | None = None
    yeniden_deneme: int = 1  # doğrulama başarısızsa kaç kez daha denenir


@dataclass
class AdimKaydi:
    ad: str
    deneme: int
    basarili: bool
    hata: str = ""


@dataclass
class AkisSonucu:
    basarili: bool
    baglam: dict[str, Any]
    kayitlar: list[AdimKaydi] = field(default_factory=list)
    hata: str = ""

    def __getitem__(self, ad: str) -> Any:
        return self.baglam[ad]


class IsAkisi:
    """Adımları sırayla çalıştırır; bir adım tüm denemelerde geçemezse akış durur."""

    def __init__(self, adimlar: Sequence[IsAdimi]) -> None:
        adlar = [a.ad for a in adimlar]
        if len(set(adlar)) != len(adlar):
            raise ValueError(f"Adım adları tekil olmalı: {adlar}")
        self.adimlar = list(adimlar)

    def calistir(self, girdi: dict[str, Any]) -> AkisSonucu:
        baglam: dict[str, Any] = dict(girdi)
        kayitlar: list[AdimKaydi] = []
        for adim in self.adimlar:
            baglam.pop("_onceki_hata", None)
            for deneme in range(1 + adim.yeniden_deneme):
                try:
                    cikti = adim.calistir(baglam)
                    hata = adim.dogrula(cikti) if adim.dogrula else None
                except Exception as istisna:
                    cikti, hata = None, f"{type(istisna).__name__}: {istisna}"
                kayitlar.append(AdimKaydi(adim.ad, deneme, hata is None, hata or ""))
                if hata is None:
                    baglam[adim.ad] = cikti
                    break
                baglam["_onceki_hata"] = hata
            else:
                return AkisSonucu(False, baglam, kayitlar, f"`{adim.ad}` adımı geçemedi: {hata}")
        baglam.pop("_onceki_hata", None)
        return AkisSonucu(True, baglam, kayitlar)

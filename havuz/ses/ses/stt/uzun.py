"""Uzun sesi parçalayarak yazıya çevirir: VAD ile konuşma parçaları (≤ 28 sn), zamanlar birleştirilir.

Neden: (1) Whisper 30 sn'lik pencereyle çalışır; sessizlikten bölmek sözcük ortasından kesmeyi önler.
(2) Uzun sessizlikte Whisper uydurur (Türkçede sık görülen "Altyazı M.K.", "İzlediğiniz için
teşekkürler" gibi); sessiz bölümler hiç modele verilmez. (3) Her parçadan sonra ilerleme bildirilir.
Bilinen uydurma kalıbı tek başına bir bölüt olarak ve düşük güvenle gelirse atılır ve `uyarilar`'a
yazılır (`UYDURMA_KALIPLARI`). Kim kullanır: komutlar.py, sunucu/, olcum/degerlendir.py.
Genişletme: yeni bir uydurma kalıbı → `UYDURMA_KALIPLARI` + tests/test_stt.py'ye örnek.
"""

from __future__ import annotations

import re
from collections.abc import Callable

from ses.metin import kucuk_tr
from ses.ses_isleme.parcala import konusma_parcalari
from ses.ses_isleme.ses import Dizi
from ses.stt.motor import ORNEKLEME, SttMotoru
from ses.stt.tipler import Bolut, Transkript

UYDURMA_KALIPLARI = (
    r"altyazı m\.?\s?k\.?",
    r"izlediğiniz için teşekkür(ler| ederim)",
    r"abone olmayı unutmayın",
    r"bir sonraki videoda görüşmek üzere",
)
_UYDURMA = re.compile(r"^\W*(?:" + "|".join(UYDURMA_KALIPLARI) + r")\W*$")

Ilerleme = Callable[[int, int], None]
"""(biten parça sayısı, toplam parça) ile çağrılır."""


def _uydurma_mi(bolut: Bolut) -> bool:
    if not _UYDURMA.match(kucuk_tr(bolut.metin.strip())):
        return False
    guvensiz = (bolut.konusma_yok_olasiligi or 0.0) > 0.3 or (bolut.ort_logolasilik or 0.0) < -0.8
    return guvensiz


def uzun_yaziya(
    motor: SttMotoru,
    ornekler: Dizi,
    *,
    dil: str = "tr",
    kelime_zamanlari: bool = True,
    azami_parca_sn: float = 28.0,
    ipucu: str | None = None,
    ilerleme: Ilerleme | None = None,
) -> Transkript:
    """16 kHz tek kanallı sesi parça parça yazıya çevirir; zamanlar sesin başına göredir."""
    sure = len(ornekler) / ORNEKLEME
    parcalar = konusma_parcalari(ornekler, ORNEKLEME, azami_sn=azami_parca_sn)
    if not parcalar:
        return Transkript(dil=dil, sure=sure, model=motor.ad, uyarilar=["Seste konuşma bulunamadı."])
    bolutler: list[Bolut] = []
    uyarilar: list[str] = []
    for sira, parca in enumerate(parcalar, start=1):
        sonuc = motor.yaziya(
            ornekler[parca.bas : parca.son], dil=dil, kelime_zamanlari=kelime_zamanlari, ipucu=ipucu
        ).kaydir(parca.bas / ORNEKLEME)
        for bolut in sonuc.bolutler:
            if _uydurma_mi(bolut):
                uyarilar.append(f"{bolut.baslangic:.1f} sn: olası uydurma atıldı: {bolut.metin.strip()!r}")
                continue
            bolutler.append(bolut.model_copy(update={"kimlik": len(bolutler)}))
        uyarilar.extend(sonuc.uyarilar)
        if ilerleme is not None:
            ilerleme(sira, len(parcalar))
    return Transkript(dil=dil, sure=sure, model=motor.ad, bolutler=bolutler, uyarilar=uyarilar)

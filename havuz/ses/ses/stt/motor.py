"""Yazıya çevirici arayüzü (`SttMotoru`) ve testler için belirlenimci sahte motor (`SahteStt`).

Sözleşme: `yaziya` HER ZAMAN 16 kHz, tek kanallı float32 dizi alır (ses_isleme/yukle.py hazırlar) ve
zamanları bu diziye göre verir. Motor iş parçacığı güvenli olmalıdır (sunucu aynı anda çağırabilir).
Kim kullanır: stt/uzun.py, olcum/degerlendir.py, sunucu/, komutlar.py.
Genişletme: başka bir model (ör. whisper.cpp, Vosk) → `SttMotoru`'na uyan bir sınıf yazın;
`SahteStt`'yi örnek alın, motor seçimine (komutlar.py `stt_motoru_kur`) bir dal ekleyin.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Protocol

from ses.ses_isleme.ses import Dizi
from ses.stt.tipler import Bolut, Kelime, Transkript

ORNEKLEME = 16000


class SttMotoru(Protocol):
    """Konuşmayı yazıya çeviren motor."""

    @property
    def ad(self) -> str: ...

    def yaziya(
        self,
        ornekler: Dizi,
        *,
        dil: str = "tr",
        kelime_zamanlari: bool = True,
        ipucu: str | None = None,
    ) -> Transkript: ...


class SahteStt:
    """Modelsiz deneme ve testler: verilen metni (ya da işlevin döndürdüğünü) sesin üstüne yayar.

    Sözcük zamanları sese eşit dağıtılır. `cagrilar`: her çağrının ses uzunluğu (örnek sayısı).
    """

    def __init__(self, metin: str | Callable[[Dizi], str] = "merhaba dünya") -> None:
        self._metin = metin
        self.cagrilar: list[int] = []

    @property
    def ad(self) -> str:
        return "sahte"

    def yaziya(
        self,
        ornekler: Dizi,
        *,
        dil: str = "tr",
        kelime_zamanlari: bool = True,
        ipucu: str | None = None,
    ) -> Transkript:
        self.cagrilar.append(len(ornekler))
        sure = len(ornekler) / ORNEKLEME
        metin = self._metin(ornekler) if callable(self._metin) else self._metin
        sozcukler = metin.split()
        kelimeler: list[Kelime] = []
        if kelime_zamanlari and sozcukler:
            adim = sure / len(sozcukler)
            kelimeler = [
                Kelime(baslangic=round(i * adim, 3), bitis=round((i + 1) * adim, 3), metin=" " + s)
                for i, s in enumerate(sozcukler)
            ]
        bolutler = [Bolut(baslangic=0.0, bitis=round(sure, 3), metin=" " + metin, kelimeler=kelimeler)]
        return Transkript(dil=dil, sure=sure, model=self.ad, bolutler=bolutler if sozcukler else [])

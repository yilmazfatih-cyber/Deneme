"""WER (sözcük hata oranı) ve CER (karakter hata oranı); tek örnek ve toplu (derlem) hesap.

WER = (S + D + I) / N, N = doğru metindeki sözcük sayısı (CER'de karakter; boşluk dahil).
Toplu oran, örnek oranlarının ortalaması DEĞİL, toplam hata / toplam N'dir (uzun örnek daha ağır
basar; yaygın uygulama budur). Doğru metin boşsa: tahmin de boşsa 0, değilse 1 sayılır (tek örnek).
Oran 1'i aşabilir (çok ekleme varsa). Kim kullanır: degerlendir.py, scripts/gidis_donus.py.
Genişletme: yeni bir ölçüt → `Olcum`'a alan + `olc`'ta hesap + tests/test_olcum.py.
"""

from __future__ import annotations

from collections.abc import Iterable

from pydantic import BaseModel

from ses.olcum.duzenleme import hizala
from ses.olcum.normallestir import karakterler, sozcukler


class Olcum(BaseModel):
    """Bir birimdeki (sözcük ya da karakter) hata sayıları."""

    n: int
    yer_degistirme: int
    silme: int
    ekleme: int

    @property
    def hata(self) -> int:
        return self.yer_degistirme + self.silme + self.ekleme

    @property
    def oran(self) -> float:
        if self.n == 0:
            return 0.0 if self.hata == 0 else 1.0
        return self.hata / self.n

    def __add__(self, diger: Olcum) -> Olcum:
        return Olcum(
            n=self.n + diger.n,
            yer_degistirme=self.yer_degistirme + diger.yer_degistirme,
            silme=self.silme + diger.silme,
            ekleme=self.ekleme + diger.ekleme,
        )


def _olc(dogru: list[str], tahmin: list[str]) -> Olcum:
    h = hizala(dogru, tahmin)
    return Olcum(n=len(dogru), yer_degistirme=h.yer_degistirme, silme=h.silme, ekleme=h.ekleme)


def wer_olc(dogru: str, tahmin: str, *, sayilari_yaz: bool = False) -> Olcum:
    return _olc(sozcukler(dogru, sayilari_yaz=sayilari_yaz), sozcukler(tahmin, sayilari_yaz=sayilari_yaz))


def cer_olc(dogru: str, tahmin: str, *, sayilari_yaz: bool = False) -> Olcum:
    return _olc(
        karakterler(dogru, sayilari_yaz=sayilari_yaz), karakterler(tahmin, sayilari_yaz=sayilari_yaz)
    )


def wer(dogru: str, tahmin: str, *, sayilari_yaz: bool = False) -> float:
    """Sözcük hata oranı (normalleştirilmiş metinler üstünde)."""
    return wer_olc(dogru, tahmin, sayilari_yaz=sayilari_yaz).oran


def cer(dogru: str, tahmin: str, *, sayilari_yaz: bool = False) -> float:
    """Karakter hata oranı (normalleştirilmiş metinler üstünde; boşluk dahil)."""
    return cer_olc(dogru, tahmin, sayilari_yaz=sayilari_yaz).oran


def topla(olcumler: Iterable[Olcum]) -> Olcum:
    """Toplu (derlem) ölçüm: hatalar ve N'ler toplanır."""
    toplam = Olcum(n=0, yer_degistirme=0, silme=0, ekleme=0)
    for olcum in olcumler:
        toplam = toplam + olcum
    return toplam

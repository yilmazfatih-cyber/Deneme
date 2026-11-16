"""Bağlam bütçesi: modele giden metni belirteç sınırına sığdırma.

Küçük modellerin bağlamı dardır (çoğu 4–32 bin belirteç) ve uzun bağlamda dikkatleri dağılır.
Kural: önce çıktıya yer ayır, sonra sistem istemini koy, kalan bütçeyi en önemli içerikle doldur.
Sayılar tahminidir (yz.metin.belirtec_tahmini); kesin sayı için modelin belirteçleyicisi gerekir.
Kim kullanır: rag/yanit.py (kaynakları sığdırma), istem/bellek.py, ajan.
Genişletme: modelin gerçek belirteçleyicisiyle saymak için `sayac` parametresine işlev verin.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass

from yz.metin import belirtec_tahmini, kirp
from yz.saglayici.tipler import Mesaj

Sayac = Callable[[str], int]
MESAJ_BASINA_EK = 4  # rol etiketleri ve ayraçlar için kabaca pay


@dataclass(frozen=True)
class BaglamButcesi:
    """`baglam` toplam pencere; `cikti` yanıt için ayrılan pay."""

    baglam: int = 4096
    cikti: int = 512

    @property
    def girdi(self) -> int:
        return max(0, self.baglam - self.cikti)


def mesaj_belirteci(mesajlar: Sequence[Mesaj], sayac: Sayac = belirtec_tahmini) -> int:
    return sum(sayac(m.icerik) + MESAJ_BASINA_EK for m in mesajlar)


def parcalari_sigdir(
    parcalar: Sequence[str], butce: int, sayac: Sayac = belirtec_tahmini
) -> list[str]:
    """Parçaları sırayla (en önemli önce) bütçe dolana dek alır; sığmayanı atlar."""
    secilen: list[str] = []
    kalan = butce
    for parca in parcalar:
        maliyet = sayac(parca)
        if maliyet <= kalan:
            secilen.append(parca)
            kalan -= maliyet
    return secilen


def mesajlari_sigdir(
    mesajlar: Sequence[Mesaj], butce: int, sayac: Sayac = belirtec_tahmini
) -> list[Mesaj]:
    """Sistem mesajlarını ve en yeni mesajları korur; sığmayan eski mesajları atar.

    Son kullanıcı mesajı tek başına sığmıyorsa sonu kırpılır (hiç değilse başı gitsin).
    """
    sistem = [m for m in mesajlar if m.rol == "system"]
    diger = [m for m in mesajlar if m.rol != "system"]
    kalan = butce - mesaj_belirteci(sistem, sayac)
    secilen: list[Mesaj] = []
    for mesaj in reversed(diger):
        maliyet = sayac(mesaj.icerik) + MESAJ_BASINA_EK
        if maliyet <= kalan:
            secilen.append(mesaj)
            kalan -= maliyet
        elif not secilen:
            karakter = max(0, int((kalan - MESAJ_BASINA_EK) * 2.6))
            secilen.append(mesaj.model_copy(update={"icerik": kirp(mesaj.icerik, karakter)}))
            break
        else:
            break
    # Araç sonucu, kendisini çağıran asistan mesajı olmadan kalırsa modeller şaşırır: at.
    secilen.reverse()
    while secilen and secilen[0].rol == "tool":
        secilen.pop(0)
    return sistem + secilen

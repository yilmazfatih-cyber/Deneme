"""Konuşma belleği: özetleyen tampon.

Son `korunan_mesaj` mesaj olduğu gibi tutulur; toplam boyut `azami_belirtec`i aşınca daha eski
mesajlar modele özetletilir ve tek bir "önceki bölümün özeti" sistem mesajına katlanır.
Böylece uzun sohbet küçük modelin bağlamına sığar; adlar ve sayılar özette korunur.
Kim kullanır: cli.py (`sohbet`), sunucu (çok turlu sohbet).
Genişletme: özet yerine başka bir sıkıştırma → `_ozetle`'yi değiştirin.
"""

from __future__ import annotations

from yz.istem.butce import mesaj_belirteci
from yz.istem.sablonlar import sablon
from yz.metin import kirp
from yz.saglayici.taban import Saglayici
from yz.saglayici.tipler import Kullanim, Mesaj


class OzetleyenBellek:
    """Sistem istemi + özet + son mesajlar."""

    def __init__(
        self,
        saglayici: Saglayici,
        *,
        sistem: str = "",
        azami_belirtec: int = 2000,
        korunan_mesaj: int = 6,
        ozet_cumle: int = 6,
        dil: str = "tr",
    ) -> None:
        self.saglayici = saglayici
        self.sistem = sistem
        self.azami_belirtec = azami_belirtec
        self.korunan_mesaj = korunan_mesaj
        self.ozet_cumle = ozet_cumle
        self.dil = dil
        self.ozet = ""
        self.son_mesajlar: list[Mesaj] = []
        self.kullanim = Kullanim()

    def ekle(self, mesaj: Mesaj) -> None:
        """Mesajı ekler; bütçe aşılırsa eski mesajları özetler."""
        self.son_mesajlar.append(mesaj)
        if mesaj_belirteci(self.mesajlar()) > self.azami_belirtec:
            self._sikistir()

    def mesajlar(self) -> list[Mesaj]:
        """Modele gönderilecek mesaj listesi."""
        sonuc: list[Mesaj] = []
        if self.sistem:
            sonuc.append(Mesaj.sistem(self.sistem))
        if self.ozet:
            sonuc.append(Mesaj.sistem(sablon("bellek_ozeti", self.dil, ozet=self.ozet)))
        return sonuc + self.son_mesajlar

    def _sikistir(self) -> None:
        if len(self.son_mesajlar) <= self.korunan_mesaj:
            return
        bolme = len(self.son_mesajlar) - self.korunan_mesaj
        while bolme < len(self.son_mesajlar) and self.son_mesajlar[bolme].rol == "tool":
            bolme += 1  # araç sonucunu çağrısından ayırma
        eski, self.son_mesajlar = self.son_mesajlar[:bolme], self.son_mesajlar[bolme:]
        self.ozet = self._ozetle(eski)

    def _ozetle(self, mesajlar: list[Mesaj]) -> str:
        metin = "\n".join(f"{m.rol}: {kirp(m.icerik, 1500)}" for m in mesajlar if m.icerik)
        istem = sablon(
            "ozet_kullanici",
            self.dil,
            onceki=self.ozet or "-",
            mesajlar=metin,
            azami_cumle=self.ozet_cumle,
        )
        yanit = self.saglayici.sohbet(
            [Mesaj.sistem(sablon("ozet_sistem", self.dil)), Mesaj.kullanici(istem)],
            azami_belirtec=60 * self.ozet_cumle,
        )
        self.kullanim = self.kullanim + yanit.kullanim
        return yanit.metin.strip() or self.ozet

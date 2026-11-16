"""Araç izin listesi: ajanın hangi araçları çağırabileceğini sınırlar.

Varsayılan güvenli taraftadır: `izinli` verilmişse yalnız o adlar çalışır; `yasakli`
her zaman önceliklidir. Kim kullanır: arac/kutu.py (her çağrıdan önce `izinli_mi`).
Genişletme: daha ince kural (ör. argümana göre izin) gerekiyorsa ajan/onay.py'deki onay
kancasını kullanın; bu sınıf yalnız ada bakar.
"""

from __future__ import annotations

from collections.abc import Collection
from dataclasses import dataclass, field


@dataclass(frozen=True)
class AracIzinListesi:
    """`izinli` None ise her araç serbesttir (yasaklılar hariç)."""

    izinli: frozenset[str] | None = None
    yasakli: frozenset[str] = field(default_factory=frozenset)

    @classmethod
    def yalniz(cls, adlar: Collection[str]) -> AracIzinListesi:
        """Yalnız verilen adlara izin veren liste."""
        return cls(izinli=frozenset(adlar))

    def izinli_mi(self, ad: str) -> bool:
        """Araç adı çağrılabilir mi?"""
        if ad in self.yasakli:
            return False
        return self.izinli is None or ad in self.izinli

    def neden(self, ad: str) -> str:
        """İzin verilmeyen araç için modele gösterilecek kısa açıklama."""
        if self.izinli is not None:
            return f"`{ad}` aracı bu oturumda kapalı. Kullanılabilenler: {', '.join(sorted(self.izinli))}."
        return f"`{ad}` aracı bu oturumda kapalı."

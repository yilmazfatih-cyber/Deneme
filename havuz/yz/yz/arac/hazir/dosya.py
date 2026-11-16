"""Korumalı klasörde dosya listeleme ve okuma araçları (yalnız okuma; yazma YOK).

Güvenlik: her yol çözülür (sembolik bağlar dahil) ve izinli kök klasörün içinde kalmalıdır;
`..`, mutlak yol ve kök dışına çıkan sembolik bağ reddedilir. Gizli dosya/klasörler (.env,
.git…) görünmez ve okunamaz. İkili (binary) dosya okunmaz; okuma boyutu sınırlıdır.
Kim kullanır: ajan (hazır araç), mcp sunucusu.
Genişletme: yeni bir okuma aracı → `_guvenli_yol`'dan geçirmeden ASLA dosyaya dokunmayın.
"""

from __future__ import annotations

from pathlib import Path

from yz.arac.tanim import Arac
from yz.hatalar import GuvenlikHatasi


def dosya_araclari(kok: str | Path, azami_bayt: int = 200_000, azami_oge: int = 200) -> list[Arac]:
    """`kok` klasörüne hapsedilmiş `dosya_listele` ve `dosya_oku` araçlarını kurar."""
    kok_yol = Path(kok).resolve()
    if not kok_yol.is_dir():
        raise GuvenlikHatasi(f"İzinli klasör bulunamadı: {kok_yol}")

    def _guvenli_yol(yol: str) -> Path:
        aday = (kok_yol / yol.strip()).resolve()
        if not aday.is_relative_to(kok_yol):
            raise GuvenlikHatasi("Bu yol izinli klasörün dışında; yalnız izinli klasör okunabilir.")
        if any(p.startswith(".") for p in aday.relative_to(kok_yol).parts):
            raise GuvenlikHatasi("Gizli dosya ve klasörler okunamaz.")
        return aday

    def dosya_listele(klasor: str = ".") -> str:
        """İzinli klasördeki dosya ve alt klasörleri listeler (klasörler / ile biter).

        Args:
            klasor: Listelenecek alt klasör; varsayılan kök klasör (".").
        """
        hedef = _guvenli_yol(klasor)
        if not hedef.is_dir():
            raise FileNotFoundError(f"klasör bulunamadı: {klasor}")
        ogeler = sorted(
            (p for p in hedef.iterdir() if not p.name.startswith(".")),
            key=lambda p: (not p.is_dir(), p.name),
        )
        satirlar = [
            f"{p.relative_to(kok_yol)}{'/' if p.is_dir() else ''}"
            + ("" if p.is_dir() else f"  ({p.stat().st_size} bayt)")
            for p in ogeler[:azami_oge]
        ]
        if len(ogeler) > azami_oge:
            satirlar.append(f"… ve {len(ogeler) - azami_oge} öğe daha")
        return "\n".join(satirlar) or "(boş klasör)"

    def dosya_oku(yol: str, baslangic_satiri: int = 1, satir_sayisi: int = 200) -> str:
        """Metin dosyasının satırlarını numaralı olarak okur.

        Args:
            yol: Kök klasöre göre dosya yolu, ör. "notlar/plan.md".
            baslangic_satiri: Okumaya başlanacak satır (1'den başlar).
            satir_sayisi: En çok kaç satır okunacağı.
        """
        hedef = _guvenli_yol(yol)
        if not hedef.is_file():
            raise FileNotFoundError(f"dosya bulunamadı: {yol}. Önce dosya_listele ile bakın.")
        with hedef.open("rb") as dosya:
            veri = dosya.read(azami_bayt + 1)
        if b"\x00" in veri[:8192]:
            raise ValueError("bu bir metin dosyası değil (ikili dosya).")
        metin = veri[:azami_bayt].decode("utf-8", errors="replace")
        satirlar = metin.splitlines()
        bas = max(1, baslangic_satiri)
        secili = satirlar[bas - 1 : bas - 1 + max(1, min(satir_sayisi, 1000))]
        govde = "\n".join(f"{bas + i:>5}| {s}" for i, s in enumerate(secili))
        if len(veri) > azami_bayt:
            govde += f"\n(dosya {azami_bayt} bayttan uzun; yalnız başı okundu)"
        return govde or "(boş dosya ya da istenen satırlar yok)"

    return [Arac(dosya_listele), Arac(dosya_oku)]

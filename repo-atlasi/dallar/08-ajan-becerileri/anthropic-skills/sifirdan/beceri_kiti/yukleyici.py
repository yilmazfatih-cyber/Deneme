"""Aşamalı açılım (progressive disclosure) yükleyicisi.

skill-creator/SKILL.md üç düzey tarif eder:
  1. Üst veri (ad + açıklama): her zaman bağlamda.
  2. SKILL.md gövdesi: beceri tetiklenince bağlama girer.
  3. Paketlenmiş kaynaklar (references/, assets/, scripts/): yalnızca gerektiğinde;
     betikler bağlama hiç yüklenmeden çalıştırılabilir.

Bu sınıf her düzeyde bağlama kaç karakter girdiğini bir günlüğe yazar; böylece bir becerinin
"bedava" olmadığını, ama ancak kullanıldığında pahalılaştığını görebilirsin. Betikleri
asla çalıştırmayız: yalnızca listeleriz (bu araç takımı güvenilmeyen kod çalıştırmaz).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from .dizin import BeceriBilgisi, beceri_listesi_metni, kesfet
from .onbilgi import oku


VARSAYILAN_KAYNAK_SINIRI = 200_000  # tek kaynak dosyası için bayt sınırı


def _token(karakter: int) -> int:
    return (karakter + 3) // 4  # onbilgi.yaklasik_token ile aynı kaba kural


class BaglamTasmasi(RuntimeError):
    """Bütçe aşılınca fırlatılır: gerçek ajanlarda bu, sıkıştırma ya da unutma demektir."""


class KaynakHatasi(RuntimeError):
    """Kaynak okunamadığında (yok, klasör dışında, çok büyük, beceri etkin değil)."""


@dataclass
class Kayit:
    duzey: int
    beceri: str
    ne: str
    karakter: int


@dataclass
class Oturum:
    kokler: list
    butce_karakter: int | None = None
    beceriler: dict[str, BeceriBilgisi] = field(default_factory=dict)
    notlar: list[str] = field(default_factory=list)
    gunluk: list[Kayit] = field(default_factory=list)
    etkin: dict[str, str] = field(default_factory=dict)

    def __post_init__(self) -> None:
        bulunan, self.notlar = kesfet(self.kokler)
        self.beceriler = {b.ad: b for b in bulunan}
        liste = beceri_listesi_metni(bulunan)
        self._kaydet(1, '*', 'beceri listesi (ad + açıklama)', len(liste))
        self.liste_metni = liste

    # --- bütçe --------------------------------------------------------------------------------
    @property
    def kullanilan(self) -> int:
        return sum(k.karakter for k in self.gunluk)

    def _kaydet(self, duzey: int, beceri: str, ne: str, karakter: int) -> None:
        if self.butce_karakter is not None and self.kullanilan + karakter > self.butce_karakter:
            raise BaglamTasmasi(
                f'{beceri}/{ne} yüklenemedi: {self.kullanilan} + {karakter} > bütçe {self.butce_karakter} karakter'
            )
        self.gunluk.append(Kayit(duzey, beceri, ne, karakter))

    # --- 2. düzey -----------------------------------------------------------------------------
    def etkinlestir(self, ad: str) -> str:
        """Becerinin gövdesini bağlama alır (2. düzey). İkinci çağrı yeniden ödeme yapmaz."""
        if ad in self.etkin:
            return self.etkin[ad]
        if ad not in self.beceriler:
            raise KeyError(f'Beceri yok: {ad}')
        govde = oku(self.beceriler[ad].yol.read_text(encoding='utf-8')).govde
        self._kaydet(2, ad, 'SKILL.md gövdesi', len(govde))
        self.etkin[ad] = govde
        return govde

    # --- 3. düzey -----------------------------------------------------------------------------
    def kaynak_oku(self, ad: str, goreli_yol: str, sinir: int = VARSAYILAN_KAYNAK_SINIRI) -> str:
        """Etkin bir becerinin paketlenmiş dosyasını okur (3. düzey).

        Yol beceri klasörünün içinde kalmalıdır: '../../.ssh/id_rsa' gibi bir yol ya da
        klasör dışını gösteren bir sembolik bağlantı reddedilir.
        """
        if ad not in self.etkin:
            raise KaynakHatasi(f'Önce "{ad}" becerisini etkinleştir: kaynaklara gövde üzerinden ulaşılır')
        kok = self.beceriler[ad].dizin.resolve()
        hedef = (kok / goreli_yol).resolve()  # resolve() sembolik bağlantıları da çözer
        if not hedef.is_relative_to(kok):
            raise KaynakHatasi(f'"{goreli_yol}" beceri klasörünün dışında; okunmadı')
        if not hedef.is_file():
            raise KaynakHatasi(f'"{goreli_yol}" bulunamadı')
        boyut = hedef.stat().st_size
        if boyut > sinir:
            raise KaynakHatasi(f'"{goreli_yol}" {boyut} bayt; sınır {sinir}')
        metin = hedef.read_text(encoding='utf-8', errors='replace')
        self._kaydet(3, ad, goreli_yol, len(metin))
        return metin

    def betikleri_listele(self, ad: str) -> list[str]:
        """scripts/ altındaki dosyaları adlarıyla listeler; içerikleri bağlama girmez."""
        if ad not in self.beceriler:
            raise KeyError(f'Beceri yok: {ad}')
        klasor = self.beceriler[ad].dizin / 'scripts'
        if not klasor.is_dir():
            return []
        adlar = sorted(str(p.relative_to(self.beceriler[ad].dizin)) for p in klasor.rglob('*') if p.is_file())
        self._kaydet(3, ad, 'betik listesi (içerik okunmadı)', sum(len(a) + 1 for a in adlar))
        return adlar

    # --- rapor --------------------------------------------------------------------------------
    def rapor(self) -> str:
        satirlar = ['düzey | beceri | ne | karakter | ~token', '--- | --- | --- | --- | ---']
        for k in self.gunluk:
            satirlar.append(f'{k.duzey} | {k.beceri} | {k.ne} | {k.karakter} | {_token(k.karakter)}')
        satirlar.append(f'toplam | | | {self.kullanilan} | {_token(self.kullanilan)}')
        return '\n'.join(satirlar)

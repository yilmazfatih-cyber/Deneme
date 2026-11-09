"""Ayarlar: kargo, gümrük masrafları, pazaryeri giderleri ve eşikler.

Hepsi `ayarlar.toml` ile geçersiz kılınabilir (örnek: `ayarlar.ornek.toml`). Varsayılanlar temkinlidir.
"""

from __future__ import annotations

import tomllib
from dataclasses import dataclass, field, fields, replace
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class KargoAyarlari:
    usd_kg: float = 5.0  # Çin → Türkiye hava kargo, kg başına (kullanıcının varsayımı)
    ambalaj_payi: float = 0.10  # koli, poşet, etiket için birim ağırlığa eklenen pay
    hacim_bolen: float = 5000.0  # hacimsel ağırlık = en × boy × yükseklik (cm) / bölen; ölçü verilirse


@dataclass(frozen=True)
class GumrukAyarlari:
    sigorta_orani: float = 0.005  # (mal + kargo) × oran; sigortasız gönderide 0
    sevkiyat_sabit_tl: float = 12_000.0  # müşavir (~8.140 TL, 2026) + damga + ardiye + yurt içi teslim
    sevkiyat_mal_bedeli_usd: float = 3_000.0  # bir sevkiyatta planlanan mal bedeli; sabit masraf buna göre dağılır
    odeme_orani: float = 0.03  # tedarikçiye ödeme: kart/havale komisyonu ve kur farkı


@dataclass(frozen=True)
class SatisAyarlari:
    pazaryeri_komisyon: float = 0.215  # Trendyol giyim/aksesuar, KDV dahil satış fiyatına uygulanır (2026)
    siparis_gideri_tl: float = 90.0  # müşteriye kargo + platform hizmet bedeli, KDV hariç (tahmini)
    iade_orani: float = 0.10  # iade olan siparişlerin payı; iade kargosu satıcıya kalır


@dataclass(frozen=True)
class Esikler:
    hedef_kat: float = 3.0  # Türkiye fiyatı (KDV hariç) / birim maliyet (KDV hariç) en az bu kadar
    yakin_kat: float = 2.5  # bu ile hedef arası "eşiğe yakın" listelenir
    min_tr_karsilastirma: int = 3  # Türkiye fiyatı için en az bu kadar benzer ilan
    urun_basina_butce_usd: float = 1_500.0  # MOQ × fiyat bunu aşarsa uyarı
    tahmini_igv_stres: float = 0.15  # "tahmini" vergide İGV'ye eklenen kötü senaryo payı


@dataclass(frozen=True)
class KurAyarlari:
    yedek_usd_tl: float = 50.18  # TCMB'ye ulaşılamazsa (TCMB döviz satış, 09.11.2026)
    onbellek: str = "veri/kur.json"


ODAK_SIRASI = [
    # Önce hafif ve vergi yükü görece düşük aksesuarlar, sonra hazır giyim; ağır ve yüksek vergili olanlar sonda.
    "esarp-sal", "taki-bijuteri", "sac-aksesuari", "orme-atki-eldiven", "sapka-bere", "cuzdan-kartlik",
    "canta-suni-deri", "corap", "ic-giyim-pijama", "sutyen-korse", "gunes-gozlugu", "saat", "kemer",
    "canta-kumas", "sirt-cantasi", "tisort", "gomlek-bluz-tunik", "elbise-etek", "sweatshirt-kazak",
    "pantolon-tayt-sort", "mayo-bikini", "mont-ceket-yelek", "canta-deri", "ayakkabi-terlik",
]  # fmt: skip


@dataclass(frozen=True)
class TaramaAyarlari:
    kategori_sayisi: int = 3  # bir taramada bakılan kategori
    kategori_basina_aday: int = 5  # her kategoride hesaplayıcıya gönderilen aday
    odak: list[str] = field(default_factory=lambda: list(ODAK_SIRASI))  # rotasyon sırası; tarifede olmayan atlanır


@dataclass(frozen=True)
class Ayarlar:
    kargo: KargoAyarlari = field(default_factory=KargoAyarlari)
    gumruk: GumrukAyarlari = field(default_factory=GumrukAyarlari)
    satis: SatisAyarlari = field(default_factory=SatisAyarlari)
    esikler: Esikler = field(default_factory=Esikler)
    kur: KurAyarlari = field(default_factory=KurAyarlari)
    tarama: TaramaAyarlari = field(default_factory=TaramaAyarlari)
    veritabani: str = "veri/ithalat.db"
    rapor_klasoru: str = "raporlar"
    tarife: str = ""  # boşsa paketteki tarife.toml


_BOLUMLER = ("kargo", "gumruk", "satis", "esikler", "kur", "tarama")


def _birlestir(nesne: Any, sozluk: dict[str, Any], ad: str) -> Any:
    gecerli = {f.name for f in fields(nesne)}
    bilinmeyen = set(sozluk) - gecerli
    if bilinmeyen:
        raise ValueError(f"Bilinmeyen ayar(lar) [{ad}]: {', '.join(sorted(bilinmeyen))}")
    return replace(nesne, **sozluk)


def ayarlari_yukle(yol: str | Path | None = None) -> Ayarlar:
    ayarlar = Ayarlar()
    if yol is None:
        yol = Path("ayarlar.toml")
        if not yol.exists():
            return ayarlar
    with open(yol, "rb") as f:
        ham = tomllib.load(f)
    bolumler = {ad: _birlestir(getattr(ayarlar, ad), ham.pop(ad, {}), ad) for ad in _BOLUMLER}
    ayarlar = _birlestir(ayarlar, ham, "genel")
    return replace(ayarlar, **bolumler)

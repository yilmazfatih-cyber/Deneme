"""İşletme yapılandırmasını (JSON) okur ve doğrular.

Örnek dosya: ornek/isletme.json. Saatler 'SS:DD-SS:DD' aralıkları olarak, gün adları Türkçe
(pazartesi … pazar) yazılır; boş liste o gün kapalı demektir. Kapanış için '24:00' (gün sonu)
yazılabilir; gece yarısını aşan vardiya (ör. 18:00-02:00) desteklenmez. Saatler içeride gün
başından itibaren dakika olarak tutulur (0-1440).

Hatalı yapılandırma bot çalışırken değil, açılışta anlaşılır bir ValueError ile durur.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from .metin import GUNLER, sadelestir
from .zaman import saat_dilimi

# Hizmet kodu komut satırında ve beceri dosyasındaki komut örneğinde geçer: yalnız güvenli karakterler.
KOD_DESENI = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")


@dataclass(frozen=True)
class Hizmet:
    kod: str
    ad: str
    sure_dk: int
    fiyat_tl: int | None
    anahtarlar: tuple[str, ...]

    def fiyat_metni(self) -> str:
        """Bot yanıtı, beceri dosyası ve model istemi aynı metni kullanır (fiyatsız hizmette "None TL" yazılmaz)."""
        return f"{self.fiyat_tl} TL" if self.fiyat_tl is not None else "fiyatı işletmeye sorulmalı"


@dataclass(frozen=True)
class Sss:
    soru: str
    cevap: str
    anahtarlar: tuple[str, ...]


@dataclass(frozen=True)
class Isletme:
    ad: str
    tur: str
    adres: str
    telefon: str
    harita: str
    kaynaklar: tuple[str, ...]  # personel, koltuk, saha ya da oda: aynı anda kaç randevu alınabilir
    saatler: dict[int, tuple[tuple[int, int], ...]]  # 0 = pazartesi; (açılış, kapanış) gün başından dakika
    tatiller: frozenset[date]
    hizmetler: tuple[Hizmet, ...]
    sss: tuple[Sss, ...]
    politikalar: tuple[str, ...]
    adim_dk: int = 15
    en_erken_dk: int = 60
    en_gec_gun: int = 14
    saklama_gun: int = 180
    devir_saklama_gun: int = 30
    musteri_basina_azami: int = 2
    hassas_veri: bool = False
    kvkk_url: str = ""
    sahip_sohbet_id: int | None = None
    saat_dilimi: str = "Europe/Istanbul"

    def hizmet(self, kod: str | None) -> Hizmet | None:
        return next((h for h in self.hizmetler if h.kod == kod), None)


def dk_metni(dakika: int) -> str:
    """Gün başından dakika → 'SS:DD' (1440 → '24:00')."""
    return f"{dakika // 60:02d}:{dakika % 60:02d}"


def _dakika(metin: str) -> int:
    eslesme = re.fullmatch(r"\s*(\d{1,2}):(\d{2})\s*", metin)
    if not eslesme:
        raise ValueError(f"Saat 'SS:DD' biçiminde olmalı: {metin!r}")
    saat, dakika = int(eslesme.group(1)), int(eslesme.group(2))
    if dakika > 59 or saat > 24 or (saat == 24 and dakika):
        raise ValueError(f"Geçersiz saat: {metin!r}")
    return saat * 60 + dakika


def _araliklar(gun_adi: str, liste: object) -> tuple[tuple[int, int], ...]:
    if not isinstance(liste, list):
        raise ValueError(f"{gun_adi}: çalışma saatleri liste olmalı (kapalı gün için [])")
    sonuc = []
    for aralik in liste:
        parcalar = str(aralik).split("-")
        if len(parcalar) != 2:
            raise ValueError(f"Geçersiz çalışma aralığı: {aralik!r} ('SS:DD-SS:DD' olmalı)")
        bas, bit = _dakika(parcalar[0]), _dakika(parcalar[1])
        if bit <= bas:
            raise ValueError(
                f"Geçersiz çalışma aralığı: {aralik!r} (gece yarısını aşan vardiya desteklenmez; kapanış en geç 24:00)"
            )
        sonuc.append((bas, bit))
    sonuc.sort()
    for (_, onceki_bit), (sonraki_bas, _) in zip(sonuc, sonuc[1:]):
        if sonraki_bas < onceki_bit:
            raise ValueError(f"{gun_adi}: çalışma aralıkları çakışıyor")
    return tuple(sonuc)


def _tam_sayi(veri: dict, ad: str, varsayilan: int | None, en_az: int, en_cok: int) -> int:
    deger = veri.get(ad, varsayilan)
    if isinstance(deger, bool) or not isinstance(deger, int) or not en_az <= deger <= en_cok:
        raise ValueError(f"'{ad}' {en_az}-{en_cok} arasında bir tam sayı olmalı (verilen: {deger!r})")
    return deger


def _metin(veri: dict, ad: str, varsayilan: str = "") -> str:
    deger = veri.get(ad, varsayilan)
    if not isinstance(deger, str):
        raise ValueError(f"'{ad}' metin olmalı")
    return deger.strip()


def _metin_listesi(veri: dict, ad: str) -> tuple[str, ...]:
    deger = veri.get(ad, [])
    if not isinstance(deger, list) or not all(isinstance(d, str) for d in deger):
        raise ValueError(f"'{ad}' metinlerden oluşan bir liste olmalı")
    return tuple(deger)


def _hizmet(h: object) -> Hizmet:
    if not isinstance(h, dict):
        raise ValueError("Her hizmet bir nesne olmalı")
    kod = h.get("kod")
    if not isinstance(kod, str) or len(kod) > 40 or not KOD_DESENI.fullmatch(kod):
        raise ValueError(f"Hizmet kodu küçük harf, rakam ve tireden oluşmalı (en çok 40 karakter): {kod!r}")
    ad = _metin(h, "ad")
    if not ad:
        raise ValueError(f"'{kod}' hizmetinin adı boş olamaz")
    fiyat = h.get("fiyat_tl")
    if fiyat is not None and (isinstance(fiyat, bool) or not isinstance(fiyat, int) or fiyat < 0):
        raise ValueError(f"'{kod}' fiyatı boş (null) ya da sıfır veya pozitif bir tam sayı olmalı")
    return Hizmet(kod, ad, _tam_sayi(h, "sure_dk", None, 5, 720), fiyat, _metin_listesi(h, "anahtarlar"))


def sozlukten(veri: dict) -> Isletme:
    if not isinstance(veri, dict):
        raise ValueError("Yapılandırma bir JSON nesnesi olmalı")
    ad = _metin(veri, "ad")
    if not ad:
        raise ValueError("'ad' boş olamaz")
    saatler: dict[int, tuple[tuple[int, int], ...]] = {no: () for no in range(7)}
    calisma = veri.get("calisma_saatleri", {})
    if not isinstance(calisma, dict):
        raise ValueError("'calisma_saatleri' gün adı → aralık listesi biçiminde olmalı")
    for gun_adi, liste in calisma.items():
        no = GUNLER.get(sadelestir(gun_adi))
        if no is None:
            raise ValueError(f"Bilinmeyen gün adı: {gun_adi!r}")
        saatler[no] = _araliklar(gun_adi, liste)
    hizmet_listesi = veri.get("hizmetler")
    if not isinstance(hizmet_listesi, list) or not hizmet_listesi:
        raise ValueError("En az bir hizmet olmalı")
    hizmetler = tuple(_hizmet(h) for h in hizmet_listesi)
    if len({h.kod for h in hizmetler}) != len(hizmetler):
        raise ValueError("Hizmet kodları benzersiz olmalı")
    kaynaklar = veri.get("kaynaklar") or ["Genel"]
    if (
        not isinstance(kaynaklar, list)
        or not all(isinstance(k, str) and k.strip() for k in kaynaklar)
        or len(set(kaynaklar)) != len(kaynaklar)
    ):
        raise ValueError("'kaynaklar' benzersiz ve boş olmayan adlardan oluşan bir liste olmalı")
    sss = []
    for s in veri.get("sss", []):
        if not isinstance(s, dict):
            raise ValueError("Her SSS bir nesne olmalı")
        sss.append(Sss(_metin(s, "soru"), _metin(s, "cevap"), _metin_listesi(s, "anahtarlar")))
    sahip = veri.get("sahip_sohbet_id")
    if sahip is not None and (isinstance(sahip, bool) or not isinstance(sahip, int)):
        raise ValueError("'sahip_sohbet_id' tam sayı ya da null olmalı")
    tatiller = veri.get("tatiller", [])
    if not isinstance(tatiller, list):
        raise ValueError("'tatiller' YYYY-AA-GG tarihlerinden oluşan bir liste olmalı")
    bolge = _metin(veri, "saat_dilimi", "Europe/Istanbul")
    saat_dilimi(bolge)  # bilinmeyen saat dilimi açılışta hata versin
    return Isletme(
        ad=ad,
        tur=_metin(veri, "tur", "işletme") or "işletme",
        adres=_metin(veri, "adres"),
        telefon=_metin(veri, "telefon"),
        harita=_metin(veri, "harita"),
        kaynaklar=tuple(k.strip() for k in kaynaklar),
        saatler=saatler,
        tatiller=frozenset(date.fromisoformat(str(t)) for t in tatiller),
        hizmetler=hizmetler,
        sss=tuple(sss),
        politikalar=_metin_listesi(veri, "politikalar"),
        adim_dk=_tam_sayi(veri, "adim_dk", 15, 5, 240),
        en_erken_dk=_tam_sayi(veri, "en_erken_dk", 60, 0, 7 * 24 * 60),
        en_gec_gun=_tam_sayi(veri, "en_gec_gun", 14, 1, 365),
        saklama_gun=_tam_sayi(veri, "saklama_gun", 180, 1, 3650),
        devir_saklama_gun=_tam_sayi(veri, "devir_saklama_gun", 30, 1, 365),
        musteri_basina_azami=_tam_sayi(veri, "musteri_basina_azami", 2, 1, 20),
        hassas_veri=bool(veri.get("hassas_veri", False)),
        kvkk_url=_metin(veri, "kvkk_url"),
        sahip_sohbet_id=sahip,
        saat_dilimi=bolge,
    )


def yukle(yol: str | Path) -> Isletme:
    return sozlukten(json.loads(Path(yol).read_text(encoding="utf-8")))

"""Altyazı: bölütleri ekrana sığan ipuçlarına (cue) böler; SRT ve WebVTT üretir ve okur (sıfırdan).

Bölme: sözcük zamanları varsa sözcük sözcük toplanır; ipucu `azami_satir` × `azami_karakter`'e sığmayınca
ya da `azami_sure`'yi aşınca yeni ipucu başlar; cümle sonu noktalamasında (. ? !) erken bölünür.
Sözcük zamanı yoksa metin karakter sayısıyla orantılı zaman paylaştırılarak bölünür. İki satıra bölme
en dengeli sözcük sınırından yapılır. Zamanlar milisaniyeye yuvarlanır; ipuçları örtüşmez, her ipucu
en az `en_kisa_sure` görünür (sonrakini ezmeden). Biçim: SRT "00:01:02,345", WebVTT "00:01:02.345";
VTT'de & < > kaçışlanır (metindeki "-->" böylece bozamaz). Kim kullanır: komutlar.py, sunucu/bicim.py.
Genişletme: başka bir biçim (ör. TTML) → `ipuclarina_bol` çıktısını yazan yeni bir işlev + testi.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from ses.hatalar import BicimHatasi
from ses.stt.tipler import Bolut

_CUMLE_SONU = (".", "?", "!", "…")


@dataclass(frozen=True)
class Ipucu:
    """Bir altyazı ipucu: başlangıç, bitiş (saniye) ve metin (satırlar \\n ile ayrılır)."""

    baslangic: float
    bitis: float
    metin: str


def _zaman(saniye: float, ayrac: str) -> str:
    ms = max(0, round(saniye * 1000))
    saat, ms = divmod(ms, 3_600_000)
    dakika, ms = divmod(ms, 60_000)
    sn, ms = divmod(ms, 1000)
    return f"{saat:02d}:{dakika:02d}:{sn:02d}{ayrac}{ms:03d}"


def zaman_srt(saniye: float) -> str:
    """3723.5 → "01:02:03,500"."""
    return _zaman(saniye, ",")


def zaman_vtt(saniye: float) -> str:
    """3723.5 → "01:02:03.500"."""
    return _zaman(saniye, ".")


def satirlara_bol(metin: str, azami_karakter: int = 42) -> list[str]:
    """Metni en dengeli sözcük sınırından iki satıra böler (sığıyorsa tek satır)."""
    metin = " ".join(metin.split())
    if len(metin) <= azami_karakter:
        return [metin] if metin else []
    sozcukler = metin.split(" ")
    en_iyi: tuple[int, int] | None = None
    for i in range(1, len(sozcukler)):
        uzun = max(len(" ".join(sozcukler[:i])), len(" ".join(sozcukler[i:])))
        if en_iyi is None or uzun < en_iyi[0]:
            en_iyi = (uzun, i)
    assert en_iyi is not None
    return [" ".join(sozcukler[: en_iyi[1]]), " ".join(sozcukler[en_iyi[1] :])]


def _sigar_mi(metin: str, azami_karakter: int, azami_satir: int) -> bool:
    satirlar = satirlara_bol(metin, azami_karakter)
    return len(satirlar) <= azami_satir and all(len(s) <= azami_karakter for s in satirlar)


def _sozcuklerle_bol(
    bolut: Bolut, azami_karakter: int, azami_satir: int, azami_sure: float
) -> list[Ipucu]:
    ipuclari: list[Ipucu] = []
    grup: list[tuple[float, float, str]] = []
    for k in bolut.kelimeler:
        sozcuk = k.metin.strip()
        if not sozcuk:
            continue
        aday = " ".join([*(g[2] for g in grup), sozcuk])
        tasar = grup and (
            not _sigar_mi(aday, azami_karakter, azami_satir) or k.bitis - grup[0][0] > azami_sure
        )
        if tasar:
            ipuclari.append(Ipucu(grup[0][0], grup[-1][1], " ".join(g[2] for g in grup)))
            grup = []
        grup.append((k.baslangic, k.bitis, sozcuk))
        if sozcuk.endswith(_CUMLE_SONU) and len(" ".join(g[2] for g in grup)) >= azami_karakter // 2:
            ipuclari.append(Ipucu(grup[0][0], grup[-1][1], " ".join(g[2] for g in grup)))
            grup = []
    if grup:
        ipuclari.append(Ipucu(grup[0][0], grup[-1][1], " ".join(g[2] for g in grup)))
    return ipuclari


def _orantili_bol(bolut: Bolut, azami_karakter: int, azami_satir: int) -> list[Ipucu]:
    parcalar: list[str] = []
    for sozcuk in bolut.metin.split():
        aday = f"{parcalar[-1]} {sozcuk}" if parcalar else sozcuk
        if parcalar and _sigar_mi(aday, azami_karakter, azami_satir):
            parcalar[-1] = aday
        else:
            parcalar.append(sozcuk)
    toplam = sum(len(p) for p in parcalar) or 1
    ipuclari, an = [], bolut.baslangic
    for parca in parcalar:
        sure = (bolut.bitis - bolut.baslangic) * len(parca) / toplam
        ipuclari.append(Ipucu(an, an + sure, parca))
        an += sure
    return ipuclari


def ipuclarina_bol(
    bolutler: list[Bolut],
    *,
    azami_karakter: int = 42,
    azami_satir: int = 2,
    azami_sure: float = 7.0,
    en_kisa_sure: float = 0.7,
) -> list[Ipucu]:
    """Bölütleri ekrana sığan, örtüşmeyen, satırlara bölünmüş ipuçlarına çevirir."""
    if azami_karakter < 10 or azami_satir < 1 or azami_sure <= 0:
        raise BicimHatasi("Altyazı ayarları geçersiz (en az 10 karakter, 1 satır, pozitif süre).")
    ham: list[Ipucu] = []
    for bolut in bolutler:
        if not bolut.metin.strip():
            continue
        if bolut.kelimeler:
            ham.extend(_sozcuklerle_bol(bolut, azami_karakter, azami_satir, azami_sure))
        else:
            ham.extend(_orantili_bol(bolut, azami_karakter, azami_satir))
    ham.sort(key=lambda i: i.baslangic)
    sonuc: list[Ipucu] = []
    for sira, ipucu in enumerate(ham):
        sonraki = ham[sira + 1].baslangic if sira + 1 < len(ham) else float("inf")
        bas = max(ipucu.baslangic, sonuc[-1].bitis if sonuc else 0.0)
        bitis = min(max(ipucu.bitis, bas + en_kisa_sure), sonraki)
        if bitis <= bas:
            bitis = bas + 0.001
        metin = "\n".join(satirlara_bol(ipucu.metin, azami_karakter))
        sonuc.append(Ipucu(round(bas, 3), round(bitis, 3), metin))
    return sonuc


def _satir_temizle(metin: str) -> str:
    """İpucu metninde boş satır olamaz (biçimi bozar); satırlar kırpılır."""
    return "\n".join(s.strip() for s in metin.splitlines() if s.strip())


def srt_uret(ipuclari: list[Ipucu]) -> str:
    """SRT metni (UTF-8 yazın). Boş listede boş dizgi."""
    bloklar = [
        f"{i}\n{zaman_srt(p.baslangic)} --> {zaman_srt(p.bitis)}\n"
        f"{_satir_temizle(p.metin).replace('-->', '->')}\n"
        for i, p in enumerate(ipuclari, start=1)
    ]
    return "\n".join(bloklar)


def _vtt_kacis(metin: str) -> str:
    return metin.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def vtt_uret(ipuclari: list[Ipucu]) -> str:
    """WebVTT metni ("WEBVTT" başlığıyla)."""
    bloklar = [
        f"{zaman_vtt(p.baslangic)} --> {zaman_vtt(p.bitis)}\n{_vtt_kacis(_satir_temizle(p.metin))}\n"
        for p in ipuclari
    ]
    return "WEBVTT\n\n" + "\n".join(bloklar)


_ZAMAN = r"(\d{1,}):(\d{2}):(\d{2})[,.](\d{3})"
_ZAMAN_SATIRI = re.compile(_ZAMAN + r"\s*-->\s*" + _ZAMAN)


def _saniye(parcalar: tuple[str, ...]) -> float:
    saat, dakika, sn, ms = (int(p) for p in parcalar)
    return saat * 3600 + dakika * 60 + sn + ms / 1000


def _bloklari_coz(metin: str, kacisli: bool) -> list[Ipucu]:
    ipuclari: list[Ipucu] = []
    for blok in re.split(r"\n\s*\n", metin.replace("\r\n", "\n").strip()):
        satirlar = blok.split("\n")
        konum = next((i for i, s in enumerate(satirlar) if _ZAMAN_SATIRI.search(s)), None)
        if konum is None:
            continue  # başlık, NOTE, STYLE blokları
        eslesme = _ZAMAN_SATIRI.search(satirlar[konum])
        assert eslesme is not None
        govde = "\n".join(satirlar[konum + 1 :])
        if kacisli:
            govde = govde.replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&")
        ipuclari.append(Ipucu(_saniye(eslesme.groups()[:4]), _saniye(eslesme.groups()[4:]), govde))
    return ipuclari


def srt_coz(metin: str) -> list[Ipucu]:
    """SRT metnini ipuçlarına çevirir (sıra numaraları yok sayılır)."""
    return _bloklari_coz(metin, kacisli=False)


def vtt_coz(metin: str) -> list[Ipucu]:
    """WebVTT metnini ipuçlarına çevirir ("WEBVTT" başlığı zorunlu)."""
    if not metin.lstrip(chr(0xFEFF)).startswith("WEBVTT"):
        raise BicimHatasi("WebVTT dosyası 'WEBVTT' satırıyla başlamalı.")
    return _bloklari_coz(metin, kacisli=True)

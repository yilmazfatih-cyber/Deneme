"""WAV okuma/yazma: okuma kendi küçük RIFF ayrıştırıcımızla, yazma stdlib `wave` ile.

Neden kendi okuyucumuz: `wave` modülü yalnız tam sayı PCM okur (Python 3.11'de WAVE_FORMAT_EXTENSIBLE
de okumaz); oysa ses düzenleyiciler sıkça 32 bit float ya da "extensible" WAV yazar. Bu okuyucu
PCM 8/16/24/32 bit, IEEE float 32/64 bit ve extensible başlığı tanır; bilinmeyen parçaları (LIST…)
atlar; veri parçası boyu yanlış yazılmışsa (akış kaydı) dosyada olanı okur. Süre sınırı veri
OKUNMADAN önce başlıktan denetlenir (sunucuda bellek doldurma saldırısına karşı).
Kim kullanır: komutlar.py, sunucu/, tts/ (çıktı), testler. Testte `wave` başvuru okuyucudur.
Genişletme: yeni bir biçim kodu için `_bicim_coz`'a dal ekleyin; tests/test_wav.py'ye örnek koyun.
"""

from __future__ import annotations

import io
import struct
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO

import numpy as np

from ses.hatalar import BicimHatasi, SinirHatasi, dosya_hatasi
from ses.ses_isleme.ses import Ses, pcm_coz, pcm_kodla

_PCM, _FLOAT, _GENIS = 1, 3, 0xFFFE
KAYNAK = str | Path | bytes | BinaryIO


@dataclass(frozen=True)
class WavBilgisi:
    """WAV başlığından okunan bilgiler (veri okunmadan)."""

    bicim: str  # "pcm" ya da "float"
    kanal: int
    ornekleme: int
    bit: int
    ornek_sayisi: int  # kanal başına
    veri_konumu: int
    veri_boyu: int

    @property
    def sure(self) -> float:
        return self.ornek_sayisi / self.ornekleme


def _ac(kaynak: KAYNAK) -> tuple[BinaryIO, bool]:
    if isinstance(kaynak, bytes | bytearray | memoryview):
        return io.BytesIO(bytes(kaynak)), True
    if isinstance(kaynak, str | Path):
        try:
            return open(kaynak, "rb"), True
        except OSError as hata:
            raise dosya_hatasi(kaynak, hata) from hata
    return kaynak, False


def _bicim_coz(fmt: bytes) -> tuple[str, int, int, int]:
    """'fmt ' parçasından (biçim, kanal, örnekleme, bit) çıkarır."""
    if len(fmt) < 16:
        raise BicimHatasi("WAV 'fmt ' parçası çok kısa; dosya bozuk.")
    kod, kanal, ornekleme, _bayt_hizi, blok, bit = struct.unpack("<HHIIHH", fmt[:16])
    if kod == _GENIS:
        if len(fmt) < 40:
            raise BicimHatasi("WAVE_FORMAT_EXTENSIBLE başlığı eksik; dosya bozuk.")
        kod = struct.unpack("<H", fmt[24:26])[0]  # alt biçim GUID'inin ilk iki baytı
    if kod not in (_PCM, _FLOAT):
        raise BicimHatasi(
            f"Bu WAV sıkıştırılmış ya da desteklenmeyen biçimde (kod {kod}). "
            "ffmpeg ile çevirin: python -m ses yaziya dosya.wav (ffmpeg kuruluysa kendiliğinden)."
        )
    bicim = "pcm" if kod == _PCM else "float"
    gecerli = {"pcm": (8, 16, 24, 32), "float": (32, 64)}[bicim]
    if bit not in gecerli:
        raise BicimHatasi(f"{bicim} WAV için {bit} bit desteklenmiyor ({gecerli}).")
    if not 1 <= kanal <= 32 or not 1000 <= ornekleme <= 768_000:
        raise BicimHatasi(f"WAV başlığı akla yatkın değil: {kanal} kanal, {ornekleme} Hz.")
    if blok != kanal * bit // 8:
        raise BicimHatasi("WAV blok boyu kanal × bit ile uyuşmuyor; dosya bozuk.")
    return bicim, kanal, ornekleme, bit


def _parcalari_tara(akis: BinaryIO) -> WavBilgisi:
    bas = akis.read(12)
    if len(bas) < 12 or bas[:4] != b"RIFF" or bas[8:12] != b"WAVE":
        ipucu = " (RF64/BW64: ffmpeg ile çevirin)" if bas[:4] in (b"RF64", b"BW64") else ""
        raise BicimHatasi(f"Bu bir WAV dosyası değil{ipucu}. mp3/ogg/m4a için ffmpeg gerekir.")
    akis.seek(0, io.SEEK_END)
    toplam = akis.tell()
    konum = 12
    bicim_bilgisi: tuple[str, int, int, int] | None = None
    while konum + 8 <= toplam:
        akis.seek(konum)
        kimlik, boy = struct.unpack("<4sI", akis.read(8))
        govde = konum + 8
        if kimlik == b"fmt ":
            akis.seek(govde)
            bicim_bilgisi = _bicim_coz(akis.read(min(boy, 64)))
        elif kimlik == b"data":
            if bicim_bilgisi is None:
                raise BicimHatasi("WAV'da 'data' parçası 'fmt ' parçasından önce geliyor.")
            bicim, kanal, ornekleme, bit = bicim_bilgisi
            kalan = toplam - govde
            if boy > kalan or boy == 0xFFFFFFFF:  # akışla yazılmış ya da kesik dosya
                boy = kalan
            blok = kanal * bit // 8
            boy -= boy % blok
            return WavBilgisi(bicim, kanal, ornekleme, bit, boy // blok, govde, boy)
        konum = govde + boy + (boy & 1)  # tek boylu parçadan sonra bir dolgu baytı
    raise BicimHatasi("WAV dosyasında 'data' parçası bulunamadı; dosya bozuk ya da boş.")


def wav_bilgisi(kaynak: KAYNAK) -> WavBilgisi:
    """Yalnız başlığı okur (veriyi belleğe almaz): biçim, kanal, örnekleme, süre."""
    akis, kapat = _ac(kaynak)
    try:
        return _parcalari_tara(akis)
    finally:
        if kapat:
            akis.close()


def wav_oku(kaynak: KAYNAK, *, azami_sure: float | None = None) -> Ses:
    """WAV'ı okur → `Ses` (float32). `azami_sure` (saniye) aşılırsa veri okunmadan `SinirHatasi`."""
    akis, kapat = _ac(kaynak)
    try:
        bilgi = _parcalari_tara(akis)
        if azami_sure is not None and bilgi.sure > azami_sure:
            raise SinirHatasi(
                f"Ses çok uzun: {bilgi.sure:.0f} sn (sınır {azami_sure:.0f} sn). Dosyayı bölün."
            )
        akis.seek(bilgi.veri_konumu)
        ham = akis.read(bilgi.veri_boyu)
    finally:
        if kapat:
            akis.close()
    duz = pcm_coz(ham, bilgi.bit // 8, bilgi.bicim)
    ornek = len(duz) // bilgi.kanal
    return Ses(duz[: ornek * bilgi.kanal].reshape(ornek, bilgi.kanal), bilgi.ornekleme)


def wav_yaz(hedef: str | Path | BinaryIO, ses: Ses, *, bit: int = 16) -> None:
    """`Ses`'i tam sayı PCM WAV olarak yazar (varsayılan 16 bit; 24 ve 32 de olur)."""
    if bit not in (16, 24, 32):
        raise BicimHatasi("WAV yazarken bit 16, 24 ya da 32 olmalı.")
    yazici = wave.open(str(hedef) if isinstance(hedef, Path) else hedef, "wb")  # noqa: SIM115
    try:
        yazici.setnchannels(ses.kanal)
        yazici.setsampwidth(bit // 8)
        yazici.setframerate(ses.ornekleme)
        yazici.writeframes(pcm_kodla(np.ascontiguousarray(ses.ornekler).reshape(-1), bit // 8))
    finally:
        yazici.close()


def wav_bayt(ses: Ses, *, bit: int = 16) -> bytes:
    """`Ses`'i bellekte WAV baytlarına çevirir (sunucu yanıtı, ffmpeg girdisi)."""
    tampon = io.BytesIO()
    wav_yaz(tampon, ses, bit=bit)
    return tampon.getvalue()

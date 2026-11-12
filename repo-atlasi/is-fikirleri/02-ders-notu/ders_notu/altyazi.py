"""WebVTT ve SRT altyazı ayrıştırıcı.

Otomatik altyazılar "kayan" yazılır: her ipucu bir öncekinin son satırını tekrarlar.
Aynı satır art arda gelirse yalnızca bir kez alınır.
"""

import codecs
import html
import re
from dataclasses import dataclass

_ZAMAN = re.compile(r"(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{3})")
# Yalnızca bilinen satır içi imler silinir: <c>, <c.renk>, <v Konuşmacı>, <i>, <b>, <u>, <font ...>,
# <00:00:01.500> gibi kelime zamanı imleri. "3 < 5 ve 7 > 2" gibi düz metindeki işaretler korunur.
_ETIKET = re.compile(
    r"</?(?:c|v|i|b|u|ruby|rt|lang|font|span)(?=[\s./>])[^>]*>|<\d+(?::\d{2}){1,2}[.,]\d{3}>",
    re.IGNORECASE,
)
_SATIR_SONU = re.compile(r"<br\s*/?>", re.IGNORECASE)


@dataclass
class Parca:
    bas: float
    son: float
    metin: str


def zaman_sn(metin: str) -> float:
    m = _ZAMAN.fullmatch(metin.strip())
    if not m:
        raise ValueError(f"Zaman damgası okunamadı: {metin!r}")
    sa, dk, sn, ms = m.groups()
    return int(sa or 0) * 3600 + int(dk) * 60 + int(sn) + int(ms) / 1000


def zaman_yaz(saniye: float) -> str:
    sa, kalan = divmod(max(int(saniye), 0), 3600)
    dk, sn = divmod(kalan, 60)
    return f"{sa}:{dk:02d}:{sn:02d}" if sa else f"{dk:02d}:{sn:02d}"


def metni_coz(veri: bytes) -> tuple[str, str | None]:
    """Altyazı baytlarını metne çevirir ve (metin, uyarı) döndürür.

    Sıra: UTF-16 BOM, UTF-8 (BOM'lu ya da BOM'suz), son çare Windows-1254. Windows'ta hazırlanmış Türkçe .srt
    dosyaları cp1254 olabilir; UTF-8 sanılıp okunursa "ş", "ğ", "ı" bozulur ya da program hata verir.
    """
    if veri.startswith((codecs.BOM_UTF16_LE, codecs.BOM_UTF16_BE)):
        return veri.decode("utf-16"), None
    try:
        return veri.decode("utf-8-sig"), None
    except UnicodeDecodeError:
        uyari = "Altyazı UTF-8 değil; Windows-1254 (Türkçe) kodlamasıyla okundu, metni kontrol edin."
        return veri.decode("cp1254", errors="replace"), uyari


def ayristir(metin: str, uyarilar: list[str] | None = None) -> list[Parca]:
    """VTT ve SRT aynı yapıdadır: boş satırla ayrılmış bloklar, içinde 'baş --> son' satırı.

    Zaman damgası okunamayan bloklar atlanır; sayıları `uyarilar` listesine yazılır.
    """
    parcalar: list[Parca] = []
    onceki, bozuk = None, 0
    bloklar = re.split(r"\n\s*\n", metin.replace("\r\n", "\n").replace("\r", "\n").strip())
    for blok in bloklar:
        satirlar = blok.split("\n")
        i = next((k for k, s in enumerate(satirlar) if "-->" in s), None)
        if i is None:
            continue  # WEBVTT başlığı, NOTE, STYLE ya da REGION bloğu
        bas, _, son = satirlar[i].partition("-->")
        try:
            # "00:05.000 align:start" gibi ipucu ayarları atılır
            bas_sn, son_sn = zaman_sn(bas), zaman_sn((son.split() or [""])[0])
        except ValueError:
            bozuk += 1
            continue
        for satir in satirlar[i + 1 :]:
            temiz = " ".join(html.unescape(_ETIKET.sub("", _SATIR_SONU.sub(" ", satir))).split())
            if temiz and temiz != onceki:
                parcalar.append(Parca(bas_sn, max(son_sn, bas_sn), temiz))
                onceki = temiz
    if bozuk and uyarilar is not None:
        uyarilar.append(f"{bozuk} altyazı bloğunun zaman damgası okunamadı; bu bloklar atlandı.")
    return parcalar

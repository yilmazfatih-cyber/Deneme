"""SSE (Server-Sent Events) akış ayrıştırıcısı.

Sunucudan gelen bayt parçalarını önce satırlara, sonra olaylara çevirir. Hoşgörülüdür:
    - parçalar satırın ya da çok baytlı bir harfin ortasından bölünebilir,
    - satır sonu \\n, \\r\\n ya da \\r olabilir,
    - "data:" sonrasında boşluk olmayabilir; ":" ile başlayan satırlar yorumdur (canlı tutma),
    - son olay boş satırla bitmeyebilir,
    - bazı sunucular SSE yerine satır başına bir JSON (NDJSON) yollar; o da olay sayılır.
Kim kullanır: saglayici/openai_uyumlu.py; sunucu testleri.
Genişletme: yeni bir alan gerekirse `SseOlayi`'na ekleyin; ayrıştırma `_alan_isle` içindedir.
"""

from __future__ import annotations

import codecs
from collections.abc import Iterable, Iterator
from dataclasses import dataclass


@dataclass(frozen=True)
class SseOlayi:
    """Tek bir SSE olayı. `veri` birden çok "data:" satırının \\n ile birleşimidir."""

    veri: str
    olay: str = "message"
    kimlik: str | None = None


def satirlara_bol(parcalar: Iterable[bytes | str]) -> Iterator[str]:
    """Bayt/dizgi parçalarını satır satır verir (satır sonu karakterleri olmadan)."""
    cozucu = codecs.getincrementaldecoder("utf-8")(errors="replace")
    tampon = ""
    for parca in parcalar:
        tampon += cozucu.decode(parca) if isinstance(parca, bytes) else parca
        while True:
            konum = _satir_sonu_bul(tampon)
            if konum is None:
                break
            bitis, sonraki = konum
            yield tampon[:bitis]
            tampon = tampon[sonraki:]
    tampon += cozucu.decode(b"", final=True)
    if tampon:
        yield tampon.rstrip("\r")


def _satir_sonu_bul(tampon: str) -> tuple[int, int] | None:
    """İlk satır sonunun (bitiş, sonraki satır başı) konumunu döndürür; yoksa None."""
    for i, harf in enumerate(tampon):
        if harf == "\n":
            return i, i + 1
        if harf == "\r":
            if i + 1 == len(tampon):
                return None  # ardından \n gelebilir; sonraki parçayı bekle
            return (i, i + 2) if tampon[i + 1] == "\n" else (i, i + 1)
    return None


def sse_olaylari(satirlar: Iterable[str]) -> Iterator[SseOlayi]:
    """Satırlardan SSE olayları üretir."""
    veri: list[str] = []
    olay = "message"
    kimlik: str | None = None
    for satir in satirlar:
        if satir == "":
            if veri:
                yield SseOlayi("\n".join(veri), olay, kimlik)
            veri, olay = [], "message"
            continue
        if satir.startswith(":"):
            continue  # yorum / canlı tutma
        if satir.lstrip().startswith(("{", "[")) and not veri:
            yield SseOlayi(satir.strip(), olay, kimlik)  # NDJSON: satırın kendisi veridir
            continue
        alan, ayrac, deger = satir.partition(":")
        if not ayrac:
            continue  # ayraçsız satır: tanımsız alan, yok say
        deger = deger.removeprefix(" ")
        if alan == "data":
            veri.append(deger)
        elif alan == "event":
            olay = deger or "message"
        elif alan == "id":
            kimlik = deger
    if veri:
        yield SseOlayi("\n".join(veri), olay, kimlik)


def sse_bicimle(veri: str, olay: str | None = None) -> str:
    """Bir olayı tel biçimine çevirir (sunucu tarafı). Çok satırlı veri satır satır yazılır."""
    satirlar = [f"event: {olay}"] if olay else []
    satirlar.extend(f"data: {satir}" for satir in veri.split("\n"))
    return "\n".join(satirlar) + "\n\n"

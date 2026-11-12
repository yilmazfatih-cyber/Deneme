"""Aşama 4 — çıktı şablonu: '%(title)s [%(id)s].%(ext)s' -> güvenli dosya yolu.

yt-dlp'nin -o seçeneği Python'un printf tarzı %-biçimlendirmesini genişletir
(YoutubeDL.prepare_outtmpl / evaluate_outtmpl). Biz şu alt kümeyi yazıyoruz:
  * %(alan)s, %(alan)05d, %(alan).10s       -> normal % biçimleri
  * %(alan|varsayılan)s                      -> alan yoksa varsayılan
  * %(formats.0.height)s                     -> noktalı yol (sözlük/liste)
  * alan hiç yoksa 'NA' (asıl projedeki outtmpl_na_placeholder varsayılanı)
Alan DEĞERLERİ dosya adı için temizlenir; şablondaki '/' ise dizin ayırıcısı olarak
kalır. Böylece '%(uploader)s/%(title)s.%(ext)s' alt klasör oluşturabilir ama
başlığın içindeki '/' yeni klasör açamaz.
"""

from __future__ import annotations

import os
import re
import unicodedata

ALAN_RE = re.compile(
    r'%\((?P<alan>[^)|]*)(?:\|(?P<varsayilan>[^)]*))?\)(?P<bicim>[-#0 +]*\d*(?:\.\d+)?[diouxXeEfFgGcrsa])'
)
YOK = 'NA'
# Windows'ta yasak karakterleri tam genişlikli benzerleriyle değiştir (asıl projenin yeni kuralı)
TAM_GENISLIK = {c: chr(ord(c) + 0xFEE0) for c in '"*:<>?|'}
TAM_GENISLIK.update({'/': '⧸', '\\': '⧹'})
TURKCE_ASCII = str.maketrans('çğıöşüÇĞİÖŞÜ', 'cgiosuCGIOSU')


def dosya_adini_temizle(metin: str, kisitli: bool = False) -> str:
    if kisitli:
        # Yalnızca ASCII harf/rakam, '.', '-', '_' kalsın: ç->c, ğ->g, ı->i, İ->I ...
        metin = unicodedata.normalize('NFKD', metin.translate(TURKCE_ASCII))
        metin = metin.encode('ascii', 'ignore').decode('ascii')
        metin = re.sub(r'[^A-Za-z0-9.\-]+', '_', metin).strip('_')
    else:
        metin = ''.join(TAM_GENISLIK.get(c, c) for c in metin if ord(c) >= 32 and ord(c) != 127)
    metin = metin.lstrip('.').strip()  # gizli dosya ya da '..' üretme
    return metin or '_'


def _deger(bilgi: dict, yol: str):
    deger = bilgi
    for parca in yol.split('.'):
        if isinstance(deger, dict):
            deger = deger.get(parca)
        elif isinstance(deger, (list, tuple)) and re.fullmatch(r'-?\d+', parca):
            indeks = int(parca)
            deger = deger[indeks] if -len(deger) <= indeks < len(deger) else None
        else:
            return None
        if deger is None:
            return None
    return deger


def sablonu_uygula(sablon: str, bilgi: dict, kisitli: bool = False, yok: str = YOK) -> str:
    def degistir(eslesme: re.Match) -> str:
        alan, varsayilan, bicim = eslesme.group('alan', 'varsayilan', 'bicim')
        deger = _deger(bilgi, alan) if alan else None
        if deger is None:
            if varsayilan is None:
                return yok
            deger, bicim = varsayilan, 's'
        if bicim[-1] in 'diouxX' and not isinstance(deger, int):
            try:
                deger = int(float(deger))
            except (TypeError, ValueError):
                bicim = 's'
        try:
            metin = ('%' + bicim) % deger
        except (TypeError, ValueError):
            metin = str(deger)
        return dosya_adini_temizle(metin, kisitli)

    korunmus = sablon.replace('%%', '\0')  # '%%' gerçek yüzde işaretidir
    return ALAN_RE.sub(degistir, korunmus).replace('\0', '%')


def guvenli_yol(dizin: str, goreli: str) -> str:
    """Şablondan çıkan yolu dizine bağla; '..' ile dizin dışına çıkılamasın."""
    parcalar = [p for p in re.split(r'[\\/]+', goreli) if p not in ('', '.', '..')]
    tam = os.path.abspath(os.path.join(dizin, *parcalar)) if parcalar else os.path.abspath(os.path.join(dizin, '_'))
    kok = os.path.abspath(dizin)
    if os.path.commonpath([kok, tam]) != kok:
        raise ValueError(f'Şablon dizin dışına çıkıyor: {goreli}')
    return tam

"""Aşama 2 — akışın ne olduğunu tahmin etmek: uzantı, MIME, sihirli baytlar, karakter kümesi.

Asıl proje içerik tahmini için Google'ın 'magika' modelini (derin öğrenmeyle dosya
türü tanıma) ve karakter kümesi için 'charset_normalizer'ı kullanır. Biz sıfır
bağımlılıkla iki klasik tekniği gösteriyoruz:
  * sihirli baytlar (dosyanın ilk birkaç baytındaki imza: %PDF-, PK\\x03\\x04 ...),
  * deneme-yanılma ile kod çözme (UTF-8 -> Türkçe Windows-1254 -> latin-1).

Uzantıdan gelen tahmin ile içerikten gelen tahmin çelişirse İKİSİ de listeye girer;
çekirdek önce uzantıya, sonra içeriğe güvenerek dönüştürücü arar (asıl projedeki
_get_stream_info_guesses ile aynı strateji).
"""

from __future__ import annotations

import codecs
import json
import mimetypes
import zipfile
from typing import BinaryIO

from asama1_cekirdek import AkisBilgisi

# (imza, mime, uzantı) — en uzun imza önce denenir
IMZALAR = [
    (b'\x89PNG\r\n\x1a\n', 'image/png', '.png'),
    (b'%PDF-', 'application/pdf', '.pdf'),
    (b'\xff\xd8\xff', 'image/jpeg', '.jpg'),
    (b'GIF87a', 'image/gif', '.gif'),
    (b'GIF89a', 'image/gif', '.gif'),
    (b'PK\x03\x04', 'application/zip', '.zip'),
]
# ZIP tabanlı Office biçimleri: arşivin içindeki "kanıt" dosyası
OFFICE_KANITLARI = [
    ('word/document.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.docx'),
    ('xl/workbook.xml', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.xlsx'),
    ('ppt/presentation.xml', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', '.pptx'),
]
# UTF-8 değilse ve bu baytlardan biri varsa Türkçe Windows-1254 olması çok olası:
# 0xFD=ı 0xDD=İ 0xFE=ş 0xDE=Ş 0xF0=ğ 0xD0=Ğ
TURKCE_1254_BAYTLARI = frozenset(b'\xfd\xdd\xfe\xde\xf0\xd0')
ORNEK_BOYUTU = 64 * 1024
EN_FAZLA_JSON = 5 * 1024 * 1024


def _oku_ve_geri_sar(akis: BinaryIO, boyut: int) -> bytes:
    konum = akis.tell()
    try:
        return akis.read(boyut)
    finally:
        akis.seek(konum)


def charset_tahmini(veri: bytes, kesik: bool = False) -> str | None:
    """Metin ise kodlamayı, ikili ise None döndürür.

    kesik=True: veri daha uzun bir dosyanın başından alınmış bir örnektir; sondaki
    yarım kalmış çok baytlı UTF-8 karakteri hata sayılmaz (artımlı çözücü bekletir).
    """
    if veri.startswith(codecs.BOM_UTF8):
        return 'utf-8-sig'
    if veri.startswith((codecs.BOM_UTF16_LE, codecs.BOM_UTF16_BE)):
        return 'utf-16'
    if b'\x00' in veri:
        return None  # NUL baytı: neredeyse kesin ikili dosya
    try:
        codecs.getincrementaldecoder('utf-8')().decode(veri, final=not kesik)
        return 'utf-8'
    except UnicodeDecodeError:
        pass
    if any(b in TURKCE_1254_BAYTLARI for b in veri):
        return 'cp1254'
    return 'latin-1'


def icerik_tahmini(akis: BinaryIO) -> AkisBilgisi | None:
    """Akışın içeriğine bakarak (uzantıyı bilmeden) bir tahmin üretir."""
    bas = _oku_ve_geri_sar(akis, ORNEK_BOYUTU)
    if not bas:
        return None
    for imza, mime, uzanti in IMZALAR:
        if bas.startswith(imza):
            if uzanti == '.zip':
                mime, uzanti = _zip_icine_bak(akis, mime, uzanti)
            return AkisBilgisi(mimetype=mime, uzanti=uzanti)
    charset = charset_tahmini(bas, kesik=len(bas) == ORNEK_BOYUTU)
    if charset is None:
        return None
    metin = bas.decode(charset, errors='replace').lstrip('\ufeff').lstrip()
    kucuk = metin[:200].lower()
    if kucuk.startswith(('<!doctype html', '<html')) or '<body' in kucuk:
        return AkisBilgisi(mimetype='text/html', uzanti='.html', charset=charset)
    if metin[:1] in '{[':
        tamami = _oku_ve_geri_sar(akis, EN_FAZLA_JSON + 1)
        if len(tamami) <= EN_FAZLA_JSON:  # çok büyük dosyayı yalnızca koklamak için okumayalım
            try:
                json.loads(tamami.decode(charset))
                return AkisBilgisi(mimetype='application/json', uzanti='.json', charset=charset)
            except (ValueError, UnicodeDecodeError):
                pass
    return AkisBilgisi(mimetype='text/plain', uzanti='.txt', charset=charset)


def _zip_icine_bak(akis: BinaryIO, mime: str, uzanti: str) -> tuple[str, str]:
    konum = akis.tell()
    try:
        with zipfile.ZipFile(akis) as arsiv:
            adlar = set(arsiv.namelist())
        for kanit, office_mime, office_uzanti in OFFICE_KANITLARI:
            if kanit in adlar:
                return office_mime, office_uzanti
    except zipfile.BadZipFile:
        pass
    finally:
        akis.seek(konum)
    return mime, uzanti


def _uyumlu_mu(temel: AkisBilgisi, icerik: AkisBilgisi) -> bool:
    if temel.mimetype and temel.mimetype != icerik.mimetype:
        return False
    if temel.uzanti and temel.uzanti.lower() != icerik.uzanti:
        # .htm/.html, .jpeg/.jpg gibi eş anlamlıları aynı say
        return mimetypes.guess_type('x' + temel.uzanti)[0] == icerik.mimetype
    return True


def tahminleri_uret(akis: BinaryIO, temel: AkisBilgisi) -> list[AkisBilgisi]:
    """Temel bilgiyi (uzantı/MIME) içerik tahminiyle birleştirir; 1 ya da 2 tahmin döner."""
    zengin = temel
    if temel.mimetype is None and temel.uzanti:
        mime = mimetypes.guess_type('x' + temel.uzanti, strict=False)[0]
        if mime:
            zengin = zengin.guncelle(mimetype=mime)
    if temel.uzanti is None and temel.mimetype:
        uzantilar = mimetypes.guess_all_extensions(temel.mimetype, strict=False)
        if uzantilar:
            zengin = zengin.guncelle(uzanti=uzantilar[0])

    icerik = icerik_tahmini(akis)
    if icerik is None:
        return [zengin]
    if icerik.mimetype == 'text/plain' and (temel.uzanti or temel.mimetype):
        # İçerik yalnızca "bu bir metin" diyebiliyor (CSV'yi tanıyamayız); daha özel
        # olan uzantıya güven, yalnızca karakter kümesini ekle.
        return [zengin if zengin.charset else zengin.guncelle(charset=icerik.charset)]
    if _uyumlu_mu(temel, icerik):
        # Uyumlu: içerik tahminini temel bilginin dolu alanlarıyla tamamla
        return [icerik.guncelle(zengin)]
    # Çelişki: önce kullanıcının/uzantının söylediği, sonra içeriğin söylediği
    return [zengin, icerik.guncelle(dosya_adi=temel.dosya_adi, yerel_yol=temel.yerel_yol, url=temel.url)]

"""Aşama 3 — dönüştürücüler: düz metin, JSON, CSV, HTML, DOCX, ZIP.

Asıl projede DOCX önce 'mammoth' ile HTML'e, sonra HTML 'markdownify' ile
Markdown'a çevrilir (ara gösterim olarak HTML). Biz bağımlılıksız çalışmak için
DOCX'in içindeki XML'i doğrudan okuyoruz; HTML için de standart kütüphanedeki
html.parser'ın üstüne küçük bir ağaç kurucu yazıyoruz.
"""

from __future__ import annotations

import csv
import io
import json
import os
import re
import xml.etree.ElementTree as ET
import zipfile
from html.parser import HTMLParser
from typing import BinaryIO
from urllib.parse import urljoin

from asama1_cekirdek import (
    AkisBilgisi,
    DesteklenmeyenBicim,
    Donusturucu,
    DonusturmeHatasi,
    MarkItDownHatasi,
    Sonuc,
)
from asama2_tahmin import charset_tahmini


def metni_coz(akis: BinaryIO, bilgi: AkisBilgisi) -> str:
    veri = akis.read()
    charset = bilgi.charset or charset_tahmini(veri)
    if charset is None:
        raise MarkItDownHatasi('İkili veri metin olarak çözülemez')
    return veri.decode(charset).lstrip('\ufeff')


def markdown_tablosu(satirlar: list[list[str]]) -> str:
    """İlk satır başlık. Kısa satırlar boş hücreyle doldurulur."""
    if not satirlar:
        return ''
    genislik = max(len(s) for s in satirlar)
    satirlar = [s + [''] * (genislik - len(s)) for s in satirlar]
    cikti = ['| ' + ' | '.join(satirlar[0]) + ' |', '| ' + ' | '.join(['---'] * genislik) + ' |']
    cikti += ['| ' + ' | '.join(s) + ' |' for s in satirlar[1:]]
    return '\n'.join(cikti)


def hucre_kacisi(metin: str) -> str:
    """Tablo hücresinde '|' sütun ayırıcıdır, satır sonu satırı bitirir."""
    return re.sub(r'\s*\r?\n\s*', ' ', metin).replace('|', '\\|')


# --- basit biçimler ------------------------------------------------------------
class DuzMetinDonusturucu(Donusturucu):
    def accepts(self, akis, bilgi, **secenekler):
        if bilgi.charset is not None:  # karakter kümesi biliniyorsa metindir
            return True
        return self.uzanti_veya_mime(bilgi, ('.txt', '.text', '.md', '.markdown'), ('text/',))

    def convert(self, akis, bilgi, **secenekler):
        return Sonuc(metni_coz(akis, bilgi))


class JsonDonusturucu(Donusturucu):
    """Asıl projede JSON düz metin olarak geçer; biz okunaklı bir kod bloğu üretiyoruz."""

    def accepts(self, akis, bilgi, **secenekler):
        return self.uzanti_veya_mime(bilgi, ('.json', '.jsonl'), ('application/json',))

    def convert(self, akis, bilgi, **secenekler):
        metin = metni_coz(akis, bilgi)
        if (bilgi.uzanti or '').lower() == '.jsonl':
            veri = [json.loads(satir) for satir in metin.splitlines() if satir.strip()]
        else:
            veri = json.loads(metin)
        return Sonuc('```json\n' + json.dumps(veri, ensure_ascii=False, indent=2) + '\n```')


class CsvDonusturucu(Donusturucu):
    def accepts(self, akis, bilgi, **secenekler):
        return self.uzanti_veya_mime(bilgi, ('.csv',), ('text/csv', 'application/csv'))

    def convert(self, akis, bilgi, **secenekler):
        metin = metni_coz(akis, bilgi)
        satirlar = [s for s in csv.reader(io.StringIO(metin, newline='')) if any(h.strip() for h in s)]
        return Sonuc(markdown_tablosu([[hucre_kacisi(h) for h in s] for s in satirlar]))


# --- HTML ------------------------------------------------------------------------
ATLANANLAR = {'script', 'style', 'noscript', 'template', 'head', 'svg', 'iframe', 'object'}
BOS_ETIKETLER = {'br', 'hr', 'img', 'meta', 'link', 'input', 'area', 'base', 'col', 'embed', 'source', 'track', 'wbr'}
# Açık bir <p> varken bu etiketlerden biri başlarsa <p> örtük olarak kapanır
P_KAPATANLAR = {'p', 'div', 'ul', 'ol', 'table', 'pre', 'blockquote', 'section', 'article', 'form', 'hr'}
P_KAPATANLAR |= {'header', 'footer', 'nav', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'}
KAPSAYICILAR = {'div', 'section', 'article', 'main', 'header', 'footer', 'nav', 'aside', 'body', 'html', 'figure'}


class Dugum:
    __slots__ = ('etiket', 'ozellik', 'cocuklar')

    def __init__(self, etiket: str, ozellik: dict[str, str | None]):
        self.etiket = etiket
        self.ozellik = ozellik
        self.cocuklar: list[Dugum | str] = []

    def bul(self, etiket: str) -> 'Dugum | None':
        for cocuk in self.cocuklar:
            if isinstance(cocuk, Dugum):
                if cocuk.etiket == etiket:
                    return cocuk
                bulunan = cocuk.bul(etiket)
                if bulunan:
                    return bulunan
        return None


class AgacKurucu(HTMLParser):
    """html.parser olaylarından (başlangıç/bitiş etiketi, veri) bir ağaç kurar."""

    def __init__(self):
        super().__init__(convert_charrefs=True)  # &amp; &#305; gibi varlıkları çözer
        self.kok = Dugum('#belge', {})
        self.yigin = [self.kok]
        self.baslik: list[str] = []
        self._baslikta = False

    def _kapat(self, etiket: str, sinirlar: tuple[str, ...] = ()) -> None:
        for i in range(len(self.yigin) - 1, 0, -1):
            if self.yigin[i].etiket in sinirlar:
                return
            if self.yigin[i].etiket == etiket:
                del self.yigin[i:]
                return

    def handle_starttag(self, tag, attrs):
        if tag == 'title':
            self._baslikta = True
            return
        # HTML'in "örtük kapanış" kuralları: <p> blok gelince, <li> yeni <li> gelince kapanır
        if tag in P_KAPATANLAR and self.yigin[-1].etiket == 'p':
            self.yigin.pop()
        if tag == 'li':
            self._kapat('li', ('ul', 'ol'))
        elif tag in ('td', 'th'):
            self._kapat('td', ('tr', 'table'))
            self._kapat('th', ('tr', 'table'))
        elif tag == 'tr':
            self._kapat('tr', ('table',))
        dugum = Dugum(tag, dict(attrs))
        self.yigin[-1].cocuklar.append(dugum)
        if tag not in BOS_ETIKETLER:
            self.yigin.append(dugum)

    def handle_startendtag(self, tag, attrs):
        self.yigin[-1].cocuklar.append(Dugum(tag, dict(attrs)))

    def handle_endtag(self, tag):
        if tag == 'title':
            self._baslikta = False
        else:
            self._kapat(tag)

    def handle_data(self, data):
        if self._baslikta:
            self.baslik.append(data)
        else:
            self.yigin[-1].cocuklar.append(data)


class MarkdownYazici:
    def __init__(self, taban_url: str | None = None):
        self.taban_url = taban_url

    def yaz(self, dugum: Dugum) -> str:
        return self._blok_baslarini_temizle(self._cocuklar(dugum))

    @staticmethod
    def _blok_baslarini_temizle(metin: str) -> str:
        """Bloklar arasındaki boşluk düğümleri satır başında ' ' bırakır; onları sil.

        Kod blokları (```) içine dokunma: oradaki girintiler anlamlıdır.
        """
        satirlar, cit_icinde, onceki_bos = [], False, True
        for satir in metin.split('\n'):
            if satir.lstrip().startswith('```'):
                cit_icinde = not cit_icinde
                satir = satir.lstrip()
            elif not cit_icinde and onceki_bos:
                satir = satir.lstrip(' ')
            satirlar.append(satir)
            onceki_bos = not satir.strip()
        return '\n'.join(satirlar)

    def _cocuklar(self, dugum: Dugum, pre: bool = False) -> str:
        return ''.join(self._cevir(c, pre) for c in dugum.cocuklar)

    def _duz(self, dugum: Dugum | str) -> str:
        if isinstance(dugum, str):
            return dugum
        return ''.join(self._duz(c) for c in dugum.cocuklar)

    def _cevir(self, d: Dugum | str, pre: bool = False) -> str:
        if isinstance(d, str):
            return d if pre else re.sub(r'\s+', ' ', d)
        e = d.etiket
        if e in ATLANANLAR:
            return ''
        if re.fullmatch(r'h[1-6]', e):
            return f'\n\n{"#" * int(e[1])} {self._cocuklar(d).strip()}\n\n'
        if e == 'p':
            return f'\n\n{self._cocuklar(d).strip()}\n\n'
        if e == 'br':
            return '  \n'
        if e == 'hr':
            return '\n\n---\n\n'
        if e in ('strong', 'b', 'em', 'i', 'del', 's'):
            ic = self._cocuklar(d).strip()
            isaret = {'strong': '**', 'b': '**', 'em': '*', 'i': '*'}.get(e, '~~')
            return f'{isaret}{ic}{isaret}' if ic else ''
        if e == 'code':
            return f'`{self._duz(d)}`'
        if e == 'a':
            return self._baglanti(d)
        if e == 'img':
            kaynak = d.ozellik.get('src') or ''
            if kaynak.startswith('data:'):  # dev base64 verisini Markdown'a gömme
                kaynak = kaynak.split(',', 1)[0] + ',...'
            return f'![{d.ozellik.get("alt") or ""}]({self._mutlak(kaynak)})'
        if e == 'pre':
            kod = d.bul('code')
            sinif = (kod.ozellik.get('class') or '') if kod else ''
            dil = re.search(r'language-([\w+-]+)', sinif)
            return f'\n\n```{dil.group(1) if dil else ""}\n{self._duz(d).strip(chr(10))}\n```\n\n'
        if e == 'blockquote':
            ic = re.sub(r'\n{3,}', '\n\n', self._cocuklar(d).strip())
            return '\n\n' + '\n'.join(f'> {s}'.rstrip() for s in ic.splitlines()) + '\n\n'
        if e in ('ul', 'ol'):
            return '\n\n' + self._liste(d, 0) + '\n\n'
        if e == 'table':
            return '\n\n' + self._tablo(d) + '\n\n'
        if e in KAPSAYICILAR:
            return '\n\n' + self._cocuklar(d) + '\n\n'
        return self._cocuklar(d, pre)

    def _mutlak(self, url: str) -> str:
        return urljoin(self.taban_url, url) if self.taban_url and url else url

    def _baglanti(self, d: Dugum) -> str:
        metin = self._cocuklar(d).strip()
        hedef = (d.ozellik.get('href') or '').strip()
        if not hedef or hedef.lower().startswith('javascript:'):
            return metin  # asıl proje de javascript: linklerini atar
        baslik = d.ozellik.get('title')
        ek = f' "{baslik}"' if baslik else ''
        return f'[{metin}]({self._mutlak(hedef).replace(" ", "%20")}{ek})'

    def _liste(self, d: Dugum, girinti: int) -> str:
        satirlar = []
        sira = int(d.ozellik.get('start') or 1) if d.etiket == 'ol' else None
        for li in (c for c in d.cocuklar if isinstance(c, Dugum) and c.etiket == 'li'):
            isaret = f'{sira}.' if sira is not None else '-'
            metin, altlar = [], []
            for c in li.cocuklar:
                if isinstance(c, Dugum) and c.etiket in ('ul', 'ol'):
                    altlar.append(self._liste(c, girinti + len(isaret) + 1))
                else:
                    metin.append(self._cevir(c))
            satirlar.append(' ' * girinti + f'{isaret} ' + re.sub(r'\s*\n+\s*', ' ', ''.join(metin)).strip())
            satirlar.extend(altlar)
            if sira is not None:
                sira += 1
        return '\n'.join(satirlar)

    def _tablo(self, d: Dugum) -> str:
        satirlar: list[list[str]] = []

        def topla(dugum: Dugum) -> None:
            for c in dugum.cocuklar:
                if not isinstance(c, Dugum):
                    continue
                if c.etiket == 'tr':
                    hucreler = [h for h in c.cocuklar if isinstance(h, Dugum) and h.etiket in ('td', 'th')]
                    satirlar.append([hucre_kacisi(self._cocuklar(h).strip()) for h in hucreler])
                elif c.etiket in ('thead', 'tbody', 'tfoot'):
                    topla(c)

        topla(d)
        return markdown_tablosu(satirlar)


def html_den_markdown(html: str, taban_url: str | None = None) -> Sonuc:
    kurucu = AgacKurucu()
    kurucu.feed(html)
    kurucu.close()
    govde = kurucu.kok.bul('body') or kurucu.kok
    baslik = re.sub(r'\s+', ' ', ''.join(kurucu.baslik)).strip() or None
    return Sonuc(MarkdownYazici(taban_url).yaz(govde), baslik=baslik)


class HtmlDonusturucu(Donusturucu):
    def accepts(self, akis, bilgi, **secenekler):
        return self.uzanti_veya_mime(bilgi, ('.html', '.htm'), ('text/html', 'application/xhtml'))

    def convert(self, akis, bilgi, **secenekler):
        return html_den_markdown(metni_coz(akis, bilgi), taban_url=bilgi.url)


# --- DOCX ------------------------------------------------------------------------
W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
R = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
PAKET_ILISKI = '{http://schemas.openxmlformats.org/package/2006/relationships}'
DC = '{http://purl.org/dc/elements/1.1/}'


def guvenli_xml(veri: bytes) -> ET.Element:
    """DTD içeren XML'i reddet (varlık genişletme saldırılarına karşı ucuz önlem).

    Asıl proje bu yüzden 'defusedxml' bağımlılığını taşır.
    """
    if b'<!DOCTYPE' in veri[:4096].upper():
        raise MarkItDownHatasi('DTD içeren XML reddedildi')
    return ET.fromstring(veri)


def _acik_mi(ozellik: ET.Element | None) -> bool:
    return ozellik is not None and ozellik.get(f'{W}val', 'true') not in ('0', 'false', 'off')


class DocxDonusturucu(Donusturucu):
    def accepts(self, akis, bilgi, **secenekler):
        return self.uzanti_veya_mime(
            bilgi, ('.docx',), ('application/vnd.openxmlformats-officedocument.wordprocessingml.document',)
        )

    def convert(self, akis, bilgi, **secenekler):
        with zipfile.ZipFile(akis) as arsiv:
            belge = guvenli_xml(arsiv.read('word/document.xml'))
            self._stiller = self._stilleri_oku(arsiv)
            self._iliskiler = self._iliskileri_oku(arsiv)
            baslik = self._basligi_oku(arsiv)
        govde = belge.find(f'{W}body')
        bloklar: list[tuple[str, str]] = []  # (tür, markdown)
        for eleman in govde if govde is not None else []:
            if eleman.tag == f'{W}p':
                bloklar.append(self._paragraf(eleman))
            elif eleman.tag == f'{W}tbl':
                bloklar.append(('tablo', self._tablo(eleman)))
        cikti = ''
        onceki = ''
        for tur, metin in bloklar:
            if not metin.strip():
                continue
            # Ardışık liste maddeleri arasında boş satır olmaz
            ayirici = '\n' if tur == onceki == 'liste' else '\n\n'
            cikti += (ayirici if cikti else '') + metin
            onceki = tur
        return Sonuc(cikti, baslik=baslik)

    @staticmethod
    def _stilleri_oku(arsiv: zipfile.ZipFile) -> dict[str, str]:
        """styleId -> stil adı. Türkçe Word 'Başlık 1'in kimliğini 'Balk1' yazar ama
        adını yine 'heading 1' saklar; bu yüzden kimliğe değil ada bakıyoruz."""
        try:
            kok = guvenli_xml(arsiv.read('word/styles.xml'))
        except KeyError:
            return {}
        stiller = {}
        for stil in kok.findall(f'{W}style'):
            ad = stil.find(f'{W}name')
            stiller[stil.get(f'{W}styleId')] = (ad.get(f'{W}val') if ad is not None else '').lower()
        return stiller

    @staticmethod
    def _iliskileri_oku(arsiv: zipfile.ZipFile) -> dict[str, str]:
        try:
            kok = guvenli_xml(arsiv.read('word/_rels/document.xml.rels'))
        except KeyError:
            return {}
        return {
            r.get('Id'): r.get('Target')
            for r in kok.findall(f'{PAKET_ILISKI}Relationship')
            if (r.get('Type') or '').endswith('/hyperlink')
        }

    @staticmethod
    def _basligi_oku(arsiv: zipfile.ZipFile) -> str | None:
        try:
            eleman = guvenli_xml(arsiv.read('docProps/core.xml')).find(f'{DC}title')
        except KeyError:
            return None
        return eleman.text if eleman is not None and eleman.text else None

    def _paragraf(self, p: ET.Element) -> tuple[str, str]:
        metin = self._satir_ici(p).strip()
        ozellik = p.find(f'{W}pPr')
        stil_kimligi = ''
        if ozellik is not None and ozellik.find(f'{W}pStyle') is not None:
            stil_kimligi = ozellik.find(f'{W}pStyle').get(f'{W}val') or ''
        stil_adi = self._stiller.get(stil_kimligi, stil_kimligi.lower())
        seviye = re.fullmatch(r'heading ?(\d)', stil_adi)
        if stil_adi == 'title':
            return 'baslik', f'# {metin}'
        if seviye:
            return 'baslik', '#' * min(int(seviye.group(1)), 6) + ' ' + metin
        numara = ozellik.find(f'{W}numPr') if ozellik is not None else None
        if numara is not None:
            ilvl = numara.find(f'{W}ilvl')
            girinti = int(ilvl.get(f'{W}val', '0')) if ilvl is not None else 0
            return 'liste', '  ' * girinti + f'- {metin}'
        return 'paragraf', metin

    def _satir_ici(self, eleman: ET.Element) -> str:
        parcalar = []
        for c in eleman:
            if c.tag == f'{W}r':
                parcalar.append(self._calistirma(c))
            elif c.tag == f'{W}hyperlink':
                ic = self._satir_ici(c).strip()
                hedef = self._iliskiler.get(c.get(f'{R}id'))
                parcalar.append(f'[{ic}]({hedef})' if hedef else ic)
            elif c.tag in (f'{W}ins', f'{W}smartTag', f'{W}fldSimple'):
                parcalar.append(self._satir_ici(c))  # sarmalayıcıların içine in
        return ''.join(parcalar)

    @staticmethod
    def _calistirma(r: ET.Element) -> str:
        """w:r = aynı biçimli metin parçası (run). Kalın/italik burada belirlenir."""
        ozellik = r.find(f'{W}rPr')
        kalin = ozellik is not None and _acik_mi(ozellik.find(f'{W}b'))
        italik = ozellik is not None and _acik_mi(ozellik.find(f'{W}i'))
        metin = ''
        for c in r:
            if c.tag == f'{W}t':
                metin += c.text or ''
            elif c.tag == f'{W}tab':
                metin += '\t'
            elif c.tag in (f'{W}br', f'{W}cr'):
                metin += '  \n'
        govde = metin.strip()
        if not govde:
            return metin
        if kalin:
            govde = f'**{govde}**'
        if italik:
            govde = f'*{govde}*'
        return metin[: len(metin) - len(metin.lstrip())] + govde + metin[len(metin.rstrip()) :]

    def _tablo(self, tbl: ET.Element) -> str:
        satirlar = []
        for tr in tbl.findall(f'{W}tr'):
            hucreler = []
            for tc in tr.findall(f'{W}tc'):
                metin = ' '.join(self._satir_ici(p).strip() for p in tc.findall(f'{W}p'))
                hucreler.append(hucre_kacisi(metin.strip()))
            satirlar.append(hucreler)
        return markdown_tablosu(satirlar)


# --- ZIP ---------------------------------------------------------------------------
class ZipDonusturucu(Donusturucu):
    """Arşivdeki her dosyayı ÜST kayıt defterine geri vererek dönüştürür (özyineleme)."""

    EN_FAZLA_DOSYA = 1000
    EN_FAZLA_TOPLAM = 100 * 1024 * 1024  # açılmış boyut sınırı: zip bombasına karşı
    EN_FAZLA_DERINLIK = 3

    def __init__(self, md):
        self._md = md

    def accepts(self, akis, bilgi, **secenekler):
        return self.uzanti_veya_mime(bilgi, ('.zip',), ('application/zip',))

    def convert(self, akis, bilgi, **secenekler):
        derinlik = secenekler.get('_zip_derinligi', 0)
        if derinlik >= self.EN_FAZLA_DERINLIK:
            raise MarkItDownHatasi('İç içe zip derinlik sınırı aşıldı')
        ad = bilgi.url or bilgi.yerel_yol or bilgi.dosya_adi or '(bilinmiyor)'
        parcalar = [f'`{ad}` zip arşivinin içeriği:']
        with zipfile.ZipFile(akis) as arsiv:
            girdiler = [g for g in arsiv.infolist() if not g.is_dir()]
            if len(girdiler) > self.EN_FAZLA_DOSYA or sum(g.file_size for g in girdiler) > self.EN_FAZLA_TOPLAM:
                raise MarkItDownHatasi('Arşiv boyut/dosya sınırını aşıyor')
            for girdi in girdiler:
                veri = arsiv.read(girdi)
                alt_bilgi = AkisBilgisi(
                    uzanti=os.path.splitext(girdi.filename)[1] or None, dosya_adi=os.path.basename(girdi.filename)
                )
                try:
                    sonuc = self._md.convert_stream(io.BytesIO(veri), alt_bilgi, _zip_derinligi=derinlik + 1)
                    icerik = sonuc.markdown.strip()
                except (DesteklenmeyenBicim, DonusturmeHatasi):
                    icerik = '_(bu dosya dönüştürülemedi)_'
                parcalar.append(f'## Dosya: {girdi.filename}\n\n{icerik}')
        return Sonuc('\n\n'.join(parcalar))

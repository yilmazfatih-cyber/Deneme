"""SKILL.md ön bilgisini (YAML frontmatter) dış kütüphane olmadan ayrıştırır.

Neden kendi ayrıştırıcımız? anthropics/skills deposundaki
skills/skill-creator/scripts/quick_validate.py PyYAML kullanır; biz yalnızca standart
kütüphaneyle çalışıyoruz. Beceri dosyalarında görülen YAML alt kümesi küçüktür:

- düz, tek tırnaklı ve çift tırnaklı skaler değerler,
- blok skalerler: ``|`` (satırları korur) ve ``>`` (satırları katlar), ``-``/``+`` ekleriyle,
- iç içe eşleme (``metadata:`` altı), blok liste (``- öğe``) ve tek satırlık akış listesi ``[a, b]``.

Çapa (&), takma ad (*), etiket (!) ve akış eşlemesi ({a: b}) desteklenmez. Desteklemediğimiz
bir şey görünce açık bir hata veririz: bir beceriyi sessizce yanlış okumak, hiç okumamaktan
daha tehlikelidir.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

_ANAHTAR = re.compile(r'^(?P<anahtar>[A-Za-z0-9_][A-Za-z0-9_.\-]*)[ \t]*:(?:[ \t]+(?P<deger>.*)|[ \t]*)$')
_TAMSAYI = re.compile(r'^[-+]?(0|[1-9][0-9]*)$')
_ONDALIK = re.compile(r'^[-+]?(0|[1-9][0-9]*)\.[0-9]+$')
_BLOK = re.compile(r'^(?P<tur>[|>])(?P<ek1>[-+]?)(?P<girinti>[1-9]?)(?P<ek2>[-+]?)$')
_KACISLAR = {'n': '\n', 't': '\t', 'r': '\r', '0': '\0', '"': '"', '\\': '\\', '/': '/', ' ': ' '}


class OnbilgiHatasi(ValueError):
    """Ön bilgi okunamadığında fırlatılır. ``satir`` SKILL.md dosyasındaki satır numarasıdır."""

    def __init__(self, mesaj: str, satir: int | None = None):
        self.mesaj = mesaj
        self.satir = satir
        super().__init__(f'{satir}. satır: {mesaj}' if satir else mesaj)


@dataclass
class Onbilgi:
    """Ayrıştırılmış SKILL.md: ön bilgi sözlüğü, ham metin ve gövde."""

    veri: dict
    ham: str
    govde: str
    govde_satiri: int  # gövdenin başladığı satır (1 tabanlı)
    bicimler: dict = field(default_factory=dict)  # üst düzey anahtar -> yazım biçimi ('plain', '|-', ...)


def ayir(metin: str) -> tuple[str | None, str, int]:
    """Metni (ön bilgi, gövde, gövdenin ilk satırı) üçlüsüne böler; ön bilgi yoksa ilk öğe None olur."""
    if metin.startswith('\ufeff'):  # BOM: bazı editörler dosya başına ekler
        metin = metin[1:]
    metin = metin.replace('\r\n', '\n')
    satirlar = metin.split('\n')
    if satirlar[0].rstrip() != '---':
        return None, metin, 1
    for i in range(1, len(satirlar)):
        if satirlar[i].rstrip() == '---':
            return '\n'.join(satirlar[1:i]), '\n'.join(satirlar[i + 1 :]), i + 2
    raise OnbilgiHatasi('Ön bilgi kapanmamış: ikinci "---" satırı bulunamadı', 1)


def oku(metin: str) -> Onbilgi:
    """SKILL.md metnini okur. Ön bilgi yoksa ya da bozuksa OnbilgiHatasi fırlatır."""
    ham, govde, govde_satiri = ayir(metin)
    if ham is None:
        raise OnbilgiHatasi('Ön bilgi yok: dosya "---" satırıyla başlamalı', 1)
    ayristirici = _Ayristirici(ham, ilk_satir=2)
    veri = ayristirici.belge()
    return Onbilgi(veri=veri, ham=ham, govde=govde, govde_satiri=govde_satiri, bicimler=ayristirici.bicimler)


def yaml_oku(metin: str, ilk_satir: int = 1) -> dict:
    """Küçük bir YAML eşlemesini okur: agents/openai.yaml gibi yan dosyalar ya da ham ön bilgi."""
    if metin.startswith('\ufeff'):
        metin = metin[1:]
    return _Ayristirici(metin.replace('\r\n', '\n'), ilk_satir=ilk_satir).belge()


def yaklasik_token(metin: str) -> int:
    """Kaba token tahmini: ~4 karakter = 1 token. Gerçek sayı modele ve dile göre değişir."""
    return (len(metin) + 3) // 4


def _tur_cevir(deger: str):
    """Düz skaleri YAML 1.2 çekirdek şemasına yakın biçimde türe çevirir.

    Dikkat: PyYAML YAML 1.1 izler ve 'yes'/'no'/'on'/'off' değerlerini de mantıksal sayar;
    biz bunları metin bırakıyoruz.
    """
    if deger in ('true', 'True', 'TRUE'):
        return True
    if deger in ('false', 'False', 'FALSE'):
        return False
    if deger in ('', '~', 'null', 'Null', 'NULL'):
        return None
    if _TAMSAYI.match(deger):
        return int(deger)
    if _ONDALIK.match(deger):
        return float(deger)
    return deger


def _katla(satirlar: list[str]) -> str:
    """'>' blokları için YAML katlaması: komşu satırlar boşlukla birleşir, boş satır satır sonu olur."""
    cikti: list[str] = []
    onceki_bos = False
    onceki_girintili = False
    for satir in satirlar:
        if satir == '':
            cikti.append('\n')
            onceki_bos = True
            continue
        girintili = satir.startswith((' ', '\t'))
        if not cikti:
            cikti.append(satir)
        elif onceki_bos:
            cikti.append(satir)
        elif girintili or onceki_girintili:
            cikti.append('\n' + satir)
        else:
            cikti.append(' ' + satir)
        onceki_bos = False
        onceki_girintili = girintili
    return ''.join(cikti)


class _Ayristirici:
    """Girintiye dayalı küçük bir özyinelemeli ayrıştırıcı. Satırlar üzerinde tek geçişle ilerler."""

    def __init__(self, metin: str, ilk_satir: int):
        self.satirlar = metin.split('\n')
        self.ilk = ilk_satir  # metnin ilk satırının dosyadaki numarası
        self.i = 0
        self.bicimler: dict = {}

    # --- yardımcılar -------------------------------------------------------------------------
    def _hata(self, mesaj: str, i: int | None = None) -> OnbilgiHatasi:
        return OnbilgiHatasi(mesaj, self.ilk + (self.i if i is None else i))

    @staticmethod
    def _bos_mu(satir: str) -> bool:
        govde = satir.strip()
        return govde == '' or govde.startswith('#')

    def _atla(self) -> None:
        while self.i < len(self.satirlar) and self._bos_mu(self.satirlar[self.i]):
            self.i += 1

    def _girinti(self, satir: str) -> int:
        bosluk = satir[: len(satir) - len(satir.lstrip(' \t'))]
        if '\t' in bosluk:
            raise self._hata('Girintide sekme (tab) var; YAML girintide yalnızca boşluk kabul eder')
        return len(bosluk)

    @staticmethod
    def _liste_ogesi_mi(govde: str) -> bool:
        return govde == '-' or govde.startswith('- ')

    # --- yapı ---------------------------------------------------------------------------------
    def belge(self) -> dict:
        self._atla()
        if self.i >= len(self.satirlar):
            return {}
        satir = self.satirlar[self.i]
        if self._girinti(satir) != 0:
            raise self._hata('Ön bilgi sütun 0dan başlamalı')
        if self._liste_ogesi_mi(satir.strip()):
            raise self._hata('Ön bilgi bir eşleme (anahtar: değer) olmalı, liste değil')
        sonuc = self._esleme(0, ust=True)
        self._atla()
        if self.i < len(self.satirlar):
            raise self._hata('Beklenmeyen içerik (girinti hatası olabilir)')
        return sonuc

    def _esleme(self, girinti: int, ust: bool = False) -> dict:
        sonuc: dict = {}
        while True:
            self._atla()
            if self.i >= len(self.satirlar):
                return sonuc
            satir = self.satirlar[self.i]
            g = self._girinti(satir)
            if g < girinti:
                return sonuc
            if g > girinti:
                raise self._hata('Beklenmeyen girinti')
            govde = satir.strip()
            if self._liste_ogesi_mi(govde):
                raise self._hata('Eşleme içinde beklenmeyen liste öğesi')
            eslesme = _ANAHTAR.match(govde)
            if not eslesme:
                raise self._hata(f'"anahtar: değer" bekleniyordu, bulunan: {govde[:40]!r}')
            anahtar = eslesme.group('anahtar')
            if anahtar in sonuc:
                raise self._hata(f'"{anahtar}" anahtarı iki kez yazılmış')
            satir_no = self.i
            self.i += 1
            deger, bicim = self._deger(eslesme.group('deger'), girinti, satir_no)
            sonuc[anahtar] = deger
            if ust:
                self.bicimler[anahtar] = bicim

    def _deger(self, metin: str | None, ust_girinti: int, satir_no: int):
        if metin is None or metin.strip() == '' or metin.strip().startswith('#'):
            return self._ic_ice(ust_girinti)
        metin = metin.strip()
        ilk = metin[0]
        if ilk in '|>':
            return self._blok(metin, ust_girinti, satir_no)
        if ilk == '"':
            return self._cift_tirnak(metin, satir_no), 'double'
        if ilk == "'":
            return self._tek_tirnak(metin, satir_no), 'single'
        if ilk == '[':
            return self._akis_listesi(metin, satir_no), 'flow'
        if ilk == '{':
            if metin.split(' #')[0].strip() == '{}':
                return {}, 'flow'
            raise self._hata('Akış eşlemesi ({...}) desteklenmiyor; blok eşleme kullan', satir_no)
        if ilk in '&*!':
            raise self._hata('Çapa, takma ad ve etiket (& * !) desteklenmiyor', satir_no)
        if ilk in '@`%':
            raise self._hata(f'"{ilk}" ile başlayan değer YAMLda ayrılmıştır; değeri tırnağa al', satir_no)
        return self._duz(metin, ust_girinti, satir_no), 'plain'

    def _ic_ice(self, ust_girinti: int):
        """Değeri boş bir anahtarın altını okur: liste, eşleme ya da null."""
        self._atla()
        if self.i >= len(self.satirlar):
            return None, 'null'
        satir = self.satirlar[self.i]
        g = self._girinti(satir)
        if self._liste_ogesi_mi(satir.strip()) and g >= ust_girinti:
            return self._liste(g), 'sequence'  # g == ust_girinti: girintisiz liste de geçerli YAML
        if g > ust_girinti:
            return self._esleme(g), 'mapping'
        return None, 'null'

    def _liste(self, girinti: int) -> list:
        sonuc: list = []
        while True:
            self._atla()
            if self.i >= len(self.satirlar):
                return sonuc
            satir = self.satirlar[self.i]
            g = self._girinti(satir)
            govde = satir.strip()
            if g != girinti or not self._liste_ogesi_mi(govde):
                if g > girinti:
                    raise self._hata('Liste öğesinde beklenmeyen girinti')
                return sonuc
            ic = govde[1:].lstrip()
            if ic == '':
                self.i += 1
                deger, _ = self._ic_ice(girinti)
                sonuc.append(deger)
                continue
            if _ANAHTAR.match(ic):
                # "- ad: x" bir eşleme öğesidir: satırı içerik sütununa kaydırıp eşleme olarak okuruz
                sutun = g + (len(govde) - len(ic))
                self.satirlar[self.i] = ' ' * sutun + ic
                sonuc.append(self._esleme(sutun))
            else:
                satir_no = self.i
                self.i += 1
                deger, _ = self._deger(ic, girinti, satir_no)
                sonuc.append(deger)

    # --- skalerler ----------------------------------------------------------------------------
    def _duz_parca(self, metin: str, satir_no: int) -> str:
        kesim = metin.find(' #')
        if kesim != -1:
            metin = metin[:kesim]
        metin = metin.rstrip()
        if ': ' in metin or metin.endswith(':'):
            raise self._hata('Tırnaksız değerde ": " (iki nokta + boşluk) olamaz; değeri tırnak içine al', satir_no)
        return metin

    def _duz(self, metin: str, ust_girinti: int, satir_no: int):
        parcalar = [self._duz_parca(metin, satir_no)]
        while self.i < len(self.satirlar):  # çok satırlı düz değer: daha içeride devam eden satırlar
            satir = self.satirlar[self.i]
            if self._bos_mu(satir) or self._girinti(satir) <= ust_girinti:
                break
            parcalar.append(self._duz_parca(satir.strip(), self.i))
            self.i += 1
        if len(parcalar) == 1:
            return _tur_cevir(parcalar[0])
        return ' '.join(p for p in parcalar if p)

    def _tirnak_icerigi(self, metin: str, satir_no: int, tirnak: str) -> list[str]:
        """Kapanış tırnağına kadar olan parçaları satır satır toplar (çok satırlı değerler için)."""
        parca = metin[1:]
        biriken: list[str] = []
        while True:
            j = 0
            kapanis = -1
            while j < len(parca):
                c = parca[j]
                if tirnak == '"' and c == '\\':
                    j += 2
                    continue
                if c == tirnak:
                    if tirnak == "'" and j + 1 < len(parca) and parca[j + 1] == "'":
                        j += 2
                        continue
                    kapanis = j
                    break
                j += 1
            if kapanis != -1:
                biriken.append(parca[:kapanis])
                kalan = parca[kapanis + 1 :].strip()
                if kalan and not kalan.startswith('#'):
                    raise self._hata('Kapanış tırnağından sonra beklenmeyen içerik', satir_no)
                return biriken
            biriken.append(parca)
            if self.i >= len(self.satirlar):
                raise self._hata('Tırnak kapanmamış', satir_no)
            parca = self.satirlar[self.i].strip()
            self.i += 1

    @staticmethod
    def _katla_tirnak(parcalar: list[str]) -> str:
        if len(parcalar) == 1:
            return parcalar[0]
        return ' '.join([parcalar[0].rstrip()] + [p.strip() for p in parcalar[1:]])

    def _cift_tirnak(self, metin: str, satir_no: int) -> str:
        ham = self._katla_tirnak(self._tirnak_icerigi(metin, satir_no, '"'))
        cikti: list[str] = []
        j = 0
        while j < len(ham):
            c = ham[j]
            if c != '\\':
                cikti.append(c)
                j += 1
                continue
            if j + 1 >= len(ham):
                raise self._hata('Yarım kalmış kaçış dizisi (\\)', satir_no)
            k = ham[j + 1]
            if k in _KACISLAR:
                cikti.append(_KACISLAR[k])
                j += 2
            elif k in 'xuU':
                uzunluk = {'x': 2, 'u': 4, 'U': 8}[k]
                kod = ham[j + 2 : j + 2 + uzunluk]
                if len(kod) != uzunluk or not all(h in '0123456789abcdefABCDEF' for h in kod):
                    raise self._hata(f'Geçersiz \\{k} kaçışı', satir_no)
                cikti.append(chr(int(kod, 16)))
                j += 2 + uzunluk
            else:
                raise self._hata(f'Bilinmeyen kaçış dizisi: \\{k}', satir_no)
        return ''.join(cikti)

    def _tek_tirnak(self, metin: str, satir_no: int) -> str:
        return self._katla_tirnak(self._tirnak_icerigi(metin, satir_no, "'")).replace("''", "'")

    def _akis_listesi(self, metin: str, satir_no: int) -> list:
        metin = metin.strip()
        if not metin.endswith(']'):
            kesim = metin.rfind(']')
            if kesim == -1 or not metin[kesim + 1 :].strip().startswith('#'):
                raise self._hata('Akış listesi aynı satırda "]" ile kapanmalı', satir_no)
            metin = metin[: kesim + 1]
        ic = metin[1:-1].strip()
        if ic == '':
            return []
        ogeler: list[str] = []
        parca: list[str] = []
        tirnak = ''
        for c in ic:
            if tirnak:
                parca.append(c)
                if c == tirnak:
                    tirnak = ''
            elif c in '"\'':
                tirnak = c
                parca.append(c)
            elif c == ',':
                ogeler.append(''.join(parca).strip())
                parca = []
            elif c in '[]{}':
                raise self._hata('İç içe akış yapıları desteklenmiyor', satir_no)
            else:
                parca.append(c)
        ogeler.append(''.join(parca).strip())
        sonuc = []
        for oge in ogeler:
            if oge.startswith('"'):
                sonuc.append(self._cift_tirnak(oge, satir_no))
            elif oge.startswith("'"):
                sonuc.append(self._tek_tirnak(oge, satir_no))
            else:
                sonuc.append(_tur_cevir(oge))
        return sonuc

    def _blok(self, metin: str, ust_girinti: int, satir_no: int):
        gosterge = metin.split(' #')[0].strip()
        eslesme = _BLOK.match(gosterge)
        if not eslesme or (eslesme.group('ek1') and eslesme.group('ek2')):
            raise self._hata(f'Geçersiz blok göstergesi: {gosterge!r}', satir_no)
        tur = eslesme.group('tur')
        ek = eslesme.group('ek1') or eslesme.group('ek2')
        blok_girinti = ust_girinti + int(eslesme.group('girinti')) if eslesme.group('girinti') else None
        satirlar: list[str] = []
        while self.i < len(self.satirlar):
            satir = self.satirlar[self.i]
            if satir.strip() == '':
                satirlar.append('')
                self.i += 1
                continue
            g = len(satir) - len(satir.lstrip(' '))
            if blok_girinti is None:
                if g <= ust_girinti:
                    break
                blok_girinti = g
            if g < blok_girinti:
                break
            satirlar.append(satir[blok_girinti:])
            self.i += 1
        sondaki_bos = 0
        while satirlar and satirlar[-1] == '':
            satirlar.pop()
            sondaki_bos += 1
        govde = '\n'.join(satirlar) if tur == '|' else _katla(satirlar)
        if ek == '-':  # strip: sondaki satır sonlarını at
            sonuc = govde
        elif ek == '+':  # keep: hepsini koru
            sonuc = govde + '\n' * (sondaki_bos + (1 if satirlar else 0))
        else:  # clip: tek satır sonu bırak
            sonuc = govde + '\n' if satirlar else ''
        return sonuc, tur + ek

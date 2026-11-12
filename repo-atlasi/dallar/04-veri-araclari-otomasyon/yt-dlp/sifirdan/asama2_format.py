"""Aşama 2 — formatları sıralamak ve '-f' seçim dilini yorumlamak.

yt-dlp'de iki ayrı katman vardır:
  * SIRALAMA (yt_dlp/utils/_utils.py -> FormatSorter): formatları kötüden iyiye dizer.
    '-S res:720,+size' gibi alan listeleriyle değiştirilebilir.
  * SEÇİM (YoutubeDL.build_format_selector): 'bv*+ba/b' gibi küçük bir dil.
      '/'  -> soldaki bir şey bulamazsa sağdakini dene (yedek)
      '+'  -> video ve sesi birleştir (indirince ffmpeg ile tek dosya)
      ','  -> birden fazla şey indir
      '()' -> gruplama, '[height<=720]' -> süzgeç
Asıl kod bu dili Python'un kendi 'tokenize' modülüyle parçalar (koddaki TODO bunun
kırılgan olduğunu söyler). Biz kendi küçük sözcük ayırıcımızı ve özyinelemeli
iniş (recursive descent) ayrıştırıcımızı yazıyoruz.
"""

from __future__ import annotations

import itertools
import operator
import re
from dataclasses import dataclass, field

VIDEO_UZANTILARI = ('mp4', 'webm', 'mkv', 'mov', 'flv')
SES_UZANTILARI = ('m4a', 'mp3', 'ogg', 'opus', 'aac', 'wav', 'flac')
UZANTI_TERCIHI = {'mp4': 3, 'm4a': 3, 'webm': 2, 'opus': 2, 'mkv': 1}
VCODEC_SIRASI = ('av01', 'vp9', 'hevc', 'h265', 'avc', 'h264', 'vp8', 'mp4v')  # önde olan daha iyi
SAYISAL_ALANLAR = {
    'res': 'height',
    'height': 'height',
    'width': 'width',
    'fps': 'fps',
    'tbr': 'tbr',
    'abr': 'abr',
    'vbr': 'vbr',
    'size': 'filesize',
    'filesize': 'filesize',
    'asr': 'asr',
}
VARSAYILAN_SIRALAMA = ('hasvid', 'res', 'fps', 'vcodec', 'tbr', 'size', 'ext', 'hasaud', 'id')


class FormatHatasi(ValueError):
    pass


def video_var(f: dict) -> bool:
    # Codec bilinmiyorsa (None) "var" sayılır; yalnızca açıkça 'none' ise yoktur.
    return f.get('vcodec') != 'none'


def ses_var(f: dict) -> bool:
    return f.get('acodec') != 'none'


# --- SIRALAMA ---------------------------------------------------------------------
def _vcodec_puani(f: dict) -> int:
    codec = (f.get('vcodec') or '').lower()
    for sira, onek in enumerate(VCODEC_SIRASI):
        if codec.startswith(onek):
            return len(VCODEC_SIRASI) - sira
    return 0


def _alan_degeri(f: dict, alan: str, ters: bool, sinir: float | None):
    if alan == 'hasvid':
        deger = int(video_var(f))
    elif alan == 'hasaud':
        deger = int(ses_var(f))
    elif alan == 'vcodec':
        deger = _vcodec_puani(f)
    elif alan == 'ext':
        deger = UZANTI_TERCIHI.get(f.get('ext'), 0)
    elif alan == 'id':
        return f.get('format_id') or ''
    elif alan in SAYISAL_ALANLAR:
        ham = f.get(SAYISAL_ALANLAR[alan])
        deger = -1 if ham is None else ham
    else:
        raise FormatHatasi(f'Bilinmeyen sıralama alanı: {alan}')
    if sinir is not None:
        # 'res:720': 720 ve altı en iyiden kötüye; 720'yi aşanlar onlardan sonra, küçük olan önde
        return (1, deger) if deger <= sinir else (0, -deger)
    return -deger if ters else deger


def siralama_anahtari(alanlar: tuple[str, ...] | list[str] = ()):
    """Kullanıcının alanları önce, kalan varsayılan alanlar sonra gelir."""
    cozulmus = []
    for ham in list(alanlar) + [a for a in VARSAYILAN_SIRALAMA if a not in alanlar]:
        eslesme = re.fullmatch(r'(\+)?([a-z]+)(?::(\d+(?:\.\d+)?))?', ham.strip())
        if not eslesme:
            raise FormatHatasi(f'Geçersiz sıralama alanı: {ham}')
        sinir = float(eslesme.group(3)) if eslesme.group(3) else None
        cozulmus.append((eslesme.group(2), bool(eslesme.group(1)), sinir))
    return lambda f: tuple(_alan_degeri(f, alan, ters, sinir) for alan, ters, sinir in cozulmus)


def formatlari_sirala(formatlar: list[dict], alanlar=()) -> list[dict]:
    """Kötüden iyiye sıralı YENİ liste döndürür (asıl projedeki gibi en iyi en sonda)."""
    return sorted(formatlar, key=siralama_anahtari(alanlar))


# --- SEÇİM DİLİ: sözcük ayırma ve ayrıştırma -----------------------------------------
JETON_RE = re.compile(r'(?P<suzgec>\[[^\]]*\])|(?P<op>[/+,()])|(?P<ad>[A-Za-z0-9_.*-]+)')


@dataclass
class Secici:
    tur: str  # 'tek' | 'yedek' | 'birlestir' | 'coklu' | 'grup'
    deger: object
    suzgecler: list[str] = field(default_factory=list)


class _Ayristirici:
    def __init__(self, metin: str):
        self.metin = metin
        self.jetonlar: list[tuple[str, str, int]] = []
        konum = 0
        while konum < len(metin):
            if metin[konum].isspace():
                konum += 1
                continue
            eslesme = JETON_RE.match(metin, konum)
            if not eslesme:
                self._hata('Tanınmayan karakter', konum)
            self.jetonlar.append((eslesme.lastgroup, eslesme.group(), konum))
            konum = eslesme.end()
        self.i = 0

    def _hata(self, mesaj: str, konum: int | None = None):
        if konum is None:
            konum = self.jetonlar[self.i][2] if self.i < len(self.jetonlar) else len(self.metin)
        raise FormatHatasi(f'Geçersiz format tanımı: {mesaj}\n\t{self.metin}\n\t{" " * konum}^')

    def _bak(self) -> tuple[str | None, str | None]:
        if self.i < len(self.jetonlar):
            return self.jetonlar[self.i][:2]
        return None, None

    def _al(self) -> str:
        self.i += 1
        return self.jetonlar[self.i - 1][1]

    def _ikili(self, alt, op: str, tur: str) -> Secici:
        parcalar = [alt()]
        while self._bak() == ('op', op):
            self._al()
            parcalar.append(alt())
        return parcalar[0] if len(parcalar) == 1 else Secici(tur, parcalar)

    # Öncelik (düşükten yükseğe): ','  <  '/'  <  '+'  <  atom[süzgeç]
    def coklu(self) -> Secici:
        return self._ikili(self.yedek, ',', 'coklu')

    def yedek(self) -> Secici:
        return self._ikili(self.birlestir, '/', 'yedek')

    def birlestir(self) -> Secici:
        return self._ikili(self.atom, '+', 'birlestir')

    def atom(self) -> Secici:
        tur, deger = self._bak()
        if tur == 'ad':
            secici = Secici('tek', self._al())
        elif (tur, deger) == ('op', '('):
            self._al()
            secici = Secici('grup', self.coklu())
            if self._bak() != ('op', ')'):
                self._hata('")" bekleniyordu')
            self._al()
        elif tur == 'suzgec':
            secici = Secici('tek', 'best')  # yalnızca süzgeç: '[height<=480]' == 'best[height<=480]'
        else:
            self._hata('format seçici bekleniyordu')
        while self._bak()[0] == 'suzgec':
            secici.suzgecler.append(self._al()[1:-1])
        return secici

    def tamami(self) -> Secici:
        secici = self.coklu()
        if self.i != len(self.jetonlar):
            self._hata('beklenmeyen jeton')
        return secici


def ayristir(metin: str) -> Secici:
    return _Ayristirici(metin).tamami()


# --- SEÇİM DİLİ: yorumlama ---------------------------------------------------------------
TEK_RE = re.compile(r'(?P<bw>best|worst|b|w)(?P<tur>video|audio|v|a)?(?P<yildiz>\*)?(?:\.(?P<n>[1-9]\d*))?$')
SUZGEC_RE = re.compile(
    r'\s*(?P<alan>[a-z_]+)\s*(?P<op><=|>=|!=|\^=|\$=|\*=|~=|<|>|=)(?P<serbest>\?)?\s*(?P<deger>.+?)\s*$'
)
SAYI_OPLARI = {
    '<': operator.lt,
    '<=': operator.le,
    '>': operator.gt,
    '>=': operator.ge,
    '=': operator.eq,
    '!=': operator.ne,
}
METIN_OPLARI = {
    '=': operator.eq,
    '!=': operator.ne,
    '^=': str.startswith,
    '$=': str.endswith,
    '*=': operator.contains,
    '~=': lambda deger, desen: re.search(desen, deger) is not None,
}
CARPANLAR = {'': 1, 'k': 1e3, 'm': 1e6, 'g': 1e9, 'kib': 1024, 'mib': 1024**2, 'gib': 1024**3}


def _sayi(metin: str) -> float | None:
    eslesme = re.fullmatch(r'(\d+(?:\.\d+)?)\s*([kmg](?:ib)?)?b?', metin.strip().lower())
    return float(eslesme.group(1)) * CARPANLAR[eslesme.group(2) or ''] if eslesme else None


def _suzgec_derle(metin: str):
    eslesme = SUZGEC_RE.match(metin)
    if not eslesme:
        raise FormatHatasi(f'Geçersiz süzgeç: [{metin}]')
    alan, op, serbest, deger = eslesme.group('alan', 'op', 'serbest', 'deger')
    sayi = _sayi(deger)
    if op not in METIN_OPLARI and sayi is None:
        raise FormatHatasi(f'"{op}" işleci sayı ister: [{metin}]')

    def suzgec(f: dict) -> bool:
        mevcut = f.get(alan)
        if mevcut is None:
            return bool(serbest)  # '[height<=?720]': yüksekliği bilinmeyenler de geçsin
        if isinstance(mevcut, (int, float)) and sayi is not None and op in SAYI_OPLARI:
            return SAYI_OPLARI[op](mevcut, sayi)
        if op in METIN_OPLARI:  # alan metinse (ext, vcodec, format_id) metin olarak karşılaştır
            return METIN_OPLARI[op](str(mevcut), deger)
        return False

    return suzgec


def _tek(ad: str):
    eslesme = TEK_RE.match(ad)
    if eslesme:
        en_iyi = eslesme.group('bw')[0] == 'b'
        tur = (eslesme.group('tur') or ' ')[0].strip()
        yildiz = bool(eslesme.group('yildiz'))
        sira = int(eslesme.group('n') or 1)
        if tur == 'v':  # bv: yalnız video, bv*: videosu olan her şey
            uygun = video_var if yildiz else (lambda f: video_var(f) and not ses_var(f))
        elif tur == 'a':
            uygun = ses_var if yildiz else (lambda f: ses_var(f) and not video_var(f))
        else:  # b: hem video hem ses, b*: herhangi biri
            uygun = (lambda f: video_var(f) or ses_var(f)) if yildiz else (lambda f: video_var(f) and ses_var(f))
        yedekli = not tur and not yildiz

        def secici(baglam):
            eslesen = [f for f in baglam['formatlar'] if uygun(f)]
            if not eslesen and yedekli and baglam['eksik_formatlar']:
                # Sitede yalnız-ses ya da yalnız-video varsa 'b' onlara razı olur
                eslesen = [f for f in baglam['formatlar'] if video_var(f) or ses_var(f)]
            if en_iyi:
                eslesen.reverse()
            return eslesen[sira - 1 : sira]

        return secici

    if ad in SES_UZANTILARI:
        uygun = lambda f: f.get('ext') == ad and ses_var(f)  # noqa: E731
    elif ad in VIDEO_UZANTILARI:
        uygun = lambda f: f.get('ext') == ad and video_var(f) and ses_var(f)  # noqa: E731
    else:
        uygun = lambda f: f.get('format_id') == ad  # noqa: E731
    return lambda baglam: [f for f in baglam['formatlar'] if uygun(f)][-1:]


def birlesik_uzanti(video: dict, ses: dict) -> str:
    v, s = video.get('ext'), ses.get('ext')
    if v == 'mp4' and s in ('m4a', 'mp4', 'aac'):
        return 'mp4'
    if v == 'webm' and s in ('webm', 'opus', 'ogg'):
        return 'webm'
    return 'mkv'


def formatlari_birlestir(parcalar: list[dict]) -> dict:
    """'bv+ba' sonucunu tek bir sanal formata çevirir.

    Asıl koddaki _merge gibi: zaten alınmış bir akış türünü (video/ses) ikinci kez
    getiren parça atılır; geriye tek parça kalırsa birleştirmeye gerek yoktur.
    """
    kalanlar, video_alindi, ses_alindi = [], False, False
    for parca in itertools.chain.from_iterable(p.get('requested_formats', (p,)) for p in parcalar):
        yeni_video = video_var(parca) and not video_alindi
        yeni_ses = ses_var(parca) and not ses_alindi
        if not (yeni_video or yeni_ses):
            continue
        video_alindi |= video_var(parca)
        ses_alindi |= ses_var(parca)
        kalanlar.append(parca)
    if len(kalanlar) == 1:
        return kalanlar[0]
    video = next(f for f in kalanlar if video_var(f))
    ses = next(f for f in reversed(kalanlar) if ses_var(f))

    def toplam(alan):
        degerler = [f.get(alan) for f in kalanlar]
        return sum(degerler) if None not in degerler else None

    return {
        'format_id': '+'.join(f['format_id'] for f in kalanlar),
        'requested_formats': kalanlar,
        'ext': birlesik_uzanti(video, ses),
        'vcodec': video.get('vcodec'),
        'acodec': ses.get('acodec'),
        'height': video.get('height'),
        'width': video.get('width'),
        'fps': video.get('fps'),
        'tbr': toplam('tbr'),
        'filesize': toplam('filesize'),
    }


def _derle(secici: Secici):
    if secici.tur == 'tek':
        fonksiyon = _tek(secici.deger)
    elif secici.tur == 'grup':
        fonksiyon = _derle(secici.deger)
    else:
        altlar = [_derle(s) for s in secici.deger]
        if secici.tur == 'yedek':

            def fonksiyon(baglam):
                for alt in altlar:
                    sonuc = alt(baglam)
                    if sonuc:
                        return sonuc
                return []

        elif secici.tur == 'birlestir':

            def fonksiyon(baglam):
                adaylar = [alt(baglam) for alt in altlar]
                return [formatlari_birlestir(list(p)) for p in itertools.product(*adaylar)]

        else:  # coklu

            def fonksiyon(baglam):
                return [f for alt in altlar for f in alt(baglam)]

    suzgecler = [_suzgec_derle(s) for s in secici.suzgecler]
    if not suzgecler:
        return fonksiyon

    def suzgecli(baglam):
        dar = {**baglam, 'formatlar': [f for f in baglam['formatlar'] if all(s(f) for s in suzgecler)]}
        return fonksiyon(dar)

    return suzgecli


def formatlari_sec(formatlar: list[dict], tanim: str) -> list[dict]:
    """formatlar kötüden iyiye SIRALI olmalı. Seçilen (gerekirse birleşik) formatları döndürür."""
    eksik = all(not video_var(f) for f in formatlar) or all(not ses_var(f) for f in formatlar)
    return _derle(ayristir(tanim))({'formatlar': formatlar, 'eksik_formatlar': eksik})

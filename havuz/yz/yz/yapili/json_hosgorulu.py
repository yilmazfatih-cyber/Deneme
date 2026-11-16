"""Hoşgörülü JSON okuyucu: küçük modellerin bozuk JSON'unu olabildiğince değere çevirir.

Düzenli ifadeyle "yama" yapmaz; metni harf harf okuyan özyinelemeli bir ayrıştırıcıdır, bu
yüzden dizgilerin içindeki virgül ve parantezlere dokunmaz. Hoş gördükleri (her biri bir
`not` olarak kaydedilir): tek/akıllı tırnak, tırnaksız anahtar ve değer, sondaki ve eksik
virgül, // /* */ # yorumları, True/False/None, dizgi içinde ham satır sonu, kaçışsız iç
tırnak, kapanmamış dizgi, yarıda kesilmiş (kapanmamış) nesne ve dizi.
Kim kullanır: yalnız yapili/json_onar.py (`deger_oku`). Doğrudan kullanmayın.
Genişletme: yeni bir hoşgörü eklerken tests/test_json_onar.py'ye örneğini de ekleyin.
"""

from __future__ import annotations

import re
from typing import Any

from yz.metin import kucuk_ascii

EKSIK = object()  # "burada değer yok" işareti (girdi bitti ya da boş değer)
AZAMI_DERINLIK = 64  # bundan derin iç içe yapı okunmaz (özyineleme taşmasına karşı)

# Açan tırnak → onu kapatabilecek tırnaklar.
_KAPATAN = {
    '"': '"',
    "“": '”“"',
    "”": '”“"',
    "„": '”“"',
    "«": "»",
    "'": "'",
    "‘": "’‘'",
    "’": "’‘'",
    "`": "`",
}
_TEK_TIRNAKLAR = "'‘’`"
_SAYI = re.compile(r"[-+]?(?:\d+\.?\d*(?:[eE][-+]?\d+)?|\.\d+(?:[eE][-+]?\d+)?)")
_YALIN_DEGERLER: dict[str, Any] = {
    "true": True,
    "false": False,
    "null": None,
    "none": None,
    "nil": None,
    "undefined": None,
    "nan": None,
    "infinity": None,
    "-infinity": None,
}
_KACISLAR = {"n": "\n", "t": "\t", "r": "\r", "b": "\b", "f": "\f", "/": "/", "\\": "\\"}
# Bir anahtar ve iki noktası: "ad": | 'ad': | ad:
_ANAHTAR = (
    r"(?:\"[^\"\n]{0,80}\"|'[^'\n]{0,80}'|[“”„«][^“”„«»\n]{0,80}[”“»]|[‘’][^‘’\n]{0,80}[’‘]"
    r"|[A-Za-z_ÇĞİÖŞÜçğıöşü][\w ]{0,60}?)\s*:"
)
# Nesne değerinin kapanış tırnağından sonra gelebilecekler:
#   metin sonu | } ] | virgül + (son | } ] | yorum | anahtar:) | (virgül unutulmuş) anahtar:
_DEGER_SONRASI = re.compile(rf"\s*(?:$|[}}\]]|,\s*(?:$|[}}\]]|//|/\*|#|{_ANAHTAR})|{_ANAHTAR})")
_SATIRDA_ANAHTAR = re.compile(rf"\s*(?:{_ANAHTAR}|[}}\]])")
_SAYI_ARDINDAN_SAYI = re.compile(rf"{_SAYI.pattern} +[-+.\d]")
_YALIN_ANAHTAR = re.compile(r"[^\s:,{}\[\]\"'=][^:,{}\[\]\"'\n=]{0,63}")


class Okuyucu:
    """`metin` üzerinde ilerleyen hoşgörülü JSON okuyucu."""

    def __init__(self, metin: str, konum: int = 0) -> None:
        self.s = metin
        self.i = konum
        self.notlar: list[str] = []
        self.kesik = False
        self._derinlik = 0

    def _not(self, ad: str) -> None:
        if ad not in self.notlar:
            self.notlar.append(ad)

    def _bitti(self) -> bool:
        return self.i >= len(self.s)

    def bosluk_gec(self) -> None:
        """Boşlukları ve yorumları atlar."""
        while not self._bitti():
            c = self.s[self.i]
            if c.isspace() or c in "\ufeff\u200b":
                self.i += 1
            elif self.s.startswith("//", self.i) or c == "#":
                self._not("yorum")
                son = self.s.find("\n", self.i)
                self.i = len(self.s) if son < 0 else son
            elif self.s.startswith("/*", self.i):
                self._not("yorum")
                son = self.s.find("*/", self.i + 2)
                self.i = len(self.s) if son < 0 else son + 2
            else:
                return

    # ------------------------------------------------------------------ değerler

    def deger(self, baglam: str = "ust") -> Any:
        """Bulunulan konumdaki değeri okur; değer yoksa `EKSIK` döndürür."""
        self.bosluk_gec()
        if self._bitti():
            self.kesik = True
            return EKSIK
        c = self.s[self.i]
        if c in "{[":
            if self._derinlik >= AZAMI_DERINLIK:
                self.kesik = True  # aşırı iç içe: bozuk ya da kötü niyetli girdi
                self.i = len(self.s)
                return EKSIK
            self._derinlik += 1
            try:
                return self._nesne() if c == "{" else self._dizi()
            finally:
                self._derinlik -= 1
        if c in _KAPATAN:
            return self._dizgi(baglam)
        return self._yalin(baglam)

    def _nesne(self) -> dict[str, Any]:
        self.i += 1
        sonuc: dict[str, Any] = {}
        virgul_bekleniyor = False
        while True:
            self.bosluk_gec()
            if self._bitti():
                self.kesik = True
                break
            c = self.s[self.i]
            if c == "}":
                self.i += 1
                break
            if c == ",":
                self.i += 1
                virgul_bekleniyor = False
                self.bosluk_gec()
                if not self._bitti() and self.s[self.i] == "}":
                    self._not("sondaki_virgul")
                continue
            if c in "]{[":
                self.kesik = True  # yapı bozuk: nesneyi burada kapat, kalanını üst düzey okur
                break
            if virgul_bekleniyor:
                self._not("eksik_virgul")
            anahtar = self._anahtar()
            if anahtar is EKSIK:
                self.kesik = True
                break
            self.bosluk_gec()
            if self._bitti():
                self.kesik = True
                break
            if self.s[self.i] not in ":=":
                self.kesik = True  # anahtardan sonra iki nokta yok: yapı bozuk
                break
            self.i += 2 if self.s.startswith("=>", self.i) else 1
            deger = self.deger("nesne_degeri")
            if deger is EKSIK:
                if not self.kesik:
                    sonuc[str(anahtar)] = None
                    self._not("bos_deger")
                    continue
                break
            sonuc[str(anahtar)] = deger
            virgul_bekleniyor = True
        return sonuc

    def _dizi(self) -> list[Any]:
        self.i += 1
        sonuc: list[Any] = []
        virgul_bekleniyor = False
        while True:
            self.bosluk_gec()
            if self._bitti():
                self.kesik = True
                break
            c = self.s[self.i]
            if c == "]":
                self.i += 1
                break
            if c == ",":
                self.i += 1
                virgul_bekleniyor = False
                self.bosluk_gec()
                if not self._bitti() and self.s[self.i] == "]":
                    self._not("sondaki_virgul")
                continue
            if c == "}":
                self.kesik = True
                break
            if self.s.startswith("...", self.i) or c == "…":
                self._not("uc_nokta")
                self.i += 3 if c == "." else 1
                continue
            if virgul_bekleniyor:
                self._not("eksik_virgul")
            onceki = self.i
            deger = self.deger("dizi_ogesi")
            if deger is EKSIK:
                if self.i == onceki:
                    self.i += 1  # ilerleme yoksa bir harf atla (sonsuz döngü koruması)
                if self.kesik:
                    break
                continue
            sonuc.append(deger)
            virgul_bekleniyor = True
        return sonuc

    def _anahtar(self) -> Any:
        if self.s[self.i] in _KAPATAN:
            return self._dizgi("anahtar")
        eslesme = _YALIN_ANAHTAR.match(self.s, self.i)
        if eslesme is None:
            return EKSIK
        son = eslesme.end()
        if son >= len(self.s) or self.s[son] not in ":=":
            return EKSIK  # iki nokta yok: bu bir anahtar değil, düz yazı
        self._not("tirnaksiz_anahtar")
        self.i = son
        return eslesme.group().strip()

    def _yalin(self, baglam: str) -> Any:
        """Tırnaksız değer: sayı, true/false/null ya da düz kelime."""
        bas = self.i
        while not self._bitti() and self.s[self.i] not in ',}]\n"{[':
            if self.s.startswith(("//", "/*", " #"), self.i):
                break
            if (
                baglam == "dizi_ogesi"
                and self.s[self.i] == " "
                and _SAYI_ARDINDAN_SAYI.match(self.s, bas)
            ):
                break  # [1 2 3]: virgül unutulmuş sayılar ayrı öğelerdir
            self.i += 1
        ham = self.s[bas : self.i].strip()
        if not ham:
            return EKSIK
        if _SAYI.fullmatch(ham):
            if re.fullmatch(r"[-+]?0\d+", ham):
                self._not("basta_sifir")
                return ham  # "0532…" gibi: sayıya çevrilirse baştaki sıfır kaybolur
            if re.fullmatch(r"[-+]?\d+", ham):
                return int(ham)
            return float(ham)
        kucuk = kucuk_ascii(ham)
        if kucuk in _YALIN_DEGERLER:
            if ham not in ("true", "false", "null"):
                self._not("python_degeri")
            return _YALIN_DEGERLER[kucuk]
        if baglam == "ust":
            return EKSIK  # üst düzeyde düz kelime JSON değildir
        self._not("tirnaksiz_deger")
        return ham

    # ------------------------------------------------------------------ dizgi

    def _dizgi(self, baglam: str) -> str:
        acan = self.s[self.i]
        kapatanlar = _KAPATAN[acan]
        if acan in _TEK_TIRNAKLAR:
            self._not("tek_tirnak")
        elif acan != '"':
            self._not("akilli_tirnak")
        self.i += 1
        parcalar: list[str] = []
        while True:
            if self._bitti():
                self.kesik = True
                break
            c = self.s[self.i]
            if c == "\\":
                parcalar.append(self._kacis())
                continue
            if c in kapatanlar:
                if self._kapanis_mi(baglam):
                    self.i += 1
                    break
                self._not("ic_tirnak")
            elif c == "\n":
                if baglam == "nesne_degeri" and _SATIRDA_ANAHTAR.match(self.s, self.i + 1):
                    self._not("kapanmamis_dizgi")
                    break
                self._not("satir_sonu")
            parcalar.append(c)
            self.i += 1
        return "".join(parcalar)

    def _kapanis_mi(self, baglam: str) -> bool:
        """Bu tırnak dizgiyi gerçekten kapatıyor mu (yoksa kaçışsız iç tırnak mı)?"""
        kalan = self.s[self.i + 1 : self.i + 200]
        if baglam == "anahtar":
            return bool(re.match(r"\s*(?:[:=]|$)", kalan))
        if baglam == "nesne_degeri":
            return bool(_DEGER_SONRASI.match(kalan))
        return bool(re.match(r"\s*(?:$|[,\]}]|[\"'{\[])", kalan))

    def _kacis(self) -> str:
        """Ters eğik çizgiyle başlayan kaçışı çözer; `self.i`'yi ilerletir."""
        if self.i + 1 >= len(self.s):
            self.i += 1
            self.kesik = True
            return ""
        c = self.s[self.i + 1]
        if c == "u":
            onaltilik = self.s[self.i + 2 : self.i + 6]
            if re.fullmatch(r"[0-9a-fA-F]{4}", onaltilik):
                self.i += 6
                kod = int(onaltilik, 16)
                esi = re.match(r"\\u([dD][c-fC-F][0-9a-fA-F]{2})", self.s[self.i : self.i + 6])
                if 0xD800 <= kod <= 0xDBFF and esi:
                    self.i += 6
                    kod = 0x10000 + ((kod - 0xD800) << 10) + (int(esi.group(1), 16) - 0xDC00)
                return chr(kod) if not 0xD800 <= kod <= 0xDFFF else "\ufffd"
        self.i += 2
        if c in _KACISLAR:
            return _KACISLAR[c]
        if c in _KAPATAN:
            return c
        self._not("gecersiz_kacis")
        return "\\" + c  # "C:\Users" gibi: ters çizgiyi koru

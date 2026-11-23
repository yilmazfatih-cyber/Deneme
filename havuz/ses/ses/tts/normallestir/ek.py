"""Kesme işaretinden sonraki eki, kelimenin OKUNUŞUNA göre yeniden uyumlar ("TL'ye" → "liraya").

Neden: Yazar eki yazılı biçimin okunuşuna göre seçer ("TL'ye" = "te-le-ye", "100'e" = "yüz-e").
Rakam ya da kısaltma yazıya çevrilince okunuş değişebilir: "100 TL'ye" → "yüz lira" + "ya";
"5 kuruş'a"… Kurallar: (1) ünlü uyumu — ek ünlüleri A (a/e) ve I (ı/i/u/ü) olarak okunup gövdenin son
ünlüsüne göre yeniden seçilir; (2) ünsüz benzeşmesi — ekin başındaki d/t ve c/ç, gövde sert ünsüzle
(f s t k ç ş h p) bitiyorsa t/ç, değilse d/c olur; (3) kaynaştırma — ek ünlüyle başlıyorsa ünlüyle
biten gövdeye y/n/s eklenir, ünsüzle biten gövdede düşer; (4) "dört" ünlüyle başlayan ekten önce
"dörd" olur (öteki sayı adları yumuşamaz: üçü, kırkı); (5) "-ki" ve "-ken" uyuma girmez.
İyelikli bileşik okunuşlarda ("Türk lirası", "Atatürk caddesi") durum ekleri n ile bağlanır:
"lirasına", "caddesinde". Kim kullanır: kurallar.py. Genişletme: yeni bir istisna → ilgili
işleve dal + tests/test_normallestir.py'deki `EK_ORNEKLERI` tablosuna satır.
"""

from __future__ import annotations

UNLULER = "aeıioöuü"
KALIN = "aıou"
SERT = "fstkçşhp"
_DEGISMEZ = ("ki", "ken")


def son_unlu(metin: str) -> str:
    """Metindeki son ünlü (yoksa "e" — ince sayılır)."""
    for harf in reversed(metin):
        if harf in UNLULER:
            return harf
    return "e"


def _unlu_sec(ek_unlusu: str, onceki: str) -> str:
    if ek_unlusu in "ae":
        return "a" if onceki in KALIN else "e"
    if ek_unlusu in "ıiuü":
        if onceki in "aı":
            return "ı"
        if onceki in "ei":
            return "i"
        return "u" if onceki in "ou" else "ü"
    return ek_unlusu  # o, ö: uyuma girmeyen ek (ör. -yor) olduğu gibi kalır


def _tampon_ayir(ek: str) -> tuple[str, str]:
    """Ekin başındaki kaynaştırma harfini ayırır: "ye" → ("y", "e"), "sız" → ("", "sız")."""
    if len(ek) >= 2 and ek[0] == "y":
        return "y", ek[1:]
    if len(ek) >= 2 and ek[0] in "ns" and ek[1] in UNLULER:
        if ek[0] == "s" and len(ek) >= 3 and ek[2] == "z":
            return "", ek  # -sIz (yokluk eki): kaynaştırma değil
        return ek[0], ek[1:]
    return "", ek


def _govde_hazirla(govde: str, govde_unluyle_biter: bool, ek_unluyle_baslar: bool) -> str:
    if ek_unluyle_baslar and not govde_unluyle_biter and govde.endswith("dört"):
        return govde[:-1] + "d"  # dört → dördü, dörde, dördüncü
    return govde


def ek_uyumla(govde: str, ek: str, *, iyelikli: bool = False) -> str:
    """`govde` (okunuş) + `ek` (yazılı ek, kesme işaretsiz) → uyumlu birleşik okunuş.

    >>> ek_uyumla("yüz lira", "ye")
    'yüz liraya'
    >>> ek_uyumla("üç", "te")
    'üçte'
    """
    if not ek:
        return govde
    govde_son = govde.rstrip()[-1:] or "e"
    unluyle_biter = govde_son in UNLULER
    tampon, govde_eki = _tampon_ayir(ek)
    if not govde_eki:
        return govde
    unluyle_baslar = govde_eki[0] in UNLULER
    if iyelikli and unluyle_biter and (unluyle_baslar or govde_eki[0] in "dt"):
        tampon = "n"  # Türk lirası + e → lirasına; caddesi + de → caddesinde
    elif iyelikli and unluyle_biter and govde_eki[0] == "l":
        tampon = "y"  # caddesiyle
    if not unluyle_biter:
        tampon = ""
    elif unluyle_baslar and not tampon:
        tampon = "y"  # yazılışta tampon yoksa en yaygını (durum eki: -yA, -yI)
    sonuc = [tampon] if tampon else []
    onceki_harf = tampon or govde_son
    onceki_unlu = son_unlu(govde)
    i = 0
    while i < len(govde_eki):
        degismez = next((d for d in _DEGISMEZ if govde_eki.startswith(d, i)), None)
        if degismez:
            sonuc.append(degismez)
            onceki_unlu, onceki_harf, i = son_unlu(degismez), degismez[-1], i + len(degismez)
            continue
        harf = govde_eki[i]
        if harf in UNLULER:
            harf = _unlu_sec(harf, onceki_unlu)
            onceki_unlu = harf
        elif i == 0 and harf in "dt":
            harf = "t" if onceki_harf in SERT else "d"
        elif i == 0 and harf in "cç":
            harf = "ç" if onceki_harf in SERT else "c"
        sonuc.append(harf)
        onceki_harf = harf
        i += 1
    return _govde_hazirla(govde, unluyle_biter, unluyle_baslar and not tampon) + "".join(sonuc)

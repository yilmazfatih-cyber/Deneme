"""Birleşik fark (unified diff) üretme ve uygulama — yalnız standart kütüphane, `patch`/`git` gerekmez.

    yama = yama_uret(eski_metin, yeni_metin, "api/src/app.ts")   # dosyalar/…/app.ts.patch içeriği
    yeni = yama_uygula(eski_metin, yama)                          # bağlam birebir tutmazsa YamaHatasi

Uygulama katıdır: her parçanın (hunk) bağlam ve silinen satırları hedefte BİREBİR bulunmalıdır. Satır
numarası kaymışsa (temel güncellendi) en yakın birebir eşleşme aranır; bulunamazsa hata hangi parçanın
tutmadığını ve ne yapılacağını söyler. "\\ No newline at end of file" işaretleri desteklenir.
Genişletme: yeni bir fark biçimi gerekirse (ör. dosya silme) `yama_uygula`'ya dal ekleyin ve
tests/test_yama.py'de hem üretip hem uygulayan bir gidiş-dönüş testi yazın.
"""

from __future__ import annotations

import difflib
import re
from dataclasses import dataclass, field

_BASLIK = re.compile(r"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@")
SONSUZ_SATIR_YOK = "\\ No newline at end of file"


class YamaHatasi(Exception):
    """Yama hedefe uygulanamadı (ileti hangi parçanın neden tutmadığını söyler)."""


@dataclass
class _Parca:
    eski_baslangic: int
    satirlar: list[tuple[str, str]] = field(default_factory=list)  # (işaret, satır sonlu metin)

    def eski(self) -> list[str]:
        return [metin for isaret, metin in self.satirlar if isaret in (" ", "-")]

    def yeni(self) -> list[str]:
        return [metin for isaret, metin in self.satirlar if isaret in (" ", "+")]


def yama_uret(eski: str, yeni: str, yol: str, baglam: int = 3) -> str:
    """İki metin arasındaki farkı `--- a/yol` / `+++ b/yol` başlıklı birleşik fark olarak döndürür."""
    satirlar = difflib.unified_diff(
        eski.splitlines(keepends=True),
        yeni.splitlines(keepends=True),
        fromfile=f"a/{yol}",
        tofile=f"b/{yol}",
        n=baglam,
    )
    cikti: list[str] = []
    for satir in satirlar:
        if satir.endswith("\n"):
            cikti.append(satir)
        else:  # dosyanın son satırında satır sonu yok
            cikti.append(satir + "\n" + SONSUZ_SATIR_YOK + "\n")
    return "".join(cikti)


def _parcalari_oku(yama: str) -> list[_Parca]:
    parcalar: list[_Parca] = []
    satirlar = yama.splitlines(keepends=True)
    for no, satir in enumerate(satirlar, start=1):
        if satir.startswith(("--- ", "+++ ")) and not parcalar:
            continue
        eslesme = _BASLIK.match(satir)
        if eslesme:
            parcalar.append(_Parca(int(eslesme.group(1))))
            continue
        if not parcalar:
            continue
        if satir.rstrip("\n") == SONSUZ_SATIR_YOK:
            isaret, metin = parcalar[-1].satirlar[-1]
            parcalar[-1].satirlar[-1] = (isaret, metin.removesuffix("\n"))
            continue
        isaret = satir[:1] if satir[:1] in (" ", "+", "-") else ""
        if not isaret:
            raise YamaHatasi(f"Yamanın {no}. satırı tanınmıyor: {satir.rstrip()!r}")
        parcalar[-1].satirlar.append((isaret, satir[1:]))
    if not parcalar:
        raise YamaHatasi("Yamada hiç değişiklik parçası (@@ … @@) yok.")
    return parcalar


def _bul(metin: list[str], aranan: list[str], tahmin: int, alt_sinir: int) -> int | None:
    """`aranan` blokunun `metin` içindeki konumu; tahmine en yakın birebir eşleşme."""
    if not aranan:
        return max(min(tahmin, len(metin)), alt_sinir)
    adaylar = [
        konum
        for konum in range(alt_sinir, len(metin) - len(aranan) + 1)
        if metin[konum : konum + len(aranan)] == aranan
    ]
    return min(adaylar, key=lambda konum: abs(konum - tahmin)) if adaylar else None


def yama_uygula(metin: str, yama: str, ad: str = "dosya") -> str:
    """`yama`yı `metin`e uygular ve yeni metni döndürür; tutmayan parçada `YamaHatasi`."""
    satirlar = metin.splitlines(keepends=True)
    kayma = 0
    alt_sinir = 0
    for sira, parca in enumerate(_parcalari_oku(yama), start=1):
        eski, yeni = parca.eski(), parca.yeni()
        tahmin = max(parca.eski_baslangic - 1 + kayma, 0) if eski else parca.eski_baslangic + kayma
        konum = _bul(satirlar, eski, tahmin, alt_sinir)
        if konum is None:
            ilk = eski[0].rstrip() if eski else ""
            raise YamaHatasi(
                f"{ad}: {sira}. parça uygulanamadı (beklenen satırlar bulunamadı; ilk satır: {ilk!r}). "
                "Temel bu tarif yazıldıktan sonra değişmiş olabilir: değişikliği elle yapıp "
                "`python tarif.py yakala <tarif> <çalışma klasörü>` ile yamayı yenileyin."
            )
        satirlar[konum : konum + len(eski)] = yeni
        kayma += len(yeni) - len(eski)
        alt_sinir = konum + len(yeni)
    return "".join(satirlar)

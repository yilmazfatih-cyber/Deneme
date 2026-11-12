#!/usr/bin/env python3
"""
Markdown onay kutularından ilerleme raporu.

coding-interview-university'nin önerdiği kullanım: depoyu fork'la, bitirdiğin maddenin
kutusunu `- [x]` yap, commit'le, `git pull upstream main` ile güncel tut. Bu araç o dosyayı
(ya da ossu-computer-science/sifirdan/plan_yaz.py çıktısını) okur ve bölüm bölüm ilerleme,
toplam yüzde ve sıradaki maddeleri gösterir. İki araç birbirini içe aktarmaz; ortak dilleri
GitHub'ın görev listesi (task list) biçimidir.

Desteklenenler: `-`, `*`, `+` ve `1.` liste işaretleri; `[x]` ve `[X]`; iç içe kutular
(üst madde "özet" sayılır, istenirse yalnız yapraklar sayılır); `- ### Başlık` biçimindeki
liste içi başlıklar (CIU README'si böyle yazılmıştır); kod blokları (```) içindeki kutular
sayılmaz.

Kullanım:
    python3 ilerleme.py README.md --seviye 2 --sonraki 5
    python3 ilerleme.py plan.md --seviye 3 --yapraklar --json
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import asdict, dataclass
from pathlib import Path

KUTU = re.compile(r"^(?P<girinti>\s*)(?:[-*+]|\d+[.)])\s+\[(?P<isaret>[ xX])\]\s+(?P<metin>.*?)\s*$")
BASLIK = re.compile(r"^\s*(?:[-*+]\s+)?(?P<diyez>#{1,6})\s+(?P<metin>.*?)\s*#*\s*$")
CIT = re.compile(r"^\s*(```|~~~)")


@dataclass(frozen=True)
class Madde:
    metin: str
    isaretli: bool
    satir: int
    girinti: int
    bolum: str
    yaprak: bool


@dataclass
class BolumOzeti:
    baslik: str
    toplam: int
    biten: int

    @property
    def oran(self) -> float:
        return self.biten / self.toplam if self.toplam else 0.0


def maddeleri_oku(metin: str, seviye: int = 2) -> list[Madde]:
    """
    Metindeki onay kutularını sırayla okur. `seviye`, bölüm sayılacak en derin başlıktır
    (2 = "##"). Daha derin başlıklar bölüm değiştirmez.

    >>> ornek = "## A\\n- [x] bir\\n- [ ] iki\\n    - [ ] iki-alt\\n## B\\n```\\n- [ ] sayılmaz\\n```\\n1. [X] üç"
    >>> [(m.bolum, m.metin, m.isaretli, m.yaprak) for m in maddeleri_oku(ornek)]
    [('A', 'bir', True, True), ('A', 'iki', False, False), ('A', 'iki-alt', False, True), ('B', 'üç', True, True)]
    """
    ham: list[tuple[str, bool, int, int, str]] = []
    bolum = "(başlıksız)"
    kod_icinde = False
    for satir_no, satir in enumerate(metin.splitlines(), start=1):
        if CIT.match(satir):
            kod_icinde = not kod_icinde
            continue
        if kod_icinde:
            continue
        acik = satir.expandtabs(4)
        if kutu := KUTU.match(acik):
            ham.append((kutu["metin"], kutu["isaret"] != " ", satir_no, len(kutu["girinti"]), bolum))
        elif (baslik := BASLIK.match(acik)) and len(baslik["diyez"]) <= seviye:
            bolum = baslik["metin"]
    maddeler = []
    for indeks, (metin_, isaretli, satir_no, girinti, bolum_) in enumerate(ham):
        sonraki = ham[indeks + 1] if indeks + 1 < len(ham) else None
        # Hemen ardından, aynı bölümde daha içeride bir kutu geliyorsa bu madde bir "özet" maddedir.
        yaprak = not (sonraki and sonraki[4] == bolum_ and sonraki[3] > girinti)
        maddeler.append(Madde(metin_, isaretli, satir_no, girinti, bolum_, yaprak))
    return maddeler


def ozetle(maddeler: list[Madde], yalniz_yapraklar: bool = False) -> list[BolumOzeti]:
    ozetler: dict[str, BolumOzeti] = {}
    for madde in maddeler:
        if yalniz_yapraklar and not madde.yaprak:
            continue
        ozet = ozetler.setdefault(madde.bolum, BolumOzeti(madde.bolum, 0, 0))
        ozet.toplam += 1
        ozet.biten += madde.isaretli
    return list(ozetler.values())


def sonraki_maddeler(maddeler: list[Madde], adet: int = 5) -> list[Madde]:
    """Belgedeki sırayla ilk `adet` işaretsiz yaprak madde: 'bugün ne yapayım?' sorusunun yanıtı."""
    return [m for m in maddeler if m.yaprak and not m.isaretli][:adet]


def cubuk(oran: float, genislik: int = 20) -> str:
    """
    >>> cubuk(0.5, 10)
    '[#####.....]'
    """
    dolu = round(oran * genislik)
    return "[" + "#" * dolu + "." * (genislik - dolu) + "]"


def rapor_metni(maddeler: list[Madde], yalniz_yapraklar: bool, adet: int) -> str:
    ozetler = ozetle(maddeler, yalniz_yapraklar)
    toplam = sum(o.toplam for o in ozetler)
    biten = sum(o.biten for o in ozetler)
    genis = max([len(o.baslik) for o in ozetler] + [6])
    satirlar = [f"{o.baslik[:60]:<{min(genis, 60)}}  {cubuk(o.oran)} {o.biten:>4}/{o.toplam:<4}" for o in ozetler]
    oran = biten / toplam if toplam else 0.0
    satirlar.append(f"{'TOPLAM':<{min(genis, 60)}}  {cubuk(oran)} {biten:>4}/{toplam:<4} ({oran:.0%})")
    if adet:
        satirlar.append("")
        satirlar.append("Sıradaki maddeler:")
        satirlar += [f"  {m.satir:>5}. satır  {m.metin}" for m in sonraki_maddeler(maddeler, adet)]
    return "\n".join(satirlar)


def main(argv: list[str] | None = None) -> int:
    ayristirici = argparse.ArgumentParser(description="Markdown onay kutularından ilerleme raporu.")
    ayristirici.add_argument("dosya", type=Path)
    ayristirici.add_argument("--seviye", type=int, default=2, help="bölüm sayılacak en derin başlık (2 = ##)")
    ayristirici.add_argument("--sonraki", type=int, default=5, help="gösterilecek sıradaki madde sayısı")
    ayristirici.add_argument("--yapraklar", action="store_true", help="yalnız alt maddesi olmayan kutuları say")
    ayristirici.add_argument("--json", action="store_true", help="makine okunur çıktı")
    secenekler = ayristirici.parse_args(argv)

    maddeler = maddeleri_oku(secenekler.dosya.read_text(encoding="utf-8"), secenekler.seviye)
    if secenekler.json:
        veri = {
            "bolumler": [asdict(o) | {"oran": round(o.oran, 4)} for o in ozetle(maddeler, secenekler.yapraklar)],
            "sonraki": [asdict(m) for m in sonraki_maddeler(maddeler, secenekler.sonraki)],
        }
        print(json.dumps(veri, ensure_ascii=False, indent=2))
    else:
        print(rapor_metni(maddeler, secenekler.yapraklar, secenekler.sonraki))
    return 0


if __name__ == "__main__":
    sys.exit(main())

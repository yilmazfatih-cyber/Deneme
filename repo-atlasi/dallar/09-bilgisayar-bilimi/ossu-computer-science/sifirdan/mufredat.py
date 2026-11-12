"""
Müfredat grafı: JSON'dan ders listesini okur, doğrular ve topolojik sıraya koyar.

OSSU'nun README'sindeki her ders tablosunda "Prerequisites" sütunu vardır; dersler ve
önkoşullar birlikte yönlü bir graf oluşturur. Bir ders, önkoşullarının hepsi bittiğinde
başlanabilir. Bu yüzden çalışma sırası, grafın bir topolojik sıralamasıdır.

JSON biçimi:
    {
      "baslik": "...",
      "dersler": [
        {"kimlik": "algo-1", "ad": "...", "hafta": 8, "saat_min": 4, "saat_max": 8,
         "onkosullar": ["math-for-cs"], "bolum": "Core theory", "secmeli": false,
         "kulvar": "algoritma", "kaynak": "https://...", "aciklama": "..."}
      ]
    }
Toplam saat "saat" ile doğrudan verilebilir; verilmezse hafta * (saat_min + saat_max) / 2.
"""

from __future__ import annotations

import heapq
import json
from dataclasses import dataclass, field
from pathlib import Path


class MufredatHatasi(ValueError):
    """Müfredat verisi tutarsız."""


class DonguHatasi(MufredatHatasi):
    def __init__(self, dongu: list[str]) -> None:
        self.dongu = dongu
        super().__init__("önkoşul döngüsü: " + " -> ".join(dongu))


@dataclass(frozen=True)
class Ders:
    kimlik: str
    ad: str
    saat: float
    onkosullar: tuple[str, ...] = ()
    bolum: str = ""
    secmeli: bool = False
    kaynak: str = ""
    aciklama: str = ""
    dugumler: tuple[str, ...] = field(default=())
    kulvar: str = ""


def dersten(kayit: dict) -> Ders:
    """
    JSON kaydını Ders nesnesine çevirir.

    >>> dersten({"kimlik": "a", "ad": "A", "hafta": 8, "saat_min": 4, "saat_max": 8}).saat
    48.0
    >>> dersten({"kimlik": "b", "ad": "B", "saat": 12, "onkosullar": ["a"]}).onkosullar
    ('a',)
    """
    if "saat" in kayit:
        saat = float(kayit["saat"])
    else:
        saat = kayit["hafta"] * (kayit["saat_min"] + kayit["saat_max"]) / 2
    if saat <= 0:
        raise MufredatHatasi(f"{kayit['kimlik']}: süre pozitif olmalı")
    return Ders(
        kimlik=kayit["kimlik"],
        ad=kayit["ad"],
        saat=saat,
        onkosullar=tuple(kayit.get("onkosullar", ())),
        bolum=kayit.get("bolum", ""),
        secmeli=bool(kayit.get("secmeli", False)),
        kaynak=kayit.get("kaynak", ""),
        aciklama=kayit.get("aciklama", ""),
        dugumler=tuple(kayit.get("dugumler", ())),
        kulvar=kayit.get("kulvar", ""),
    )


def yukle(yol: Path | str) -> tuple[str, list[Ders]]:
    """JSON dosyasını okur, doğrular; (başlık, dersler) döndürür."""
    veri = json.loads(Path(yol).read_text(encoding="utf-8"))
    dersler = [dersten(kayit) for kayit in veri["dersler"]]
    dogrula(dersler)
    return veri.get("baslik", Path(yol).stem), dersler


def dongu_bul(dersler: list[Ders]) -> list[str] | None:
    """
    Önkoşul grafında bir döngü varsa döngüyü (başı sonunda tekrar ederek) döndürür.
    Üç renkli derinlik öncelikli arama: beyaz (görülmedi), gri (yığında), siyah (bitti).
    Gri bir düğüme yeniden varmak, geri kenar yani döngü demektir.

    >>> dongu_bul([Ders("a", "A", 1, ("b",)), Ders("b", "B", 1, ("a",))])
    ['a', 'b', 'a']
    >>> dongu_bul([Ders("a", "A", 1), Ders("b", "B", 1, ("a",))]) is None
    True
    """
    onkosul = {ders.kimlik: ders.onkosullar for ders in dersler}
    renk = dict.fromkeys(onkosul, "beyaz")
    yol: list[str] = []

    def ziyaret(kimlik: str) -> list[str] | None:
        renk[kimlik] = "gri"
        yol.append(kimlik)
        for once in onkosul[kimlik]:
            if renk[once] == "gri":
                return [*yol[yol.index(once) :], once]
            if renk[once] == "beyaz" and (bulunan := ziyaret(once)):
                return bulunan
        yol.pop()
        renk[kimlik] = "siyah"
        return None

    for kimlik in onkosul:
        if renk[kimlik] == "beyaz" and (bulunan := ziyaret(kimlik)):
            return bulunan
    return None


def dogrula(dersler: list[Ders]) -> None:
    """Yinelenen kimlik, bilinmeyen önkoşul ve döngü için MufredatHatasi fırlatır."""
    kimlikler = [ders.kimlik for ders in dersler]
    if yinelenen := sorted({k for k in kimlikler if kimlikler.count(k) > 1}):
        raise MufredatHatasi(f"yinelenen kimlik: {', '.join(yinelenen)}")
    bilinen = set(kimlikler)
    for ders in dersler:
        if bilinmeyen := [o for o in ders.onkosullar if o not in bilinen]:
            raise MufredatHatasi(f"{ders.kimlik}: bilinmeyen önkoşul: {', '.join(bilinmeyen)}")
    if dongu := dongu_bul(dersler):
        raise DonguHatasi(dongu)


def topolojik_sira(dersler: list[Ders]) -> list[Ders]:
    """
    Kahn algoritması. Aynı anda birden çok ders hazırsa önce zorunlu olanı, sonra dosyadaki
    sırası önde olanı seçeriz (öncelik kuyruğu). Böylece sıralama hem geçerli hem de
    müfredatı yazanın niyetine sadık olur.

    >>> sira = topolojik_sira([Ders("algo", "Algo", 1, ("mat",)), Ders("mat", "Mat", 1), Ders("ag", "Ağ", 1)])
    >>> [d.kimlik for d in sira]
    ['mat', 'algo', 'ag']
    """
    dogrula(dersler)
    dosya_sirasi = {ders.kimlik: indeks for indeks, ders in enumerate(dersler)}
    kalan_onkosul = {ders.kimlik: len(set(ders.onkosullar)) for ders in dersler}
    bagimlilar: dict[str, list[str]] = {ders.kimlik: [] for ders in dersler}
    for ders in dersler:
        for once in set(ders.onkosullar):
            bagimlilar[once].append(ders.kimlik)
    kimlige_gore = {ders.kimlik: ders for ders in dersler}

    def anahtar(kimlik: str) -> tuple[bool, int, str]:
        return (kimlige_gore[kimlik].secmeli, dosya_sirasi[kimlik], kimlik)

    hazir = [anahtar(k) for k, sayi in kalan_onkosul.items() if sayi == 0]
    heapq.heapify(hazir)
    sira = []
    while hazir:
        kimlik = heapq.heappop(hazir)[2]
        sira.append(kimlige_gore[kimlik])
        for sonraki in bagimlilar[kimlik]:
            kalan_onkosul[sonraki] -= 1
            if kalan_onkosul[sonraki] == 0:
                heapq.heappush(hazir, anahtar(sonraki))
    return sira


def toplam_saat(dersler: list[Ders], secmeliler_dahil: bool = True) -> float:
    return sum(d.saat for d in dersler if secmeliler_dahil or not d.secmeli)

"""Modelin "düşünme" metnini (<think>…</think>) asıl yanıttan ayırır.

Bazı küçük modeller (Qwen3, DeepSeek-R1 türevleri, SmolLM3…) yanıttan önce düşüncelerini
<think> etiketleri arasında yazar. Bu metin kullanıcıya gösterilmez ve JSON ayrıştırmayı bozar.
Akışta etiket iki parçaya bölünebilir ("<thi" + "nk>"); `DusunceAyirici` bunu da çözer.
Kim kullanır: saglayici/openai_bicim.py.
Genişletme: başka bir etiket çifti → `ETIKETLER` listesine ekleyin.
"""

from __future__ import annotations

ETIKETLER: tuple[tuple[str, str], ...] = (
    ("<think>", "</think>"),
    ("<thinking>", "</thinking>"),
    ("<|begin_of_thought|>", "<|end_of_thought|>"),
)


def _kismi_son_ek(metin: str, etiket: str) -> int:
    """`metin`in sonu, `etiket`in başıyla en çok kaç karakter örtüşüyor?"""
    for uzunluk in range(min(len(metin), len(etiket) - 1), 0, -1):
        if etiket.startswith(metin[-uzunluk:]):
            return uzunluk
    return 0


class DusunceAyirici:
    """Akış parçalarını (yanıt metni, düşünce metni) olarak ikiye ayırır."""

    def __init__(self) -> None:
        self._tampon = ""
        self._kapanis: str | None = None  # düşünce bloğunun içindeysek beklenen kapanış etiketi
        self._bas_kirp = False  # blok kapandıktan sonra gelen baştaki boşlukları at

    def besle(self, parca: str) -> tuple[str, str]:
        """Yeni parçayı işler; (yanıt metni, düşünce metni) döndürür."""
        self._tampon += parca
        metin: list[str] = []
        dusunce: list[str] = []
        while self._tampon:
            if self._kapanis is not None:
                konum = self._tampon.find(self._kapanis)
                if konum < 0:
                    tut = _kismi_son_ek(self._tampon, self._kapanis)
                    dusunce.append(self._tampon[: len(self._tampon) - tut])
                    self._tampon = self._tampon[len(self._tampon) - tut :]
                    break
                dusunce.append(self._tampon[:konum])
                self._tampon = self._tampon[konum + len(self._kapanis) :]
                self._kapanis = None
                self._bas_kirp = True
                continue
            acilis = self._ilk_acilis()
            if acilis is None:
                tut = max(_kismi_son_ek(self._tampon, ac) for ac, _ in ETIKETLER)
                metin.append(self._tampon[: len(self._tampon) - tut])
                self._tampon = self._tampon[len(self._tampon) - tut :]
                break
            konum, ac, kapa = acilis
            metin.append(self._tampon[:konum])
            self._tampon = self._tampon[konum + len(ac) :]
            self._kapanis = kapa
        return self._kirp("".join(metin)), "".join(dusunce)

    def bitir(self) -> tuple[str, str]:
        """Akış bitti: tamponda kalanı boşaltır (kapanmamış blok düşünce sayılır)."""
        kalan, self._tampon = self._tampon, ""
        if self._kapanis is not None:
            return "", kalan
        return self._kirp(kalan), ""

    def _ilk_acilis(self) -> tuple[int, str, str] | None:
        bulunan = [(self._tampon.find(ac), ac, kapa) for ac, kapa in ETIKETLER]
        gecerli = [b for b in bulunan if b[0] >= 0]
        return min(gecerli) if gecerli else None

    def _kirp(self, metin: str) -> str:
        if self._bas_kirp and metin:
            kirpilmis = metin.lstrip()
            if kirpilmis:
                self._bas_kirp = False
            return kirpilmis
        return metin


def dusunce_ayir(metin: str) -> tuple[str, str]:
    """Tam bir yanıtı (yanıt metni, düşünce metni) olarak ayırır."""
    ayirici = DusunceAyirici()
    metin1, dusunce1 = ayirici.besle(metin)
    metin2, dusunce2 = ayirici.bitir()
    return (metin1 + metin2).strip() if dusunce1 or dusunce2 else metin1 + metin2, (
        dusunce1 + dusunce2
    ).strip()

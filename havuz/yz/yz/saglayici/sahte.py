"""Sahte sağlayıcı: ağ ve model olmadan, betikteki yanıtları sırayla verir.

İki kullanım:
    1. Testler: `Sahte(["ilk yanıt", Sahte.arac_yaniti("hesapla", {"ifade": "2+2"}), ...])`.
       Her çağrı sıradaki betik öğesini tüketir; gelen istekler `.istekler`de birikir.
       Betik bitince hata verir (sonsuz döngüyü testte yakalamak için).
    2. Çevrimdışı gösterim: `Sahte.gosterim()` — soruya göre makul görünen yanıt uydurur
       (arayüzü ve akışı model olmadan denemek için; GERÇEK ZEKÂ YOKTUR).
Betik öğesi: dizgi | `Yanit` | `Exception` (fırlatılır) | `(istek) -> dizgi | Yanit` işlevi.
Kim kullanır: bütün çevrimdışı testler; `python -m yz sun --saglayici sahte`.
Genişletme: yeni bir gösterim davranışı → `gosterim_kurali` içine bir dal ekleyin.
"""

from __future__ import annotations

import re
from collections.abc import Callable, Iterator, Sequence
from typing import Any, ClassVar

from yz.hatalar import SaglayiciHatasi
from yz.saglayici.taban import Saglayici
from yz.saglayici.tipler import AkisParcasi, AracCagrisi, Kullanim, SohbetIstegi, Yanit

BetikOgesi = str | Yanit | Exception | Callable[[SohbetIstegi], "str | Yanit"]


class Sahte(Saglayici):
    """Betikli yanıt veren sağlayıcı."""

    tur: ClassVar[str] = "sahte"

    def __init__(
        self,
        yanitlar: Sequence[BetikOgesi] | None = None,
        *,
        kural: Callable[[SohbetIstegi], str | Yanit] | None = None,
        model: str = "sahte-model",
        parca_boyu: int = 8,
        gomme_boyutu: int = 256,
        **ortak: Any,
    ) -> None:
        super().__init__(model, **ortak)
        self._betik: list[BetikOgesi] = list(yanitlar or [])
        self._betik_verildi = yanitlar is not None
        self._kural = kural
        self.parca_boyu = parca_boyu
        self.gomme_boyutu = gomme_boyutu
        self.istekler: list[SohbetIstegi] = []

    @classmethod
    def gosterim(cls, **ortak: Any) -> Sahte:
        """Çevrimdışı gösterim için kural tabanlı sahte sağlayıcı."""
        return cls(kural=gosterim_kurali, model="sahte-gosterim", **ortak)

    @staticmethod
    def arac_yaniti(
        ad: str, argumanlar: dict[str, Any] | None = None, kimlik: str = "cagri_1", metin: str = ""
    ) -> Yanit:
        """Betik için: modelin `ad` aracını çağırdığı bir yanıt üretir."""
        cagri = AracCagrisi(kimlik=kimlik, ad=ad, argumanlar=argumanlar or {})
        return Yanit(metin=metin, arac_cagrilari=[cagri], bitis_nedeni="arac")

    @property
    def cagri_sayisi(self) -> int:
        return len(self.istekler)

    def _siradaki(self, istek: SohbetIstegi) -> str | Yanit:
        if self._betik:
            oge = self._betik.pop(0)
            if isinstance(oge, Exception):
                raise oge
            return oge(istek) if callable(oge) else oge
        if self._kural is not None:
            return self._kural(istek)
        if self._betik_verildi:
            raise SaglayiciHatasi(
                f"Sahte sağlayıcının betiği bitti: {self.cagri_sayisi}. çağrı için yanıt "
                "tanımlanmamış. Teste bir yanıt daha ekleyin ya da döngünün neden fazladan "
                "çağrı yaptığına bakın."
            )
        son = next((m.icerik for m in reversed(istek.mesajlar) if m.rol == "user"), "")
        return f"Sahte yanıt: {son}"

    def _sohbet(self, istek: SohbetIstegi) -> Yanit:
        self.istekler.append(istek)
        sonuc = self._siradaki(istek)
        yanit = Yanit(metin=sonuc) if isinstance(sonuc, str) else sonuc.model_copy(deep=True)
        if yanit.arac_cagrilari and yanit.bitis_nedeni == "bitti":
            yanit.bitis_nedeni = "arac"
        if istek.azami_belirtec is not None and len(yanit.metin) > istek.azami_belirtec * 4:
            yanit.metin = yanit.metin[: istek.azami_belirtec * 4]  # sınırı kabaca taklit et
            yanit.bitis_nedeni = "uzunluk"
        if yanit.kullanim.toplam == 0:
            girdi = sum(len(m.icerik) for m in istek.mesajlar) // 3 + 1
            yanit.kullanim = Kullanim(girdi_belirteci=girdi, cikti_belirteci=len(yanit.metin) // 3 + 1)
        yanit.model = yanit.model or self.model
        return yanit

    def _sohbet_akisi(self, istek: SohbetIstegi) -> Iterator[AkisParcasi]:
        yanit = self._sohbet(istek)
        for bas in range(0, len(yanit.metin), self.parca_boyu):
            yield AkisParcasi(metin=yanit.metin[bas : bas + self.parca_boyu])
        yield AkisParcasi(son=yanit)

    def gom(self, metinler: Sequence[str]) -> list[list[float]]:
        from yz.rag.gomme import KarmaGomme  # geç içe aktarma: rag paketi saglayici'yı kullanır

        return KarmaGomme(boyut=self.gomme_boyutu).gom(metinler)


_ISLEM = re.compile(r"\d+(?:[.,]\d+)?(?:\s*[-+*/x×]\s*\d+(?:[.,]\d+)?)+")
_KAYNAK = re.compile(r"\[(\d+)\][^\n]*\n(.+)")


def gosterim_kurali(istek: SohbetIstegi) -> str | Yanit:
    """Çevrimdışı gösterim yanıtı üretir (gerçek model yerine geçmez)."""
    son = istek.mesajlar[-1]
    if son.rol == "tool":
        return f"Araç sonucu: {son.icerik.strip()}"
    soru = next((m.icerik for m in reversed(istek.mesajlar) if m.rol == "user"), "")
    islem = _ISLEM.search(soru)
    if islem and any(a.ad == "hesapla" for a in istek.araclar):
        ifade = islem.group().replace("x", "*").replace("×", "*").replace(",", ".")
        return Sahte.arac_yaniti("hesapla", {"ifade": ifade})
    kaynak = _KAYNAK.search(soru)
    if kaynak:
        ilk_cumle = re.split(r"(?<=[.!?])\s", kaynak.group(2).strip())[0]
        return f"Belgelere göre: {ilk_cumle} [{kaynak.group(1)}]"
    if istek.yanit_bicimi is not None:
        return "{}"
    kisa = soru.strip().splitlines()[-1][:200] if soru.strip() else ""
    return (
        "Bu bir gösterim yanıtıdır; gerçek bir model bağlı değil. "
        f"Sorduğunuz: «{kisa}». Gerçek yanıt için bir model sunucusu bağlayın (README'ye bakın)."
    )

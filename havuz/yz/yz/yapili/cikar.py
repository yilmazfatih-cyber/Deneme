"""Yapılı çıkarım: metinden Pydantic şemasına uyan nesne — küçük modeller için katmanlı strateji.

Katmanlar (sırayla denenir; biri başarılı olunca durulur):
    sema   Sağlayıcının şemaya bağlı çıktısı (`response_format` json_schema, Ollama `format`,
           llama.cpp GBNF dilbilgisi). Sunucu desteklemiyorsa atlanır.
    arac   Şema bir aracın parametresi yapılır; model aracı çağırır, argümanlar okunur.
    istem  İstemde alan listesi + örnek iskelet; çıktı sağlam ayrıştırıcıdan geçer.
    alan   Son çare: her alan tek tek, kısa bir soruyla sorulur ve tipine çevrilir.
Her katmanda (alan hariç) doğrulama hatası modele geri verilir ve en çok `azami_onarim` kez
düzeltmesi istenir (onarım döngüsü). Sonuçta hangi katmanın, kaç turda ve hangi onarımlarla
başardığı `CikarimSonucu.rapor()` ile görülür.
Kim kullanır: cli.py (`cikar`), degerlendirme (görev türü "cikarim"), sunucu.
Genişletme: yeni katman → `_katman_xxx` yazıp `_KATMAN_ISLEVLERI`'ne ekleyin (YENİ KATMAN BURAYA).
"""

from __future__ import annotations

import json
import re
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, ValidationError

from yz.hatalar import DesteklenmiyorHatasi, SaglayiciHatasi, YapiliCiktiHatasi
from yz.istem.az_ornek import Ornek, ornek_mesajlari
from yz.istem.sablonlar import sablon
from yz.metin import kucuk_tr
from yz.saglayici.taban import Saglayici
from yz.saglayici.tipler import AracTanimi, Kullanim, Mesaj, Yanit
from yz.yapili.json_onar import json_ayikla
from yz.yapili.sema_araclari import (
    alan_listesi,
    coz,
    hatalari_ozetle,
    iskelet,
    null_disi,
    refleri_ac,
    sema_ile_duzelt,
    tip_aciklamasi,
)

T = TypeVar("T", bound=BaseModel)
KATMANLAR: tuple[str, ...] = ("sema", "arac", "istem", "alan")
_ATLANAN_DURUMLAR = frozenset({400, 404, 422, 501})
_YOK = frozenset({"yok", "none", "null", "bilinmiyor", "-", "n/a", ""})


@dataclass
class Deneme:
    """Bir katmandaki tek bir model çağrısının sonucu."""

    katman: str
    tur: int  # 0 = ilk deneme, 1.. = onarım turu
    basarili: bool
    hata: str = ""
    ham: str = ""
    notlar: list[str] = field(default_factory=list)


@dataclass
class CikarimSonucu(Generic[T]):
    """Çıkarımın sonucu ve nasıl elde edildiğinin dökümü."""

    deger: T | None
    katman: str | None
    denemeler: list[Deneme]
    kullanim: Kullanim

    @property
    def basarili(self) -> bool:
        return self.deger is not None

    @property
    def onarim_turu(self) -> int:
        """Başarılı katmanda kaç onarım turu gerekti (0 = ilk denemede tuttu)."""
        basarili = [d for d in self.denemeler if d.basarili]
        return basarili[-1].tur if basarili else 0

    @property
    def notlar(self) -> list[str]:
        """Başarılı denemede yapılan onarımlar (kod_citi, sondaki_virgul, turkce_sayi…)."""
        basarili = [d for d in self.denemeler if d.basarili]
        return basarili[-1].notlar if basarili else []

    def zorla(self) -> T:
        """Değeri döndürür; çıkarım başarısızsa ayrıntılı hata fırlatır."""
        if self.deger is None:
            raise YapiliCiktiHatasi("Yapılı çıkarım başarısız.\n" + self.rapor())
        return self.deger

    def rapor(self) -> str:
        """İnsan için katman katman döküm."""
        durum = "BAŞARILI" if self.basarili else "BAŞARISIZ"
        satirlar = [
            f"Yapılı çıkarım: {durum}" + (f" (katman: {self.katman})" if self.katman else "")
        ]
        for d in self.denemeler:
            if d.basarili:
                ek = f"başarılı (onarımlar: {', '.join(d.notlar)})" if d.notlar else "başarılı"
            else:
                ek = "hata: " + d.hata.replace("\n", " ")[:300]
            satirlar.append(f"  {d.katman:<6} {d.tur}. tur — {ek}")
        satirlar.append(
            f"  belirteç: {self.kullanim.girdi_belirteci} girdi + {self.kullanim.cikti_belirteci} çıktı"
        )
        return "\n".join(satirlar)


class Cikarici(Generic[T]):
    """Bir şema için ayarlanmış çıkarıcı; `cikar(metin)` her çağrıda katmanları dener."""

    def __init__(
        self,
        saglayici: Saglayici,
        sema: type[T],
        *,
        talimat: str | None = None,
        katmanlar: Sequence[str] = KATMANLAR,
        azami_onarim: int = 2,
        azami_belirtec: int | None = 800,
        dil: str = "tr",
        ornekler: Sequence[Ornek] = (),
        arac_adi: str = "kaydet",
    ) -> None:
        bilinmeyen = [k for k in katmanlar if k not in _KATMAN_ISLEVLERI]
        if bilinmeyen:
            raise ValueError(f"Bilinmeyen katman: {bilinmeyen}. Geçerli: {', '.join(KATMANLAR)}.")
        self.saglayici = saglayici
        self.sema = sema
        self.json_sema = sema.model_json_schema()
        self.talimat = talimat or (
            "Aşağıdaki metinden istenen bilgileri çıkar."
            if dil == "tr"
            else "Extract the requested information from the text below."
        )
        self.katmanlar = list(katmanlar)
        self.azami_onarim = azami_onarim
        self.azami_belirtec = azami_belirtec
        self.dil = dil
        self.ornekler = list(ornekler)
        self.arac_adi = arac_adi

    # ------------------------------------------------------------------ genel

    def cikar(self, metin: str) -> CikarimSonucu[T]:
        denemeler: list[Deneme] = []
        kullanim = Kullanim()
        for katman in self.katmanlar:
            try:
                deger, katman_kullanimi = _KATMAN_ISLEVLERI[katman](self, metin, denemeler)
            except SaglayiciHatasi as hata:
                atlanir = isinstance(hata, DesteklenmiyorHatasi) or (
                    katman in ("sema", "arac") and hata.durum_kodu in _ATLANAN_DURUMLAR
                )
                if not atlanir:
                    raise
                denemeler.append(Deneme(katman, 0, False, f"desteklenmiyor: {hata}"))
                continue
            kullanim = kullanim + katman_kullanimi
            if deger is not None:
                return CikarimSonucu(deger, katman, denemeler, kullanim)
        return CikarimSonucu(None, None, denemeler, kullanim)

    # ------------------------------------------------------------------ doğrulama

    def dogrula(self, deger: Any) -> tuple[T | None, str, list[str]]:
        """Değeri şemaya göre düzeltip doğrular: (nesne | None, hata özeti, notlar)."""
        duzeltilmis, notlar = sema_ile_duzelt(deger, self.json_sema)
        try:
            return self.sema.model_validate(duzeltilmis), "", notlar
        except ValidationError as hata:
            return None, hatalari_ozetle(hata, dil=self.dil), notlar

    def metinden(self, metin: str) -> tuple[T | None, str, list[str]]:
        """Model çıktısındaki JSON adaylarını sırayla dener; ilk geçerli olanı döndürür."""
        ayiklama = json_ayikla(metin, "nesne")
        if not ayiklama.bulundu:
            return None, "- Yanıtta JSON nesnesi yok. Yalnızca JSON nesnesi yaz.", []
        ilk: tuple[str, list[str]] | None = None
        for aday in ayiklama.adaylar[:3]:
            deger, hata, notlar = self.dogrula(aday.deger)
            if deger is not None:
                return deger, "", [*aday.notlar, *notlar]
            ilk = ilk or (hata, [*aday.notlar, *notlar])
        assert ilk is not None
        return None, ilk[0], ilk[1]

    # ------------------------------------------------------------------ istem parçaları

    def _kullanici_istemi(self, metin: str) -> str:
        return sablon(
            "cikarim_kullanici",
            self.dil,
            talimat=self.talimat,
            alanlar=alan_listesi(self.json_sema, self.dil),
            iskelet=iskelet(self.json_sema),
            metin=metin,
        )

    def _temel_mesajlar(self, metin: str) -> list[Mesaj]:
        return [
            Mesaj.sistem(sablon("cikarim_sistem", self.dil)),
            *ornek_mesajlari(self.ornekler),
            Mesaj.kullanici(self._kullanici_istemi(metin)),
        ]

    def _sor(self, mesajlar: list[Mesaj], **ek: Any) -> Yanit:
        yanit: Yanit = self.saglayici.sohbet(mesajlar, azami_belirtec=self.azami_belirtec, **ek)
        return yanit


# ----------------------------------------------------------------------------- katmanlar

KatmanSonucu = tuple[Any, Kullanim]


def _onarim_dongusu(
    c: Cikarici[Any], katman: str, metin: str, denemeler: list[Deneme], **ek: Any
) -> KatmanSonucu:
    """ "sema" ve "istem" katmanlarının ortak döngüsü: sor → ayrıştır → doğrula → hata geri ver."""
    mesajlar = c._temel_mesajlar(metin)
    kullanim = Kullanim()
    for tur in range(1 + c.azami_onarim):
        yanit = c._sor(mesajlar, **ek)
        kullanim = kullanim + yanit.kullanim
        deger, hata, notlar = c.metinden(yanit.metin)
        if yanit.bitis_nedeni == "uzunluk":
            notlar = [*notlar, "uzunluk_siniri"]
        denemeler.append(Deneme(katman, tur, deger is not None, hata, yanit.metin, notlar))
        if deger is not None:
            return deger, kullanim
        mesajlar += [
            Mesaj.asistan(yanit.metin),
            Mesaj.kullanici(sablon("cikarim_onarim", c.dil, hatalar=hata)),
        ]
    return None, kullanim


def _katman_sema(c: Cikarici[Any], metin: str, denemeler: list[Deneme]) -> KatmanSonucu:
    return _onarim_dongusu(c, "sema", metin, denemeler, yanit_bicimi=c.json_sema)


def _katman_istem(c: Cikarici[Any], metin: str, denemeler: list[Deneme]) -> KatmanSonucu:
    return _onarim_dongusu(c, "istem", metin, denemeler)


def _katman_arac(c: Cikarici[Any], metin: str, denemeler: list[Deneme]) -> KatmanSonucu:
    arac = AracTanimi(
        ad=c.arac_adi,
        aciklama="Metinden çıkarılan bilgileri kaydeder."
        if c.dil == "tr"
        else "Saves the extracted information.",
        parametreler=refleri_ac(c.json_sema),
    )
    istem = sablon("cikarim_arac", c.dil, talimat=c.talimat, metin=metin, arac_adi=c.arac_adi)
    mesajlar = [*ornek_mesajlari(c.ornekler), Mesaj.kullanici(istem)]
    kullanim = Kullanim()
    for tur in range(1 + c.azami_onarim):
        yanit = c._sor(mesajlar, araclar=[arac], arac_secimi=c.arac_adi)
        kullanim = kullanim + yanit.kullanim
        cagrilar = [a for a in yanit.arac_cagrilari if a.ad == c.arac_adi] or yanit.arac_cagrilari
        if cagrilar:
            cagri = cagrilar[0]
            deger, hata, notlar = c.dogrula(cagri.argumanlar)
            ham = cagri.ham_argumanlar or json.dumps(cagri.argumanlar, ensure_ascii=False)
            denemeler.append(Deneme("arac", tur, deger is not None, hata, ham, notlar))
            if deger is not None:
                return deger, kullanim
            hata_iletisi = sablon("cikarim_arac_onarim", c.dil, hatalar=hata)
            mesajlar += [yanit.mesaj(), Mesaj.arac(cagri.kimlik, hata_iletisi, cagri.ad, hata=True)]
            continue
        deger, hata, notlar = c.metinden(yanit.metin)  # araç yerine düz metin yazmış olabilir
        denemeler.append(
            Deneme(
                "arac", tur, deger is not None, hata, yanit.metin, [*notlar, "arac_yerine_metin"]
            )
        )
        if deger is not None:
            return deger, kullanim
        mesajlar += [
            Mesaj.asistan(yanit.metin),
            Mesaj.kullanici(sablon("cikarim_onarim", c.dil, hatalar=hata)),
        ]
    return None, kullanim


def _ilk_satir(metin: str) -> str:
    satir = next((s for s in metin.strip().splitlines() if s.strip()), "")
    satir = re.sub(r"^[\s`*\"'“”]+|[\s`*\"'“”.]+$", "", satir)
    return re.sub(r"^[\w ]{1,40}:\s*", "", satir) if ":" in satir[:42] else satir


def _katman_alan(c: Cikarici[Any], metin: str, denemeler: list[Deneme]) -> KatmanSonucu:
    kok = c.json_sema
    ozellikler: dict[str, Any] = coz(kok, kok).get("properties") or {}
    sonuc: dict[str, Any] = {}
    kullanim = Kullanim()
    hamlar: list[str] = []
    for ad, alt in ozellikler.items():
        alt_sema, _ = null_disi(alt, kok)
        aciklama = alt_sema.get("description") or alt.get("description") or ad.replace("_", " ")
        basit = alt_sema.get("type") not in ("object", "array")
        if basit:
            ipucu = ("Biçim: " if c.dil == "tr" else "Format: ") + tip_aciklamasi(alt, kok, c.dil)
            istem = sablon("alan_sorusu", c.dil, metin=metin, alan=aciklama, ipucu=ipucu)
            yanit = c.saglayici.sohbet([Mesaj.kullanici(istem)], azami_belirtec=80)
            kullanim = kullanim + yanit.kullanim
            deger_metni = _ilk_satir(yanit.metin)
            sonuc[ad] = None if kucuk_tr(deger_metni) in _YOK else deger_metni
            hamlar.append(f"{ad}: {yanit.metin.strip()[:80]}")
            continue
        alt_cikarici = _alt_cikarici(c, ad, alt)
        yanit = alt_cikarici._sor(alt_cikarici._temel_mesajlar(metin))
        kullanim = kullanim + yanit.kullanim
        ayiklama = json_ayikla(yanit.metin, "herhangi")
        deger = ayiklama.deger
        sonuc[ad] = deger.get(ad, deger) if isinstance(deger, dict) else deger
        hamlar.append(f"{ad}: {yanit.metin.strip()[:120]}")
    deger_nesne, hata, notlar = c.dogrula(sonuc)
    denemeler.append(Deneme("alan", 0, deger_nesne is not None, hata, "\n".join(hamlar), notlar))
    return deger_nesne, kullanim


def _alt_cikarici(c: Cikarici[Any], ad: str, alt: dict[str, Any]) -> Cikarici[Any]:
    """Tek bir karmaşık alan için geçici bir çıkarıcı (yalnız o alanı içeren şemayla)."""
    alt_sema = {"type": "object", "properties": {ad: alt}, "required": [ad]}
    if "$defs" in c.json_sema:
        alt_sema["$defs"] = c.json_sema["$defs"]
    gecici = Cikarici(
        c.saglayici, c.sema, talimat=c.talimat, dil=c.dil, azami_belirtec=c.azami_belirtec
    )
    gecici.json_sema = alt_sema
    return gecici


KatmanIslevi = Callable[[Cikarici[Any], str, list[Deneme]], KatmanSonucu]
_KATMAN_ISLEVLERI: dict[str, KatmanIslevi] = {
    "sema": _katman_sema,
    "arac": _katman_arac,
    "istem": _katman_istem,
    "alan": _katman_alan,
    # YENİ KATMAN BURAYA: "ad": _katman_ad,
}


def cikar(saglayici: Saglayici, sema: type[T], metin: str, **ayar: Any) -> CikarimSonucu[T]:
    """Kısa yol: `Cikarici(saglayici, sema, **ayar).cikar(metin)`."""
    return Cikarici(saglayici, sema, **ayar).cikar(metin)

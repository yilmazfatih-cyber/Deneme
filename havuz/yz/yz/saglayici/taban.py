"""Bütün sağlayıcıların ortak tabanı: tek arayüz `sohbet(...)`.

Bağdaştırıcılar yalnız `_sohbet` (ve isterse `_sohbet_akisi`, `gom`, `modeller`) yazar.
Ortak işler burada bir kez yapılır: isteği tek biçime indirgeme, disk önbelleği, süre ölçümü,
kullanım/maliyet sayacı, maskeli günlük.
Kim kullanır: yapili, ajan, rag, degerlendirme, sunucu — hepsi yalnız bu arayüzü bilir.
Genişletme: yeni sağlayıcı → bu sınıftan türetin, `_sohbet`'i yazın, saglayici/kayit.py'ye
ekleyin (AGENTS.md "Yeni sağlayıcı ekle" tarifi).
"""

from __future__ import annotations

import time
from abc import ABC, abstractmethod
from collections.abc import Callable, Iterator, Sequence
from typing import Any, ClassVar, Literal, Protocol, TypedDict, Unpack, overload

from pydantic import BaseModel

from yz.hatalar import DesteklenmiyorHatasi, SaglayiciHatasi
from yz.metin import belirtec_tahmini
from yz.saglayici.gunluk import IstekGunlugu
from yz.saglayici.maliyet import FiyatTablosu, KullanimSayaci
from yz.saglayici.onbellek import DiskOnbellek, istek_ozeti, onbellege_uygun
from yz.saglayici.tipler import (
    AkisParcasi,
    AracTanimi,
    Kullanim,
    MesajGirdisi,
    ModelBilgisi,
    SohbetIstegi,
    Yanit,
    YanitBicimi,
    mesajlari_coz,
    yanit_bicimi_coz,
)


class TanimVerir(Protocol):
    """`tanim()` ile `AracTanimi` veren her nesne araç olarak geçirilebilir (bkz. yz.arac.Arac)."""

    def tanim(self) -> AracTanimi: ...


AracGirdisi = AracTanimi | TanimVerir | dict[str, Any]
BicimGirdisi = YanitBicimi | type[BaseModel] | dict[str, Any] | str | None


class SohbetSecenekleri(TypedDict, total=False):
    """`sohbet` çağrısının isteğe bağlı ayarları."""

    sicaklik: float | None  # varsayılan 0 (küçük modellerde tutarlılık için)
    azami_belirtec: int | None  # çıktı uzunluğu sınırı; verilmezse sağlayıcının varsayılanı
    dur: list[str]  # bu dizgilerden biri üretilince dur
    arac_secimi: str  # "oto" | "yok" | "zorunlu" | belirli bir araç adı
    tohum: int | None  # sunucu destekliyorsa yinelenebilirlik için
    ek: dict[str, Any]  # sağlayıcıya özgü ek gövde alanları (ör. {"top_p": 0.9})


class Saglayici(ABC):
    """Model sağlayıcılarının ortak arayüzü."""

    tur: ClassVar[str] = "taban"

    def __init__(
        self,
        model: str,
        *,
        azami_belirtec: int | None = None,
        onbellek: DiskOnbellek | None = None,
        gunluk: IstekGunlugu | None = None,
        fiyatlar: FiyatTablosu | None = None,
        sayac: KullanimSayaci | None = None,
        saat: Callable[[], float] = time.perf_counter,
    ) -> None:
        self.model = model
        self.azami_belirtec = azami_belirtec
        self.onbellek = onbellek
        self.gunluk = gunluk
        self.fiyatlar = fiyatlar
        self.sayac = sayac if sayac is not None else KullanimSayaci()
        self._saat = saat

    @property
    def kimlik(self) -> str:
        """Önbellek anahtarına ve günlüğe giren ad (tür + model; alt sınıf adresi de ekler)."""
        return f"{self.tur}:{self.model}"

    # ------------------------------------------------------------------ genel arayüz

    @overload
    def sohbet(
        self,
        mesajlar: Sequence[MesajGirdisi] | str,
        araclar: Sequence[AracGirdisi] | None = None,
        yanit_bicimi: BicimGirdisi = None,
        akis: Literal[False] = False,
        **secenekler: Unpack[SohbetSecenekleri],
    ) -> Yanit: ...

    @overload
    def sohbet(
        self,
        mesajlar: Sequence[MesajGirdisi] | str,
        araclar: Sequence[AracGirdisi] | None = None,
        yanit_bicimi: BicimGirdisi = None,
        *,
        akis: Literal[True],
        **secenekler: Unpack[SohbetSecenekleri],
    ) -> Iterator[AkisParcasi]: ...

    def sohbet(
        self,
        mesajlar: Sequence[MesajGirdisi] | str,
        araclar: Sequence[AracGirdisi] | None = None,
        yanit_bicimi: BicimGirdisi = None,
        akis: bool = False,
        **secenekler: Unpack[SohbetSecenekleri],
    ) -> Yanit | Iterator[AkisParcasi]:
        """Modele mesaj gönderir.

        akis=False → `Yanit`. akis=True → `AkisParcasi` yineleyicisi; son parçanın `son`
        alanı birikmiş tam yanıttır.
        """
        istek = self.istek_kur(mesajlar, araclar, yanit_bicimi, **secenekler)
        return self._akisli(istek) if akis else self._tek(istek)

    def istek_kur(
        self,
        mesajlar: Sequence[MesajGirdisi] | str,
        araclar: Sequence[AracGirdisi] | None = None,
        yanit_bicimi: BicimGirdisi = None,
        **secenekler: Unpack[SohbetSecenekleri],
    ) -> SohbetIstegi:
        """Esnek girdiyi doğrulanmış `SohbetIstegi`'ne çevirir."""
        azami = secenekler.get("azami_belirtec", self.azami_belirtec)
        return SohbetIstegi(
            mesajlar=mesajlari_coz(list(mesajlar) if not isinstance(mesajlar, str) else mesajlar),
            araclar=[_tanim_coz(a) for a in araclar or []],
            yanit_bicimi=yanit_bicimi_coz(yanit_bicimi),
            sicaklik=secenekler.get("sicaklik", 0.0),
            azami_belirtec=azami,
            dur=list(secenekler.get("dur", [])),
            arac_secimi=secenekler.get("arac_secimi", "oto"),
            tohum=secenekler.get("tohum"),
            ek=dict(secenekler.get("ek", {})),
        )

    def gom(self, metinler: Sequence[str]) -> list[list[float]]:
        """Metinleri gömme vektörlerine çevirir (destekleyen sağlayıcılarda)."""
        raise DesteklenmiyorHatasi(
            f"`{self.tur}` sağlayıcısı gömme (embedding) üretmiyor. "
            "rag.gomme.KarmaGomme bağımlılıksız çalışır; onu kullanabilirsiniz."
        )

    def modeller(self) -> list[ModelBilgisi]:
        """Sunucunun bildirdiği modeller. Varsayılan: yalnız yapılandırılmış model."""
        return [ModelBilgisi(kimlik=self.model)]

    def kapat(self) -> None:  # noqa: B027 - bilinçli olarak boş: kaynağı olmayan sağlayıcılar için
        """Açık bağlantıları kapatır."""

    # ------------------------------------------------------------------ bağdaştırıcı yazar

    @abstractmethod
    def _sohbet(self, istek: SohbetIstegi) -> Yanit:
        """Tek seferde yanıt üretir. Hata durumunda `SaglayiciHatasi` fırlatır."""

    def _sohbet_akisi(self, istek: SohbetIstegi) -> Iterator[AkisParcasi]:
        """Akışlı yanıt. Varsayılan: akışı olmayan bağdaştırıcı tek parça verir."""
        yanit = self._sohbet(istek)
        if yanit.metin:
            yield AkisParcasi(metin=yanit.metin)
        yield AkisParcasi(son=yanit)

    # ------------------------------------------------------------------ ortak işler

    def _onbellek_anahtari(self, istek: SohbetIstegi) -> str | None:
        if self.onbellek is None or not onbellege_uygun(istek):
            return None
        return istek_ozeti(self.kimlik, istek)

    def _tek(self, istek: SohbetIstegi) -> Yanit:
        anahtar = self._onbellek_anahtari(istek)
        if anahtar is not None and self.onbellek is not None:
            kayitli = self.onbellek.al(anahtar)
            if kayitli is not None:
                self._kaydet(istek, kayitli)
                return kayitli
        baslangic = self._saat()
        try:
            yanit = self._sohbet(istek)
        except SaglayiciHatasi as hata:
            self._hata_kaydet(istek, hata)
            raise
        return self._tamamla(istek, yanit, baslangic, anahtar)

    def _akisli(self, istek: SohbetIstegi) -> Iterator[AkisParcasi]:
        anahtar = self._onbellek_anahtari(istek)
        if anahtar is not None and self.onbellek is not None:
            kayitli = self.onbellek.al(anahtar)
            if kayitli is not None:
                self._kaydet(istek, kayitli)
                if kayitli.metin:
                    yield AkisParcasi(metin=kayitli.metin)
                yield AkisParcasi(son=kayitli)
                return
        baslangic = self._saat()
        birikmis: list[str] = []
        son: Yanit | None = None
        try:
            for parca in self._sohbet_akisi(istek):
                if parca.son is not None:
                    son = parca.son
                    continue
                birikmis.append(parca.metin)
                yield parca
        except SaglayiciHatasi as hata:
            self._hata_kaydet(istek, hata)
            raise
        if son is None:  # akış "son" parçası olmadan bitti: birikenle tamamla
            son = Yanit(metin="".join(birikmis))
        yield AkisParcasi(son=self._tamamla(istek, son, baslangic, anahtar))

    def _tamamla(
        self, istek: SohbetIstegi, yanit: Yanit, baslangic: float, anahtar: str | None
    ) -> Yanit:
        yanit.gecikme_sn = self._saat() - baslangic
        if not yanit.model:
            yanit.model = self.model
        if yanit.kullanim.toplam == 0:
            yanit.kullanim = kullanim_tahmini(istek, yanit)
        if anahtar is not None and self.onbellek is not None and yanit.bitis_nedeni != "ret":
            self.onbellek.koy(anahtar, yanit)
        self._kaydet(istek, yanit)
        return yanit

    def _kaydet(self, istek: SohbetIstegi, yanit: Yanit) -> None:
        maliyet = self.fiyatlar.maliyet(yanit.model, yanit.kullanim) if self.fiyatlar else None
        self.sayac.ekle(yanit.kullanim, maliyet)
        if self.gunluk is not None:
            self.gunluk.yaz(self.kimlik, istek, yanit, maliyet=maliyet)

    def _hata_kaydet(self, istek: SohbetIstegi, hata: SaglayiciHatasi) -> None:
        if self.gunluk is not None:
            self.gunluk.yaz(self.kimlik, istek, None, hata=str(hata))


def _tanim_coz(arac: AracGirdisi) -> AracTanimi:
    if isinstance(arac, AracTanimi):
        return arac
    if isinstance(arac, dict):
        return AracTanimi.model_validate(arac)
    return arac.tanim()


def kullanim_tahmini(istek: SohbetIstegi, yanit: Yanit) -> Kullanim:
    """Sağlayıcı kullanım bildirmediğinde karakter sayısından tahmin üretir (`tahmini=True`)."""
    girdi = sum(belirtec_tahmini(m.icerik) + 4 for m in istek.mesajlar)
    girdi += sum(belirtec_tahmini(str(a.parametreler)) + 12 for a in istek.araclar)
    cikti = belirtec_tahmini(yanit.metin)
    cikti += sum(belirtec_tahmini(c.json_argumanlar()) + 8 for c in yanit.arac_cagrilari)
    return Kullanim(girdi_belirteci=girdi, cikti_belirteci=cikti, tahmini=True)

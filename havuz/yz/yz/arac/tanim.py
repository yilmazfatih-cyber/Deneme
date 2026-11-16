"""Python işlevinden araç tanımı: imza + belge dizgisi → JSON şeması; doğrulama ve zaman aşımı.

    @arac
    def hesapla(ifade: str) -> str:
        '''Aritmetik ifadeyi hesaplar.

        Args:
            ifade: Hesaplanacak ifade, ör. "2 * (3 + 4)".
        '''

Belge dizgisinin ilk paragrafı aracın açıklaması olur; "Args:" / "Parametreler:" bölümündeki
satırlar parametre açıklamalarıdır. Tip ipuçları zorunludur (Pydantic ile doğrulanır).
`calistir` hiçbir zaman istisna fırlatmaz: hata, modele geri verilecek kısa bir `AracSonucu`
olur (gözlem). Böylece küçük model hatasını görüp düzeltebilir.
Kim kullanır: arac/kutu.py, arac/hazir/*, mcp (sunucuya aynı araçlar yayımlanır).
Genişletme: yeni araç → ornekler/kendi_aracim.py dosyasını kopyalayın (AGENTS.md "Yeni araç ekle").
"""

from __future__ import annotations

import inspect
import json
import re
import threading
import typing
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel, ConfigDict, ValidationError, create_model

from yz.hatalar import AracHatasi
from yz.metin import kirp
from yz.saglayici.tipler import AracTanimi
from yz.yapili.sema_araclari import hatalari_ozetle, sema_ile_duzelt

_AD = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_-]{0,63}$")
_BOLUM = re.compile(r"^\s*(args|arguments|parameters|parametreler|argümanlar)\s*:\s*$", re.I)
_DIGER_BOLUM = re.compile(r"^\s*(returns|raises|yields|döndürür|hatalar|örnek|examples?)\s*:", re.I)


@dataclass(frozen=True)
class AracSonucu:
    """Aracın modele dönecek çıktısı. `hata` True ise içerik bir hata açıklamasıdır."""

    icerik: str
    hata: bool = False


def belge_dizgisini_coz(belge: str) -> tuple[str, dict[str, str]]:
    """Belge dizgisinden (açıklama, {parametre: açıklama}) çıkarır."""
    satirlar = inspect.cleandoc(belge or "").splitlines()
    aciklama: list[str] = []
    parametreler: dict[str, str] = {}
    i = 0
    while (
        i < len(satirlar) and not _BOLUM.match(satirlar[i]) and not _DIGER_BOLUM.match(satirlar[i])
    ):
        if satirlar[i].strip() or not aciklama:
            if aciklama and not satirlar[i - 1].strip():
                break  # ilk paragraf bitti
            aciklama.append(satirlar[i])
        i += 1
    while i < len(satirlar) and not _BOLUM.match(satirlar[i]):
        i += 1  # açıklamanın kalan paragraflarını atla
    son_ad: str | None = None
    bolumde = False
    for satir in satirlar[i:]:
        if _BOLUM.match(satir):
            bolumde = True
            continue
        if _DIGER_BOLUM.match(satir):
            bolumde = False
            continue
        if not bolumde or not satir.strip():
            continue
        eslesme = re.match(r"^\s*(\w+)\s*(?:\([^)]*\))?\s*:\s*(.*)$", satir)
        if eslesme and (satir.startswith((" ", "\t")) or son_ad is None):
            son_ad = eslesme.group(1)
            parametreler[son_ad] = eslesme.group(2).strip()
        elif son_ad is not None:
            parametreler[son_ad] = f"{parametreler[son_ad]} {satir.strip()}".strip()
    return " ".join(" ".join(aciklama).split()), parametreler


def _temizle(sema: Any) -> Any:
    """Pydantic şemasındaki gereksiz "title" alanlarını atar (küçük modelin bağlamı dardır)."""
    if isinstance(sema, dict):
        return {
            k: _temizle(v) for k, v in sema.items() if not (k == "title" and isinstance(v, str))
        }
    if isinstance(sema, list):
        return [_temizle(o) for o in sema]
    return sema


class Arac:
    """Modelin çağırabileceği bir araç."""

    def __init__(
        self,
        islev: Callable[..., Any],
        *,
        ad: str | None = None,
        aciklama: str | None = None,
        tehlikeli: bool = False,
        zaman_asimi_sn: float = 15.0,
        azami_cikti: int = 4000,
    ) -> None:
        self.islev = islev
        self.ad = ad or islev.__name__
        if not _AD.match(self.ad):
            raise AracHatasi(
                f"Araç adı yalnız İngilizce harf, rakam, _ ve - içerebilir: {self.ad!r}"
            )
        belge_aciklamasi, parametre_aciklamalari = belge_dizgisini_coz(islev.__doc__ or "")
        self.aciklama = aciklama or belge_aciklamasi
        if not self.aciklama:
            raise AracHatasi(f"`{self.ad}` aracının açıklaması yok: işleve belge dizgisi yazın.")
        self.tehlikeli = tehlikeli
        self.zaman_asimi_sn = zaman_asimi_sn
        self.azami_cikti = azami_cikti
        self.imza = self._cozulmus_imza()
        self.arguman_modeli = self._model_kur(parametre_aciklamalari)
        self.parametreler: dict[str, Any] = _temizle(self.arguman_modeli.model_json_schema())

    def _cozulmus_imza(self) -> inspect.Signature:
        """Tip ipuçları dizgi olsa bile (from __future__ import annotations) gerçek tipleri koyar."""
        imza = inspect.signature(self.islev)
        ipuclari = typing.get_type_hints(self.islev)
        parametreler = []
        for p in imza.parameters.values():
            if p.kind in (p.VAR_POSITIONAL, p.VAR_KEYWORD):
                raise AracHatasi(
                    f"`{self.ad}`: *args / **kwargs desteklenmez; parametreleri adlandırın."
                )
            if p.name not in ipuclari:
                raise AracHatasi(f"`{self.ad}`: `{p.name}` parametresinin tip ipucu yok.")
            parametreler.append(p.replace(annotation=ipuclari[p.name]))
        return imza.replace(parameters=parametreler, return_annotation=ipuclari.get("return", str))

    def _model_kur(self, aciklamalar: dict[str, str]) -> type[BaseModel]:
        from pydantic import Field

        alanlar: dict[str, Any] = {}
        for p in self.imza.parameters.values():
            varsayilan = ... if p.default is inspect.Parameter.empty else p.default
            alanlar[p.name] = (p.annotation, Field(varsayilan, description=aciklamalar.get(p.name)))
        return create_model(
            f"{self.ad}_argumanlari", __config__=ConfigDict(extra="ignore"), **alanlar
        )

    def tanim(self) -> AracTanimi:
        return AracTanimi(ad=self.ad, aciklama=self.aciklama, parametreler=self.parametreler)

    def dogrula(self, argumanlar: dict[str, Any]) -> tuple[BaseModel | None, str]:
        """Argümanları düzeltip doğrular: (model | None, hata özeti)."""
        duzeltilmis, _ = sema_ile_duzelt(argumanlar, self.arguman_modeli.model_json_schema())
        try:
            return self.arguman_modeli.model_validate(duzeltilmis), ""
        except ValidationError as hata:
            return None, hatalari_ozetle(hata)

    def hazirla(self, argumanlar: dict[str, Any]) -> tuple[dict[str, Any] | None, str]:
        """Argümanları doğrulayıp işleve verilecek sözlüğe çevirir: (kwargs | None, hata iletisi)."""
        model, hata = self.dogrula(argumanlar if isinstance(argumanlar, dict) else {})
        if model is None:
            beklenen = ", ".join(self.arguman_modeli.model_fields)
            return None, (
                f"Hata: `{self.ad}` aracının argümanları geçersiz.\n{hata}\nBeklenen argümanlar: "
                f"{beklenen}. Düzeltip yeniden çağır."
            )
        return {ad: getattr(model, ad) for ad in self.arguman_modeli.model_fields}, ""

    def calistir(self, argumanlar: dict[str, Any]) -> AracSonucu:
        """Doğrular, zaman aşımıyla çalıştırır; her durumda `AracSonucu` döndürür."""
        kwargs, hata_iletisi = self.hazirla(argumanlar)
        if kwargs is None:
            return AracSonucu(hata_iletisi, hata=True)
        sonuc: list[Any] = []
        hatalar: list[BaseException] = []

        def calis() -> None:
            try:
                sonuc.append(self.islev(**kwargs))
            except Exception as hata_:
                hatalar.append(hata_)

        is_parcacigi = threading.Thread(target=calis, daemon=True, name=f"arac-{self.ad}")
        is_parcacigi.start()
        is_parcacigi.join(self.zaman_asimi_sn)
        if is_parcacigi.is_alive():
            return AracSonucu(
                f"Hata: `{self.ad}` {self.zaman_asimi_sn:g} saniyede bitmedi (zaman aşımı). "
                "Daha küçük bir istekle dene ya da başka yoldan ilerle.",
                hata=True,
            )
        if hatalar:
            return AracSonucu(f"Hata: `{self.ad}` çalışırken sorun çıktı: {hatalar[0]}", hata=True)
        cikti = sonuc[0] if sonuc else None
        if isinstance(cikti, AracSonucu):
            return AracSonucu(kirp(cikti.icerik, self.azami_cikti), cikti.hata)
        return AracSonucu(kirp(cikti_metni(cikti), self.azami_cikti))

    def __call__(self, *args: Any, **kwargs: Any) -> Any:
        """Araç doğrudan işlev gibi de çağrılabilir (testler ve elle kullanım)."""
        return self.islev(*args, **kwargs)

    def __repr__(self) -> str:
        return f"Arac({self.ad!r}{', tehlikeli' if self.tehlikeli else ''})"


class SemaliArac(Arac):
    """Python imzası yerine hazır JSON şemasıyla tanımlanan araç (ör. bir MCP sunucusundaki araç).

    `calistirici(argumanlar)` çağrılır; dönüş `AracSonucu` ise hata bayrağı korunur. Doğrulama
    yalnız zorunlu alanların varlığını denetler; tip denetimini aracın sahibi (sunucu) yapar.
    """

    def __init__(
        self,
        ad: str,
        aciklama: str,
        parametreler: dict[str, Any],
        calistirici: Callable[[dict[str, Any]], Any],
        *,
        tehlikeli: bool = False,
        zaman_asimi_sn: float = 30.0,
        azami_cikti: int = 4000,
    ) -> None:
        if not _AD.match(ad):
            raise AracHatasi(f"Araç adı yalnız İngilizce harf, rakam, _ ve - içerebilir: {ad!r}")
        self.ad = ad
        self.aciklama = aciklama or ad
        self.parametreler = parametreler or {"type": "object", "properties": {}}
        self.tehlikeli = tehlikeli
        self.zaman_asimi_sn = zaman_asimi_sn
        self.azami_cikti = azami_cikti
        self._calistirici = calistirici
        self.imza = inspect.Signature()

        def islev(**kwargs: Any) -> Any:
            return calistirici(kwargs)

        self.islev = islev

    def hazirla(self, argumanlar: dict[str, Any]) -> tuple[dict[str, Any] | None, str]:
        argumanlar = argumanlar if isinstance(argumanlar, dict) else {}
        eksik = [a for a in self.parametreler.get("required", []) if a not in argumanlar]
        if eksik:
            return None, (
                f"Hata: `{self.ad}` aracı için eksik argüman: {', '.join(eksik)}. "
                "Düzeltip yeniden çağır."
            )
        return argumanlar, ""


def cikti_metni(deger: Any) -> str:
    """Araç dönüş değerini modele verilecek metne çevirir."""
    if deger is None:
        return "(boş sonuç)"
    if isinstance(deger, str):
        return deger
    if isinstance(deger, BaseModel):
        return deger.model_dump_json()
    try:
        return json.dumps(deger, ensure_ascii=False, default=str)
    except (TypeError, ValueError):
        return str(deger)


@typing.overload
def arac(islev: Callable[..., Any], /) -> Arac: ...


@typing.overload
def arac(
    *, ad: str | None = None, tehlikeli: bool = False, zaman_asimi_sn: float = 15.0
) -> Callable[[Callable[..., Any]], Arac]: ...


def arac(
    islev: Callable[..., Any] | None = None,
    /,
    *,
    ad: str | None = None,
    tehlikeli: bool = False,
    zaman_asimi_sn: float = 15.0,
) -> Arac | Callable[[Callable[..., Any]], Arac]:
    """İşlevi araca çeviren süsleyici: `@arac` ya da `@arac(tehlikeli=True)`."""
    if islev is not None:
        return Arac(islev)

    def sus(f: Callable[..., Any]) -> Arac:
        return Arac(f, ad=ad, tehlikeli=tehlikeli, zaman_asimi_sn=zaman_asimi_sn)

    return sus

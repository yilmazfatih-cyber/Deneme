"""Tepsi tanıma: görüntü + günün menüsü → menü kimlikleriyle kalemler.

`ClaudeTaniyici` Claude'un görüntü yeteneğini kullanır. Yanıt JSON şemasıyla kısıtlıdır (`output_config.format`):
`menu_id` yalnız günün menüsündeki kimliklerden biri olabilir (enum), menü dışı bir şey uyduramaz. Menü ve kurallar
sistem isteminde, varsa referans fotoğraflar mesajın başındadır; ikisi de önbelleğe alınır, her çekimde asıl
ücretlenen yalnız yeni karedir. Fiyat hiçbir zaman modele sorulmaz; `fiyat.py` menüden hesaplar.

`SahteTaniyici` demo ve test içindir: kameradaki fotoğrafın yanındaki aynı adlı `.json` dosyasını yanıt kabul eder.
"""

from __future__ import annotations

import base64
import json
import logging
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Protocol

from PIL import Image
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from yemekhane_kasa.ayarlar import TanimaAyari
from yemekhane_kasa.fiyat import Kalem
from yemekhane_kasa.goruntu import jpeg
from yemekhane_kasa.kamera import Kare
from yemekhane_kasa.menu import Menu

log = logging.getLogger(__name__)

# Sunucu tarafı yedek model: güvenlik sınıflandırıcısı bir isteği yanlışlıkla geri çevirirse API aynı isteği önerilen
# modelde yeniden çalıştırır. "default" biçimi Claude API'de yalnız bu modellerde var; Haiku'da yedek yoktur.
YEDEK_BETA = "server-side-fallback-2026-07-01"
YEDEK_DESTEKLEYEN = frozenset({"claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-sonnet-5-5"})

KULLANICI_METNI = "Bu, kasadaki tepsinin şu anki görüntüsü. Tepsideki yemekleri günün menüsüyle eşle."


class TanimaHatasi(RuntimeError):
    """Tanıyıcı kurulamadı (paket ya da anahtar eksik)."""


@dataclass
class TanimaSonucu:
    tepsi_var: bool = False
    kalemler: list[Kalem] = field(default_factory=list)
    taninmayanlar: list[str] = field(default_factory=list)
    not_: str = ""
    hata: str | None = None
    model: str | None = None
    sure_sn: float = 0.0
    kullanim: dict[str, int] = field(default_factory=dict)

    def ozet(self) -> dict[str, Any]:
        return {
            "tepsi_var": self.tepsi_var,
            "kalemler": [
                {"menu_id": k.menu_id, "adet": k.adet, "porsiyon": k.porsiyon, "guven": round(k.guven, 2)}
                for k in self.kalemler
            ],
            "taninmayanlar": self.taninmayanlar,
            "not": self.not_,
            "hata": self.hata,
            "model": self.model,
            "sure_sn": round(self.sure_sn, 2),
            "kullanim": self.kullanim,
        }


class Taniyici(Protocol):
    def tani(self, kare: Kare, menu: Menu) -> TanimaSonucu: ...


# --- istem ve şema (menü değişmedikçe aynı kalır: önbellek öneki) ---


def sistem_istemi(menu: Menu) -> str:
    satirlar = [
        "Bir yemekhane kasasının üstündeki kameranın görüntüsünü okuyorsun. Kasiyerin önündeki tezgâha bırakılan "
        "tepside ne olduğunu günün menüsüyle eşleştiriyorsun. Fiyatı sistem menüden hesaplar; sen yalnız ne "
        "gördüğünü söylersin. Yanlış eşleme müşteriye yanlış fiyat demektir: emin olmadığın yerde düşük güven ver.",
        "",
        f"Günün menüsü — {menu.ad} (kimlik | ad | kategori | görünüşü):",
    ]
    for yemek in menu.yemekler:
        parcalar = [yemek.id, yemek.ad, yemek.kategori, yemek.tarif or "-"]
        if yemek.yarim_var:
            parcalar.append("yarım porsiyonu var")
        satirlar.append("- " + " | ".join(parcalar))
    satirlar += [
        "",
        "Kurallar:",
        "1. Yalnız tepsinin üstünde gerçekten gördüğün yemek ve içecekleri yaz. Görüntünün kenarında başka bir "
        "tepsiye ait olan şeyleri yazma.",
        "2. Her ayrı tabak, kâse, bardak ya da şişe bir porsiyondur. Aynı yemekten birden çok porsiyon varsa tek kalem "
        "yaz ve `adet` porsiyon sayısı olsun.",
        '3. `porsiyon`: yalnız "yarım porsiyonu var" yazan yemeklerde, kap belirgin biçimde küçükse ya da porsiyon '
        'açıkça yarımsa "yarim"; diğer her durumda "tam".',
        "4. Menüdeki hiçbir yemeğe uymayan bir yemek ya da içecek görürsen onu `kalemler`e koyma; `taninmayanlar`a "
        'kısa bir tarifle yaz (ör. "kırmızı soslu makarna").',
        "5. Şunları yok say, hiçbir listeye yazma: " + "; ".join(menu.yok_say) + ".",
        "6. `guven` 0 ile 1 arasında, eşlemenin doğru olma olasılığı için gerçekçi tahminindir: net görünen ve tarife "
        "uyan yemek 0,9 üstü; birbirine benzeyen iki yemek arasında kararsızsan 0,6 altı.",
        "7. Görüntüde üzerinde yemek olan bir tepsi yoksa (boş tezgâh, boş tepsi, yalnız eller) `tepsi_var` false "
        "olsun ve listeler boş kalsın.",
        '8. `not` alanına yalnız kasiyerin bilmesi gereken kısa bir uyarı yaz (ör. "tabağın yarısı görüntü dışında"); '
        "yoksa boş bırak.",
    ]
    return "\n".join(satirlar)


def cikti_semasi(menu: Menu) -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "tepsi_var": {"type": "boolean"},
            "kalemler": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "menu_id": {"type": "string", "enum": menu.kimlikler},
                        "adet": {"type": "integer"},
                        "porsiyon": {"type": "string", "enum": ["tam", "yarim"]},
                        "guven": {"type": "number"},
                    },
                    "required": ["menu_id", "adet", "porsiyon", "guven"],
                    "additionalProperties": False,
                },
            },
            "taninmayanlar": {"type": "array", "items": {"type": "string"}},
            "not": {"type": "string"},
        },
        "required": ["tepsi_var", "kalemler", "taninmayanlar", "not"],
        "additionalProperties": False,
    }


def _gorsel_blogu(veri: bytes) -> dict[str, Any]:
    return {
        "type": "image",
        "source": {"type": "base64", "media_type": "image/jpeg", "data": base64.standard_b64encode(veri).decode()},
    }


def referans_bloklari(menu: Menu, uzun_kenar: int) -> list[dict[str, Any]]:
    """Menüde referans fotoğrafı olan yemekler için [başlık, fotoğraf] blokları; sonuncusu önbellek sınırıdır."""
    bloklar: list[dict[str, Any]] = []
    for yemek in menu.yemekler:
        yol = menu.gorsel_yolu(yemek)
        if yol is None:
            continue
        with Image.open(yol) as acik:
            veri = jpeg(acik, uzun_kenar)
        bloklar.append({"type": "text", "text": f"Referans: {yemek.id} ({yemek.ad})"})
        bloklar.append(_gorsel_blogu(veri))
    if bloklar:
        bloklar.insert(0, {"type": "text", "text": "Menüdeki yemeklerin bu yemekhanede çekilmiş fotoğrafları:"})
        bloklar[-1] = {**bloklar[-1], "cache_control": {"type": "ephemeral"}}
    return bloklar


# --- yanıt ---


class _YanitKalemi(BaseModel):
    model_config = ConfigDict(extra="ignore")

    menu_id: str
    adet: int = 1
    porsiyon: str = "tam"
    guven: float = 1.0


class _Yanit(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    tepsi_var: bool
    kalemler: list[_YanitKalemi] = Field(default_factory=list)
    taninmayanlar: list[str] = Field(default_factory=list)
    not_: str = Field("", alias="not")


def yaniti_ayristir(veri: Any) -> TanimaSonucu:
    """Şemaya uyan JSON → TanimaSonucu. Kalem görülen her yerde tepsi var sayılır."""
    try:
        yanit = _Yanit.model_validate(veri)
    except ValidationError as e:
        return TanimaSonucu(hata=f"yanıt beklenen biçimde değil ({e.error_count()} hata)")
    tepsi_var = yanit.tepsi_var or bool(yanit.kalemler)
    if not tepsi_var:
        return TanimaSonucu(tepsi_var=False, not_=yanit.not_.strip())
    kalemler = [
        Kalem(k.menu_id, k.adet, k.porsiyon if k.porsiyon in ("tam", "yarim") else "tam", k.guven)
        for k in yanit.kalemler
    ]
    taninmayanlar = [t.strip() for t in yanit.taninmayanlar if t.strip()]
    return TanimaSonucu(tepsi_var=True, kalemler=kalemler, taninmayanlar=taninmayanlar, not_=yanit.not_.strip())


def _kullanim(yanit: Any) -> dict[str, int]:
    kullanim = getattr(yanit, "usage", None)
    sonuc: dict[str, int] = {}
    for ad in ("input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"):
        deger = getattr(kullanim, ad, None)
        if isinstance(deger, int):
            sonuc[ad] = deger
    return sonuc


def yanit_coz(yanit: Any) -> TanimaSonucu:
    model = getattr(yanit, "model", None)
    kullanim = _kullanim(yanit)
    durma = getattr(yanit, "stop_reason", None)
    if durma == "refusal":
        return TanimaSonucu(hata="model bu kareyi yanıtlamadı (refusal)", model=model, kullanim=kullanim)
    if durma == "max_tokens":
        hata = "yanıt yarıda kesildi (max_tokens); tanima.max_tokens değerini artırın"
        return TanimaSonucu(hata=hata, model=model, kullanim=kullanim)
    metin = next((b.text for b in getattr(yanit, "content", None) or [] if getattr(b, "type", None) == "text"), "")
    try:
        veri = json.loads(metin)
    except ValueError:
        return TanimaSonucu(hata="yanıt JSON değil", model=model, kullanim=kullanim)
    sonuc = yaniti_ayristir(veri)
    sonuc.model, sonuc.kullanim = model, kullanim
    return sonuc


def api_hata_metni(hata: Exception) -> str:
    try:
        import anthropic
    except ImportError:
        return f"{type(hata).__name__}: {hata}"
    if isinstance(hata, anthropic.AuthenticationError):
        return "API anahtarı geçersiz (ANTHROPIC_API_KEY)"
    if isinstance(hata, anthropic.PermissionDeniedError):
        return "API anahtarının bu modele yetkisi yok"
    if isinstance(hata, anthropic.RateLimitError):
        return "hız sınırı (429); sonraki çekimde yeniden denenecek"
    if isinstance(hata, anthropic.APITimeoutError):
        return "zaman aşımı; sonraki çekimde yeniden denenecek"
    if isinstance(hata, anthropic.APIConnectionError):
        return "Claude API'ye bağlanılamadı (internet?)"
    if isinstance(hata, anthropic.APIStatusError):
        return f"API hatası {hata.status_code}: {hata.message}"
    return f"{type(hata).__name__}: {hata}"


class ClaudeTaniyici:
    def __init__(self, ayar: TanimaAyari, istemci: Any = None) -> None:
        self.ayar = ayar
        self._istemci = istemci
        self._menu: Menu | None = None
        self._sistem = ""
        self._sema: dict[str, Any] = {}
        self._referans: list[dict[str, Any]] = []

    @property
    def yedek_acik(self) -> bool:
        return self.ayar.yedek_model and self.ayar.model in YEDEK_DESTEKLEYEN

    def _istemci_al(self) -> Any:
        if self._istemci is None:
            try:
                import anthropic
            except ImportError:
                raise TanimaHatasi("anthropic paketi kurulu değil: pip install -e '.[claude]'") from None
            try:
                self._istemci = anthropic.Anthropic(
                    timeout=self.ayar.zaman_asimi_sn, max_retries=self.ayar.tekrar_deneme
                )
            except anthropic.AnthropicError as e:
                raise TanimaHatasi(f"Claude istemcisi kurulamadı: {e} (ANTHROPIC_API_KEY tanımlı mı?)") from None
        return self._istemci

    def _hazirla(self, menu: Menu) -> None:
        if menu is self._menu:
            return
        self._sistem = sistem_istemi(menu)
        self._sema = cikti_semasi(menu)
        self._referans = referans_bloklari(menu, self.ayar.referans_uzun_kenar)
        self._menu = menu

    def istek(self, goruntu: Image.Image, menu: Menu) -> dict[str, Any]:
        self._hazirla(menu)
        icerik = [
            *self._referans,
            _gorsel_blogu(jpeg(goruntu, self.ayar.gorsel_uzun_kenar)),
            {"type": "text", "text": KULLANICI_METNI},
        ]
        istek: dict[str, Any] = {
            "model": self.ayar.model,
            "max_tokens": self.ayar.max_tokens,
            "system": [{"type": "text", "text": self._sistem, "cache_control": {"type": "ephemeral"}}],
            "output_config": {"effort": self.ayar.efor, "format": {"type": "json_schema", "schema": self._sema}},
            "messages": [{"role": "user", "content": icerik}],
        }
        if self.yedek_acik:
            istek["betas"] = [YEDEK_BETA]
            istek["fallbacks"] = "default"
        return istek

    def tani(self, kare: Kare, menu: Menu) -> TanimaSonucu:
        baslangic = time.monotonic()
        try:
            istemci = self._istemci_al()
            istek = self.istek(kare.goruntu, menu)
        except (TanimaHatasi, OSError) as e:
            return TanimaSonucu(hata=str(e))
        try:
            if "betas" in istek:
                yanit = istemci.beta.messages.create(**istek)
            else:
                yanit = istemci.messages.create(**istek)
        except Exception as e:  # noqa: BLE001 — ağ, kota, sunucu: bu çekim düşer, servis sürer
            return TanimaSonucu(hata=api_hata_metni(e), sure_sn=time.monotonic() - baslangic)
        sonuc = yanit_coz(yanit)
        sonuc.sure_sn = time.monotonic() - baslangic
        return sonuc


class SahteTaniyici:
    """Demo/test: kameradaki fotoğrafın yanındaki aynı adlı `.json` yanıttır; dosya yoksa tezgâh boştur."""

    def tani(self, kare: Kare, menu: Menu) -> TanimaSonucu:
        if not kare.kaynak:
            return TanimaSonucu(tepsi_var=False, model="sahte")
        yol = Path(kare.kaynak).with_suffix(".json")
        if not yol.is_file():
            return TanimaSonucu(tepsi_var=False, model="sahte")
        try:
            veri = json.loads(yol.read_text(encoding="utf-8"))
        except (OSError, ValueError) as e:
            return TanimaSonucu(hata=f"sahte yanıt okunamadı ({yol.name}): {e}", model="sahte")
        sonuc = yaniti_ayristir(veri)
        sonuc.model = "sahte"
        return sonuc


def taniyici_olustur(ayar: TanimaAyari) -> Taniyici:
    return SahteTaniyici() if ayar.tur == "sahte" else ClaudeTaniyici(ayar)

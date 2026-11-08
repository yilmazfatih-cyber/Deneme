"""Görsel dil modeliyle nitelik etiketleme (ADR-004, ADR-006).

Görsel baytı bellekte küçültülür (uzun kenar ≤ 1024 px, JPEG), base64 ile tek mesajda gönderilir; yanıt
`output_config.format` (JSON şeması, eksen başına `enum`) ile yapılandırılmıştır. Yanıt yine de taksonomiyle
doğrulanır: sözlük dışı değer `bilinmiyor` olur ve uyarı sayılır. Hiçbir hata istisna olarak dışarı çıkmaz;
kayıt üretilmez ve hata mesajı döner. Görsel diske yazılmaz (ADR-002).

Model kimlikleri ortamdan okunur: `MODA_RADAR_ETIKET_MODELI` (varsayılan claude-sonnet-5-5),
`MODA_RADAR_DENETIM_MODELI` (varsayılan claude-opus-5-5). Gerçek istemci yalnız `ANTHROPIC_API_KEY` varsa kurulur.
"""

from __future__ import annotations

import base64
import io
import json
import logging
import os
from dataclasses import dataclass, field

from moda_radar.gorsel import istem
from moda_radar.sema import Kaynak, NitelikKaydi

log = logging.getLogger(__name__)

VARSAYILAN_ETIKET_MODELI = "claude-sonnet-5-5"
VARSAYILAN_DENETIM_MODELI = "claude-opus-5-5"
AZAMI_KENAR = 1024
# Refusal durumunda sunucu tarafı yedek model (Claude API; "default" biçimi kategoriye göre yönlendirir).
YEDEK_BETA = "server-side-fallback-2026-07-01"


def etiket_modeli() -> str:
    return os.environ.get("MODA_RADAR_ETIKET_MODELI") or VARSAYILAN_ETIKET_MODELI


def denetim_modeli() -> str:
    return os.environ.get("MODA_RADAR_DENETIM_MODELI") or VARSAYILAN_DENETIM_MODELI


def anahtar_var() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY"))


# --- görsel hazırlama ---


def medya_turu(bayt: bytes) -> str | None:
    """Sihirli baytlardan media type: image/jpeg | image/png | image/webp; tanınmazsa None."""
    if bayt[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if bayt[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if bayt[:4] == b"RIFF" and bayt[8:12] == b"WEBP":
        return "image/webp"
    return None


def hazirla(bayt: bytes, azami_kenar: int = AZAMI_KENAR) -> tuple[bytes, str]:
    """Gönderilecek bayt ve media type. Pillow varsa uzun kenar `azami_kenar`'ı aşan ya da desteklenmeyen biçimdeki
    görsel bellekte küçültülüp JPEG'e çevrilir (maliyet görsel alanıyla ölçeklenir). Çözülemezse ValueError."""
    tur = medya_turu(bayt)
    try:
        from PIL import Image
    except ImportError:
        if tur is None:
            raise ValueError("görsel biçimi tanınmadı (JPEG/PNG/WebP değil) ve Pillow yok") from None
        return bayt, tur
    try:
        with Image.open(io.BytesIO(bayt)) as im:
            if tur is not None and max(im.size) <= azami_kenar:
                return bayt, tur
            im.thumbnail((azami_kenar, azami_kenar))
            tampon = io.BytesIO()
            im.convert("RGB").save(tampon, format="JPEG", quality=85)
            return tampon.getvalue(), "image/jpeg"
    except (OSError, ValueError) as e:  # PIL.UnidentifiedImageError ⊂ OSError
        raise ValueError(f"görsel çözülemedi: {e}") from e


# --- yanıt ayrıştırma ---


def _alan(nesne, ad: str, varsayilan=None):
    return nesne.get(ad, varsayilan) if isinstance(nesne, dict) else getattr(nesne, ad, varsayilan)


def yanit_metni(yanit) -> str:
    """İlk metin bloğu. `output_config.format` ile bu blok şemaya uyan JSON'dur."""
    for blok in _alan(yanit, "content", None) or []:
        if _alan(blok, "type") == "text":
            return _alan(blok, "text", "") or ""
    raise ValueError("yanıtta metin bloğu yok")


@dataclass
class EtiketSonucu:
    kayitlar: list[NitelikKaydi] = field(default_factory=list)
    hata: str | None = None
    uyari: int = 0


class Etiketleyici:
    """`Etiketleyici(model, istemci=None)`. İstemci enjekte edilebilir (testte sahte istemci); verilmezse ve
    `ANTHROPIC_API_KEY` varsa `anthropic.Anthropic()` kurulur, yoksa her çağrı hata mesajıyla boş döner."""

    def __init__(
        self,
        model: str | None = None,
        istemci=None,
        *,
        taksonomi: dict | None = None,
        denetim: bool = False,
        effort: str = "low",
        max_tokens: int = 4096,
        yedek: bool = True,
    ) -> None:
        self.model = model or (denetim_modeli() if denetim else etiket_modeli())
        self.denetim = denetim
        self.effort = effort
        self.max_tokens = max_tokens
        self.yedek = yedek
        self.taksonomi = istem.eksenler(taksonomi if taksonomi is not None else istem.taksonomi_oku())
        self.sistem = istem.sistem_istemi(self.taksonomi)
        self.sema = istem.arac_semasi(self.taksonomi)
        self.istemci = istemci if istemci is not None else self._gercek_istemci()
        self.uyari_sayisi = 0
        self.son_hata: str | None = None

    @staticmethod
    def _gercek_istemci():
        if not anahtar_var():
            return None
        try:
            import anthropic
        except ImportError:
            log.warning("anthropic paketi kurulu değil (pip install 'moda-radar[gorsel]')")
            return None
        return anthropic.Anthropic()

    def _istek(self, veri: bytes, tur: str) -> dict:
        istek = {
            "model": self.model,
            "max_tokens": self.max_tokens,
            # Sistem istemi her görselde aynı: önbelleğe alınabilir önek.
            "system": [{"type": "text", "text": self.sistem, "cache_control": {"type": "ephemeral"}}],
            "output_config": {"effort": self.effort, "format": {"type": "json_schema", "schema": self.sema}},
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": tur,
                                "data": base64.standard_b64encode(veri).decode("ascii"),
                            },
                        },
                        {"type": "text", "text": istem.KULLANICI_METNI},
                    ],
                }
            ],
        }
        if self.yedek:
            istek["betas"] = [YEDEK_BETA]
            istek["fallbacks"] = "default"
        return istek

    def _cagir(self, istek: dict):
        if "betas" in istek:
            return self.istemci.beta.messages.create(**istek)
        return self.istemci.messages.create(**istek)

    def _dogrula(self, parca: dict) -> tuple[dict[str, str] | None, int]:
        """Bir parça nesnesini taksonomiyle doğrular. Sözlük dışı → bilinmiyor (+1 uyarı); `bilinmiyor`u olmayan
        eksende NitelikKaydi varsayılanı; parca_konumu geçersizse parça düşer (None)."""
        degerler, uyari = {}, 0
        for eksen, sozluk in self.taksonomi.items():
            d = parca.get(eksen) if isinstance(parca, dict) else None
            if d in sozluk:
                degerler[eksen] = d
                continue
            uyari += 1
            if "bilinmiyor" in sozluk:
                degerler[eksen] = "bilinmiyor"
            elif eksen == "parca_konumu":
                return None, uyari
            else:
                varsayilan = NitelikKaydi.model_fields[eksen].default
                if isinstance(varsayilan, str) and varsayilan in sozluk:
                    degerler[eksen] = varsayilan
        return degerler, uyari

    def etiketle_ayrintili(
        self, goruntu: bytes, kaynak: Kaynak, parca_onek: str, gorsel_id: str | None = None
    ) -> EtiketSonucu:
        sonuc = EtiketSonucu()
        etiket = gorsel_id or kaynak.url
        if self.istemci is None:
            sonuc.hata = "istemci yok (ANTHROPIC_API_KEY ya da anthropic paketi eksik)"
            return self._bitir(sonuc, etiket)
        try:
            veri, tur = hazirla(goruntu)
        except ValueError as e:
            sonuc.hata = str(e)
            return self._bitir(sonuc, etiket)
        try:
            yanit = self._cagir(self._istek(veri, tur))
        except Exception as e:  # noqa: BLE001 — ağ, 4xx/5xx, zaman aşımı: tek görsel taramayı düşürmesin
            sonuc.hata = f"API hatası: {type(e).__name__}: {e}"
            return self._bitir(sonuc, etiket)
        finally:
            del veri  # ADR-002: küçültülmüş kopya da tutulmaz
        durma = _alan(yanit, "stop_reason")
        if durma in ("refusal", "max_tokens"):
            sonuc.hata = f"yanıt tamamlanmadı: stop_reason={durma}"
            return self._bitir(sonuc, etiket)
        try:
            veri_json = json.loads(yanit_metni(yanit))
            parcalar = veri_json["parcalar"]
            if not isinstance(parcalar, list):
                raise TypeError("parcalar liste değil")
        except (ValueError, KeyError, TypeError) as e:
            sonuc.hata = f"yanıt ayrıştırılamadı: {e}"
            return self._bitir(sonuc, etiket)
        model = _alan(yanit, "model") or self.model  # sunucu tarafı yedek devreye girdiyse onu yazar
        sayac: dict[str, int] = {}
        for parca in parcalar:
            degerler, uyari = self._dogrula(parca)
            sonuc.uyari += uyari
            if degerler is None:
                continue
            konum = degerler["parca_konumu"]
            sayac[konum] = sayac.get(konum, 0) + 1
            parca_id = f"{parca_onek}-{konum}" + (f"-{sayac[konum]}" if sayac[konum] > 1 else "")
            sonuc.kayitlar.append(
                NitelikKaydi(
                    kaynak=kaynak,
                    parca_id=parca_id,
                    etiketleyen_model=model,
                    denetim=self.denetim,
                    **degerler,
                )
            )
        return self._bitir(sonuc, etiket)

    def _bitir(self, sonuc: EtiketSonucu, etiket: str) -> EtiketSonucu:
        self.uyari_sayisi += sonuc.uyari
        self.son_hata = sonuc.hata
        if sonuc.hata:
            log.warning("etiketleme başarısız (%s): %s", etiket, sonuc.hata)
        elif sonuc.uyari:
            log.warning("etiketleme (%s): %d sözlük dışı değer bilinmiyor'a çevrildi", etiket, sonuc.uyari)
        return sonuc

    def etiketle(
        self, goruntu: bytes, kaynak: Kaynak, parca_onek: str, gorsel_id: str | None = None
    ) -> list[NitelikKaydi]:
        """Görselden NitelikKaydi listesi; hata olursa boş liste (+ günlük uyarısı, `son_hata`)."""
        return self.etiketle_ayrintili(goruntu, kaynak, parca_onek, gorsel_id).kayitlar

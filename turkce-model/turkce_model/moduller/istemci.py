"""Yerel model sunucusu istemcisi: OpenAI uyumlu ``/v1/chat/completions``.

Ollama, llama.cpp sunucusu, LM Studio ve vLLM aynı API'yi konuşur; bu istemci hepsiyle çalışır ve yeni bir
bağımlılık getirmez (``requests``). Varsayılan olarak yalnız bu bilgisayardaki ya da yerel ağdaki adresleri
kabul eder: TDK/MEB içeriği dışarıdaki bir hizmete gönderilmez.
"""

from __future__ import annotations

import base64
import ipaddress
import re
from typing import Any

from ..ayarlar import AyarHatasi

_DUSUNME = re.compile(r"<think>.*?</think>", re.DOTALL)
_YARIM_DUSUNME = re.compile(r"^.*?</think>", re.DOTALL)  # açılışı kesilmiş düşünme bloğu
_YEREL_ADLAR = {"localhost", "host.docker.internal"}


class ModulHatasi(AyarHatasi):
    """Modül kullanılamıyor: sunucu kapalı, model yok, zaman aşımı… Kullanıcıya ne yapacağını söyler."""


def yerel_adres_mi(adres: str) -> bool:
    """Adres bu bilgisayarı ya da yerel ağı mı gösteriyor? (``localhost``, 127.x, 10.x, 192.168.x, ``*.local`` …)"""
    try:
        from urllib3.util import parse_url  # requests bağlanırken bu ayrıştırıcıyı kullanır

        ana = (parse_url(adres).host or "").strip("[]").lower()
    except Exception:  # noqa: BLE001 — bozuk adres ("http://[::1:80/v1"): yerel sayılmaz
        return False
    if not ana or "\\" in adres or "@" in adres.split("//", 1)[-1].split("/", 1)[0]:
        return False
    if ana in _YEREL_ADLAR or ana.endswith((".local", ".localhost")):
        return True
    try:
        ip = ipaddress.ip_address(ana)
    except ValueError:
        return False
    return ip.is_loopback or ip.is_private or ip.is_link_local


def dusunmeyi_ayikla(metin: str) -> str:
    """``<think>…</think>`` bloklarını atar (DeepSeek-R1 damıtmaları cevaptan önce düşünür)."""
    metin = _DUSUNME.sub("", metin)
    if "</think>" in metin:
        metin = _YARIM_DUSUNME.sub("", metin, count=1)
    if "<think>" in metin:  # token sınırında kesilmiş, kapanmamış düşünme: cevap yok
        metin = metin.split("<think>", 1)[0]
    return metin.strip()


def gorsel_parcasi(gorsel: bytes, mime: str = "image/png") -> dict:
    """OpenAI biçiminde görüntü içeriği (base64 veri adresi). Ollama ve vLLM bu biçimi kabul eder."""
    veri = base64.b64encode(gorsel).decode("ascii")
    return {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{veri}"}}


class YerelSunucu:
    """``adres``: sunucunun OpenAI uyumlu kökü (ör. ``http://localhost:11434/v1``)."""

    def __init__(self, adres: str, zaman_asimi: float = 900, uzak_sunucu: bool = False, oturum: Any = None) -> None:
        self.adres = adres.rstrip("/")
        self.zaman_asimi = zaman_asimi
        yerel = yerel_adres_mi(self.adres)
        if not yerel and not uzak_sunucu:
            raise ModulHatasi(
                f"{self.adres} bu bilgisayarda ya da yerel ağda değil. TDK/MEB içeriği dışarı gönderilmesin diye "
                "uzak sunucular varsayılan olarak kapalıdır. Yerel bir sunucu kullan (ör. Ollama: "
                "http://localhost:11434/v1) ya da bilerek izin vermek için ayarlar.toml'da [moduller] "
                "uzak_sunucu = true yaz."
            )
        if oturum is None:
            import requests

            oturum = requests.Session()
            if yerel:
                oturum.trust_env = False  # yerel adres için sistemdeki vekil sunucu (proxy) ayarları kullanılmaz
        self.oturum = oturum
        self.son_bitis: str | None = None
        """Son sohbet isteğinin ``finish_reason``'ı: ``"length"`` ise çıktı ``en_fazla_token``'da kesilmiştir."""

    # ---------------------------------------------------------------------------------------------
    def _istek(self, yontem: str, yol: str, govde: dict | None = None) -> dict:
        import requests

        url = f"{self.adres}{yol}"
        try:
            yanit = self.oturum.request(yontem, url, json=govde, timeout=self.zaman_asimi, allow_redirects=False)
        except requests.exceptions.Timeout as e:
            raise ModulHatasi(
                f"Yerel model sunucusu {self.zaman_asimi:g} sn içinde cevap vermedi ({url}). Ekran kartı yoksa bir "
                "sayfanın OCR'ı dakikalar sürebilir: ayarlar.toml'da [moduller] zaman_asimi değerini büyüt."
            ) from e
        except requests.exceptions.ConnectionError as e:
            raise ModulHatasi(
                f"Yerel model sunucusuna ulaşılamadı ({self.adres}). Sunucu kurulu ve çalışıyor mu? Ollama için: "
                "ollama.com'dan kur, sonra `ollama serve` (çoğu kurulumda kendiliğinden çalışır). Başka bir sunucu "
                "kullanıyorsan ayarlar.toml'da [moduller] adres değerini düzelt. Ayrıntı: README, 'DeepSeek modülleri'."
            ) from e
        except requests.exceptions.RequestException as e:
            raise ModulHatasi(f"Yerel model sunucusuna istek gönderilemedi ({url}): {e}") from e
        if 300 <= yanit.status_code < 400:
            raise ModulHatasi(
                f"Yerel model sunucusu isteği başka bir adrese yönlendirdi (HTTP {yanit.status_code} → "
                f"{yanit.headers.get('Location', '?')}). Veri dışarı gitmesin diye yönlendirme izlenmez; "
                "ayarlar.toml'da [moduller] adres değerini sunucunun asıl /v1 köküyle değiştir."
            )
        if yanit.status_code >= 400:
            raise ModulHatasi(self._hata_metni(yanit, govde))
        try:
            veri = yanit.json()
        except ValueError as e:
            raise ModulHatasi(
                f"{url} JSON döndürmedi; adres OpenAI uyumlu bir sunucunun /v1 kökü mü? (ilk karakterler: "
                f"{yanit.text[:120]!r})"
            ) from e
        if not isinstance(veri, dict):
            raise ModulHatasi(f"{url} beklenmeyen bir cevap döndürdü: {str(veri)[:120]!r}")
        return veri

    def _hata_metni(self, yanit: Any, govde: dict | None) -> str:
        try:
            ham = yanit.json()
            hata = ham.get("error", ham) if isinstance(ham, dict) else ham
            mesaj = hata.get("message", hata) if isinstance(hata, dict) else hata
        except ValueError:
            mesaj = yanit.text
        mesaj = str(mesaj)[:300]
        model = (govde or {}).get("model")
        dusuk = mesaj.lower()
        if model and "model" in dusuk and any(k in dusuk for k in ("not found", "does not exist", "not exist")):
            return (
                f"Sunucuda '{model}' modeli yok ({self.adres}). Ollama kullanıyorsan indir: `ollama pull {model}`. "
                "Sunucudaki modelleri görmek için: python -m turkce_model modul-liste"
            )
        ipucu = " Adres OpenAI uyumlu kökü göstermeli (çoğu sunucuda /v1 ile biter)." if yanit.status_code == 404 else ""
        return f"Yerel model sunucusu hata döndürdü (HTTP {yanit.status_code}, {self.adres}): {mesaj}.{ipucu}"

    # ---------------------------------------------------------------------------------------------
    def modeller(self) -> list[str]:
        """Sunucudaki modellerin adları (``GET /models``)."""
        veri = self._istek("GET", "/models")
        veriler = veri.get("data")
        if not isinstance(veriler, list):
            veriler = []
        return sorted(str(m.get("id")) for m in veriler if isinstance(m, dict) and m.get("id"))

    def sohbet(
        self,
        model: str,
        mesajlar: list[dict],
        en_fazla_token: int = 1024,
        sicaklik: float = 0.0,
        ek_istek: dict | None = None,
    ) -> str:
        """Tek bir sohbet isteği; modelin cevabı (düşünme blokları ayıklanmış)."""
        govde: dict = {
            "model": model,
            "messages": mesajlar,
            "temperature": sicaklik,
            "max_tokens": en_fazla_token,
            "stream": False,
            **(ek_istek or {}),
        }
        veri = self._istek("POST", "/chat/completions", govde)
        try:
            self.son_bitis = veri["choices"][0].get("finish_reason")
            icerik = veri["choices"][0]["message"].get("content")
        except (KeyError, IndexError, TypeError, AttributeError) as e:
            raise ModulHatasi(f"Sunucunun cevabı beklenen biçimde değil ({self.adres}): {str(veri)[:200]!r}") from e
        if isinstance(icerik, list):  # içerik parçaları: metinleri birleştir
            icerik = "".join(str(p.get("text", "")) for p in icerik if isinstance(p, dict))
        return dusunmeyi_ayikla(str(icerik or ""))

    def gorselden_metin(
        self,
        model: str,
        istem: str,
        gorsel: bytes,
        mime: str = "image/png",
        en_fazla_token: int = 4096,
        ek_istek: dict | None = None,
    ) -> str:
        """Bir görüntü + istem gönderir (ör. OCR). Görüntü istemden önce gelir (DeepSeek-OCR'ın beklediği sıra)."""
        mesajlar = [{"role": "user", "content": [gorsel_parcasi(gorsel, mime), {"type": "text", "text": istem}]}]
        return self.sohbet(model, mesajlar, en_fazla_token=en_fazla_token, ek_istek=ek_istek)

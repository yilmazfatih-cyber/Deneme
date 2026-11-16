"""Anthropic (Claude) bağdaştırıcısı — resmî `anthropic` SDK'sıyla (isteğe bağlı ekstra).

Kurulum: uv pip install --python .venv/bin/python -e ".[anthropic]"
Kimlik: ANTHROPIC_API_KEY ortam değişkeni (ya da SDK'nın tanıdığı diğer yollar).
Bilinmesi gerekenler (kaynak: `claude-api` becerisi, 2026-11-03 tarihli bilgi; SDK 2.8.0'dan
doğrulandı; CANLI API İLE DENENMEDİ — bkz. docs/KARARLAR.md K-06):
    - Sıcaklık (`sicaklik`) GÖNDERİLMEZ: SDK 2.x'in kullandığı API sürümü örnekleme
      parametrelerini reddeder. Bu yüzden istekteki sıcaklık yok sayılır.
    - Zorunlu araç seçimi güncel modellerde reddedilir; "zorunlu" isteği sistem istemine
      yazılı bir talimat olarak eklenir (`zorunlu_arac_destegi=True` ise gerçek alan gönderilir).
    - Model yanıtı reddedebilir (`bitis_nedeni="ret"`); `ret_yedegi_beta` verilirse sunucu
      tarafı yedek model devreye girer (yz.ornek.yaml'da açık gelir).
    - Araç turlarında modelin ham içerik blokları (`saglayici_verisi`) aynen geri gönderilir.
Model adı koda gömülmez; yapılandırmadan gelir.
Genişletme: yeni bir istek alanı → `_parametreler`; yeni bir blok türü → `_yanit_coz`.
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any, ClassVar

import anthropic

from yz.hatalar import BaglantiHatasi, DesteklenmiyorHatasi, SaglayiciHatasi, ZamanAsimiHatasi
from yz.metin import kucuk_ascii
from yz.saglayici.taban import Saglayici
from yz.saglayici.tipler import (
    AkisParcasi,
    AracCagrisi,
    BitisNedeni,
    Kullanim,
    Mesaj,
    ModelBilgisi,
    SohbetIstegi,
    Yanit,
)

_BITIS: dict[str, BitisNedeni] = {
    "end_turn": "bitti",
    "stop_sequence": "bitti",
    "max_tokens": "uzunluk",
    "tool_use": "arac",
    "refusal": "ret",
    "pause_turn": "diger",
}
_HAM_ICERIK = "anthropic_icerik"


def mesajlari_cevir(mesajlar: list[Mesaj]) -> tuple[str, list[dict[str, Any]]]:
    """Ortak mesajları (sistem metni, Anthropic `messages` listesi) ikilisine çevirir."""
    sistem: list[str] = []
    sonuc: list[dict[str, Any]] = []
    for m in mesajlar:
        if m.rol == "system":
            sistem.append(m.icerik)
        elif m.rol == "tool":
            blok: dict[str, Any] = {
                "type": "tool_result",
                "tool_use_id": m.arac_cagri_kimligi or "",
                "content": m.icerik,
            }
            if m.arac_hatasi:
                blok["is_error"] = True
            onceki = sonuc[-1] if sonuc else None
            if onceki and onceki["role"] == "user" and isinstance(onceki["content"], list):
                onceki["content"].append(blok)  # aynı turun sonuçları tek kullanıcı mesajında
            else:
                sonuc.append({"role": "user", "content": [blok]})
        elif m.rol == "assistant":
            ham = (m.saglayici_verisi or {}).get(_HAM_ICERIK)
            if ham:
                sonuc.append({"role": "assistant", "content": ham})
                continue
            bloklar: list[dict[str, Any]] = []
            if m.icerik:
                bloklar.append({"type": "text", "text": m.icerik})
            bloklar.extend(
                {"type": "tool_use", "id": c.kimlik, "name": c.ad, "input": c.argumanlar}
                for c in m.arac_cagrilari
            )
            sonuc.append({"role": "assistant", "content": bloklar or m.icerik})
        else:
            sonuc.append({"role": "user", "content": m.icerik})
    return "\n\n".join(s for s in sistem if s), sonuc


class Anthropic(Saglayici):
    """Claude modelleri için sağlayıcı."""

    tur: ClassVar[str] = "anthropic"

    def __init__(
        self,
        model: str,
        *,
        api_anahtari: str | None = None,
        taban_url: str | None = None,
        zaman_asimi_sn: float = 600.0,
        azami_yeniden_deneme: int = 2,
        varsayilan_azami_belirtec: int = 16000,
        ret_yedegi_beta: str | None = None,
        zorunlu_arac_destegi: bool = False,
        istemci: Any | None = None,
        **ortak: Any,
    ) -> None:
        super().__init__(model, **ortak)
        self.varsayilan_azami_belirtec = varsayilan_azami_belirtec
        self.ret_yedegi_beta = ret_yedegi_beta
        self.zorunlu_arac_destegi = zorunlu_arac_destegi
        self._istemci = anthropic.Anthropic(
            api_key=api_anahtari,
            base_url=taban_url,
            timeout=zaman_asimi_sn,
            max_retries=azami_yeniden_deneme,
            http_client=istemci,
        )

    def kapat(self) -> None:
        self._istemci.close()

    # ------------------------------------------------------------------ istek

    def _parametreler(self, istek: SohbetIstegi) -> dict[str, Any]:
        sistem, mesajlar = mesajlari_cevir(istek.mesajlar)
        p: dict[str, Any] = {
            "model": self.model,
            "max_tokens": istek.azami_belirtec or self.varsayilan_azami_belirtec,
            "messages": mesajlar,
        }
        if istek.dur:
            p["stop_sequences"] = istek.dur
        if istek.araclar:
            p["tools"] = [
                {"name": a.ad, "description": a.aciklama, "input_schema": a.parametreler}
                for a in istek.araclar
            ]
            if istek.arac_secimi == "yok":
                p["tool_choice"] = {"type": "none"}
            elif istek.arac_secimi != "oto":
                belirli = istek.arac_secimi != "zorunlu"
                if self.zorunlu_arac_destegi:
                    p["tool_choice"] = (
                        {"type": "tool", "name": istek.arac_secimi} if belirli else {"type": "any"}
                    )
                else:
                    hedef = f"`{istek.arac_secimi}` aracını" if belirli else "araçlardan birini"
                    sistem = f"{sistem}\n\nBu turda yanıt vermeden önce {hedef} kullan.".strip()
        if sistem:
            p["system"] = sistem
        bicim = istek.yanit_bicimi
        if bicim is not None and bicim.tur == "json_sema" and bicim.sema is not None:
            p["output_config"] = {"format": {"type": "json_schema", "schema": bicim.sema}}
        p.update(istek.ek)
        if self.ret_yedegi_beta:
            p["betas"] = [self.ret_yedegi_beta, *p.get("betas", [])]
            p.setdefault("fallbacks", "default")
        return p

    def _uc(self) -> Any:
        """Yedek açıkken beta ucu, değilken olağan uç kullanılır."""
        return self._istemci.beta.messages if self.ret_yedegi_beta else self._istemci.messages

    def _sohbet(self, istek: SohbetIstegi) -> Yanit:
        try:
            ileti = self._uc().create(**self._parametreler(istek))
        except anthropic.APIError as hata:
            raise _hata_cevir(hata, self.model) from hata
        return _yanit_coz(ileti.to_dict())

    def _sohbet_akisi(self, istek: SohbetIstegi) -> Iterator[AkisParcasi]:
        try:
            with self._uc().stream(**self._parametreler(istek)) as akis:
                for metin in akis.text_stream:
                    yield AkisParcasi(metin=metin)
                son = akis.get_final_message()
        except anthropic.APIError as hata:
            raise _hata_cevir(hata, self.model) from hata
        yield AkisParcasi(son=_yanit_coz(son.to_dict()))

    def modeller(self) -> list[ModelBilgisi]:
        try:
            return [ModelBilgisi(kimlik=m.id, ham=m.to_dict()) for m in self._istemci.models.list()]
        except anthropic.APIError as hata:
            raise _hata_cevir(hata, self.model) from hata


def _yanit_coz(veri: dict[str, Any]) -> Yanit:
    """SDK'nın `Message.to_dict()` çıktısını ortak `Yanit`'a çevirir."""
    bloklar = [b for b in veri.get("content") or [] if isinstance(b, dict)]
    metin = "".join(str(b.get("text", "")) for b in bloklar if b.get("type") == "text")
    dusunce = "\n".join(
        str(b.get("thinking", ""))
        for b in bloklar
        if b.get("type") == "thinking" and b.get("thinking")
    )
    cagrilar = [
        AracCagrisi(
            kimlik=str(b.get("id", "")),
            ad=str(b.get("name", "")),
            argumanlar=b["input"] if isinstance(b.get("input"), dict) else {},
        )
        for b in bloklar
        if b.get("type") == "tool_use"
    ]
    k = veri.get("usage") or {}
    girdi = sum(
        int(k.get(alan) or 0)
        for alan in ("input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens")
    )
    yalniz_metin = all(b.get("type") == "text" for b in bloklar)
    return Yanit(
        metin=metin,
        arac_cagrilari=cagrilar,
        bitis_nedeni=_BITIS.get(str(veri.get("stop_reason")), "arac" if cagrilar else "bitti"),
        kullanim=Kullanim(girdi_belirteci=girdi, cikti_belirteci=int(k.get("output_tokens") or 0)),
        model=str(veri.get("model") or ""),
        dusunce=dusunce,
        saglayici_verisi=None if yalniz_metin else {_HAM_ICERIK: bloklar},
    )


def _hata_cevir(hata: anthropic.APIError, model: str) -> SaglayiciHatasi:
    """SDK hatasını (en özelden genele doğru) paketin hata sınıflarına çevirir."""
    if isinstance(hata, anthropic.APITimeoutError):
        return ZamanAsimiHatasi(
            "Anthropic API zamanında yanıt vermedi. Uzun yanıtlar için `akis=True` kullanın "
            "ya da `zaman_asimi_sn` değerini büyütün.",
            yeniden_denenebilir=True,
        )
    if isinstance(hata, anthropic.APIConnectionError):
        return BaglantiHatasi(f"Anthropic API'ye bağlanılamadı: {hata}", yeniden_denenebilir=True)
    if not isinstance(hata, anthropic.APIStatusError):
        return SaglayiciHatasi(f"Anthropic SDK hatası: {hata}")
    durum = hata.status_code
    ileti = hata.message
    if isinstance(hata, anthropic.AuthenticationError | anthropic.PermissionDeniedError):
        return SaglayiciHatasi(
            f"Anthropic kimlik doğrulaması başarısız ({durum}): {ileti}. ANTHROPIC_API_KEY "
            "değerini denetleyin.",
            durum_kodu=durum,
        )
    if isinstance(hata, anthropic.NotFoundError):
        return SaglayiciHatasi(
            f"Model bulunamadı ({durum}): {ileti}. Yapılandırmadaki model adı: {model}. "
            "Geçerli adlar için: python -m yz modeller --saglayici <profil>",
            durum_kodu=durum,
        )
    if isinstance(hata, anthropic.BadRequestError):
        kucuk = kucuk_ascii(ileti)
        if any(s in kucuk for s in ("output_config", "json_schema", "schema", "tool_choice")):
            return DesteklenmiyorHatasi(
                f"Anthropic API isteğin biçim kısmını reddetti: {ileti}", durum_kodu=durum
            )
        ek = (
            " `ret_yedegi_beta` açıksa bu model ya da hesap sunucu tarafı yedeği desteklemiyor "
            "olabilir; yapılandırmadan kaldırıp yeniden deneyin."
            if "fallback" in kucuk or "beta" in kucuk
            else ""
        )
        return SaglayiciHatasi(f"Anthropic API isteği reddetti: {ileti}.{ek}", durum_kodu=durum)
    yeniden = isinstance(hata, anthropic.RateLimitError) or durum >= 500
    return SaglayiciHatasi(
        f"Anthropic API hatası ({durum}): {ileti}", durum_kodu=durum, yeniden_denenebilir=yeniden
    )

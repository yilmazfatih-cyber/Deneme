"""YENİ SAĞLAYICI ÖRNEĞİ: Ollama'nın yerel `/api/chat` API'si (OpenAI uyumlu uç yerine).

Ne zaman gerekir: Ollama'ya özgü alanları (ör. `keep_alive`, `options.num_ctx` ile bağlam
uzunluğu, `think`) kullanmak istediğinizde. Şema `format` alanıyla gönderilir (Ollama'nın
yapılı çıktısı). Alanlar Ollama'nın docs/api.md belgesinden alındı; CANLI OLLAMA İLE DENENMEDİ
(tests/test_ornekler.py kayıtlı yanıt biçimiyle sınar).
Kaydetmek için (AGENTS.md "Yeni sağlayıcı ekle"): yz/saglayici/kayit.py'deki KURUCULAR'a
`"ollama": _ollama` ekleyip bu sınıfı kuran bir `_ollama(ayar, anahtar, ortak)` yazın.
Genişletme: Ollama'nın başka bir seçeneği → `_govde` içine ekleyin.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from typing import Any, ClassVar

import httpx

from yz.hatalar import BaglantiHatasi, SaglayiciHatasi
from yz.saglayici.openai_bicim import AkisBiriktirici, mesaj_tele, yanit_coz
from yz.saglayici.sse import satirlara_bol, sse_olaylari
from yz.saglayici.taban import Saglayici
from yz.saglayici.tipler import AkisParcasi, SohbetIstegi, Yanit


class OllamaYerel(Saglayici):
    tur: ClassVar[str] = "ollama_yerel"

    def __init__(
        self,
        model: str,
        *,
        adres: str = "http://localhost:11434",
        baglam_uzunlugu: int | None = None,
        zaman_asimi_sn: float = 300.0,
        istemci: httpx.Client | None = None,
        **ortak: Any,
    ) -> None:
        super().__init__(model, **ortak)
        self.adres = adres.rstrip("/")
        self.baglam_uzunlugu = baglam_uzunlugu
        self._istemci = istemci or httpx.Client(timeout=zaman_asimi_sn)

    def _govde(self, istek: SohbetIstegi, akis: bool) -> dict[str, Any]:
        mesajlar = []
        for m in istek.mesajlar:
            tel = mesaj_tele(m)
            if m.rol == "tool":  # Ollama araç sonucunu tool_name ile ister
                tel = {"role": "tool", "content": m.icerik, "tool_name": m.ad or ""}
            for cagri in tel.get("tool_calls", []):  # Ollama argümanları nesne olarak ister
                cagri["function"]["arguments"] = json.loads(cagri["function"]["arguments"])
            mesajlar.append(tel)
        secenekler: dict[str, Any] = {}
        if istek.sicaklik is not None:
            secenekler["temperature"] = istek.sicaklik
        if istek.azami_belirtec is not None:
            secenekler["num_predict"] = istek.azami_belirtec
        if istek.dur:
            secenekler["stop"] = istek.dur
        if istek.tohum is not None:
            secenekler["seed"] = istek.tohum
        if self.baglam_uzunlugu:
            secenekler["num_ctx"] = self.baglam_uzunlugu
        govde: dict[str, Any] = {
            "model": self.model,
            "messages": mesajlar,
            "stream": akis,
            "options": secenekler,
        }
        if istek.araclar:
            govde["tools"] = [{"type": "function", "function": {"name": a.ad, "description": a.aciklama,
                                                                "parameters": a.parametreler}} for a in istek.araclar]  # fmt: skip
        if istek.yanit_bicimi is not None:
            govde["format"] = istek.yanit_bicimi.sema or "json"
        return {**govde, **istek.ek}

    def _gonder(self, govde: dict[str, Any], akis: bool) -> httpx.Response:
        try:
            istek = self._istemci.build_request("POST", f"{self.adres}/api/chat", json=govde)
            yanit = self._istemci.send(istek, stream=akis)
        except httpx.HTTPError as hata:
            raise BaglantiHatasi(f"Ollama'ya bağlanılamadı ({self.adres}): {hata}. `ollama serve` çalışıyor mu?",
                                 yeniden_denenebilir=True) from hata  # fmt: skip
        if yanit.status_code >= 400:
            metin = yanit.read().decode("utf-8", errors="replace")
            raise SaglayiciHatasi(
                f"Ollama isteği reddetti ({yanit.status_code}): {metin[:300]}",
                durum_kodu=yanit.status_code,
            )
        return yanit

    def _sohbet(self, istek: SohbetIstegi) -> Yanit:
        return yanit_coz(self._gonder(self._govde(istek, akis=False), akis=False).json())

    def _sohbet_akisi(self, istek: SohbetIstegi) -> Iterator[AkisParcasi]:
        yanit = self._gonder(self._govde(istek, akis=True), akis=True)
        biriktirici = AkisBiriktirici()
        try:
            for olay in sse_olaylari(
                satirlara_bol(yanit.iter_bytes())
            ):  # NDJSON satırları da olaydır
                parca = biriktirici.ekle(json.loads(olay.veri))
                if parca is not None:
                    yield parca
        finally:
            yanit.close()
        son_parca, tam = biriktirici.bitir()
        if son_parca is not None:
            yield son_parca
        yield AkisParcasi(son=tam)


if __name__ == "__main__":
    import sys

    sag = OllamaYerel(sys.argv[1] if len(sys.argv) > 1 else "llama3.2")
    print(sag.sohbet("Merhaba! Tek cümleyle kendini tanıt.", azami_belirtec=60).metin)

"""OpenAI uyumlu sunucular için bağdaştırıcı (httpx ile doğrudan).

Çalıştığı sunucular: Ollama, llama.cpp sunucusu, LM Studio, vLLM, OpenRouter, havuz/dil-modeli
ve `/v1/chat/completions` konuşan diğerleri. Uçlar: `/chat/completions`, `/embeddings`, `/models`.
Hoşgörü: sunucu isteğe bağlı bir alanı (stream_options, seed, tool_choice) reddederse o alan
çıkarılıp bir kez daha denenir; `response_format` ya da `tools` reddedilirse
`DesteklenmiyorHatasi` fırlatılır (üst katman başka stratejiye geçer).
Kim kullanır: saglayici/kayit.py üzerinden herkes.
Genişletme: tel biçimi farkları saglayici/openai_bicim.py'dedir; ağ davranışı buradadır.
"""

from __future__ import annotations

import json
import time
from collections.abc import Callable, Iterator, Sequence
from typing import Any, ClassVar, TypeVar

import httpx

from yz.hatalar import BaglantiHatasi, DesteklenmiyorHatasi, SaglayiciHatasi, ZamanAsimiHatasi
from yz.metin import kucuk_ascii
from yz.saglayici.openai_bicim import AkisBiriktirici, govde_kur, yanit_coz
from yz.saglayici.sse import satirlara_bol, sse_olaylari
from yz.saglayici.taban import Saglayici
from yz.saglayici.tipler import AkisParcasi, ModelBilgisi, SohbetIstegi, Yanit
from yz.saglayici.yeniden_dene import YenidenDenemeAyari, yeniden_dene

_CIKARILABILIR = ("stream_options", "seed", "tool_choice")  # reddedilirse atılıp yeniden denenir
_YENIDEN_DENENEN = frozenset({408, 409, 425, 429, 500, 502, 503, 504, 529})

T = TypeVar("T")


def taban_url_duzelt(adres: str) -> str:
    """Kullanıcının yazdığı adresi `/v1` köküne indirger.

    "http://localhost:11434" → ".../v1"; sondaki "/" ve "/chat/completions" atılır. Yolu olan
    adresler (ör. ".../api/v1", ".../v1beta/openai") olduğu gibi bırakılır.
    """
    duz = adres.strip().rstrip("/")
    for ek in ("/chat/completions", "/completions", "/embeddings", "/models"):
        duz = duz.removesuffix(ek)
    if not duz.startswith(("http://", "https://")):
        raise ValueError(f"Adres http:// ya da https:// ile başlamalı; gelen: {adres!r}")
    yol = httpx.URL(duz).path.strip("/")
    return duz if yol else duz + "/v1"


def hata_iletisi_coz(govde: str) -> str:
    """Hata gövdesinden insanın okuyacağı iletiyi çıkarır (JSON değilse ilk 300 karakter)."""
    try:
        veri = json.loads(govde)
    except ValueError:
        return govde.strip()[:300]
    if isinstance(veri, dict):
        hata = veri.get("error", veri.get("detail", veri.get("message")))
        if isinstance(hata, dict):
            hata = hata.get("message", hata)
        if hata:
            return str(hata)[:300]
    return govde.strip()[:300]


class OpenAIUyumlu(Saglayici):
    """`/v1/chat/completions` konuşan her sunucu için sağlayıcı."""

    tur: ClassVar[str] = "openai_uyumlu"

    def __init__(
        self,
        taban_url: str,
        model: str,
        *,
        api_anahtari: str | None = None,
        zaman_asimi_sn: float = 120.0,
        yeniden_deneme: YenidenDenemeAyari | None = None,
        yapili_kip: str = "json_sema",
        azami_belirtec_alani: str = "max_tokens",
        gomme_modeli: str | None = None,
        gomme_toplu: int = 32,
        ek_basliklar: dict[str, str] | None = None,
        dusunce_ayikla: bool = True,
        istemci: httpx.Client | None = None,
        uyu: Callable[[float], None] = time.sleep,
        **ortak: Any,
    ) -> None:
        super().__init__(model, **ortak)
        self.taban_url = taban_url_duzelt(taban_url)
        self.yapili_kip = yapili_kip
        self.azami_belirtec_alani = azami_belirtec_alani
        self.gomme_modeli = gomme_modeli or model
        self.gomme_toplu = gomme_toplu
        self.dusunce_ayikla = dusunce_ayikla
        self.yeniden_deneme = yeniden_deneme or YenidenDenemeAyari()
        self._uyu = uyu
        basliklar = {"Content-Type": "application/json", **(ek_basliklar or {})}
        if api_anahtari:
            basliklar["Authorization"] = f"Bearer {api_anahtari}"
        self._basliklar = basliklar
        self._istemci = istemci or httpx.Client(timeout=httpx.Timeout(zaman_asimi_sn, connect=10.0))
        self.gbnf_uret: Callable[[dict[str, Any]], str] | None = None  # yapili_kip="gbnf" için

    @property
    def kimlik(self) -> str:
        return f"{self.tur}:{self.taban_url}:{self.model}"

    def kapat(self) -> None:
        self._istemci.close()

    # ------------------------------------------------------------------ sohbet

    def _govde(self, istek: SohbetIstegi, akis: bool) -> dict[str, Any]:
        gbnf = None
        if self.yapili_kip == "gbnf" and istek.yanit_bicimi and istek.yanit_bicimi.sema:
            if self.gbnf_uret is None:
                from yz.yapili.gbnf import semadan_gbnf  # geç içe aktarma: yalnız bu kipte gerekir

                self.gbnf_uret = semadan_gbnf
            gbnf = self.gbnf_uret(istek.yanit_bicimi.sema)
        return govde_kur(
            istek,
            self.model,
            akis=akis,
            yapili_kip=self.yapili_kip,
            azami_belirtec_alani=self.azami_belirtec_alani,
            gbnf=gbnf,
        )

    def _sohbet(self, istek: SohbetIstegi) -> Yanit:
        veri = self._json_gonder("POST", "/chat/completions", self._govde(istek, akis=False))
        return yanit_coz(veri, self.dusunce_ayikla)

    def _sohbet_akisi(self, istek: SohbetIstegi) -> Iterator[AkisParcasi]:
        govde = self._govde(istek, akis=True)
        yanit = self._alan_atarak(self._akis_ac, govde)
        try:
            if "event-stream" not in yanit.headers.get("content-type", "event-stream"):
                tam = yanit_coz(json.loads(yanit.read()), self.dusunce_ayikla)  # akışı yok saymış
                if tam.metin:
                    yield AkisParcasi(metin=tam.metin)
                yield AkisParcasi(son=tam)
                return
            biriktirici = AkisBiriktirici(self.dusunce_ayikla)
            for olay in sse_olaylari(satirlara_bol(yanit.iter_bytes())):
                if olay.veri.strip() == "[DONE]":
                    break
                try:
                    veri = json.loads(olay.veri)
                except ValueError:
                    continue  # anlaşılmayan satır: yok say, akışı sürdür
                if isinstance(veri, dict):
                    parca = biriktirici.ekle(veri)
                    if parca is not None:
                        yield parca
            son_parca, tam = biriktirici.bitir()
            if son_parca is not None:
                yield son_parca
            yield AkisParcasi(son=tam)
        except httpx.HTTPError as hata:
            raise BaglantiHatasi(
                f"Akış sırasında bağlantı koptu: {hata}", yeniden_denenebilir=True
            ) from hata
        finally:
            yanit.close()

    # ------------------------------------------------------------------ gömme ve modeller

    def gom(self, metinler: Sequence[str]) -> list[list[float]]:
        vektorler: list[list[float]] = []
        for bas in range(0, len(metinler), self.gomme_toplu):
            toplu = list(metinler[bas : bas + self.gomme_toplu])
            veri = self._json_gonder(
                "POST", "/embeddings", {"model": self.gomme_modeli, "input": toplu}
            )
            ham = veri.get("data")
            if isinstance(ham, list):
                sirali = sorted(ham, key=lambda o: o.get("index", 0) if isinstance(o, dict) else 0)
                parca = [o["embedding"] for o in sirali if isinstance(o, dict) and "embedding" in o]
            else:
                parca = veri.get("embeddings") or []  # Ollama yerel biçimi
            if len(parca) != len(toplu):
                raise SaglayiciHatasi(
                    f"Gömme ucu {len(toplu)} metin için {len(parca)} vektör döndürdü. Model "
                    f"({self.gomme_modeli}) bir gömme modeli mi? `gomme_modeli` ayarını denetleyin."
                )
            vektorler.extend([float(x) for x in v] for v in parca)
        return vektorler

    def modeller(self) -> list[ModelBilgisi]:
        veri = self._json_gonder("GET", "/models", None)
        ham = veri.get("data") or veri.get("models") or []
        sonuc: list[ModelBilgisi] = []
        for o in ham:
            if isinstance(o, dict) and (o.get("id") or o.get("name")):
                kimlik = str(o.get("id") or o.get("name"))
                sonuc.append(ModelBilgisi(kimlik=kimlik, sahip=str(o.get("owned_by") or ""), ham=o))
        return sonuc

    # ------------------------------------------------------------------ ağ

    def _json_gonder(self, yontem: str, yol: str, govde: dict[str, Any] | None) -> dict[str, Any]:
        def bir_kez(g: dict[str, Any] | None) -> dict[str, Any]:
            yanit = self._istek(yontem, yol, g, akis=False)
            try:
                veri = yanit.json()
            except ValueError as hata:
                raise SaglayiciHatasi(
                    "Sunucu JSON olmayan bir yanıt döndürdü. Adres bir OpenAI uyumlu uç mu? "
                    f"({self.taban_url}{yol})",
                    govde=yanit.text[:500],
                ) from hata
            if not isinstance(veri, dict):
                raise SaglayiciHatasi(
                    "Sunucu yanıtı bir JSON nesnesi değil.", govde=yanit.text[:500]
                )
            return veri

        if govde is None:
            return yeniden_dene(lambda: bir_kez(None), self.yeniden_deneme, uyu=self._uyu)
        return self._alan_atarak(bir_kez, govde)

    def _akis_ac(self, govde: dict[str, Any]) -> httpx.Response:
        return self._istek("POST", "/chat/completions", govde, akis=True)

    def _alan_atarak(self, islem: Callable[[dict[str, Any]], T], govde: dict[str, Any]) -> T:
        """İsteği gönderir; sunucu isteğe bağlı bir alanı reddederse atıp yeniden dener."""
        govde = dict(govde)
        while True:
            try:
                return yeniden_dene(lambda: islem(govde), self.yeniden_deneme, uyu=self._uyu)
            except SaglayiciHatasi as hata:
                if hata.durum_kodu not in (400, 422) or isinstance(hata, DesteklenmiyorHatasi):
                    raise
                atilacak = [a for a in _CIKARILABILIR if a in govde and a in (hata.govde or "")]
                if not atilacak:
                    raise
                for alan in atilacak:
                    del govde[alan]

    def _istek(
        self, yontem: str, yol: str, govde: dict[str, Any] | None, *, akis: bool
    ) -> httpx.Response:
        adres = self.taban_url + yol
        try:
            istek = self._istemci.build_request(yontem, adres, json=govde, headers=self._basliklar)
            yanit = self._istemci.send(istek, stream=akis)
        except httpx.TimeoutException as hata:
            raise ZamanAsimiHatasi(
                f"Sunucu zamanında yanıt vermedi ({adres}). Model yükleniyor olabilir; biraz "
                "sonra yeniden deneyin ya da `zaman_asimi_sn` değerini büyütün.",
                yeniden_denenebilir=True,
            ) from hata
        except httpx.HTTPError as hata:
            raise BaglantiHatasi(
                f"Sunucuya bağlanılamadı ({adres}): {hata}. Sunucu çalışıyor mu? "
                "(Ollama: `ollama serve`; adres ve kapı doğru mu?)",
                yeniden_denenebilir=True,
            ) from hata
        if yanit.status_code >= 400:
            metin = yanit.read().decode("utf-8", errors="replace")
            yanit.close()
            raise self._durum_hatasi(yanit.status_code, metin, yanit.headers, govde or {}, adres)
        return yanit

    def _durum_hatasi(
        self,
        durum: int,
        metin: str,
        basliklar: httpx.Headers,
        govde: dict[str, Any],
        adres: str,
    ) -> SaglayiciHatasi:
        ileti = hata_iletisi_coz(metin)
        ortak: dict[str, Any] = {"durum_kodu": durum, "govde": metin[:2000]}
        if durum in (401, 403):
            return SaglayiciHatasi(
                f"Sunucu kimlik doğrulamasını reddetti ({durum}): {ileti}. API anahtarını "
                "(YZ_API_ANAHTARI ya da yz.yaml `api_anahtari_ortam`) denetleyin.",
                **ortak,
            )
        if durum == 404:
            return SaglayiciHatasi(
                f"Uç ya da model bulunamadı (404): {ileti}. Adres: {adres}; model: {self.model}. "
                "Sunucudaki model adlarını görmek için: python -m yz modeller",
                **ortak,
            )
        if durum in _YENIDEN_DENENEN:
            return SaglayiciHatasi(
                f"Sunucu geçici olarak yanıt veremedi ({durum}): {ileti}",
                yeniden_denenebilir=True,
                bekleme_sn=_bekleme_basligi(basliklar),
                **ortak,
            )
        kucuk = kucuk_ascii(metin)
        bicim_var = "response_format" in govde or "grammar" in govde
        if bicim_var and any(s in kucuk for s in ("response_format", "json_schema", "grammar")):
            return DesteklenmiyorHatasi(
                f"Sunucu yapılı çıktı isteğini reddetti ({durum}): {ileti}", **ortak
            )
        if (
            "tools" in govde
            and durum in (400, 422, 501)
            and ("tool" in kucuk or "function" in kucuk)
        ):
            return DesteklenmiyorHatasi(
                f"Sunucu ya da model araç çağrısını desteklemiyor ({durum}): {ileti}", **ortak
            )
        return SaglayiciHatasi(f"Sunucu isteği reddetti ({durum}): {ileti}", **ortak)


def _bekleme_basligi(basliklar: httpx.Headers) -> float | None:
    """`Retry-After` başlığını saniyeye çevirir (tarih biçimi yok sayılır)."""
    ham = basliklar.get("retry-after")
    if ham is None:
        return None
    try:
        return max(0.0, float(ham))
    except ValueError:
        return None

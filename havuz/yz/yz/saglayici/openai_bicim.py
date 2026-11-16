"""OpenAI uyumlu tel biçimi ↔ ortak tipler (saf işlevler; ağ yok).

İstek gövdesini kurar, yanıtı ve akış parçalarını ayrıştırır. Sunucular arası farklara
hoşgörülüdür: `content` boş/None/parça listesi olabilir; araç argümanları dizgi ya da nesne
gelebilir (bozuk JSON onarılır); `finish_reason`, `usage`, `id`, `index` eksik olabilir;
düşünme metni `reasoning_content`, `reasoning` ya da <think> bloğu olarak gelebilir.
Kim kullanır: saglayici/openai_uyumlu.py ve sunucu/vekil.py (ters yönde: ortak tip → OpenAI).
Genişletme: yeni bir sunucu farkı gördüğünüzde gerçek yanıtı tests/test_openai_bicim.py'ye
ekleyip buradaki ilgili işlevi gevşetin.
"""

from __future__ import annotations

import json
from typing import Any

from yz.hatalar import SaglayiciHatasi
from yz.saglayici.dusunce import DusunceAyirici, dusunce_ayir
from yz.saglayici.tipler import (
    AkisParcasi,
    AracCagrisi,
    BitisNedeni,
    Kullanim,
    Mesaj,
    SohbetIstegi,
    Yanit,
)
from yz.yapili.json_onar import json_ayikla

_BITIS: dict[str, BitisNedeni] = {
    "stop": "bitti",
    "eos": "bitti",
    "end_turn": "bitti",
    "stop_sequence": "bitti",
    "length": "uzunluk",
    "max_tokens": "uzunluk",
    "tool_calls": "arac",
    "function_call": "arac",
    "tool_use": "arac",
    "content_filter": "suzgec",
}


# ----------------------------------------------------------------------------- istek


def mesaj_tele(mesaj: Mesaj) -> dict[str, Any]:
    """Ortak `Mesaj`ı OpenAI tel biçimine çevirir."""
    tel: dict[str, Any] = {"role": mesaj.rol, "content": mesaj.icerik}
    if mesaj.rol == "assistant" and mesaj.arac_cagrilari:
        tel["tool_calls"] = [
            {
                "id": c.kimlik,
                "type": "function",
                "function": {"name": c.ad, "arguments": c.json_argumanlar()},
            }
            for c in mesaj.arac_cagrilari
        ]
    if mesaj.rol == "tool":
        tel["tool_call_id"] = mesaj.arac_cagri_kimligi or ""
        if mesaj.ad:
            tel["name"] = mesaj.ad
    return tel


def govde_kur(
    istek: SohbetIstegi,
    model: str,
    *,
    akis: bool = False,
    yapili_kip: str = "json_sema",
    azami_belirtec_alani: str = "max_tokens",
    gbnf: str | None = None,
) -> dict[str, Any]:
    """`/chat/completions` istek gövdesini kurar.

    yapili_kip: şemanın sunucuya nasıl iletileceği — "json_sema" (response_format json_schema),
    "json_nesne" (yalnız JSON kipi), "gbnf" (llama.cpp `grammar` alanı), "kapali" (hiç gönderme).
    """
    govde: dict[str, Any] = {"model": model, "messages": [mesaj_tele(m) for m in istek.mesajlar]}
    if istek.sicaklik is not None:
        govde["temperature"] = istek.sicaklik
    if istek.azami_belirtec is not None:
        govde[azami_belirtec_alani] = istek.azami_belirtec
    if istek.dur:
        govde["stop"] = istek.dur
    if istek.tohum is not None:
        govde["seed"] = istek.tohum
    if istek.araclar:
        govde["tools"] = [
            {
                "type": "function",
                "function": {"name": a.ad, "description": a.aciklama, "parameters": a.parametreler},
            }
            for a in istek.araclar
        ]
        if istek.arac_secimi == "yok":
            govde["tool_choice"] = "none"
        elif istek.arac_secimi == "zorunlu":
            govde["tool_choice"] = "required"
        elif istek.arac_secimi != "oto":
            govde["tool_choice"] = {"type": "function", "function": {"name": istek.arac_secimi}}
    bicim = istek.yanit_bicimi
    if bicim is not None and yapili_kip != "kapali":
        if yapili_kip == "gbnf" and gbnf:
            govde["grammar"] = gbnf
        elif bicim.tur == "json" or yapili_kip == "json_nesne" or bicim.sema is None:
            govde["response_format"] = {"type": "json_object"}
        else:
            govde["response_format"] = {
                "type": "json_schema",
                "json_schema": {"name": bicim.ad, "strict": True, "schema": bicim.sema},
            }
    if akis:
        govde["stream"] = True
        govde["stream_options"] = {"include_usage": True}
    govde.update(istek.ek)
    return govde


# ----------------------------------------------------------------------------- yanıt


def icerik_metni(icerik: Any) -> str:
    """`content` alanını düz metne çevirir (None, dizgi ya da parça listesi olabilir)."""
    if icerik is None:
        return ""
    if isinstance(icerik, str):
        return icerik
    if isinstance(icerik, list):
        parcalar = [p.get("text", "") if isinstance(p, dict) else str(p) for p in icerik]
        return "".join(str(p) for p in parcalar)
    if isinstance(icerik, dict):
        return str(icerik.get("text", ""))
    return str(icerik)


def arguman_coz(ham: Any) -> tuple[dict[str, Any], str | None]:
    """Araç argümanlarını sözlüğe çevirir; bozuk JSON onarılır. (sözlük, ham metin) döndürür."""
    if isinstance(ham, dict):
        return ham, None
    if ham is None or ham == "":
        return {}, None
    metin = str(ham)
    try:
        deger = json.loads(metin)
    except ValueError:
        deger = json_ayikla(metin).deger
    if isinstance(deger, str):  # iki kez kodlanmış argüman
        deger = json_ayikla(deger).deger
    return (deger if isinstance(deger, dict) else {}), metin


def _cagrilari_coz(mesaj: dict[str, Any]) -> list[AracCagrisi]:
    cagrilar: list[AracCagrisi] = []
    ham_liste = mesaj.get("tool_calls") or []
    if not ham_liste and isinstance(mesaj.get("function_call"), dict):
        ham_liste = [{"function": mesaj["function_call"]}]
    for sira, ham in enumerate(ham_liste):
        if not isinstance(ham, dict):
            continue
        islev = ham.get("function") if isinstance(ham.get("function"), dict) else ham
        ad = str(islev.get("name") or "")
        if not ad:
            continue
        argumanlar, ham_metin = arguman_coz(islev.get("arguments", islev.get("parameters")))
        cagrilar.append(
            AracCagrisi(
                kimlik=str(ham.get("id") or f"cagri_{sira + 1}"),
                ad=ad,
                argumanlar=argumanlar,
                ham_argumanlar=ham_metin,
            )
        )
    return cagrilar


def kullanim_coz(veri: dict[str, Any]) -> Kullanim:
    """`usage` (ya da llama.cpp `timings`, Ollama sayaçları) alanından kullanımı okur."""
    kullanim = veri.get("usage") if isinstance(veri.get("usage"), dict) else {}
    zamanlama = veri.get("timings") if isinstance(veri.get("timings"), dict) else {}
    girdi = (
        kullanim.get("prompt_tokens")
        or kullanim.get("input_tokens")
        or zamanlama.get("prompt_n")
        or veri.get("prompt_eval_count")
        or 0
    )
    cikti = (
        kullanim.get("completion_tokens")
        or kullanim.get("output_tokens")
        or zamanlama.get("predicted_n")
        or veri.get("eval_count")
        or 0
    )
    return Kullanim(girdi_belirteci=int(girdi), cikti_belirteci=int(cikti))


def bitis_coz(ham: Any, cagri_var: bool, metin_var: bool) -> BitisNedeni:
    """`finish_reason` değerini ortak bitiş nedenine çevirir."""
    if cagri_var:
        return "arac"
    if isinstance(ham, str) and ham in _BITIS:
        return _BITIS[ham]
    return "bitti" if metin_var or ham is None else "diger"


def yanit_coz(veri: dict[str, Any], dusunce_ayikla: bool = True) -> Yanit:
    """Akışsız `/chat/completions` yanıtını `Yanit`'a çevirir."""
    hata_denetle(veri)
    secenekler = veri.get("choices")
    if isinstance(secenekler, list) and secenekler and isinstance(secenekler[0], dict):
        ilk = secenekler[0]
        mesaj = ilk.get("message") or ilk.get("delta") or {}
        if not mesaj and "text" in ilk:  # eski /completions biçimi
            mesaj = {"content": ilk["text"]}
        ham_bitis = ilk.get("finish_reason")
    elif isinstance(veri.get("message"), dict):  # Ollama yerel biçimi
        mesaj = veri["message"]
        ham_bitis = veri.get("done_reason")
    else:
        raise SaglayiciHatasi(
            "Sunucu yanıtı beklenen biçimde değil (`choices` yok). Adresin OpenAI uyumlu bir "
            "`/v1` ucu olduğunu denetleyin.",
            govde=json.dumps(veri, ensure_ascii=False)[:500],
        )
    metin = icerik_metni(mesaj.get("content"))
    dusunce = icerik_metni(mesaj.get("reasoning_content") or mesaj.get("reasoning"))
    if dusunce_ayikla:
        metin, etiketli = dusunce_ayir(metin)
        dusunce = dusunce or etiketli
    cagrilar = _cagrilari_coz(mesaj)
    return Yanit(
        metin=metin,
        arac_cagrilari=cagrilar,
        bitis_nedeni=bitis_coz(ham_bitis, bool(cagrilar), bool(metin)),
        kullanim=kullanim_coz(veri),
        model=str(veri.get("model") or ""),
        dusunce=dusunce,
    )


def hata_denetle(veri: dict[str, Any]) -> None:
    """200 koduyla gelen gövdede `error` varsa hataya çevirir (bazı vekiller böyle yapar)."""
    hata = veri.get("error")
    if hata:
        ileti = hata.get("message") if isinstance(hata, dict) else str(hata)
        raise SaglayiciHatasi(f"Sunucu hata bildirdi: {ileti}", govde=str(hata)[:500])


# ----------------------------------------------------------------------------- akış


class AkisBiriktirici:
    """Akış parçalarını (chunk) biriktirip sonunda tam `Yanit` üretir."""

    def __init__(self, dusunce_ayikla: bool = True) -> None:
        self._metin: list[str] = []
        self._dusunce: list[str] = []
        self._cagrilar: dict[int, dict[str, Any]] = {}
        self._bitis: Any = None
        self._kullanim = Kullanim()
        self._model = ""
        self._ayirici = DusunceAyirici() if dusunce_ayikla else None

    def ekle(self, veri: dict[str, Any]) -> AkisParcasi | None:
        """Bir parçayı işler; kullanıcıya gösterilecek yeni metin varsa `AkisParcasi` döndürür."""
        hata_denetle(veri)
        self._model = str(veri.get("model") or self._model)
        yeni = kullanim_coz(veri)
        if yeni.toplam:
            self._kullanim = yeni
        secenekler = veri.get("choices")
        if isinstance(secenekler, list) and secenekler and isinstance(secenekler[0], dict):
            ilk = secenekler[0]
            delta = ilk.get("delta") or ilk.get("message") or {}
            self._bitis = ilk.get("finish_reason") or self._bitis
        elif isinstance(veri.get("message"), dict):  # Ollama yerel NDJSON
            delta = veri["message"]
            self._bitis = veri.get("done_reason") or self._bitis
        else:
            return None
        self._cagrilari_biriktir(delta)
        dusunce = icerik_metni(delta.get("reasoning_content") or delta.get("reasoning"))
        metin = icerik_metni(delta.get("content"))
        if self._ayirici is not None and metin:
            metin, etiketli = self._ayirici.besle(metin)
            dusunce += etiketli
        return self._parca(metin, dusunce)

    def _parca(self, metin: str, dusunce: str) -> AkisParcasi | None:
        if metin:
            self._metin.append(metin)
        if dusunce:
            self._dusunce.append(dusunce)
        return AkisParcasi(metin=metin, dusunce=dusunce) if metin or dusunce else None

    def _cagrilari_biriktir(self, delta: dict[str, Any]) -> None:
        for ham in delta.get("tool_calls") or []:
            if not isinstance(ham, dict):
                continue
            sira = ham.get("index")
            if not isinstance(sira, int):
                kimlikler = [c["id"] for c in self._cagrilar.values()]
                yeni_mi = bool(ham.get("id")) and ham["id"] not in kimlikler
                sira = len(self._cagrilar) if yeni_mi or not self._cagrilar else len(self._cagrilar) - 1
            kayit = self._cagrilar.setdefault(sira, {"id": "", "ad": "", "arg": ""})
            islev = ham.get("function") if isinstance(ham.get("function"), dict) else {}
            kayit["id"] = kayit["id"] or str(ham.get("id") or "")
            kayit["ad"] = kayit["ad"] or str(islev.get("name") or "")
            parca = islev.get("arguments")
            if isinstance(parca, dict):
                kayit["arg"] = parca
            elif isinstance(parca, str) and not isinstance(kayit["arg"], dict):
                kayit["arg"] += parca

    def bitir(self) -> tuple[AkisParcasi | None, Yanit]:
        """Akış bitti: (tamponda kalan son metin parçası, tam yanıt) döndürür."""
        son_parca: AkisParcasi | None = None
        if self._ayirici is not None:
            metin, dusunce = self._ayirici.bitir()
            son_parca = self._parca(metin, dusunce)
        cagrilar: list[AracCagrisi] = []
        for sira in sorted(self._cagrilar):
            kayit = self._cagrilar[sira]
            if not kayit["ad"]:
                continue
            argumanlar, ham = arguman_coz(kayit["arg"])
            kimlik = kayit["id"] or f"cagri_{sira + 1}"
            cagrilar.append(
                AracCagrisi(kimlik=kimlik, ad=kayit["ad"], argumanlar=argumanlar, ham_argumanlar=ham)
            )
        metin = "".join(self._metin)
        yanit = Yanit(
            metin=metin,
            arac_cagrilari=cagrilar,
            bitis_nedeni=bitis_coz(self._bitis, bool(cagrilar), bool(metin)),
            kullanim=self._kullanim,
            model=self._model,
            dusunce="".join(self._dusunce).strip(),
        )
        return son_parca, yanit

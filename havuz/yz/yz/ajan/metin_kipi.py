"""Metin tabanlı (ReAct benzeri) araç kullanımı: yerel araç çağrısı olmayan modeller için.

Model şu biçimde yazar:  Düşünce: … / Eylem: <araç> / Girdi: {json}   ya da   Yanıt: …
Ayrıştırıcı hoşgörülüdür; şunları da tanır:
    - İngilizce etiketler (Thought/Action/Action Input/Final Answer), kalın/başlık süsleri,
    - <tool_call>{"name": …, "arguments": …}</tool_call> (Qwen/Hermes biçimi),
    - yalnız JSON: {"arac": "hesapla", "girdi": {...}} ya da {"name": …, "arguments": …},
    - işlev biçimi: hesapla("2+2") ya da hesapla(ifade="2+2"),
    - modelin kendi uydurduğu "Gözlem:" satırı ve sonrası atılır,
    - araç adındaki küçük yazım farkları (Hesapla, `hesapla`) giderilir.
Kim kullanır: ajan/dongu.py.
Genişletme: yeni bir biçim gördüğünüzde önce tests/test_ajan_metin.py'ye gerçek örneği ekleyin,
sonra `coz` içine yeni bir adım yazın.
"""

from __future__ import annotations

import ast
import re
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any, Literal

from yz.metin import sadelestir
from yz.saglayici.tipler import AracTanimi
from yz.yapili.json_onar import json_ayikla
from yz.yapili.sema_araclari import tip_aciklamasi

_ETIKETLER: dict[str, tuple[str, ...]] = {
    "dusunce": ("düşünce", "dusunce", "thought", "thinking"),
    "girdi": (
        "eylem girdisi",
        "action input",
        "girdi",
        "input",
        "argümanlar",
        "arguments",
        "parametreler",
    ),
    "eylem": ("eylem", "action", "araç", "arac", "tool"),
    "yanit": ("nihai yanıt", "final answer", "yanıt", "yanit", "cevap", "answer", "sonuç"),
}
_ETIKET_RE = re.compile(
    r"^[ \t>*_#-]*("
    + "|".join(re.escape(e) for es in _ETIKETLER.values() for e in es)
    + r")[ \t*_]*[:：][ \t*_]*",
    re.IGNORECASE | re.MULTILINE,
)
_GOZLEM = re.compile(
    r"^[ \t>*_#-]*(gözlem|gozlem|observation)[ \t*_]*[:：]", re.IGNORECASE | re.MULTILINE
)
_TOOL_CALL = re.compile(r"<tool_call>(.*?)(?:</tool_call>|\Z)", re.DOTALL)
_DUSUNCE_BLOGU = re.compile(r"<think>.*?(?:</think>|\Z)", re.DOTALL)
_ISLEV = re.compile(r"^\s*`*([A-Za-z_]\w*)\s*\((.*)\)\s*`*\s*$", re.DOTALL)


@dataclass
class MetinKarari:
    """Modelin metninden çıkarılan karar."""

    tur: Literal["eylem", "yanit", "belirsiz"]
    arac: str = ""
    girdi: dict[str, Any] = field(default_factory=dict)
    yanit: str = ""
    dusunce: str = ""
    notlar: list[str] = field(default_factory=list)


def araclari_yaz(tanimlar: Sequence[AracTanimi], dil: str = "tr") -> str:
    """Araçları istem için kısa satırlar hâlinde yazar."""
    satirlar = []
    for t in tanimlar:
        ozellikler = t.parametreler.get("properties") or {}
        alanlar = ", ".join(
            f'"{ad}": {tip_aciklamasi(alt, t.parametreler, dil)}' for ad, alt in ozellikler.items()
        )
        satirlar.append(f"- {t.ad}: {t.aciklama} Girdi: {{{alanlar}}}")
    return "\n".join(satirlar)


def _etiket_turu(etiket: str) -> str:
    # sadelestir: "Action Input" Türkçe küçük harfte "action ınput" olurdu; sade biçim ikisini eşler.
    sade = sadelestir(etiket)
    return next(tur for tur, adlar in _ETIKETLER.items() if sade in {sadelestir(a) for a in adlar})


def _arac_adi_bul(ham: str, adlar: Sequence[str]) -> str | None:
    aday = re.sub(r"[`*\"'\[\]]", "", ham).strip().split("(")[0].split()[0] if ham.strip() else ""
    if aday in adlar:
        return aday
    sade = {sadelestir(a): a for a in adlar}
    return sade.get(sadelestir(aday))


def _islev_cagrisi(metin: str, tanimlar: Sequence[AracTanimi]) -> tuple[str, dict[str, Any]] | None:
    """`hesapla("2+2")` / `hesapla(ifade="2+2")` biçimini çözer (yalnız sabit değerler)."""
    eslesme = _ISLEV.match(metin)
    if eslesme is None:
        return None
    adlar = [t.ad for t in tanimlar]
    ad = _arac_adi_bul(eslesme.group(1), adlar)
    if ad is None:
        return None
    try:
        cagri = ast.parse(f"f({eslesme.group(2)})", mode="eval").body
        assert isinstance(cagri, ast.Call)
        konumsal = [ast.literal_eval(a) for a in cagri.args]
        anahtarli = {k.arg: ast.literal_eval(k.value) for k in cagri.keywords if k.arg}
    except (SyntaxError, ValueError, AssertionError):
        return None
    tanim = next(t for t in tanimlar if t.ad == ad)
    parametre_adlari = list((tanim.parametreler.get("properties") or {}).keys())
    anahtarli.update(dict(zip(parametre_adlari, konumsal, strict=False)))
    return ad, anahtarli


def _json_cagrisi(deger: Any, adlar: Sequence[str]) -> tuple[str, dict[str, Any]] | None:
    if not isinstance(deger, dict):
        return None
    ad_ham = next(
        (deger[k] for k in ("arac", "araç", "name", "tool", "action", "eylem") if k in deger), None
    )
    if not isinstance(ad_ham, str):
        return None
    ad = _arac_adi_bul(ad_ham, adlar)
    if ad is None:
        return None
    girdi: Any = next(
        (
            deger[k]
            for k in ("girdi", "arguments", "parameters", "input", "action_input", "argumanlar")
            if k in deger
        ),
        {},
    )
    if isinstance(girdi, str):
        girdi = json_ayikla(girdi).deger or {}
    return ad, girdi if isinstance(girdi, dict) else {}


def _bolumler(metin: str) -> list[tuple[str, str]]:
    """Metni (etiket türü, içerik) bölümlerine ayırır."""
    eslesmeler = list(_ETIKET_RE.finditer(metin))
    bolumler = []
    for i, m in enumerate(eslesmeler):
        son = eslesmeler[i + 1].start() if i + 1 < len(eslesmeler) else len(metin)
        bolumler.append((_etiket_turu(m.group(1)), metin[m.end() : son].strip()))
    return bolumler


def coz(metin: str, tanimlar: Sequence[AracTanimi]) -> MetinKarari:
    """Model metnini eylem / yanıt / belirsiz kararına çevirir."""
    adlar = [t.ad for t in tanimlar]
    notlar: list[str] = []
    temiz = _DUSUNCE_BLOGU.sub("", metin)
    gozlem = _GOZLEM.search(temiz)
    if gozlem:
        temiz = temiz[: gozlem.start()]
        notlar.append("uydurma_gozlem_atildi")
    for parca in _TOOL_CALL.findall(temiz):
        bulunan = _json_cagrisi(json_ayikla(parca).deger, adlar)
        if bulunan:
            return MetinKarari(
                "eylem", bulunan[0], bulunan[1], notlar=[*notlar, "tool_call_etiketi"]
            )
    bolumler = _bolumler(temiz)
    dusunce = next((icerik for tur, icerik in bolumler if tur == "dusunce"), "")
    eylem = next((icerik for tur, icerik in bolumler if tur == "eylem"), None)
    if eylem is not None:
        islev = _islev_cagrisi(eylem, tanimlar)
        if islev:
            return MetinKarari(
                "eylem", islev[0], islev[1], dusunce=dusunce, notlar=[*notlar, "islev_bicimi"]
            )
        ad = _arac_adi_bul(eylem, adlar)
        if ad is not None:
            girdi_metni = next((icerik for tur, icerik in bolumler if tur == "girdi"), "")
            girdi: Any = json_ayikla(girdi_metni or eylem).deger
            if not isinstance(girdi, dict):
                girdi = {}
                if (
                    girdi_metni
                    and len(tanimlar[adlar.index(ad)].parametreler.get("properties") or {}) == 1
                ):
                    tek = next(iter(tanimlar[adlar.index(ad)].parametreler["properties"]))
                    girdi = {tek: girdi_metni.strip().strip("`\"'")}
                    notlar.append("duz_metin_girdi")
            return MetinKarari("eylem", ad, girdi, dusunce=dusunce, notlar=notlar)
        ham_ad = re.sub(r"[`*\"'\[\]]", "", eylem).strip().split("(")[0].split()
        if ham_ad:  # bilinmeyen araç: kutu, kullanılabilir araçları listeleyen bir gözlem döndürür
            girdi_metni = next((icerik for tur, icerik in bolumler if tur == "girdi"), "")
            girdi_degeri = json_ayikla(girdi_metni).deger if girdi_metni else {}
            return MetinKarari(
                "eylem",
                ham_ad[0][:64],
                girdi_degeri if isinstance(girdi_degeri, dict) else {},
                dusunce=dusunce,
                notlar=[*notlar, "bilinmeyen_arac"],
            )
    yanit = next((icerik for tur, icerik in bolumler if tur == "yanit"), None)
    if yanit:
        return MetinKarari("yanit", yanit=yanit, dusunce=dusunce, notlar=notlar)
    duz = temiz.strip()
    islev = _islev_cagrisi(duz, tanimlar)
    if islev:
        return MetinKarari("eylem", islev[0], islev[1], notlar=[*notlar, "islev_bicimi"])
    ayiklama = json_ayikla(duz)
    if ayiklama.bulundu:
        bulunan = _json_cagrisi(ayiklama.deger, adlar)
        if bulunan:
            return MetinKarari("eylem", bulunan[0], bulunan[1], notlar=[*notlar, "json_cagrisi"])
    if duz and not bolumler:
        return MetinKarari("yanit", yanit=duz, notlar=[*notlar, "etiketsiz_yanit"])
    return MetinKarari("belirsiz", dusunce=dusunce, notlar=notlar)

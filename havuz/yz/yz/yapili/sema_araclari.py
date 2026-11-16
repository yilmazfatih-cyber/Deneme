"""JSON şeması yardımcıları: küçük model için alan listesi/iskelet, değer düzeltme, hata özeti.

    alan_listesi(sema)    "- toplam (sayı): Faturanın toplamı" satırları (insan dilinde şema)
    iskelet(sema)         {"toplam": 0.0, ...} örnek çıktı (küçük modeller örneği taklit eder)
    sema_ile_duzelt(...)  doğrulamadan önce yaygın kusurları giderir: anahtar adı farkı
                          ("Toplam Tutar" → "toplam_tutar"), Türkçe sayı ("1.250,50" → 1250.5),
                          "evet"/"hayır" → true/false, tek öğe → liste, gereksiz sarmalayıcı.
    hatalari_ozetle(...)  Pydantic hatasını modele geri verilecek kısa listeye çevirir.
Kim kullanır: yapili/cikar.py, arac/tanim.py (argüman düzeltme).
Genişletme: yeni bir düzeltme → `_deger_duzelt` içine dal ekleyip notunu yazın.
"""

from __future__ import annotations

import json
import re
from typing import Any

from pydantic import ValidationError

from yz.metin import kucuk_tr, sadelestir

_TIP_ADI = {
    "tr": {"string": "metin", "integer": "tam sayı", "number": "sayı", "boolean": "true/false",
           "array": "liste", "object": "nesne", "null": "null"},
    "en": {"string": "text", "integer": "integer", "number": "number", "boolean": "true/false",
           "array": "list", "object": "object", "null": "null"},
}  # fmt: skip
_EVET = {"evet", "doğru", "var", "true", "yes", "e", "1", "açık", "aktif", "ödendi"}
_HAYIR = {"hayır", "yanlış", "yok", "false", "no", "h", "0", "kapalı", "pasif", "ödenmedi"}
_TR_SAYI = re.compile(r"[-+]?\d[\d.,]*\d|[-+]?\d")


def coz(sema: dict[str, Any], kok: dict[str, Any]) -> dict[str, Any]:
    """`$ref` ve tek öğeli `allOf` başvurularını çözer."""
    gorulen = 0
    while gorulen < 20:
        gorulen += 1
        if "$ref" in sema:
            hedef: Any = kok
            for parca in str(sema["$ref"]).removeprefix("#/").split("/"):
                hedef = hedef.get(parca, {}) if isinstance(hedef, dict) else {}
            sema = {**hedef, **{k: v for k, v in sema.items() if k != "$ref"}}
        elif isinstance(sema.get("allOf"), list) and len(sema["allOf"]) == 1:
            sema = {**sema["allOf"][0], **{k: v for k, v in sema.items() if k != "allOf"}}
        else:
            break
    return sema


def null_disi(sema: dict[str, Any], kok: dict[str, Any]) -> tuple[dict[str, Any], bool]:
    """`X | None` biçimindeki şemadan X'i ve boş bırakılabilir mi bilgisini çıkarır."""
    sema = coz(sema, kok)
    secenekler = sema.get("anyOf") or sema.get("oneOf")
    if isinstance(secenekler, list):
        dolu = [coz(s, kok) for s in secenekler if coz(s, kok).get("type") != "null"]
        if len(dolu) == 1 and len(dolu) < len(secenekler):
            return {
                **dolu[0],
                **{k: v for k, v in sema.items() if k not in ("anyOf", "oneOf")},
            }, True
    return sema, sema.get("type") == "null"


def tip_aciklamasi(sema: dict[str, Any], kok: dict[str, Any], dil: str = "tr") -> str:
    """Şemanın insan dilinde kısa tipi: "sayı", "şunlardan biri: A, B", "liste: metin"."""
    sema, bos_olabilir = null_disi(sema, kok)
    adlar = _TIP_ADI.get(dil, _TIP_ADI["tr"])
    if "enum" in sema:
        birisi = "şunlardan biri" if dil == "tr" else "one of"
        metin = f"{birisi}: " + ", ".join(json.dumps(d, ensure_ascii=False) for d in sema["enum"])
    elif "const" in sema:
        metin = json.dumps(sema["const"], ensure_ascii=False)
    elif sema.get("type") == "string" and sema.get("format") in ("date", "date-time"):
        metin = "tarih YYYY-AA-GG" if dil == "tr" else "date YYYY-MM-DD"
    elif sema.get("type") == "array":
        ogeler = sema.get("items") if isinstance(sema.get("items"), dict) else {}
        metin = (
            f"{adlar['array']}: {tip_aciklamasi(ogeler, kok, dil)}" if ogeler else adlar["array"]
        )
    elif sema.get("type") == "object" and isinstance(sema.get("properties"), dict):
        icerik = ", ".join(
            f"{ad} ({tip_aciklamasi(alt, kok, dil)})" for ad, alt in sema["properties"].items()
        )
        metin = f"{adlar['object']} {{{icerik}}}"
    else:
        metin = adlar.get(str(sema.get("type")), "değer" if dil == "tr" else "value")
    if bos_olabilir:
        metin += ", yoksa null" if dil == "tr" else ", or null"
    return metin


def alan_listesi(sema: dict[str, Any], dil: str = "tr") -> str:
    """Üst düzey alanları açıklamalarıyla satır satır yazar."""
    kok = sema
    sema = coz(sema, kok)
    satirlar = []
    for ad, alt in (sema.get("properties") or {}).items():
        alt_cozuk = coz(alt, kok) if isinstance(alt, dict) else {}
        aciklama = alt_cozuk.get("description") or alt.get("description", "")
        tip = tip_aciklamasi(alt if isinstance(alt, dict) else {}, kok, dil)
        satirlar.append(f"- {ad} ({tip})" + (f": {aciklama}" if aciklama else ""))
    return "\n".join(satirlar)


def _ornek_deger(sema: dict[str, Any], kok: dict[str, Any], derinlik: int = 0) -> Any:
    sema, _ = null_disi(sema, kok)
    if "enum" in sema:
        return sema["enum"][0]
    if "const" in sema:
        return sema["const"]
    tip = sema.get("type")
    if tip == "object" and derinlik < 4:
        return {
            ad: _ornek_deger(alt, kok, derinlik + 1)
            for ad, alt in (sema.get("properties") or {}).items()
            if isinstance(alt, dict)
        }
    if tip == "array" and derinlik < 4:
        ogeler = sema.get("items")
        return [_ornek_deger(ogeler, kok, derinlik + 1)] if isinstance(ogeler, dict) else []
    if tip == "string":
        return "YYYY-AA-GG" if sema.get("format") == "date" else "..."
    return {"integer": 0, "number": 0.0, "boolean": False}.get(str(tip))


def iskelet(sema: dict[str, Any]) -> str:
    """Şemaya uyan örnek iskelet JSON (değerler yer tutucudur)."""
    return json.dumps(_ornek_deger(sema, sema), ensure_ascii=False)


def tum_sayilar(metin: str) -> list[float]:
    """Metindeki bütün sayılar, geçtikleri sırayla (her biri `turkce_sayi` kuralıyla okunur)."""
    temiz = metin.replace("\u00a0", " ")
    sonuc = []
    for eslesme in _TR_SAYI.finditer(temiz):
        deger = turkce_sayi(eslesme.group())
        if deger is not None:
            sonuc.append(deger)
    return sonuc


def turkce_sayi(metin: str) -> float | None:
    """Metindeki ilk sayıyı okur: "1.250,50 TL" → 1250.5; "$1,240.00" → 1240.0; "%18" → 18.0.

    Kural: iki ayraç birden varsa SONDAKİ ondalık ayracıdır. Tek ayraç varsa Türkçe okunur:
    "1.250" bin iki yüz elli, "12,5" on iki buçuk. Sayı yoksa None.
    """
    eslesme = _TR_SAYI.search(metin.replace(" ", "").replace("\u00a0", ""))
    if eslesme is None:
        return None
    ham = eslesme.group()
    if "," in ham and "." in ham:
        ham = (
            ham.replace(".", "").replace(",", ".")
            if ham.rfind(",") > ham.rfind(".")
            else ham.replace(",", "")
        )
    elif "," in ham:
        ham = ham.replace(",", ".")
    elif re.fullmatch(r"[-+]?\d{1,3}(?:\.\d{3})+", ham):
        ham = ham.replace(".", "")
    try:
        return float(ham)
    except ValueError:
        return None


_AYLAR = ("ocak", "şubat", "mart", "nisan", "mayıs", "haziran", "temmuz", "ağustos", "eylül",
          "ekim", "kasım", "aralık")  # fmt: skip


def tarih_iso(metin: str) -> str | None:
    """ "15.03.2024", "15/03/2024", "15 Mart 2024" → "2024-03-15"; tanınmazsa None."""
    duz = metin.strip()
    eslesme = re.fullmatch(r"(\d{1,2})[./-](\d{1,2})[./-](\d{4})", duz)
    if eslesme:
        gun, ay, yil = int(eslesme[1]), int(eslesme[2]), int(eslesme[3])
    else:
        eslesme = re.fullmatch(r"(\d{1,2})\s+([^\W\d_]+)\s+(\d{4})", duz)
        if not eslesme or kucuk_tr(eslesme[2]) not in _AYLAR:
            return None
        gun, ay, yil = int(eslesme[1]), _AYLAR.index(kucuk_tr(eslesme[2])) + 1, int(eslesme[3])
    if not (1 <= ay <= 12 and 1 <= gun <= 31):
        return None
    return f"{yil:04d}-{ay:02d}-{gun:02d}"


def _deger_duzelt(deger: Any, sema: dict[str, Any], kok: dict[str, Any], notlar: list[str]) -> Any:
    sema, bos_olabilir = null_disi(sema, kok)
    tip = sema.get("type")
    if tip == "string" and sema.get("format") == "date" and isinstance(deger, str):
        iso = tarih_iso(deger)
        if iso is not None:
            notlar.append("tarih_bicimi")
            return iso
    if (
        isinstance(deger, str)
        and bos_olabilir
        and kucuk_tr(deger.strip()) in {"", "yok", "null", "none", "-", "bilinmiyor"}
    ):
        notlar.append("bos_deger_null")
        return None
    if tip in ("number", "integer") and isinstance(deger, str):
        sayi = turkce_sayi(deger)
        if sayi is not None:
            notlar.append("turkce_sayi")
            return int(sayi) if tip == "integer" and sayi.is_integer() else sayi
    if tip == "boolean" and isinstance(deger, str):
        kucuk = kucuk_tr(deger.strip())
        if kucuk in _EVET or kucuk in _HAYIR:
            notlar.append("evet_hayir")
            return kucuk in _EVET
    if tip == "string" and isinstance(deger, int | float) and not isinstance(deger, bool):
        notlar.append("sayi_metne")
        return str(deger)
    if "enum" in sema and isinstance(deger, str) and deger not in sema["enum"]:
        for secenek in sema["enum"]:
            if isinstance(secenek, str) and sadelestir(secenek) == sadelestir(deger):
                notlar.append("enum_esleme")
                return secenek
    if tip == "array":
        if deger is not None and not isinstance(deger, list):
            notlar.append("tek_oge_liste")
            deger = [deger]
        ogeler = sema.get("items")
        if isinstance(deger, list) and isinstance(ogeler, dict):
            return [_deger_duzelt(o, ogeler, kok, notlar) for o in deger]
    if tip == "object" and isinstance(deger, dict) and isinstance(sema.get("properties"), dict):
        return _nesne_duzelt(deger, sema, kok, notlar)
    return deger


def _nesne_duzelt(
    deger: dict[str, Any], sema: dict[str, Any], kok: dict[str, Any], notlar: list[str]
) -> dict[str, Any]:
    ozellikler: dict[str, Any] = sema.get("properties") or {}
    sade = {sadelestir(ad): ad for ad in ozellikler}
    sonuc: dict[str, Any] = {}
    for anahtar, icerik in deger.items():
        hedef = anahtar if anahtar in ozellikler else sade.get(sadelestir(str(anahtar)))
        if hedef is None:
            sonuc[anahtar] = icerik
            continue
        if hedef != anahtar:
            notlar.append("anahtar_esleme")
        if hedef not in sonuc:
            sonuc[hedef] = _deger_duzelt(icerik, ozellikler[hedef], kok, notlar)
    return sonuc


def sema_ile_duzelt(deger: Any, sema: dict[str, Any]) -> tuple[Any, list[str]]:
    """Doğrulamadan önce yaygın küçük-model kusurlarını şemaya bakarak düzeltir."""
    notlar: list[str] = []
    kok = sema
    ust = coz(sema, kok)
    ozellikler = ust.get("properties") or {}
    if isinstance(deger, list) and ust.get("type") == "object" and len(deger) == 1:
        deger = deger[0]
        notlar.append("liste_acildi")
    if (
        isinstance(deger, dict)
        and len(deger) == 1
        and ozellikler
        and next(iter(deger)) not in ozellikler
        and isinstance(next(iter(deger.values())), dict)
    ):
        ic = next(iter(deger.values()))
        sade = {sadelestir(a) for a in ozellikler}
        if sum(sadelestir(str(a)) in sade for a in ic) > 0:
            deger = ic
            notlar.append("sarmalayici_acildi")
    sonuc = _deger_duzelt(deger, sema, kok, notlar)
    return sonuc, list(dict.fromkeys(notlar))


def refleri_ac(sema: dict[str, Any], derinlik: int = 6) -> dict[str, Any]:
    """`$ref` başvurularını yerine koyar ve `$defs`'i atar (bazı sunucular $ref anlamaz).

    Özyinelemeli şemada `derinlik` kadar açılır; daha derini serbest nesne olur.
    """
    kok = sema

    def ac(dugum: Any, kalan: int) -> Any:
        if isinstance(dugum, list):
            return [ac(o, kalan) for o in dugum]
        if not isinstance(dugum, dict):
            return dugum
        if "$ref" in dugum:
            if kalan <= 0:
                return {"type": "object"}
            return ac(coz(dugum, kok), kalan - 1)
        return {k: ac(v, kalan) for k, v in dugum.items() if k not in ("$defs", "definitions")}

    sonuc: dict[str, Any] = ac(sema, derinlik)
    return sonuc


# Pydantic hata türü → modele söylenecek kısa, eyleme dönük ileti (küçük modeller İngilizce teknik
# iletiyi çoğu zaman anlamaz; gerçek deneme: docs/GERCEK_MODEL_DENEMESI.md).
_ILETILER: dict[str, tuple[str, str]] = {
    "missing": ("eksik alan; ekleyin (yoksa null)", "missing field; add it (null if unknown)"),
    "extra_forbidden": ("şemada olmayan alan; silin", "not in the schema; remove it"),
    "date_from_datetime_parsing": (
        "tarih YYYY-AA-GG biçiminde olmalı, ör. 2024-03-15",
        "date must be YYYY-MM-DD",
    ),
    "date_parsing": (
        "tarih YYYY-AA-GG biçiminde olmalı, ör. 2024-03-15",
        "date must be YYYY-MM-DD",
    ),
    "float_parsing": (
        "yalnız sayı yazın, ör. 1250.5 (birim ya da para işareti yok)",
        "write a plain number",
    ),
    "int_parsing": ("yalnız tam sayı yazın, ör. 3", "write a whole number"),
    "int_from_float": ("tam sayı olmalı, ör. 3", "must be a whole number"),
    "bool_parsing": ("true ya da false yazın", "write true or false"),
    "string_type": ("tırnak içinde metin yazın", "write a quoted string"),
    "list_type": ("liste olmalı: [ ... ]", "must be a list: [ ... ]"),
}


def hatalari_ozetle(hata: ValidationError, azami: int = 8, dil: str = "tr") -> str:
    """Pydantic hatalarını modele geri verilecek kısa, eyleme dönük satırlara çevirir."""
    satirlar: list[str] = []
    for ayrinti in hata.errors()[:azami]:
        yer = ".".join(str(p) for p in ayrinti["loc"]) or ("(kök)" if dil == "tr" else "(root)")
        girdi = json.dumps(ayrinti.get("input"), ensure_ascii=False, default=str)[:60]
        gelen = "gelen" if dil == "tr" else "got"
        if ayrinti["type"] in _ILETILER:
            tr, en = _ILETILER[ayrinti["type"]]
            ileti = tr if dil == "tr" else en
            if ayrinti["type"] != "missing":
                ileti += f" ({gelen}: {girdi})"
        elif ayrinti["type"] == "literal_error":
            beklenen = (ayrinti.get("ctx") or {}).get("expected", "")
            ileti = (
                f"yalnız şunlardan biri: {beklenen}" if dil == "tr" else f"only one of: {beklenen}"
            ) + f" ({gelen}: {girdi})"
        else:
            ileti = f"{ayrinti['msg']} ({gelen}: {girdi})"
        satirlar.append(f"- {yer}: {ileti}")
    fazla = len(hata.errors()) - azami
    if fazla > 0:
        satirlar.append(f"- … ve {fazla} hata daha" if dil == "tr" else f"- … and {fazla} more")
    return "\n".join(satirlar)

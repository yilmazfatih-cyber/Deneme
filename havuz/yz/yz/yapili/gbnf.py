"""JSON şemasından GBNF dilbilgisi üretir (llama.cpp'nin `grammar` alanı için).

GBNF ile model yalnız şemaya uyan karakterleri üretebilir; bozuk JSON olanaksızlaşır.
Küçük modeller için bilinçli sadeleştirmeler:
    - Nesnenin BÜTÜN alanları, şemadaki sırayla zorunludur (isteğe bağlı alan yok; boş
      kalabilecek alan için tipi `X | None` yapın — model `null` yazar).
    - Boşluk sınırlıdır (`ws` en çok bir boşluk): sonsuz satır sonu döngüsü oluşamaz.
    - `minLength`, `pattern`, `minimum` gibi kısıtlar dilbilgisine YANSITILMAZ; onları Pydantic
      doğrulaması yakalar (yapili/cikar.py her katmandan sonra doğrular).
Desteklenenler: object, array (minItems ≥ 1), string (enum, const, format: date), integer,
number, boolean, null, anyOf/oneOf, tip listesi, $ref/$defs (özyinelemeli şemalar dahil).
Kim kullanır: saglayici/openai_uyumlu.py (`yapili_kip="gbnf"`); elle: `python -m yz cikar --gbnf`.
Genişletme: yeni bir şema özelliği → `_ifade` içine dal ekleyin; tests/test_gbnf.py'deki
eşleyiciyle geçerli/geçersiz örnekleri sınayın.
"""

from __future__ import annotations

import json
import re
from typing import Any

from yz.metin import sadelestir

_TEMEL_KURALLAR = {
    "ws": '" "?',
    "string": r'"\"" char* "\""',
    "char": r'[^"\\\x7F\x00-\x1F] | "\\" (["\\/bfnrt] | "u" hex hex hex hex)',
    "hex": "[0-9a-fA-F]",
    "integer": '"-"? ("0" | [1-9] [0-9]*)',
    "number": 'integer ("." [0-9]+)? ([eE] [-+]? [0-9]+)?',
    "boolean": '"true" | "false"',
    "null": '"null"',
    "date": r'"\"" [0-9] [0-9] [0-9] [0-9] "-" [0-9] [0-9] "-" [0-9] [0-9] "\""',
    "value": "object | array | string | number | boolean | null",
    "object": '"{" ws (string ws ":" ws value ("," ws string ws ":" ws value)*)? ws "}"',
    "array": '"[" ws (value ("," ws value)*)? ws "]"',
}
_BAGIMLILIK = {
    "string": ["char"],
    "char": ["hex"],
    "number": ["integer"],
    "value": ["object", "array", "string", "number", "boolean", "null"],
    "object": ["ws", "string", "value"],
    "array": ["ws", "value"],
}


def gbnf_sabit(metin: str) -> str:
    """Düz metni GBNF sabitine (tırnaklı terminal) çevirir."""
    kacisli = metin.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")
    return f'"{kacisli}"'


def _json_sabit(deger: Any) -> str:
    """Bir JSON değerinin (ör. enum öğesi) tam yazımını GBNF sabiti olarak verir."""
    return gbnf_sabit(json.dumps(deger, ensure_ascii=False))


class _Uretec:
    def __init__(self, kok: dict[str, Any]) -> None:
        self.kok = kok
        self.kurallar: dict[str, str] = {}
        self._ref_adlari: dict[str, str] = {}

    def _temel(self, ad: str) -> str:
        if ad not in self.kurallar:
            self.kurallar[ad] = _TEMEL_KURALLAR[ad]
            for bagimli in _BAGIMLILIK.get(ad, []):
                self._temel(bagimli)
        return ad

    def _yeni_ad(self, oneri: str) -> str:
        """Kural adı üretir: "FaturaKalemi" → "fatura-kalemi" (GBNF adları küçük harf ve tiredir)."""
        ayrik = re.sub(r"(?<=[a-zçğıöşü0-9])(?=[A-ZÇĞİÖŞÜ])", " ", oneri)
        parcalar = [sadelestir(p) for p in re.split(r"[^0-9A-Za-zÇĞİÖŞÜçğıöşü]+", ayrik)]
        taban = "-".join(p for p in parcalar if p) or "kural"
        if not taban[0].isalpha():
            taban = "k-" + taban
        ad, sayac = taban, 2
        while ad in self.kurallar or ad in _TEMEL_KURALLAR or ad == "root":
            ad, sayac = f"{taban}-{sayac}", sayac + 1
        return ad

    def _ref(self, ref: str) -> str:
        if ref in self._ref_adlari:
            return self._ref_adlari[ref]
        hedef: Any = self.kok
        for parca in ref.removeprefix("#/").split("/"):
            hedef = hedef.get(parca) if isinstance(hedef, dict) else None
        if not isinstance(hedef, dict):
            raise ValueError(f"Şemada çözülemeyen başvuru: {ref}")
        ad = self._yeni_ad(ref.rsplit("/", 1)[-1])
        self._ref_adlari[ref] = ad
        self.kurallar[ad] = ""  # adı ayır: özyinelemeli şema kendine başvurabilsin
        self.kurallar[ad] = self._ifade(hedef, ad)
        return ad

    def _ifade(self, sema: dict[str, Any], oneri: str) -> str:
        """Şema için bir GBNF ifadesi (kural adı ya da satır içi ifade) döndürür."""
        if "$ref" in sema:
            return self._ref(str(sema["$ref"]))
        if "const" in sema:
            return _json_sabit(sema["const"])
        if "enum" in sema:
            return "(" + " | ".join(_json_sabit(d) for d in sema["enum"]) + ")"
        for birlesim in ("anyOf", "oneOf"):
            if isinstance(sema.get(birlesim), list):
                secenekler = [self._ifade(s, f"{oneri}-{i}") for i, s in enumerate(sema[birlesim])]
                return "(" + " | ".join(dict.fromkeys(secenekler)) + ")"
        if isinstance(sema.get("allOf"), list) and len(sema["allOf"]) == 1:
            return self._ifade(sema["allOf"][0], oneri)
        tip = sema.get("type")
        if isinstance(tip, list):
            secenekler = [self._ifade({**sema, "type": t}, oneri) for t in tip]
            return "(" + " | ".join(dict.fromkeys(secenekler)) + ")"
        if tip == "object":
            return self._nesne(sema, oneri)
        if tip == "array":
            return self._dizi(sema, oneri)
        if tip == "string":
            return self._temel("date" if sema.get("format") == "date" else "string")
        if tip in ("integer", "number", "boolean", "null"):
            return self._temel(str(tip))
        return self._temel("value")  # tipi belirsiz: herhangi bir JSON değeri

    def _nesne(self, sema: dict[str, Any], oneri: str) -> str:
        ozellikler = sema.get("properties")
        if not isinstance(ozellikler, dict) or not ozellikler:
            return self._temel("object")
        self._temel("ws")
        parcalar: list[str] = []
        for anahtar, alt in ozellikler.items():
            alt_sema = alt if isinstance(alt, dict) else {}
            ifade = self._ifade(alt_sema, f"{oneri}-{anahtar}")
            parcalar.append(f'{_json_sabit(anahtar)} ws ":" ws {ifade}')
        return '"{" ws ' + ' "," ws '.join(parcalar) + ' ws "}"'

    def _dizi(self, sema: dict[str, Any], oneri: str) -> str:
        ogeler = sema.get("items")
        self._temel("ws")
        oge = self._ifade(ogeler, f"{oneri}-oge") if isinstance(ogeler, dict) else self._temel("value")
        if not re.fullmatch(r"[a-z][a-z0-9-]*", oge):  # satır içi ifadeyi adlandır
            ad = self._yeni_ad(f"{oneri}-oge")
            self.kurallar[ad] = oge
            oge = ad
        govde = f'{oge} ("," ws {oge})*'
        if int(sema.get("minItems") or 0) < 1:
            govde = f"({govde})?"
        return f'"[" ws {govde} ws "]"'


def semadan_gbnf(sema: dict[str, Any]) -> str:
    """JSON şemasını GBNF dilbilgisine çevirir; `root` kuralı şemanın tamamıdır."""
    uretec = _Uretec(sema)
    kok = uretec._ifade(sema, "kok")
    satirlar = [f"root ::= {kok}"]
    satirlar.extend(f"{ad} ::= {govde}" for ad, govde in uretec.kurallar.items())
    return "\n".join(satirlar) + "\n"

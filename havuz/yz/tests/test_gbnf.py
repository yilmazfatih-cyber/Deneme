"""GBNF üreteci testleri: üretilen dilbilgisi bağımsız bir eşleyiciyle sınanır.

Beklenti: şemaya uyan her örneğin JSON yazımı kabul edilir; uymayanlar reddedilir.
"""

import json
from datetime import date
from typing import Literal

import pytest
from pydantic import BaseModel

from tests.gbnf_esleyici import Dilbilgisi
from yz.yapili.gbnf import gbnf_sabit, semadan_gbnf


class Kalem(BaseModel):
    ad: str
    adet: int
    birim_fiyat: float


class Fatura(BaseModel):
    fatura_no: str
    tarih: date
    para_birimi: Literal["TRY", "USD", "EUR"]
    toplam: float
    odendi: bool
    not_: str | None = None
    kalemler: list[Kalem]


class Dugum(BaseModel):
    ad: str
    cocuklar: list["Dugum"] = []


def _yaz(deger: object) -> str:
    return json.dumps(deger, ensure_ascii=False)


def test_esleyicinin_kendisi_dogru_calisir():
    d = Dilbilgisi(
        'root ::= "a" [0-9]+ ("," ws [^x\\n])* k?\nws ::= " "?\nk ::= "\\"s\\"" | "son"\n'
    )
    for metin in ["a1", "a12,b", "a1, b,c", 'a9"s"', "a9son"]:
        assert d.eslesir(metin), metin
    for metin in ["", "a", "b1", "a1,x", "a1,,b", "a1son!", "a1,\n"]:
        assert not d.eslesir(metin), metin


def test_fatura_semasi_gecerli_ornekleri_kabul_eder():
    gbnf = semadan_gbnf(Fatura.model_json_schema())
    d = Dilbilgisi(gbnf)
    ornek = {
        "fatura_no": "A-2024/001",
        "tarih": "2024-03-15",
        "para_birimi": "TRY",
        "toplam": 1250.5,
        "odendi": False,
        "not_": None,
        "kalemler": [
            {"ad": 'Kalem "özel" baskı', "adet": 2, "birim_fiyat": 12.25},
            {"ad": "Defter\n", "adet": 1, "birim_fiyat": -3e2},
        ],
    }
    assert d.eslesir(_yaz(ornek))
    assert d.eslesir(json.dumps(ornek, separators=(",", ":")))  # boşluksuz yazım
    assert d.eslesir(_yaz({**ornek, "not_": "çğıöşü İI", "kalemler": []}))
    Fatura.model_validate(ornek)  # örneğin kendisi şemaya uyuyor


@pytest.mark.parametrize(
    "bozma",
    [
        lambda o: {**o, "para_birimi": "GBP"},  # enum dışı
        lambda o: {**o, "toplam": "1250"},  # sayı yerine dizgi
        lambda o: {**o, "tarih": "15.03.2024"},  # tarih biçimi
        lambda o: {**o, "odendi": "evet"},
        lambda o: {**o, "kalemler": [{"ad": "x", "adet": 1.5, "birim_fiyat": 1}]},  # tam sayı değil
        lambda o: {k: v for k, v in o.items() if k != "toplam"},  # eksik alan
        lambda o: {**o, "fazladan": 1},  # tanımsız alan
        lambda o: dict(reversed(list(o.items()))),  # alan sırası
    ],
)
def test_fatura_semasi_gecersiz_ornekleri_reddeder(bozma):
    d = Dilbilgisi(semadan_gbnf(Fatura.model_json_schema()))
    ornek = {
        "fatura_no": "1",
        "tarih": "2024-03-15",
        "para_birimi": "TRY",
        "toplam": 1.0,
        "odendi": True,
        "not_": None,
        "kalemler": [],
    }
    assert d.eslesir(_yaz(ornek))
    assert not d.eslesir(_yaz(bozma(ornek)))


def test_bozuk_json_yazimi_reddedilir():
    d = Dilbilgisi(semadan_gbnf(Kalem.model_json_schema()))
    assert d.eslesir('{"ad": "x", "adet": 1, "birim_fiyat": 2}')
    for bozuk in [
        '{"ad": "x", "adet": 1, "birim_fiyat": 2,}',
        "{'ad': 'x', 'adet': 1, 'birim_fiyat': 2}",
        '{"ad": "x", "adet": 01, "birim_fiyat": 2}',
        '{"ad": "x", "adet": 1, "birim_fiyat": 2',
        '```json\n{"ad": "x", "adet": 1, "birim_fiyat": 2}\n```',
        '{"ad": "x",\n\n\n\n "adet": 1, "birim_fiyat": 2}',  # sınırsız boşluk yok
        '{"ad": "satır\nsonu", "adet": 1, "birim_fiyat": 2}',  # ham denetim karakteri
    ]:
        assert not d.eslesir(bozuk), bozuk


def test_ozyinelemeli_sema():
    d = Dilbilgisi(semadan_gbnf(Dugum.model_json_schema()))
    agac = {"ad": "kök", "cocuklar": [{"ad": "a", "cocuklar": [{"ad": "b", "cocuklar": []}]}]}
    assert d.eslesir(_yaz(agac))
    assert not d.eslesir(_yaz({"ad": "kök", "cocuklar": [{"ad": 3, "cocuklar": []}]}))


def test_serbest_semalar_ve_ozel_durumlar():
    herhangi = Dilbilgisi(semadan_gbnf({}))
    for deger in [{"a": [1, "b", None, True, {"c": 1.5}]}, [], "düz", 3, None]:
        assert herhangi.eslesir(_yaz(deger))
    assert not herhangi.eslesir("{a: 1}")
    en_az_bir = Dilbilgisi(
        semadan_gbnf({"type": "array", "items": {"type": "integer"}, "minItems": 1})
    )
    assert en_az_bir.eslesir("[1, 2]") and not en_az_bir.eslesir("[]")
    cok_tipli = Dilbilgisi(semadan_gbnf({"type": ["string", "null"]}))
    assert cok_tipli.eslesir('"x"') and cok_tipli.eslesir("null") and not cok_tipli.eslesir("1")
    sabit = Dilbilgisi(semadan_gbnf({"const": "evet"}))
    assert sabit.eslesir('"evet"') and not sabit.eslesir('"hayır"')
    serbest_nesne = Dilbilgisi(semadan_gbnf({"type": "object"}))
    assert serbest_nesne.eslesir('{"x": 1}') and not serbest_nesne.eslesir("[1]")


def test_kural_adlari_gbnf_kuralina_uyar():
    sema = {
        "type": "object",
        "properties": {
            "Müşteri_Adı": {"$ref": "#/$defs/İletişimBilgisi"},
            "2.adres": {"type": "array", "items": {"enum": ["ev", "iş"]}},
        },
        "$defs": {
            "İletişimBilgisi": {"type": "object", "properties": {"e-posta": {"type": "string"}}}
        },
    }
    gbnf = semadan_gbnf(sema)
    for satir in gbnf.strip().splitlines():
        ad = satir.split("::=")[0].strip()
        assert ad == "root" or all(h.islower() or h.isdigit() or h == "-" for h in ad), ad
        assert ad.isascii() and ad[0].isalpha()
    assert "iletisim-bilgisi ::=" in gbnf
    d = Dilbilgisi(gbnf)
    assert d.eslesir(_yaz({"Müşteri_Adı": {"e-posta": "a@b.c"}, "2.adres": ["ev", "iş"]}))


def test_cozulemeyen_basvuru_hata_verir():
    with pytest.raises(ValueError, match="çözülemeyen başvuru"):
        semadan_gbnf({"$ref": "#/$defs/Yok"})


def test_gbnf_sabit_kacislari():
    assert gbnf_sabit('a"b\\c\nd') == '"a\\"b\\\\c\\nd"'

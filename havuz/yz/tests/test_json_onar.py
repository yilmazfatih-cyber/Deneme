"""JSON onarıcı testleri: küçük modellerin tipik bozuk çıktıları.

Her satır: (ad, model çıktısı, beklenen değer, görülmesi gereken onarım notları).
Yeni bir bozukluk gördüğünüzde önce buraya gerçek örneğini ekleyin, sonra onarıcıyı düzeltin.
Gerçek bir küçük modelden kaydedilmiş çıktılar: tests/veri/gercek_ciktilar.jsonl
(tests/test_gercek_ciktilar.py).
"""

import json

import pytest

from yz.yapili.json_onar import json_ayikla, json_coz

ORNEKLER = [
    ("temiz", '{"ad": "Ali", "yas": 30}', {"ad": "Ali", "yas": 30}, []),
    ("temiz_bosluklu", '\n  {"a": [1, 2, {"b": null}]}  \n', {"a": [1, 2, {"b": None}]}, []),
    (
        "kod_citi_json",
        'İşte sonuç:\n```json\n{"ad": "Ali", "yas": 30}\n```\nUmarım yardımcı olur!',
        {"ad": "Ali", "yas": 30},
        ["kod_citi", "son_metin"],
    ),
    ("kod_citi_dilsiz", '```\n{"a": 1}\n```', {"a": 1}, ["kod_citi"]),
    (
        "kod_citi_kapanmamis",
        '```json\n{"a": 1, "b": [1, 2',
        {"a": 1, "b": [1, 2]},
        ["kod_citi", "kesik"],
    ),
    (
        "on_ve_son_metin",
        'Yanıt: {"toplam": 12.5} Teşekkürler.',
        {"toplam": 12.5},
        ["on_metin", "son_metin"],
    ),
    ("sondaki_virgul_nesne", '{"a": 1, "b": 2,}', {"a": 1, "b": 2}, ["sondaki_virgul"]),
    ("sondaki_virgul_dizi", '{"a": [1, 2, 3,]}', {"a": [1, 2, 3]}, ["sondaki_virgul"]),
    ("tek_tirnak", "{'ad': 'Ali', 'il': 'İzmir'}", {"ad": "Ali", "il": "İzmir"}, ["tek_tirnak"]),
    (
        "python_sozlugu",
        "{'aktif': True, 'silindi': False, 'not': None}",
        {"aktif": True, "silindi": False, "not": None},
        ["tek_tirnak", "python_degeri"],
    ),
    ("tirnaksiz_anahtar", '{ad: "Ali", yas: 30}', {"ad": "Ali", "yas": 30}, ["tirnaksiz_anahtar"]),
    (
        "tirnaksiz_deger",
        '{"durum": onaylandı, "il": Ankara}',
        {"durum": "onaylandı", "il": "Ankara"},
        ["tirnaksiz_deger"],
    ),
    (
        "yorumlar",
        '{\n  "a": 1, // satır yorumu\n  "b": 2, /* blok */\n  # diyez yorumu\n  "c": 3\n}',
        {"a": 1, "b": 2, "c": 3},
        ["yorum"],
    ),
    ("yorum_degerden_sonra", '{"a": 1 /* açıklama */, "b": 2}', {"a": 1, "b": 2}, ["yorum"]),
    ("kesik_dizgi", '{"a": [1, 2, {"b": "yarım kal', {"a": [1, 2, {"b": "yarım kal"}]}, ["kesik"]),
    ("kesik_anahtardan_sonra", '{"a": 1, "b":', {"a": 1}, ["kesik"]),
    ("kesik_anahtar_ortasi", '{"a": 1, "uzun_anah', {"a": 1}, ["kesik"]),
    ("kesik_virgulden_sonra", '{"a": 1, "b": [1, 2,', {"a": 1, "b": [1, 2]}, ["kesik"]),
    (
        "kesik_derin",
        '{"a": {"b": {"c": [1, {"d": "x"',
        {"a": {"b": {"c": [1, {"d": "x"}]}}},
        ["kesik"],
    ),
    ("kesik_sayi", '{"a": 12', {"a": 12}, ["kesik"]),
    (
        "ic_tirnak",
        '{"metin": "O "merhaba" dedi", "puan": 2}',
        {"metin": 'O "merhaba" dedi', "puan": 2},
        ["ic_tirnak"],
    ),
    (
        "ic_tirnak_virgullu",
        '{"ozet": "Bu bir "test", değil mi?", "puan": 5}',
        {"ozet": 'Bu bir "test", değil mi?', "puan": 5},
        ["ic_tirnak"],
    ),
    (
        "ham_satir_sonu",
        '{"a": "satır1\nsatır2", "b": 1}',
        {"a": "satır1\nsatır2", "b": 1},
        ["satir_sonu"],
    ),
    ("kapanmamis_dizgi", '{"a": "değer\n  "b": 2}', {"a": "değer", "b": 2}, ["kapanmamis_dizgi"]),
    ("eksik_virgul_nesne", '{"a": "x" "b": "y"}', {"a": "x", "b": "y"}, ["eksik_virgul"]),
    ("eksik_virgul_sayi", '{"a": 1 "b": 2}', {"a": 1, "b": 2}, ["eksik_virgul"]),
    (
        "eksik_virgul_satir",
        '{"a": 1\n"b": 2\n"c": [1 2]}',
        {"a": 1, "b": 2, "c": [1, 2]},
        ["eksik_virgul"],
    ),
    (
        "eksik_virgul_dizi",
        '{"e": ["bir", "iki" "üç"]}',
        {"e": ["bir", "iki", "üç"]},
        ["eksik_virgul"],
    ),
    ("dusunce_blogu", '<think>Önce {x} düşüneyim.</think>\n{"a": 1}', {"a": 1}, ["dusunce_blogu"]),
    ("cift_kodlama", '"{\\"a\\": 1, \\"b\\": \\"x\\"}"', {"a": 1, "b": "x"}, ["cift_kodlama"]),
    ("suslu_unutulmus", '"ad": "Ali", "yas": 3', {"ad": "Ali", "yas": 3}, ["suslu_eklendi"]),
    (
        "akilli_tirnak",
        "{“ad”: “Ayşe”, “il”: “Muğla”}",
        {"ad": "Ayşe", "il": "Muğla"},
        ["akilli_tirnak"],
    ),
    ("kesme_isareti_dizgide", '{"ad": "Ayşe\'nin evi"}', {"ad": "Ayşe'nin evi"}, []),
    (
        "tek_tirnakta_kesme",
        "{'ad': 'Ali'nin evi', 'no': 3}",
        {"ad": "Ali'nin evi", "no": 3},
        ["ic_tirnak"],
    ),
    (
        "basta_sifir",
        '{"tel": 05321234567, "kod": 007}',
        {"tel": "05321234567", "kod": "007"},
        ["basta_sifir"],
    ),
    (
        "sayilar",
        '{"a": -3, "b": 2.50, "c": 1e3, "d": .5, "e": +7}',
        {"a": -3, "b": 2.5, "c": 1000.0, "d": 0.5, "e": 7},
        [],
    ),
    (
        "nan_sonsuz",
        '{"a": NaN, "b": Infinity, "c": undefined}',
        {"a": None, "b": None, "c": None},
        ["python_degeri"],
    ),
    ("uc_nokta", '{"a": [1, 2, ...]}', {"a": [1, 2]}, ["uc_nokta"]),
    ("gecersiz_kacis", '{"yol": "C:\\Users\\ali"}', {"yol": "C:\\Users\\ali"}, ["gecersiz_kacis"]),
    ("unicode_kacis", '{"u": "\\u00e7ay \\ud83d\\ude00"}', {"u": "çay 😀"}, []),
    ("bos_deger", '{"a": , "b": 2}', {"a": None, "b": 2}, ["bos_deger"]),
    ("esittir", '{"a" = 1, "b" => 2}', {"a": 1, "b": 2}, []),
    ("bom_ve_gorunmez", '\ufeff{"a":\u200b 1}', {"a": 1}, []),
    (
        "ic_ice_bozuk",
        "```json\n{'kalemler': [{'ad': 'Kalem', adet: 2,}, {'ad': 'Defter', adet: 1,},], // son\n}\n```",
        {"kalemler": [{"ad": "Kalem", "adet": 2}, {"ad": "Defter", "adet": 1}]},
        ["kod_citi", "tek_tirnak", "tirnaksiz_anahtar", "sondaki_virgul", "yorum"],
    ),
]


@pytest.mark.parametrize(
    ("ad", "cikti", "beklenen", "notlar"), ORNEKLER, ids=[o[0] for o in ORNEKLER]
)
def test_bozuk_cikti_onarilir(ad, cikti, beklenen, notlar):
    sonuc = json_ayikla(cikti)
    assert sonuc.bulundu, ad
    assert sonuc.deger == beklenen
    for beklenen_not in notlar:
        assert beklenen_not in sonuc.notlar, (beklenen_not, sonuc.notlar)
    if not notlar:
        assert sonuc.adaylar[0].temiz or set(sonuc.notlar) <= {"on_metin", "son_metin"}, (
            sonuc.notlar
        )


def test_gecerli_json_hic_degismez():
    """Geçerli JSON için sonuç `json.loads` ile birebir aynı olmalı (onarıcı zarar vermez)."""
    ornekler = [
        {"a": 1, "b": [1.5, -2, 1e-3], "c": {"d": None, "e": True, "f": False}},
        {"metin": 'tırnak " ve ters \\ çizgi, virgül, {süslü} [köşeli] // yorum değil'},
        {"satir": "bir\niki\tüç", "bos": "", "liste": [], "nesne": {}},
        {"url": "https://ornek.com/a?b=1#c", "emoji": "😀", "tr": "çğıöşüÇĞİÖŞÜ"},
    ]
    for ornek in ornekler:
        for metin in (json.dumps(ornek), json.dumps(ornek, ensure_ascii=False, indent=2)):
            sonuc = json_ayikla(metin)
            assert sonuc.deger == ornek
            assert sonuc.adaylar[0].temiz


def test_dizgi_icindeki_yapilar_bozulmaz():
    metin = 'Açıklama: {"kural": "a, b] ve } // /* # gibi işaretler dizgide kalır", "n": 1,}'
    assert json_coz(metin) == {"kural": "a, b] ve } // /* # gibi işaretler dizgide kalır", "n": 1}


def test_birden_cok_aday_en_buyuk_ve_beklenen_tur_one_gelir():
    metin = 'Örnek: {"ad": "x"}\nGerçek yanıt: {"ad": "Ali", "soyad": "Kaya", "yas": 30}'
    sonuc = json_ayikla(metin)
    assert len(sonuc.adaylar) == 2
    assert sonuc.deger == {"ad": "Ali", "soyad": "Kaya", "yas": 30}
    karisik = 'Kaynak [1] ve [2]. Sonuç {"a": 1}'
    assert json_ayikla(karisik, "nesne").deger == {"a": 1}
    assert json_ayikla(karisik, "dizi").deger == [1]


def test_json_citi_duz_yazidaki_suslu_parantezi_yener():
    metin = 'Şema {ad, soyad} biçimindedir.\n```json\n{"ad": "Ali"}\n```'
    assert json_ayikla(metin).deger == {"ad": "Ali"}
    assert json_ayikla('Not: { ve sonra\n{"a": 1}').deger == {"a": 1}


def test_dizi_beklenirken():
    assert json_coz('Liste: ["a", "b",]', "dizi") == ["a", "b"]
    assert json_coz('[{"a": 1}, {"a": 2', "dizi") == [{"a": 1}, {"a": 2}]


@pytest.mark.parametrize(
    "cikti",
    ["", "Üzgünüm, yanıt veremem.", "Şablon {} boş", "<think>yalnız düşünce", "42", '"düz dizgi"'],
)
def test_json_yoksa_bulunmaz(cikti):
    sonuc = json_ayikla(cikti)
    assert not sonuc.bulundu and sonuc.deger is None
    with pytest.raises(ValueError, match="JSON bulunamadı"):
        json_coz(cikti)


def test_bos_nesne_tek_basina_gecerli_cikti_sayilir():
    """Model yalnız `{}` döndürdüyse bu bir yanıttır (şema doğrulaması eksik alanları söyler)."""
    assert json_ayikla("{}").deger == {}
    assert json_ayikla(" [] ", "dizi").deger == []


def test_patolojik_girdiler_cokmez_ve_biter():
    for girdi in [
        "{" * 500,
        "[" * 500,
        '{"a":' * 200,
        "}" * 50,
        '{"a": "' + "\\" * 99,
        "{,,,,}",
        "[,]",
        "{:}",
        '{"a"}',
        '{"a", "b"}',
    ]:
        json_ayikla(girdi)  # istisna fırlatmamalı, sonsuz döngüye girmemeli

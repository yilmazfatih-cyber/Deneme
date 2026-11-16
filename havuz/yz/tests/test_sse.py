"""SSE ayrıştırıcı testleri: bölünmüş parçalar, satır sonu türleri, yorumlar, NDJSON."""

import pytest

from yz.saglayici.sse import SseOlayi, satirlara_bol, sse_bicimle, sse_olaylari


def _olaylar(*parcalar: bytes | str) -> list[SseOlayi]:
    return list(sse_olaylari(satirlara_bol(parcalar)))


def test_temel_olaylar():
    olaylar = _olaylar(b'data: {"a": 1}\n\ndata: [DONE]\n\n')
    assert [o.veri for o in olaylar] == ['{"a": 1}', "[DONE]"]
    assert olaylar[0].olay == "message"


@pytest.mark.parametrize("ayrac", ["\n", "\r\n", "\r"])
def test_satir_sonu_turleri(ayrac):
    ham = f"data: bir{ayrac}{ayrac}data: iki{ayrac}{ayrac}".encode()
    assert [o.veri for o in _olaylar(ham)] == ["bir", "iki"]


def test_parca_her_yerden_bolunebilir():
    ham = 'event: mesaj\r\ndata: {"metin": "çığlık"}\r\n\r\ndata: son\n\n'.encode()
    beklenen = [SseOlayi('{"metin": "çığlık"}', "mesaj"), SseOlayi("son")]
    for kesim in range(1, len(ham)):  # çok baytlı harfin ve \r\n'in ortası dahil her kesim noktası
        assert _olaylar(ham[:kesim], ham[kesim:]) == beklenen, kesim
    assert _olaylar(*[bytes([b]) for b in ham]) == beklenen  # bayt bayt


def test_cok_satirli_veri_ve_alanlar():
    olaylar = _olaylar("id: 7\nevent: guncelleme\ndata: satır 1\ndata: satır 2\n\n")
    assert olaylar == [SseOlayi("satır 1\nsatır 2", "guncelleme", "7")]


def test_bosluksuz_data_ve_yorumlar():
    olaylar = _olaylar(": canli tut\n\ndata:bosluksuz\n\n: OPENROUTER PROCESSING\ndata:  iki bosluk\n\n")
    assert [o.veri for o in olaylar] == ["bosluksuz", " iki bosluk"]


def test_son_olay_bos_satirsiz_biter():
    assert [o.veri for o in _olaylar("data: bir\n\ndata: yarım")] == ["bir", "yarım"]
    assert [o.veri for o in _olaylar("data: tek\r")] == ["tek"]


def test_ndjson_satirlari_olay_sayilir():
    olaylar = _olaylar('{"message": {"content": "a"}, "done": false}\n{"done": true}\n')
    assert [o.veri for o in olaylar] == ['{"message": {"content": "a"}, "done": false}', '{"done": true}']


def test_bilinmeyen_alan_ve_ayracsiz_satir_yok_sayilir():
    assert [o.veri for o in _olaylar("retry: 10\nanlamsiz satir\ndata: x\n\n")] == ["x"]
    assert _olaylar("\n\n\n") == []


def test_gecersiz_utf8_cokmez():
    olaylar = _olaylar(b"data: \xff\xfe bozuk\n\n")
    assert len(olaylar) == 1 and "bozuk" in olaylar[0].veri


def test_sse_bicimle_gidis_donus():
    tel = sse_bicimle('{"a": 1}') + sse_bicimle("iki\nsatır", olay="parca")
    assert _olaylar(tel) == [SseOlayi('{"a": 1}'), SseOlayi("iki\nsatır", "parca")]

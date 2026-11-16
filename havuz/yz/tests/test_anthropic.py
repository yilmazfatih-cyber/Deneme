"""Anthropic bağdaştırıcısı: resmî SDK'ya sahte HTTP aktarımı (httpx2.MockTransport) verilir; ağ yok.

Yanıt biçimleri Messages API'nin belgelenmiş biçiminden kısaltılmıştır. CANLI API İLE DENENMEDİ.
"""

import json

import pytest

anthropic = pytest.importorskip("anthropic")
httpx2 = pytest.importorskip("httpx2")

from yz.hatalar import DesteklenmiyorHatasi, SaglayiciHatasi  # noqa: E402
from yz.saglayici import AracCagrisi, AracTanimi, Mesaj  # noqa: E402
from yz.saglayici.anthropic_bagdastirici import Anthropic, mesajlari_cevir  # noqa: E402

MODEL = "deneme-claude"  # gerçek model adı yapılandırmadan gelir; testte önemsiz


def _ileti(icerik, durma="end_turn", **ek):
    return {
        "id": "msg_1",
        "type": "message",
        "role": "assistant",
        "model": MODEL,
        "content": icerik,
        "stop_reason": durma,
        "stop_sequence": None,
        "usage": {"input_tokens": 12, "output_tokens": 4},
        **ek,
    }


def _sag(isleyici, **ek):
    istekler = []

    def sarili(istek):
        istekler.append(istek)
        return isleyici(istek)

    istemci = httpx2.Client(transport=httpx2.MockTransport(sarili))
    sag = Anthropic(
        MODEL, api_anahtari="test-anahtari", istemci=istemci, azami_yeniden_deneme=0, **ek
    )
    return sag, istekler


def test_temel_istek_ve_yanit():
    sag, istekler = _sag(
        lambda _: httpx2.Response(200, json=_ileti([{"type": "text", "text": "Merhaba!"}]))
    )
    yanit = sag.sohbet(
        [Mesaj.sistem("Kısa yanıtla."), Mesaj.kullanici("Selam")], azami_belirtec=50, dur=["SON"]
    )
    assert yanit.metin == "Merhaba!" and yanit.bitis_nedeni == "bitti"
    assert (yanit.kullanim.girdi_belirteci, yanit.kullanim.cikti_belirteci) == (12, 4)
    govde = json.loads(istekler[0].content)
    assert str(istekler[0].url).endswith("/v1/messages")
    assert govde["system"] == "Kısa yanıtla." and govde["messages"] == [
        {"role": "user", "content": "Selam"}
    ]
    assert govde["max_tokens"] == 50 and govde["stop_sequences"] == ["SON"]
    assert "temperature" not in govde  # sıcaklık bilerek gönderilmez (bkz. modül başlığı)


def test_arac_cagrisi_ve_sonuc_mesajlari():
    icerik = [
        {"type": "text", "text": "Hesaplıyorum."},
        {"type": "tool_use", "id": "toolu_1", "name": "hesapla", "input": {"ifade": "2+2"}},
    ]
    sag, istekler = _sag(lambda _: httpx2.Response(200, json=_ileti(icerik, "tool_use")))
    arac = AracTanimi(
        ad="hesapla",
        aciklama="Hesaplar.",
        parametreler={"type": "object", "properties": {"ifade": {"type": "string"}}},
    )
    yanit = sag.sohbet("2+2?", araclar=[arac], arac_secimi="hesapla")
    assert yanit.bitis_nedeni == "arac" and yanit.arac_cagrilari[0].argumanlar == {"ifade": "2+2"}
    assert yanit.saglayici_verisi is not None  # ham bloklar sonraki turda aynen geri gider
    govde = json.loads(istekler[0].content)
    assert govde["tools"][0]["input_schema"]["properties"]["ifade"]["type"] == "string"
    assert (
        "tool_choice" not in govde and "hesapla" in govde["system"]
    )  # zorunlu seçim istemle yapılır
    sistem, mesajlar = mesajlari_cevir(
        [
            Mesaj.kullanici("2+2?"),
            yanit.mesaj(),
            Mesaj.arac("toolu_1", "4", "hesapla"),
            Mesaj.arac("toolu_2", "hata", "x", hata=True),
        ]
    )
    assert sistem == "" and mesajlar[1]["content"] == icerik
    assert (
        mesajlar[2]["role"] == "user" and len(mesajlar[2]["content"]) == 2
    )  # sonuçlar tek mesajda
    assert mesajlar[2]["content"][1]["is_error"] is True


def test_elle_kurulan_asistan_mesaji_bloklara_cevrilir():
    _, mesajlar = mesajlari_cevir(
        [Mesaj.asistan("önce", [AracCagrisi(kimlik="t1", ad="a", argumanlar={"x": 1})])]
    )
    assert mesajlar[0]["content"] == [
        {"type": "text", "text": "önce"},
        {"type": "tool_use", "id": "t1", "name": "a", "input": {"x": 1}},
    ]


def test_sema_output_config_ile_gider():
    sema = {"type": "object", "properties": {"ad": {"type": "string"}}, "required": ["ad"]}
    sag, istekler = _sag(
        lambda _: httpx2.Response(200, json=_ileti([{"type": "text", "text": '{"ad": "Ali"}'}]))
    )
    assert sag.sohbet("x", yanit_bicimi=sema).metin == '{"ad": "Ali"}'
    assert json.loads(istekler[0].content)["output_config"] == {
        "format": {"type": "json_schema", "schema": sema}
    }


def test_ret_yedegi_beta_ucunu_kullanir():
    sag, istekler = _sag(
        lambda _: httpx2.Response(200, json=_ileti([{"type": "text", "text": "tamam"}])),
        ret_yedegi_beta="server-side-fallback-2026-07-01",
    )
    sag.sohbet("x")
    istek = istekler[0]
    assert "server-side-fallback-2026-07-01" in istek.headers["anthropic-beta"]  # SDK 2.8: başlıkla
    assert json.loads(istek.content)["fallbacks"] == "default"


def test_ret_bitis_nedeni():
    sag, _ = _sag(lambda _: httpx2.Response(200, json=_ileti([], "refusal")))
    assert sag.sohbet("x").bitis_nedeni == "ret"


def test_akis():
    olaylar = [
        ("message_start", {"type": "message_start", "message": _ileti([], None)}),
        (
            "content_block_start",
            {
                "type": "content_block_start",
                "index": 0,
                "content_block": {"type": "text", "text": ""},
            },
        ),
        (
            "content_block_delta",
            {
                "type": "content_block_delta",
                "index": 0,
                "delta": {"type": "text_delta", "text": "Mer"},
            },
        ),
        (
            "content_block_delta",
            {
                "type": "content_block_delta",
                "index": 0,
                "delta": {"type": "text_delta", "text": "haba"},
            },
        ),
        ("content_block_stop", {"type": "content_block_stop", "index": 0}),
        (
            "message_delta",
            {
                "type": "message_delta",
                "delta": {"stop_reason": "end_turn", "stop_sequence": None},
                "usage": {"output_tokens": 7},
            },
        ),
        ("message_stop", {"type": "message_stop"}),
    ]
    govde = "".join(f"event: {ad}\ndata: {json.dumps(veri)}\n\n" for ad, veri in olaylar)
    sag, _ = _sag(
        lambda _: httpx2.Response(
            200, content=govde.encode(), headers={"content-type": "text/event-stream"}
        )
    )
    parcalar = list(sag.sohbet("x", akis=True))
    assert [p.metin for p in parcalar[:-1]] == ["Mer", "haba"]
    son = parcalar[-1].son
    assert son is not None and son.metin == "Merhaba" and son.kullanim.cikti_belirteci == 7


@pytest.mark.parametrize(
    ("durum", "beklenen", "tur"),
    [
        (401, "ANTHROPIC_API_KEY", SaglayiciHatasi),
        (404, "Model bulunamadı", SaglayiciHatasi),
        (429, "429", SaglayiciHatasi),
        (400, "biçim", DesteklenmiyorHatasi),
    ],
)
def test_hata_eslemesi(durum, beklenen, tur):
    ileti = "output_config.format: schema not supported" if durum == 400 else "hata"
    govde = {"type": "error", "error": {"type": "x", "message": ileti}}
    sag, _ = _sag(lambda _: httpx2.Response(durum, json=govde))
    with pytest.raises(tur, match=beklenen) as bilgi:
        sag.sohbet("x")
    assert bilgi.value.yeniden_denenebilir == (durum == 429)


def test_baglanti_hatasi():
    def kopuk(_):
        raise httpx2.ConnectError("yok")

    sag, _ = _sag(kopuk)
    with pytest.raises(SaglayiciHatasi, match="bağlanılamadı"):
        sag.sohbet("x")

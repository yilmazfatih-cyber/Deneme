"""OpenAI uyumlu bağdaştırıcı testleri: kayıtlı yanıt biçimleri, akış, hata ve yeniden deneme.

Ağ yok: `httpx.MockTransport` sunucunun yerini tutar. Yanıt gövdeleri farklı sunucuların
(OpenAI, Ollama, llama.cpp, LM Studio) belgelenmiş biçimlerinden kısaltılmıştır.
"""

import json

import httpx
import pytest

from yz.hatalar import BaglantiHatasi, DesteklenmiyorHatasi, SaglayiciHatasi, ZamanAsimiHatasi
from yz.saglayici import AracCagrisi, AracTanimi, Mesaj, OpenAIUyumlu, YenidenDenemeAyari
from yz.saglayici.openai_uyumlu import hata_iletisi_coz, taban_url_duzelt

ARAC = AracTanimi(
    ad="hesapla",
    aciklama="Aritmetik ifadeyi hesaplar.",
    parametreler={
        "type": "object",
        "properties": {"ifade": {"type": "string"}},
        "required": ["ifade"],
    },
)


def _sag(isleyici, **ek) -> tuple[OpenAIUyumlu, list[httpx.Request]]:
    istekler: list[httpx.Request] = []

    def sarili(istek: httpx.Request) -> httpx.Response:
        istekler.append(istek)
        yanit: httpx.Response = isleyici(istek)
        return yanit

    istemci = httpx.Client(transport=httpx.MockTransport(sarili))
    ek.setdefault("yeniden_deneme", YenidenDenemeAyari(azami_deneme=3, taban_sn=0.01))
    sag = OpenAIUyumlu(
        "http://sunucu.test", "deneme-model", istemci=istemci, uyu=lambda _: None, **ek
    )
    return sag, istekler


def _json(veri, durum=200, **ek) -> httpx.Response:
    return httpx.Response(durum, json=veri, **ek)


def _sse(*parcalar, bitis="data: [DONE]\n\n") -> httpx.Response:
    govde = "".join(f"data: {json.dumps(p, ensure_ascii=False)}\n\n" for p in parcalar) + bitis
    return httpx.Response(
        200, content=govde.encode(), headers={"content-type": "text/event-stream"}
    )


@pytest.mark.parametrize(
    ("girdi", "beklenen"),
    [
        ("http://localhost:11434", "http://localhost:11434/v1"),
        ("http://localhost:11434/", "http://localhost:11434/v1"),
        ("http://localhost:11434/v1/", "http://localhost:11434/v1"),
        ("http://localhost:8430/v1/chat/completions", "http://localhost:8430/v1"),
        ("https://openrouter.ai/api/v1", "https://openrouter.ai/api/v1"),
        ("https://ornek.com/v1beta/openai/", "https://ornek.com/v1beta/openai"),
    ],
)
def test_taban_url_duzelt(girdi, beklenen):
    assert taban_url_duzelt(girdi) == beklenen


def test_taban_url_semasiz_reddedilir():
    with pytest.raises(ValueError, match="http"):
        taban_url_duzelt("localhost:11434")


def test_temel_sohbet_ve_istek_govdesi():
    yanit = {
        "id": "x",
        "model": "deneme-model-q4",
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": "Merhaba!"},
                "finish_reason": "stop",
            }
        ],
        "usage": {"prompt_tokens": 12, "completion_tokens": 3, "total_tokens": 15},
    }
    sag, istekler = _sag(lambda _: _json(yanit), api_anahtari="gizli-anahtar")
    sonuc = sag.sohbet(
        [Mesaj.sistem("Kısa yanıtla."), Mesaj.kullanici("Selam")],
        azami_belirtec=50,
        dur=["\n\n"],
        tohum=7,
    )
    assert sonuc.metin == "Merhaba!" and sonuc.bitis_nedeni == "bitti"
    assert (sonuc.kullanim.girdi_belirteci, sonuc.kullanim.cikti_belirteci) == (12, 3)
    assert sonuc.model == "deneme-model-q4" and not sonuc.kullanim.tahmini
    istek = istekler[0]
    assert str(istek.url) == "http://sunucu.test/v1/chat/completions"
    assert istek.headers["authorization"] == "Bearer gizli-anahtar"
    govde = json.loads(istek.content)
    assert govde["model"] == "deneme-model" and govde["temperature"] == 0.0  # varsayılan sıcaklık 0
    assert govde["max_tokens"] == 50 and govde["stop"] == ["\n\n"] and govde["seed"] == 7
    assert govde["messages"] == [
        {"role": "system", "content": "Kısa yanıtla."},
        {"role": "user", "content": "Selam"},
    ]
    assert "stream" not in govde and "tools" not in govde


def test_eksik_alanlara_hosgoru():
    """usage, finish_reason, model yok; content None — yine de yanıt çıkar, kullanım tahmin edilir."""
    sag, _ = _sag(
        lambda _: _json({"choices": [{"message": {"role": "assistant", "content": None}}]})
    )
    sonuc = sag.sohbet("Selam")
    assert sonuc.metin == "" and sonuc.model == "deneme-model"
    assert sonuc.kullanim.tahmini and sonuc.kullanim.girdi_belirteci > 0


def test_icerik_parca_listesi_ve_dusunce_alanlari():
    yanit = {
        "choices": [
            {
                "message": {
                    "content": [
                        {"type": "text", "text": "Sonuç "},
                        {"type": "text", "text": "42."},
                    ],
                    "reasoning_content": "Önce toplayayım.",
                },
                "finish_reason": "eos",
            }
        ],
        "timings": {"prompt_n": 20, "predicted_n": 5},  # llama.cpp: usage yerine timings
    }
    sag, _ = _sag(lambda _: _json(yanit))
    sonuc = sag.sohbet("?")
    assert sonuc.metin == "Sonuç 42." and sonuc.dusunce == "Önce toplayayım."
    assert (sonuc.kullanim.girdi_belirteci, sonuc.kullanim.cikti_belirteci) == (20, 5)


def test_think_etiketi_metinden_ayrilir():
    icerik = "<think>\nKullanıcı selam verdi.\n</think>\n\nMerhaba!"
    sag, _ = _sag(
        lambda _: _json({"choices": [{"message": {"content": icerik}, "finish_reason": "stop"}]})
    )
    sonuc = sag.sohbet("Selam")
    assert sonuc.metin == "Merhaba!" and sonuc.dusunce == "Kullanıcı selam verdi."


def test_arac_cagrisi_bicim_farklari():
    """arguments: dizgi (OpenAI), nesne (Ollama), bozuk JSON; id eksik; finish_reason 'stop'."""
    yanit = {
        "choices": [
            {
                "message": {
                    "content": "",
                    "tool_calls": [
                        {
                            "id": "call_1",
                            "type": "function",
                            "function": {"name": "hesapla", "arguments": '{"ifade": "2+2"}'},
                        },
                        {"function": {"name": "hesapla", "arguments": {"ifade": "3*3"}}},
                        {
                            "id": "call_3",
                            "function": {"name": "hesapla", "arguments": "{'ifade': '4/2',}"},
                        },
                    ],
                },
                "finish_reason": "stop",
            }
        ]
    }
    sag, istekler = _sag(lambda _: _json(yanit))
    sonuc = sag.sohbet("hesapla", araclar=[ARAC], arac_secimi="zorunlu")
    assert sonuc.bitis_nedeni == "arac"
    assert [c.argumanlar for c in sonuc.arac_cagrilari] == [
        {"ifade": "2+2"},
        {"ifade": "3*3"},
        {"ifade": "4/2"},
    ]
    assert [c.kimlik for c in sonuc.arac_cagrilari] == ["call_1", "cagri_2", "call_3"]
    govde = json.loads(istekler[0].content)
    assert govde["tools"][0]["function"]["name"] == "hesapla" and govde["tool_choice"] == "required"


def test_eski_function_call_bicimi():
    yanit = {
        "choices": [
            {
                "message": {
                    "content": None,
                    "function_call": {"name": "hesapla", "arguments": '{"ifade": "1+1"}'},
                }
            }
        ]
    }
    sag, _ = _sag(lambda _: _json(yanit))
    assert sag.sohbet("x", araclar=[ARAC]).arac_cagrilari[0].argumanlar == {"ifade": "1+1"}


def test_arac_turu_mesajlari_tel_bicimine_cevrilir():
    sag, istekler = _sag(lambda _: _json({"choices": [{"message": {"content": "4"}}]}))
    ilk = sag.sohbet  # yalnız okunurluk
    gecmis = [
        Mesaj.kullanici("2+2?"),
        Mesaj.asistan(
            arac_cagrilari=[AracCagrisi(kimlik="c1", ad="hesapla", argumanlar={"ifade": "2+2"})]
        ),
        Mesaj.arac("c1", "4", ad="hesapla"),
    ]
    ilk(gecmis, araclar=[ARAC])
    mesajlar = json.loads(istekler[0].content)["messages"]
    assert mesajlar[1]["tool_calls"][0] == {
        "id": "c1",
        "type": "function",
        "function": {"name": "hesapla", "arguments": '{"ifade": "2+2"}'},
    }
    assert mesajlar[2] == {"role": "tool", "content": "4", "tool_call_id": "c1", "name": "hesapla"}


def test_yapili_kipler_govdeyi_degistirir():
    sema = {"type": "object", "properties": {"ad": {"type": "string"}}, "required": ["ad"]}
    tamam = {"choices": [{"message": {"content": "{}"}}]}
    beklenenler = {
        "json_sema": lambda g: g["response_format"]["json_schema"]["schema"] == sema,
        "json_nesne": lambda g: g["response_format"] == {"type": "json_object"},
        "gbnf": lambda g: (
            "grammar" in g and "root ::=" in g["grammar"] and "response_format" not in g
        ),
        "kapali": lambda g: "response_format" not in g and "grammar" not in g,
    }
    for kip, denetim in beklenenler.items():
        sag, istekler = _sag(lambda _: _json(tamam), yapili_kip=kip)
        sag.sohbet("x", yanit_bicimi=sema)
        assert denetim(json.loads(istekler[0].content)), kip
    sag, istekler = _sag(lambda _: _json(tamam))
    sag.sohbet("x", yanit_bicimi="json")
    assert json.loads(istekler[0].content)["response_format"] == {"type": "json_object"}


def test_akis_metin_arac_ve_kullanim():
    parcalar = [
        {"model": "m", "choices": [{"delta": {"role": "assistant", "content": ""}}]},
        {"choices": [{"delta": {"content": "Mer"}}]},
        {"choices": [{"delta": {"content": "haba"}}]},
        {
            "choices": [
                {
                    "delta": {
                        "tool_calls": [
                            {
                                "index": 0,
                                "id": "c1",
                                "function": {"name": "hesapla", "arguments": ""},
                            }
                        ]
                    }
                }
            ]
        },
        {
            "choices": [
                {"delta": {"tool_calls": [{"index": 0, "function": {"arguments": '{"ifade":'}}]}}
            ]
        },
        {
            "choices": [
                {"delta": {"tool_calls": [{"index": 0, "function": {"arguments": ' "2+2"}'}}]}}
            ]
        },
        {"choices": [{"delta": {}, "finish_reason": "tool_calls"}]},
        {"choices": [], "usage": {"prompt_tokens": 9, "completion_tokens": 4}},
    ]
    sag, istekler = _sag(lambda _: _sse(*parcalar))
    gelen = list(sag.sohbet("x", araclar=[ARAC], akis=True))
    assert [p.metin for p in gelen[:-1]] == ["Mer", "haba"]
    son = gelen[-1].son
    assert son is not None and son.metin == "Merhaba" and son.bitis_nedeni == "arac"
    assert (
        son.arac_cagrilari[0].argumanlar == {"ifade": "2+2"}
        and son.arac_cagrilari[0].kimlik == "c1"
    )
    assert (son.kullanim.girdi_belirteci, son.kullanim.cikti_belirteci) == (
        9,
        4,
    ) and son.model == "m"
    govde = json.loads(istekler[0].content)
    assert govde["stream"] is True and govde["stream_options"] == {"include_usage": True}


def test_akis_done_olmadan_ve_dusunce_etiketi_bolunmus():
    parcalar = [
        {"choices": [{"delta": {"content": "<thi"}}]},
        {"choices": [{"delta": {"content": "nk>gizli düşünce</th"}}]},
        {"choices": [{"delta": {"content": "ink>\n\nGörünen "}}]},
        {"choices": [{"delta": {"content": "yanıt"}, "finish_reason": "stop"}]},
    ]
    sag, _ = _sag(lambda _: _sse(*parcalar, bitis=""))
    gelen = list(sag.sohbet("x", akis=True))
    assert "".join(p.metin for p in gelen) == "Görünen yanıt"
    assert "".join(p.dusunce for p in gelen) == "gizli düşünce"
    assert gelen[-1].son is not None and gelen[-1].son.metin == "Görünen yanıt"
    assert gelen[-1].son.dusunce == "gizli düşünce"


def test_akis_indekssiz_arac_cagrilari_ve_bozuk_satir():
    govde = (
        'data: {"choices": [{"delta": {"tool_calls": [{"id": "a", "function": {"name": "hesapla", "arguments": "{\\"ifade\\": \\"1\\"}"}}]}}]}\n\n'
        "data: bu json degil\n\n"
        ": canli tut\n\n"
        'data: {"choices": [{"delta": {"tool_calls": [{"id": "b", "function": {"name": "hesapla", "arguments": "{\\"ifade\\": \\"2\\"}"}}]}}]}\n\n'
    )
    yanit = httpx.Response(
        200, content=govde.encode(), headers={"content-type": "text/event-stream"}
    )
    sag, _ = _sag(lambda _: yanit)
    son = list(sag.sohbet("x", araclar=[ARAC], akis=True))[-1].son
    assert son is not None
    assert [(c.kimlik, c.argumanlar) for c in son.arac_cagrilari] == [
        ("a", {"ifade": "1"}),
        ("b", {"ifade": "2"}),
    ]


def test_akis_istegine_duz_json_donen_sunucu():
    sag, _ = _sag(lambda _: _json({"choices": [{"message": {"content": "tek parça"}}]}))
    gelen = list(sag.sohbet("x", akis=True))
    assert [p.metin for p in gelen] == ["tek parça", ""] and gelen[-1].son is not None


def test_akis_ortasinda_hata_nesnesi():
    sag, _ = _sag(
        lambda _: _sse(
            {"choices": [{"delta": {"content": "ya"}}]}, {"error": {"message": "bellek bitti"}}
        )
    )
    with pytest.raises(SaglayiciHatasi, match="bellek bitti"):
        list(sag.sohbet("x", akis=True))


def test_gecici_hatada_yeniden_dener_ve_retry_after():
    durumlar = iter([429, 503, 200])
    beklemeler: list[float] = []

    def isleyici(_):
        durum = next(durumlar)
        if durum == 200:
            return _json({"choices": [{"message": {"content": "tamam"}}]})
        return _json({"error": {"message": "meşgul"}}, durum, headers={"retry-after": "2"})

    sag, istekler = _sag(isleyici, yeniden_deneme=YenidenDenemeAyari(azami_deneme=3, taban_sn=0.1))
    sag._uyu = beklemeler.append
    assert sag.sohbet("x").metin == "tamam"
    assert len(istekler) == 3 and beklemeler == [
        2.0,
        2.0,
    ]  # Retry-After üstel beklemeden uzunsa o kullanılır


def test_yeniden_deneme_tukenince_hata_ve_4xx_denenmez():
    sag, istekler = _sag(lambda _: _json({"error": "aşırı yük"}, 503))
    with pytest.raises(SaglayiciHatasi, match="503") as bilgi:
        sag.sohbet("x")
    assert bilgi.value.yeniden_denenebilir and len(istekler) == 3
    sag, istekler = _sag(lambda _: _json({"error": {"message": "geçersiz istek"}}, 400))
    with pytest.raises(SaglayiciHatasi, match="geçersiz istek"):
        sag.sohbet("x")
    assert len(istekler) == 1


def test_hata_iletileri_yol_gosterir():
    sag, _ = _sag(lambda _: _json({"error": {"message": "Incorrect API key"}}, 401))
    with pytest.raises(SaglayiciHatasi, match="YZ_API_ANAHTARI"):
        sag.sohbet("x")
    sag, _ = _sag(lambda _: _json({"error": "model 'yok' not found"}, 404))
    with pytest.raises(SaglayiciHatasi, match="python -m yz modeller"):
        sag.sohbet("x")
    sag, _ = _sag(lambda _: httpx.Response(200, text="<html>giriş sayfası</html>"))
    with pytest.raises(SaglayiciHatasi, match="JSON olmayan"):
        sag.sohbet("x")


def test_baglanti_ve_zaman_asimi_hatalari():
    def kapali(_):
        raise httpx.ConnectError("bağlantı reddedildi")

    sag, istekler = _sag(kapali)
    with pytest.raises(BaglantiHatasi, match="Sunucu çalışıyor mu"):
        sag.sohbet("x")
    assert len(istekler) == 3  # bağlantı hatası yeniden denenir

    def yavas(_):
        raise httpx.ReadTimeout("zaman aşımı")

    sag, _ = _sag(yavas)
    with pytest.raises(ZamanAsimiHatasi):
        sag.sohbet("x")


def test_desteklenmeyen_ozellik_ayri_hata_turudur():
    sag, _ = _sag(
        lambda _: _json({"error": {"message": "response_format json_schema is not supported"}}, 400)
    )
    with pytest.raises(DesteklenmiyorHatasi):
        sag.sohbet("x", yanit_bicimi={"type": "object"})
    sag, _ = _sag(lambda _: _json({"error": {"message": "model does not support tools"}}, 400))
    with pytest.raises(DesteklenmiyorHatasi, match="araç çağrısını desteklemiyor"):
        sag.sohbet("x", araclar=[ARAC])


def test_reddedilen_istege_bagli_alan_atilip_yeniden_denenir():
    def isleyici(istek: httpx.Request):
        govde = json.loads(istek.content)
        if "stream_options" in govde:
            return _json(
                {"error": {"message": "Unrecognized request argument: stream_options"}}, 400
            )
        return _sse({"choices": [{"delta": {"content": "oldu"}}]})

    sag, istekler = _sag(isleyici)
    assert list(sag.sohbet("x", akis=True))[-1].son.metin == "oldu"  # type: ignore[union-attr]
    assert len(istekler) == 2 and "stream_options" not in json.loads(istekler[1].content)


def test_gomme_toplu_ve_sirali():
    def isleyici(istek: httpx.Request):
        girdiler = json.loads(istek.content)["input"]
        veri = [{"index": i, "embedding": [float(len(m)), 1.0]} for i, m in enumerate(girdiler)]
        return _json({"data": list(reversed(veri))})  # sırasız döner; index'e göre dizilmeli

    sag, istekler = _sag(isleyici, gomme_modeli="gomme-model", gomme_toplu=2)
    vektorler = sag.gom(["a", "bb", "ccc"])
    assert vektorler == [[1.0, 1.0], [2.0, 1.0], [3.0, 1.0]]
    assert len(istekler) == 2 and json.loads(istekler[0].content)["model"] == "gomme-model"
    assert str(istekler[0].url).endswith("/v1/embeddings")


def test_gomme_sayisi_tutmazsa_hata():
    sag, _ = _sag(lambda _: _json({"data": []}))
    with pytest.raises(SaglayiciHatasi, match="gömme modeli"):
        sag.gom(["a"])


def test_modeller_iki_bicim():
    sag, _ = _sag(lambda _: _json({"data": [{"id": "m1", "owned_by": "ben"}, {"id": "m2"}]}))
    assert [m.kimlik for m in sag.modeller()] == ["m1", "m2"]
    sag, _ = _sag(lambda _: _json({"models": [{"name": "yerel:3b"}]}))
    assert [m.kimlik for m in sag.modeller()] == ["yerel:3b"]


def test_hata_iletisi_coz():
    assert hata_iletisi_coz('{"error": {"message": "a"}}') == "a"
    assert hata_iletisi_coz('{"error": "b"}') == "b"
    assert hata_iletisi_coz('{"detail": "c"}') == "c"
    assert hata_iletisi_coz("düz metin") == "düz metin"

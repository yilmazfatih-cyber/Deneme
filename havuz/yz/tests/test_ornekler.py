"""ornekler/ klasöründeki kopyalanacak örneklerin çalıştığını sınar."""

import json
from typing import Any

import httpx
import pytest

from ornekler.coklu_ajan import calistir
from ornekler.kendi_aracim import kur_araclari
from ornekler.ollama_yerel import OllamaYerel
from yz.ajan.onay import hepsini_onayla
from yz.arac.kutu import AracKutusu
from yz.saglayici import AracTanimi, Mesaj, Sahte
from yz.saglayici.tipler import AracCagrisi


def test_ollama_yerel_istek_ve_yanit_bicimi():
    gelen: list[dict[str, Any]] = []

    def isleyici(istek: httpx.Request) -> httpx.Response:
        gelen.append(json.loads(istek.content))
        return httpx.Response(200, json={
            "model": "m", "message": {"role": "assistant", "content": "", "thinking": "düşündüm",
                                      "tool_calls": [{"function": {"name": "hesapla", "arguments": {"ifade": "2+2"}}}]},
            "done": True, "done_reason": "stop", "prompt_eval_count": 20, "eval_count": 5,
        })  # fmt: skip

    sag = OllamaYerel(
        "m", baglam_uzunlugu=8192, istemci=httpx.Client(transport=httpx.MockTransport(isleyici))
    )
    arac = AracTanimi(ad="hesapla", aciklama="Hesaplar.", parametreler={"type": "object"})
    gecmis = [Mesaj.kullanici("2+2?"), Mesaj.asistan(arac_cagrilari=[AracCagrisi(kimlik="c", ad="hesapla", argumanlar={"ifade": "1"})]),
              Mesaj.arac("c", "1", "hesapla")]  # fmt: skip
    yanit = sag.sohbet(gecmis, araclar=[arac], yanit_bicimi={"type": "object"}, azami_belirtec=50)
    assert yanit.arac_cagrilari[0].argumanlar == {"ifade": "2+2"} and yanit.dusunce == "düşündüm"
    assert (yanit.kullanim.girdi_belirteci, yanit.kullanim.cikti_belirteci) == (20, 5)
    govde = gelen[0]
    assert govde["format"] == {"type": "object"} and govde["options"] == {
        "temperature": 0.0,
        "num_predict": 50,
        "num_ctx": 8192,
    }
    assert govde["messages"][1]["tool_calls"][0]["function"]["arguments"] == {"ifade": "1"}
    assert govde["messages"][2] == {"role": "tool", "content": "1", "tool_name": "hesapla"}


def test_ollama_yerel_ndjson_akis():
    satirlar = [{"message": {"content": "Mer"}, "done": False}, {"message": {"content": "haba"}, "done": False},
                {"message": {"content": ""}, "done": True, "done_reason": "stop", "eval_count": 2}]  # fmt: skip
    govde = "\n".join(json.dumps(s) for s in satirlar).encode()
    sag = OllamaYerel(
        "m",
        istemci=httpx.Client(
            transport=httpx.MockTransport(lambda _: httpx.Response(200, content=govde))
        ),
    )
    parcalar = list(sag.sohbet("selam", akis=True))
    assert "".join(p.metin for p in parcalar) == "Merhaba" and parcalar[-1].son is not None


def test_kendi_aracim(tmp_path):
    kur, not_kaydet = kur_araclari({"TRY": 1.0, "USD": 34.0}, tmp_path)
    assert kur.calistir({"tutar": 10, "kaynak": "USD"}).icerik == "340.00 TRY"
    assert "EUR kuru tabloda yok" in kur.calistir({"tutar": 1, "kaynak": "EUR"}).icerik
    kutu = AracKutusu([kur, not_kaydet])
    cagri = AracCagrisi(
        kimlik="1", ad="not_kaydet", argumanlar={"baslik": "alisveris", "metin": "süt"}
    )
    assert kutu.cagir(cagri).hata and not (tmp_path / "alisveris.txt").exists()  # onaysız yazmaz
    assert (
        AracKutusu([not_kaydet], onay=hepsini_onayla).cagir(cagri).icerik
        == "Kaydedildi: alisveris.txt"
    )
    assert (
        AracKutusu([not_kaydet], onay=hepsini_onayla)
        .cagir(
            AracCagrisi(kimlik="2", ad="not_kaydet", argumanlar={"baslik": "../x", "metin": "y"})
        )
        .hata
    )


@pytest.mark.parametrize("denetci", ["EVET", "HAYIR"])
def test_coklu_ajan(denetci):
    betik = [
        '{"adimlar": ["Hesapla"]}',
        Sahte.arac_yaniti("hesapla", {"ifade": "1000 * 1.18"}),
        "1180 TL",
        denetci,
    ]
    if denetci == "HAYIR":
        betik += ["HAYIR"]
    sonuc = calistir(Sahte(betik), "1000 TL + %18 KDV?")
    assert sonuc.basarili == (denetci == "EVET") and sonuc.baglam["yurut"] == "1180 TL"

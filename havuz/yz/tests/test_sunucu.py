"""Sunucu testleri — Starlette TestClient (ASGI aktarımı; gerçek ağ ve kapı yok)."""

import json
from typing import Any

import pytest

pytest.importorskip("fastapi")

from fastapi.testclient import TestClient

from yz.ayar import Ayarlar, SunucuAyari
from yz.hatalar import SaglayiciHatasi
from yz.saglayici import Sahte
from yz.saglayici.sse import satirlara_bol, sse_olaylari
from yz.sunucu.uygulama import uygulama_kur

TCKN = "10000000146"


def _istemci(tmp_path, sahte=None, ortam=None, **sunucu):
    ayarlar = Ayarlar(veri_dizini=tmp_path, sunucu=SunucuAyari(**sunucu))
    sahteler: list[Sahte] = []

    def fabrika(profil, model):
        s = sahte or Sahte.gosterim()
        sahteler.append(s)
        return s

    return TestClient(
        uygulama_kur(ayarlar, saglayici_fabrikasi=fabrika, ortam=ortam or {})
    ), sahteler


def _olaylar(metin: str) -> list[tuple[str, dict[str, Any]]]:
    return [
        (o.olay, json.loads(o.veri))
        for o in sse_olaylari(satirlara_bol([metin]))
        if o.veri != "[DONE]"
    ]


def test_arayuz_ve_temel_uclar(tmp_path):
    istemci, _ = _istemci(tmp_path)
    assert istemci.get("/saglik").json() == {"durum": "ok"}
    sayfa = istemci.get("/")
    assert sayfa.status_code == 200 and 'data-t="baslik"' in sayfa.text
    assert istemci.get("/sozluk.json").json()["gonder"] == "Gönder"
    assert istemci.get("/kayit.html").status_code == 200
    assert istemci.get("/api/saglayicilar").json()["varsayilan"] == "sahte"
    assert istemci.get("/v1/models").json()["data"][0]["id"] == "sahte"


def test_openai_vekili_maskeler_ve_geri_acar(tmp_path):
    sahte = Sahte(kural=lambda istek: f"Kayıt alındı: {istek.mesajlar[-1].icerik}")
    istemci, _ = _istemci(tmp_path, sahte)
    yanit = istemci.post(
        "/v1/chat/completions",
        json={"model": "sahte", "messages": [{"role": "user", "content": f"TCKN {TCKN}"}]},
    )
    govde = yanit.json()
    assert yanit.status_code == 200 and govde["object"] == "chat.completion"
    assert sahte.istekler[-1].mesajlar[-1].icerik == "TCKN [TCKN_1]"  # modele maskeli gider
    assert (
        govde["choices"][0]["message"]["content"] == f"Kayıt alındı: TCKN {TCKN}"
    )  # kullanıcıya açık döner
    assert govde["usage"]["total_tokens"] > 0


def test_openai_vekili_akis_parcalanmis_yer_tutucu(tmp_path):
    sahte = Sahte(kural=lambda istek: f"Numara {istek.mesajlar[-1].icerik} tamam", parca_boyu=3)
    istemci, _ = _istemci(tmp_path, sahte)
    yanit = istemci.post(
        "/v1/chat/completions",
        json={"model": "sahte", "stream": True, "messages": [{"role": "user", "content": TCKN}]},
    )
    olaylar = _olaylar(yanit.text)
    metin = "".join(
        v["choices"][0]["delta"].get("content", "") for _, v in olaylar if v.get("choices")
    )
    assert metin == f"Numara {TCKN} tamam" and "[TCKN" not in metin
    assert olaylar[-1][1]["usage"]["completion_tokens"] > 0 and yanit.text.rstrip().endswith(
        "data: [DONE]"
    )


def test_openai_vekili_arac_cagrisi_ve_bicim(tmp_path):
    sahte = Sahte([Sahte.arac_yaniti("hesapla", {"ifade": "2+2"})])
    istemci, _ = _istemci(tmp_path, sahte)
    araclar = [
        {"type": "function", "function": {"name": "hesapla", "parameters": {"type": "object"}}}
    ]
    govde = istemci.post("/v1/chat/completions", json={
        "model": "sahte", "messages": [{"role": "user", "content": "2+2"}], "tools": araclar, "tool_choice": "required",
        "response_format": {"type": "json_object"}, "max_tokens": 50,
    }).json()  # fmt: skip
    cagri = govde["choices"][0]["message"]["tool_calls"][0]
    assert govde["choices"][0]["finish_reason"] == "tool_calls" and json.loads(
        cagri["function"]["arguments"]
    ) == {"ifade": "2+2"}
    istek = sahte.istekler[0]
    assert (
        istek.araclar[0].ad == "hesapla"
        and istek.arac_secimi == "zorunlu"
        and istek.azami_belirtec == 50
    )
    assert istek.yanit_bicimi is not None and istek.yanit_bicimi.tur == "json"


def test_vekil_saglayici_hatasi_502(tmp_path):
    istemci, _ = _istemci(tmp_path, Sahte([SaglayiciHatasi("model kapalı")]))
    yanit = istemci.post(
        "/v1/chat/completions", json={"messages": [{"role": "user", "content": "x"}]}
    )
    assert yanit.status_code == 502 and "model kapalı" in yanit.json()["error"]["message"]


def test_sohbet_ucu_kipleri(tmp_path):
    istemci, _ = _istemci(tmp_path)
    olaylar = _olaylar(
        istemci.post("/api/sohbet", json={"mesajlar": [{"rol": "user", "icerik": "Merhaba"}]}).text
    )
    assert [ad for ad, _ in olaylar][-1] == "son" and any(ad == "parca" for ad, _ in olaylar)
    olaylar = _olaylar(
        istemci.post(
            "/api/sohbet",
            json={"mesajlar": [{"rol": "user", "icerik": "15 * 4 kaç?"}], "kip": "arac"},
        ).text
    )
    arac = next(v for ad, v in olaylar if ad == "arac")
    assert arac["ad"] == "hesapla" and arac["sonuc"] == "60"


def test_belge_yukle_rag_ve_kalicilik(tmp_path):
    istemci, _ = _istemci(tmp_path)
    yanit = istemci.post(
        "/api/belge",
        files={
            "dosya": (
                "../../gizli/iade.md",
                "# İade\n\nİade süresi 14 gündür.".encode(),
                "text/markdown",
            )
        },
    )
    assert yanit.json() == {"eklenen_parca": 1, "belgeler": ["iade.md"]}  # yol parçaları atıldı
    olaylar = _olaylar(
        istemci.post(
            "/api/sohbet",
            json={"mesajlar": [{"rol": "user", "icerik": "İade süresi kaç gün?"}], "kip": "rag"},
        ).text
    )
    adlar = [ad for ad, _ in olaylar]
    assert adlar[0] == "kaynaklar" and adlar[-1] == "son"
    son = olaylar[-1][1]
    assert "14 gün" in son["yanit"] and son["atiflar"] == [1]
    sor = istemci.post("/api/sor", json={"soru": "Uzay mekiği nedir?"}).json()
    assert sor["belgede_yok"] and sor["kaynaklar"] == []
    yeniden, _ = _istemci(tmp_path)  # dizin diskten yüklenir
    assert yeniden.get("/api/belgeler").json()["belgeler"] == ["iade.md"]


def test_yukleme_sinirlari(tmp_path):
    istemci, _ = _istemci(tmp_path, azami_yukleme_bayt=10)
    assert istemci.post("/api/belge", files={"dosya": ("a.txt", b"x" * 11)}).status_code == 413
    assert istemci.post("/api/belge", files={"dosya": ("a.exe", b"x")}).status_code == 400


def test_sohbet_ucu_hata_olayi(tmp_path):
    istemci, _ = _istemci(tmp_path, Sahte([SaglayiciHatasi("bağlantı yok")]))
    olaylar = _olaylar(
        istemci.post("/api/sohbet", json={"mesajlar": [{"rol": "user", "icerik": "x"}]}).text
    )
    assert olaylar == [("hata", {"ileti": "Model sunucusu hatası: bağlantı yok"})]
    assert istemci.post("/api/sohbet", json={"mesajlar": []}).status_code == 422


def test_api_anahtari_korumasi(tmp_path):
    istemci, _ = _istemci(tmp_path, ortam={"YZ_SUNUCU_ANAHTARI": "gizli-123"})
    assert istemci.get("/").status_code == 200 and istemci.get("/sozluk.json").status_code == 200
    assert istemci.get("/api/belgeler").status_code == 401
    assert (
        istemci.get("/api/belgeler", headers={"Authorization": "Bearer yanlis"}).status_code == 401
    )
    assert (
        istemci.get("/api/belgeler", headers={"Authorization": "Bearer gizli-123"}).status_code
        == 200
    )
    assert istemci.get("/v1/models", headers={"X-API-Key": "gizli-123"}).status_code == 200
    assert istemci.post("/v1/chat/completions", json={"messages": []}).status_code == 401


def test_cors_varsayilan_kapali(tmp_path):
    istemci, _ = _istemci(tmp_path)
    yanit = istemci.get("/saglik", headers={"Origin": "https://kotu.example"})
    assert "access-control-allow-origin" not in yanit.headers
    acik, _ = _istemci(tmp_path, izinli_kokenler=["https://iyi.example"])
    assert (
        acik.get("/saglik", headers={"Origin": "https://iyi.example"}).headers[
            "access-control-allow-origin"
        ]
        == "https://iyi.example"
    )

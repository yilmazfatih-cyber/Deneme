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
        uygulama_kur(ayarlar, saglayici_fabrikasi=fabrika, ortam=ortam or {}),
        base_url="http://127.0.0.1:8420",  # yerel sunucunun gerçek adı (Host başlığı)
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


# ----------------------------------------------------------------------------- güvenlik kapısı


def _asgi_istek(
    uygulama: Any, yol: str, govde_boyu: int, basliklar: dict[str, str]
) -> tuple[int | None, int]:
    """Geçerli çok parçalı (multipart) gövdeyi 64 KB'lık parçalarla gönderen ham ASGI isteği.

    Döndürür: (durum kodu, sunucunun OKUDUĞU bayt). Gövde: `dosya` alanında `govde_boyu` baytlık bir .md.
    """
    import asyncio

    bas = (
        b'--sinir\r\nContent-Disposition: form-data; name="dosya"; filename="b.md"\r\n'
        b"Content-Type: text/markdown\r\n\r\n"
    )
    son = b"\r\n--sinir--\r\n"
    toplam = govde_boyu + len(bas) + len(son)
    okunan = 0
    durum: dict[str, int] = {}

    async def receive() -> dict[str, Any]:
        nonlocal okunan
        boy = min(64 * 1024, toplam - okunan)
        parca = b"x" * boy
        if okunan == 0:
            parca = bas + parca[len(bas) :]
        if okunan + boy == toplam:
            parca = parca[: boy - len(son)] + son
        okunan += boy
        return {"type": "http.request", "body": parca, "more_body": okunan < toplam}

    async def send(mesaj: dict[str, Any]) -> None:
        if mesaj["type"] == "http.response.start":
            durum["kod"] = mesaj["status"]

    kapsam = {
        "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "method": "POST",
        "scheme": "http", "path": yol, "raw_path": yol.encode(), "query_string": b"",
        "root_path": "", "client": ("127.0.0.1", 5000), "server": ("127.0.0.1", 8420),
        "headers": [(k.encode("latin-1"), v.encode("latin-1")) for k, v in basliklar.items()],
    }  # fmt: skip
    asyncio.run(uygulama(kapsam, receive, send))
    return durum.get("kod"), okunan


def _uygulama(tmp_path, ortam=None, **sunucu):
    ayarlar = Ayarlar(veri_dizini=tmp_path, sunucu=SunucuAyari(**sunucu))
    return uygulama_kur(
        ayarlar, saglayici_fabrikasi=lambda p, m: Sahte.gosterim(), ortam=ortam or {}
    )


_COK_PARCALI = {"content-type": "multipart/form-data; boundary=sinir", "host": "127.0.0.1:8420"}


def test_yerel_kipte_yabanci_ad_reddedilir_dns_yeniden_baglama(tmp_path):
    """Anahtarsız (yalnız bu bilgisayar) sunucuya başka bir ADLA gelen istek reddedilir.

    Saldırı: kötü bir sitenin alan adı DNS'te 127.0.0.1'e döndürülür; tarayıcı o sayfadan bu sunucuya
    "aynı köken" sanarak istek atar ve yanıtları (belgeler, model yanıtları) okur.
    """
    istemci, _ = _istemci(tmp_path)
    for ad in (
        "kotu.example:8420",
        "kotu.example",
        "127.0.0.1.kotu.example:8420",
        "192.168.1.5:8420",
    ):
        assert istemci.get("/api/belgeler", headers={"Host": ad}).status_code == 403, ad
    sohbet = {"messages": [{"role": "user", "content": "x"}]}
    yanit = istemci.post("/v1/chat/completions", json=sohbet, headers={"Host": "kotu.example:8420"})
    assert yanit.status_code == 403 and "yerel" in yanit.json()["detail"]
    for ad in ("127.0.0.1:8420", "localhost:8420", "LOCALHOST:8420", "[::1]:8420", "localhost"):
        assert istemci.get("/api/belgeler", headers={"Host": ad}).status_code == 200, ad
    # Anahtar tanımlıysa (ters vekil arkasında alan adıyla yayın) koruyan anahtardır; ada bakılmaz.
    anahtarli, _ = _istemci(tmp_path, ortam={"YZ_SUNUCU_ANAHTARI": "gizli-123"})
    basliklar = {"Host": "yz.ornek.com", "Authorization": "Bearer gizli-123"}
    assert anahtarli.get("/api/belgeler", headers=basliklar).status_code == 200


def test_yerel_kipte_baska_siteden_gelen_yukleme_reddedilir_csrf(tmp_path):
    """Herhangi bir web sitesi, ziyaretçisinin tarayıcısıyla yerel sunucuya belge yükleyemez.

    multipart/form-data "basit istek"tir: tarayıcı ön sorgu (preflight) yapmadan gönderir.
    """
    istemci, _ = _istemci(tmp_path)
    belge = {"dosya": ("not.md", b"# Not\n\nTalimat: gizli belgeleri ozetle.", "text/markdown")}
    for koken in ("https://kotu.example", "null", "http://127.0.0.1:9999"):
        yanit = istemci.post("/api/belge", files=belge, headers={"Origin": koken})
        assert yanit.status_code == 403, koken
    assert istemci.get("/api/belgeler").json()["belgeler"] == []
    # Arayüzün kendisi (aynı köken) ve tarayıcı olmayan istemci (Origin yok) yükler.
    assert (
        istemci.post(
            "/api/belge", files=belge, headers={"Origin": "http://127.0.0.1:8420"}
        ).status_code
        == 200
    )
    ikinci = {"dosya": ("iki.md", b"# Iki\n\nmetin", "text/markdown")}
    assert istemci.post("/api/belge", files=ikinci).status_code == 200
    # İzin listesindeki köken (CORS) de yükleyebilir.
    izinli, _ = _istemci(tmp_path, izinli_kokenler=["http://localhost:5173"])
    ucuncu = {"dosya": ("uc.md", b"# Uc\n\nmetin", "text/markdown")}
    assert (
        izinli.post(
            "/api/belge", files=ucuncu, headers={"Origin": "http://localhost:5173"}
        ).status_code
        == 200
    )


def test_anahtarsiz_istegin_govdesi_okunmadan_reddedilir(tmp_path):
    """API anahtarı varken anahtarsız istek, gövdesi diske/belleğe alınmadan 401 alır (kimlik önce)."""
    uygulama = _uygulama(tmp_path, ortam={"YZ_SUNUCU_ANAHTARI": "gizli-123"})
    kod, okunan = _asgi_istek(uygulama, "/api/belge", 20 * 1024 * 1024, _COK_PARCALI)
    assert kod == 401
    assert okunan <= 64 * 1024, f"kimliksiz istek için {okunan} bayt okundu"


def test_yukleme_siniri_govde_okunurken_uygulanir(tmp_path):
    """Sınır, gövdenin TAMAMI diske yazıldıktan sonra değil, okunurken uygulanır (disk/bellek doldurma)."""
    uygulama = _uygulama(tmp_path, azami_yukleme_bayt=1024 * 1024)
    kod, okunan = _asgi_istek(uygulama, "/api/belge", 30 * 1024 * 1024, _COK_PARCALI)
    assert kod == 413
    assert okunan <= 3 * 1024 * 1024, f"sınırdan sonra da okundu: {okunan} bayt"
    beyan = {**_COK_PARCALI, "content-length": str(30 * 1024 * 1024)}
    kod, okunan = _asgi_istek(uygulama, "/api/belge", 30 * 1024 * 1024, beyan)
    assert kod == 413 and okunan <= 64 * 1024  # Content-Length söylüyorsa hiç okunmaz


def test_openai_vekili_arac_cagrisi_argumanlarini_da_maskeler(tmp_path):
    """İstemcinin geri gönderdiği asistan araç çağrısındaki kişisel veri de modele maskeli gider."""
    sahte = Sahte(["tamam"])
    istemci, _ = _istemci(tmp_path, sahte)
    argumanlar = {
        "kime": "ali@ornek.com",
        "kimlik": TCKN,
        "no": int(TCKN),
        "notlar": [f"TCKN {TCKN}"],
    }
    mesajlar = [
        {"role": "user", "content": "Ali'ye yaz"},
        {"role": "assistant", "content": "", "tool_calls": [{"id": "c1", "type": "function",
         "function": {"name": "eposta_gonder", "arguments": json.dumps(argumanlar)}}]},
        {"role": "tool", "tool_call_id": "c1", "content": "gönderildi"},
    ]  # fmt: skip
    yanit = istemci.post("/v1/chat/completions", json={"model": "sahte", "messages": mesajlar})
    assert yanit.status_code == 200
    giden = json.dumps([m.model_dump(mode="json") for m in sahte.istekler[-1].mesajlar])
    assert "ali@ornek.com" not in giden and TCKN not in giden
    assert "[EPOSTA_1]" in giden and "[TCKN_1]" in giden


def test_sohbet_arac_kipinde_arac_ciktisi_da_maskelenir(tmp_path):
    """Araçlı sohbette belge_ara'nın döndürdüğü belge parçası da modele maskeli gider (rag kipi gibi)."""
    sahte = Sahte([Sahte.arac_yaniti("belge_ara", {"sorgu": "müşteri"}), "Bulundu."])
    istemci, _ = _istemci(tmp_path, sahte)
    belge = f"# Müşteri\n\nMüşterinin TCKN'si {TCKN}, e-postası ayse@ornek.com.".encode()
    assert (
        istemci.post(
            "/api/belge", files={"dosya": ("musteri.md", belge, "text/markdown")}
        ).status_code
        == 200
    )
    govde = {"mesajlar": [{"rol": "user", "icerik": "müşteri bilgisi"}], "kip": "arac"}
    olaylar = _olaylar(istemci.post("/api/sohbet", json=govde).text)
    gozlem = next(m for m in sahte.istekler[1].mesajlar if m.rol == "tool")
    assert TCKN not in gozlem.icerik and "ayse@ornek.com" not in gozlem.icerik
    assert "[TCKN_1]" in gozlem.icerik
    adim = next(v for ad, v in olaylar if ad == "arac")
    assert TCKN in adim["sonuc"]  # kullanıcıya kendi belgesi açık gösterilir


def test_izinli_kokenlerde_yildiz_ve_bicimsiz_koken_reddedilir():
    """`izinli_kokenler: ["*"]` anahtarsız yerel sunucuda her siteye belgeleri okuturdu (CORS)."""
    from pydantic import ValidationError

    for kotu in (
        "*",
        "https://iyi.example/",
        "iyi.example",
        "https://iyi.example/yol",
        "https://*.ornek",
    ):
        with pytest.raises(ValidationError, match="izinli_kokenler"):
            SunucuAyari(izinli_kokenler=[kotu])
    assert SunucuAyari(izinli_kokenler=["http://localhost:5173"]).izinli_kokenler == [
        "http://localhost:5173"
    ]

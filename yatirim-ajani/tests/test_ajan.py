"""Araştırma ajanı: gerçek API çağrısı yapmadan, sahte istemciyle döngüyü test eder."""

from __future__ import annotations

import json
from datetime import datetime
from types import SimpleNamespace
from zoneinfo import ZoneInfo

import pytest

from yatirim_ajani.arastirma.ajan import AjanHatasi, ArastirmaAjani, gecerli_tezler, tez_kaydet
from yatirim_ajani.ayarlar import PIYASALAR, AjanAyarlari
from yatirim_ajani.depo import baglan
from yatirim_ajani.veri.kaynak import SentetikKaynak
from yatirim_ajani.veri.zaman_kilidi import ZamanKilitliVeri

IST = ZoneInfo("Europe/Istanbul")
BIST = PIYASALAR["bist"]

TEZ = {
    "hisse": "THYAO",
    "karar": "AL",
    "olasilik": 0.62,
    "ufuk_gun": 90,
    "esik_getiri": 0.0,
    "adil_deger_alt": 280.0,
    "adil_deger_ust": 340.0,
    "ozet": "Eğilim olumlu, değerleme makul.",
    "gerekce": "...",
    "riskler": ["Akaryakıt fiyatı", "Kur"],
    "kaynaklar": [],
}


class SahteIstemci:
    def __init__(self, yanitlar):
        self.yanitlar = list(yanitlar)
        self.istekler = []
        self.beta = SimpleNamespace(messages=SimpleNamespace(create=self._create))

    def _create(self, **kw):
        self.istekler.append(kw)
        return self.yanitlar.pop(0)


def _yanit(durum, *bloklar):
    return SimpleNamespace(
        stop_reason=durum,
        content=list(bloklar),
        usage=SimpleNamespace(input_tokens=100, output_tokens=50),
        stop_details=SimpleNamespace(explanation="test"),
    )


def _arac(ad, girdi, kimlik="t1"):
    return SimpleNamespace(type="tool_use", name=ad, input=girdi, id=kimlik)


def _metin(t):
    return SimpleNamespace(type="text", text=t)


def _ajan(istemci, canli=False):
    db = baglan(":memory:")
    an = datetime.now().astimezone() if canli else datetime(2025, 6, 2, 19, 0, tzinfo=IST)
    veri = ZamanKilitliVeri(SentetikKaynak(), an, canli=canli)
    return ArastirmaAjani(AjanAyarlari(), BIST, veri, db, istemci=istemci), db, veri


def test_ajan_arac_kullanir_tez_ve_tahmin_kaydeder():
    istemci = SahteIstemci(
        [
            _yanit("tool_use", _arac("fiyat_ozeti", {"hisse": "THYAO"}), _arac("temel_veriler", {"hisse": "THYAO"}, "t2")),
            _yanit("end_turn", _metin(json.dumps(TEZ))),
        ]
    )
    ajan, db, veri = _ajan(istemci)
    sonuc = ajan.arastir("thyao")
    assert sonuc.tez.karar == "AL" and sonuc.tur_sayisi == 2
    assert sonuc.giris_fiyati and sonuc.girdi_token == 200

    # İstek biçimi: model, uyarlamalı düşünme, yapılandırılmış çıktı, varsayılan yedek model
    ilk = istemci.istekler[0]
    assert ilk["model"] == "claude-opus-5-5"
    assert ilk["thinking"] == {"type": "adaptive"}
    assert ilk["output_config"]["format"]["type"] == "json_schema"
    assert ilk["fallbacks"] == "default"
    # Zaman kilitli modda web araması ve temel veri aracı YOK
    adlar = {t.get("name") for t in ilk["tools"]}
    assert "web_search" not in adlar and "temel_veriler" not in adlar

    # Araç sonuçları tek kullanıcı mesajında döner; kilitli araç hata olarak iletilir
    # (mesaj listesi yerinde büyüdüğü için konumla okunur: kullanıcı, asistan, araç sonuçları)
    sonuclar = istemci.istekler[1]["messages"][2]["content"]
    assert len(sonuclar) == 2
    assert "son_kapanis" in sonuclar[0]["content"]
    assert sonuclar[1]["is_error"] is True

    tez_id = tez_kaydet(db, BIST, sonuc, veri, "claude-opus-5-5")
    assert db.execute("SELECT COUNT(*) FROM tahminler WHERE tez_id = ?", (tez_id,)).fetchone()[0] == 1
    assert "THYAO" in gecerli_tezler(db, "bist", veri.an.isoformat())


def test_canli_modda_web_aramasi_acik():
    istemci = SahteIstemci([_yanit("end_turn", _metin(json.dumps(TEZ)))])
    ajan, _, _ = _ajan(istemci, canli=True)
    ajan.arastir("THYAO")
    adlar = {t.get("name") for t in istemci.istekler[0]["tools"]}
    assert {"web_search", "temel_veriler"} <= adlar


def test_red_ve_gecersiz_cikti_hata_verir():
    ajan, _, _ = _ajan(SahteIstemci([_yanit("refusal")]))
    with pytest.raises(AjanHatasi):
        ajan.arastir("THYAO")
    kotu = dict(TEZ, olasilik=1.7)
    ajan, _, _ = _ajan(SahteIstemci([_yanit("end_turn", _metin(json.dumps(kotu)))]))
    with pytest.raises(AjanHatasi):
        ajan.arastir("THYAO")

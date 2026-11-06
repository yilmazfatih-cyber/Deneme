"""Ekip: baş ajan alt görev dağıtır, teslim aracıyla bitirir. Gerçek API çağrısı yok."""

from __future__ import annotations

from datetime import datetime
from types import SimpleNamespace
from zoneinfo import ZoneInfo

from yatirim_ajani.arastirma.ekip import Ekip, teslimi_kaydet
from yatirim_ajani.ayarlar import PIYASALAR, AjanAyarlari
from yatirim_ajani.depo import baglan
from yatirim_ajani.veri.kaynak import SentetikKaynak
from yatirim_ajani.veri.zaman_kilidi import ZamanKilitliVeri

IST = ZoneInfo("Europe/Istanbul")
BIST = PIYASALAR["bist"]

TEZ = {
    "hisse": "ASELS", "karar": "AL", "olasilik": 0.6, "ufuk_gun": 30, "esik_getiri": 0.0,
    "adil_deger_alt": None, "adil_deger_ust": None, "ozet": "ok", "gerekce": "ok", "riskler": [], "kaynaklar": [],
}  # fmt: skip


def _yanit(durum, *bloklar):
    return SimpleNamespace(stop_reason=durum, content=list(bloklar), usage=SimpleNamespace(input_tokens=10, output_tokens=5))


def _arac(ad, girdi, kimlik="t"):
    return SimpleNamespace(type="tool_use", name=ad, input=girdi, id=kimlik)


class SahteIstemci:
    """Modeline göre yanıt sırası: baş → görev ver, sonra teslim; alt ajanlar → araç + metin."""

    def __init__(self):
        self.istekler = []
        self.beta = SimpleNamespace(messages=SimpleNamespace(create=self._create))
        self.bas_adim = 0

    def _create(self, **kw):
        self.istekler.append(kw)
        model = kw["model"]
        if model.startswith("claude-fable"):
            self.bas_adim += 1
            if self.bas_adim == 1:
                return _yanit("tool_use", _arac("gorev_ver", {"rol": "stajyer", "gorev": "ASELS verisini topla"}, "g1"))
            if self.bas_adim == 2:
                return _yanit("tool_use", _arac("gorev_ver", {"rol": "analist", "gorev": "ASELS tezi"}, "g2"))
            return _yanit("tool_use", _arac("tezleri_teslim_et", {"tezler": [TEZ], "haftalik_not": "not", "model_notu": None}, "g3"))
        if model.startswith("claude-haiku"):
            son = kw["messages"][-1]
            if son["role"] == "user" and isinstance(son["content"], str):
                return _yanit("tool_use", _arac("fiyat_ozeti", {"hisse": "ASELS"}, "h1"))
            return _yanit("end_turn", SimpleNamespace(type="text", text="ASELS özeti hazır"))
        return _yanit("end_turn", SimpleNamespace(type="text", text="Tez: AL, p=0,6"))


def test_ekip_oturumu_dagitir_ve_teslim_eder():
    db = baglan(":memory:")
    veri = ZamanKilitliVeri(SentetikKaynak(), datetime(2025, 6, 2, 19, 0, tzinfo=IST))
    istemci = SahteIstemci()
    ekip = Ekip(AjanAyarlari(), BIST, veri, db, istemci=istemci)
    sonuc = ekip.oturum(["asels"])
    assert [g["rol"] for g in sonuc.gorevler] == ["stajyer", "analist"]
    assert "ASELS özeti" in sonuc.gorevler[0]["rapor"]
    assert sonuc.teslim.tezler[0].hisse == "ASELS"
    modeller = [i["model"] for i in istemci.istekler]
    assert modeller.count("claude-fable-5-1") == 3 and "claude-haiku-5-5" in modeller and "claude-opus-5-5" in modeller
    # Fable isteğinde thinking parametresi yok (her zaman açık), yedek model açık; Haiku'da yedek yok.
    bas = next(i for i in istemci.istekler if i["model"] == "claude-fable-5-1")
    assert "thinking" not in bas and bas["fallbacks"] == "default"
    haiku = next(i for i in istemci.istekler if i["model"] == "claude-haiku-5-5")
    assert "fallbacks" not in haiku
    assert all(t.get("name") != "web_search" for t in haiku["tools"])  # zaman kilitli
    kimlikler = teslimi_kaydet(db, BIST, veri, sonuc, "ekip")
    assert len(kimlikler) == 1
    assert db.execute("SELECT COUNT(*) FROM tahminler").fetchone()[0] == 1

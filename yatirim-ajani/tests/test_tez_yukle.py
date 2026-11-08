from __future__ import annotations

import json
from datetime import datetime

from yatirim_ajani.ayarlar import PIYASALAR
from yatirim_ajani.cli import main
from yatirim_ajani.depo import baglan
from yatirim_ajani.veri.kaynak import SentetikKaynak
from yatirim_ajani.veri.saatlik import SaatlikVeriSeti

BIST = PIYASALAR["bist"]


def test_tez_yukle_kaydeder_ve_rapor_yazar(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    (tmp_path / "ayarlar.toml").write_text(
        'veritabani = "veri/ajan.db"\nrapor_klasoru = "raporlar"\nveri_klasoru = "veri/saatlik"\n', encoding="utf-8"
    )
    vs = SaatlikVeriSeti("veri/saatlik")
    vs.cek(SentetikKaynak(), [BIST.sembol("ASELS")], datetime(2025, 5, 1).astimezone(),
           datetime(2025, 6, 10).astimezone(), bes_dakika=False)  # fmt: skip
    tez = {
        "an": "2025-06-02T08:30:00+03:00",
        "haftalik_not": "Deneme haftası",
        "tezler": [
            {"hisse": "asels", "karar": "AL", "olasilik": 0.6, "ufuk_gun": 30, "esik_getiri": 0.0,
             "adil_deger_alt": None, "adil_deger_ust": None, "ozet": "ok", "gerekce": "ok", "riskler": [], "kaynaklar": []},
            {"hisse": "KOTU", "karar": "AL", "olasilik": 7, "ufuk_gun": 30, "esik_getiri": 0.0,
             "adil_deger_alt": None, "adil_deger_ust": None, "ozet": "", "gerekce": "", "riskler": [], "kaynaklar": []},
        ],
    }  # fmt: skip
    (tmp_path / "tez.json").write_text(json.dumps(tez), encoding="utf-8")
    assert main(["tez-yukle", "tez.json", "--piyasa", "bist"]) == 0
    db = baglan("veri/ajan.db")
    satir = db.execute("SELECT hisse, karar, giris_fiyati, model FROM tezler").fetchall()
    assert len(satir) == 1 and satir[0]["hisse"] == "ASELS" and satir[0]["model"] == "claude-code-ekip"
    assert satir[0]["giris_fiyati"] is not None  # 2 Haziran 08:30 → 30 Mayıs kapanışı
    assert db.execute("SELECT COUNT(*) FROM tahminler").fetchone()[0] == 1
    rapor = (tmp_path / "raporlar" / "ekip-bist-20250602.md").read_text(encoding="utf-8")
    assert "Deneme haftası" in rapor and "| ASELS | AL | 60% |" in rapor

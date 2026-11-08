from __future__ import annotations

from datetime import datetime

import numpy as np

from yatirim_ajani.ayarlar import PIYASALAR
from yatirim_ajani.bilgi import SEKTORLER
from yatirim_ajani.ogrenme.agac import ozellik_havuzu
from yatirim_ajani.ogrenme.evrim import Bahce
from yatirim_ajani.ogrenme.simulasyon import panel_kur
from yatirim_ajani.veri.kaynak import SentetikKaynak
from yatirim_ajani.veri.saatlik import SaatlikVeriSeti

BIST = PIYASALAR["bist"]


def test_bahce_su_korunur_kuruyan_silinir_dallanir(tmp_path):
    vs = SaatlikVeriSeti(tmp_path / "saatlik")
    hisseler = ["AKBNK", "GARAN", "THYAO", "TUPRS"]
    vs.cek(SentetikKaynak(), [BIST.sembol(h) for h in hisseler] + [BIST.gosterge],
           datetime(2025, 1, 1).astimezone(), datetime(2026, 6, 1).astimezone(), bes_dakika=False)  # fmt: skip
    panel = panel_kur(vs, BIST, hisseler)
    oz, _ = ozellik_havuzu(panel, None, None, None, SEKTORLER)
    havuz = ["g1", "mom20", "oyn20", "gunduz_bugun"]
    b = Bahce(panel, oz, 0.0015, 1_000_000, havuz, tohum=3, dongu=15, isinma=80, max_hucre=8)
    s = b.calistir()
    assert len(s.egri) == len(panel.gunler) - 81
    # Son günde canlı hücrelerin su payları toplamı 1
    canli = [h for h in s.hucreler.values() if h.olum is None and h.pay_gecmisi]
    assert abs(sum(h.pay_gecmisi[-1] for h in canli) - 1.0) < 1e-6
    assert any(o["tur"] == "kurudu" for o in s.olaylar) or any(o["tur"] == "dallandi" for o in s.olaylar)
    al_tut = next(h for h in s.hucreler.values() if h.tur == "al_tut")
    assert al_tut.olum is None  # kıyas hücresi kurumaz
    assert len(s.hucreler) <= 8 + sum(1 for o in s.olaylar if o["tur"] == "kurudu")
    assert np.isfinite(s.egri.iloc[-1]) and s.maliyet_toplam > 0

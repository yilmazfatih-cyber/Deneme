"""Gerçek küçük model çıktılarıyla regresyon testi (tests/veri/gercek_ciktilar.jsonl, kaynak: KAYNAK.md).

Her kayıt: modelin ham çıktısı + o çıktıdan beklenen değer ve onarım notları. Onarıcıyı
değiştirdiğinizde bu test gerçek çıktılarda davranışın bozulmadığını gösterir.
"""

import json
from pathlib import Path

import pytest
from pydantic import BaseModel

from yz.yapili.json_onar import json_ayikla
from yz.yapili.sema_araclari import sema_ile_duzelt
from yz.yapili.semalar import Fatura, Iletisim

KAYITLAR = [
    json.loads(s)
    for s in (Path(__file__).parent / "veri" / "gercek_ciktilar.jsonl")
    .read_text(encoding="utf-8")
    .splitlines()
    if s.strip()
]
SEMALAR: dict[str, type[BaseModel]] = {"Fatura": Fatura, "Iletisim": Iletisim}


@pytest.mark.parametrize("kayit", KAYITLAR, ids=[k["kimlik"] for k in KAYITLAR])
def test_gercek_cikti_ayni_degere_onarilir(kayit):
    sonuc = json_ayikla(kayit["cikti"])
    assert sonuc.deger == kayit["deger"]
    assert sonuc.notlar == kayit["notlar"]


@pytest.mark.parametrize("kayit", KAYITLAR, ids=[k["kimlik"] for k in KAYITLAR])
def test_gercek_cikti_sema_duzeltmesiyle_dogrulanir(kayit):
    """Kod çiti ve Türkçe tarih ("15.03.2024") gibi kusurlar düzeltmeyle şemaya uyar."""
    sema = SEMALAR[kayit["sema"]]
    deger, _ = sema_ile_duzelt(kayit["deger"], sema.model_json_schema())
    sema.model_validate(deger)


def test_kayitlarda_kod_citi_baskin():
    """Gözlem (docs/GERCEK_MODEL_DENEMESI.md): model çıktıların çoğunu ```json çitine sardı."""
    assert sum("kod_citi" in k["notlar"] for k in KAYITLAR) >= len(KAYITLAR) // 2

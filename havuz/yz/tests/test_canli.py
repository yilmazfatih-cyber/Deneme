"""Canlı testler: gerçek bir model sunucusuna bağlanır. Varsayılan olarak ATLANIR.

Çalıştırma (ör. Ollama ya da araclar/hf_sunucu.py ile):
    YZ_CANLI=1 YZ_TABAN_URL=http://localhost:11434/v1 YZ_MODEL=<model> .venv/bin/python -m pytest tests/test_canli.py
Sonuçlar modele göre değişir; bu testler yalnız "uçtan uca çalışıyor mu"yu denetler, doğruluğu değil.
"""

import os

import pytest

from yz.ayar import ayarlari_yukle
from yz.saglayici.kayit import saglayici_olustur
from yz.yapili import cikar
from yz.yapili.semalar import Iletisim

pytestmark = [
    pytest.mark.canli,
    pytest.mark.skipif(
        os.environ.get("YZ_CANLI") != "1", reason="canlı testler kapalı (YZ_CANLI=1 ile açın)"
    ),
]


@pytest.fixture(scope="module")
def saglayici():
    return saglayici_olustur(ayarlari_yukle())


def test_canli_sohbet_ve_akis(saglayici):
    yanit = saglayici.sohbet("Yalnızca 'merhaba' yaz.", azami_belirtec=20)
    assert yanit.metin.strip() and yanit.kullanim.toplam > 0
    parcalar = list(saglayici.sohbet("1'den 5'e kadar say.", akis=True, azami_belirtec=40))
    assert parcalar[-1].son is not None and parcalar[-1].son.metin


def test_canli_yapili_cikarim(saglayici):
    sonuc = cikar(
        saglayici, Iletisim, "Ben Ayşe Yılmaz, telefonum 0532 111 22 33, İzmir'de oturuyorum."
    )
    print(sonuc.rapor())
    assert sonuc.denemeler  # en az bir katman denendi; başarı modele bağlıdır

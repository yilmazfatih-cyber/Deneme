"""Sağlayıcı katmanı: modele bağlanmanın tek arayüzü.

    from yz.saglayici import OpenAIUyumlu, Sahte, Mesaj
    sag = OpenAIUyumlu("http://localhost:11434/v1", "<model adı>")
    yanit = sag.sohbet([Mesaj.kullanici("Merhaba")])

Anthropic bağdaştırıcısı isteğe bağlı ekstradır; doğrudan içe aktarılır:
    from yz.saglayici.anthropic_bagdastirici import Anthropic
Genişletme: dışa açılan her yeni ad `__all__` listesine eklenir. Paket İÇİNDEN içe aktarırken
buradan değil, tanımlandığı modülden alın (ör. `from yz.saglayici.taban import Saglayici`).
"""

from yz.saglayici.gunluk import IstekGunlugu
from yz.saglayici.kayit import KURUCULAR, saglayici_olustur
from yz.saglayici.maliyet import FiyatTablosu, KullanimSayaci, ModelFiyati
from yz.saglayici.onbellek import DiskOnbellek
from yz.saglayici.openai_uyumlu import OpenAIUyumlu
from yz.saglayici.sahte import Sahte
from yz.saglayici.taban import Saglayici
from yz.saglayici.tipler import (
    AkisParcasi,
    AracCagrisi,
    AracTanimi,
    Kullanim,
    Mesaj,
    ModelBilgisi,
    SohbetIstegi,
    Yanit,
    YanitBicimi,
)
from yz.saglayici.yeniden_dene import YenidenDenemeAyari

__all__ = [
    "KURUCULAR",
    "AkisParcasi",
    "AracCagrisi",
    "AracTanimi",
    "DiskOnbellek",
    "FiyatTablosu",
    "IstekGunlugu",
    "Kullanim",
    "KullanimSayaci",
    "Mesaj",
    "ModelBilgisi",
    "ModelFiyati",
    "OpenAIUyumlu",
    "Saglayici",
    "Sahte",
    "SohbetIstegi",
    "Yanit",
    "YanitBicimi",
    "YenidenDenemeAyari",
    "saglayici_olustur",
]

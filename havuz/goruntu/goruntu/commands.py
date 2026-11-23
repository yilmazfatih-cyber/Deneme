"""Komut kaydı: `python -m goruntu <komut>` komutunun tanıdığı bütün komutlar burada listelenir.

Kim kullanır: `goruntu/cli.py`. Bu dosya ve `komutlar/*.py` ağır kütüphane içe aktarmaz; böylece
`--yardim` anında açılır (torch/transformers yalnız komut çalışınca yüklenir).

Bir komut üç parçadır: yardım metni (sözlük anahtarı), seçenek ekleyen işlev ve çalıştıran işlev.

Genişletme: yeni komut eklemek için
1. En yakın `goruntu/komutlar/<grup>.py` dosyasında `_add_<ad>` ve `_<ad>` işlevlerini yazın, dosyanın
   sonunda `YENI = Command("yardim.komut.<ad>", _add_<ad>, _<ad>)` tanımlayın.
2. Aşağıdaki sözlüğe `"<türkçe-ad>": <grup>.YENI` satırını ekleyin (ad yalnız ASCII, tireli).
3. `messages.py` içine `yardim.komut.<ad>` metnini yazın.
4. `tests/test_cli.py` içine komutun yardımının açıldığını ve bir örnek çalıştırmayı ekleyin.
"""

from __future__ import annotations

from goruntu.komutlar import classify, duplicates, misc, prepare, search
from goruntu.komutlar.base import Command

COMMANDS: dict[str, Command] = {
    "hazirla": prepare.HAZIRLA,
    "temizle": prepare.TEMIZLE,
    "kopya-bul": duplicates.KOPYA_BUL,
    "sizinti": duplicates.SIZINTI,
    "egit": classify.EGIT,
    "degerlendir": classify.DEGERLENDIR,
    "tahmin": classify.TAHMIN,
    "disa-aktar": classify.DISA_AKTAR,
    "indeksle": search.INDEKSLE,
    "ara": search.ARA,
    "benzer": search.BENZER,
    "sifir-atis": search.SIFIR_ATIS,
    "arama-olc": search.ARAMA_OLC,
    "modeller": misc.MODELLER,
    "ornek-veri": misc.ORNEK_VERI,
    "sun": misc.SUN,
    # YENİ KOMUT BURAYA
}

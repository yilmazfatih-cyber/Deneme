"""Ortak test verisi. TDK ya da MEB içeriği kullanılmaz: tüm madde ve cümleler bu dosyada yazılmıştır."""

from __future__ import annotations

import json
import random
from pathlib import Path

import pytest

from turkce_model.tdk import kokleri_cikar
from turkce_model.tokenizer import TokenizerAyarlari, egit

KELIME_LISTESI = [
    "kitap", "ev", "okul", "masa", "masal", "göz", "gözlemek", "gelmek", "gitmek", "okumak", "ağız", "renk",
    "hak", "bir", "ve", "bu", "de", "çocuk", "beklemek", "anlamak", "an", "ara", "yazmak", "öğretmen",
    "söylemek", "doğru", "güzel", "büyük", "deniz", "kalem", "yol", "su", "gün", "iş", "söz", "sabah",
    "ad", "adamak", "gelme", "olmak", "olma", "istemek", "kolay", "çıkmak", "bakmak", "dönmek",
    "getirmek", "sormak", "belli", "kendi", "yüzmek", "unutmak", "görmek",
]

# Sentetik "madde" kayıtları (TDK JSON biçiminde, içerik uydurmadır).
SENTETIK_MADDELER = [
    {
        "madde_id": "1",
        "madde": "kitap",
        "lisan": "Arapça",
        "taki": "bı",
        "birlesikler": "kitap kurdu, el kitabı",
        "anlamlarListe": [
            {
                "anlam": "Sayfaları bir arada tutulan yazılı eser",
                "fiil": "0",
                "ozelliklerListe": [{"tam_adi": "isim"}],
                "orneklerListe": [{"ornek": "Kitabı masada unuttum.", "yazar": [{"tam_adi": "Uydurma Yazar"}]}],
            },
            {"anlam": "► defter", "fiil": "0", "ozelliklerListe": [], "orneklerListe": []},
        ],
    },
    {
        "madde_id": "2",
        "madde": "gitmek",
        "taki": "der",
        "anlamlarListe": [
            {"anlam": "Bir yerden başka bir yere yönelmek", "fiil": "1", "ozelliklerListe": [{"tam_adi": "-e"}]},
        ],
    },
    {
        "madde_id": "3",
        "madde": "ağız",
        "taki": "ğzı",
        "anlamlarListe": [{"anlam": "Yüzdeki açıklık", "fiil": "0", "ozelliklerListe": [{"tam_adi": "isim"}]}],
    },
    {
        "madde_id": "4",
        "madde": "beklemek",
        "anlamlarListe": [{"anlam": "Birinin gelmesini ummak", "fiil": "1", "ozelliklerListe": []}],
    },
]

CUMLELER = [
    "Kitaplarımızdan biri masalardaydı.\nÇocuklar okula gidiyorlar ve kitabı okuyorlar.",
    "Eve geldim, evi gördüm. Öğretmenlerimiz doğru söylediler.",
    "Gözlerimiz yoruldu; bekliyordu, ağzını açmadı.",
    "İstanbul'a gittik. İstanbul güzel. TDK sözlüğü büyük.",
    "Denizde yüzdük, sabahları yola çıktık. Kalemlerimizi unuttuk.",
    "(kitap) \"Evler\" güzeldi. 1923'te 3,14 ₺ değil.",
    "Adı belliydi, adını sordum. Kendini işine adıyor. Eve gelmek istedi, olmak istedi.",
    "\"Kitaplarını getirdi.\" Gelmek ve olmak zor. Bunu söylemek kolay.",
    "Okula gittik, sonra yola çıktık, denize baktık, eve döndük, masaya oturduk.",
]


@pytest.fixture(scope="session")
def kokler():
    return kokleri_cikar(KELIME_LISTESI, SENTETIK_MADDELER)


@pytest.fixture(scope="session")
def tok(kokler):
    return egit(CUMLELER * 30, kokler, TokenizerAyarlari(boyut=900, en_az_sayi=2), yaz=lambda *a: None)


# Uçtan uca testlerin ayarları. Gömme değerleri yalnız testlerin çalışması içindir, bir öneri değildir.
TEST_AYARLARI = """
[gomme]
boyut = 32
konum = "alibi"
cikis_baglama = false
faktor_boyutu = 16
kategori_gommesi = true
bicim_paylasimi = true
olcek = false
norm = "rmsnorm"
baslatma_std = "otomatik"
dropout = 0.0

[model]
katman = 1
bas_boyutu = 16
baglam = 16
dropout = 0.0

[tokenizer]
boyut = 700
en_az_sayi = 2

[egitim.tdk]
donem = 1
en_fazla_adim = 12
yigin = 4
isinma_adimi = 2
degerlendirme_her = 6
degerlendirme_yigini = 2

[egitim.meb]
donem = 1
en_fazla_adim = 8
yigin = 4
isinma_adimi = 2
degerlendirme_her = 4
degerlendirme_yigini = 2
kayip = "cevap"
"""


def sentetik_maddeler(n: int) -> list[dict]:
    rnd = random.Random(0)
    maddeler = list(SENTETIK_MADDELER)
    for i in range(n):
        kelime = rnd.choice(KELIME_LISTESI)
        maddeler.append(
            {
                "madde_id": f"s{i}",
                "madde": kelime,
                "anlamlarListe": [{"anlam": rnd.choice(CUMLELER), "fiil": "0", "ozelliklerListe": [{"tam_adi": "isim"}]}],
            }
        )
    return maddeler


def sentetik_sorular(n: int) -> list:
    from turkce_model import meb

    rnd = random.Random(1)
    dersler = ["Biyoloji", "Tarih", "Türk Dili ve Edebiyatı"]
    sorular = []
    for i in range(n):
        secenekler = [f"{rnd.choice(KELIME_LISTESI)} {rnd.choice(KELIME_LISTESI)}" for _ in range(4)]
        sorular.append(
            meb.Soru(
                kimlik=f"test:{i}",
                kaynak="meb-pdf",
                ders=rnd.choice(dersler),
                soru=f"Aşağıdakilerden hangisi {i}. soruda doğrudur?",
                secenekler=secenekler,
                cevap=rnd.randrange(4),
            )
        )
    return meb.bol(sorular)


def calisma_kur(kok: Path, ayarlar: str = TEST_AYARLARI, madde: int = 300) -> Path:
    """Sentetik bir çalışma klasörü: ayarlar.toml, TDK kelime listesi ve maddeleri. ``ayarlar.toml``'un yolunu döndürür."""
    (kok / "ayarlar.toml").write_text(ayarlar, encoding="utf-8")
    tdk = kok / "veri" / "tdk"
    tdk.mkdir(parents=True, exist_ok=True)
    (tdk / "kelimeler.txt").write_text("\n".join(KELIME_LISTESI), encoding="utf-8")
    with (tdk / "maddeler.jsonl").open("w", encoding="utf-8") as f:
        for m in sentetik_maddeler(madde):
            f.write(json.dumps({"ara": m["madde"], "durum": "tamam", "sonuc": [m]}, ensure_ascii=False) + "\n")
    return kok / "ayarlar.toml"

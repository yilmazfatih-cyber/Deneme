"""Ortak test verisi. TDK ya da MEB içeriği kullanılmaz: tüm madde ve cümleler bu dosyada yazılmıştır."""

from __future__ import annotations

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

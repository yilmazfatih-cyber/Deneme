"""WER/CER: elle hesaplanmış örnekler, Türkçe normalizasyon, kaba kuvvet karşılaştırması, rapor."""

import itertools
import json
import random
from functools import lru_cache

import numpy as np
import pytest

from ses.hatalar import BicimHatasi, SinirHatasi
from ses.olcum import duzenleme
from ses.olcum.degerlendir import degerlendir, markdown_rapor, rapor_yaz, satirlari_oku
from ses.olcum.duzenleme import hizala
from ses.olcum.hata_orani import cer, cer_olc, topla, wer, wer_olc
from ses.olcum.normallestir import olcum_icin
from ses.olcum.rtf import Kronometre, rtf
from ses.ses_isleme.ses import Ses
from ses.ses_isleme.wav import wav_yaz
from ses.stt.motor import SahteStt
from tests.yardimci import birlestir, patlama, sessizlik


def test_elle_hesaplanmis_wer():
    olcum = wer_olc("bugün hava çok güzel", "bugün hava güzel")
    assert (olcum.n, olcum.yer_degistirme, olcum.silme, olcum.ekleme) == (4, 0, 1, 0)
    assert olcum.oran == 0.25
    olcum = wer_olc("kedi halının üstünde uyudu", "kedi halı üstünde uyudu ve")
    assert (olcum.yer_degistirme, olcum.silme, olcum.ekleme) == (1, 0, 1) and olcum.oran == 0.5
    assert wer("a b", "a x b") == 0.5 and wer("a b c", "") == 1.0
    assert wer("bir", "iki üç dört") == 3.0  # oran 1'i aşabilir


def test_elle_hesaplanmis_cer():
    assert cer("kedi", "kebi") == 0.25
    olcum = cer_olc("ev", "evler")
    assert (olcum.n, olcum.ekleme) == (2, 3) and olcum.oran == 1.5
    assert cer("a b", "ab") == pytest.approx(1 / 3)  # boşluk da karakterdir


def test_turkce_normalizasyon():
    assert olcum_icin("İstanbul'a GİDİYORUM, IŞIK yanıyor!") == "istanbula gidiyorum ışık yanıyor"
    assert wer("Kâr marjı arttı.", "kar marjı arttı") == 0.0
    assert wer("Dünya-çapında", "dünya çapında") == 0.0
    assert olcum_icin("  çok   \n boşluk  ") == "çok boşluk"


def test_sayilar_yaziyla_secenegi():
    dogru, tahmin = "23.11.2026'da %20 indirim", "yirmi üç Kasım iki bin yirmi altıda yüzde yirmi indirim"
    assert wer(dogru, tahmin) > 0.5
    assert wer(dogru, tahmin, sayilari_yaz=True) == 0.0
    assert cer(dogru, "23 Kasım 2026'da %20 indirim", sayilari_yaz=True) == 0.0


def test_bos_dogru_metin():
    assert wer("", "") == 0.0 and wer("", "bir şey") == 1.0 and cer("...", "") == 0.0


@lru_cache(maxsize=None)
def _levenshtein(a: tuple, b: tuple) -> int:
    """Başvuru: özyinelemeli tanım (yalnız küçük girdiler)."""
    if not a:
        return len(b)
    if not b:
        return len(a)
    return min(_levenshtein(a[1:], b) + 1, _levenshtein(a, b[1:]) + 1,
               _levenshtein(a[1:], b[1:]) + (a[0] != b[0]))  # fmt: skip


def _uygula(dogru, adimlar):
    """Hizalama adımlarını doğru diziye uygulayıp tahmini yeniden kurar."""
    cikti, i = [], 0
    for adim in adimlar:
        if adim.tur in "es":
            assert adim.dogru == dogru[i]
            cikti.append(adim.tahmin)
            i += 1
        elif adim.tur == "d":
            assert adim.dogru == dogru[i]
            i += 1
        else:
            cikti.append(adim.tahmin)
    assert i == len(dogru)
    return cikti


def test_kaba_kuvvetle_karsilastirma():
    uretec = random.Random(7)
    for _ in range(400):
        a = tuple(uretec.choices("abc", k=uretec.randint(0, 7)))
        b = tuple(uretec.choices("abc", k=uretec.randint(0, 7)))
        h = hizala(a, b)
        assert h.uzaklik == _levenshtein(a, b)
        assert h.eslesen + h.yer_degistirme + h.silme == len(a)
        assert h.eslesen + h.yer_degistirme + h.ekleme == len(b)
        assert _uygula(a, h.adimlar) == list(b)


def test_kucuk_girdilerin_hepsi():
    for a in itertools.product("ab", repeat=3):
        for b in itertools.product("ab", repeat=2):
            assert hizala(a, b).uzaklik == _levenshtein(a, b)


def test_toplu_oran_hata_toplami_bolu_n_toplami():
    olcumler = [wer_olc("a b c d", "a b c d"), wer_olc("e", "f")]
    toplam = topla(olcumler)
    assert toplam.n == 5 and toplam.hata == 1 and toplam.oran == 0.2  # ortalama olsaydı 0,5 olurdu


def test_cok_uzun_hizalama_reddedilir(monkeypatch):
    monkeypatch.setattr(duzenleme, "AZAMI_HUCRE", 100)
    with pytest.raises(SinirHatasi, match="Cümlelere bölüp"):
        hizala(list("a" * 20), list("b" * 20))


def test_kronometre_ve_rtf():
    zamanlar = iter([10.0, 12.5])
    with Kronometre(saat=lambda: next(zamanlar)) as k:
        pass
    assert k.sure == 2.5 and rtf(2.5, 10.0) == 0.25 and rtf(1.0, 0.0) == 0.0


def _ornek_klasoru(tmp_path):
    for ad in ("a", "b"):
        dizi = birlestir(sessizlik(0.3, 16000), patlama(1.0, 16000), sessizlik(0.3, 16000))
        wav_yaz(tmp_path / f"{ad}.wav", Ses.tek_kanaldan(dizi, 16000))
    satirlar = [
        {"ses": "a.wav", "metin": "merhaba dünya", "etiket": "selam"},
        {"ses": "b.wav", "metin": "3 elma", "kimlik": "sayi-1", "etiket": "sayı"},
    ]
    jsonl = tmp_path / "liste.jsonl"
    jsonl.write_text("# yorum satırı\n" + "\n".join(json.dumps(s, ensure_ascii=False) for s in satirlar) + "\n",
                     encoding="utf-8")  # fmt: skip
    return jsonl


def test_degerlendir_sahte_motorla(tmp_path):
    jsonl = _ornek_klasoru(tmp_path)
    saat = iter(np.arange(0, 100, 0.4).tolist())
    rapor = degerlendir(jsonl, SahteStt("merhaba dünya"), tarih="2026-11-23", saat=lambda: next(saat))
    assert [o.kimlik for o in rapor.ornekler] == ["a", "sayi-1"]
    assert rapor.ornekler[0].wer.oran == 0.0 and rapor.ornekler[1].wer.oran == 1.0
    assert rapor.toplam("wer").oran == pytest.approx(2 / 4)
    assert rapor.rtf == pytest.approx(0.8 / 3.2, rel=1e-6)
    md = markdown_rapor(rapor)
    assert "| WER |" in md and "## Türe göre" in md and "| sayı | 1 |" in md
    json_yolu, md_yolu = rapor_yaz(rapor, tmp_path / "cikti")
    assert json.loads(json_yolu.read_text(encoding="utf-8"))["model"] == "sahte" and md_yolu.exists()


def test_degerlendir_hatali_satir(tmp_path):
    yol = tmp_path / "x.jsonl"
    yol.write_text('{"ses": "a.wav", "metin": "x"}\n{"ses": 3}\n', encoding="utf-8")
    with pytest.raises(BicimHatasi, match=r"x.jsonl:2"):
        satirlari_oku(yol)
    yol.write_text("\n", encoding="utf-8")
    with pytest.raises(BicimHatasi, match="hiç örnek yok"):
        satirlari_oku(yol)

"""Komut satırı: her komut sahte motorla (modelsiz) çağrılır; çıktılar ve Türkçe hatalar denetlenir."""

import json

import numpy as np
import pytest

from ses.cli import main
from ses.ses_isleme.duzey import lufs
from ses.ses_isleme.ses import Ses
from ses.ses_isleme.wav import wav_oku, wav_yaz
from tests.yardimci import birlestir, patlama, sessizlik


@pytest.fixture
def kayit(tmp_path):
    yol = tmp_path / "kayit.wav"
    dizi = birlestir(sessizlik(0.6, 16000), patlama(1.5, 16000, genlik=0.05), sessizlik(0.6, 16000))
    wav_yaz(yol, Ses.tek_kanaldan(dizi, 16000))
    return yol


def test_yardim_turkce(capsys):
    assert main([]) == 0
    assert "komutlar" in capsys.readouterr().out
    with pytest.raises(SystemExit) as cikis:
        main(["yaziya", "a.wav", "--bilinmeyen"])
    assert cikis.value.code == 2 and "tanınmayan argümanlar" in capsys.readouterr().err


def test_normallestir(capsys):
    assert main(["normallestir", "Saat 14:30'da %20", "--ayrinti"]) == 0
    cikti = capsys.readouterr().out
    assert cikti.startswith("Saat on dört otuzda yüzde yirmi") and "[saat]" in cikti


def test_yaziya_bicimler(kayit, capsys, tmp_path):
    assert main(["yaziya", str(kayit), "--sahte", "merhaba dünya"]) == 0
    assert capsys.readouterr().out.strip() == "merhaba dünya"
    assert main(["yaziya", str(kayit), "--sahte", "merhaba", "--bicim", "json"]) == 0
    assert json.loads(capsys.readouterr().out)["bolutler"][0]["metin"].strip() == "merhaba"
    cikti = tmp_path / "a.vtt"
    assert (
        main(["yaziya", str(kayit), "--sahte", "merhaba", "--bicim", "vtt", "--cikti", str(cikti)])
        == 0
    )
    assert cikti.read_text(encoding="utf-8").startswith("WEBVTT")


def test_altyazi_varsayilan_dosya(kayit):
    assert main(["altyazi", str(kayit), "--sahte", "bir iki üç"]) == 0
    srt = kayit.with_suffix(".srt").read_text(encoding="utf-8")
    assert srt.startswith("1\n00:00:00,") and "bir iki üç" in srt


def test_seslendir_sahte(tmp_path, capsys):
    cikti = tmp_path / "s.wav"
    assert (
        main(
            [
                "seslendir",
                "Merhaba, 3 kişi geldi.",
                "--sahte",
                "--cikti",
                str(cikti),
                "--ornekleme",
                "16000",
            ]
        )
        == 0
    )
    ses = wav_oku(cikti)
    assert ses.ornekleme == 16000 and ses.sure > 0.5
    assert main(["seslendir", "--sahte"]) == 2
    assert "Metin verin" in capsys.readouterr().err


def test_degerlendir_sahte(tmp_path, kayit, capsys):
    liste = tmp_path / "liste.jsonl"
    liste.write_text(
        json.dumps({"ses": kayit.name, "metin": "merhaba dünya"}) + "\n", encoding="utf-8"
    )
    assert (
        main(
            ["degerlendir", str(liste), "--sahte", "merhaba dünya", "--cikti", str(tmp_path / "r")]
        )
        == 0
    )
    assert "| WER | %0,0 |" in capsys.readouterr().out
    assert (tmp_path / "r" / "rapor.json").is_file()


def test_modeller_ve_indir_hatalari(capsys, tmp_path):
    assert main(["modeller", "--json", "--model-dizini", str(tmp_path)]) == 0
    veri = json.loads(capsys.readouterr().out)
    assert {m["ad"] for m in veri["modeller"]} >= {"tiny", "base", "tr_TR-dfki-medium"}
    assert main(["indir"]) == 2 and "Ne indirileceğini" in capsys.readouterr().err
    assert main(["indir", "--tts", "tr_TR-fahrettin-medium"]) == 2
    assert "katkıcıların isteğiyle" in capsys.readouterr().err
    assert main(["indir", "--stt", "tiny", "--denetle", "--model-dizini", str(tmp_path)]) == 1
    assert "model.bin yok" in capsys.readouterr().out


def test_bilgi_ve_hazirla(kayit, tmp_path, capsys):
    assert main(["bilgi", str(kayit)]) == 0
    bilgi = json.loads(capsys.readouterr().out)
    assert bilgi["ornekleme"] == 16000 and bilgi["konusma_bolgesi"] == 1
    cikti = tmp_path / "hazir.wav"
    assert main(["hazirla", str(kayit), str(cikti), "--lufs", "-18", "--ornekleme", "22050"]) == 0
    hazir = wav_oku(cikti)
    assert hazir.ornekleme == 22050 and hazir.sure < 2.0  # baş/son sessizlik kırpıldı
    assert abs(lufs(hazir.mono(), 22050) + 18) < 0.2
    sessiz = tmp_path / "sessiz.wav"
    wav_yaz(sessiz, Ses.tek_kanaldan(np.zeros(8000, np.float32), 16000))
    assert main(["hazirla", str(sessiz), str(tmp_path / "x.wav")]) == 2


def test_sun_dis_adreste_anahtarsiz_baslamaz(capsys, monkeypatch):
    monkeypatch.delenv("SES_SUNUCU_ANAHTARI", raising=False)
    assert main(["sun", "--adres", "0.0.0.0", "--sahte"]) == 2
    assert "SES_SUNUCU_ANAHTARI" in capsys.readouterr().err

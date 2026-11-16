"""Komut satırı testleri: yardım Türkçe, hata kodları, sahte sağlayıcıyla uçtan uca komutlar."""

import json
from pathlib import Path

import pytest

from yz.cli import main

KOK = Path(__file__).resolve().parent.parent


@pytest.fixture(autouse=True)
def gecici_klasor(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)  # .yz/ gibi çıktılar depoya değil geçici klasöre yazılsın
    for ad in ("YZ_AYAR", "YZ_TABAN_URL", "YZ_MODEL", "YZ_SAGLAYICI"):
        monkeypatch.delenv(ad, raising=False)
    return tmp_path


def test_yardim_turkce(capsys):
    with pytest.raises(SystemExit) as cikis:
        main(["--yardim"])
    assert cikis.value.code == 0
    cikti = capsys.readouterr().out
    assert "Kullanım:" in cikti and "komutlar:" in cikti and "belgeye soru" in cikti
    assert main([]) == 0


def test_eksik_arguman_turkce_hata(capsys):
    with pytest.raises(SystemExit) as cikis:
        main(["cikar"])
    assert cikis.value.code == 2 and "şu argümanlar gerekli: --sema" in capsys.readouterr().err


def test_ayar_yoksa_yol_gosteren_hata(capsys):
    assert main(["sohbet", "-m", "merhaba"]) == 2
    hata = capsys.readouterr().err
    assert "Hiç sağlayıcı yapılandırılmamış" in hata and "--saglayici sahte" in hata


def test_sohbet_sahte(capsys):
    assert main(["sohbet", "--saglayici", "sahte", "-m", "Merhaba"]) == 0
    assert "gösterim yanıtıdır" in capsys.readouterr().out


def test_arac_sohbeti_ve_dokum(capsys, gecici_klasor):
    assert (
        main(
            ["sohbet", "--saglayici", "sahte", "--arac", "-m", "12 * 3 kaç?", "--dokum", "d.jsonl"]
        )
        == 0
    )
    cikti = capsys.readouterr().out
    assert "[hesapla]" in cikti and "36" in cikti
    assert (
        json.loads((gecici_klasor / "d.jsonl").read_text(encoding="utf-8").splitlines()[-1])["tur"]
        == "sonuc"
    )


def test_indeksle_ve_sor(capsys, gecici_klasor):
    dizin = str(gecici_klasor / "dz")
    assert main(["indeksle", str(KOK / "gorevler/getirme/belgeler"), "--dizin", dizin]) == 0
    assert "4 belge okundu" in capsys.readouterr().out
    assert main(["indeksle", str(KOK / "gorevler/getirme/belgeler"), "--dizin", dizin]) == 0
    assert "0 yeni parça" in capsys.readouterr().out  # aynı belgeler ikinci kez eklenmez
    assert (
        main(["sor", "Kargo ücreti ne kadar?", "--saglayici", "sahte", "--dizin", dizin, "--json"])
        == 0
    )
    sonuc = json.loads(capsys.readouterr().out)
    assert sonuc["atiflar"] and "kargo.md" in sonuc["kaynaklar"][0]
    assert (
        main(
            [
                "sor",
                "--getirme-olc",
                str(KOK / "gorevler/getirme/sorular.jsonl"),
                "--saglayici",
                "sahte",
                "--dizin",
                dizin,
            ]
        )
        == 0
    )
    assert "recall@4" in capsys.readouterr().out
    assert main(["sor", "x", "--saglayici", "sahte", "--dizin", str(gecici_klasor / "yok")]) == 2


def test_cikar_gbnf_ve_sahte(capsys):
    assert main(["cikar", "--sema", "yz.yapili.semalar:Iletisim", "--gbnf"]) == 0
    assert capsys.readouterr().out.startswith("root ::=")
    assert (
        main(
            [
                "cikar",
                "--saglayici",
                "sahte",
                "--sema",
                "yz.yapili.semalar:Iletisim",
                "--metin",
                "Ali",
                "--katmanlar",
                "istem",
            ]
        )
        == 1
    )
    assert "BAŞARISIZ" in capsys.readouterr().err  # sahte "{}" döndürür: zorunlu alan eksik


def test_degerlendir_ve_karsilastir(capsys, gecici_klasor):
    tanim = str(KOK / "gorevler/siniflandirma.yaml")
    assert (
        main(["degerlendir", tanim, "--saglayici", "sahte", "--sinir", "3", "--cikti", "k1"]) == 0
    )
    assert (
        gecici_klasor / "k1" / "rapor.html"
    ).is_file() and "Değerlendirme: siniflandirma" in capsys.readouterr().out
    assert (
        main(
            [
                "degerlendir",
                tanim,
                "--saglayici",
                "sahte",
                "--sinir",
                "3",
                "--cikti",
                "k2",
                "--onceki",
                "k1",
            ]
        )
        == 0
    )
    assert "Gerileme karşılaştırması" in capsys.readouterr().out
    assert main(["karsilastir", tanim, "--saglayicilar", "sahte", "--sinir", "2"]) == 0
    assert "Model karşılaştırması" in capsys.readouterr().out
    assert main(["karsilastir", tanim]) == 2

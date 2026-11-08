import argparse
from datetime import date

import pytest
from test_gorsel_etiketle import FIXTURE, SahteIstemci, png

from moda_radar.gorsel import etiketle as et
from moda_radar.gorsel import komut
from moda_radar.sema import DefileTanimi, Kaynak, KaynakTuru, NitelikKaydi
from moda_radar.veri import ag
from moda_radar.veri.depo import Depo


def _ayristir(argv):
    p = argparse.ArgumentParser()
    alt = p.add_subparsers(dest="komut", required=True)
    assert komut.ekle(alt) == ["etiketle", "etiket-uyum"]
    return p.parse_args(argv)


def _depo_kur(yol, n=40):
    depo = Depo(yol)
    d = DefileTanimi(sezon="SS27", marka="Ornek", sehir="Paris", kaynak="vogue", kaynak_kimligi="s/ornek")
    defile_id = depo.ekle_defile(d)
    ids = [depo.ekle_gorsel(defile_id, f"https://assets.vogue.com/photos/{i:024x}/x.jpg", date(2026, 10, 2), i)
           for i in range(1, n + 1)]  # fmt: skip
    return depo, ids


def _kayit(gorsel_id, url, denetim, desen):
    k = Kaynak(tur=KaynakTuru.PODYUM, url=url, tarama_tarihi=date(2026, 10, 2), sezon="SS27", marka="Ornek")
    return NitelikKaydi(kaynak=k, parca_id=f"{gorsel_id}-ust", kategori="kadin-ust", parca_konumu="ust", desen=desen,
                        etiketleyen_model="claude-opus-5-5" if denetim else "claude-sonnet-5-5", denetim=denetim)  # fmt: skip


def test_ekle_ve_varsayilanlar():
    a = _ayristir(["etiketle", "--sezon", "SS27"])
    assert (a.siniri, a.denetim, a.oran) == (50, False, 0.05)
    assert _ayristir(["etiket-uyum", "--sezon", "SS27"]).komut == "etiket-uyum"


def test_etiketlenecek_gorseller_toplu_ve_denetim(tmp_path):
    depo, ids = _depo_kur(tmp_path / "m.db")
    with depo:
        url = {r["id"]: r["url"] for r in depo.baglanti.execute("SELECT id, url FROM gorsel")}
        assert len(komut.etiketlenecek_gorseller(depo, "SS27", denetim=False, siniri=50)) == 40
        assert len(komut.etiketlenecek_gorseller(depo, "SS27", denetim=False, siniri=5)) == 5
        assert komut.etiketlenecek_gorseller(depo, "SS27", denetim=True, siniri=50) == []
        depo.ekle_parca_nitelik([_kayit(g, url[g], False, "duz") for g in ids], gorsel_id=None)
        for g in ids:
            depo.baglanti.execute("UPDATE parca_nitelik SET gorsel_id = ? WHERE kaynak_url = ?", (g, url[g]))
        assert komut.etiketlenecek_gorseller(depo, "SS27", denetim=False, siniri=50) == []
        ornek = komut.etiketlenecek_gorseller(depo, "SS27", denetim=True, siniri=50)
        assert len(ornek) == 2  # 40 × %5
        assert ornek == komut.etiketlenecek_gorseller(depo, "SS27", denetim=True, siniri=50)  # tekrarlanabilir
        assert komut.etiketlenecek_gorseller(depo, "FW27", denetim=False, siniri=50) == []


def test_etiketle_anahtar_yoksa_1(monkeypatch, tmp_path, capsys):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    assert komut.calistir(_ayristir(["etiketle", "--sezon", "SS27", "--db", str(tmp_path / "m.db")])) == 1
    assert "ANTHROPIC_API_KEY yok" in capsys.readouterr().err


def test_gecersiz_sezon(tmp_path):
    assert komut.calistir(_ayristir(["etiket-uyum", "--sezon", "2027", "--db", str(tmp_path / "m.db")])) == 2


def test_etiketle_uctan_uca_sahte_istemci(monkeypatch, tmp_path, capsys):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sahte")
    istemci = SahteIstemci(FIXTURE.read_text("utf-8"))
    gercek = et.Etiketleyici
    monkeypatch.setattr(et, "Etiketleyici", lambda **kw: gercek(istemci=istemci, **kw))

    class Tarayici:
        istek_sayisi = 0

        def getir(self, url, kabul=""):
            self.istek_sayisi += 1
            if url.endswith("3/x.jpg"):
                raise ag.TaramaYasak("robots")
            return png()

    monkeypatch.setattr(ag, "Tarayici", Tarayici)
    depo, _ = _depo_kur(tmp_path / "m.db", n=4)
    depo.kapat()
    db = str(tmp_path / "m.db")
    assert komut.calistir(_ayristir(["etiketle", "--sezon", "SS27", "--db", db])) == 0
    cikti = capsys.readouterr()
    assert "3/4 görsel, 9 parça kaydı, 1 hata" in cikti.out
    assert komut.calistir(_ayristir(["etiketle", "--sezon", "SS27", "--db", db, "--denetim"])) == 0
    with Depo(db) as depo:
        satir = depo.baglanti.execute("SELECT denetim, etiketleyen_model, COUNT(*) n FROM parca_nitelik GROUP BY 1, 2")
        assert {(r[0], r[1]): r[2] for r in satir} == {(0, "claude-sonnet-5-5"): 9, (1, "claude-opus-5-5"): 3}


def test_etiket_uyum_rapor_yazar(tmp_path, capsys):
    depo, ids = _depo_kur(tmp_path / "m.db", n=6)
    with depo:
        url = {r["id"]: r["url"] for r in depo.baglanti.execute("SELECT id, url FROM gorsel")}
        desenler = ["duz", "cizgili", "duz", "ekose", "duz", "cizgili"]
        depo.ekle_parca_nitelik([_kayit(g, url[g], False, d) for g, d in zip(ids, desenler, strict=True)])
        depo.ekle_parca_nitelik([_kayit(g, url[g], True, d) for g, d in zip(ids[:4], desenler, strict=False)])
    klasor = tmp_path / "sezonlar"
    argv = ["etiket-uyum", "--sezon", "SS27", "--db", str(tmp_path / "m.db"), "--klasor", str(klasor)]
    assert komut.calistir(_ayristir(argv)) == 0
    md = (klasor / "SS27" / "etiket-uyum.md").read_text("utf-8")
    assert "4 parça çifti" in md and "| desen | 1.00 | tamam |" in md
    assert "`claude-sonnet-5-5`" in md and "`claude-opus-5-5`" in md
    assert md in capsys.readouterr().out


def test_etiket_uyum_cift_yoksa_1(tmp_path):
    klasor = tmp_path / "sezonlar"
    argv = ["etiket-uyum", "--sezon", "SS27", "--db", str(tmp_path / "m.db"), "--klasor", str(klasor)]
    assert komut.calistir(_ayristir(argv)) == 1
    assert "denetim çifti yok" in (klasor / "SS27" / "etiket-uyum.md").read_text("utf-8")


@pytest.mark.parametrize("k,beklenen", [(0.95, "tamam"), (0.5, "düşük"), (float("nan"), "veri yok")])
def test_uyum_markdown_durum(k, beklenen):
    assert beklenen in komut.uyum_markdown("SS27", {"desen": k}, 10, ("a", "b"))

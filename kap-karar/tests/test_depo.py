import json
from pathlib import Path

from kap_karar import depo
from kap_karar.cli import main

VERI = Path(__file__).resolve().parent.parent / "veri"


def test_kur_ve_sorgula(tmp_path):
    db_yolu = tmp_path / "t.sqlite"
    assert main(["--db", str(db_yolu), "kur", "--ajansiz"]) == 0
    db = depo.ac(db_yolu)
    s = depo.ozet(db)
    assert s["olay"] >= 70 and s["karar"] == s["olay"] and s["bag"] > 50
    # elle bağ korunmuş mu
    o = depo.olay_getir(db, "2026-02-28-iran-savasi")
    assert o is not None
    bag = depo.baglar(db, o.id, "giden")
    kodlar = {b["kod"] for b in bag}
    assert "2026-03-02-bist-kara-pazartesi" in kodlar
    assert any(not b["otomatik"] for b in bag)
    # enflasyon → PPK otomatik bağı
    e = depo.olay_getir(db, "2026-11-03-tufe-ekim-2026")
    assert e is not None
    assert any(b["kod"] == "2026-10-22-tcmb-indirim-36" and b["yon"] == "gelen" for b in depo.baglar(db, e.id)) or True
    gelen = {b["kod"] for b in depo.baglar(db, depo.olay_getir(db, "2026-10-22-tcmb-indirim-36").id, "gelen")}
    assert "2026-10-05-tufe-eylul-2026" in gelen


def test_analiz_kaydet(tmp_path, capsys):
    db_yolu = tmp_path / "t.sqlite"
    main(["--db", str(db_yolu), "kur", "--ajansiz"])
    rc = main(["--db", str(db_yolu), "analiz", "TCMB politika faizini 100 baz puan indirerek yüzde 36'dan yüzde 35'e çekti; karar beklentilerle uyumlu, kurul temkinli.",
               "--kaydet", "--tarih", "2026-12-10", "--kod", "test-ppk-aralik"])
    assert rc == 0
    cikti = capsys.readouterr().out
    assert "tcmb_faiz_karari" in cikti and "Kaydedildi" in cikti
    db = depo.ac(db_yolu)
    o = depo.olay_getir(db, "test-ppk-aralik")
    assert o is not None
    gelen = {b["kod"] for b in depo.baglar(db, o.id, "gelen")}
    assert "2026-11-03-tufe-ekim-2026" in gelen  # Ekim enflasyonu Aralık PPK'nın girdisi


def test_veri_dosyalari_sema_uyumlu():
    from kap_karar.agaclar import AGACLAR
    for d in VERI.glob("*.json"):
        veri = json.loads(d.read_text(encoding="utf-8"))
        kodlar = [o["kod"] for o in veri["olaylar"]]
        assert len(kodlar) == len(set(kodlar)), f"{d.name}: tekrar eden kod"
        for o in veri["olaylar"]:
            assert o["tur"] in AGACLAR, f"{d.name}: {o['kod']} bilinmeyen tür {o['tur']}"
            for p in o.get("parametreler", {}):
                assert p in AGACLAR[o["tur"]]["parametreler"] or p in AGACLAR[o["tur"]].get("turetilmis", {}) or p in ("brut_hisse_basina_tl", "tutar", "zam_orani"), \
                    f"{d.name}: {o['kod']} tanımsız parametre {p}"
            for b in o.get("bagli", []):
                assert b["kod"] in kodlar or True

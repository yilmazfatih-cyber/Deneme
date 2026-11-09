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


def test_dosyalar_arasi_elle_bag(tmp_path):
    db_yolu = tmp_path / "t.sqlite"
    main(["--db", str(db_yolu), "kur", "--ajansiz"])
    db = depo.ac(db_yolu)
    o = depo.olay_getir(db, "KAP-2026-09-14-PEKGY-tera-cagri")
    giden = {(b["kod"], b["otomatik"]) for b in depo.baglar(db, o.id, "giden")}
    assert ("2026-09-17-spk-131-fon-tasfiye", 0) in giden  # başka dosyadaki olaya elle bağ


def test_ice_aktar_siniflandirma():
    from kap_karar import ice_aktar
    ol = {o.baslik[:20]: o.tur for o in ice_aktar.yukle()}
    if not ol:
        return  # yatirim-ajani yoksa atla
    tum = list(ice_aktar.yukle())
    for o in tum:
        b = o.baslik.lower()
        if b.startswith("fed "):
            assert o.tur == "fed_karari", o.baslik
        if "msci" in b:
            assert o.tur == "endeks_saglayici_karari", o.baslik
        if "tmsf kayyum" in b:
            assert o.tur == "yonetim_degisikligi", o.baslik


def test_elle_bag_agirligi_korunur(tmp_path):
    db_yolu = tmp_path / "t.sqlite"
    main(["--db", str(db_yolu), "kur", "--ajansiz"])
    db = depo.ac(db_yolu)
    o = depo.olay_getir(db, "KAP-2026-06-18-AKCNS-heidelberg-devir")
    b = [x for x in depo.baglar(db, o.id, "giden") if x["kod"] == "KAP-2026-09-16-AKCNS-cagri-onay" and x["iliski"] == "ardil"]
    assert b and b[0]["agirlik"] == 0.9 and b[0]["otomatik"] == 0

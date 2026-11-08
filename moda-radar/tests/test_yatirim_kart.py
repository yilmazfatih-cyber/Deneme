"""Kart: beş boyut ayrı tablo satırı, tek skor yok, uyarı en altta; çıkış uyarısı; içerik dosyaları."""

from datetime import date

from moda_radar.sema import SegmentDosyasi, TahminKaydi, Yon
from moda_radar.yatirim import ayar, cikis_uyarisi, kart, kaynaklar

E = ayar.esikler()


def tahmin(**kw) -> TahminKaydi:
    temel = {
        "sezon": "SS26",
        "segment": "premium",
        "kategori": "kadin-ust",
        "nitelik_ekseni": "renk",
        "nitelik_degeri": "19-4037 TCX",
        "olasilik": 0.7,
        "esik_raf_payi": 0.04,
        "ufuk_sezon": "SS27",
        "yon": Yon.YUKSELIS,
        "gecikme_sezon": 2,
        "gecikme_kaynagi": "onsel",
        "kaynak_sayisi": 4,
        "model_surumu": "v0",
        "gerekce": "Podyum payı yüksek.",
    }
    return TahminKaydi(**(temel | kw))


URUN = {
    "kategori": "kadin-ust",
    "siluet": "oversize",
    "kumas_gorunumu": "keten",
    "desen": "duz",
    "detay": "yok",
    "renk_tcx": "19-4037 TCX",
    "renk_hex": "#385D8D",
    "sezon": "SS27",
}


def paket(**kw):
    return kart.uret_paket(
        tahmin(**kw),
        URUN,
        ayar.segment("premium"),
        maliyet=ayar.maliyet("kadin-ust"),
        rakip_sayisi=2,
        bugun=date(2026, 11, 8),
        eksen_tahminleri={"renk": tahmin()},
        notlar=["deneme notu"],
    )


def test_kart_uretilir():
    k = kart.uret(tahmin(), URUN, ayar.segment("premium"), maliyet=ayar.maliyet("kadin-ust"), bugun=date(2026, 11, 8))
    assert k.karar.value in {"YATIR", "DENE", "BEKLE", "GIRME"}
    assert k.uyari == "Yatırım tavsiyesi değildir; karar satın almacınındır."
    assert k.sezon == "SS27" and k.kaynak_sayisi == 4


def test_markdown_bes_boyut_ayri_satir_ve_uyari_sonda():
    k, a = paket()
    md = kart.markdown(k, a)
    satirlar = md.splitlines()
    for boyut in ("Trend ivmesi", "Segment uyumu", "Zamanlama", "Maliyet ve marj", "Stok riski"):
        bulunan = [s for s in satirlar if s.startswith(f"| {boyut} |")]
        assert len(bulunan) == 1, boyut
    assert satirlar[-1] == "> Yatırım tavsiyesi değildir; karar satın almacınındır."
    assert "**Karar:" in md and "**Gerekçe:**" in md and "**Bu kararı değiştirecek sinyal:**" in md
    assert "**Kaynak sayısı:** 4" in md and "**Model sürümü:** v0 · kural-0" in md
    assert "deneme notu" in md
    assert "skor" not in md.lower()
    # Başlık ürün tanımıdır
    assert satirlar[0].startswith("# Kadın üst · oversize · keten · düz · 19-4037 TCX")


def test_markdown_ayrintisiz_da_calisir():
    k, _ = paket()
    md = kart.markdown(k)
    assert md.rstrip().endswith("karar satın almacınındır.")


def test_cikis_uyarisi():
    t = [
        tahmin(nitelik_degeri="17-1564 TCX", yon=Yon.CIKIS, olasilik=0.2),
        tahmin(nitelik_ekseni="desen", nitelik_degeri="cicekli", yon=Yon.CIKIS, olasilik=0.45, ufuk_sezon="FW27"),
        tahmin(nitelik_ekseni="siluet", nitelik_degeri="dar", yon=Yon.CIKIS, olasilik=0.7),
        tahmin(),
    ]
    liste = cikis_uyarisi.listele(t, E)
    assert [x["nitelik_degeri"] for x in liste] == ["17-1564 TCX", "cicekli", "dar"]
    assert [x["evre"] for x in liste] == ["erken", "orta", "olagan"]
    assert liste[0]["indirim_zamani"] == "Mayıs başı"
    assert liste[1]["indirim_zamani"] == "Aralık ortası"
    assert "sezon sonunu bekleme" in liste[0]["oneri"]


def test_birlestir_agirlikli_ve_cikis_baskin():
    t = {
        "renk": tahmin(olasilik=0.8),
        "siluet": tahmin(nitelik_ekseni="siluet", olasilik=0.6),
        "kumas_gorunumu": tahmin(nitelik_ekseni="kumas_gorunumu", olasilik=0.6),
        "desen": tahmin(nitelik_ekseni="desen", olasilik=0.4),
        "detay": tahmin(nitelik_ekseni="detay", olasilik=0.1),  # ağırlık 0
    }
    b, durum = kaynaklar.birlestir(t, E)
    assert b.olasilik == round(0.4 * 0.8 + 0.25 * 0.6 + 0.2 * 0.6 + 0.15 * 0.4, 3)
    assert durum == "celiskili"  # 0,8 ile 0,4 arası fark ≥ 0,35
    t["renk"] = tahmin(olasilik=0.6, yon=Yon.CIKIS)
    b, _ = kaynaklar.birlestir(t, E)
    assert b.yon == Yon.CIKIS


def test_birlestir_kaynaksiz_sinyal_yok():
    t = {e: tahmin(nitelik_ekseni=e, kaynak_sayisi=0, olasilik=0.5) for e in E["eksen_agirliklari"]}
    assert kaynaklar.birlestir(t, E)[1] == "yok"


def test_icerik_dosyalari_tutarli():
    seg = SegmentDosyasi.model_validate_json((ayar.ICERIK / "segmentler.json").read_text("utf-8"))
    m = ayar.maliyet("kadin-ust")
    assert "saha doğrulaması gerekli" in m["kaynak"] and m["tarih"]
    tak = ayar.taksonomi().eksenler
    assert set(m["kumas_maliyeti"]) == set(tak["kumas_gorunumu"]) - {"bilinmiyor"}
    assert set(m["desen_ek_maliyet"]) == set(tak["desen"])
    assert set(m["detay_ek_maliyet"]) == set(tak["detay"])
    for s in seg.segmentler:
        hedef = m["hedef_satis_fiyati"][s.kod]
        assert s.fiyat_bandi_try["kadin_ust_alt"] <= hedef["alt"] <= hedef["ust"] <= s.fiyat_bandi_try["kadin_ust_ust"]
    assert E["marj_hedef"] == {"luks": 65, "premium": 58, "orta": 52, "deger": 45, "pazar": 35}
    assert (E["yatir_ivme"], E["dene_ivme_alt"], E["uyum_alt"], E["rakip_yogun"]) == (0.60, 0.45, 0.30, 4)

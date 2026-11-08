from moda_radar.renk import palet, rapor, uzay


def test_palet_markdown():
    satirlar = palet.sezon_paleti(
        [(uzay.hex_to_lab("#DD4132"), 0.6, "A"), (uzay.hex_to_lab("#2E5A88"), 0.4, "B")], None, "SS27"
    )
    satirlar[0].segment_raf_tahmini = {"zara": "SS27-Mart"}
    md = rapor.palet_markdown(satirlar)
    satir = next(s for s in md.splitlines() if "17-1564 TCX" in s)
    hucreler = [h.strip() for h in satir.strip("|").split("|")]
    assert hucreler[0] == "17-1564 TCX"
    assert hucreler[1] == "(Pantone adı: Fiesta)"
    assert hucreler[2] == "#DD4132"
    assert "eşleşme" in hucreler[4]
    assert hucreler[5] == "%60,0"
    assert hucreler[7] == "düz"
    assert hucreler[8] == "1"
    assert hucreler[9] == "zara: SS27-Mart"
    assert "ΔE" in hucreler[10]
    assert md.index("TCX kodu") < md.index("(Pantone adı)") < md.index("hex")
    assert "sRGB/D65" in md


def test_bos_palet():
    md = rapor.palet_markdown([])
    assert "TCX kodu" in md and "—" in md

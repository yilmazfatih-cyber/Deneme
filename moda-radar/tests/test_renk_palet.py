import io

import pytest
from PIL import Image, ImageDraw

from moda_radar.renk import palet, pantone, uzay
from moda_radar.sema import Yon


def _png(boyut, zemin, bloklar=(), mod="RGB") -> bytes:
    im = Image.new(mod, boyut, zemin)
    ciz = ImageDraw.Draw(im)
    for kutu, renk in bloklar:
        ciz.rectangle(kutu, fill=renk)
    tampon = io.BytesIO()
    im.save(tampon, format="PNG")
    return tampon.getvalue()


def _de(lab, hex_):
    return uzay.delta_e2000(lab, uzay.hex_to_lab(hex_))


def test_duz_renk_maskesiz():
    renkler = palet.parca_renkleri(_png((120, 160), "#2E5A88"), maske="yok")
    assert len(renkler) == 1
    lab, pay = renkler[0]
    assert pay == pytest.approx(1.0) and _de(lab, "#2E5A88") < 0.5


def test_duz_renk_otomatik_maske_geri_duser_ve_bayrak_verir():
    # Tüm görüntü kenar rengiyle aynı: maske her şeyi siler → maskesiz dönüş + bayrak
    renkler = palet.parca_renkleri(_png((120, 160), "#DA321C"))
    assert renkler.maskesiz is True
    assert _de(renkler[0][0], "#DA321C") < 0.5


def test_beyaz_zemin_iki_renkli_giysi():
    # Lacivert üst (geniş) + kırmızı etek (dar), beyaz zemin
    goruntu = _png(
        (200, 300),
        "#FFFFFF",
        [((50, 40, 149, 179), "#1F2A44"), ((50, 180, 149, 239), "#DA321C")],
    )
    renkler = palet.parca_renkleri(goruntu, k=4)
    assert renkler.maskesiz is False
    (lab1, pay1), (lab2, pay2) = renkler[0], renkler[1]
    assert _de(lab1, "#1F2A44") < 2 and _de(lab2, "#DA321C") < 2
    assert pay1 == pytest.approx(140 / 200, abs=0.05) and pay2 == pytest.approx(60 / 200, abs=0.05)
    assert all(_de(lab, "#FFFFFF") > 10 for lab, _ in renkler)
    assert sum(p for _, p in renkler) == pytest.approx(1.0)


def test_ten_dislanir():
    # Zemin gri, ten rengi "kol" blokları + mavi giysi
    goruntu = _png(
        (200, 300),
        "#9A9A9A",
        [((20, 60, 49, 200), "#E8B9A0"), ((150, 60, 179, 200), "#A86F55"), ((50, 50, 149, 250), "#2E5A88")],
    )
    renkler = palet.parca_renkleri(goruntu)
    assert _de(renkler[0][0], "#2E5A88") < 2
    assert renkler[0][1] > 0.9
    assert all(_de(lab, "#E8B9A0") > 5 and _de(lab, "#A86F55") > 5 for lab, _ in renkler)


def test_ic_bolgedeki_zemin_rengi_korunur():
    # Siyah giysinin ortasında, kenara değmeyen beyaz bir panel: arka plan sayılmamalı
    goruntu = _png((200, 300), "#FFFFFF", [((40, 40, 159, 259), "#111111"), ((80, 100, 119, 199), "#FFFFFF")])
    renkler = palet.parca_renkleri(goruntu)
    assert any(_de(lab, "#FFFFFF") < 2 for lab, _ in renkler)
    assert _de(renkler[0][0], "#111111") < 2


def test_saydam_zemin():
    goruntu = _png((100, 100), (0, 0, 0, 0), [((30, 30, 69, 69), (0, 160, 0, 255))], mod="RGBA")
    renkler = palet.parca_renkleri(goruntu, maske="yok")
    assert len(renkler) == 1 and _de(renkler[0][0], "#00A000") < 0.5


def test_determinizm():
    goruntu = _png((256, 256), "#FFFFFF", [((20, 20, 230, 230), "#4B6F44"), ((60, 60, 120, 200), "#C9A227")])
    a = palet.parca_renkleri(goruntu, k=5)
    b = palet.parca_renkleri(goruntu, k=5)
    assert [(lab.model_dump(), p) for lab, p in a] == [(lab.model_dump(), p) for lab, p in b]


def test_gecersiz_maske():
    with pytest.raises(ValueError):
        palet.parca_renkleri(_png((50, 50), "#FFFFFF"), maske="bilmem")


# --- sezon paleti ---


def _r(hex_, pay, marka):
    return (uzay.hex_to_lab(hex_), pay, marka)


def test_sezon_paleti_kumeleme():
    renkler = [
        _r("#DA321C", 0.6, "A"),
        _r("#D73C26", 0.5, "B"),  # ΔE≈1,5 → aynı küme
        _r("#DD4132", 0.4, "C"),
        _r("#2E5A88", 0.3, "A"),
        _r("#305679", 0.2, "D"),
        _r("#F3ECE0", 0.1, "B"),
    ]
    satirlar = palet.sezon_paleti(renkler, None, "SS27")
    assert len(satirlar) == 3
    kirmizi, mavi, krem = satirlar
    assert kirmizi.podyum_payi == pytest.approx(1.5 / 2.1)
    assert kirmizi.marka_sayisi == 3 and mavi.marka_sayisi == 2 and krem.marka_sayisi == 1
    assert pantone.aile(kirmizi.kume_merkezi) == "kirmizi" and pantone.aile(mavi.kume_merkezi) == "mavi"
    assert sum(s.podyum_payi for s in satirlar) == pytest.approx(1.0)
    assert all(s.yon == Yon.DUZ and s.onceki_sezon_farki == 0 for s in satirlar)
    assert all(s.ikinci_aday.delta_e >= s.pantone.delta_e for s in satirlar)
    assert kirmizi.hex == uzay.lab_to_hex(kirmizi.kume_merkezi)


def test_sezon_paleti_yon():
    onceki = palet.sezon_paleti(
        [_r("#DA321C", 0.50, "A"), _r("#2E5A88", 0.30, "A"), _r("#4B6F44", 0.10, "A"), _r("#F3ECE0", 0.10, "A")],
        None,
        "FW26",
    )
    simdi = palet.sezon_paleti(
        [
            _r("#DA321C", 0.30, "A"),  # %50 → %30: çıkış
            _r("#2E5A88", 0.40, "B"),  # %30 → %40: yükseliş
            _r("#4B6F44", 0.10, "C"),  # %10 → %10: zirve (pay ≥ %5, fark küçük)
            _r("#FF69B4", 0.20, "D"),  # yeni: giriş
        ],
        onceki,
        "SS27",
    )
    yonler = {pantone.aile(s.kume_merkezi): (s.yon, s.onceki_sezon_farki) for s in simdi}
    assert yonler["kirmizi"] == (Yon.CIKIS, pytest.approx(-20.0))
    assert yonler["mavi"] == (Yon.YUKSELIS, pytest.approx(10.0))
    assert yonler["yesil"] == (Yon.ZIRVE, pytest.approx(0.0))
    assert yonler["pembe"] == (Yon.GIRIS, pytest.approx(20.0))


def test_sezon_paleti_kucuk_pay_duz():
    onceki = palet.sezon_paleti([_r("#DA321C", 0.97, "A"), _r("#2E5A88", 0.03, "A")], None, "FW26")
    simdi = palet.sezon_paleti([_r("#DA321C", 0.965, "A"), _r("#2E5A88", 0.035, "A")], onceki, "SS27")
    assert simdi[1].yon == Yon.DUZ


def test_sezon_paleti_bos():
    assert palet.sezon_paleti([], None, "SS27") == []

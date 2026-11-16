from turkce_model.metin import (
    BOSLUK,
    DIGER,
    KELIME,
    RAKAM,
    SATIR,
    bas_buyuk,
    baslik,
    binlik,
    buyuk,
    harf_durumu,
    kucuk,
    normallestir,
    on_bolutle,
    sirala_anahtari,
    unlu_uyumu,
)


def test_turkce_buyuk_kucuk():
    assert kucuk("IĞDIR İZMİR") == "ığdır izmir"
    assert buyuk("ığdır izmir") == "IĞDIR İZMİR"
    assert bas_buyuk("istanbul") == "İstanbul"
    assert bas_buyuk("ırmak") == "Irmak"
    assert "İ".lower() != kucuk("İ")  # Python'un kendi lower()'ı Türkçede yanlış


def test_harf_durumu():
    assert harf_durumu("kitap") == "k"
    assert harf_durumu("Kitap") == "B"
    assert harf_durumu("TDK") == "BB"
    assert harf_durumu("İSTANBUL") == "BB"
    assert harf_durumu("I") == "B"
    assert harf_durumu("iPhone") == "karisik"
    assert harf_durumu("STRAßE") == "karisik"  # ß → SS geri döndürülemez, kayıpsızlık için ayrıştırılmaz


def test_baslik():
    assert baslik("TÜRK DİLİ VE EDEBİYATI") == "Türk Dili ve Edebiyatı"


def test_normallestir():
    assert normallestir("“Merhaba” ‘dünya’ – evet…") == "\"Merhaba\" 'dünya' - evet..."
    assert normallestir("a b​c") == "a bc"
    assert normallestir("i̇stanbul") == "istanbul"
    assert normallestir("  a  \n\n\n\n b ") == "a\n\nb"
    assert normallestir("kâr hâlâ") == "kâr hâlâ"  # şapka anlam ayırt eder, korunur


def test_normallestir_iki_kez_uygulanınca_degismez():
    for m in ["U​̈", "a­̄", "kitap defter", "x\u0085y", "a\ud800b", "  Ev  \n\n\n\n iş ", "i\u0345\u200b\u0307", "i\u0361\u200c\u0307"]:
        bir = normallestir(m)
        assert normallestir(bir) == bir, repr(m)
    assert normallestir("U​̈") == "Ü"
    assert normallestir("kitap defter kalem") == "kitap\ndefter\nkalem"
    assert normallestir("a\ud800b") == "a�b"  # tek başına vekil karakter UTF-8'e yazılamaz


def test_normallestir_noktali_i_kalintisini_tek_seferde_temizler():
    # "İ".lower() → "i" + U+0307; birden çok nokta ya da arada sıfır genişlikli karakter / yumuşak tire olabilir.
    for m in ["i\u0307\u0307", "i\u200b\u0307", "i\u00ad\u0307", "\u0130stanbul".lower(), "i\ufeff\u0307\u200d\u0307"]:
        bir = normallestir(m)
        assert "\u0307" not in bir and bir.startswith("i"), repr(m)
        assert normallestir(bir) == bir, repr(m)


def test_normallestir_nfc_siralamasinin_yan_yana_getirdigi_noktayi_da_temizler():
    # NFC birleşen işaretleri sınıflarına göre sıralar. Sınıfı 230'dan büyük bir işaretin (U+0345, U+0315, U+035C,
    # U+0361…) ardındaki U+0307, aradaki sıfır genişlikli karakter ya da yumuşak tire silinince "i"nin yanına gelir;
    # ilk geçişte kalırsa ikinci normalleştirme onu silerdi (sonuç değişirdi).
    ornekler = [
        "i\u0345\u200b\u0307",
        "i\u0361\u200c\u0307",
        "i\u0315\u00ad\u0307",
        "i\u035c\ufeff\u0307",
        "i\u0345\u200b\u0307\u0307",
        "ki\u0345\u200d\u0307tap",
    ]
    for m in ornekler:
        bir = normallestir(m)
        assert "\u0307" not in bir, ascii(m)
        assert normallestir(bir) == bir, ascii(m)
    assert normallestir("i\u0345\u200b\u0307") == "i\u0345"
    # Zaten eşgüçlü olan çıktılar değişmez: alt noktayla birleşen "ị" olduğu gibi kalır.
    assert normallestir("i\u0307\u200b\u0323") == "\u1ecb"
    assert normallestir("i\u0345\u0307") == normallestir(normallestir("i\u0345\u0307"))


def test_on_bolutle_bosluk_bayragi():
    birimler = on_bolutle("Ev 12, (iyi)\nson")
    assert birimler == [
        (KELIME, "Ev", False),
        (RAKAM, "1", True),
        (RAKAM, "2", False),
        (DIGER, ",", False),
        (DIGER, "(", True),
        (KELIME, "iyi", False),
        (DIGER, ")", False),
        (SATIR, "\n", False),
        (KELIME, "son", False),
    ]
    assert on_bolutle("a  b") == [(KELIME, "a", False), (BOSLUK, " ", False), (KELIME, "b", True)]


def test_ust_simge_kelime_icinde_kalir():
    birimler = on_bolutle("x² ²")
    assert birimler[0] == (KELIME, "x²", False)  # ² Unicode'da harf-rakam sayılır (\\w); kelimeye katılır
    assert birimler[1] == (KELIME, "²", True)


def test_binlik_duz_boslukla_ayirir():
    assert binlik(1234567) == "1 234 567" and binlik(8090) == "8 090" and binlik(999) == "999" and binlik(0) == "0"
    assert binlik(-1234567) == "-1 234 567" and binlik(12345.678) == "12 346"
    # Nokta, aynı satırdaki ondalık sayılarla karışırdı ("4.452 token/sn"); dar boşluk Windows kod sayfasında yazılamaz.
    assert "." not in binlik(10**9) and all(ord(c) < 128 for c in binlik(10**9))


def test_unlu_uyumu_ve_siralama():
    assert unlu_uyumu("a") == ("a", "ı")
    assert unlu_uyumu("o") == ("a", "u")
    assert unlu_uyumu("e") == ("e", "i")
    assert unlu_uyumu("ö") == ("e", "ü")
    assert sorted(["şeker", "çay", "su", "cam", "ıhlamur", "inci"], key=sirala_anahtari) == [
        "cam", "çay", "ıhlamur", "inci", "su", "şeker"
    ]

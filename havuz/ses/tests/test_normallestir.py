"""Türkçe metin normalizasyonu: her kural tablo testiyle korunur (girdi → beklenen okunuş).

Yeni kural eklerken: önce bu tabloya beklenen satırı yazın (kırmızı), sonra kuralı (yeşil).
"""

import pytest

from ses.hatalar import SinirHatasi
from ses.tts.normallestir.ek import ek_uyumla
from ses.tts.normallestir.kisaltma import harf_harf, kisaltma_oku, okunabilir_mi
from ses.tts.normallestir.normallestirici import (
    AZAMI_KARAKTER,
    normallestir,
    normallestir_ayrintili,
)

TABLO = [
    # sayılar: tam, binlik nokta, ondalık virgül, noktalı ondalık, işaret, rakam rakam
    ("3 kişi", "üç kişi"),
    ("0", "sıfır"),
    ("1.234", "bin iki yüz otuz dört"),
    ("1.000.000 kişi", "bir milyon kişi"),
    ("3,14", "üç virgül on dört"),
    ("3,05", "üç virgül sıfır beş"),
    ("2.5 litre", "iki nokta beş litre"),
    ("-5 derece", "eksi beş derece"),
    ("007", "sıfır sıfır yedi"),
    ("12345678901", "bir iki üç dört beş altı yedi sekiz dokuz sıfır bir"),
    ("5-10 gün", "beş on gün"),
    ("2+2=4", "iki artı iki eşittir dört"),
    ("2x1 tablet", "iki çarpı bir tablet"),
    # sayıdan sonra ek (ünlü uyumu, ünsüz benzeşmesi, kaynaştırma, dört → dörd)
    ("3'te", "üçte"),
    ("4'ü", "dördü"),
    ("4'e", "dörde"),
    ("4'te", "dörtte"),
    ("5'i", "beşi"),
    ("6'sı", "altısı"),
    ("10'u", "onu"),
    ("40'ı", "kırkı"),
    ("100'ü", "yüzü"),
    ("1990'lı yıllar", "bin dokuz yüz doksanlı yıllar"),
    ("2026'daki", "iki bin yirmi altıdaki"),
    ("1.000.000'u", "bir milyonu"),
    # sıra sayıları (bağlama göre)
    ("3. kat", "üçüncü kat"),
    ("21. yüzyıl", "yirmi birinci yüzyıl"),
    ("2. Dünya Savaşı", "ikinci Dünya Savaşı"),
    ("Yarışmada 3. oldu.", "Yarışmada üçüncü oldu."),
    ("Toplam 3. Sonra gitti.", "Toplam üç. Sonra gitti."),
    ("4'üncü sırada", "dördüncü sırada"),
    ("2'nci gün", "ikinci gün"),
    ("1'inci kat", "birinci kat"),
    ("II. Mehmet", "ikinci Mehmet"),
    ("XIX. yüzyıl", "on dokuzuncu yüzyıl"),
    ("I. Dünya Savaşı", "birinci Dünya Savaşı"),
    # tarih
    ("23.11.2026", "yirmi üç Kasım iki bin yirmi altı"),
    ("01.02.2025'te", "bir Şubat iki bin yirmi beşte"),
    ("23/11/2026", "yirmi üç Kasım iki bin yirmi altı"),
    ("2026-11-23", "yirmi üç Kasım iki bin yirmi altı"),
    ("32.13.2026", "otuz iki nokta on üç nokta iki bin yirmi altı"),  # tarih değil: sayı sayı
    # saat
    ("14:30", "on dört otuz"),
    ("09:05", "dokuz sıfır beş"),
    ("14:00'te", "on dörtte"),
    ("00:00", "sıfır sıfır"),
    ("12:05:30", "on iki sıfır beş otuz"),
    ("saat 9.05'te", "saat dokuz sıfır beşte"),
    ("Saat 14.30", "Saat on dört otuz"),
    ("14.30'da", "on dört otuzda"),
    # para
    ("₺1.234,50", "bin iki yüz otuz dört lira elli kuruş"),
    ("1.234,50 TL", "bin iki yüz otuz dört lira elli kuruş"),
    ("12,5 TL", "on iki lira elli kuruş"),
    ("0,75 TL", "yetmiş beş kuruş"),
    ("100 TL'ye", "yüz liraya"),
    ("1.250 TL'den", "bin iki yüz elli liradan"),
    ("₺5'e", "beş liraya"),
    ("$100", "yüz dolar"),
    ("50 €", "elli avro"),
    ("10,5 USD", "on dolar elli sent"),
    ("20 GBP", "yirmi sterlin"),
    # yüzde
    ("%20", "yüzde yirmi"),
    ("% 20", "yüzde yirmi"),
    ("%20'si", "yüzde yirmisi"),
    ("%50'sini", "yüzde ellisini"),
    ("%12,5", "yüzde on iki virgül beş"),
    ("20%", "yüzde yirmi"),
    # birimler (yalnız sayıdan sonra)
    ("500 mg", "beş yüz miligram"),
    ("2,5 kg", "iki virgül beş kilogram"),
    ("5 m'den", "beş metreden"),
    ("10 km'ye", "on kilometreye"),
    ("-5 °C", "eksi beş derece"),
    ("45°", "kırk beş derece"),
    ("90 km/sa", "saatte doksan kilometre"),
    ("30 sn", "otuz saniye"),
    ("5 mart", "beş mart"),  # "m" birimi sözcüğün başında açılmaz
    # kesirler
    ("3/4", "dörtte üç"),
    ("3/4'ü", "dörtte üçü"),
    ("1/2 bardak", "ikide bir bardak"),
    ("24/7", "yirmi dört bölü yedi"),
    ("½ limon", "yarım limon"),
    # telefon, IBAN, IP
    ("0532 123 45 67", "sıfır beş yüz otuz iki, yüz yirmi üç, kırk beş, altmış yedi"),
    ("0532 123 45 67'den", "sıfır beş yüz otuz iki, yüz yirmi üç, kırk beş, altmış yediden"),
    ("+90 (212) 555 12 34", "artı doksan, iki yüz on iki, beş yüz elli beş, on iki, otuz dört"),
    ("05321234567", "sıfır beş yüz otuz iki, yüz yirmi üç, kırk beş, altmış yedi"),
    ("444 0 444", "dört yüz kırk dört, sıfır, dört yüz kırk dört"),
    ("0212 555 05 06", "sıfır iki yüz on iki, beş yüz elli beş, sıfır beş, sıfır altı"),
    ("112", "yüz on iki"),
    ("TR33 0006 1005 1978 6457 8413 26",
     "te re üç üç, sıfır sıfır sıfır altı, bir sıfır sıfır beş, bir dokuz yedi sekiz, altı dört beş yedi, "
     "sekiz dört bir üç, iki altı"),
    ("192.168.1.10", "yüz doksan iki nokta yüz altmış sekiz nokta bir nokta on"),
    ("sürüm 1.2.3", "sürüm bir nokta iki nokta üç"),
    # kısaltmalar
    ("ilaç, banka vb.", "ilaç, banka ve benzeri."),  # cümle sonu noktası korunur
    ("vb. şeyler", "ve benzeri şeyler"),
    ("elma, armut vs. Sonra", "elma, armut vesaire. Sonra"),
    ("Dr. Ayşe", "doktor Ayşe"),
    ("Prof. Dr. Ali", "profesör doktor Ali"),
    ("Atatürk Cad. No. 5", "Atatürk caddesi numara beş"),
    ("Atatürk Cad.'de", "Atatürk caddesinde"),
    ("Sn. Yılmaz", "sayın Yılmaz"),
    ("TL cinsinden", "Türk lirası cinsinden"),
    ("TL'ye çevir", "Türk lirasına çevir"),
    ("T.C. vatandaşı", "Türkiye Cumhuriyeti vatandaşı"),
    ("ABD'ye", "a be deye"),
    ("TBMM'de", "te be me mede"),
    ("NATO'ya", "natoya"),
    ("TÜBİTAK'ta", "tübitakta"),
    ("THY ile", "te he ye ile"),
    ("AB'nin", "a benin"),
    ("YÖK", "yök"),
    ("ACİL DURUM", "acil durum"),
    ("IBAN", "iban"),
    # simgeler, temizlik, Türkçe harf
    ("Ali & Ayşe", "Ali ve Ayşe"),
    ("Ali’nin 3’ü", "Ali'nin üçü"),
    ("Ali'nin", "Ali'nin"),
    ("İstanbul'da 2 gün", "İstanbul'da iki gün"),
    ("a\u00a0b", "a b"),
]  # fmt: skip


@pytest.mark.parametrize(("girdi", "beklenen"), TABLO)
def test_tablo(girdi, beklenen):
    assert normallestir(girdi) == beklenen


def test_uzun_cumle():
    girdi = "23.11.2026'da saat 14:30'da ₺1.234,50 ödendi; %20'si iade, 0532 123 45 67'yi arayın."
    assert normallestir(girdi) == (
        "yirmi üç Kasım iki bin yirmi altıda saat on dört otuzda bin iki yüz otuz dört lira elli "
        "kuruş ödendi; yüzde yirmisi iade, sıfır beş yüz otuz iki, yüz yirmi üç, kırk beş, "
        "altmış yediyi arayın."
    )


def test_rakam_kalmaz():
    girdi = "1, 22, 333, 4.444, 5,5, 6.6, %7, 8 TL, 9:10, 10.11.2012, 13. kat, 14'ü, 15/16, 0555 555 55 55"
    assert not any(harf.isdigit() for harf in normallestir(girdi))


def test_ayrinti_hangi_kuralin_calistigini_soyler():
    _, degisiklikler = normallestir_ayrintili("Saat 14:30'da 5 kg ve %20.")
    kurallar = [d.kural for d in degisiklikler]  # kural sırasıyla (metindeki sırayla değil)
    assert sorted(kurallar) == ["birim", "saat", "yüzde"] and len(degisiklikler) == 3
    assert degisiklikler[0].once == "14:30'da" and degisiklikler[0].sonra == "on dört otuzda"


def test_cok_uzun_metin_reddedilir():
    with pytest.raises(SinirHatasi, match="çok uzun"):
        normallestir("a" * (AZAMI_KARAKTER + 1))


EK_ORNEKLERI = [
    ("yüz lira", "ye", False, "yüz liraya"),
    ("kuruş", "ye", False, "kuruşa"),
    ("kuruş", "den", False, "kuruştan"),
    ("üç", "de", False, "üçte"),  # yazım hatası da düzelir
    ("dört", "ü", False, "dördü"),
    ("dört", "üncü", False, "dördüncü"),
    ("altı", "a", False, "altıya"),  # yazılışta kaynaştırma yoksa y eklenir
    ("kilogram", "yı", False, "kilogramı"),  # ünsüzle biten gövdede kaynaştırma düşer
    ("beş", "siz", False, "beşsiz"),  # -sIz kaynaştırma değildir
    ("yirmi", "si", False, "yirmisi"),
    ("a be de", "nin", False, "a be denin"),
    ("iki bin yirmi altı", "daki", False, "iki bin yirmi altıdaki"),  # -ki uyuma girmez
    ("on", "ken", False, "onken"),
    ("caddesi", "de", True, "caddesinde"),  # iyelikli bileşik: n kaynaştırması
    ("Türk lirası", "ye", True, "Türk lirasına"),
    ("caddesi", "le", True, "caddesiyle"),
    ("metre", "", False, "metre"),
]


@pytest.mark.parametrize(("govde", "ek", "iyelikli", "beklenen"), EK_ORNEKLERI)
def test_ek_uyumla(govde, ek, iyelikli, beklenen):
    assert ek_uyumla(govde, ek, iyelikli=iyelikli) == beklenen


@pytest.mark.parametrize(
    ("kisaltma", "okunabilir"),
    [("NATO", True), ("TÜBİTAK", True), ("ASELSAN", True), ("ODTÜ", True), ("YÖK", True),
     ("ABD", False), ("THY", False), ("TBMM", False), ("AB", False), ("DSİ", False), ("ATM", False),
     ("ÖSYM", False), ("AVM", False), ("DİKKAT", True)],
)  # fmt: skip
def test_kisaltma_okunabilir_mi(kisaltma, okunabilir):
    assert okunabilir_mi(kisaltma) is okunabilir


def test_harf_adlari():
    assert harf_harf("ĞÇŞ") == "yumuşak ge çe şe"
    assert kisaltma_oku("PTT") == "pe te te" and kisaltma_oku("NATO") == "nato"

"""OCR metninden MEB sorusu (``moduller/meb_metin.py``): modül incelemesinin bulgularına karşı sınamalar.

Her sınamanın adında, parametre kimliğinde ya da yorumunda bulgu numarası geçer (F1 …, B1, G1 …; R1/R2: ikinci
incelemede bulunan kusurlar; M1 … M13: son düzeltme turunun bulguları). Bütün metinler sentetiktir; gerçek kitapçık
ya da TDK/MEB içeriği kullanılmaz.
Asıl ölçüt: hiçbir soru yanlış cevapla ya da kirli kök/seçenekle tutulmaz; emin olunamayan soru elenir.
"""

from __future__ import annotations

import random
from dataclasses import dataclass

import pytest

from turkce_model.moduller import meb_metin
from turkce_model.moduller.ocr import GORSEL_ISARETI, KESIK_ISARETI

try:
    import pymupdf
except ImportError:  # pragma: no cover
    pymupdf = None


def _ayikla(sayfalar: list[str]) -> tuple[dict, dict, list[str]]:
    """(``"kod:no"`` → tutulan soru, rapor, uyarı satırları)."""
    mesajlar: list[str] = []
    sorular, rapor = meb_metin.metinden_ayristir(sayfalar, "k.pdf", yaz=mesajlar.append)
    return {f"{s.ek['ders_kodu']}:{s.ek['soru_no']}": s for s in sorular}, rapor, mesajlar


def _soru(no: int, kok: str | None = None, secenekler=("Bir", "İki", "Üç", "Dört")) -> str:
    kok = kok or f"{no}. sorunun kökü hangisidir?"
    return f"{no}. {kok}\n\n" + "\n".join(f"{h}) {s}" for h, s in zip("ABCDE", secenekler))


def _anahtar(*dersler: tuple[str, str]) -> str:
    """``("(111) TARİH - 1", "ABCD")`` → cevap anahtarı sayfası ("1. A" …)."""
    govde = "\n\n".join(baslik + "\n\n" + "\n".join(f"{i}. {h}" for i, h in enumerate(harfler, 1)) for baslik, harfler in dersler)
    return "CEVAP ANAHTARI\n\n" + govde


# ---- F1: seçeneğin ya da kökün "N. …" diye süren satırı ------------------------------------------------

F1_ANAHTAR = _anahtar(("(111) TARİH - 1", "DA"))
F1_SORU1 = "(111) TARİH - 1\n\n1. Osmanlı Devleti'nin batıda aldığı en ağır yenilgi hangisidir?\n\n"
F1_SORU2 = (
    "2. Lale Devri'nde aşağıdakilerden hangisi yapılmıştır?\n\n"
    "A) Matbaa kurulmuştur\nB) Ordu kaldırılmıştır\nC) Meclis açılmıştır\nD) Anayasa yapılmıştır"
)


@pytest.mark.parametrize(
    ("secenekler", "son_secenek"),
    [
        pytest.param(
            "A) Mohaç Meydan Muharebesi\nB) Preveze Deniz Savaşı\nC) Çaldıran Savaşı\nD) Osmanlı Devleti'nin\n"
            "2. Viyana Kuşatması'ndaki yenilgisi",
            "Osmanlı Devleti'nin 2. Viyana Kuşatması'ndaki yenilgisi",
            id="F1-alt-alta",
        ),
        pytest.param(
            "A) Sevr Antlaşması B) Mondros Ateşkesi C) Lozan Konferansı D) 1919 Paris\n2. Barış Konferansı",
            "1919 Paris 2. Barış Konferansı",
            id="F1-yan-yana",
        ),
    ],
)
def test_secenegin_sayili_devam_satiri_soru_basi_sayilmaz(secenekler, son_secenek):
    # Boş satırla ayrılmış gerçek 2. soru paragraf başıdır; seçeneğin devamı ("2. Viyana…") değildir.
    sorular, _, _ = _ayikla([F1_SORU1 + secenekler + "\n\n" + F1_SORU2, F1_ANAHTAR])
    assert sorular["111:1"].secenekler[3] == son_secenek and sorular["111:1"].cevap == 3
    assert sorular["111:2"].soru == "Lale Devri'nde aşağıdakilerden hangisi yapılmıştır?"


def test_F1_bos_satirsiz_belirsiz_soru_basi_yanlis_tutulmaz():
    secenekler = "A) Mohaç Meydan Muharebesi\nB) Preveze Deniz Savaşı\nC) Çaldıran Savaşı\nD) Osmanlı Devleti'nin\n"
    sayfa = (F1_SORU1 + secenekler + "2. Viyana Kuşatması'ndaki yenilgisi\n\n" + F1_SORU2).replace("\n\n", "\n")
    sorular, _, _ = _ayikla([sayfa, F1_ANAHTAR])
    # Paragraf bilgisi yok: iki "2." satırından hangisinin soru başı olduğu bilinemez, komşu sorular elenir.
    assert "111:1" not in sorular or sorular["111:1"].secenekler[3].endswith("Viyana Kuşatması'ndaki yenilgisi")
    assert "111:2" not in sorular or sorular["111:2"].soru.startswith("Lale Devri")


@pytest.mark.parametrize(
    "ilk",
    [
        pytest.param("3. Hangisi bir renktir?\n\nA) Mavi\nB) Masa\nC) Kalem\nD) Defter", id="M8-sirasiz-soru"),
        pytest.param("2. Dünya Savaşı'ndan sonra", id="M8-sayili-devam-satiri"),
    ],
)
def test_M8_baslik_sonrasindaki_secilmeyen_aday_ders_basligina_eklenmez(ilk):
    # F1 seçilmeyen adayı önceki satıra ekler; ders başlığına eklenseydi başlık bozulur, ders kaybolurdu ("0 ders").
    sayfa = "(111) TARİH - 1\n\n" + ilk + "\n\n" + _soru(1) + "\n\n" + _soru(2)
    sorular, rapor, _ = _ayikla([sayfa, _anahtar(("(111) TARİH - 1", "ABA"))])
    assert {k: (s.ders, s.cevap, s.secenekler) for k, s in sorular.items()} == {
        "111:1": ("Tarih - 1", 0, ["Bir", "İki", "Üç", "Dört"]), "111:2": ("Tarih - 1", 1, ["Bir", "İki", "Üç", "Dört"])
    }
    assert rapor["ders_sayisi"] == 1 and rapor["sorusuz_anahtarlar"] == []


def test_M13_butun_sorulari_belirsiz_ders_raporda_elenmis_sayilir():
    # Aynı girdi: dersin iki sorusu da belirsiz. Rapor "0 ders, 0 soru" diyor ve dersi "soruları bulunamayan" diye
    # uyarıyordu; ders bulundu, soruları elendi.
    secenekler = "A) Mohaç Meydan Muharebesi\nB) Preveze Deniz Savaşı\nC) Çaldıran Savaşı\nD) Osmanlı Devleti'nin\n"
    sayfa = (F1_SORU1 + secenekler + "2. Viyana Kuşatması'ndaki yenilgisi\n\n" + F1_SORU2).replace("\n\n", "\n")
    sorular, rapor, mesajlar = _ayikla([sayfa, F1_ANAHTAR])
    assert not sorular and (rapor["ders_sayisi"], rapor["bulunan"], rapor["elenen"]) == (1, 2, {"secenek_eksik": 2})
    assert mesajlar == ["k.pdf: 1 ders, 2 soru bulundu, 0 tutuldu (elenen: secenek_eksik 2)"]


F1_DERS_SONU = (
    "(111) TARİH - 1\n\n" + "\n\n".join(_soru(n) for n in range(1, 5)) + "\n\n"
    "5. Hangi padişah döneminde yeniçeri ocağı kaldırılmıştır?\n\nA) I. Selim\nB) III. Selim\nC) I. Mahmut\n"
    "D) II. Mahmut ve"
)
F1_COGRAFYA = "(222) COĞRAFYA - 1\n\n" + _soru(1)
F1_DERS_SONU_ANAHTAR = _anahtar(("(111) TARİH - 1", "ABCDD"), ("(222) COĞRAFYA - 1", "A"))


@pytest.mark.parametrize(
    "sayfalar",
    [
        pytest.param([F1_DERS_SONU + "\n6. Ordu kuruluşu\n\n" + F1_COGRAFYA], id="F1-ders-sonu"),
        pytest.param([(F1_DERS_SONU + "\n6. Ordu kuruluşu\n\n" + F1_COGRAFYA).replace("\n\n", "\n")], id="F1-ders-sonu-bosluksuz"),
        # R1: devam satırı sayfa (ya da sütun) başına düşünce paragraf başı sayılıyordu; 5. soru yarım seçenekle kalırdı.
        pytest.param([F1_DERS_SONU, "6. Ordu kuruluşu\n\n" + F1_COGRAFYA], id="R1-ders-sonu-sayfa-basi"),
        pytest.param([F1_DERS_SONU + "\n\n6. Ordu kuruluşu\n\n" + F1_COGRAFYA], id="R1-ders-sonu-sutun-basi"),
    ],
)
def test_dersin_son_sorusunun_sayili_devami_yarim_secenekle_tutulmaz(sayfalar):  # F1, R1
    sorular, _, _ = _ayikla(sayfalar + [F1_DERS_SONU_ANAHTAR])
    assert "111:5" not in sorular or sorular["111:5"].secenekler[3] == "II. Mahmut ve 6. Ordu kuruluşu"
    assert [sorular[f"111:{n}"].cevap for n in range(1, 5)] == [0, 1, 2, 3] and sorular["222:1"].cevap == 0


def test_R1_secenegi_okunamayan_gercek_son_soru_oncekini_dusurmez():
    # Karşı durum: dersin son sorusu soru cümlesi taşıyor ("…?") ama seçenekleri okunamamış (şekil): yalnız o elenir.
    sayfa = "(111) TARİH - 1\n\n" + "\n\n".join(_soru(n) for n in range(1, 5)) + "\n\n5. Hangisi bir haritadır?\n\n"
    sorular, rapor, _ = _ayikla([sayfa + GORSEL_ISARETI, _anahtar(("(111) TARİH - 1", "ABCDA"))])
    assert set(sorular) == {"111:1", "111:2", "111:3", "111:4"} and rapor["bulunan"] == 5


def test_F1_kokun_sayili_devam_satiri_soru_basi_sayilmaz():
    # Karşı durum (eski sınamada da var): kök "2. Dünya Savaşı'ndan" diye sürüyor; soru tek parça kalır.
    sayfa = (
        F1_SORU1 + "A) Mohaç Meydan Muharebesi\nB) Preveze Deniz Savaşı\nC) Çaldıran Savaşı\nD) Viyana Kuşatması\n\n"
        "2. Aşağıdaki gelişmelerden hangisi\n2. Dünya Savaşı'ndan sonra yaşanmıştır?\n\n"
        "A) Matbaa kurulmuştur\nB) Ordu kaldırılmıştır\nC) Meclis açılmıştır\nD) Anayasa yapılmıştır"
    )
    sorular, _, _ = _ayikla([sayfa, F1_ANAHTAR])
    assert sorular["111:1"].secenekler[3] == "Viyana Kuşatması"
    assert sorular["111:2"].soru == "Aşağıdaki gelişmelerden hangisi 2. Dünya Savaşı'ndan sonra yaşanmıştır?"


# ---- F2, F15, R2: sayfa kenarlarında yinelenen satırlar ---------------------------------------------------

KONULAR = [
    ("Ekonomide arz ve talep dengesi fiyatları belirler. Buna göre hangisi doğrudur?",
     ["Fiyat sabittir", "Talep yoktur", "Arz artar", "Denge oluşur"]),
    ("Aşağıdakilerden hangisi bir soy gazdır?", ["Oksijen", "Azot", "Karbon", "Argon"]),
    ("Bir haftada kaç gün vardır?", ["Beş", "Altı", "Yedi", "Dört"]),
    ("Hangisi bir gezegendir?", ["Ay", "Mars", "Güneş", "Sirius"]),
]


def _kitapcik(sayfa_sayisi: int, ust, soru=None) -> tuple[list[str], int]:
    """Her sayfada iki soru, üstte ``ust(sayfa)`` başlığı, altta sayfa numarası; sonda cevap anahtarı."""
    soru = soru or (lambda no: _soru(no, *KONULAR[(no - 1) % len(KONULAR)]))
    sayfalar, no = [], 1
    for p in range(1, sayfa_sayisi + 1):
        parcalar = [ust(p)] + (["(111) TARİH - 1"] if p == 1 else [])
        parcalar += [soru(no), soru(no + 1), str(p)]
        no += 2
        sayfalar.append("\n\n".join(parcalar))
    return sayfalar + [_anahtar(("(111) TARİH - 1", ("ABCD" * sayfa_sayisi)[: no - 1]))], no - 1


def _dogru_mu(no: int, s) -> bool:
    kok, secenekler = KONULAR[(no - 1) % len(KONULAR)]
    return s.soru == kok and s.secenekler == secenekler and s.cevap == (no - 1) % 4


@pytest.mark.parametrize(
    "ust",
    [
        pytest.param(lambda p: "AÇIK ÖĞRETİM LİSESİ\n2025-2026 GÜZ DÖNEMİ\n1. OTURUM", id="F2-uc-satirli-baslik"),
        pytest.param(lambda p: "1. OTURUM" if p % 2 else "A KİTAPÇIĞI", id="F2-tek-cift-sayfa-basligi"),
        pytest.param(lambda p: "1. OTURUM", id="F2-karsi-durum-iki-satirli-baslik"),
    ],
)
def test_yinelenen_sayfa_basligi_soruya_karismaz(ust):  # F2
    sayfalar, n = _kitapcik(8, ust)
    sorular, rapor, _ = _ayikla(sayfalar)
    assert rapor["tutulan"] == n == 16
    assert all(_dogru_mu(int(k.split(":")[1]), s) for k, s in sorular.items())


def test_F2_kisa_kitapcikta_sayfa_basligi_soruya_karismaz():
    # İki soru sayfalık kitapçık (eşik "en az 3 sayfa" iken başlık kenar sayılmıyordu); kök sayfa arasında sürüyor.
    s1 = _soru(1, *KONULAR[1])
    sayfalar = [
        "1. OTURUM\n\n(111) TARİH - 1\n\n" + s1 + "\n\n2. Ekonomide arz ve talep dengesi\n\n1",
        "1. OTURUM\n\nfiyatları belirler. Buna göre hangisi doğrudur?\n\n"
        "A) Fiyat sabittir\nB) Talep yoktur\nC) Arz artar\nD) Denge oluşur\n\n2",
        _anahtar(("(111) TARİH - 1", "AD")),
    ]
    sorular, _, _ = _ayikla(sayfalar)
    assert sorular["111:2"].soru == KONULAR[0][0] and sorular["111:2"].secenekler == KONULAR[0][1]
    assert sorular["111:1"].secenekler == KONULAR[1][1]


def test_F2_sayfa_basindaki_yalniz_numara_satiri_kenar_sayilmaz():
    # Numarası ayrı blokta okunmuş soru ("5." + kök): "#." kenar sayılsaydı bütün ders kaybolurdu.
    def numarasi_ayri(no: int) -> str:
        return _soru(no, *KONULAR[(no - 1) % len(KONULAR)]).replace(f"{no}. ", f"{no}.\n", 1)

    sayfalar, n = _kitapcik(8, lambda p: "1. OTURUM", soru=numarasi_ayri)
    sorular, rapor, _ = _ayikla(sayfalar)
    assert rapor["tutulan"] == n and all(_dogru_mu(int(k.split(":")[1]), s) for k, s in sorular.items())


def test_F15_sekil_isareti_sayfa_kenarinda_yinelense_de_soruyu_eler():
    sayfalar, no = [], 1
    for p in range(1, 7):  # her sayfanın ilk sorusu şekilli; işaret sayfanın ikinci dolu satırı
        parcalar = ["1. OTURUM"] + (["(111) TARİH - 1"] if p == 1 else []) + [GORSEL_ISARETI]
        parcalar += [_soru(no, "Bu yapı hangi uygarlığa aittir?", ["Hitit", "Urartu", "Frig", "Lidya"])]
        parcalar += [_soru(no + 1, "Hangisi bir başkenttir?", ["Ankara", "Deniz", "Hava", "Uzay"]), str(p)]
        no += 2
        sayfalar.append("\n\n".join(parcalar))
    sorular, rapor, _ = _ayikla(sayfalar + [_anahtar(("(111) TARİH - 1", "A" * (no - 1)))])
    assert rapor["bulunan"] == 12 and not [k for k, s in sorular.items() if s.ek["soru_no"] % 2]


def test_R2_cok_sayfada_yinelenen_kesik_isareti_kenar_sayilmaz():
    # En_fazla_token düşükken birçok sayfa kesilir: "[KESİK]" büyük harfli ve sayfa sonunda yinelenir.
    sayfalar, no = [], 1
    for p in range(1, 9):
        parcalar = (["(111) TARİH - 1"] if p == 1 else []) + [_soru(no), _soru(no + 1)]
        if p in (2, 5, 7):
            parcalar[-1] = parcalar[-1].replace("D) Dört", "D) Dö") + "\n\n" + KESIK_ISARETI
        no += 2
        sayfalar.append("\n\n".join(parcalar))
    sorular, rapor, _ = _ayikla(sayfalar + [_anahtar(("(111) TARİH - 1", "D" * (no - 1)))])
    assert rapor["bulunan"] == 16 and not [k for k, s in sorular.items() if s.secenekler[-1] != "Dört"]
    assert {"111:4", "111:10", "111:14"}.isdisjoint(sorular)


# ---- M1: kısa kitapçıkta gevşek kenar eşiği (2 sayfa) içerik satırını sayfa başlığı sanmaz --------------------

M1_ALMANCA_1 = ["(183) SEÇMELİ İKİNCİ YABANCI DİL", "ALMANCA - 1"]
M1_ALMANCA_2 = ["(184) SEÇMELİ İKİNCİ YABANCI DİL", "ALMANCA - 2"]
M1_SECMELI = ["(532) SEÇMELİ", "PEYGAMBERİMİZİN HAYATI - 2"]
M1_TARIH = ["(111) TARİH - 1"]


def _kisa_kitapcik(basliklar: list[list[str]], her_sayfada: bool = False) -> list[str]:
    """Kapak + her ders iki sayfa (sayfa başına üç soru, cevap "A") + anahtar: en çok 8 sayfa, yani küçük harfsiz
    satır 2 sayfada yinelenince kenar sayılır. ``her_sayfada``: ders başlığı her sayfanın başında yinelenir."""
    sayfalar = ["AÇIK ÖĞRETİM LİSESİ\n\n1. OTURUM\n\nAdayların dikkatine: süre 90 dakikadır."]
    anahtar = ["CEVAP ANAHTARI", ""]
    for baslik in basliklar:
        no = 1
        for p in range(2):
            g = ["1. OTURUM", ""] + (baslik + [""] if p == 0 or her_sayfada else [])
            for _ in range(3):
                kok, secenekler = KONULAR[no % 4]
                g += [f"{no}. {kok}", "", *(f"{h}) {s}" for h, s in zip("ABCD", secenekler)), ""]
                no += 1
            sayfalar.append("\n".join(g + [str(len(sayfalar) + 1)]))
        anahtar += baslik + [""] + [f"{n}. A" for n in range(1, no)] + [""]
    return sayfalar + ["\n".join(anahtar)]


def _secenekleri_temiz(sorular: dict) -> bool:
    return all(s.secenekler == KONULAR[s.ek["soru_no"] % 4][1] for s in sorular.values())


@pytest.mark.parametrize(
    ("basliklar", "dersler", "elenen"),
    [
        # Dil satırı atılınca ders "Seçmeli İkinci Yabancı Dil" sanılıyor, Almanca sorular eğitime giriyordu.
        pytest.param([M1_ALMANCA_1, M1_TARIH], {"111": "Tarih - 1"}, {"yabanci_dil": 6}, id="M1-yabanci-dil-basligi"),
        pytest.param(
            [M1_SECMELI, M1_TARIH], {"532": "Seçmeli Peygamberimizin Hayatı - 2", "111": "Tarih - 1"}, {},
            id="M1-iki-satirli-baslik",
        ),
        # Aynı dersin iki düzeyi: "ALMANCA - #" iki soru sayfasında yineleniyor (anahtar sayfası sayılmasa da kenar
        # olurdu; anahtarı sayımdan çıkarmak yetmez, aşağıdaki karşı duruma da bak).
        pytest.param(
            [M1_ALMANCA_1, M1_ALMANCA_2, M1_TARIH], {"111": "Tarih - 1"}, {"yabanci_dil": 12},
            id="M1-iki-duzeyli-yabanci-dil",
        ),
    ],
)
def test_M1_sarilmis_ders_basliginin_devami_kenar_sayilmaz(basliklar, dersler, elenen):
    sorular, rapor, _ = _ayikla(_kisa_kitapcik(basliklar))
    assert {s.ek["ders_kodu"]: s.ders for s in sorular.values()} == dersler
    assert rapor["elenen"] == elenen and _secenekleri_temiz(sorular)


def test_M1_her_sayfada_yinelenen_sarilmis_baslik_secenege_karismaz():
    # Devam satırı artık kenar sayılmıyor: yinelenen başlık atılırken devamı da atılmalı, yoksa önceki sayfanın son
    # seçeneğine ("Dört PEYGAMBERİMİZİN HAYATI - 2") eklenirdi.
    sorular, rapor, _ = _ayikla(_kisa_kitapcik([M1_SECMELI, M1_TARIH], her_sayfada=True))
    assert rapor["tutulan"] == 12 and _secenekleri_temiz(sorular)
    assert {s.ders for k, s in sorular.items() if k.startswith("532:")} == {"Seçmeli Peygamberimizin Hayatı - 2"}


M1_PARCA = "Bir kent, yalnız binalardan değil, içinde yaşayanların ortak belleğinden de oluşur."


def test_M1_buyuk_harfli_grup_yonergesi_kenar_sayilmaz():
    # 9 sayfanın 3'ünde sayfa başında büyük harfli yönerge: atılınca ortak metin önceki seçeneğe yapışıyor, 3-4. sorular
    # metinsiz tutuluyordu.
    sayfalar, no = [], 1
    for p in range(1, 9):
        g = ["1. OTURUM", ""] + (["(111) TARİH - 1", ""] if p == 1 else [])
        if p in (2, 4, 6):
            g += [f"{no} - {no + 1}. SORULARI AŞAĞIDAKİ METNE GÖRE CEVAPLAYINIZ.", "", M1_PARCA, ""]
            g += [_soru(no, "Bu metne göre kentin belleğini ne taşır?"), "", _soru(no + 1, "Bu metnin konusu nedir?")]
        else:
            g += [_soru(no), "", _soru(no + 1)]
        no += 2
        sayfalar.append("\n".join(g + ["", str(p)]))
    sorular, rapor, _ = _ayikla(sayfalar + [_anahtar(("(111) TARİH - 1", "A" * (no - 1)))])
    assert rapor["tutulan"] == 16
    for n in (3, 4, 7, 8, 11, 12):
        ilk = n if n % 2 else n - 1
        assert sorular[f"111:{n}"].soru.split("\n")[0] == f"{ilk} - {ilk + 1}. SORULARI AŞAĞIDAKİ METNE GÖRE CEVAPLAYINIZ. {M1_PARCA}"
        assert sorular[f"111:{n}"].secenekler == ["Bir", "İki", "Üç", "Dört"]


def test_M1_tek_basina_oncul_isareti_kenar_sayilmaz():
    # "III." üç sayfanın son satırlarında: atılınca öncül numarasız kalıyor, "I, II ve III" seçeneği boşa düşüyordu.
    sayfalar, no, devam = [], 1, False
    for p in range(1, 8):
        g = ["1. OTURUM", ""] + (["(111) TARİH - 1", ""] if p == 1 else [])
        if devam:
            g += ["Ordu yeniden düzenlenmiştir.", "Buna göre hangileri doğrudur?", "",
                  "A) Yalnız I", "B) Yalnız II", "C) I ve II", "D) I, II ve III", ""]
        g += [_soru(no), ""]
        devam = p in (1, 3, 5)
        if devam:
            g += [f"{no + 1}. Aşağıdakiler verilmiştir:", "I. Gelirler artmıştır.", "II. Okullar açılmıştır.", "III."]
        else:
            g += [_soru(no + 1), ""]
        no += 2
        sayfalar.append("\n".join(g + [str(p)]))
    sorular, _, _ = _ayikla(sayfalar + [_anahtar(("(111) TARİH - 1", "A" * (no - 1)))])
    for n in (2, 6, 10):
        assert sorular[f"111:{n}"].soru.split() == (
            "Aşağıdakiler verilmiştir: I. Gelirler artmıştır. II. Okullar açılmıştır. III. Ordu yeniden düzenlenmiştir. "
            "Buna göre hangileri doğrudur?"
        ).split()


def test_M1_karsi_durum_tek_soru_sayfasinin_alt_bilgisi_anahtarda_da_yinelenince_kenardir():
    # Anahtar sayfası sayımdan çıkarılsaydı tek soru sayfalı kitapçıkta alt bilgi son seçeneğe yapışırdı.
    sayfalar = [
        "(111) TARİH - 1\n\n" + _soru(1) + "\n\n" + _soru(2) + "\n\nA KİTAPÇIĞI",
        _anahtar(("(111) TARİH - 1", "AB")) + "\n\nA KİTAPÇIĞI",
    ]
    sorular, _, _ = _ayikla(sayfalar)
    assert [s.secenekler for s in sorular.values()] == [["Bir", "İki", "Üç", "Dört"]] * 2


# ---- B1, F8: kesik sayfa ve sayfa sınırındaki şekil --------------------------------------------------------


def test_B1_kesik_sayfanin_son_sorusu_elenir():
    sayfa = (
        "(111) TARİH - 1\n\n" + _soru(1, "Hangisi bir başkenttir?", ["Ankara", "Deniz", "Hava", "Uzay"]) + "\n\n"
        "2. Aşağıdakilerden hangisi Tanzimat Fermanı'nın sonuçlarından biridir?\n\nA) Kanun önünde eşitlik\n"
        "B) Saltanatın kaldırılması\nC) Cumhuriyetin ilanı\nD) Halifeliğin kal\n\n" + KESIK_ISARETI
    )
    sorular, rapor, _ = _ayikla([sayfa, _anahtar(("(111) TARİH - 1", "AA"))])
    assert set(sorular) == {"111:1"} and rapor["elenen"] == {"gorsel_gerekli": 1}


F8_ANAHTAR = _anahtar(("(111) TARİH - 1", "A"), ("(555) BİYOLOJİ - 1", "BC"))
F8_TARIH = "(111) TARİH - 1\n\n" + _soru(1, "Hangisi bir başkenttir?", ["Ankara", "Deniz", "Hava", "Uzay"])
F8_SORU1 = _soru(1, "Bu canlı hangi gruptadır?", ["Mantar", "Bitki", "Hayvan", "Bakteri"])
F8_SORU2 = _soru(2, "Hangisi bir organeldir?", ["Kök", "Ribozom", "Yaprak", "Çiçek"])


@pytest.mark.parametrize(
    "sayfalar",
    [
        pytest.param([F8_TARIH + "\n\n(555) BİYOLOJİ - 1\n\n" + GORSEL_ISARETI, F8_SORU1 + "\n\n" + F8_SORU2], id="F8-sayfa-sonunda"),
        pytest.param([F8_TARIH + "\n\n(555) BİYOLOJİ - 1\n\n" + F8_SORU1, GORSEL_ISARETI + "\n\n" + F8_SORU2], id="F8-sayfa-basinda"),
        pytest.param([F8_TARIH + "\n\n(555) BİYOLOJİ - 1", GORSEL_ISARETI + "\n\n" + F8_SORU1 + "\n\n" + F8_SORU2], id="F8-karsi-durum"),
    ],
)
def test_sayfa_sinirindaki_sekil_obur_sayfadaki_soruya_da_deger(sayfalar):  # F8
    sorular, _, _ = _ayikla(sayfalar + [F8_ANAHTAR])
    assert "555:1" not in sorular and sorular["111:1"].cevap == 0


# ---- F3, F7, F12: başka metnin seçeneğe karışması ----------------------------------------------------------

F3_S1 = (
    "1. Bu düzenleme ile aşağıdakilerden hangisi amaçlanmıştır?\n\n"
    "A) Merkezi otoritenin güçlendirilmesi amaçlanmıştır\nB) Halkın yönetime katılımı sağlanmak istenmiştir\n"
    "C) Toprak sisteminin bozulması önlenmeye çalışılmıştır\nD) Ticaret yollarının denetimi ele geçirilmiştir"
)


@pytest.mark.parametrize(
    "ikinci",
    [
        pytest.param("Hangisi bir şehirdir?", id="F3-numara-okunamamis"),
        pytest.param("2.Hangisi bir şehirdir?", id="F3-bosluksuz-numara"),
        pytest.param("2) Hangisi bir şehirdir?", id="F3-parantezli-numara"),
        pytest.param("1. Hangisi bir şehirdir?", id="F3-yinelenen-numara"),
    ],
)
def test_numarasi_okunamayan_soru_oncekinin_secenegine_yutulmaz(ikinci):  # F3
    s2 = ikinci + "\n\nA) Ankara\nB) Deniz\nC) Hava\nD) Uzay"
    s3 = _soru(3, "Hangisi bir gezegendir?", ["Mars", "Ay", "Güneş", "Sirius"])
    sorular, _, _ = _ayikla(["(111) TARİH - 1\n\n" + F3_S1 + "\n\n" + s2 + "\n\n" + s3, _anahtar(("(111) TARİH - 1", "DAA"))])
    assert "111:1" not in sorular  # D seçeneğine 2. soru yapışmıştı ("… ele geçirilmiştir Hangisi bir şehirdir? A) …")
    assert sorular["111:3"].secenekler == ["Mars", "Ay", "Güneş", "Sirius"]


@pytest.mark.parametrize(
    "son",
    [
        pytest.param("TEST BİTTİ.", id="F7-asil-bicim"),
        pytest.param("TEST BITTI.", id="F7-noktasiz-I"),
        pytest.param("Test bitti.", id="F7-kucuk-harf"),
        pytest.param("TEST BİTTİ. CEVAPLARINIZI KONTROL EDİNİZ.", id="F7-iki-cumle"),
        pytest.param("Cevaplarınızı kontrol ediniz.", id="F7-kontrol-kucuk-harf"),
        pytest.param("CEVAPLARINIZI KONTROL EDINIZ.", id="F7-kontrol-noktasiz-I"),
    ],
)
def test_sinav_sonu_satirinin_ocr_bicimleri_secenege_eklenmez(son):  # F7
    sayfa = "(111) TARİH - 1\n\n" + _soru(1, "Hangisi bir gezegendir?", ["Mars", "Ay", "Güneş", "Sirius"]) + "\n\n"
    sayfa += _soru(2, "Hangisi bir başkenttir?", ["Ankara", "Deniz", "Hava", "Uzay"]) + "\n\n" + son
    sorular, _, _ = _ayikla([sayfa, _anahtar(("(111) TARİH - 1", "AA"))])
    assert sorular["111:2"].secenekler == ["Ankara", "Deniz", "Hava", "Uzay"]


@pytest.mark.parametrize(
    ("son", "sayfa_sayisi"),
    [
        pytest.param(son, n, id=f"M4-{ad}-{n}-sayfa")
        for ad, son in (
            ("diger-teste-geciniz", "DİĞER TESTE GEÇİNİZ."), ("basarilar", "Başarılar dileriz."),
            ("basarilar-buyuk", "BAŞARILAR DİLERİZ."), ("sona-erdi", "Sınav sona erdi."), ("bitmistir", "TEST BİTMİŞTİR."),
            ("lutfen-kontrol", "Lütfen cevaplarınızı kontrol ediniz."), ("iyi-sanslar", "Test bitti. İyi şanslar."),
        )
        for n in (1, 3)
    ],
)
def test_M4_kapanis_satirinin_baska_bicimleri_son_secenege_eklenmez(son, sayfa_sayisi):
    # Kapanış satırı yalnız kitapçığın sonunda (kenar sayılacak kadar yinelenmiyor): son seçeneğe yapışıyordu
    # ("Dört Başarılar dileriz.").
    sayfalar = [
        "\n\n".join([("(111) TARİH - 1" if p == 0 else "1. OTURUM"), _soru(2 * p + 1), _soru(2 * p + 2)])
        for p in range(sayfa_sayisi)
    ]
    sayfalar[-1] += "\n\n" + son
    sorular, rapor, _ = _ayikla(sayfalar + [_anahtar(("(111) TARİH - 1", "AB" * sayfa_sayisi))])
    assert rapor["tutulan"] == 2 * sayfa_sayisi and {tuple(s.secenekler) for s in sorular.values()} == {("Bir", "İki", "Üç", "Dört")}


M3_PARCA = ["Ayşe bütün dönem düzenli çalıştı.", "Sınav bitti, sonuçlar bir hafta sonra açıklandı.", "Ayşe ödül kazandı."]


@pytest.mark.parametrize(
    "parca",
    [
        pytest.param(M3_PARCA, id="M3-parcadaki-cumle"),
        # Satırın tamamı kapanış cümlesi olsa da birden çok soruya ait parçanın içindedir: kapanış sayılmaz.
        pytest.param(["Ayşe bütün dönem düzenli çalıştı.", "Sınav bitti.", "Ayşe ödül kazandı."], id="M3-parcadaki-tam-satir"),
        pytest.param(["Okulumuzda kitap şenliği yapılacaktır.", "Başarılar dileriz.", "Okul Müdürlüğü"], id="M4-parcadaki-duyuru"),
    ],
)
def test_M3_parcadaki_sinav_bitti_satiri_ortak_metni_kesmez(parca):
    sayfa = (
        "(111) TÜRK DİLİ VE EDEBİYATI - 1\n\n" + _soru(1) + "\n\n2 - 3. soruları aşağıdaki metne göre cevaplayınız.\n\n"
        + "\n".join(parca) + "\n\n" + _soru(2, "Bu metne göre Ayşe ne kazandı?") + "\n\n" + _soru(3, "Bu metnin konusu nedir?")
    )
    sorular, rapor, _ = _ayikla([sayfa, _anahtar(("(111) TÜRK DİLİ VE EDEBİYATI - 1", "ABC"))])
    assert rapor["tutulan"] == 3
    for n in (2, 3):  # parça kesilip sorular yarım metinle tutuluyordu
        assert sorular[f"111:{n}"].soru.split("\n")[0].endswith(" ".join(parca))


def test_M3_kokteki_sinav_bitti_satiri_soruyu_kapatmaz():
    kok = "Aşağıdakilerden hangisi\nSınav bitti mi diye soran öğrenciye\nverilebilecek en uygun cevaptır?"
    sorular, _, _ = _ayikla(["(111) TARİH - 1\n\n" + _soru(1, kok) + "\n\n" + _soru(2), _anahtar(("(111) TARİH - 1", "AB"))])
    assert sorular["111:1"].soru == " ".join(kok.split("\n")) and sorular["111:1"].secenekler == ["Bir", "İki", "Üç", "Dört"]


F12_S2 = (
    "2. Bu düzenlemenin amacı aşağıdakilerden hangisidir?\n\nA) Merkezi otoriteyi güçlendirmek\n"
    "B) Halkın yönetime katılımını sağlamak\nC) Toprak sistemini korumak\nD) Yerel yöneticilerin"
)
F12_COGRAFYA = "(222) COĞRAFYA - 1\n\n" + _soru(1, "Hangisi bir akarsu şeklidir?", ["Kumul", "Delta", "Moren", "Lapya"])
F12_BAS = "(111) TARİH - 1\n\n" + _soru(1, "Hangisi bir başkenttir?", ["Ankara", "Deniz", "Hava", "Uzay"]) + "\n\n"


@pytest.mark.parametrize(
    "sayfalar",
    [
        pytest.param([F12_BAS + F12_S2, "(111) TARİH - 1\n\nyetkilerini artırmak\n\n" + F12_COGRAFYA], id="F12-yeni-ders"),
        pytest.param([F12_BAS + F12_S2, "(111) TARİH - 1\n\nyetkilerini artırmak\n\nTEST BİTTİ."], id="F12-test-bitti"),
        pytest.param(
            [F12_BAS + "2. Bu düzenlemenin amacı",
             "(111) TARİH - 1\n\naşağıdakilerden hangisidir?\n\nA) Merkezi otoriteyi güçlendirmek\n"
             "B) Halkın yönetime katılımını sağlamak\nC) Toprak sistemini korumak\nD) Yerel yöneticilerin yetkilerini artırmak"
             "\n\n" + F12_COGRAFYA],
            id="F12-kok-sayfa-arasinda",
        ),
        pytest.param([F12_BAS + F12_S2, "yetkilerini artırmak\n\n" + F12_COGRAFYA], id="F12-karsi-durum-basliksiz"),
    ],
)
def test_sayfa_basinda_yinelenen_ders_basligi_son_soruyu_bolmez(sayfalar):  # F12
    sorular, _, _ = _ayikla(sayfalar + [_anahtar(("(111) TARİH - 1", "AD"), ("(222) COĞRAFYA - 1", "B"))])
    s2 = sorular["111:2"]
    assert s2.soru == "Bu düzenlemenin amacı aşağıdakilerden hangisidir?" and s2.cevap == 3
    assert s2.secenekler[3] == "Yerel yöneticilerin yetkilerini artırmak"


# ---- F4, F5, F6, F10, G1: cevap anahtarı -----------------------------------------------------------------

F4_SORULAR = (
    "(111) TARİH - 1\n\n" + _soru(1, "Hangisi bir başkenttir?", ["Ankara", "Deniz", "Hava", "Uzay"]) + "\n\n"
    + _soru(2, "Hangisi bir gezegendir?", ["Ay", "Mars", "Güneş", "Sirius"])
)


@pytest.mark.parametrize(
    "kapak",
    [
        pytest.param("Cevap anahtarı kitapçığın sonundadır", id="F4-virgulsuz"),
        pytest.param("Cevap anahtarı kitapçığın sonundadır.", id="F4-noktali"),
        pytest.param("CEVAP ANAHTARI KİTAPÇIĞIN SONUNDADIR", id="F4-buyuk-harf"),
        pytest.param("Sınav bitiminde cevap anahtarı yayımlanacaktır", id="F4-yayimlanacak"),
    ],
)
def test_kapaktaki_cevap_anahtari_cumlesi_anahtari_baslatmaz(kapak):  # F4
    sorular, rapor, mesajlar = _ayikla(["AÇIK ÖĞRETİM LİSESİ\n\n" + kapak, F4_SORULAR, _anahtar(("(111) TARİH - 1", "AB"))])
    assert {k: s.cevap for k, s in sorular.items()} == {"111:1": 0, "111:2": 1} and rapor["anahtar_sayfasi"] == 1
    assert not [m for m in mesajlar if "Uyarı" in m]


@pytest.mark.parametrize(
    "baslik",
    [
        pytest.param("DENEME SINAVI 1. OTURUM T KİTAPÇIĞI CEVAP ANAHTARI", id="F5-oturum"),
        pytest.param("2025-2026 1. DÖNEM CEVAP ANAHTARI", id="F5-donem"),
        pytest.param("CEVAP ANAHTARI (A KİTAPÇIĞI)", id="F5-karsi-durum-kitapcik"),
    ],
)
def test_sira_sayili_cevap_anahtari_basligi_taninir(baslik):  # F5
    assert meb_metin._anahtar_basligi_mi(baslik)
    sorular, _, mesajlar = _ayikla([F4_SORULAR, baslik + "\n\n(111) TARİH - 1\n\n1. A\n2. B"])
    assert {k: s.cevap for k, s in sorular.items()} == {"111:1": 0, "111:2": 1}
    assert not [m for m in mesajlar if "bulunamadı" in m]


F6_KITAP = [
    "(111) TARİH - 1\n\n" + "\n\n".join(_soru(n) for n in range(1, 7)),
    "(222) COĞRAFYA - 1\n\n" + "\n\n".join(_soru(n) for n in range(1, 4)),
]
F6_T = "(111) TARİH - 1\n\n1. A\n2. B\n3. C\n4. D\n5. A\n6. B"
F6_C = "(222) COĞRAFYA - 1\n\n1. D\n2. C\n3. B"


def _cevaplar(sorular: dict) -> dict[str, str]:
    return {k: "ABCDE"[s.cevap] for k, s in sorular.items()}


def test_F6_anahtardan_sonraki_numarali_arka_kapak_cevap_sayilmaz():
    arka = "ADAYLARA UYARILAR\n\n1. Sınav süresi 90 dakikadır.\n2. Cevaplarınızı kurşun kalemle işaretleyiniz."
    sorular, _, _ = _ayikla(F6_KITAP + ["CEVAP ANAHTARI\n\n" + F6_T + "\n\n" + F6_C, arka])
    assert _cevaplar(sorular) == {
        "111:1": "A", "111:2": "B", "111:3": "C", "111:4": "D", "111:5": "A", "111:6": "B",
        "222:1": "D", "222:2": "C", "222:3": "B",
    }


def test_F6_iptal_dipnotu_yalniz_o_soruyu_eler():
    sorular, rapor, _ = _ayikla(F6_KITAP + ["CEVAP ANAHTARI\n\n" + F6_T + "\n\n" + F6_C + "\n\n2. soru iptal edilmiştir."])
    # Dipnotun numarası anahtarda da var ("2. C"): soru iptal sayılır, harfiyle tutulmaz; dersin kalanı korunur.
    assert "222:2" not in sorular and rapor["elenen"] == {"cevap_yok": 1}
    assert _cevaplar(sorular)["222:3"] == "B" and len(sorular) == 8


@pytest.mark.parametrize(
    ("anahtar", "uyari", "adlar"),
    [
        pytest.param(
            "CEVAP ANAHTARI\n\n" + F6_T + "\n\nCOĞRAFYA\n\n1. D\n2. C\n3. B",
            "aynı soru iki farklı harfle okundu", "(111) TARİH - 1", id="F6-basligi-okunamamis",
        ),
        pytest.param(
            "CEVAP ANAHTARI\n\n(111) TARİH - 1\n(222) COĞRAFYA - 1\n\n1 / A / 1 / D\n2 / B / 2 / C\n3 / C / 3 / B\n4 / D\n5 / A\n6 / B",
            "aynı soru iki farklı harfle okundu", "(222) COĞRAFYA - 1", id="F6-yan-yana-ciftler",
        ),
        pytest.param(
            "CEVAP ANAHTARI\n\n(111) TARİH - 1\n(222) COĞRAFYA - 1\n\n1 / A / 1 / D\n2 / B / 2 / C\n3 / C / 3 / B\n4 / D\n5 / A\n6 / B",
            "ders başlığının altında cevap okunamadı", "(111) TARİH - 1", id="G1-cevapsiz-baslik",
        ),
    ],
)
def test_guvenilmeyen_ya_da_bos_anahtar_dersi_adiyla_uyarir(anahtar, uyari, adlar):  # F6, G1
    sorular, rapor, mesajlar = _ayikla(F6_KITAP + [anahtar])
    assert not sorular  # yanlış cevapla tutulan soru yok
    satir = next(m for m in mesajlar if uyari in m)
    assert satir.startswith("  Uyarı: cevap anahtarında") and satir.endswith("cevapsız sayıldı: " + adlar)


def test_G1_bos_anahtar_uyarisi_sorusuz_dersi_yinelemez():
    # Anahtardaki dersin hem cevabı hem sorusu yoksa meb.pdf_ayristir'in "soruları bulunamayan" uyarısı yeter.
    _, rapor, mesajlar = _ayikla(F6_KITAP[:1] + ["CEVAP ANAHTARI\n\n" + F6_T + "\n\n(333) FELSEFE - 1\n\nTEST BİTTİ."])
    assert rapor["bos_anahtarlar"] == [] and rapor["sorusuz_anahtarlar"] == ["(333) FELSEFE - 1"]
    assert not [m for m in mesajlar if "altında cevap okunamadı" in m]


def test_F10_anahtarin_devam_sayfasinda_yinelenen_ders_basligi_dersi_bolmez():
    kitap = ["(111) TARİH - 1\n\n" + "\n\n".join(_soru(n) for n in range(1, 7))]
    anahtar = ["CEVAP ANAHTARI\n\n(111) TARİH - 1\n\n1. A\n2. B\n3. C", "(111) TARİH - 1\n\n4. D\n5. A\n6. B"]
    sorular, rapor, mesajlar = _ayikla(kitap + anahtar)
    assert "".join(_cevaplar(sorular)[f"111:{n}"] for n in range(1, 7)) == "ABCDAB"
    assert rapor["sorusuz_anahtarlar"] == [] and not [m for m in mesajlar if "Uyarı" in m]


# ---- F13: metin katmanı ---------------------------------------------------------------------------------


def _pdf(yol, sayfalar) -> None:
    """``sayfalar``: satır listesi (metinli sayfa), ``"tarama"`` (dört şerit resimle döşenmiş) ya da ``None`` (boş)."""
    belge = pymupdf.open()
    pm = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, 60, 40), False)
    pm.set_rect(pm.irect, (200, 200, 200))
    resim = pm.tobytes("png")
    for icerik in sayfalar:
        s = belge.new_page(width=595, height=842)
        if icerik == "tarama":
            for k in range(4):
                s.insert_image(pymupdf.Rect(0, k * 210, 595, (k + 1) * 210), stream=resim)
        elif icerik:
            for i, t in enumerate(icerik):
                s.insert_text((40, 60 + 14 * i), t, fontsize=10)
    belge.save(yol)
    belge.close()


@pytest.mark.skipif(pymupdf is None, reason="pymupdf kurulu değil")
def test_F13_bos_arka_kapak_metin_katmanini_gizlemez_doseme_tarama_ocrye_gider(tmp_path):
    # Seyrek ama metinli üç sayfa (sayfa başına 124 karakter; eşik sayfa başına 100): boş arka kapak ortalamaya
    # katılınca 372 < 4 × 100 olup OCR'a gidiyordu.
    seyrek = [["Question one asks which city is a capital.", "A) Ankara  B) Sea  C) Air  D) Space",
               "Question two asks which body is a planet here.", "Choose the single best answer."]] * 3
    _pdf(tmp_path / "seyrek.pdf", seyrek)
    _pdf(tmp_path / "seyrek_kapakli.pdf", [*seyrek, None])
    assert meb_metin.metin_katmani_var(tmp_path / "seyrek.pdf")
    assert meb_metin.metin_katmani_var(tmp_path / "seyrek_kapakli.pdf")
    # Metinli kapak + resimle döşenmiş taranmış sayfalar: resimli sayfa boş sayılmaz, OCR'a gider.
    kapak = ["OPEN HIGH SCHOOL", "Exam session one, read the instructions carefully before you begin.",
             "Mark your answers on the answer sheet with a soft pencil."]
    _pdf(tmp_path / "tarama.pdf", [kapak, "tarama", "tarama", "tarama", "tarama"])
    assert not meb_metin.metin_katmani_var(tmp_path / "tarama.pdf")


# ---- F14, G2: tek soru fotoğrafı --------------------------------------------------------------------------

SORU_FOTO = "Aşağıdakilerden hangisi bir başkenttir?\n\nA) Ankara\nB) İzmir\nC) Bursa\nD) Konya"
SECENEK_FOTO = ["Ankara", "İzmir", "Bursa", "Konya"]


@pytest.mark.parametrize(
    "metin",
    [
        pytest.param("7. " + SORU_FOTO + "\n\n8. Hangisi bir gezegendir?\n\nA) Ay\nB) Mars\nC) Güneş\nD) Sirius", id="F14-iki-soru"),
        pytest.param("7) " + SORU_FOTO, id="F14-parantezli-numara"),
        pytest.param("D) Selim\n\n8. " + SORU_FOTO, id="G2-onceki-sorunun-secenegi"),
        pytest.param("AÇIK ÖĞRETİM LİSESİ\n(111) TARİH - 1\n1. OTURUM\n5. " + SORU_FOTO, id="G2-sayfa-basligi"),
        pytest.param("12\nA KİTAPÇIĞI\n\n5. " + SORU_FOTO, id="G2-sayfa-numarasi"),
    ],
)
def test_tek_soru_yalniz_fotograftaki_soruyu_alir(metin):  # F14, G2
    s = meb_metin.tek_soru(metin)
    assert (s.soru, s.secenekler) == ("Aşağıdakilerden hangisi bir başkenttir?", SECENEK_FOTO)


@pytest.mark.parametrize(
    ("metin", "kok"),
    [
        pytest.param(
            "Aşağıdaki gelişmelerden hangisi\n2. Dünya Savaşı'ndan sonra yaşanmıştır?\n\nA) Bir\nB) İki",
            "Aşağıdaki gelişmelerden hangisi 2. Dünya Savaşı'ndan sonra yaşanmıştır?", id="G2-numarasiz-kok-devami",
        ),
        pytest.param(
            "7. Aşağıdaki gelişmelerden hangisi\n2. Dünya Savaşı'ndan sonra yaşanmıştır?\n\nA) Bir\nB) İki",
            "Aşağıdaki gelişmelerden hangisi 2. Dünya Savaşı'ndan sonra yaşanmıştır?", id="F14-numarali-kok-devami",
        ),
        pytest.param(
            "Hangileri doğrudur?\n\n1. Gelirler artmıştır.\n2. Okullar açılmıştır.\n\nA) Yalnız 1\nB) 1 ve 2",
            "Hangileri doğrudur? 1. Gelirler artmıştır. 2. Okullar açılmıştır.", id="G2-numarali-onculler",
        ),
    ],
)
def test_tek_soru_kokun_basini_atlamaz(metin, kok):  # F14, G2 karşı durumları
    assert meb_metin.tek_soru(metin).soru == kok


@pytest.mark.parametrize(
    "metin",
    [
        pytest.param("AÇIK ÖĞRETİM LİSESİ\n(111) TARİH - 1\n12\n7) " + SORU_FOTO, id="M10-sayfa-basligi"),
        pytest.param("1) OTURUM\n7) " + SORU_FOTO, id="M10-parantezli-oturum-basligi"),
        pytest.param("C) Murat\nD) Selim\n\n8) " + SORU_FOTO, id="M10-onceki-sorunun-secenegi"),
        pytest.param("7) " + SORU_FOTO + "\n\n8) Hangisi bir gezegendir?", id="M10-ikinci-soru"),
        pytest.param("7) " + SORU_FOTO + "\n\n8. Hangisi bir gezegendir?", id="M10-karisik-numara"),
        pytest.param("7. " + SORU_FOTO + "\n\n8) Hangisi bir gezegendir?", id="M10-karisik-numara-ters"),
    ],
)
def test_M10_parantezli_numara_noktali_gibi_taninir(metin):
    # "7)" yalnız ilk satırda atılıyordu: başlık ve önceki seçenekler köke, sonraki "8) …" son seçeneğe ekleniyordu;
    # "7)" + "8." hiç soru vermiyordu.
    s = meb_metin.tek_soru(metin)
    assert (s.soru, s.secenekler) == ("Aşağıdakilerden hangisi bir başkenttir?", SECENEK_FOTO)


@pytest.mark.parametrize(
    ("metin", "kok"),
    [
        pytest.param(
            "Hangileri doğrudur?\n\n1) Gelirler artmıştır.\n2) Okullar açılmıştır.\n\nA) Yalnız 1\nB) 1 ve 2",
            "Hangileri doğrudur? 1) Gelirler artmıştır. 2) Okullar açılmıştır.", id="M10-parantezli-onculler",
        ),
        pytest.param(
            "Aşağıdaki gelişmelerden hangisi\n2) Dünya Savaşı'ndan sonra yaşanmıştır?\n\nA) Bir\nB) İki",
            "Aşağıdaki gelişmelerden hangisi 2) Dünya Savaşı'ndan sonra yaşanmıştır?", id="M10-kok-devami",
        ),
        pytest.param("Açık Öğretim Lisesi\n\n7) " + SORU_FOTO, "Açık Öğretim Lisesi 7) " + SORU_FOTO.split("\n")[0],
                     id="M10-karisik-harfli-baslik-kalir"),
    ],
)
def test_M10_karsi_durum_parantezli_satirlar_koku_bolmez(metin, kok):
    assert meb_metin.tek_soru(metin).soru == kok


# ---- sentetik kitapçık aileleri: çeşitli OCR kusurlarında yanlış tutulan soru yok ----------------------------


@dataclass
class _GercekSoru:
    no: int
    kok: list[str]
    secenekler: list[str]
    cevap: int | None  # None: anahtarda İPTAL
    elenmeli: bool = False  # tutulursa yanlıştır (şekilli, numarası bozuk …)
    bas: str | None = None  # numaranın yazımı (varsayılan "N. ")
    secenek_satirlari: list[str] | None = None
    gorsel: str | None = None  # "once" | "sonra": şekil işareti sorudan önce / sonra

    def satirlar(self) -> list[str]:
        bas = f"{self.no}. " if self.bas is None else self.bas
        secenekler = self.secenek_satirlari or [f"{'ABCDE'[i]}) {m}" for i, m in enumerate(self.secenekler)]
        govde = [bas + self.kok[0], *self.kok[1:], "", *secenekler]
        if self.gorsel == "once":
            govde = [GORSEL_ISARETI, "", *govde]
        elif self.gorsel == "sonra":
            govde = [*govde, "", GORSEL_ISARETI]
        return [*govde, ""]


_DERSLER = ["(111) TARİH - 1", "(222) COĞRAFYA - 1", "(333) FELSEFE - 2", "(444) BİYOLOJİ - 1"]
_BAGLAM = [
    "Kırsal kesimden kentlere göç son yıllarda hızlanmıştır.",
    "Ekonomide arz ve talep dengesi fiyatları belirler.",
    "Bitkiler fotosentez sırasında karbondioksit kullanır.",
    "Akarsuların taşıdığı malzemeler kıyılarda birikir.",
]
_SORU_CUMLESI = ["Buna göre aşağıdakilerden hangisi doğrudur?", "Bu durumun en önemli sonucu hangisidir?"]
_SECENEKLER = ["Ankara", "İzmir", "Bursa", "Konya", "Ticaret", "Tarım", "Sanayi", "Turizm", "Yalnız I", "I ve II",
               "Isı", "Basınç", "Hacim", "Kütle", "Sevgi", "Saygı", "Adalet", "Cesaret"]
_SINAV_SONLARI = ["TEST BİTTİ.", "TEST BITTI.", "Test bitti.", "TEST BİTTİ. CEVAPLARINIZI KONTROL EDİNİZ."]


def _dersler_uret(rng: random.Random) -> list[tuple[str, list[_GercekSoru]]]:
    dersler = []
    for baslik in rng.sample(_DERSLER, rng.randint(2, 3)):
        sik = rng.choice([4, 5])
        sorular = []
        for no in range(1, rng.randint(5, 9) + 1):
            kok = [rng.choice(_BAGLAM), rng.choice(_SORU_CUMLESI)]
            sorular.append(_GercekSoru(no, kok, rng.sample(_SECENEKLER, sik), rng.randrange(sik)))
        dersler.append((baslik, sorular))
    return dersler


def _sec(rng: random.Random, sorular: list[_GercekSoru]) -> _GercekSoru:
    return sorular[rng.randrange(1, len(sorular))]


def _secenek_sarar(rng, dersler) -> dict:  # F1: seçenek "N. Viyana Kuşatması" diye sürüyor
    for _, sorular in dersler:
        s = rng.choice(sorular)
        i = rng.randrange(len(s.secenekler))
        s.secenekler[i] = f"Osmanlı Devleti'nin {s.no + 1}. Viyana Kuşatması"
        s.secenek_satirlari = [f"{'ABCDE'[j]}) {m}" for j, m in enumerate(s.secenekler)]
        s.secenek_satirlari[i : i + 1] = [f"{'ABCDE'[i]}) Osmanlı Devleti'nin", f"{s.no + 1}. Viyana Kuşatması"]
    return {}


def _kok_sarar(rng, dersler) -> dict:  # F1 karşı durumu: kök "N. Dünya Savaşı'ndan" diye sürüyor
    for _, sorular in dersler:
        s = rng.choice(sorular)
        s.kok = [rng.choice(_BAGLAM), "Aşağıdaki gelişmelerden hangisi", f"{s.no + 1}. Dünya Savaşı'ndan sonra yaşanmıştır?"]
    return {}


def _numara_bozuk(yazim):  # F3: numara okunamamış, boşluksuz ya da yinelenmiş soru elenir, öncekine yapışmaz
    def aile(rng, dersler) -> dict:
        for _, sorular in dersler:
            s = _sec(rng, sorular)
            s.bas, s.elenmeli = yazim(s.no), True
        return {}

    return aile


def _gorsel(konum):  # F8, F15: şekil işareti sorudan önce ya da sonra (sayfa sınırına da düşebilir)
    def aile(rng, dersler) -> dict:
        for _, sorular in dersler:
            s = rng.choice(sorular)
            s.gorsel, s.elenmeli = konum, True
        return {}

    return aile


def _kisa(rng, dersler) -> dict:  # F2: kapaksız, tek dersli, bir iki sayfalık kitapçık
    del dersler[1:]
    return {"kapak": False, "satir": rng.choice([12, 18])}


def _kapak_cumlesi(rng, dersler) -> dict:  # F4: kapakta noktalamasız "cevap anahtarı" cümlesi
    return {"kapak_ek": rng.choice(["Cevap anahtarı kitapçığın sonundadır", "Sınav bitiminde cevap anahtarı yayımlanacaktır"])}


def _iptal(rng, dersler) -> dict:
    for _, sorular in dersler:
        s = rng.choice(sorular)
        s.cevap, s.elenmeli = None, True
    return {}


AILELER = {
    "temiz": lambda rng, dersler: {},
    "F1-secenek-sarar": _secenek_sarar,
    "F1-kok-sarar": _kok_sarar,
    "F2-uc-satirli-baslik": lambda rng, d: {"ust": ["AÇIK ÖĞRETİM LİSESİ", "2025-2026 GÜZ DÖNEMİ", "1. OTURUM"]},
    "F2-kitapcik-adi": lambda rng, d: {"ust": ["A KİTAPÇIĞI", "1. OTURUM"], "alt": ["{no}", "Diğer sayfaya geçiniz."]},
    "F2-kisa": _kisa,
    "F3-numarasiz": _numara_bozuk(lambda no: ""),
    "F3-bosluksuz": _numara_bozuk(lambda no: f"{no}."),
    "F3-yinelenen": _numara_bozuk(lambda no: f"{no - 1}. "),
    "F4-kapak-cumlesi": _kapak_cumlesi,
    "F5-anahtar-basligi": lambda rng, d: {"anahtar_basligi": "DENEME SINAVI 1. OTURUM T KİTAPÇIĞI CEVAP ANAHTARI"},
    "F7-test-bitti": lambda rng, d: {"sinav_sonu": rng.choice(_SINAV_SONLARI)},
    "F8-gorsel-once": _gorsel("once"),
    "F8-gorsel-sonra": _gorsel("sonra"),
    "F12-ders-basligi-yinelenir": lambda rng, d: {"ders_basligi_yinele": True},
    "F6-iptal": _iptal,
}


def _kitapcik_uret(rng: random.Random, dersler, ust=("1. OTURUM",), alt=("{no}",), kapak=True, kapak_ek=None,
                   sinav_sonu=None, ders_basligi_yinele=False, satir=22, anahtar_basligi="CEVAP ANAHTARI") -> list[str]:
    alan: list[tuple[str, str | None]] = []  # (satır, dersin başlığı)
    for baslik, sorular in dersler:
        alan += [(baslik, baslik), ("", baslik)]
        for s in sorular:
            alan += [(t, baslik) for t in s.satirlar()]
    if sinav_sonu:
        alan += [("", None), (sinav_sonu, None)]
    sayfalar: list[list[str]] = [[]]
    dolu, hedef = 0, satir
    for t, baslik in alan:  # sayfa rastgele yerlerden kırılır: soru, kök ya da seçenek sayfa arasında kalabilir
        if dolu >= hedef and t:
            sayfalar.append([baslik, ""] if ders_basligi_yinele and baslik and t != baslik else [])
            dolu, hedef = 0, satir + rng.randint(-4, 4)
        sayfalar[-1].append(t)
        dolu += bool(t)
    metinler = []
    if kapak:
        kapak_satirlari = ["AÇIK ÖĞRETİM LİSESİ", "", "DERS KODU VE ADI", *(b for b, _ in dersler), "",
                           "1. Her ders için soru sayısı farklıdır.", "2. Cevaplarınızı cevap kâğıdına işaretleyiniz."]
        metinler.append("\n".join(kapak_satirlari + ([kapak_ek] if kapak_ek else [])))
    for i, sayfa in enumerate(sayfalar, len(metinler) + 1):
        u, a = [x.format(no=i) for x in ust], [x.format(no=i) for x in alt]
        metinler.append("\n".join([*u, "", *sayfa, "", *a]))
    anahtar = [anahtar_basligi, ""]
    for baslik, sorular in dersler:
        anahtar += [baslik, "", *(f"{s.no}. {'İPTAL' if s.cevap is None else 'ABCDE'[s.cevap]}" for s in sorular), ""]
    return [*metinler, "\n".join(anahtar)]


def _yanlis_tutulanlar(dersler, tutulan) -> list[str]:
    gercek = {(baslik[1:4], s.no): s for baslik, sorular in dersler for s in sorular}
    yanlis, gorulen = [], set()
    for t in tutulan:
        anahtar = (t.ek["ders_kodu"], t.ek["soru_no"])
        s = gercek.get(anahtar)
        if (
            s is None or anahtar in gorulen or s.elenmeli or t.cevap != s.cevap or t.secenekler != s.secenekler
            or t.soru.split() != " ".join(s.kok).split()
        ):
            yanlis.append(f"{anahtar}: {t.soru!r} {t.secenekler} cevap {t.cevap}")
        gorulen.add(anahtar)
    return yanlis


@pytest.mark.parametrize("aile", list(AILELER))
def test_sentetik_kitapcik_ailelerinde_yanlis_soru_tutulmaz(aile):  # F1–F8, F12, F15 bir arada
    tutulan = beklenen = 0
    for tohum in range(5):
        rng = random.Random(f"{aile}:{tohum}")
        dersler = _dersler_uret(rng)
        sayfalar = _kitapcik_uret(rng, dersler, **AILELER[aile](rng, dersler))
        sorular, rapor = meb_metin.metinden_ayristir(sayfalar, "k.pdf", yaz=lambda m: None)
        assert _yanlis_tutulanlar(dersler, sorular) == [], (aile, tohum)
        tutulan += len(sorular)
        beklenen += sum(not s.elenmeli for _, ss in dersler for s in ss)
    # Hepsini eleyerek "yanlış yok" denmesin: kusursuz kitapçık tam, kusurlular en az yarı yarıya tutulur.
    assert tutulan == beklenen if aile == "temiz" else tutulan >= beklenen / 2

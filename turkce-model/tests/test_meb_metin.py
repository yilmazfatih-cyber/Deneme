"""OCR metninden MEB sorusu (``moduller/meb_metin.py``): modül incelemesinin bulgularına karşı sınamalar.

Her sınamanın adında, parametre kimliğinde ya da yorumunda bulgu numarası geçer (F1 …, B1, G1 …; R1/R2: ikinci
incelemede bulunan kusurlar; M1 … M13: beşinci turun bulguları; "6. tur R1 … R7" yorumlu bölümler: altıncı turun
bulguları, aynı numaralı eski R1/R2'den ayrıdır; adında "tur7" geçen M1 … M4, O1, O2: yedinci turun bulguları, beşinci
turun M1 … M4'ünden ayrıdır). Bütün metinler sentetiktir; gerçek kitapçık ya da TDK/MEB içeriği kullanılmaz.
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


# ---- 6. tur R1: düzeysiz yinelenen ders başlığı sayfaya taşan içeriği yutmaz ---------------------------------------
# Düzeyi okunamamış başlık ("(111) TARİH - I", "(111) TARİH 1", "(111) TARİH") sonraki büyük harfli satırları sarılmış
# başlığın devamı sayıyordu; başlık sayfa başında yinelenip atılınca onlar da atılıyordu.

R1_KAPAK = "AÇIK ÖĞRETİM LİSESİ\n\n1. OTURUM\n\nAdayların dikkatine: süre 90 dakikadır."
R1_SORU1 = "1. Hangisi bir başkenttir?\n\nA) Ankara\nB) Deniz\nC) Hava\nD) Uzay"
R1_PARCA = "Ayşe bütün dönem düzenli çalıştı ve en yüksek notu aldı."
R1_YONERGE = "2 - 3. SORULARI AŞAĞIDAKİ METNE GÖRE CEVAPLAYINIZ."
R1_ONCULLU = ["Yalnız I", "I ve II", "II ve III", "I, II ve III"]
R1_GEZEGEN = ["Ay", "Mars", "Güneş", "Sirius"]
# İçerik türü → (1. sayfanın sonu, 2. sayfada yinelenen başlıktan sonraki satırlar, beklenen {no: (kök, seçenekler)}).
R1_TASAN = {
    "sayisal-secenekler": (
        "\n\n2. Bir sayının üç katı kaçtır?\n\nA) 30\nB) 31",
        "C) 32\nD) 33\n\n3. Hangisi bir gezegendir?\n\n" + "\n".join(f"{h}) {s}" for h, s in zip("ABCD", R1_GEZEGEN)),
        {2: ("Bir sayının üç katı kaçtır?", ["30", "31", "32", "33"]), 3: ("Hangisi bir gezegendir?", R1_GEZEGEN)},
    ),
    "onculler": (
        "\n\n2. Aşağıdakilerden hangileri bir il merkezidir?\nI. MANİSA",
        "II. AYDIN\nIII. KONYA\n\nHangileri doğrudur?\n\n" + "\n".join(f"{h}) {s}" for h, s in zip("ABCD", R1_ONCULLU)),
        {2: ("Aşağıdakilerden hangileri bir il merkezidir? I. MANİSA II. AYDIN III. KONYA Hangileri doğrudur?", R1_ONCULLU)},
    ),
    "yonerge-ve-parca": (
        "",
        f"{R1_YONERGE}\n\n{R1_PARCA}\n\n2. Bu metne göre Ayşe ne yaptı?\n\nA) Çalıştı\nB) Uyudu\nC) Gezdi\nD) Oynadı\n\n"
        "3. Bu metne göre Ayşe hangi notu aldı?\n\nA) Düşük\nB) En yüksek\nC) Orta\nD) Hiçbiri",
        {2: (f"{R1_YONERGE} {R1_PARCA} Bu metne göre Ayşe ne yaptı?", ["Çalıştı", "Uyudu", "Gezdi", "Oynadı"]),
         3: (f"{R1_YONERGE} {R1_PARCA} Bu metne göre Ayşe hangi notu aldı?", ["Düşük", "En yüksek", "Orta", "Hiçbiri"])},
    ),
}
R1_BASLIKLAR = {"roma-duzey": "(111) TARİH - I", "cizgisiz-duzey": "(111) TARİH 1", "duzeysiz": "(111) TARİH",
                "karsi-durum-duzeyli": "(111) TARİH - 1"}
R1_DERS_ADLARI = {"(111) TARİH - I": "Tarih - I", "(111) TARİH 1": "Tarih 1", "(111) TARİH": "Tarih",
                  "(111) TARİH - 1": "Tarih - 1"}


@pytest.mark.parametrize(
    ("baslik", "tur"),
    [pytest.param(b, t, id=f"R1-{t}-{ad}") for t in R1_TASAN for ad, b in R1_BASLIKLAR.items()],
)
def test_R1_duzeysiz_yinelenen_baslik_sayfaya_tasan_icerigi_yutmaz(baslik, tur):  # 6. tur R1
    # Sayısal seçenekler atılınca soru eleniyor; öncüller ya da yönerge ve parça atılınca sorular onlarsız tutuluyordu.
    son, tasan, beklenen = R1_TASAN[tur]
    sayfalar = [
        R1_KAPAK,
        f"1. OTURUM\n\n{baslik}\n\n{R1_SORU1}{son}\n\n2",
        f"1. OTURUM\n\n{baslik}\n\n{tasan}\n\n3",
        _anahtar((baslik, "A" + "B" * len(beklenen))),
    ]
    sorular, rapor, _ = _ayikla(sayfalar)
    beklenen = {1: ("Hangisi bir başkenttir?", ["Ankara", "Deniz", "Hava", "Uzay"]), **beklenen}
    assert {s.ek["soru_no"]: (" ".join(s.soru.split()), s.secenekler) for s in sorular.values()} == beklenen
    assert rapor["elenen"] == {} and [s.cevap for s in sorular.values()] == [0] + [1] * (len(beklenen) - 1)
    assert {s.ders for s in sorular.values()} == {R1_DERS_ADLARI[baslik]}


def _r1_uzun_kitapcik(ilk_baslik: list[str], yinelenen: list[str] | None = None, farkli: tuple[int, ...] = (1, 2)) -> list[str]:
    """Kapak + beş ders, her biri üç sayfa (sayfa başına iki soru, cevap "A"), ders başlığı her sayfanın başında + anahtar.
    17 sayfa: ilk dersin başlık devamı 4 sayfada görülür, kenar sayılmaz (eşik 5). ``yinelenen``: ilk dersin ``farkli``
    sayfalarında (0'dan sayılır; varsayılan 2. ve 3. sayfa) başlığın okunuşu (OCR farkı)."""
    dersler = [ilk_baslik] + [[f"({k}) {ad} - 1"] for k, ad in (("111", "TARİH"), ("222", "COĞRAFYA"), ("333", "FELSEFE"),
                                                                ("444", "KİMYA"))]
    sayfalar, anahtar = [R1_KAPAK], ["CEVAP ANAHTARI", ""]
    for d, baslik in enumerate(dersler):
        no = 1
        for p in range(3):
            g = ["1. OTURUM", "", *(yinelenen if d == 0 and p in farkli and yinelenen else baslik), ""]
            for _ in range(2):
                kok, secenekler = KONULAR[no % 4]
                g += [f"{no}. {kok}", "", *(f"{h}) {s}" for h, s in zip("ABCD", secenekler)), ""]
                no += 1
            sayfalar.append("\n".join(g + [str(len(sayfalar) + 1)]))
        anahtar += [*baslik, "", *(f"{n}. A" for n in range(1, no)), ""]
    return sayfalar + ["\n".join(anahtar)]


@pytest.mark.parametrize(
    ("basliklar", "yinelenen", "ad"),
    [
        pytest.param(["(532) SEÇMELİ", "PEYGAMBERİMİZİN HAYATI"], None, "Seçmeli Peygamberimizin Hayatı",
                     id="R1-duzeysiz-sarilmis"),
        pytest.param(["(532) SEÇMELİ", "PEYGAMBERİMİZİN HAYATI - 2"], None, "Seçmeli Peygamberimizin Hayatı - 2",
                     id="R1-duzeyli-sarilmis"),
        # Devam satırı sonraki sayfalarda I/İ ve boşluk farkıyla okunmuş: yine başlığın devamıdır.
        pytest.param(["(532) SEÇMELİ", "PEYGAMBERİMİZİN HAYATI"], ["(532) SEÇMELİ", "PEYGAMBERIMIZIN  HAYATI."],
                     "Seçmeli Peygamberimizin Hayatı", id="R1-devami-farkli-okunmus"),
    ],
)
def test_R1_karsi_durum_yinelenen_sarilmis_basligin_devami_secenege_karismaz(basliklar, yinelenen, ad):  # 6. tur R1, M1
    # Düzeysiz sarılmış başlık da desteklenir: devamı dersin başındaki başlıkta da okunduğu için atılır. Yalnız düzeye
    # ulaşan başlığın devamını atan kuralla "Kum PEYGAMBERİMİZİN HAYATI" gibi seçenekler tutuluyordu.
    sorular, rapor, _ = _ayikla(_r1_uzun_kitapcik(basliklar, yinelenen))
    assert rapor["tutulan"] == 30 and _secenekleri_temiz(sorular)
    assert {s.ders for k, s in sorular.items() if k.startswith("532:")} == {ad}


@pytest.mark.parametrize("baslik", [pytest.param(b, id=f"R1-ilk-baslik-{ad}") for ad, b in R1_BASLIKLAR.items()])
def test_R1_ilk_ders_basligi_buyuk_harfli_yonergeyi_yutmaz(baslik):  # 6. tur R1 (meb._ders_basligi)
    # Düzeysiz başlık dersin ilk sayfasında da yönergeyi kendine katıyordu: ders adı "Tarih 1 - 2. Soruları …" oluyor,
    # 1. ve 2. sorular parçasız tutuluyordu.
    yonerge = "1 - 2. SORULARI AŞAĞIDAKİ METNE GÖRE CEVAPLAYINIZ."
    sayfa = "\n\n".join([
        "1. OTURUM", baslik, yonerge, R1_PARCA,
        "1. Bu metne göre Ayşe ne yaptı?", "A) Çalıştı\nB) Uyudu\nC) Gezdi\nD) Oynadı",
        "2. Bu metne göre Ayşe hangi notu aldı?", "A) Düşük\nB) En yüksek\nC) Orta\nD) Hiçbiri",
    ])
    sorular, rapor, _ = _ayikla([R1_KAPAK, sayfa, _anahtar((baslik, "AB"))])
    assert rapor["tutulan"] == 2 and {s.ders for s in sorular.values()} == {R1_DERS_ADLARI[baslik]}
    assert [sorular[f"111:{n}"].soru.split("\n")[0] for n in (1, 2)] == [f"{yonerge} {R1_PARCA}"] * 2


# ---- 6. tur R2, R3: kapanış satırı ------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("son", "sayfa_sayisi"),
    [
        pytest.param(son, n, id=f"R2-{ad}-{n}-sayfa")
        for ad, son in (
            ("virgul", "Sınav bitti, başarılar dileriz."), ("noktali-virgul", "SINAV BİTTİ; BAŞARILAR DİLERİZ."),
            ("iki-nokta", "Test bitti: başarılar!"), ("cizgi", "Sınav bitti - başarılar."),
            ("uzun-cizgi", "Test bitti — iyi şanslar."), ("uc-nokta", "Sınav bitti… Başarılar dileriz."),
            ("testimiz", "TESTİMİZ BİTMİŞTİR."), ("sinavimiz", "Sınavımız sona ermiştir."),
            ("sinav-suresi", "SINAV SÜRESİ BİTMİŞTİR."), ("test-suresi-noktasiz-i", "TEST SURESI BITTI."),
            ("numarali-oturum", "1. OTURUM BİTTİ."), ("numarali-oturum-kucuk", "2. Oturum sona erdi."),
        )
        for n in (1, 3)
    ],
)
def test_R2_baglacli_ve_yeni_kapanis_bicimleri_son_secenege_eklenmez(son, sayfa_sayisi):  # 6. tur R2
    # Kitapçığın sonunda bir kez: "Dört Sınav bitti, başarılar dileriz." / "Dört 1. OTURUM BİTTİ." gibi yapışıyordu.
    sayfalar = [
        "\n\n".join([("(111) TARİH - 1" if p == 0 else "1. OTURUM"), _soru(2 * p + 1), _soru(2 * p + 2)])
        for p in range(sayfa_sayisi)
    ]
    sayfalar[-1] += "\n\n" + son
    sorular, rapor, _ = _ayikla(sayfalar + [_anahtar(("(111) TARİH - 1", "AB" * sayfa_sayisi))])
    assert rapor["tutulan"] == 2 * sayfa_sayisi and {tuple(s.secenekler) for s in sorular.values()} == {("Bir", "İki", "Üç", "Dört")}


@pytest.mark.parametrize(
    "bicim",
    [
        pytest.param("\n", id="bitisik"),
        pytest.param("\n\n", id="bos-satirli"),  # kapanış cümlesi paragraf başında: yalnız "kök bitmedi" korur
        pytest.param(None, id="bos-satirsiz-metin"),  # kitapçıkta hiç boş satır yok: her satır paragraf başı
    ],
)
@pytest.mark.parametrize(
    "satir",
    [pytest.param(s, id=f"R3-{ad}") for ad, s in (("sinav-bitti", "Sınav bitti."), ("basarilar", "Başarılar dileriz."),
                                                   ("iyi-sanslar", "İyi şanslar!"), ("test-bitti", "Test bitti!"),
                                                   ("virgullu", "Sınav bitti, başarılar dileriz."))],
)
def test_R3_kokteki_tam_satir_kapanis_cumlesi_soruyu_kapatmaz(satir, bicim):  # 6. tur R3
    # Kökteki konuşma satırı soruyu kapatıyordu: soru seçeneksiz kalıp eleniyordu.
    kok = ["Öğretmen sınavın sonunda öğrencilere şöyle dedi:", satir, "Bu cümlede hangi duygu vardır?"]
    sayfa = "(111) TÜRK DİLİ VE EDEBİYATI - 1\n\n" + _soru(1) + "\n\n"
    sayfa += _soru(2, (bicim or "\n").join(kok), ["Sevinç", "Korku", "Öfke", "Şaşkınlık"]) + "\n\n" + _soru(3)
    sayfalar = [sayfa, _anahtar(("(111) TÜRK DİLİ VE EDEBİYATI - 1", "ABC"))]
    if bicim is None:
        sayfalar = [s.replace("\n\n", "\n") for s in sayfalar]
    sorular, rapor, _ = _ayikla(sayfalar)
    assert rapor["tutulan"] == 3 and " ".join(sorular["111:2"].soru.split()) == " ".join(kok)
    assert sorular["111:2"].secenekler == ["Sevinç", "Korku", "Öfke", "Şaşkınlık"]


@pytest.mark.parametrize(
    "devam",
    [pytest.param(d, id=f"R3-secenek-devami-{ad}") for ad, d in (("basarilar", "başarılar"), ("noktali", "başarılar."),
                                                                  ("buyuk-harfle", "Başarılar"), ("iyi-sanslar", "iyi şanslar"))],
)
def test_R3_secenegin_kapanis_sozuyle_suren_satiri_secenekte_kalir(devam):  # 6. tur R3
    # Seçeneğin sarılmış son satırı ("büyük" + "başarılar") kapanış sanılıyor, seçenek yarım tutuluyordu.
    s2 = _soru(2, "Bu zaferin sonucu hangisidir?", ["Moral bozuldu", "Savaş uzadı", "Halk küstü", "Ordunun ardından gelen büyük"])
    sayfa = "(111) TARİH - 1\n\n" + _soru(1) + "\n\n" + s2 + "\n" + devam + "\n\n" + _soru(3)
    sorular, _, _ = _ayikla([sayfa, _anahtar(("(111) TARİH - 1", "ADA"))])
    assert sorular["111:2"].secenekler[3] == f"Ordunun ardından gelen büyük {devam}"
    assert sorular["111:3"].secenekler == ["Bir", "İki", "Üç", "Dört"]


R3_SAYFA = "(111) TARİH - 1\n\n" + _soru(1) + "\n\n" + _soru(2)
R3_ANAHTAR = _anahtar(("(111) TARİH - 1", "AB"))


@pytest.mark.parametrize(
    "sayfalar",
    [
        # Boş satırsız metinde (anahtar sayfası dahil) her satır paragraf başıdır.
        pytest.param([(R3_SAYFA + "\nBaşarılar dileriz.").replace("\n\n", "\n"), R3_ANAHTAR.replace("\n\n", "\n")],
                     id="R3-karsi-durum-bos-satirsiz-metin"),
        # Büyük harfli kapanış boş satır beklemez.
        pytest.param([R3_SAYFA + "\nTESTİMİZ BİTMİŞTİR.", R3_ANAHTAR], id="R3-karsi-durum-buyuk-harf-bosluksuz"),
    ],
)
def test_R3_karsi_durum_secenekten_sonraki_kapanis_soruyu_kapatir(sayfalar):  # 6. tur R3
    sorular, rapor, _ = _ayikla(sayfalar)
    assert rapor["tutulan"] == 2 and {tuple(s.secenekler) for s in sorular.values()} == {("Bir", "İki", "Üç", "Dört")}


# ---- 6. tur R7: fotoğrafta önceki seçeneklerden sonra numarasız kök ve numaralı öncüller --------------------------

R7_SECENEKLER = "A) Yalnız 1\nB) Yalnız 2\nC) 1 ve 2\nD) Hiçbiri"


@pytest.mark.parametrize(
    ("metin", "kok"),
    [
        pytest.param(
            "D) Uzay\nAşağıdakilerden hangileri doğrudur?\n1) Ankara başkenttir.\n2) İzmir bir ilçedir.\n" + R7_SECENEKLER,
            "Aşağıdakilerden hangileri doğrudur? 1) Ankara başkenttir. 2) İzmir bir ilçedir.", id="R7-parantezli-onculler",
        ),
        pytest.param(
            "C) Hava\nD) Uzay\n\nHangileri doğrudur?\n\n1. Ankara başkenttir.\n2. İzmir bir ilçedir.\n3. Bursa bir ildir.\n\n"
            + R7_SECENEKLER,
            "Hangileri doğrudur? 1. Ankara başkenttir. 2. İzmir bir ilçedir. 3. Bursa bir ildir.", id="R7-noktali-onculler",
        ),
    ],
)
def test_R7_onceki_seceneklerden_sonraki_numarasiz_kok_atilmaz(metin, kok):  # 6. tur R7
    # İlk öncül ("1) …") soru numarası sanılıyor, kök cümlesi atılıyordu: "Ankara başkenttir. 2) İzmir bir ilçedir."
    s = meb_metin.tek_soru(metin)
    assert (s.soru, s.secenekler) == (kok, ["Yalnız 1", "Yalnız 2", "1 ve 2", "Hiçbiri"])


@pytest.mark.parametrize(
    ("metin", "kok"),
    [
        # Numaradan sonra seçenekler geliyor: "1)" soru numarasıdır, "2)" ikinci soru (alınmaz).
        pytest.param("D) Selim\n\n1) Hangisi bir başkenttir?\n\nA) Ankara\nB) İzmir\n\n2) Hangisi bir gezegendir?\n\nA) Ay",
                     "Hangisi bir başkenttir?", id="R7-karsi-durum-iki-soru"),
        # Öncüller numaralı kökün içinde ("7)" + "1)"): soru numarası atılır, öncüller kalır.
        pytest.param("D) Uzay\n7) Aşağıdakilerden hangileri doğrudur?\n1) Ankara başkenttir.\n2) İzmir bir ilçedir.\n"
                     + R7_SECENEKLER, "Aşağıdakilerden hangileri doğrudur? 1) Ankara başkenttir. 2) İzmir bir ilçedir.",
                     id="R7-karsi-durum-numarali-kok"),
    ],
)
def test_R7_karsi_durum_soru_numarasi_yine_atilir(metin, kok):  # 6. tur R7, M10
    assert meb_metin.tek_soru(metin).soru == kok


# ---- 7. tur M1, O2, M4: yinelenen ders başlığı ve düzeyi ----------------------------------------------------------
# M1: yinelenen başlığın devam satırı yalnız dersin ilk başlığındakiyle harfi harfine aynıysa atılıyordu. OCR'ın harf farkı
# ("- 7", "HAYAT", "HAYAT1"), başka satır bölmesi ya da yalnız sonraki sayfalarda başlığın altına basılmış üst bilgi ("A
# KİTAPÇIĞI") önceki sayfanın son seçeneğine yapışıyordu ("Kum PEYGAMBERİMİZİN HAYATI - 7"). O2: bir sayfada sarılı,
# ötekinde tek satırda okunan başlık yeni ders sanılıyor, dersin 6 sorusundan 4'ü kayboluyordu. M4: Roma rakamlı düzey ("-
# II") başlık harfine çevrilip "Iı" oluyordu.

T7_SECMELI = ["(532) SEÇMELİ", "PEYGAMBERİMİZİN HAYATI - 2"]
T7_SECMELI_DUZEYSIZ = ["(532) SEÇMELİ", "PEYGAMBERİMİZİN HAYATI"]
T7_AD = "Seçmeli Peygamberimizin Hayatı - 2"
T7_AD_DUZEYSIZ = "Seçmeli Peygamberimizin Hayatı"


# id → (ilk sayfadaki başlık, sonraki sayfalardaki okunuşu, ders adı, okunuşun yinelenebileceği sayfa sayıları)
T7_OKUNUSLAR = {
    # OCR farkı: tek sayfadaki fark başlığın altında yinelenmez, yalnız adın okunuşuna bakılarak atılır.
    "M1-duzey-baska-okunmus": (T7_SECMELI, ["(532) SEÇMELİ", "PEYGAMBERİMİZİN HAYATI - 7"], T7_AD, (1, 2)),
    "M1-harf-eksik": (T7_SECMELI, ["(532) SEÇMELİ", "PEYGAMBERİMİZİN HAYAT - 2"], T7_AD, (1, 2)),
    "M1-harf-rakam-okunmus": (T7_SECMELI, ["(532) SEÇMELİ", "PEYGAMBERİMİZİN HAYAT1 - 2"], T7_AD, (1, 2)),
    "M1-iki-yerde-fark": (T7_SECMELI, ["(532) SEÇMELİ", "PEYGAMBERLİMİZİN HAYATI - II"], T7_AD, (1, 2)),
    "M1-duzeysiz-harf-eksik": (T7_SECMELI_DUZEYSIZ, ["(532) SEÇMELİ", "PEYGAMBERİMİZİN HAYAT"], T7_AD_DUZEYSIZ, (1, 2)),
    # Satır bölmesi farklı: üç satır / iki satır.
    "M1-uc-satir-sonra-iki-satir": (["(532) SEÇMELİ", "PEYGAMBERİMİZİN", "HAYATI - 2"], T7_SECMELI, T7_AD, (1, 2)),
    "M1-iki-satir-sonra-uc-satir": (T7_SECMELI, ["(532) SEÇMELİ", "PEYGAMBERİMİZİN", "HAYATI - 2"], T7_AD, (1, 2)),
    # Üst bilgi yalnız sonraki sayfalarda, düzeysiz başlığın altında: başlığın devamı sanılıyordu. Birden çok sayfada
    # yinelendiği için ayrılır (sayfaya taşan içerik yinelenmez).
    "M1-ust-bilgi-sonraki-sayfalarda": (T7_SECMELI_DUZEYSIZ, [*T7_SECMELI_DUZEYSIZ, "A KİTAPÇIĞI"], T7_AD_DUZEYSIZ, (2,)),
    "M1-ust-bilgi-tek-satirli-baslik": (["(532) SEÇMELİ"], ["(532) SEÇMELİ", "A KİTAPÇIĞI"], "Seçmeli", (2,)),
    # O2: sarılı başlık öteki sayfalarda tek satırda okunmuş (ya da tersi).
    "O2-sarili-sonra-tek-satir": (T7_SECMELI, [" ".join(T7_SECMELI)], T7_AD, (1, 2)),
    "O2-tek-satir-sonra-sarili": ([" ".join(T7_SECMELI)], T7_SECMELI, T7_AD, (1, 2)),
    "O2-duzeysiz": (T7_SECMELI_DUZEYSIZ, [" ".join(T7_SECMELI_DUZEYSIZ)], T7_AD_DUZEYSIZ, (1, 2)),
}


@pytest.mark.parametrize(
    ("ilk", "sonraki", "ad", "farkli"),
    [
        pytest.param(ilk, sonraki, ad, (2,) if n == 1 else (1, 2), id=f"{kimlik}-{n}-sayfada")
        for kimlik, (ilk, sonraki, ad, sayilar) in T7_OKUNUSLAR.items()
        for n in (1, 2)
        if n in sayilar
    ],
)
def test_M1_tur7_yinelenen_basligin_farkli_okunan_devami_secenege_karismaz(ilk, sonraki, ad, farkli):  # 7. tur M1, O2
    sorular, rapor, mesajlar = _ayikla(_r1_uzun_kitapcik(ilk, sonraki, farkli))
    assert rapor["tutulan"] == 30 and _secenekleri_temiz(sorular)
    assert {s.ders for k, s in sorular.items() if k.startswith("532:")} == {ad}
    assert rapor["farkli_sayili_dersler"] == {} and not any("Uyarı" in m for m in mesajlar)


# Sayfaya taşan içerik türü → (1. sayfanın sonu, 2. sayfada yinelenen başlıktan sonraki satırlar, beklenen {no: (kök,
# seçenekler)}); "{ad}" başlığın son satırındaki addır (başlığa benzeyen içerik). Sayısal seçenek, öncüller, yönerge ve
# parça 6. tur R1'deki gibi.
T7_GEZEGEN = "\n\n3. Hangisi bir gezegendir?\n\n" + "\n".join(f"{h}) {s}" for h, s in zip("ABCD", R1_GEZEGEN))
T7_TASAN = {
    **R1_TASAN,
    "buyuk-harfli-tek-kelime-secenek": (
        "\n\n2. Hangisi bir sıvıdır?\n\nA) KUM\nB) TAŞ", "C) SU\nD) HAVA" + T7_GEZEGEN,
        {2: ("Hangisi bir sıvıdır?", ["KUM", "TAŞ", "SU", "HAVA"]), 3: ("Hangisi bir gezegendir?", R1_GEZEGEN)},
    ),
    "sayi-araligi-ve-roma-secenek": (
        "\n\n2. Hangisi bir yaş aralığıdır?\n\nA) 1 - 3\nB) 4 - 6", "C) 10 - 12\nD) I VE II" + T7_GEZEGEN,
        {2: ("Hangisi bir yaş aralığıdır?", ["1 - 3", "4 - 6", "10 - 12", "I VE II"]), 3: ("Hangisi bir gezegendir?", R1_GEZEGEN)},
    ),
    "kisa-buyuk-harfli-secenek-devami": (
        "\n\n2. Hangisi bir yer şeklidir?\n\nA) Ova\nB) Dağ\nC) Vadi\nD) KIZIL", "KUM" + T7_GEZEGEN,
        {2: ("Hangisi bir yer şeklidir?", ["Ova", "Dağ", "Vadi", "KIZIL KUM"]), 3: ("Hangisi bir gezegendir?", R1_GEZEGEN)},
    ),
    "basliga-benzeyen-secenek-devami": (
        "\n\n2. Hangisi bir ders adıdır?\n\nA) Resim\nB) Müzik\nC) Spor\nD) DERS:", "{ad}" + T7_GEZEGEN,
        {2: ("Hangisi bir ders adıdır?", ["Resim", "Müzik", "Spor", "DERS: {ad}"]), 3: ("Hangisi bir gezegendir?", R1_GEZEGEN)},
    ),
}
# Düzeysiz başlık (tek satır, sarılı, uzun sarılı): sonraki büyük harfli satırlar devamına katılır; düzeyli başlık karşı durum.
T7_BASLIKLAR = {
    "duzeysiz": ("(111) TARİH", "Tarih"),
    "sarili-duzeysiz": ("(111) SEÇMELİ\nTARİH KONULARI", "Seçmeli Tarih Konuları"),
    "uzun-sarili-duzeysiz": ("(111) SEÇMELİ PEYGAMBERİMİZİN\nHAYATI VE ÖĞRETİLERİ", "Seçmeli Peygamberimizin Hayatı ve Öğretileri"),
    "duzeyli": ("(111) TARİH - 1", "Tarih - 1"),
}


@pytest.mark.parametrize(("bicim", "tur"), [pytest.param(b, t, id=f"M1-karsi-durum-{t}-{b}") for t in T7_TASAN for b in T7_BASLIKLAR])
def test_M1_tur7_karsi_durum_yinelenen_basliktan_sonra_tasan_icerik_kalir(bicim, tur):  # 7. tur M1
    # OCR farkını bağışlayan kural sayfaya taşan içeriği başlığa katmamalı: atılan seçenek soruyu eletir, atılan öncül,
    # yönerge ya da seçenek devamı soruyu eksik tutar.
    baslik, ders = T7_BASLIKLAR[bicim]
    ad = baslik.split("\n")[-1].split(") ")[-1]
    son, tasan, beklenen = T7_TASAN[tur]
    sayfalar = [
        R1_KAPAK,
        f"1. OTURUM\n\n{baslik}\n\n{R1_SORU1}{son}\n\n2",
        f"1. OTURUM\n\n{baslik}\n\n{tasan.format(ad=ad)}\n\n3",
        _anahtar((baslik, "A" + "B" * len(beklenen))),
    ]
    sorular, rapor, _ = _ayikla(sayfalar)
    beklenen = {no: (kok, [s.format(ad=ad) for s in secenekler]) for no, (kok, secenekler) in beklenen.items()}
    beklenen = {1: ("Hangisi bir başkenttir?", ["Ankara", "Deniz", "Hava", "Uzay"]), **beklenen}
    assert {s.ek["soru_no"]: (" ".join(s.soru.split()), s.secenekler) for s in sorular.values()} == beklenen
    assert rapor["elenen"] == {} and {s.ders for s in sorular.values()} == {ders}


@pytest.mark.parametrize("bicim", [pytest.param(b, id=f"M1-{b}") for b in T7_BASLIKLAR])
def test_M1_tur7_baslik_altindaki_ust_bilgi_atilir_tasan_secenek_kalir(bicim):  # 7. tur M1
    # Üst bilgi yalnız sonraki sayfalarda başlığın altında; sayfanın son sorusunun son iki seçeneği sonraki sayfaya taşıyor.
    # Üst bilgi seçeneğe yapışıyordu ("21 A KİTAPÇIĞI"); birden çok sayfada yinelendiği için atılır, her sayfada başka olan
    # taşan seçenekler kalır.
    baslik, ders = T7_BASLIKLAR[bicim]

    def sayi_sorusu(no: int, tam: bool = False) -> str:
        return f"{no}. Bir sayının {no} katı kaçtır?\n\nA) {10 * no}\nB) {10 * no + 1}" + ("\n" + kalan(no) if tam else "")

    def kalan(no: int) -> str:
        return f"C) {10 * no + 2}\nD) {10 * no + 3}"

    sayfalar = [
        R1_KAPAK,
        f"1. OTURUM\n\n{baslik}\n\n{R1_SORU1}\n\n{sayi_sorusu(2)}\n\n2",
        f"1. OTURUM\n\n{baslik}\nA KİTAPÇIĞI\n\n{kalan(2)}\n\n{_soru(3)}\n\n{sayi_sorusu(4)}\n\n3",
        f"1. OTURUM\n\n{baslik}\nA KİTAPÇIĞI\n\n{kalan(4)}\n\n{_soru(5)}\n\n{sayi_sorusu(6, tam=True)}\n\n4",
        _anahtar((baslik, "ABABAB")),
    ]
    sorular, rapor, _ = _ayikla(sayfalar)
    assert rapor["tutulan"] == 6 and rapor["elenen"] == {} and {s.ders for s in sorular.values()} == {ders}
    assert {no: sorular[f"111:{no}"].secenekler for no in (2, 4, 6)} == {no: [str(10 * no + j) for j in range(4)] for no in (2, 4, 6)}
    assert [sorular[f"111:{no}"].secenekler for no in (1, 3, 5)] == [["Ankara", "Deniz", "Hava", "Uzay"]] + [["Bir", "İki", "Üç", "Dört"]] * 2


@pytest.mark.parametrize(
    ("ilk", "sonraki", "ad"),
    [
        pytest.param(["(532) SEÇMELİ", "PEYGAMBERİMİZİN HAYATI - II"], None, "Seçmeli Peygamberimizin Hayatı - II",
                     id="M4-sarili-roma-duzey"),
        pytest.param(["(532) SEÇMELİ", "PEYGAMBERİMİZİN HAYATI - İİ"], None, "Seçmeli Peygamberimizin Hayatı - II",
                     id="M4-ocr-noktali-i"),
        pytest.param(["(532) SEÇMELİ FELSEFE - III"], None, "Seçmeli Felsefe - III", id="M4-tek-satir-III"),
        # Ayrı satıra sarılmış düzey ("- 3") de başlığındır; yinelenen başlıkta başka okunmuşu ("- 8", "- E") atılır.
        pytest.param(["(532) TÜRK DİLİ VE", "EDEBİYATI", "- 3"], None, "Türk Dili ve Edebiyatı - 3", id="M4-ayri-satirda-duzey"),
        pytest.param(["(532) TÜRK DİLİ VE", "EDEBİYATI", "- 3"], ["(532) TÜRK DİLİ VE", "EDEBİYATI", "- 8"],
                     "Türk Dili ve Edebiyatı - 3", id="M4-M1-ayri-satirdaki-duzey-baska-okunmus"),
        pytest.param(["(532) TÜRK DİLİ VE", "EDEBİYATI", "- 3"], ["(532) TÜRK DİLİ VE", "EDEBİYATI", "- E"],
                     "Türk Dili ve Edebiyatı - 3", id="M4-M1-ayri-satirdaki-duzey-harf-okunmus"),
    ],
)
def test_M4_tur7_roma_rakamli_ve_ayri_satirdaki_duzey(ilk, sonraki, ad):  # 7. tur M4 (M1 ile birlikte)
    sorular, rapor, _ = _ayikla(_r1_uzun_kitapcik(ilk, sonraki))
    assert rapor["tutulan"] == 30 and _secenekleri_temiz(sorular)
    assert {s.ders for k, s in sorular.items() if k.startswith("532:")} == {ad}


# ---- 7. tur M2: son seçeneğin hemen altındaki küçük harfli kapanış ---------------------------------------------------
# 6. tur R3'ten beri boş satırlı kitapçıkta küçük harfli kapanış yalnız boş satırdan sonra tanınıyordu: son seçeneğin hemen
# altındaki "Test bitti." seçeneğe yapışıyor ("Dört Test bitti."), uzun kapanış soruyu "bozuk düzen" diye eletiyordu. Sayfa
# aşan seçenek devamı ("… büyük" + sonraki sayfanın başında "başarılar") ise kapanış sanılıp seçenek yarım kalıyordu.

T7_COGRAFYA = "1. OTURUM\n\n(222) COĞRAFYA - 1\n\n" + _soru(1, "Hangisi bir ırmaktır?", ["Fırat", "Uludağ", "Van", "Ege"])
T7_ANAHTAR = _anahtar(("(111) TARİH - 1", "AB"), ("(222) COĞRAFYA - 1", "A"))


@pytest.mark.parametrize("yer", ["ders-sonu", "kitapcik-sonu"])
@pytest.mark.parametrize(
    "kapanis",
    [pytest.param(k, id=f"M2-{ad}") for ad, k in (("test-bitti", "Test bitti."), ("basarilar", "Başarılar dileriz."),
                                                  ("uzun", "Sınav bitti. Cevaplarınızı kontrol ediniz."))],
)
def test_M2_tur7_son_secenegin_hemen_altindaki_kapanis_secenege_yapismaz(kapanis, yer):  # 7. tur M2
    tarih = "1. OTURUM\n\n(111) TARİH - 1\n\n" + _soru(1) + "\n\n" + _soru(2)
    cografya = T7_COGRAFYA
    if yer == "ders-sonu":
        tarih += "\n" + kapanis
    else:
        cografya += "\n" + kapanis
    sorular, rapor, _ = _ayikla([tarih + "\n\n2", cografya + "\n\n3", T7_ANAHTAR])
    assert rapor["tutulan"] == 3 and rapor["elenen"] == {}
    assert [s.secenekler for s in sorular.values()] == [["Bir", "İki", "Üç", "Dört"]] * 2 + [["Fırat", "Uludağ", "Van", "Ege"]]


def test_M1_M2_tur7_karsi_durum_ayni_kodlu_yeni_ders_yinelenen_baslik_sayilmaz():  # 7. tur M1, M2
    # Kodu aynı, adı yakın ("TARİH - 1" / "TARİH - 2") ama soruları 1'den başlayan ders yeni derstir: yinelenen başlık
    # sayılıp öncekine katılmaz. Önceki dersin son seçeneğinin hemen altındaki kapanış da seçeneğe yapışmaz.
    sayfalar = [
        "1. OTURUM\n\n(111) TARİH - 1\n\n" + _soru(1) + "\n\n" + _soru(2) + "\nTest bitti.\n\n2",
        "1. OTURUM\n\n(111) TARİH - 2\n\n" + _soru(1, "Hangisi bir ırmaktır?", ["Fırat", "Uludağ", "Van", "Ege"]) + "\n\n3",
        _anahtar(("(111) TARİH - 1", "AB"), ("(111) TARİH - 2", "A")),
    ]
    sorular, rapor = meb_metin.metinden_ayristir(sayfalar, "k.pdf", yaz=lambda _: None)  # iki dersin "111:1"i var
    assert rapor["tutulan"] == 3 and rapor["elenen"] == {}
    assert [(s.ders, s.secenekler) for s in sorular] == [("Tarih - 1", ["Bir", "İki", "Üç", "Dört"])] * 2 + [
        ("Tarih - 2", ["Fırat", "Uludağ", "Van", "Ege"])
    ]


T7_UZUN = _soru(2, "Bu zaferin sonucu hangisidir?", ["Moral bozuldu", "Savaş uzadı", "Halk küstü", "Ordunun ardından gelen büyük"])
T7_TARIH = "1. OTURUM\n\n(111) TARİH - 1\n\n"


@pytest.mark.parametrize("devam", [pytest.param("başarılar", id="basarilar"), pytest.param("iyi şanslar", id="iyi-sanslar")])
@pytest.mark.parametrize(
    "kur",
    [
        # Aynı sayfada; dersin sonraki sorusu öbür sayfada, sayfa başında yinelenen ders başlığından sonra.
        pytest.param(lambda d: [T7_TARIH + _soru(1) + "\n\n" + T7_UZUN + "\n" + d + "\n\n2", T7_TARIH + _soru(3) + "\n\n3"],
                     id="M2-karsi-durum-ayni-sayfa-sonraki-soru-obur-sayfada"),
        # Sayfa aşan devam: sonraki sayfanın başında (yinelenen ders başlığından sonra da).
        pytest.param(lambda d: [T7_TARIH + _soru(1) + "\n\n" + T7_UZUN + "\n\n2", "1. OTURUM\n\n" + d + "\n\n" + _soru(3) + "\n\n3"],
                     id="M2-karsi-durum-sayfa-asan-devam"),
        pytest.param(lambda d: [T7_TARIH + _soru(1) + "\n\n" + T7_UZUN + "\n\n2", T7_TARIH + d + "\n\n" + _soru(3) + "\n\n3"],
                     id="M2-karsi-durum-sayfa-asan-devam-baslikli"),
        # Boş satırsız metin: her satır paragraf başıdır, ileriye bakılarak ayrılır.
        pytest.param(lambda d: [(T7_TARIH + _soru(1) + "\n" + T7_UZUN + "\n" + d + "\n" + _soru(3)).replace("\n\n", "\n")],
                     id="M2-karsi-durum-bos-satirsiz-metin"),
    ],
)
def test_M2_tur7_karsi_durum_secenegin_kapanis_sozuyle_suren_satiri_secenekte_kalir(kur, devam):  # 7. tur M2
    sayfalar = kur(devam)
    anahtar = _anahtar(("(111) TARİH - 1", "ADA"))
    sorular, _, _ = _ayikla(sayfalar + [anahtar if "\n\n" in sayfalar[0] else anahtar.replace("\n\n", "\n")])
    assert sorular["111:2"].secenekler[3] == f"Ordunun ardından gelen büyük {devam}"
    assert sorular["111:3"].secenekler == ["Bir", "İki", "Üç", "Dört"]


# ---- 7. tur M3: fotoğrafta önceki seçeneklerle numaralı soru arasındaki başlık ya da sayfa numarası -------------------
# 6. tur R7'den beri soru önceki seçeneklerin hemen ardından başlıyordu: aradaki sayfa numarası ya da büyük harfli başlık
# köke giriyor, soru numarası atılmıyordu ("12 18. Aşağıdakilerden hangisi 19. yüzyılda kurulmuştur?").

T7_DORT = "A) Bir\nB) İki\nC) Üç\nD) Dört"
T7_ONCULLU_KOK = "Aşağıdakilerden hangileri doğrudur? 1) Ankara başkenttir. 2) İzmir bir ilçedir."
T7_ONCULLER = "\n1) Ankara başkenttir.\n2) İzmir bir ilçedir.\n" + R7_SECENEKLER


@pytest.mark.parametrize(
    ("metin", "kok"),
    [
        pytest.param("D) Uzay\n12\nAşağıdakilerden hangileri doğrudur?" + T7_ONCULLER, T7_ONCULLU_KOK, id="M3-sayfa-numarasi-arada"),
        pytest.param("D) Uzay\nTARİH - 1\nAşağıdakilerden hangileri doğrudur?" + T7_ONCULLER, T7_ONCULLU_KOK, id="M3-baslik-arada"),
        pytest.param("D) Uzay\n12\n18. Aşağıdakilerden hangisi\n19. yüzyılda kurulmuştur?\n" + T7_DORT,
                     "Aşağıdakilerden hangisi 19. yüzyılda kurulmuştur?", id="M3-sayfa-numarasi-ve-sayiyla-suren-kok"),
        pytest.param("D) Uzay\nTARİH - 1\n18. Aşağıdakilerden hangisi\n19. yüzyılda kurulmuştur?\n" + T7_DORT,
                     "Aşağıdakilerden hangisi 19. yüzyılda kurulmuştur?", id="M3-baslik-ve-sayiyla-suren-kok"),
        pytest.param("D) Uzay\nAÇIK ÖĞRETİM LİSESİ\n1) Aşağıdakilerden hangisi\n2) Dünya Savaşı'ndan sonra olmuştur?\n" + T7_DORT,
                     "Aşağıdakilerden hangisi 2) Dünya Savaşı'ndan sonra olmuştur?", id="M3-baslik-ve-parantezli-sayiyla-suren-kok"),
        # Karşı durum: büyük harfli soru cümlesi ("…?") başlık değildir, kökte kalır.
        pytest.param("D) Uzay\nHANGİLERİ DOĞRUDUR?" + T7_ONCULLER,
                     "HANGİLERİ DOĞRUDUR? 1) Ankara başkenttir. 2) İzmir bir ilçedir.", id="M3-karsi-durum-buyuk-harfli-soru-cumlesi"),
    ],
)
def test_M3_tur7_seceneklerle_soru_arasindaki_baslik_ve_sayfa_numarasi_koke_girmez(metin, kok):  # 7. tur M3
    s = meb_metin.tek_soru(metin)
    beklenen = ["Bir", "İki", "Üç", "Dört"] if T7_DORT in metin else ["Yalnız 1", "Yalnız 2", "1 ve 2", "Hiçbiri"]
    assert (s.soru, s.secenekler) == (kok, beklenen)


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

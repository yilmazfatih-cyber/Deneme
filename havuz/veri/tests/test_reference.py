"""Başvuru verisi değişmezleri: 81 il, 973 ilçe, alfabe kümeleri, takvim, para birimleri."""

from __future__ import annotations

import calendar
from datetime import date

import pytest

from verihavuzu import calendar_tr, geo, reference
from verihavuzu.text import lower_tr, sort_key_tr, upper_tr

# --- iller ----------------------------------------------------------------------------------


def test_provinces_are_81_with_unique_plates_and_names() -> None:
    rows = geo.provinces()
    assert len(rows) == 81
    assert [row["plaka"] for row in rows] == list(range(1, 82))
    assert len({row["ad"] for row in rows}) == 81


def test_regions_and_metropolitan_counts() -> None:
    rows = geo.provinces()
    assert {row["bolge"] for row in rows} == set(geo.REGIONS)
    counts = {region: sum(row["bolge"] == region for row in rows) for region in geo.REGIONS}
    assert counts == {
        "Akdeniz": 8,
        "Doğu Anadolu": 14,
        "Ege": 8,
        "Güneydoğu Anadolu": 9,
        "İç Anadolu": 13,
        "Karadeniz": 18,
        "Marmara": 11,
    }
    assert sum(row["buyuksehir"] for row in rows) == 30


def test_known_provinces() -> None:
    assert geo.province(6)["ad"] == "Ankara"
    assert geo.province(34)["ad"] == "İstanbul"
    assert geo.province(35)["bolge"] == "Ege"
    assert geo.province(18)["bolge"] == "İç Anadolu"  # bir kaynakta yanlıştı; elle doğrulandı
    assert geo.province(30)["bolge"] == "Doğu Anadolu"  # bir kaynakta yanlıştı; elle doğrulandı
    assert geo.plate_code(1) == "01"
    with pytest.raises(KeyError):
        geo.province(82)


def test_find_province_tolerates_case_and_old_names() -> None:
    for name in ("İstanbul", "istanbul", "ISTANBUL", "İSTANBUL", " Istanbul "):
        found = geo.find_province(name)
        assert found is not None and found["plaka"] == 34
    for name, plate in (("Hakkâri", 30), ("İçel", 33), ("Afyon", 3), ("urfa", 63), ("IĞDIR", 76)):
        found = geo.find_province(name)
        assert found is not None and found["plaka"] == plate
    assert geo.find_province("Atlantis") is None


def test_area_codes_are_unique_three_digit_numbers() -> None:
    codes = [code for row in geo.provinces() for code in row["alan_kodlari"]]
    assert len(codes) == 82 == len(set(codes))
    assert all(200 <= code <= 499 for code in codes)
    assert [row["alan_kodlari"] for row in geo.provinces() if len(row["alan_kodlari"]) > 1] == [
        [212, 216]
    ]
    istanbul = geo.province_of_area_code(216)
    assert istanbul is not None and istanbul["plaka"] == 34
    ankara = geo.province_of_area_code(312)
    assert ankara is not None and ankara["ad"] == "Ankara"
    assert geo.province_of_area_code(999) is None


def test_postal_code_rules() -> None:
    assert geo.is_postal_code("34710")
    assert not geo.is_postal_code("82000")  # 82 plaka yok
    assert not geo.is_postal_code("00100")
    assert not geo.is_postal_code("3471")
    assert not geo.is_postal_code("3471a")
    assert geo.postal_code_matches_province("06420", 6)
    assert not geo.postal_code_matches_province("06420", 34)
    found = geo.province_of_postal_code("35220")
    assert found is not None and found["ad"] == "İzmir"
    assert geo.province_of_postal_code("99999") is None


# --- ilçeler --------------------------------------------------------------------------------


def test_districts_total_and_per_province_invariants() -> None:
    rows = reference.load("ilceler")
    assert len(rows) == 973
    assert len({(row["plaka"], row["ilce"]) for row in rows}) == 973
    by_plate = {row["plaka"]: row["ad"] for row in geo.provinces()}
    assert all(by_plate[row["plaka"]] == row["il"] for row in rows)
    for province in geo.provinces():
        names = geo.districts(province["plaka"])
        assert names, province["ad"]
        assert names == sorted(names, key=sort_key_tr)
        # Büyükşehirlerde "Merkez" adlı ilçe olmaz; diğer illerde tam bir tane olur.
        assert names.count("Merkez") == (0 if province["buyuksehir"] else 1), province["ad"]


def test_known_district_counts_and_membership() -> None:
    assert len(geo.districts(34)) == 39
    assert len(geo.districts(6)) == 25
    assert len(geo.districts(35)) == 30
    assert len(geo.districts(69)) == 3
    assert geo.is_district_of("Kadıköy", 34)
    assert geo.is_district_of("KADIKÖY", 34)
    assert geo.is_district_of("çankaya", 6)
    assert not geo.is_district_of("Kadıköy", 6)


# --- alfabe ---------------------------------------------------------------------------------


def test_alphabet_sets_partition_correctly() -> None:
    rows = reference.load("alfabe")
    assert len(rows) == 29
    assert "".join(row["kucuk"] for row in rows) == "abcçdefgğhıijklmnoöprsştuüvyz"
    for row in rows:
        assert upper_tr(row["kucuk"]) == row["buyuk"]
        assert lower_tr(row["buyuk"]) == row["kucuk"]
    vowels = reference.letters(tur="ünlü")
    consonants = reference.letters(tur="ünsüz")
    assert vowels == list("aeıioöuü")
    assert len(consonants) == 21
    assert set(reference.letters(kalinlik="kalın")) == set("aıou")
    assert set(reference.letters(kalinlik="ince")) == set("eiöü")
    assert set(reference.letters(duzluk="yuvarlak")) == set("oöuü")
    assert set(reference.letters(genislik="dar")) == set("ıiuü")
    assert set(reference.letters(sertlik="sert")) == set("çfhkpsşt")
    assert len(reference.letters(sertlik="yumuşak")) == 13
    assert set(reference.letters(sertlik="sert", sureklilik="süreksiz")) == set("pçtk")
    assert set(reference.letters(sureklilik="süreksiz")) == set("bcdgpçtk")
    for row in rows:  # her harf ya ünlü özellikleri ya ünsüz özellikleri taşır
        vowel_fields = [row["kalinlik"], row["duzluk"], row["genislik"]]
        consonant_fields = [row["sertlik"], row["sureklilik"]]
        if row["tur"] == "ünlü":
            assert all(vowel_fields) and not any(consonant_fields)
        else:
            assert all(consonant_fields) and not any(vowel_fields)


# --- takvim ---------------------------------------------------------------------------------


def test_months_and_days() -> None:
    months = reference.load("aylar")
    assert [m["ad"] for m in months][:3] == ["Ocak", "Şubat", "Mart"]
    assert len(months) == 12
    for month in months:
        assert month["gun_sayisi"] == calendar.monthrange(2023, month["no"])[1]
        assert month["gun_sayisi_artik_yil"] == calendar.monthrange(2024, month["no"])[1]
        assert month["kisaltma"] == month["ad"][:3]
    days = reference.load("gunler")
    assert [d["ad"] for d in days] == [
        "Pazartesi",
        "Salı",
        "Çarşamba",
        "Perşembe",
        "Cuma",
        "Cumartesi",
        "Pazar",
    ]
    assert calendar_tr.day_name(date(2026, 11, 16)) == "Pazartesi"  # bugünün tarihi
    assert calendar_tr.day_name(date(2023, 10, 29)) == "Pazar"
    assert calendar_tr.month_name(11) == "Kasım"
    assert calendar_tr.month_abbr(8) == "Ağu"
    assert calendar_tr.is_weekend(date(2026, 11, 15))


def test_fixed_holidays() -> None:
    holidays = calendar_tr.fixed_holidays(2026)
    assert [(h["tarih"].month, h["tarih"].day) for h in holidays] == [
        (1, 1),
        (4, 23),
        (5, 1),
        (5, 19),
        (7, 15),
        (8, 30),
        (10, 29),
    ]
    with_half = calendar_tr.fixed_holidays(2026, include_half_days=True)
    assert len(with_half) == 8
    assert calendar_tr.is_fixed_holiday(date(2026, 10, 29))
    assert not calendar_tr.is_fixed_holiday(date(2026, 10, 28))  # yarım gün
    assert not calendar_tr.is_fixed_holiday(date(2026, 11, 16))
    with pytest.raises(ValueError, match="2017"):
        calendar_tr.fixed_holidays(2016)


@pytest.mark.parametrize("style", sorted(calendar_tr.DATE_STYLES))
def test_date_format_and_parse_round_trip(style: str) -> None:
    for day in (date(2026, 11, 16), date(2024, 2, 29), date(2025, 1, 5), date(1999, 12, 31)):
        text = calendar_tr.format_date_tr(day, style)
        assert calendar_tr.parse_date_tr(text) == day, text


def test_date_parse_edge_cases() -> None:
    assert calendar_tr.format_date_tr(date(2026, 3, 5), "uzun_gunlu") == "5 Mart 2026 Perşembe"
    assert calendar_tr.parse_date_tr("  5 MART 2026 ") == date(2026, 3, 5)
    assert calendar_tr.parse_date_tr("5 ŞUBAT 2026") == date(2026, 2, 5)
    assert calendar_tr.parse_date_tr("03/04/2025") == date(2025, 4, 3)  # gün önce
    assert calendar_tr.parse_date_tr("2026-11-16T10:30:00") == date(2026, 11, 16)
    assert calendar_tr.parse_date_tr("31.02.2025") is None
    assert calendar_tr.parse_date_tr("16.11.26") is None  # iki haneli yıl belirsiz
    assert calendar_tr.parse_date_tr("yarın") is None
    with pytest.raises(ValueError, match="Bilinmeyen"):
        calendar_tr.format_date_tr(date(2026, 1, 1), "abd")


# --- diğer tablolar ---------------------------------------------------------------------------


def test_currencies() -> None:
    rows = reference.load("para_birimleri")
    assert len({row["kod"] for row in rows}) == len(rows) == 40
    assert all(len(row["kod"]) == 3 and row["kod"].isascii() for row in rows)
    assert all(len(row["sayisal_kod"]) == 3 and row["sayisal_kod"].isdigit() for row in rows)
    assert len({row["sayisal_kod"] for row in rows}) == 40
    assert reference.currency("TRY") == {
        "kod": "TRY",
        "sayisal_kod": "949",
        "ad": "Türk lirası",
        "kusurat_basamagi": 2,
        "simge": "₺",
    }
    assert reference.currency("JPY")["kusurat_basamagi"] == 0
    assert reference.currency("KWD")["kusurat_basamagi"] == 3
    with pytest.raises(KeyError):
        reference.currency("BGN")  # 2026'da geri çekildi; listede yok


def test_names_and_stopwords_are_clean() -> None:
    female, male = reference.first_names("K"), reference.first_names("E")
    assert len(female) >= 100 and len(male) >= 100
    assert not set(female) & set(male)
    assert len(reference.surnames()) >= 200
    for name in (*female, *male, *reference.surnames()):
        assert name == name.strip() and " " not in name
        assert name[0] == upper_tr(name[0]) and name[1:] == lower_tr(name[1:]), name
    words = reference.stopwords()
    assert {"ve", "ile", "için", "bu", "mi", "değil"} <= words
    assert "hala" not in words  # akrabalık adıyla karışmasın
    assert all(word == lower_tr(word) and " " not in word for word in words)


def test_bank_codes_and_synthetic_support_tables() -> None:
    banks = reference.load("banka_kodlari")
    assert all(len(b["kod"]) == 5 and b["kod"].isdigit() for b in banks)
    assert len({b["kod"] for b in banks}) == len(banks)
    categories = reference.load("urun_kategorileri")
    for row in categories:
        assert 0 < row["kurgusal_en_az_fiyat"] < row["kurgusal_en_cok_fiyat"]
        assert row["kurgusal_kdv_grubu"] in {"dusuk", "indirimli", "genel"}
        assert len(row["urun_adlari"]) >= 3
    templates = reference.load("destek_kaliplari")
    allowed = {"gun", "siparis_no", "urun", "hata"}
    import re

    for row in templates:
        assert set(re.findall(r"\{(\w+)\}", row["kalip"])) <= allowed, row["kalip"]
    assert {row["tur"] for row in reference.load("adres_kaliplari")} == {
        "mahalle",
        "cadde",
        "sokak",
    }
    numbers = reference.load("sayi_sozcukleri")
    assert [n["sozcuk"] for n in numbers if n["tur"] == "asıl"][:3] == ["sıfır", "bir", "iki"]

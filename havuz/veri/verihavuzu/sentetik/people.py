"""Sentetik kişiler: ad, soyad, cinsiyet, doğum tarihi, TCKN, telefon, e-posta, il/ilçe, adres.

Tutarlılık kuralları (testle korunur): ilçe o ile bağlıdır; posta kodunun ilk iki hanesi
plakadır; e-posta adı ve soyadından türer; TCKN ve e-posta veri kümesinde benzersizdir;
yaş ``REFERENCE_DATE`` gününe göre 18–90 arasıdır.
Ad/soyad listeleri ``tr/adlar.json`` ve ``tr/soyadlar.json``dan gelir (istatistik DEĞİLDİR).
İl ağırlıkları KURGUSALDIR (büyükşehir 3, diğer 1); nüfus dağılımını yansıtmaz.
Genişletme: yeni bir alan için ``_person`` içine ``rng.child("alan")`` akışıyla ekleyin ve
``PERSON_CONTRACT``a sütununu yazın.
"""

from __future__ import annotations

from datetime import date, timedelta
from functools import partial

from verihavuzu import geo, reference
from verihavuzu.kalite.schema import Column, TableContract
from verihavuzu.sentetik import identifiers as fake
from verihavuzu.sentetik.base import Rng, Row, WeightedPicker, make_id

REFERENCE_DATE = date(2026, 1, 1)  # yaş hesabının sabit günü (belirlenimcilik için "bugün" değil)
MIN_AGE, MAX_AGE, MODE_AGE = 18, 90, 38

PERSON_CONTRACT = TableContract(
    ad="kisiler",
    aciklama="Uydurma kişiler. Gerçek kişilerle ilgisi yoktur.",
    birincil_anahtar=["kisi_id"],
    sutunlar=[
        Column(ad="kisi_id", tur="metin", desen=r"^K\d{6}$", benzersiz=True, ornek="K000001"),
        Column(ad="ad", tur="metin", en_kisa=2),
        Column(ad="soyad", tur="metin", en_kisa=2),
        Column(ad="cinsiyet", tur="metin", izinli=["K", "E"], aciklama="K: kadın, E: erkek"),
        Column(ad="dogum_tarihi", tur="tarih", en_erken=date(1930, 1, 1), en_gec=REFERENCE_DATE),
        Column(ad="tckn", tur="metin", denetim="tckn", benzersiz=True, aciklama="uydurma"),
        Column(ad="telefon", tur="metin", denetim="cep_tr", aciklama="uydurma cep numarası"),
        Column(ad="eposta", tur="metin", denetim="eposta", benzersiz=True),
        Column(ad="il", tur="metin", denetim="il"),
        Column(ad="ilce", tur="metin"),
        Column(ad="plaka", tur="tam_sayi", en_az=1, en_cok=81),
        Column(ad="posta_kodu", tur="metin", denetim="posta_kodu"),
        Column(ad="adres", tur="metin", aciklama="uydurma açık adres (mahalle, cadde/sokak, no)"),
    ],
)


class AddressMaker:
    """İl → ilçe → mahalle/cadde/sokak → posta kodu zincirini tutarlı üretir."""

    def __init__(self) -> None:
        provinces = geo.provinces()
        self.picker = WeightedPicker(
            [row["plaka"] for row in provinces],
            [3.0 if row["buyuksehir"] else 1.0 for row in provinces],
        )
        patterns = reference.load("adres_kaliplari")
        self.by_kind = {
            kind: [row["ad"] for row in patterns if row["tur"] == kind]
            for kind in ("mahalle", "cadde", "sokak")
        }

    def make(self, rng: Rng) -> Row:
        plate = int(self.picker.pick(rng))
        street = (
            f"{rng.choice(self.by_kind['cadde'])} Cad."
            if rng.bernoulli(0.45)
            else f"{rng.choice(self.by_kind['sokak'])} Sk."
        )
        line = f"{rng.choice(self.by_kind['mahalle'])} Mah. {street} No: {rng.randint(1, 160)}"
        if rng.bernoulli(0.7):
            line += f" D: {rng.randint(1, 24)}"
        return {
            "il": geo.province(plate)["ad"],
            "ilce": rng.choice(geo.districts(plate)),
            "plaka": plate,
            "posta_kodu": fake.fake_postal_code(rng, plate),
            "adres": line,
        }


def _birth_date(rng: Rng) -> date:
    age_years = rng.triangular(MIN_AGE, MAX_AGE, MODE_AGE)
    birth = REFERENCE_DATE - timedelta(days=int(age_years * 365.25))
    return birth - timedelta(days=rng.randint(0, 364))


def generate_people(count: int, seed: int, *, start: int = 1) -> list[Row]:
    """``count`` kişi üretir. Aynı (count, seed, start) her zaman aynı satırları verir."""
    rng = Rng(seed, "kisiler")
    names = {"K": reference.first_names("K"), "E": reference.first_names("E")}
    surnames = reference.surnames()
    surname_picker = WeightedPicker(surnames, [1.0 / (1 + i / 40) for i in range(len(surnames))])
    addresses = AddressMaker()
    tckns, emails = fake.UniqueValues(), fake.UniqueValues()
    rows: list[Row] = []
    for number in range(start, start + count):
        r = rng.child(str(number))
        gender = "K" if r.child("cinsiyet").bernoulli(0.5) else "E"
        first = r.child("ad").choice(names[gender])
        last = str(surname_picker.pick(r.child("soyad")))
        birth = _birth_date(r.child("dogum"))
        tckn_rng, email_rng = r.child("tckn"), r.child("eposta")
        rows.append(
            {
                "kisi_id": make_id("K", number, 6),
                "ad": first,
                "soyad": last,
                "cinsiyet": gender,
                "dogum_tarihi": birth.isoformat(),
                "tckn": tckns.take(partial(fake.fake_tckn, tckn_rng)),
                "telefon": fake.fake_mobile(r.child("telefon")),
                "eposta": emails.take(partial(fake.fake_email, email_rng, first, last)),
                **addresses.make(r.child("adres")),
            }
        )
    return rows


def age_on(birth_iso: str, day: date) -> int:
    """Doğum tarihine göre ``day`` günündeki yaş (tam yıl)."""
    birth = date.fromisoformat(birth_iso)
    return day.year - birth.year - ((day.month, day.day) < (birth.month, birth.day))

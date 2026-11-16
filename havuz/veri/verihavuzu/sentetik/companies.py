"""Sentetik şirketler: unvan, VKN, sektör, il/ilçe, kuruluş yılı, çalışan sayısı, IBAN, telefon.

Tutarlılık: sabit hat numarası şirketin ilinin alan koduyla başlar; IBAN'ın banka kodu
``tr/banka_kodlari.json``dan gelir; VKN ve unvan benzersizdir. Unvanlar soyad/marka + sektör
sözcüğü + şirket türünden kurulur; gerçek bir şirketle aynı olması tesadüftür.
Genişletme: yeni bir unvan kalıbı için ``_title`` içine ekleyin; testler unvanın
"A.Ş." ya da "Ltd. Şti." ile bittiğini denetler.
"""

from __future__ import annotations

from functools import partial

from verihavuzu import geo, reference
from verihavuzu.kalite.schema import Column, TableContract
from verihavuzu.sentetik import identifiers as fake
from verihavuzu.sentetik.base import Rng, Row, make_id
from verihavuzu.sentetik.people import AddressMaker

FIRST_YEAR, LAST_YEAR = 1960, 2025
COMPANY_TYPES = (("Ltd. Şti.", 0.72), ("A.Ş.", 0.28))

COMPANY_CONTRACT = TableContract(
    ad="sirketler",
    aciklama="Uydurma şirketler. Gerçek şirketlerle ilgisi yoktur.",
    birincil_anahtar=["sirket_id"],
    sutunlar=[
        Column(ad="sirket_id", tur="metin", desen=r"^S\d{5}$", benzersiz=True),
        Column(ad="unvan", tur="metin", benzersiz=True, desen=r"(A\.Ş\.|Ltd\. Şti\.)$"),
        Column(ad="tur", tur="metin", izinli=["Ltd. Şti.", "A.Ş."]),
        Column(ad="vkn", tur="metin", denetim="vkn", benzersiz=True, aciklama="uydurma"),
        Column(ad="sektor", tur="metin"),
        Column(ad="il", tur="metin", denetim="il"),
        Column(ad="ilce", tur="metin"),
        Column(ad="plaka", tur="tam_sayi", en_az=1, en_cok=81),
        Column(ad="kurulus_yili", tur="tam_sayi", en_az=FIRST_YEAR, en_cok=LAST_YEAR),
        Column(ad="calisan_sayisi", tur="tam_sayi", en_az=1),
        Column(ad="telefon", tur="metin", denetim="telefon_tr", aciklama="ilin alan koduyla"),
        Column(ad="iban", tur="metin", denetim="iban_tr", aciklama="uydurma"),
    ],
)


def _title(rng: Rng, owner: str, sector_word: str, company_type: str) -> str:
    style = rng.randint(1, 3)
    if style == 1:
        return f"{owner} {sector_word} Sanayi ve Ticaret {company_type}"
    if style == 2:
        return f"{owner} {sector_word} Ticaret {company_type}"
    return f"{owner} {sector_word} {company_type}"


def _random_title(rng: Rng, owners: list[str], words: list[str], company_type: str) -> str:
    return _title(rng, rng.choice(owners), rng.choice(words), company_type)


def generate_companies(count: int, seed: int, *, start: int = 1) -> list[Row]:
    """``count`` şirket üretir (belirlenimci)."""
    rng = Rng(seed, "sirketler")
    sectors = reference.load("sektorler")
    owners = reference.surnames() + reference.column("kurgusal_markalar", "ad")
    addresses = AddressMaker()
    vkns, titles = fake.UniqueValues(), fake.UniqueValues()
    rows: list[Row] = []
    for number in range(start, start + count):
        r = rng.child(str(number))
        sector = r.child("sektor").choice(sectors)
        company_type = r.child("tur").weighted(
            [name for name, _ in COMPANY_TYPES], [weight for _, weight in COMPANY_TYPES]
        )
        title_rng = r.child("unvan")
        title = titles.take(
            partial(_random_title, title_rng, owners, sector["unvan_sozcukleri"], company_type)
        )
        address = addresses.make(r.child("adres"))
        area_code = r.child("alan").choice(geo.province(address["plaka"])["alan_kodlari"])
        median_staff = 40 if company_type == "A.Ş." else 6
        vkn_rng = r.child("vkn")
        rows.append(
            {
                "sirket_id": make_id("S", number, 5),
                "unvan": title,
                "tur": company_type,
                "vkn": vkns.take(partial(fake.fake_vkn, vkn_rng)),
                "sektor": sector["ad"],
                "il": address["il"],
                "ilce": address["ilce"],
                "plaka": address["plaka"],
                "kurulus_yili": r.child("yil").randint(FIRST_YEAR, LAST_YEAR),
                "calisan_sayisi": max(1, round(r.child("calisan").lognormal(median_staff, 1.0))),
                "telefon": fake.fake_landline(r.child("telefon"), area_code),
                "iban": fake.fake_iban_tr(r.child("iban")),
            }
        )
    return rows

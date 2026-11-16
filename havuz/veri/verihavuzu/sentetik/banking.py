"""Sentetik banka hesapları ve hesap hareketleri (maaş, kira, faturalar, kart, ATM, EFT).

Her hesap için aylık bir döngü kurulur: maaş günü, kira (kiracıysa), fatura ödemeleri (doğalgaz
kışın yüksek), kart harcamaları, ATM çekimleri, gelen/giden EFT. Hareketler zamana göre sıralanıp
yürüyen bakiye hesaplanır; bakiyeyi eksiye düşürecek çıkış "yetersiz bakiye" sayılıp atlanır.
Değişmez (test korur): bakiye[i] = bakiye[i−1] + tutar[i] ve bakiye ≥ 0.
Tutar ve oranlar KURGUSALDIR. Açıklamalar banka dökümü gibi büyük harflidir (``upper_tr``).
Genişletme: yeni hareket türü için ``_month_events`` içine bir blok ekleyin; ``KINDS``a adını yazın.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal

from verihavuzu import reference
from verihavuzu.kalite.schema import Column, TableContract
from verihavuzu.sentetik import identifiers as fake
from verihavuzu.sentetik.base import Rng, Row, Tables, make_id, money
from verihavuzu.sentetik.people import generate_people
from verihavuzu.text import upper_tr

KINDS = ["maas", "kira", "fatura", "kart_harcamasi", "atm", "eft_giden", "eft_gelen"]
MERCHANTS = ["market", "akaryakıt", "restoran", "eczane", "giyim mağazası", "elektronik", "kafe"]
BILLS = {  # (ortanca tutar, kışın çarpan)
    "elektrik": (650.0, 1.3),
    "su": (260.0, 1.0),
    "doğalgaz": (300.0, 5.0),
    "internet": (450.0, 1.0),
    "telefon": (350.0, 1.0),
}

ACCOUNT_CONTRACT = TableContract(
    ad="hesaplar",
    aciklama="Uydurma banka hesapları.",
    birincil_anahtar=["hesap_id"],
    sutunlar=[
        Column(ad="hesap_id", tur="metin", desen=r"^H\d{5}$", benzersiz=True),
        Column(ad="ad_soyad", tur="metin"),
        Column(ad="iban", tur="metin", denetim="iban_tr", benzersiz=True, aciklama="uydurma"),
        Column(ad="banka", tur="metin"),
        Column(ad="acilis_tarihi", tur="tarih"),
        Column(ad="acilis_bakiyesi", tur="ondalik", en_az=0),
    ],
)
TRANSACTION_CONTRACT = TableContract(
    ad="hareketler",
    aciklama="Hesap hareketleri; tutar girişte pozitif, çıkışta negatif.",
    birincil_anahtar=["hareket_id"],
    sutunlar=[
        Column(ad="hareket_id", tur="metin", desen=r"^HR\d{8}$", benzersiz=True),
        Column(ad="hesap_id", tur="metin", desen=r"^H\d{5}$"),
        Column(ad="zaman", tur="zaman"),
        Column(ad="tur", tur="metin", izinli=list(KINDS)),
        Column(ad="aciklama", tur="metin"),
        Column(ad="tutar", tur="ondalik"),
        Column(ad="bakiye", tur="ondalik", en_az=0),
        Column(ad="karsi_iban", tur="metin", zorunlu=False, denetim="iban_tr"),
        Column(ad="kanal", tur="metin", izinli=["mobil", "internet", "atm", "pos", "otomatik"]),
    ],
)
CONTRACTS = {"hesaplar": ACCOUNT_CONTRACT, "hareketler": TRANSACTION_CONTRACT}


def _at(day: date, rng: Rng, first_hour: int = 8, last_hour: int = 22) -> datetime:
    second = rng.randint(first_hour * 3600, last_hour * 3600 - 1)
    return datetime(day.year, day.month, day.day) + timedelta(seconds=second)


def _month_events(rng: Rng, month_start: date, days: int, profile: Row) -> list[Row]:
    events: list[Row] = []

    def add(day: int, kind: str, text: str, amount: Decimal, channel: str, **extra: str) -> None:
        when = _at(month_start + timedelta(days=min(day, days) - 1), rng)
        events.append(
            {
                "zaman": when,
                "tur": kind,
                "aciklama": upper_tr(text),
                "tutar": amount,
                "kanal": channel,
                **extra,
            }
        )

    add(profile["maas_gunu"], "maas", "Maaş ödemesi", money(profile["maas"]), "otomatik")
    if profile["kira"]:
        add(rng.randint(3, 7), "kira", "Kira ödemesi", -money(profile["kira"]), "otomatik")
    winter = month_start.month in (11, 12, 1, 2, 3)
    for bill, (median, winter_factor) in BILLS.items():
        bill_amount = rng.lognormal(median * (winter_factor if winter else 1.0), 0.15)
        add(rng.randint(10, 25), "fatura", f"{bill} faturası", -money(bill_amount), "otomatik")
    for _ in range(rng.poisson(profile["kart_sikligi"])):
        merchant = rng.choice(MERCHANTS)
        amount = -money(rng.lognormal(320.0, 0.9))
        add(rng.randint(1, days), "kart_harcamasi", f"Kart harcaması - {merchant}", amount, "pos")
    for _ in range(rng.poisson(1.5)):
        amount = -Decimal(100 * rng.randint(2, 30))
        add(rng.randint(1, days), "atm", "ATM para çekme", amount, "atm")
    for _ in range(rng.poisson(1.2)):
        other = fake.fake_iban_tr(rng)
        amount = -money(rng.lognormal(1500.0, 1.0))
        add(rng.randint(1, days), "eft_giden", "Giden EFT", amount, "mobil", karsi_iban=other)
    for _ in range(rng.poisson(0.8)):
        other = fake.fake_iban_tr(rng)
        amount = money(rng.lognormal(1200.0, 1.0))
        add(rng.randint(1, days), "eft_gelen", "Gelen EFT", amount, "internet", karsi_iban=other)
    return events


def generate_banking(
    accounts: int,
    seed: int,
    *,
    start: date = date(2025, 1, 1),
    months: int = 12,
) -> Tables:
    """``accounts`` hesap ve ``months`` aylık hareket üretir (belirlenimci)."""
    rng = Rng(seed, "banka")
    banks = {row["kod"]: row["kisa_ad"] for row in reference.load("banka_kodlari")}
    account_rows: list[Row] = []
    transactions: list[Row] = []
    for index, person in enumerate(generate_people(accounts, seed), start=1):
        r = rng.child(person["kisi_id"])
        bank_code = r.choice(sorted(banks))
        salary = r.lognormal(32000.0, 0.35)
        profile = {
            "maas": salary,
            "maas_gunu": r.choice([1, 5, 10, 15, 28]),
            "kira": salary * r.uniform(0.25, 0.4) if r.bernoulli(0.6) else None,
            "kart_sikligi": r.uniform(8, 30),
        }
        account_id = make_id("H", index, 5)
        balance = money(r.lognormal(6000.0, 1.0))
        account_rows.append(
            {
                "hesap_id": account_id,
                "ad_soyad": f"{person['ad']} {person['soyad']}",
                "iban": fake.fake_iban_tr(r.child("iban"), bank_code),
                "banka": banks[bank_code],
                "acilis_tarihi": start - timedelta(days=r.randint(30, 3000)),
                "acilis_bakiyesi": balance,
            }
        )
        events: list[Row] = []
        month_start = start
        for _ in range(months):
            next_month = (month_start.replace(day=28) + timedelta(days=4)).replace(day=1)
            days = (next_month - month_start).days
            events.extend(
                _month_events(r.child(month_start.isoformat()), month_start, days, profile)
            )
            month_start = next_month
        events.sort(key=lambda event: (event["zaman"], event["tur"]))
        for event in events:
            if balance + event["tutar"] < 0:
                continue  # yetersiz bakiye: işlem gerçekleşmedi
            balance += event["tutar"]
            transactions.append(
                {
                    "hareket_id": "",
                    "hesap_id": account_id,
                    "zaman": event["zaman"].isoformat(),
                    "tur": event["tur"],
                    "aciklama": event["aciklama"],
                    "tutar": event["tutar"],
                    "bakiye": balance,
                    "karsi_iban": event.get("karsi_iban"),
                    "kanal": event["kanal"],
                }
            )
    for number, row in enumerate(transactions, start=1):
        row["hareket_id"] = make_id("HR", number, 8)
    return {"hesaplar": account_rows, "hareketler": transactions}

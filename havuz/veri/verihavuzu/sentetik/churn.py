"""Sentetik müşteri kaybı (churn) veri kümesi — nedensel yapısı BİLİNEN.

Amaç: bir modelin doğru sinyali bulup bulmadığını sınamak. Nedensel çizge:

    gizli_ilgi ──► kullanim_saat ──► churn ◄── sozlesme, kidem_ay, destek_talebi,
         │                                     odeme_gecikmesi, aylik_ucret
         └──────► eposta_acma_orani   (churn'e DOĞRUDAN etkisi YOK; yalnız gizli_ilgi
                                        üzerinden kullanımla ilişkili → "sahte sinyal")
    yas ──► kullanim_saat;  bolge ve rastgele_ozellik: hiçbir etkisi yok.

churn ~ Bernoulli(σ(logit)), logit = Σ katsayı × özellik (``TRUE_COEFFICIENTS``). Doğru bir model
kullanim_saat'i gördüğünde eposta_acma_orani'na ~0 ağırlık vermelidir. ``gercek_olasilik`` sütunu
yalnız değerlendirme içindir: MODELE GİRDİ OLARAK VERMEYİN (sızıntı olur).
Genişletme: yeni bir neden eklerken ``TRUE_COEFFICIENTS``e katsayısını, ``_logit``e terimini,
veri kartına da çizgedeki yerini yazın.
"""

from __future__ import annotations

import math

from verihavuzu.geo import REGIONS
from verihavuzu.kalite.schema import Column, TableContract
from verihavuzu.sentetik.base import Rng, Row, make_id

TRUE_COEFFICIENTS: dict[str, float] = {
    "sabit": -1.2,
    "sozlesme_aylik": 1.1,  # aylık sözleşme (yıllık/iki yıllığa göre)
    "kidem_ay": -0.04,  # her kıdem ayı
    "destek_talebi": 0.35,  # son 3 aydaki her destek talebi
    "odeme_gecikmesi": 0.55,  # son 12 aydaki her gecikmiş ödeme
    "kullanim_saat": -0.03,  # aylık her kullanım saati
    "aylik_ucret_100": 0.08,  # aylık ücretin her 100 TL'si
}
NO_DIRECT_EFFECT = ["eposta_acma_orani", "yas", "bolge", "rastgele_ozellik"]
PACKAGES = {"temel": (199.0, 349.0), "standart": (349.0, 549.0), "premium": (549.0, 899.0)}

CHURN_CONTRACT = TableContract(
    ad="churn",
    aciklama="Bilinen nedensel yapılı churn kümesi. gercek_olasilik yalnız değerlendirme içindir.",
    birincil_anahtar=["musteri_id"],
    sutunlar=[
        Column(ad="musteri_id", tur="metin", desen=r"^C\d{6}$", benzersiz=True),
        Column(ad="yas", tur="tam_sayi", en_az=18, en_cok=80),
        Column(ad="bolge", tur="metin", izinli=list(REGIONS)),
        Column(ad="sozlesme", tur="metin", izinli=["aylik", "yillik", "iki_yillik"]),
        Column(ad="paket", tur="metin", izinli=list(PACKAGES)),
        Column(ad="kidem_ay", tur="tam_sayi", en_az=1, en_cok=72),
        Column(ad="aylik_ucret", tur="ondalik", en_az=0),
        Column(ad="kullanim_saat", tur="ondalik", en_az=0),
        Column(ad="eposta_acma_orani", tur="ondalik", en_az=0, en_cok=1),
        Column(ad="destek_talebi", tur="tam_sayi", en_az=0),
        Column(ad="odeme_gecikmesi", tur="tam_sayi", en_az=0),
        Column(ad="rastgele_ozellik", tur="ondalik", aciklama="saf gürültü; etkisi yok"),
        Column(ad="churn", tur="tam_sayi", izinli=[0, 1], aciklama="1: müşteri ayrıldı"),
        Column(
            ad="gercek_olasilik", tur="ondalik", en_az=0, en_cok=1, aciklama="EĞİTİMDE KULLANMAYIN"
        ),
    ],
)


def logit_of(row: Row) -> float:
    """Satırın (yuvarlanmış, saklanan değerlerden) gerçek logit değeri."""
    c = TRUE_COEFFICIENTS
    return float(
        c["sabit"]
        + c["sozlesme_aylik"] * (row["sozlesme"] == "aylik")
        + c["kidem_ay"] * row["kidem_ay"]
        + c["destek_talebi"] * row["destek_talebi"]
        + c["odeme_gecikmesi"] * row["odeme_gecikmesi"]
        + c["kullanim_saat"] * row["kullanim_saat"]
        + c["aylik_ucret_100"] * row["aylik_ucret"] / 100.0
    )


def sigmoid(value: float) -> float:
    return 1.0 / (1.0 + math.exp(-value))


def generate_churn(count: int, seed: int) -> list[Row]:
    """``count`` müşterilik churn kümesi üretir (belirlenimci)."""
    rng = Rng(seed, "churn")
    rows: list[Row] = []
    for number in range(1, count + 1):
        r = rng.child(str(number))
        age = round(r.triangular(18, 80, 35))
        contract = r.weighted(["aylik", "yillik", "iki_yillik"], [0.5, 0.35, 0.15])
        low_tenure, high_tenure = {"aylik": (1, 36), "yillik": (6, 60), "iki_yillik": (12, 72)}[
            contract
        ]
        package = r.weighted(list(PACKAGES), [0.45, 0.35, 0.2])
        engagement = r.gauss(0.0, 1.0)  # gizli değişken: veri kümesinde YOK
        usage = max(0.0, 25 + 9 * engagement - 0.15 * (age - 40) + r.gauss(0.0, 4.0))
        email_rate = min(1.0, max(0.0, 0.25 + 0.12 * engagement + r.gauss(0.0, 0.08)))
        row: Row = {
            "musteri_id": make_id("C", number, 6),
            "yas": age,
            "bolge": r.choice(REGIONS),
            "sozlesme": contract,
            "paket": package,
            "kidem_ay": r.randint(low_tenure, high_tenure),
            "aylik_ucret": round(r.uniform(*PACKAGES[package]), 2),
            "kullanim_saat": round(usage, 1),
            "eposta_acma_orani": round(email_rate, 3),
            "destek_talebi": r.poisson(0.6 + 0.4 * (package == "temel")),
            "odeme_gecikmesi": r.poisson(0.4),
            "rastgele_ozellik": round(r.gauss(0.0, 1.0), 3),
        }
        probability = sigmoid(logit_of(row))
        row["churn"] = int(r.bernoulli(probability))
        row["gercek_olasilik"] = round(probability, 4)
        rows.append(row)
    return rows

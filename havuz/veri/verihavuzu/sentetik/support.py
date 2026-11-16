"""Sentetik müşteri destek talepleri: kalıp tabanlı kısa metin + kategori + öncelik + süre.

Metinler ``tr/destek_kaliplari.json``daki ~40 kalıbın yuvaları ({gun}, {siparis_no}, {urun},
{hata}) programla doldurularak üretilir. Amaç tablo/analiz/arayüz denemesidir; dil modeli eğitim
verisi DEĞİLDİR (çeşitlilik bilerek düşüktür).
Çözüm süresi kategoriye göre log-normal; açık talepte boştur. Memnuniyet puanı (1–5) yalnız
kapanmış taleplerin bir kısmında vardır ve hızlı çözülen taleplerde daha yüksektir.
Genişletme: yeni kategori için kalıpları ``tr/destek_kaliplari.json``a, süre ortancasını
``MEDIAN_HOURS``a, öncelik ağırlıklarını ``PRIORITY_WEIGHTS``e ekleyin.
"""

from __future__ import annotations

import math
import re
from datetime import date, datetime, timedelta

from verihavuzu import reference
from verihavuzu.kalite.schema import Column, TableContract
from verihavuzu.sentetik.base import Rng, Row, make_id
from verihavuzu.sentetik.commerce import HOUR_WEIGHTS

CHANNELS = ["e-posta", "telefon", "canlı destek", "uygulama içi"]
PRIORITIES = ["dusuk", "normal", "yuksek", "acil"]
STATES = ["acik", "beklemede", "cozuldu", "kapandi"]
MEDIAN_HOURS = {
    "kargo": 20.0,
    "iade": 30.0,
    "odeme": 12.0,
    "urun": 26.0,
    "hesap": 6.0,
    "fatura": 16.0,
}
PRIORITY_WEIGHTS: dict[str, list[float]] = {
    "kargo": [2, 6, 2, 0.5],
    "iade": [2, 6, 2, 0.5],
    "odeme": [0.5, 3, 4, 2],
    "urun": [2, 6, 2, 0.5],
    "hesap": [1, 5, 3, 1],
    "fatura": [3, 6, 1, 0.2],
}
ERRORS = ["E-104", "E-221", "zaman aşımı", "500", "bağlantı"]
_SLOT = re.compile(r"\{(\w+)\}")

TICKET_CONTRACT = TableContract(
    ad="destek_talepleri",
    aciklama="Kalıptan üretilmiş kısa destek talepleri (uydurma).",
    birincil_anahtar=["talep_id"],
    sutunlar=[
        Column(ad="talep_id", tur="metin", desen=r"^T\d{6}$", benzersiz=True),
        Column(ad="musteri_id", tur="metin", desen=r"^M\d{6}$"),
        Column(ad="olusturma_zamani", tur="zaman"),
        Column(ad="kanal", tur="metin", izinli=list(CHANNELS)),
        Column(ad="kategori", tur="metin", izinli=list(MEDIAN_HOURS)),
        Column(ad="oncelik", tur="metin", izinli=list(PRIORITIES)),
        Column(ad="metin", tur="metin", en_kisa=10),
        Column(ad="durum", tur="metin", izinli=list(STATES)),
        Column(ad="cozum_suresi_saat", tur="ondalik", zorunlu=False, en_az=0),
        Column(ad="memnuniyet", tur="tam_sayi", zorunlu=False, en_az=1, en_cok=5),
    ],
)


def fill_template(template: str, values: dict[str, str]) -> str:
    """Kalıptaki {yuva} yerlerini doldurur; bilinmeyen yuva hata verir."""
    return _SLOT.sub(lambda match: values[match.group(1)], template)


def generate_tickets(
    count: int,
    seed: int,
    *,
    customers: int = 300,
    start: date = date(2025, 1, 1),
    end: date = date(2025, 12, 31),
) -> list[Row]:
    """``count`` destek talebi üretir; ``musteri_id`` değerleri M000001…M{customers} arasındadır."""
    rng = Rng(seed, "destek")
    templates = reference.load("destek_kaliplari")
    products = [name for row in reference.load("urun_kategorileri") for name in row["urun_adlari"]]
    period_end = datetime(end.year, end.month, end.day, 23, 59, 59)
    rows: list[Row] = []
    for number in range(1, count + 1):
        r = rng.child(str(number))
        template = r.choice(templates)
        category = template["kategori"]
        created = r.time_on(r.date_between(start, end), HOUR_WEIGHTS)
        text = fill_template(
            template["kalip"],
            {
                "gun": str(r.randint(2, 15)),
                "siparis_no": "SP" + r.digits(7),
                "urun": r.choice(products),
                "hata": r.choice(ERRORS),
            },
        )
        hours = round(r.lognormal(MEDIAN_HOURS[category], 0.8), 1)
        closed_at = created + timedelta(hours=hours)
        if closed_at > period_end:
            state, hours_value, score = r.weighted(["acik", "beklemede"], [0.6, 0.4]), None, None
        else:
            state, hours_value = r.weighted(["cozuldu", "kapandi"], [0.4, 0.6]), hours
            score = None
            if r.bernoulli(0.55):  # ankete yanıt verenler
                mean = 4.6 - 0.35 * math.log1p(hours / 12.0)
                score = min(5, max(1, round(r.gauss(mean, 0.8))))
        rows.append(
            {
                "talep_id": make_id("T", number, 6),
                "musteri_id": make_id("M", r.randint(1, customers), 6),
                "olusturma_zamani": created.isoformat(),
                "kanal": r.weighted(CHANNELS, [0.35, 0.25, 0.25, 0.15]),
                "kategori": category,
                "oncelik": r.weighted(PRIORITIES, PRIORITY_WEIGHTS[category]),
                "metin": text,
                "durum": state,
                "cozum_suresi_saat": hours_value,
                "memnuniyet": score,
            }
        )
    rows.sort(key=lambda row: (row["olusturma_zamani"], row["talep_id"]))
    for index, row in enumerate(rows, start=1):
        row["talep_id"] = make_id("T", index, 6)
    return rows

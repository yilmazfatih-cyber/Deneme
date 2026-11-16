"""Sentetik günlük zaman serisi: eğilim + haftalık/yıllık mevsimsellik + tatil etkisi + gürültü
+ ETİKETLİ anomaliler.

deger = (seviye + eğim·t) × haftalık × yıllık × tatil × gürültü × anomali çarpanı
Bileşenler ayrı sütunlarda durur (``beklenen`` = gürültüsüz ve anomalisiz değer), böylece bir
ayrıştırma ya da anomali yöntemi gerçek cevapla karşılaştırılabilir. Anomali türleri:
``ani_artis`` (1 gün), ``ani_dusus`` (1 gün), ``seviye_kaymasi`` (7–21 gün), ``eksik`` (1–3 gün,
değer boş). Tatiller ``tr/resmi_tatiller.json``daki sabit tarihlerdir (dinî bayram yoktur).
Genişletme: yeni anomali türü için ``ANOMALIES``e ekleyip ``_anomaly`` içinde çarpanını tanımlayın.
"""

from __future__ import annotations

import math
from datetime import date, timedelta

from verihavuzu.calendar_tr import is_fixed_holiday
from verihavuzu.kalite.schema import Column, TableContract
from verihavuzu.sentetik.base import Rng, Row

ANOMALIES = ["ani_artis", "ani_dusus", "seviye_kaymasi", "eksik"]
WEEKLY_BASE = [1.0, 0.97, 0.98, 1.0, 1.08, 1.25, 1.15]  # Pazartesi … Pazar (kurgusal)
HOLIDAY_FACTOR = 0.55

TIMESERIES_CONTRACT = TableContract(
    ad="zaman_serisi",
    aciklama="Günlük sentetik seri; bileşenler ve anomali etiketleri ayrı sütunlarda.",
    birincil_anahtar=["seri_id", "tarih"],
    sutunlar=[
        Column(ad="seri_id", tur="metin", desen=r"^S\d+$"),
        Column(ad="tarih", tur="tarih"),
        Column(ad="deger", tur="ondalik", zorunlu=False, en_az=0, aciklama="eksik anomalide boş"),
        Column(ad="beklenen", tur="ondalik", en_az=0, aciklama="gürültüsüz, anomalisiz değer"),
        Column(ad="egilim", tur="ondalik", aciklama="seviye + eğim × gün"),
        Column(ad="haftalik_etki", tur="ondalik", en_az=0),
        Column(ad="yillik_etki", tur="ondalik", en_az=0),
        Column(ad="tatil", tur="mantiksal"),
        Column(ad="anomali", tur="mantiksal"),
        Column(ad="anomali_turu", tur="metin", zorunlu=False, izinli=list(ANOMALIES)),
    ],
)


def _anomaly(rng: Rng) -> tuple[str, int, float]:
    """(tür, süre gün, çarpan) — eksik için çarpan kullanılmaz."""
    kind = rng.weighted(ANOMALIES, [0.35, 0.3, 0.15, 0.2])
    if kind == "ani_artis":
        return kind, 1, rng.uniform(1.8, 3.0)
    if kind == "ani_dusus":
        return kind, 1, rng.uniform(0.15, 0.45)
    if kind == "seviye_kaymasi":
        return kind, rng.randint(7, 21), rng.uniform(1.3, 1.6)
    return kind, rng.randint(1, 3), 1.0


def generate_timeseries(
    days: int,
    seed: int,
    *,
    series: int = 1,
    start: date = date(2024, 1, 1),
    anomaly_rate: float = 0.015,
    noise: float = 0.05,
) -> list[Row]:
    """``series`` seri × ``days`` gün üretir (belirlenimci)."""
    rows: list[Row] = []
    for index in range(1, series + 1):
        rng = Rng(seed, f"zaman_serisi/{index}")
        level = rng.lognormal(500.0, 0.5)
        slope = level * rng.uniform(-0.0003, 0.0010)
        weekly = [factor * rng.uniform(0.97, 1.03) for factor in WEEKLY_BASE]
        amp1, amp2 = rng.uniform(0.08, 0.22), rng.uniform(0.02, 0.08)
        phase1, phase2 = rng.uniform(0, 2 * math.pi), rng.uniform(0, 2 * math.pi)
        remaining, active_kind, factor = 0, None, 1.0
        for offset in range(days):
            day = start + timedelta(days=offset)
            year_pos = 2 * math.pi * day.timetuple().tm_yday / 365.25
            yearly = 1 + amp1 * math.sin(year_pos + phase1) + amp2 * math.sin(2 * year_pos + phase2)
            trend = level + slope * offset
            holiday = is_fixed_holiday(day)
            expected = trend * weekly[day.weekday()] * yearly * (HOLIDAY_FACTOR if holiday else 1.0)
            if remaining == 0 and rng.bernoulli(anomaly_rate):
                active_kind, remaining, factor = _anomaly(rng)
            value: float | None = expected * max(0.0, rng.gauss(1.0, noise))
            if remaining > 0:
                value = None if active_kind == "eksik" else (value or 0.0) * factor
                remaining -= 1
                label = active_kind
            else:
                label = None
            rows.append(
                {
                    "seri_id": f"S{index}",
                    "tarih": day,
                    "deger": None if value is None else round(value, 2),
                    "beklenen": round(expected, 2),
                    "egilim": round(trend, 2),
                    "haftalik_etki": round(weekly[day.weekday()], 4),
                    "yillik_etki": round(yearly, 4),
                    "tatil": holiday,
                    "anomali": label is not None,
                    "anomali_turu": label,
                }
            )
    return rows

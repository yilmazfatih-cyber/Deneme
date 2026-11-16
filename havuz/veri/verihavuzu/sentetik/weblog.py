"""Sentetik web olay günlüğü: oturumlar ve satın alma hunisi.

Huni: sayfa_goruntuleme → urun_goruntuleme (1+) → sepete_ekle → odeme_baslat → satin_al.
Her adıma geçme olasılığı trafik kaynağına ve cihaza göre değişir (KURGUSAL). Bir oturumun
olayları zamanla artar ve huni sırasını bozmaz (testler korur). Oturumların %35'i giriş
yapmış kullanıcıya (M…) aittir; diğerlerinde ``kullanici_id`` boştur.
Genişletme: yeni bir olay için ``EVENTS``e ekleyip ``_session_events`` içinde huniye yerleştirin.
"""

from __future__ import annotations

from datetime import date, timedelta

from verihavuzu.kalite.schema import Column, TableContract
from verihavuzu.sentetik.base import Rng, Row, WeightedPicker, make_id, zipf_weights
from verihavuzu.sentetik.commerce import HOUR_WEIGHTS

EVENTS = ["sayfa_goruntuleme", "urun_goruntuleme", "sepete_ekle", "odeme_baslat", "satin_al"]
DEVICES = {"mobil": 0.62, "masaustu": 0.32, "tablet": 0.06}
SOURCES = {"organik": 0.35, "dogrudan": 0.2, "reklam": 0.2, "sosyal": 0.15, "eposta": 0.1}
CART_FACTOR = {"organik": 1.0, "dogrudan": 1.3, "reklam": 0.8, "sosyal": 0.6, "eposta": 1.4}
LANDING = ["/", "/kategori/giyim", "/kategori/elektronik", "/kategori/ev", "/kampanya"]

WEBLOG_CONTRACT = TableContract(
    ad="web_olaylari",
    aciklama="Uydurma web olay günlüğü (oturum ve huni).",
    birincil_anahtar=["olay_id"],
    sutunlar=[
        Column(ad="olay_id", tur="metin", desen=r"^E\d{7}$", benzersiz=True),
        Column(ad="oturum_id", tur="metin", desen=r"^O\d{6}$"),
        Column(ad="kullanici_id", tur="metin", zorunlu=False, desen=r"^M\d{6}$"),
        Column(ad="zaman", tur="zaman"),
        Column(ad="olay", tur="metin", izinli=list(EVENTS)),
        Column(ad="sayfa", tur="metin", desen=r"^/"),
        Column(ad="urun_id", tur="metin", zorunlu=False, desen=r"^U\d{4}$"),
        Column(ad="cihaz", tur="metin", izinli=list(DEVICES)),
        Column(ad="kaynak", tur="metin", izinli=list(SOURCES)),
    ],
)


def _session_events(r: Rng, products: WeightedPicker, device: str, source: str) -> list[Row]:
    events: list[Row] = [{"olay": "sayfa_goruntuleme", "sayfa": r.choice(LANDING), "urun_id": None}]
    viewed = None
    for _ in range(1 + r.poisson(1.8)):
        viewed = products.pick(r)
        events.append({"olay": "urun_goruntuleme", "sayfa": f"/urun/{viewed}", "urun_id": viewed})
    cart_probability = min(0.9, 0.25 * CART_FACTOR[source] * (0.85 if device == "mobil" else 1.1))
    if not r.bernoulli(cart_probability):
        return events
    events.append({"olay": "sepete_ekle", "sayfa": f"/urun/{viewed}", "urun_id": viewed})
    if not r.bernoulli(0.55):
        return events
    events.append({"olay": "odeme_baslat", "sayfa": "/odeme", "urun_id": None})
    if r.bernoulli(0.58 if device == "mobil" else 0.66):
        events.append({"olay": "satin_al", "sayfa": "/odeme/tamam", "urun_id": None})
    return events


def generate_weblog(
    sessions: int,
    seed: int,
    *,
    start: date = date(2025, 3, 3),
    days: int = 14,
    customers: int = 300,
    products: int = 120,
) -> list[Row]:
    """``sessions`` oturumluk olay günlüğü üretir (belirlenimci)."""
    rng = Rng(seed, "web")
    product_ids = [make_id("U", number, 4) for number in range(1, products + 1)]
    product_picker = WeightedPicker(product_ids, zipf_weights(products))
    rows: list[Row] = []
    for number in range(1, sessions + 1):
        r = rng.child(str(number))
        session_id = make_id("O", number, 6)
        device = r.weighted(list(DEVICES), list(DEVICES.values()))
        source = r.weighted(list(SOURCES), list(SOURCES.values()))
        user = make_id("M", r.randint(1, customers), 6) if r.bernoulli(0.35) else None
        moment = r.time_on(start + timedelta(days=r.randint(0, days - 1)), HOUR_WEIGHTS)
        for event in _session_events(r, product_picker, device, source):
            rows.append(
                {
                    "olay_id": "",
                    "oturum_id": session_id,
                    "kullanici_id": user,
                    "zaman": moment.isoformat(),
                    **event,
                    "cihaz": device,
                    "kaynak": source,
                }
            )
            moment += timedelta(seconds=max(2, round(r.exponential(35.0))))
    rows.sort(key=lambda row: (row["zaman"], row["oturum_id"], EVENTS.index(row["olay"])))
    for index, row in enumerate(rows, start=1):
        row["olay_id"] = make_id("E", index, 7)
    return rows

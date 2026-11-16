"""Sentetik e-ticaret: müşteriler → siparişler → sipariş kalemleri → iadeler (+ ürünler).

Günlük sipariş sayısı Poisson(λ) ile çekilir; λ = taban × büyüme × haftalık × aylık ×
kampanya × tatil (çarpanlar ``config.CommerceConfig``de, KURGUSAL). Ürün seçimi Zipf
popülerliğine, müşteri seçimi ağır kuyruklu "alışveriş sıklığı" ağırlığına göre yapılır; bir
müşteri kayıt tarihinden önce sipariş veremez. Tutarlar ``Decimal``dır.
Değişmezler (``tests/test_sentetik.py`` korur): her kalem var olan sipariş ve ürüne bağlı;
ara_toplam = Σ kalem tutarı; toplam = ara_toplam + kargo; iade tarihi teslimden sonra;
iade adedi kalem adedini aşmaz; iptal edilen siparişin iadesi olmaz.
Genişletme: yeni sütun için ilgili ``*_CONTRACT``a ekleyin, değeri ``_make_order`` içinde üretin.
"""

from __future__ import annotations

import bisect
from datetime import date, datetime, timedelta
from decimal import Decimal

from verihavuzu.calendar_tr import is_fixed_holiday
from verihavuzu.kalite.schema import Column, TableContract
from verihavuzu.sentetik.base import Rng, Row, Tables, WeightedPicker, daterange, make_id, money
from verihavuzu.sentetik.config import CommerceConfig
from verihavuzu.sentetik.people import PERSON_CONTRACT, generate_people
from verihavuzu.sentetik.products import PRODUCT_CONTRACT, generate_products

HOUR_WEIGHTS = [
    0.3, 0.2, 0.1, 0.1, 0.1, 0.2, 0.4, 0.7, 1.0, 1.2, 1.3, 1.4,
    1.5, 1.4, 1.3, 1.3, 1.4, 1.6, 1.8, 2.0, 2.2, 2.0, 1.4, 0.8,
]  # fmt: skip  # kurgusal gün içi yoğunluk
RETURN_REASONS = [
    "beden uymadı",
    "hasarlı ürün",
    "beklentiyi karşılamadı",
    "yanlış ürün",
    "vazgeçtim",
]
STATUSES = ["teslim_edildi", "iptal", "iade_edildi", "kismi_iade"]

CUSTOMER_CONTRACT = TableContract(
    ad="musteriler",
    aciklama="Uydurma müşteriler (kişi alanları + kayıt tarihi).",
    birincil_anahtar=["musteri_id"],
    sutunlar=[
        Column(ad="musteri_id", tur="metin", desen=r"^M\d{6}$", benzersiz=True),
        *[c for c in PERSON_CONTRACT.sutunlar if c.ad != "kisi_id"],
        Column(ad="kayit_tarihi", tur="tarih"),
    ],
)
ORDER_CONTRACT = TableContract(
    ad="siparisler",
    aciklama="Siparişler. Tutarlar TL, KDV dahil.",
    birincil_anahtar=["siparis_id"],
    sutunlar=[
        Column(ad="siparis_id", tur="metin", desen=r"^SP\d{7}$", benzersiz=True),
        Column(ad="musteri_id", tur="metin", desen=r"^M\d{6}$"),
        Column(ad="siparis_zamani", tur="zaman"),
        Column(ad="kanal", tur="metin", izinli=["mobil_uygulama", "web"]),
        Column(
            ad="odeme_yontemi",
            tur="metin",
            izinli=["kredi_karti", "banka_karti", "havale_eft", "kapida_odeme"],
        ),
        Column(ad="kampanya", tur="metin", zorunlu=False, aciklama="kampanya adı ya da boş"),
        Column(ad="ara_toplam", tur="ondalik", en_az=0),
        Column(ad="indirim", tur="ondalik", en_az=0, aciklama="liste fiyatına göre indirim"),
        Column(ad="kargo_ucreti", tur="ondalik", en_az=0),
        Column(ad="toplam", tur="ondalik", en_az=0),
        Column(ad="durum", tur="metin", izinli=list(STATUSES)),
        Column(ad="teslim_tarihi", tur="tarih", zorunlu=False),
    ],
)
ITEM_CONTRACT = TableContract(
    ad="siparis_kalemleri",
    aciklama="Sipariş kalemleri.",
    birincil_anahtar=["kalem_id"],
    sutunlar=[
        Column(ad="kalem_id", tur="metin", desen=r"^KL\d{8}$", benzersiz=True),
        Column(ad="siparis_id", tur="metin", desen=r"^SP\d{7}$"),
        Column(ad="urun_id", tur="metin", desen=r"^U\d{4}$"),
        Column(ad="adet", tur="tam_sayi", en_az=1),
        Column(ad="liste_fiyati", tur="ondalik", en_az=0),
        Column(ad="birim_fiyat", tur="ondalik", en_az=0, aciklama="indirimli satış fiyatı"),
        Column(ad="tutar", tur="ondalik", en_az=0, aciklama="birim_fiyat × adet"),
    ],
)
RETURN_CONTRACT = TableContract(
    ad="iadeler",
    aciklama="İadeler (kalem düzeyinde).",
    birincil_anahtar=["iade_id"],
    sutunlar=[
        Column(ad="iade_id", tur="metin", desen=r"^IA\d{6}$", benzersiz=True),
        Column(ad="siparis_id", tur="metin", desen=r"^SP\d{7}$"),
        Column(ad="kalem_id", tur="metin", desen=r"^KL\d{8}$", benzersiz=True),
        Column(ad="iade_tarihi", tur="tarih"),
        Column(ad="adet", tur="tam_sayi", en_az=1),
        Column(ad="tutar", tur="ondalik", en_az=0),
        Column(ad="neden", tur="metin", izinli=list(RETURN_REASONS)),
    ],
)
CONTRACTS = {
    "musteriler": CUSTOMER_CONTRACT,
    "urunler": PRODUCT_CONTRACT,
    "siparisler": ORDER_CONTRACT,
    "siparis_kalemleri": ITEM_CONTRACT,
    "iadeler": RETURN_CONTRACT,
}


def _customers(count: int, seed: int, cfg: CommerceConfig) -> list[Row]:
    rng = Rng(seed, "musteriler")
    span = (cfg.bitis - cfg.baslangic).days
    rows: list[Row] = []
    for person in generate_people(count, seed):
        r = rng.child(person["kisi_id"])
        if r.bernoulli(0.6):  # dönem başlamadan kayıtlı
            joined = cfg.baslangic - timedelta(days=r.randint(1, 900))
        else:
            joined = cfg.baslangic + timedelta(days=r.randint(0, max(0, span - 1)))
        number = int(person["kisi_id"][1:])
        fields = {k: v for k, v in person.items() if k != "kisi_id"}
        rows.append({"musteri_id": make_id("M", number, 6), **fields, "kayit_tarihi": joined})
    rows.sort(key=lambda row: (row["kayit_tarihi"], row["musteri_id"]))
    return rows


def _daily_rate(cfg: CommerceConfig, day: date, base: float) -> float:
    progress = (day - cfg.baslangic).days / max(1, (cfg.bitis - cfg.baslangic).days)
    rate = base * (1 + cfg.yillik_buyume * progress)
    rate *= cfg.haftalik[day.weekday()] * cfg.aylik[day.month - 1]
    campaign = cfg.campaign_on(day)
    if campaign is not None:
        rate *= campaign.talep_carpani
    if is_fixed_holiday(day):
        rate *= cfg.tatil_carpani
    return rate


class _Builder:
    """Sipariş, kalem ve iade satırlarını sıra numaralarıyla biriktirir."""

    def __init__(self, cfg: CommerceConfig, products: list[Row]) -> None:
        self.cfg = cfg
        self.products = WeightedPicker(
            products, [1.0 / row["populerlik_sirasi"] ** 1.1 for row in products]
        )
        self.orders: list[Row] = []
        self.items: list[Row] = []
        self.returns: list[Row] = []

    def make_order(self, rng: Rng, when: datetime, customer: Row) -> None:
        cfg = self.cfg
        day = when.date()
        order_id = make_id("SP", len(self.orders) + 1, 7)
        campaign = cfg.campaign_on(day)
        chosen: dict[str, Row] = {}
        for _ in range(min(6, 1 + rng.poisson(0.7))):
            product = self.products.pick(rng)
            chosen.setdefault(product["urun_id"], product)
        lines: list[Row] = []
        for product in chosen.values():
            quantity = rng.weighted([1, 2, 3], [0.82, 0.14, 0.04])
            unit = product["fiyat"]
            if campaign is not None and rng.bernoulli(0.6):
                rate = round(rng.uniform(campaign.en_az_indirim, campaign.en_cok_indirim), 2)
                unit = money(product["fiyat"] * (Decimal(1) - Decimal(str(rate))))
            lines.append(
                {
                    "kalem_id": make_id("KL", len(self.items) + len(lines) + 1, 8),
                    "siparis_id": order_id,
                    "urun_id": product["urun_id"],
                    "adet": quantity,
                    "liste_fiyati": product["fiyat"],
                    "birim_fiyat": unit,
                    "tutar": money(unit * quantity),
                    "_kategori": product["kategori"],
                }
            )
        subtotal = sum((line["tutar"] for line in lines), Decimal("0.00"))
        discount = sum(
            ((line["liste_fiyati"] - line["birim_fiyat"]) * line["adet"] for line in lines),
            Decimal("0.00"),
        )
        shipping = Decimal("0.00") if subtotal >= cfg.ucretsiz_kargo_esigi else cfg.kargo_ucreti
        cancelled = rng.bernoulli(cfg.iptal_orani)
        delivered = None if cancelled else day + timedelta(days=rng.randint(1, 5))
        status = "iptal" if cancelled else self._returns(rng, lines, order_id, delivered)
        self.orders.append(
            {
                "siparis_id": order_id,
                "musteri_id": customer["musteri_id"],
                "siparis_zamani": when.isoformat(),
                "kanal": rng.weighted(["mobil_uygulama", "web"], [0.6, 0.4]),
                "odeme_yontemi": rng.weighted(
                    ["kredi_karti", "banka_karti", "havale_eft", "kapida_odeme"],
                    [0.62, 0.2, 0.1, 0.08],
                ),
                "kampanya": campaign.ad if campaign else None,
                "ara_toplam": subtotal,
                "indirim": money(discount),
                "kargo_ucreti": shipping,
                "toplam": subtotal + shipping,
                "durum": status,
                "teslim_tarihi": delivered,
            }
        )
        for line in lines:
            line.pop("_kategori")
        self.items.extend(lines)

    def _returns(self, rng: Rng, lines: list[Row], order_id: str, delivered: date | None) -> str:
        assert delivered is not None
        returned_units = 0
        for line in lines:
            if not rng.bernoulli(self.cfg.return_rate(line["_kategori"])):
                continue
            quantity = line["adet"] if rng.bernoulli(0.8) else rng.randint(1, line["adet"])
            returned_units += quantity
            reasons = RETURN_REASONS
            clothing = line["_kategori"] in ("Giyim", "Ayakkabı")
            weights = [5, 1, 2, 1, 1] if clothing else [1, 2, 3, 1, 1]
            self.returns.append(
                {
                    "iade_id": make_id("IA", len(self.returns) + 1, 6),
                    "siparis_id": order_id,
                    "kalem_id": line["kalem_id"],
                    "iade_tarihi": delivered + timedelta(days=rng.randint(1, 14)),
                    "adet": quantity,
                    "tutar": money(line["birim_fiyat"] * quantity),
                    "neden": rng.weighted(reasons, weights),
                }
            )
        if returned_units == 0:
            return "teslim_edildi"
        return "iade_edildi" if returned_units == sum(x["adet"] for x in lines) else "kismi_iade"


def generate_commerce(
    customers: int, seed: int, *, products: int = 120, config: CommerceConfig | None = None
) -> Tables:
    """E-ticaret tablolarını üretir: musteriler, urunler, siparisler, siparis_kalemleri, iadeler."""
    cfg = config or CommerceConfig()
    customer_rows = _customers(customers, seed, cfg)
    product_rows = generate_products(products, seed, config=cfg)
    activity = Rng(seed, "aktivite")
    picker = WeightedPicker(customer_rows, [activity.lognormal(1.0, 1.1) for _ in customer_rows])
    joined = [row["kayit_tarihi"] for row in customer_rows]
    builder = _Builder(cfg, product_rows)
    base = cfg.base_daily_orders(customers)
    rng = Rng(seed, "siparisler")
    for day in daterange(cfg.baslangic, cfg.bitis):
        day_rng = rng.child(day.isoformat())
        available = bisect.bisect_right(joined, day)
        if available == 0:
            continue
        count = day_rng.poisson(_daily_rate(cfg, day, base))
        times = sorted(day_rng.time_on(day, HOUR_WEIGHTS) for _ in range(count))
        for when in times:  # sipariş numaraları zaman sırasıyla artar
            builder.make_order(day_rng, when, picker.pick(day_rng, limit=available))
    customer_rows.sort(key=lambda row: row["musteri_id"])
    return {
        "musteriler": customer_rows,
        "urunler": product_rows,
        "siparisler": builder.orders,
        "siparis_kalemleri": builder.items,
        "iadeler": builder.returns,
    }

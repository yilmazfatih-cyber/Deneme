"""Sentetik ürün kataloğu: ürün adı, kurgusal marka, kategori, fiyat, KDV oranı, stok, popülerlik.

Kategoriler ``tr/urun_kategorileri.json``dan, markalar ``tr/kurgusal_markalar.json``dan gelir.
Fiyatlar KURGUSALDIR (kategori aralığında log-tekdüze, "…,90/…,99" ile biten etiket fiyatı).
Popülerlik Zipf dağılımına göre sıralanır: ``populerlik_sirasi`` 1 olan en çok satandır;
e-ticaret üreteci ürün seçerken bu sırayı kullanır.
Genişletme: yeni kategori için yalnız ``tr/urun_kategorileri.json``a satır ekleyin (ve meta
dosyasını güncelleyin).
"""

from __future__ import annotations

from verihavuzu import reference
from verihavuzu.kalite.schema import Column, TableContract
from verihavuzu.sentetik.base import Rng, Row, make_id, price_between
from verihavuzu.sentetik.config import CommerceConfig

PRODUCT_CONTRACT = TableContract(
    ad="urunler",
    aciklama="Kurgusal ürün kataloğu (fiyatlar piyasa verisi değildir).",
    birincil_anahtar=["urun_id"],
    sutunlar=[
        Column(ad="urun_id", tur="metin", desen=r"^U\d{4}$", benzersiz=True),
        Column(ad="urun_adi", tur="metin"),
        Column(ad="marka", tur="metin"),
        Column(ad="kategori", tur="metin"),
        Column(ad="alt_kategori", tur="metin"),
        Column(ad="fiyat", tur="ondalik", en_az=0.01, aciklama="KDV dahil etiket fiyatı (TL)"),
        Column(ad="kdv_grubu", tur="metin", izinli=["dusuk", "indirimli", "genel"]),
        Column(ad="kdv_orani", tur="tam_sayi", en_az=0, en_cok=100, aciklama="yüzde"),
        Column(ad="stok", tur="tam_sayi", en_az=0),
        Column(ad="populerlik_sirasi", tur="tam_sayi", en_az=1, benzersiz=True),
        Column(ad="aktif", tur="mantiksal"),
    ],
)


def generate_products(count: int, seed: int, *, config: CommerceConfig | None = None) -> list[Row]:
    """``count`` ürün üretir; KDV oranları ayardan (``config.kdv_oranlari``) okunur."""
    cfg = config or CommerceConfig()
    rng = Rng(seed, "urunler")
    categories = reference.load("urun_kategorileri")
    brands = reference.column("kurgusal_markalar", "ad")
    ranks = list(range(1, count + 1))
    rng.child("populerlik").shuffle(ranks)
    rows: list[Row] = []
    seen_names: set[str] = set()
    for index in range(count):
        r = rng.child(str(index + 1))
        category = r.child("kategori").choice(categories)
        name_rng = r.child("ad")
        for _ in range(50):  # aynı adı iki ürüne vermemek için birkaç deneme
            brand = name_rng.choice(brands)
            name = f"{brand} {name_rng.choice(category['urun_adlari'])}"
            if name not in seen_names:
                break
        seen_names.add(name)
        group = category["kurgusal_kdv_grubu"]
        rows.append(
            {
                "urun_id": make_id("U", index + 1, 4),
                "urun_adi": name,
                "marka": brand,
                "kategori": category["kategori"],
                "alt_kategori": category["alt_kategori"],
                "fiyat": price_between(
                    r.child("fiyat"),
                    category["kurgusal_en_az_fiyat"],
                    category["kurgusal_en_cok_fiyat"],
                ),
                "kdv_grubu": group,
                "kdv_orani": cfg.kdv_oranlari[group],
                "stok": r.child("stok").randint(0, 400),
                "populerlik_sirasi": ranks[index],
                "aktif": r.child("aktif").bernoulli(0.95),
            }
        )
    return rows

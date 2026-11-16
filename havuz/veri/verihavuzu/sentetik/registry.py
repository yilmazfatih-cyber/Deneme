"""Üreteç kaydı: komut satırındaki ``uret <ad>`` adlarını üreteç işlevlerine bağlayan TEK yer.

Her kayıt: ad, açıklama, ``--adet``in anlamı, varsayılan adet, çalıştıran işlev ve tabloların
sözleşmeleri (``<tablo>.sema.json`` bunlardan yazılır). Çalıştıran işlev her zaman
``{tablo_adı: satırlar}`` sözlüğü döndürür; tek tablolu üreteçler de.
Genişletme: yeni üreteci yazın (``people.py``yi örnek alın), sonra aşağıdaki listeye
"YENİ ÜRETEÇ BURAYA" satırının üstüne bir ``GeneratorSpec`` ekleyin ve
``tests/test_sentetik.py``deki belirlenimcilik testine adını yazın.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from verihavuzu.kalite.schema import TableContract
from verihavuzu.sentetik import banking, commerce, invoices
from verihavuzu.sentetik.base import Tables
from verihavuzu.sentetik.churn import CHURN_CONTRACT, generate_churn
from verihavuzu.sentetik.companies import COMPANY_CONTRACT, generate_companies
from verihavuzu.sentetik.config import CommerceConfig
from verihavuzu.sentetik.people import PERSON_CONTRACT, generate_people
from verihavuzu.sentetik.products import PRODUCT_CONTRACT, generate_products
from verihavuzu.sentetik.support import TICKET_CONTRACT, generate_tickets
from verihavuzu.sentetik.timeseries import TIMESERIES_CONTRACT, generate_timeseries
from verihavuzu.sentetik.weblog import WEBLOG_CONTRACT, generate_weblog

Runner = Callable[[int, int, CommerceConfig], Tables]


@dataclass(frozen=True)
class GeneratorSpec:
    ad: str
    aciklama: str
    adet_anlami: str
    varsayilan_adet: int
    calistir: Runner
    sozlesmeler: dict[str, TableContract]


SPECS = [
    GeneratorSpec(
        "kisiler",
        "Uydurma kişiler (TCKN, telefon, e-posta, adres)",
        "kişi sayısı",
        100,
        lambda n, s, c: {"kisiler": generate_people(n, s)},
        {"kisiler": PERSON_CONTRACT},
    ),
    GeneratorSpec(
        "sirketler",
        "Uydurma şirketler (unvan, VKN, IBAN)",
        "şirket sayısı",
        50,
        lambda n, s, c: {"sirketler": generate_companies(n, s)},
        {"sirketler": COMPANY_CONTRACT},
    ),
    GeneratorSpec(
        "urunler",
        "Kurgusal ürün kataloğu",
        "ürün sayısı",
        120,
        lambda n, s, c: {"urunler": generate_products(n, s, config=c)},
        {"urunler": PRODUCT_CONTRACT},
    ),
    GeneratorSpec(
        "eticaret",
        "Müşteri → sipariş → kalem → iade (+ ürünler)",
        "müşteri sayısı",
        300,
        lambda n, s, c: commerce.generate_commerce(n, s, config=c),
        commerce.CONTRACTS,
    ),
    GeneratorSpec(
        "faturalar",
        "E-ticaret siparişlerinden faturalar (KDV ayardan)",
        "müşteri sayısı",
        100,
        lambda n, s, c: invoices.generate_invoices(n, s, config=c),
        invoices.CONTRACTS,
    ),
    GeneratorSpec(
        "banka",
        "Banka hesapları ve 12 aylık hareketler",
        "hesap sayısı",
        20,
        lambda n, s, c: banking.generate_banking(n, s),
        banking.CONTRACTS,
    ),
    GeneratorSpec(
        "zaman_serisi",
        "İki günlük seri: eğilim, mevsimsellik, tatil, etiketli anomali",
        "gün sayısı",
        730,
        lambda n, s, c: {"zaman_serisi": generate_timeseries(n, s, series=2)},
        {"zaman_serisi": TIMESERIES_CONTRACT},
    ),
    GeneratorSpec(
        "churn",
        "Nedensel yapısı bilinen müşteri kaybı kümesi",
        "müşteri sayısı",
        5000,
        lambda n, s, c: {"churn": generate_churn(n, s)},
        {"churn": CHURN_CONTRACT},
    ),
    GeneratorSpec(
        "destek",
        "Kalıptan üretilmiş destek talepleri",
        "talep sayısı",
        500,
        lambda n, s, c: {"destek_talepleri": generate_tickets(n, s)},
        {"destek_talepleri": TICKET_CONTRACT},
    ),
    GeneratorSpec(
        "web_olaylari",
        "Web oturumları ve satın alma hunisi",
        "oturum sayısı",
        1000,
        lambda n, s, c: {"web_olaylari": generate_weblog(n, s)},
        {"web_olaylari": WEBLOG_CONTRACT},
    ),
    # YENİ ÜRETEÇ BURAYA
]
GENERATORS: dict[str, GeneratorSpec] = {spec.ad: spec for spec in SPECS}


def get_generator(name: str) -> GeneratorSpec:
    """Adı verilen üreteci döndürür; yoksa seçenekleri söyleyen bir hata verir."""
    try:
        return GENERATORS[name]
    except KeyError:
        raise KeyError(f"Bilinmeyen üreteç: {name}. Seçenekler: {', '.join(GENERATORS)}") from None

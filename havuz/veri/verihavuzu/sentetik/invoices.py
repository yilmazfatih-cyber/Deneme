"""Sentetik faturalar: e-ticaret siparişlerinden fatura ve fatura kalemleri (KDV ayardan).

Her iptal edilmemiş sipariş için bir fatura kesilir. Fiyatlar KDV dahildir; her kalemde
matrah = tutar / (1 + oran) iki basamağa yuvarlanır, KDV = tutar − matrah (böylece
matrah + KDV = tutar her zaman kuruşu kuruşuna tutar). Kargo ayrı bir kalemdir.
Fatura numarası 16 karakterdir: 3 harf ön ek + yıl + 9 haneli sıra ("SNT2025000000001"),
e-Arşiv numaralarına benzer biçim. "Yalnız …" satırı ``numwords.amount_to_words`` ile yazılır.
Genişletme: farklı bir KDV senaryosu için ``CommerceConfig.kdv_oranlari``nı ayar dosyasıyla
değiştirin.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from verihavuzu.kalite.schema import Column, TableContract
from verihavuzu.numwords import amount_to_words
from verihavuzu.sentetik.base import Row, Tables, money
from verihavuzu.sentetik.commerce import generate_commerce
from verihavuzu.sentetik.config import CommerceConfig

INVOICE_PREFIX = "SNT"

INVOICE_CONTRACT = TableContract(
    ad="faturalar",
    aciklama="Uydurma e-arşiv benzeri faturalar (tutarlar TL).",
    birincil_anahtar=["fatura_no"],
    sutunlar=[
        Column(ad="fatura_no", tur="metin", desen=r"^[A-Z]{3}\d{4}\d{9}$", benzersiz=True),
        Column(ad="siparis_id", tur="metin", desen=r"^SP\d{7}$", benzersiz=True),
        Column(ad="fatura_tarihi", tur="tarih"),
        Column(ad="alici_ad_soyad", tur="metin"),
        Column(ad="alici_tckn", tur="metin", denetim="tckn", aciklama="uydurma"),
        Column(ad="alici_il", tur="metin", denetim="il"),
        Column(ad="matrah", tur="ondalik", en_az=0, aciklama="KDV hariç toplam"),
        Column(ad="kdv_tutari", tur="ondalik", en_az=0),
        Column(ad="genel_toplam", tur="ondalik", en_az=0, aciklama="KDV dahil"),
        Column(
            ad="kdv_dokumu", tur="metin", aciklama="oran:tutar çiftleri, ör. '10:12.50|20:40.00'"
        ),
        Column(ad="yazi_ile", tur="metin", desen=r"^Yalnız "),
    ],
)
INVOICE_LINE_CONTRACT = TableContract(
    ad="fatura_kalemleri",
    aciklama="Fatura kalemleri; kargo da bir kalemdir.",
    birincil_anahtar=["fatura_no", "sira"],
    sutunlar=[
        Column(ad="fatura_no", tur="metin", desen=r"^[A-Z]{3}\d{4}\d{9}$"),
        Column(ad="sira", tur="tam_sayi", en_az=1),
        Column(ad="aciklama", tur="metin"),
        Column(ad="urun_id", tur="metin", zorunlu=False),
        Column(ad="adet", tur="tam_sayi", en_az=1),
        Column(ad="birim_fiyat", tur="ondalik", en_az=0, aciklama="KDV dahil"),
        Column(ad="kdv_orani", tur="tam_sayi", en_az=0, en_cok=100),
        Column(ad="matrah", tur="ondalik", en_az=0),
        Column(ad="kdv_tutari", tur="ondalik", en_az=0),
        Column(ad="tutar", tur="ondalik", en_az=0, aciklama="KDV dahil = matrah + kdv_tutari"),
    ],
)
CONTRACTS = {"faturalar": INVOICE_CONTRACT, "fatura_kalemleri": INVOICE_LINE_CONTRACT}


def split_vat(total: Decimal, rate: int) -> tuple[Decimal, Decimal]:
    """KDV dahil tutarı (matrah, KDV) olarak ayırır; ikisinin toplamı her zaman ``total``dır."""
    base = money(total / (Decimal(1) + Decimal(rate) / Decimal(100)))
    return base, total - base


def _line(
    invoice_no: str,
    order: int,
    text: str,
    product: str | None,
    quantity: int,
    unit: Decimal,
    total: Decimal,
    rate: int,
) -> Row:
    base, vat = split_vat(total, rate)
    return {
        "fatura_no": invoice_no,
        "sira": order,
        "aciklama": text,
        "urun_id": product,
        "adet": quantity,
        "birim_fiyat": unit,
        "kdv_orani": rate,
        "matrah": base,
        "kdv_tutari": vat,
        "tutar": total,
    }


def invoices_from_commerce(tables: Tables, config: CommerceConfig | None = None) -> Tables:
    """E-ticaret tablolarından ``faturalar`` ve ``fatura_kalemleri`` üretir."""
    cfg = config or CommerceConfig()
    customers = {row["musteri_id"]: row for row in tables["musteriler"]}
    products = {row["urun_id"]: row for row in tables["urunler"]}
    items_by_order: dict[str, list[Row]] = {}
    for item in tables["siparis_kalemleri"]:
        items_by_order.setdefault(item["siparis_id"], []).append(item)
    invoices: list[Row] = []
    lines: list[Row] = []
    sequence: dict[int, int] = {}
    for order in tables["siparisler"]:
        if order["durum"] == "iptal":
            continue
        day = datetime.fromisoformat(order["siparis_zamani"]).date()
        sequence[day.year] = sequence.get(day.year, 0) + 1
        number = f"{INVOICE_PREFIX}{day.year}{sequence[day.year]:09d}"
        own: list[Row] = []
        for item in items_by_order[order["siparis_id"]]:
            product = products[item["urun_id"]]
            own.append(
                _line(
                    number,
                    len(own) + 1,
                    product["urun_adi"],
                    item["urun_id"],
                    item["adet"],
                    item["birim_fiyat"],
                    item["tutar"],
                    product["kdv_orani"],
                )
            )
        if order["kargo_ucreti"] > 0:
            rate = cfg.kdv_oranlari[cfg.kargo_kdv_grubu]
            fee = order["kargo_ucreti"]
            own.append(_line(number, len(own) + 1, "Kargo hizmeti", None, 1, fee, fee, rate))
        breakdown: dict[int, Decimal] = {}
        for line in own:
            breakdown[line["kdv_orani"]] = (
                breakdown.get(line["kdv_orani"], Decimal(0)) + line["kdv_tutari"]
            )
        total = sum((line["tutar"] for line in own), Decimal("0.00"))
        customer = customers[order["musteri_id"]]
        invoices.append(
            {
                "fatura_no": number,
                "siparis_id": order["siparis_id"],
                "fatura_tarihi": day,
                "alici_ad_soyad": f"{customer['ad']} {customer['soyad']}",
                "alici_tckn": customer["tckn"],
                "alici_il": customer["il"],
                "matrah": sum((line["matrah"] for line in own), Decimal("0.00")),
                "kdv_tutari": sum((line["kdv_tutari"] for line in own), Decimal("0.00")),
                "genel_toplam": total,
                "kdv_dokumu": "|".join(f"{rate}:{breakdown[rate]}" for rate in sorted(breakdown)),
                "yazi_ile": f"Yalnız {amount_to_words(total)}",
            }
        )
        lines.extend(own)
    return {"faturalar": invoices, "fatura_kalemleri": lines}


def generate_invoices(customers: int, seed: int, *, config: CommerceConfig | None = None) -> Tables:
    """Önce aynı tohumla e-ticaret verisi üretir, sonra onun faturalarını keser."""
    cfg = config or CommerceConfig()
    return invoices_from_commerce(generate_commerce(customers, seed, config=cfg), cfg)

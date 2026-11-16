"""Örnek hat: TCMB günlük gösterge döviz kurları (XML) → ``tcmb_kurlari`` tablosu.

Kaynak adres biçimi: ``https://www.tcmb.gov.tr/kurlar/YYYYAA/GGAAYYYY.xml`` (bugün için
``today.xml``). Hafta sonu ve resmî tatillerde bülten yayımlanmaz; sunucu 404 döner ve bu hata
DEĞİLDİR ("bülten yok" diye günlüğe yazılır). 2026-11-16'da elle denendi: 12 ve 13 Kasım 2026
için 200, 14–15 Kasım (hafta sonu) ve 28–29 Ekim (Cumhuriyet Bayramı) için 404 döndü;
robots.txt yalnız "*/search+results" yolunu yasaklıyor.
Artımlı: ``ctx.state["son_tarih"]`` en son başarıyla işlenen gündür; sonraki koşu ertesi
günden başlar.
Güvenlik: XML ``<!DOCTYPE``/``<!ENTITY`` içeriyorsa okunmaz (XML bombası koruması).
Genişletme: başka bir XML/JSON kaynağı için bu dosyayı kopyalayın; ``_parse``, ``validate`` ve
``transform``u değiştirin; ``registry.py``ye ekleyin; kayıtlı yanıtlarla test yazın.
"""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from collections.abc import Iterator
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation
from typing import Any

from verihavuzu.hat.pipeline import PipelineSpec, RunContext

BASE_URL = "https://www.tcmb.gov.tr/kurlar"
RATE_FIELDS = {
    "ForexBuying": "doviz_alis",
    "ForexSelling": "doviz_satis",
    "BanknoteBuying": "efektif_alis",
    "BanknoteSelling": "efektif_satis",
}
_CODE = re.compile(r"[A-Z]{3}")
DEFAULT_LOOKBACK_DAYS = 7

Row = dict[str, Any]


def bulletin_url(day: date) -> str:
    return f"{BASE_URL}/{day:%Y%m}/{day:%d%m%Y}.xml"


def _parse(body: bytes, requested: date) -> list[Row]:
    head = body[:2048]
    if b"<!DOCTYPE" in head or b"<!ENTITY" in body:
        raise ValueError("XML belge türü/varlık bildirimi içeriyor; güvenlik nedeniyle okunmadı.")
    root = ET.fromstring(body)  # noqa: S314 - DOCTYPE/ENTITY yukarıda reddedildi
    records: list[Row] = []
    for node in root.findall("Currency"):
        record: Row = {
            "istenen_tarih": requested.isoformat(),
            "bulten_tarihi": root.get("Tarih"),
            "bulten_no": root.get("Bulten_No"),
            "kod": node.get("CurrencyCode") or node.get("Kod"),
            "birim": (node.findtext("Unit") or "").strip(),
            "ad": " ".join((node.findtext("Isim") or "").split()),
        }
        for xml_name, field_name in RATE_FIELDS.items():
            record[field_name] = (node.findtext(xml_name) or "").strip()
        records.append(record)
    return records


def fetch(ctx: RunContext) -> Iterator[Row]:
    """İstenen aralıktaki iş günlerinin bültenlerini getirir; durumu ilerletir."""
    end: date = ctx.params.get("bitis") or ctx.today
    if ctx.params.get("baslangic"):
        start: date = ctx.params["baslangic"]
    elif ctx.state.get("son_tarih"):
        start = date.fromisoformat(ctx.state["son_tarih"]) + timedelta(days=1)
    else:
        start = end - timedelta(days=DEFAULT_LOOKBACK_DAYS)
    day = start
    while day <= end:
        if day.weekday() < 5:  # hafta sonu bülten yok; istek atılmaz
            reply = ctx.fetcher.get(bulletin_url(day))
            if reply.status == 404 and day >= ctx.today:
                # Bugünün bülteni gün içinde (öğleden sonra) yayımlanır: henüz yoksa bu gün
                # "işlendi" sayılmaz, filigran ilerlemez ve sonraki koşu bu günü yeniden dener.
                # Yoksa o günün kuru hiç çekilmezdi.
                ctx.log(f"{day.isoformat()}: bülten henüz yayımlanmamış; sonra yeniden denenecek")
                return
            if reply.status == 404:
                ctx.log(f"{day.isoformat()}: bülten yok (tatil olabilir)")
            elif reply.status != 200:
                raise RuntimeError(f"{day.isoformat()}: beklenmeyen HTTP {reply.status}")
            else:
                yield from _parse(reply.body, day)
        ctx.state["son_tarih"] = day.isoformat()
        day += timedelta(days=1)


def _decimal(text: str) -> Decimal | None:
    if not text:
        return None
    try:
        return Decimal(text)
    except InvalidOperation:
        return None


def validate(record: Row) -> list[str]:
    """Kayıt sorunları (boş liste = geçerli)."""
    problems: list[str] = []
    if not _CODE.fullmatch(str(record.get("kod") or "")):
        problems.append("para birimi kodu üç büyük harf olmalı")
    if not str(record.get("birim", "")).isdigit() or int(record["birim"]) < 1:
        problems.append("birim pozitif tam sayı olmalı")
    expected = date.fromisoformat(record["istenen_tarih"]).strftime("%d.%m.%Y")
    if record.get("bulten_tarihi") != expected:
        problems.append(
            f"bülten tarihi ({record.get('bulten_tarihi')}) istenen günle ({expected}) uyuşmuyor"
        )
    for field_name in RATE_FIELDS.values():
        text = record.get(field_name, "")
        value = _decimal(text)
        if text and (value is None or value <= 0):
            problems.append(f"{field_name} pozitif bir sayı olmalı: {text!r}")
    buying, selling = (
        _decimal(record.get("doviz_alis", "")),
        _decimal(record.get("doviz_satis", "")),
    )
    if buying is None:
        problems.append("doviz_alis boş olamaz")
    elif selling is not None and buying > selling:
        problems.append("döviz alış, satıştan büyük olamaz")
    return problems


def transform(record: Row) -> Row:
    return {
        "tarih": record["istenen_tarih"],
        "kod": record["kod"],
        "birim": int(record["birim"]),
        "ad": record["ad"],
        **{name: _decimal(record.get(name, "")) for name in RATE_FIELDS.values()},
        "bulten_no": record["bulten_no"],
    }


SPEC = PipelineSpec(
    ad="tcmb_kurlari",
    aciklama="TCMB günlük gösterge döviz kurları (iş günleri, XML)",
    tablo="tcmb_kurlari",
    anahtar=["tarih", "kod"],
    cek=fetch,
    dogrula=validate,
    donustur=transform,
)

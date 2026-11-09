"""Hane şeması: bir KAP bildiriminden çıkarılan yapılandırılmış alanlar ("haneler").

Okuyucu (ajan ya da düzenli ifade) HAM haneleri doldurur; `zenginlestir` piyasa verisiyle TÜRETİLMİŞ haneleri
hesaplar. Bot yalnız bu şemayı okur: aynı karar mantığı ajan okusa da, düzenli ifade okusa da aynı çalışır.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

Tur = Literal[
    "yatirim", "is_iliskisi", "ihale", "yeni_is", "bedelsiz", "bedelli", "temettu", "geri_alim", "pay_satisi",
    "birlesme_devralma", "dava_ceza", "derecelendirme", "finansal_rapor", "borclanma", "diger",
]  # fmt: skip
ParaBirimi = Literal["TRY", "USD", "EUR", "GBP", "CHF", "JPY", "CNY", "RUB"]
Buyukluk = Literal["cok_kucuk", "kucuk", "orta", "buyuk", "cok_buyuk"]

# Türün "karar anında bilinen" kaba yönü (fiyat tepkisine bakılmaz)
VARSAYILAN_YON: dict[str, str] = {
    "yatirim": "olumlu", "is_iliskisi": "olumlu", "ihale": "olumlu", "yeni_is": "olumlu", "bedelsiz": "olumlu",
    "temettu": "olumlu", "geri_alim": "olumlu", "birlesme_devralma": "notr", "bedelli": "olumsuz", "pay_satisi": "olumsuz",
    "dava_ceza": "olumsuz", "derecelendirme": "notr", "finansal_rapor": "notr", "borclanma": "notr", "diger": "notr",
}  # fmt: skip


class KapHane(BaseModel):
    # --- kimlik ---
    hisse: str
    kamuya_acilma: datetime  # saat dilimli; bot yalnız bu andan SONRASI için emir yazar
    tur: Tur
    baslik: str = Field(default="", max_length=200)
    metin: str = ""  # bildirim özeti/alıntısı
    kaynak: str | None = None
    # --- ham haneler (okuyucu doldurur) ---
    tutar: float | None = None  # ana tutar (yatırım/sözleşme/ihale/geri alım/ceza...), para biriminde
    para_birimi: ParaBirimi | None = None
    oran: float | None = None  # oran (0,01 = %1): bedelsiz/bedelli/pay satışı/devralma payı
    pay_basi_tl: float | None = None  # temettü (brüt, pay başı TL)
    islem_fiyati_tl: float | None = None  # pay satışı / bedelli (rüçhan) / devralma pay fiyatı
    sure_ay: float | None = None  # yatırım/sözleşme süresi
    karsi_taraf: str | None = None
    not_eski: str | None = None  # derecelendirme
    not_yeni: str | None = None
    net_kar: float | None = None  # finansal rapor (dönem, TL)
    beklenti: float | None = None  # piyasa beklentisi (TL), biliniyorsa
    yon: Literal["olumlu", "olumsuz", "notr"] | None = None  # okuyucunun yönü; boşsa türden
    guven: float = Field(default=0.5, ge=0, le=1)
    okuyan: str = "elle"  # regex | ajan:<model> | elle
    # --- türetilmiş haneler (zenginlestir doldurur) ---
    usdtry: float | None = None
    kur: float | None = None  # para birimi → TL kuru (kullanılan)
    tutar_tl: float | None = None
    piyasa_degeri_tl: float | None = None
    pd_orani: float | None = None  # tutar_tl / piyasa değeri
    satis_orani: float | None = None  # tutar_tl / son 4 çeyrek satış
    ozkaynak_orani: float | None = None  # tutar_tl / ana ortaklık özkaynağı
    temettu_verimi: float | None = None  # pay_basi_tl / fiyat
    kar_surprizi: float | None = None  # net_kar / beklenti - 1
    buyukluk: Buyukluk | None = None
    notlar: list[str] = []

    @field_validator("hisse")
    @classmethod
    def _buyuk(cls, v: str) -> str:
        return v.strip().upper()

    @field_validator("kamuya_acilma")
    @classmethod
    def _tz(cls, v: datetime) -> datetime:
        if v.tzinfo is None:
            from zoneinfo import ZoneInfo

            v = v.replace(tzinfo=ZoneInfo("Europe/Istanbul"))
        return v

    def etkin_yon(self) -> str:
        return self.yon or VARSAYILAN_YON.get(self.tur, "notr")


def buyukluk_sinifi(pd_orani: float | None) -> Buyukluk | None:
    """Piyasa değerine oran eşikleri: <%0,25 çok küçük, <%1 küçük, <%3 orta, <%10 büyük, üstü çok büyük."""
    if pd_orani is None:
        return None
    x = abs(pd_orani)
    return "cok_kucuk" if x < 0.0025 else "kucuk" if x < 0.01 else "orta" if x < 0.03 else "buyuk" if x < 0.10 else "cok_buyuk"

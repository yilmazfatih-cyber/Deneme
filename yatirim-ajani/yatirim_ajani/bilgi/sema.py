"""Bilgi veritabanı şeması: olaylar hem sayı hem anlam taşır.

Bir olay = belirli bir zaman aralığında, belirli bir kapsamda (şirket / sektör / yerel makro / küresel)
olmuş ve fiyatta iz bırakmış bir şey. Sayısal alanlar ileride "bugünkü duruma benzeyen geçmiş"
aramasında katsayı olarak kullanılır; metin alanları olayın anlamını ve yatırımcı kitlesinin
tepkisini tutar (bazı olaylar ancak anlamıyla eşleşir: "ihale beklentisi", "faiz indirimi
döngüsü", "panik satışı").
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Kapsam = Literal["sirket", "sektor", "yerel_makro", "kuresel"]
Tepki = Literal[
    "panik_satisi", "kar_satisi", "fomo_alimi", "kademeli_birikim", "beklenti_alimi",
    "haber_sonrasi_duzeltme", "ilgisizlik", "rotasyon", "belirsiz",
]  # fmt: skip

SEKTORLER: dict[str, str] = {
    "ASELS": "savunma", "ASTOR": "enerji_ekipman", "KONTR": "enerji_ekipman", "AKSEN": "enerji_uretim",
    "ODAS": "enerji_uretim", "AHGAZ": "enerji_dagitim", "TUPRS": "rafineri_petrokimya", "PETKM": "rafineri_petrokimya",
    "SASA": "kimya", "GUBRF": "kimya_gubre", "HEKTS": "kimya_tarim", "EREGL": "demir_celik", "KRDMD": "demir_celik",
    "BRSAN": "demir_celik", "CIMSA": "cimento", "OYAKC": "cimento", "SISE": "cam", "KCHOL": "holding", "SAHOL": "holding",
    "ENKAI": "holding_insaat", "TKFEN": "holding_insaat", "DOAS": "otomotiv", "FROTO": "otomotiv", "TOASO": "otomotiv",
    "ARCLK": "dayanikli_tuketim", "BIMAS": "perakende", "MGROS": "perakende", "ULKER": "gida", "THYAO": "havacilik",
    "PGSUS": "havacilik", "TAVHL": "havalimani", "TCELL": "telekom", "TTKOM": "telekom", "AKBNK": "banka",
    "GARAN": "banka", "YKBNK": "banka", "ISCTR": "banka", "HALKB": "kamu_banka", "VAKBN": "kamu_banka",
}  # fmt: skip


class Olay(BaseModel):
    kapsam: Kapsam
    hisse: str | None = None  # şirket olayı için
    sektor: str | None = None  # sektör olayı için; şirket olayında otomatik doldurulur
    baslangic: str  # YYYY-MM-DD
    bitis: str  # YYYY-MM-DD
    tur: str  # yukselis | dusus | sok | rejim | haber | bilanço | ihale | faiz | secim | ...
    baslik: str = Field(max_length=160)
    anlam: str  # Ne oldu, neden önemli; 2–5 cümle. Semantik eşleşme için.
    yatirimci_tepkisi: Tepki = "belirsiz"
    tepki_aciklama: str = ""  # Kitle nasıl davrandı; kısa.
    onden_gorulebilir: Literal["evet", "kismen", "hayir"] = "kismen"
    guven: float = Field(ge=0, le=1, default=0.5)  # anlatının kaynaklarla desteklenme derecesi
    etiketler: list[str] = []
    kaynaklar: list[str] = []
    # Sayısal katsayılar (veriden hesaplanır; metin kaydında boş bırakılabilir)
    getiri: float | None = None  # aralık getirisi
    endekse_gore: float | None = None  # aralık getirisi - XU100 aralık getirisi
    oynaklik_oncesi: float | None = None  # aralık öncesi 20 günlük günlük std
    hacim_z: float | None = None  # aralıktaki ortalama hacmin 60 günlük z-skoru
    takip_5g: float | None = None  # aralık bitiminden sonra 5 gün getiri
    takip_20g: float | None = None  # aralık bitiminden sonra 20 gün getiri
    mom20_oncesi: float | None = None  # aralık başındaki 20 günlük momentum
    kaynak_tipi: Literal["sayisal", "metin", "birlesik"] = "metin"


class OlayPaketi(BaseModel):
    olaylar: list[Olay]
    not_: str | None = Field(default=None, alias="not")

    model_config = {"populate_by_name": True}

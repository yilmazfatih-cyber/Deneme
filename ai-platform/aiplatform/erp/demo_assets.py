"""Demo ERP için sentetik örnek belgeler: 4 fatura, 1 irsaliye, 1 tedarikçi sözleşmesi (metin katmanlı PDF) + 2 PNG.

Bütün içerik sentetiktir. Tedarikçi unvanları ve VKN'ler örnek ERP'deki (`mock_erp.py`, tohum 2024) cari kayıtlarıyla
birebir aynıdır; VKN'ler sağlama algoritmasıyla üretilmiştir, gerçek bir şirkete ait değildir. Ürün satırları örnek
ERP'nin stok kartlarından alınır ve açıklamada ürün kodu (URN-xxxx) geçer: "ERP'ye öneri kayıt" adımı bu kodla eşler.

Bilerek konan hatalar (demoda doğrulama uyarısı görünsün diye):
  - fatura_tedarikci04_2026-11.pdf: genel toplam, ara toplam + KDV'den 100,00 TL fazla basılmıştır.

Kullanım:
    python -m aiplatform.erp.demo_assets docs/demo/

Türkçe karakterler için bir TrueType yazı tipi gerekir (DejaVuSans aranır; `AIP_DEMO_FONT` ile yol verilebilir).
"""

from __future__ import annotations

import json
import os
import sqlite3
import sys
import tempfile
from pathlib import Path
from typing import Any

from .mock_erp import create_mock_erp, vkn_check_digit

MANIFEST = "manifest.json"
FONT_NAME = "DemoSans"
FONT_BOLD = "DemoSans-Bold"

# Platformu kullanan (alıcı) şirket — sentetik
COMPANY = {
    "unvan": "Örnek Şirket A.Ş.",
    "vkn": "123456789" + vkn_check_digit("123456789"),
    "vergi_dairesi": "Örnek Vergi Dairesi",
    "adres": "Örnek Mah. Deneme Cad. No: 1, 34000 İstanbul",
}

FONT_CANDIDATES = [
    (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ),
    ("/usr/share/fonts/dejavu/DejaVuSans.ttf", "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf"),
    ("/usr/share/fonts/TTF/DejaVuSans.ttf", "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf"),
    ("/Library/Fonts/Arial Unicode.ttf", None),
    ("/System/Library/Fonts/Supplemental/Arial.ttf", "/System/Library/Fonts/Supplemental/Arial Bold.ttf"),
    ("C:/Windows/Fonts/arial.ttf", "C:/Windows/Fonts/arialbd.ttf"),
]

# Belge tanımları. cari_id örnek ERP'deki tedarikçi kimliğidir (21 = Tedarikçi 01 A.Ş. …).
# Satırlar: (ürün kodu, miktar, birim fiyat, KDV oranı %)
DOCS: list[dict[str, Any]] = [
    {
        "dosya_adi": "fatura_tedarikci01_2026-10.pdf",
        "tur": "fatura",
        "sablon": "klasik",
        "cari_id": 21,
        "belge_no": "T01-2026-000418",
        "tarih": "2026-10-24",
        "vade": "2026-11-23",
        "satirlar": [("URN-0001", 40, 78.50, 20), ("URN-0005", 60, 44.20, 20), ("URN-0003", 25, 32.10, 20)],
        "aciklama": "Rulman, filtre ve conta seti alımı — tek KDV oranı (%20).",
        "goruntu": True,
    },
    {
        "dosya_adi": "fatura_tedarikci02_2026-10.pdf",
        "tur": "fatura",
        "sablon": "modern",
        "cari_id": 22,
        "belge_no": "ABC2026000000731",
        "tarih": "2026-10-29",
        "vade": "2026-12-13",
        "satirlar": [("URN-0011", 30, 181.40, 20), ("URN-0012", 12, 248.70, 10), ("URN-0006", 80, 20.75, 20)],
        "aciklama": "Ambalaj ve palet — karışık KDV (%20 ve %10).",
        "goruntu": False,
    },
    {
        "dosya_adi": "fatura_tedarikci03_2026-11.pdf",
        "tur": "fatura",
        "sablon": "kompakt",
        "cari_id": 23,
        "belge_no": "GIB2026000004102",
        "tarih": "2026-11-03",
        "vade": "2026-12-03",
        "satirlar": [("URN-0009", 4, 676.00, 20), ("URN-0010", 2, 772.90, 1), ("URN-0002", 15, 115.60, 10)],
        "aciklama": "Sensör, kablo makarası, kayış — üç farklı KDV oranı (%20, %1, %10).",
        "goruntu": True,
    },
    {
        "dosya_adi": "fatura_tedarikci04_2026-11.pdf",
        "tur": "fatura",
        "sablon": "klasik",
        "cari_id": 24,
        "belge_no": "T04-2026-001207",
        "tarih": "2026-11-05",
        "vade": "2026-12-05",
        "satirlar": [("URN-0007", 1, 3664.40, 20), ("URN-0004", 6, 296.80, 20)],
        "genel_toplam_hatasi": 100.00,
        "aciklama": "Elektrik motoru ve hidrolik hortum — genel toplam bilerek 100 TL fazla basıldı (doğrulama uyarısı).",
        "goruntu": False,
    },
    {
        "dosya_adi": "irsaliye_tedarikci01_2026-11.pdf",
        "tur": "irsaliye",
        "sablon": "irsaliye",
        "cari_id": 21,
        "belge_no": "IRS-T01-2026-0932",
        "tarih": "2026-11-06",
        "sevk_tarihi": "2026-11-06",
        "plaka": "00 DMO 000",
        "satirlar": [("URN-0001", 40, None, None), ("URN-0013", 20, None, None)],
        "aciklama": "Sevk irsaliyesi — fiyat içermez.",
        "goruntu": False,
    },
    {
        "dosya_adi": "sozlesme_tedarikci05.pdf",
        "tur": "sozlesme",
        "sablon": "sozlesme",
        "cari_id": 25,
        "belge_no": "SZL-2026-014",
        "tarih": "2026-09-01",
        "aciklama": "İki sayfalık tedarik çerçeve sözleşmesi (vade, ceza, KVKK, fesih maddeleri).",
        "goruntu": False,
    },
]


# --------------------------------------------------------------------------- yardımcılar


def tl(x: float) -> str:
    """1234.5 → '1.234,50'"""
    s = f"{x:,.2f}"
    return s.replace(",", "X").replace(".", ",").replace("X", ".")


def tr_date(iso: str) -> str:
    y, m, d = iso.split("-")
    return f"{d}.{m}.{y}"


def find_font() -> tuple[str, str | None]:
    env = os.environ.get("AIP_DEMO_FONT")
    if env:
        if not Path(env).exists():
            raise FileNotFoundError(f"AIP_DEMO_FONT bulunamadı: {env}")
        bold = os.environ.get("AIP_DEMO_FONT_BOLD")
        return env, bold if bold and Path(bold).exists() else None
    for reg, bold in FONT_CANDIDATES:
        if Path(reg).exists():
            return reg, bold if bold and Path(bold).exists() else None
    raise FileNotFoundError(
        "Türkçe karakter destekli TrueType yazı tipi bulunamadı (DejaVuSans aranır). "
        "AIP_DEMO_FONT=/yol/yazi-tipi.ttf ile belirtin."
    )


def _register_fonts() -> None:
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    if FONT_NAME in pdfmetrics.getRegisteredFontNames():
        return
    reg, bold = find_font()
    pdfmetrics.registerFont(TTFont(FONT_NAME, reg))
    pdfmetrics.registerFont(TTFont(FONT_BOLD, bold or reg))


def load_erp_refs() -> tuple[dict[int, dict], dict[str, dict]]:
    """Örnek ERP'yi geçici bir dosyada üretir; cari ve stok kayıtlarını döner (tohum sabit → her seferinde aynı)."""
    with tempfile.TemporaryDirectory() as tmp:
        p = Path(tmp) / "ornek_erp.db"
        create_mock_erp(p)
        con = sqlite3.connect(p)
        try:
            cari = {
                r[0]: {"id": r[0], "unvan": r[1], "vkn": r[2], "il": r[3]}
                for r in con.execute("SELECT id, unvan, vkn, il FROM cari")
            }
            stok = {
                r[0]: {"urun_kodu": r[0], "ad": r[1], "birim_fiyat": float(r[2])}
                for r in con.execute("SELECT urun_kodu, ad, birim_fiyat FROM stok")
            }
        finally:
            con.close()
    return cari, stok


def compute_lines(doc: dict, stok: dict[str, dict]) -> tuple[list[dict], dict]:
    lines, ara, kdv = [], 0.0, 0.0
    for kod, miktar, fiyat, oran in doc.get("satirlar", []):
        ln: dict[str, Any] = {
            "urun_kodu": kod,
            "aciklama": f"{kod} {stok[kod]['ad']}",
            "miktar": miktar,
            "birim": "Adet",
        }
        if fiyat is not None:
            tutar = round(miktar * fiyat, 2)
            ln.update(
                {"birim_fiyat": fiyat, "kdv_orani": oran, "tutar": tutar, "kdv": round(tutar * oran / 100, 2)}
            )
            ara += tutar
            kdv += ln["kdv"]
        lines.append(ln)
    ara, kdv = round(ara, 2), round(kdv, 2)
    gercek = round(ara + kdv, 2)
    basilan = round(gercek + float(doc.get("genel_toplam_hatasi") or 0), 2)
    return lines, {
        "ara_toplam": ara,
        "kdv_toplam": kdv,
        "genel_toplam": basilan,
        "dogru_genel_toplam": gercek,
    }


# --------------------------------------------------------------------------- çizim


class _Pen:
    """reportlab tuvali üzerinde kısa yardımcılar (mm biriminde, sol-üst köşeden)."""

    def __init__(self, c, height_mm: float = 297):
        from reportlab.lib.units import mm

        self.c, self.mm, self.H = c, mm, height_mm

    def text(self, x, y, s, size=9.5, bold=False, align="left", color=(0.1, 0.1, 0.12)):
        c, mm = self.c, self.mm
        c.setFillColorRGB(*color)
        c.setFont(FONT_BOLD if bold else FONT_NAME, size)
        yy = (self.H - y) * mm
        if align == "right":
            c.drawRightString(x * mm, yy, s)
        elif align == "center":
            c.drawCentredString(x * mm, yy, s)
        else:
            c.drawString(x * mm, yy, s)

    def rect(self, x, y, w, h, fill=None, stroke=(0.75, 0.77, 0.8)):
        c, mm = self.c, self.mm
        if fill:
            c.setFillColorRGB(*fill)
        if stroke:
            c.setStrokeColorRGB(*stroke)
        c.setLineWidth(0.6)
        c.rect(
            x * mm, (self.H - y - h) * mm, w * mm, h * mm, fill=1 if fill else 0, stroke=1 if stroke else 0
        )

    def line(self, x1, y1, x2, y2, color=(0.75, 0.77, 0.8), width=0.6):
        c, mm = self.c, self.mm
        c.setStrokeColorRGB(*color)
        c.setLineWidth(width)
        c.line(x1 * mm, (self.H - y1) * mm, x2 * mm, (self.H - y2) * mm)

    def para(self, x, y, s, width_mm, size=9.5, leading=4.6, bold=False):
        """Basit sözcük kaydırmalı paragraf; son satırın y'sini döner."""
        from reportlab.pdfbase.pdfmetrics import stringWidth

        font = FONT_BOLD if bold else FONT_NAME
        words, cur, yy = s.split(), "", y
        for w in words:
            trial = (cur + " " + w).strip()
            if stringWidth(trial, font, size) / self.mm > width_mm and cur:
                self.text(x, yy, cur, size, bold)
                yy += leading
                cur = w
            else:
                cur = trial
        if cur:
            self.text(x, yy, cur, size, bold)
            yy += leading
        return yy


THEMES = {
    "klasik": {"accent": (0.12, 0.25, 0.45), "band": (0.92, 0.94, 0.97)},
    "modern": {"accent": (0.05, 0.45, 0.42), "band": (0.9, 0.96, 0.95)},
    "kompakt": {"accent": (0.45, 0.22, 0.1), "band": (0.97, 0.94, 0.9)},
    "irsaliye": {"accent": (0.3, 0.3, 0.32), "band": (0.94, 0.94, 0.94)},
}


def _party_block(p: _Pen, x, y, title, unvan, vkn, vd, adres):
    p.text(x, y, title, 8, True, color=(0.4, 0.42, 0.46))
    p.text(x, y + 5, unvan, 10.5, True)
    p.text(x, y + 10, adres, 8.5)
    p.text(x, y + 14.5, f"Vergi Dairesi: {vd}   VKN: {vkn}", 8.5)


def _draw_invoice(c, doc: dict, cari: dict, lines: list[dict], totals: dict) -> None:
    p = _Pen(c)
    th = THEMES[doc["sablon"]]
    acc = th["accent"]
    satici_adres = f"Sanayi Bölgesi {cari['id'] - 20}. Cadde No: {cari['id']}, {cari['il']}"
    vd = f"{cari['il']} Vergi Dairesi"
    if doc["sablon"] == "modern":
        p.rect(0, 0, 210, 34, fill=acc, stroke=None)
        p.text(15, 14, cari["unvan"], 16, True, color=(1, 1, 1))
        p.text(15, 21, satici_adres, 9, color=(0.9, 0.95, 0.95))
        p.text(15, 26.5, f"{vd} · VKN {cari['vkn']}", 9, color=(0.9, 0.95, 0.95))
        p.text(195, 14, "e-FATURA", 18, True, align="right", color=(1, 1, 1))
        p.text(195, 21, f"Fatura No: {doc['belge_no']}", 9.5, align="right", color=(1, 1, 1))
        p.text(195, 26.5, f"Tarih: {tr_date(doc['tarih'])}", 9.5, align="right", color=(1, 1, 1))
        _party_block(
            p, 15, 44, "SAYIN", COMPANY["unvan"], COMPANY["vkn"], COMPANY["vergi_dairesi"], COMPANY["adres"]
        )
        p.text(195, 44, "Senaryo: TEMEL FATURA", 8.5, align="right")
        p.text(195, 49, f"Son ödeme: {tr_date(doc['vade'])}", 8.5, align="right")
        p.text(195, 54, "Para birimi: TRY", 8.5, align="right")
        top = 68
    elif doc["sablon"] == "kompakt":
        p.text(15, 18, "FATURA", 20, True, color=acc)
        p.text(
            15,
            25,
            f"No: {doc['belge_no']}   Tarih: {tr_date(doc['tarih'])}   Vade: {tr_date(doc['vade'])}",
            9,
        )
        p.line(15, 29, 195, 29, color=acc, width=1.2)
        _party_block(p, 15, 36, "SATICI", cari["unvan"], cari["vkn"], vd, satici_adres)
        _party_block(
            p, 110, 36, "ALICI", COMPANY["unvan"], COMPANY["vkn"], COMPANY["vergi_dairesi"], COMPANY["adres"]
        )
        top = 60
    else:  # klasik
        p.rect(15, 12, 180, 26, fill=th["band"])
        p.text(20, 20, cari["unvan"], 13, True, color=acc)
        p.text(20, 26, satici_adres, 8.5)
        p.text(20, 31, f"{vd}  ·  VKN: {cari['vkn']}", 8.5)
        p.text(190, 20, "FATURA", 15, True, align="right", color=acc)
        p.text(190, 26, f"Belge No: {doc['belge_no']}", 9, align="right")
        p.text(190, 31, f"Düzenleme Tarihi: {tr_date(doc['tarih'])}", 9, align="right")
        _party_block(
            p, 15, 46, "ALICI", COMPANY["unvan"], COMPANY["vkn"], COMPANY["vergi_dairesi"], COMPANY["adres"]
        )
        p.text(195, 46, f"Vade Tarihi: {tr_date(doc['vade'])}", 9, align="right")
        top = 70

    # kalem tablosu
    cols = [
        (15, "Sıra"),
        (26, "Ürün / Hizmet"),
        (112, "Miktar"),
        (130, "Birim Fiyat"),
        (152, "KDV %"),
        (166, "Tutar (TL)"),
    ]
    p.rect(15, top, 180, 8, fill=th["band"])
    for x, label in cols:
        p.text(x + 1.5, top + 5.5, label, 8.5, True)
    y = top + 8
    for i, ln in enumerate(lines, 1):
        y += 7
        p.text(16.5, y - 1.8, str(i), 9)
        p.text(27.5, y - 1.8, ln["aciklama"], 9)
        p.text(127, y - 1.8, f"{ln['miktar']} {ln['birim']}", 9, align="right")
        p.text(149, y - 1.8, tl(ln["birim_fiyat"]), 9, align="right")
        p.text(162, y - 1.8, f"%{ln['kdv_orani']}", 9, align="right")
        p.text(194, y - 1.8, tl(ln["tutar"]), 9, align="right")
        p.line(15, y, 195, y)
    # oran bazında KDV dökümü
    by_rate: dict[int, float] = {}
    for ln in lines:
        by_rate[ln["kdv_orani"]] = by_rate.get(ln["kdv_orani"], 0.0) + ln["kdv"]
    y += 10
    rows = [("Mal / Hizmet Toplamı", totals["ara_toplam"])]
    rows += [(f"Hesaplanan KDV (%{r})", round(v, 2)) for r, v in sorted(by_rate.items(), reverse=True)]
    rows += [("KDV Toplamı", totals["kdv_toplam"]), ("Ödenecek Tutar (Genel Toplam)", totals["genel_toplam"])]
    for label, val in rows:
        bold = label.startswith("Ödenecek")
        if bold:
            p.rect(98, y - 5, 97, 7.5, fill=th["band"])
        p.text(100, y, label, 9, bold)
        p.text(193, y, f"{tl(val)} TL", 9, bold, align="right")
        y += 7
    y += 6
    p.text(15, y, "Ödeme: Banka havalesi ile vade tarihinde. Açıklamaya fatura numarasını yazınız.", 8.5)
    p.text(
        15,
        y + 5,
        "Bu belge demo amaçlı sentetik bir örnektir; gerçek bir ticari işleme ait değildir.",
        8,
        color=(0.45, 0.45, 0.5),
    )


def _draw_irsaliye(c, doc: dict, cari: dict, lines: list[dict]) -> None:
    p = _Pen(c)
    th = THEMES["irsaliye"]
    p.text(15, 18, "SEVK İRSALİYESİ", 18, True, color=th["accent"])
    p.text(195, 14, f"İrsaliye No: {doc['belge_no']}", 9, align="right")
    p.text(195, 19, f"Düzenleme: {tr_date(doc['tarih'])}", 9, align="right")
    p.text(195, 24, f"Sevk Tarihi: {tr_date(doc['sevk_tarihi'])}", 9, align="right")
    p.line(15, 29, 195, 29, width=1)
    _party_block(
        p,
        15,
        36,
        "GÖNDEREN",
        cari["unvan"],
        cari["vkn"],
        f"{cari['il']} Vergi Dairesi",
        f"Sanayi Bölgesi {cari['id'] - 20}. Cadde No: {cari['id']}, {cari['il']}",
    )
    _party_block(
        p, 110, 36, "ALICI", COMPANY["unvan"], COMPANY["vkn"], COMPANY["vergi_dairesi"], COMPANY["adres"]
    )
    p.text(15, 60, f"Teslim adresi: {COMPANY['adres']}  ·  Araç plakası: {doc['plaka']}", 9)
    top = 68
    p.rect(15, top, 180, 8, fill=th["band"])
    for x, label in [(15, "Sıra"), (26, "Ürün kodu ve adı"), (150, "Miktar"), (172, "Birim")]:
        p.text(x + 1.5, top + 5.5, label, 8.5, True)
    y = top + 8
    for i, ln in enumerate(lines, 1):
        y += 7
        p.text(16.5, y - 1.8, str(i), 9)
        p.text(27.5, y - 1.8, ln["aciklama"], 9)
        p.text(168, y - 1.8, str(ln["miktar"]), 9, align="right")
        p.text(173.5, y - 1.8, ln["birim"], 9)
        p.line(15, y, 195, y)
    y += 14
    p.text(15, y, "Teslim eden: ______________________", 9)
    p.text(110, y, "Teslim alan: ______________________", 9)
    p.text(15, y + 10, "Bu irsaliye fiyat içermez; faturası ayrıca düzenlenecektir.", 8.5)
    p.text(15, y + 15, "Bu belge demo amaçlı sentetik bir örnektir.", 8, color=(0.45, 0.45, 0.5))


SOZLESME_MADDELERI = [
    (
        "Madde 1 — Taraflar",
        (
            "Bu sözleşme {alici} (bundan sonra ALICI) ile {satici} (bundan sonra TEDARİKÇİ) arasında, "
            "aşağıdaki şartlarla {tarih} tarihinde imzalanmıştır."
        ),
    ),
    (
        "Madde 2 — Konu",
        (
            "TEDARİKÇİ, ALICI'nın üretim tesislerinde kullanılan rulman, kayış, conta seti ve filtre "
            "ürünlerini bu sözleşme ekindeki fiyat listesine göre tedarik eder."
        ),
    ),
    (
        "Madde 3 — Süre",
        (
            "Sözleşme imza tarihinden itibaren 12 (on iki) ay geçerlidir. Taraflardan biri süre bitiminden "
            "30 gün önce yazılı bildirimde bulunmazsa aynı şartlarla 1 yıl uzar."
        ),
    ),
    (
        "Madde 4 — Fiyat ve Ödeme",
        (
            "Birim fiyatlar ekteki listede KDV hariç TL olarak belirtilmiştir. Fiyatlar 6 ayda bir, "
            "en fazla yüzde 15 oranında güncellenebilir. Ödeme fatura tarihinden itibaren 45 gün içinde banka havalesiyle yapılır."
        ),
    ),
    (
        "Madde 5 — Teslimat",
        (
            "Siparişler en geç 7 iş günü içinde ALICI'nın deposuna teslim edilir. Her teslimatta sevk "
            "irsaliyesi düzenlenir. Teslimat gecikmesinde geciken her gün için sipariş tutarının binde 5'i "
            "oranında cezai şart uygulanır; toplam ceza sipariş tutarının yüzde 10'unu geçemez."
        ),
    ),
    (
        "Madde 6 — Kalite ve İade",
        (
            "Ayıplı ürünler teslimden itibaren 15 gün içinde bildirilir. TEDARİKÇİ ayıplı ürünü 10 iş "
            "günü içinde bedelsiz değiştirir veya bedelini iade eder."
        ),
    ),
    (
        "Madde 7 — Gizlilik ve Kişisel Veriler",
        (
            "Taraflar, sözleşme kapsamında öğrendikleri ticari bilgileri gizli tutar. "
            "Kişisel veriler 6698 sayılı KVKK'ya uygun olarak yalnız sözleşmenin ifası amacıyla işlenir ve üçüncü kişilere aktarılmaz."
        ),
    ),
    (
        "Madde 8 — Fesih",
        (
            "Taraflardan biri esaslı bir yükümlülüğü ihlal eder ve yazılı ihtardan sonra 15 gün içinde "
            "ihlali gidermezse diğer taraf sözleşmeyi tazminatsız feshedebilir."
        ),
    ),
    (
        "Madde 9 — Uyuşmazlık",
        "Bu sözleşmeden doğan uyuşmazlıklarda İstanbul Mahkemeleri ve İcra Daireleri yetkilidir.",
    ),
    (
        "Madde 10 — Yürürlük",
        (
            "Bu sözleşme 10 maddeden ve 1 ekten oluşur, iki nüsha olarak düzenlenmiş ve taraflarca "
            "okunarak imzalanmıştır."
        ),
    ),
]


def _draw_sozlesme(c, doc: dict, cari: dict) -> None:
    p = _Pen(c)
    fmt = {"alici": COMPANY["unvan"], "satici": cari["unvan"], "tarih": tr_date(doc["tarih"])}
    p.text(105, 22, "TEDARİK ÇERÇEVE SÖZLEŞMESİ", 15, True, align="center")
    p.text(105, 28, f"Sözleşme No: {doc['belge_no']}  ·  Tarih: {tr_date(doc['tarih'])}", 9, align="center")
    p.line(15, 32, 195, 32)
    y = 40
    page = 1
    for title, body in SOZLESME_MADDELERI:
        if y > 255:
            p.text(105, 287, f"Sayfa {page} / 2", 8, align="center", color=(0.45, 0.45, 0.5))
            c.showPage()
            page += 1
            y = 22
        p.text(15, y, title, 10, True)
        y = p.para(15, y + 5.5, body.format(**fmt), 180) + 3.5
        if title.startswith("Madde 6") and page == 1:  # imzalar ikinci sayfada kalsın: sayfayı burada böl
            y = 999
    y += 8
    p.text(15, y, "ALICI", 10, True)
    p.text(110, y, "TEDARİKÇİ", 10, True)
    p.text(15, y + 5.5, COMPANY["unvan"], 9.5)
    p.text(110, y + 5.5, cari["unvan"], 9.5)
    p.text(15, y + 10.5, f"VKN: {COMPANY['vkn']}", 9)
    p.text(110, y + 10.5, f"VKN: {cari['vkn']}", 9)
    p.text(15, y + 24, "Kaşe / İmza: ____________________", 9)
    p.text(110, y + 24, "Kaşe / İmza: ____________________", 9)
    p.text(15, y + 38, "Ek-1: Fiyat listesi (bu demo belgesinde yer almaz).", 8.5, color=(0.45, 0.45, 0.5))
    p.text(
        15,
        y + 43,
        "Bu belge demo amaçlı sentetik bir örnektir; gerçek taraflar arasında yapılmış bir sözleşme değildir.",
        8,
        color=(0.45, 0.45, 0.5),
    )
    p.text(105, 287, f"Sayfa {page} / 2", 8, align="center", color=(0.45, 0.45, 0.5))


def _render_pdf(path: Path, doc: dict, cari: dict, stok: dict) -> dict:
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas

    c = canvas.Canvas(str(path), pagesize=A4, invariant=1, pageCompression=1)
    c.setTitle(f"{doc['tur'].capitalize()} {doc['belge_no']}")
    c.setAuthor("Yerel AI Platformu — demo (sentetik)")
    c.setSubject("Sentetik demo belgesi")
    info: dict[str, Any] = {}
    if doc["tur"] == "fatura":
        lines, totals = compute_lines(doc, stok)
        _draw_invoice(c, doc, cari, lines, totals)
        info = {"satirlar": lines, **totals}
    elif doc["tur"] == "irsaliye":
        lines, _ = compute_lines(doc, stok)
        _draw_irsaliye(c, doc, cari, lines)
        info = {"satirlar": lines}
    else:
        _draw_sozlesme(c, doc, cari)
    c.showPage()
    c.save()
    return info


def _render_png(pdf: Path, png: Path, scale: float = 1.45) -> bool:
    """PDF'in ilk sayfasını gri tonlamalı PNG'ye çevirir (OCR yolunu denemek için). pypdfium2 yoksa False."""
    try:
        import pypdfium2 as pdfium
    except ImportError:
        return False
    pdf_doc = pdfium.PdfDocument(str(pdf))
    try:
        img = pdf_doc[0].render(scale=scale).to_pil().convert("L")
    finally:
        pdf_doc.close()
    img.save(png, optimize=True)
    return True


def generate(out_dir: str | Path) -> dict:
    """Belgeleri `out_dir` içine üretir ve manifest'i döner (manifest.json olarak da yazılır)."""
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    _register_fonts()
    cari, stok = load_erp_refs()
    items = []
    for doc in DOCS:
        c = cari[doc["cari_id"]]
        pdf = out / doc["dosya_adi"]
        info = _render_pdf(pdf, doc, c, stok)
        png_name = None
        if doc.get("goruntu"):
            png_name = doc["dosya_adi"].replace(".pdf", "_tarama.png")
            if not _render_png(pdf, out / png_name):
                png_name = None
        items.append(
            {
                "dosya_adi": doc["dosya_adi"],
                "tur": doc["tur"],
                "belge_no": doc["belge_no"],
                "tarih": doc["tarih"],
                "cari_id": doc["cari_id"],
                "tedarikci_unvan": c["unvan"],
                "tedarikci_vkn": c["vkn"],
                "aciklama": doc["aciklama"],
                "goruntu": png_name,
                # beklenen değerler: yalnız test/değerlendirme için; arayüzde AI sonucu gibi gösterilmez
                "beklenen": info,
            }
        )
    manifest = {
        "uyari": "Bütün belgeler sentetiktir; gerçek şirket veya kişi içermez.",
        "alici": COMPANY,
        "belgeler": items,
    }
    (out / MANIFEST).write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifest


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    if not argv or argv[0] in ("-h", "--help"):
        print("Kullanım: python -m aiplatform.erp.demo_assets <çıktı-klasörü>")
        return 0 if argv else 2
    try:
        m = generate(argv[0])
    except FileNotFoundError as e:
        print(f"Hata: {e}", file=sys.stderr)
        return 1
    total = 0
    for it in m["belgeler"]:
        for name in filter(None, [it["dosya_adi"], it["goruntu"]]):
            size = (Path(argv[0]) / name).stat().st_size
            total += size
            print(f"  {name}: {size / 1024:.0f} KB")
    print(f"{len(m['belgeler'])} belge üretildi, toplam {total / 1024:.0f} KB → {argv[0]}")
    print("Not: belgeler sentetiktir; gerçek şirket veya kişi içermez.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

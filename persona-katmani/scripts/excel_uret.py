"""data/kaynak/*.csv -> data/davranis-etkileri.xlsx

Kullanım: python3 persona-katmani/scripts/excel_uret.py
Sayfalar: Özet · Etkiler · Moderatörler · Parametreler · Kaynaklar · Şema
"""
from __future__ import annotations

import csv
import re
from collections import defaultdict
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.table import Table, TableStyleInfo

KOK = Path(__file__).resolve().parents[1]
KAYNAK = KOK / "data" / "kaynak"
CIKTI = KOK / "data" / "davranis-etkileri.xlsx"

SUTUNLAR = [
    "kayit_id", "alan", "alt_konu", "etki_adi", "etki_tanimi", "yon",
    "etki_buyuklugu_deger", "etki_buyuklugu_olcusu", "guven_araligi", "orneklem_n",
    "populasyon_ulke", "populasyon_yas", "baglam", "yontem",
    "moderator_degisken", "moderator_yonu_ve_buyuklugu", "bireysel_fark_olcegi",
    "persona_parametresi", "parametre_dagilimi_onerisi", "kanit_gucu",
    "yazarlar", "yil", "baslik", "dergi", "doi", "url", "kaynak_dogrulama", "notlar",
]
GENISLIK = {
    "kayit_id": 9, "alan": 16, "alt_konu": 22, "etki_adi": 28, "etki_tanimi": 60, "yon": 9,
    "etki_buyuklugu_deger": 10, "etki_buyuklugu_olcusu": 14, "guven_araligi": 18,
    "orneklem_n": 14, "populasyon_ulke": 18, "populasyon_yas": 16, "baglam": 16, "yontem": 14,
    "moderator_degisken": 20, "moderator_yonu_ve_buyuklugu": 45, "bireysel_fark_olcegi": 20,
    "persona_parametresi": 22, "parametre_dagilimi_onerisi": 30, "kanit_gucu": 8,
    "yazarlar": 30, "yil": 6, "baslik": 50, "dergi": 28, "doi": 28, "url": 40, "kaynak_dogrulama": 14, "notlar": 50,
}
BASLIK_DOLGU = PatternFill("solid", fgColor="1F3A5F")
BASLIK_YAZI = Font(bold=True, color="FFFFFF")


def oku() -> list[dict]:
    satirlar: list[dict] = []
    for yol in sorted(KAYNAK.glob("*.csv")):
        with yol.open(encoding="utf-8", newline="") as f:
            for r in csv.DictReader(f):
                satir = {k: (r.get(k) or "").strip() for k in SUTUNLAR}
                satir["_dosya"] = yol.name
                satirlar.append(satir)
    return satirlar


def sayi(s: str):
    s = s.replace(",", ".").strip()
    try:
        return float(s)
    except ValueError:
        return s or None


def tablo_yaz(ws, basliklar: list[str], satirlar: list[list], ad: str) -> None:
    ws.append(basliklar)
    for c in ws[1]:
        c.fill, c.font = BASLIK_DOLGU, BASLIK_YAZI
        c.alignment = Alignment(wrap_text=True, vertical="top")
    for s in satirlar:
        ws.append(s)
    for i, b in enumerate(basliklar, 1):
        ws.column_dimensions[get_column_letter(i)].width = GENISLIK.get(b, 18)
    for row in ws.iter_rows(min_row=2):
        for c in row:
            c.alignment = Alignment(wrap_text=True, vertical="top")
    if satirlar:
        ref = f"A1:{get_column_letter(len(basliklar))}{len(satirlar) + 1}"
        t = Table(displayName=re.sub(r"\W", "", ad), ref=ref)
        t.tableStyleInfo = TableStyleInfo(name="TableStyleMedium2", showRowStripes=True)
        ws.add_table(t)
    ws.freeze_panes = "B2"


def main() -> None:
    satirlar = oku()
    if not satirlar:
        raise SystemExit("data/kaynak altında CSV yok")
    wb = Workbook()

    # Özet
    ws = wb.active
    ws.title = "Özet"
    alanlar = defaultdict(list)
    for s in satirlar:
        alanlar[s["alan"]].append(s)
    makaleler = {(s["doi"] or s["baslik"]).lower() for s in satirlar if (s["doi"] or s["baslik"])}
    ws.append(["Davranış etkileri kitaplığı — Persona Katmanı dijital ikiz öncülleri"])
    ws["A1"].font = Font(bold=True, size=14)
    ws.append([])
    ws.append(["Toplam bulgu satırı", len(satirlar)])
    ws.append(["Benzersiz makale", len(makaleler)])
    ws.append(["Moderatör (fark) satırı", sum(1 for s in satirlar if s["moderator_degisken"])])
    ws.append([])
    ws.append(["Alan", "Satır", "Makale", "Kanıt gücü ort.", "Dosya"])
    for c in ws[7]:
        c.fill, c.font = BASLIK_DOLGU, BASLIK_YAZI
    for alan, grup in sorted(alanlar.items()):
        guc = [float(s["kanit_gucu"]) for s in grup if s["kanit_gucu"].replace(".", "", 1).isdigit()]
        ws.append([
            alan, len(grup),
            len({(s["doi"] or s["baslik"]).lower() for s in grup}),
            round(sum(guc) / len(guc), 2) if guc else None,
            grup[0]["_dosya"],
        ])
    ws.append([])
    ws.append(["Okuma notu: etki büyüklükleri makalelerin özet/tablolarından ve ikincil kaynaklardan derlendi; 'kaynak_dogrulama' "
               "yalnızca meta verinin doğrulandığını söyler. 'notlar' sütununda 'doğrulanmadı' yazan sayılar prior olarak kullanılmadan önce makaleden kontrol edilmeli."])
    ws.append(["Kanıt gücü: 5 ön tescilli/çok ülkeli meta-analiz · 4 meta-analiz · 3 çok çalışmalı deney veya büyük saha · 2 tek deney · 1 gözlemsel/anket/sektör raporu"])
    ws.column_dimensions["A"].width = 28
    for k in "BCDE":
        ws.column_dimensions[k].width = 16

    # Etkiler
    tablo_yaz(
        wb.create_sheet("Etkiler"), SUTUNLAR,
        [[sayi(s[k]) if k in ("etki_buyuklugu_deger", "kanit_gucu", "yil") else s[k] for k in SUTUNLAR] for s in satirlar],
        "Etkiler",
    )

    # Moderatörler (farklar)
    mod_sutun = ["kayit_id", "alan", "etki_adi", "moderator_degisken", "moderator_yonu_ve_buyuklugu",
                 "bireysel_fark_olcegi", "persona_parametresi", "populasyon_ulke", "kanit_gucu", "yazarlar", "yil", "doi"]
    tablo_yaz(
        wb.create_sheet("Moderatörler"), mod_sutun,
        [[sayi(s[k]) if k in ("kanit_gucu", "yil") else s[k] for k in mod_sutun] for s in satirlar if s["moderator_degisken"]],
        "Moderatorler",
    )

    # Parametreler: persona parametresi başına özet
    param = defaultdict(list)
    for s in satirlar:
        for p in re.split(r"[;,/]\s*", s["persona_parametresi"]):
            p = p.strip()
            if p:
                param[p].append(s)
    psatir = []
    for p, grup in sorted(param.items()):
        guc = [float(s["kanit_gucu"]) for s in grup if s["kanit_gucu"].replace(".", "", 1).isdigit()]
        oneriler = sorted({s["parametre_dagilimi_onerisi"] for s in grup if s["parametre_dagilimi_onerisi"]})
        modler = sorted({s["moderator_degisken"] for s in grup if s["moderator_degisken"]})
        psatir.append([
            p, len(grup), ", ".join(sorted({s["alan"] for s in grup})),
            round(max(guc), 1) if guc else None,
            " | ".join(oneriler)[:900],
            ", ".join(modler)[:400],
            ", ".join(s["kayit_id"] for s in grup),
        ])
    pbas = ["persona_parametresi", "bulgu_sayisi", "alanlar", "en_yuksek_kanit_gucu",
            "prior_onerileri", "moderatorler", "kayitlar"]
    wsP = wb.create_sheet("Parametreler")
    tablo_yaz(wsP, pbas, psatir, "Parametreler")
    for k, w in zip("ABCDEFG", (24, 10, 36, 10, 80, 50, 60)):
        wsP.column_dimensions[k].width = w

    # Kaynaklar
    kaynak = {}
    for s in satirlar:
        anahtar = (s["doi"] or s["baslik"]).lower()
        if anahtar and anahtar not in kaynak:
            kaynak[anahtar] = [s["yazarlar"], sayi(s["yil"]), s["baslik"], s["dergi"], s["doi"], s["url"],
                               s["yontem"], s["kaynak_dogrulama"], 0, ""]
        if anahtar:
            kaynak[anahtar][8] += 1
            kaynak[anahtar][9] = (kaynak[anahtar][9] + " " + s["kayit_id"]).strip()
    kbas = ["yazarlar", "yil", "baslik", "dergi", "doi", "url", "yontem", "kaynak_dogrulama", "bulgu_sayisi", "kayitlar"]
    wsK = wb.create_sheet("Kaynaklar")
    tablo_yaz(wsK, kbas, sorted(kaynak.values(), key=lambda r: (str(r[0]), str(r[1]))), "Kaynaklar")

    # Şema
    wsS = wb.create_sheet("Şema")
    sema = (KOK / "data" / "SEMA.md").read_text(encoding="utf-8")
    for satir in sema.splitlines():
        if satir.startswith("| ") and not satir.startswith("| ---") and not satir.startswith("| Sütun"):
            hucreler = [h.strip() for h in satir.strip("|").split("|")]
            wsS.append(hucreler)
    wsS.column_dimensions["A"].width = 30
    wsS.column_dimensions["B"].width = 120

    CIKTI.parent.mkdir(parents=True, exist_ok=True)
    wb.save(CIKTI)
    print(f"{CIKTI} yazıldı: {len(satirlar)} satır, {len(makaleler)} makale, {len(param)} parametre")


if __name__ == "__main__":
    main()

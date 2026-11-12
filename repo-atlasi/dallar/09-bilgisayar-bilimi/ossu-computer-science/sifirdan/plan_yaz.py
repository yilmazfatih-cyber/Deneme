#!/usr/bin/env python3
"""
Çalışma planı yazıcı: müfredat JSON'u -> topolojik sıra -> haftalık takvim -> Markdown.

Üretilen Markdown'daki "- [ ]" kutuları, coding-interview-university/sifirdan/ilerleme.py
ile sayılabilir: iki araç birbirini içe aktarmaz, ortak dilleri dosya biçimidir.

Kullanım:
    python3 plan_yaz.py veri/turkce-12-ay.json --saat 15 --cikti ornek-plan-12-ay.md
    python3 plan_yaz.py veri/ossu.json --karsilastir 10,15,20
"""

from __future__ import annotations

import argparse
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path

from mufredat import Ders, toplam_saat, topolojik_sira, yukle
from takvim import Plan, haftalik_plan, zorunlu_bitis_haftasi

AYLAR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"]


def saat_metni(saat: float) -> str:
    """
    Türkçe ondalık virgülüyle, en fazla bir basamak.

    >>> saat_metni(7.5), saat_metni(8.0), saat_metni(2.25)
    ('7,5', '8', '2,2')
    """
    yuvarlak = round(saat, 1)
    metin = f"{yuvarlak:.1f}".rstrip("0").rstrip(".")
    return metin.replace(".", ",")


def tarih_metni(gun: date) -> str:
    """
    >>> tarih_metni(date(2027, 2, 1))
    '1 Şubat 2027'
    """
    return f"{gun.day} {AYLAR[gun.month - 1]} {gun.year}"


def md_tablo(basliklar: list[str], satirlar: list[list[str]]) -> list[str]:
    """
    Prettier'ın Markdown tablo biçimiyle aynı çıktı: sütunlar en geniş hücreye göre boşlukla
    doldurulur, ayraç satırı tirelerden oluşur.

    >>> md_tablo(["Ay", "Saat"], [["Ocak", "60"]])
    ['| Ay   | Saat |', '| ---- | ---- |', '| Ocak | 60   |']
    """
    genislikler = [max(3, len(b), *(len(s[i]) for s in satirlar)) for i, b in enumerate(basliklar)]

    def satir(hucreler: list[str]) -> str:
        return "| " + " | ".join(h.ljust(g) for h, g in zip(hucreler, genislikler, strict=True)) + " |"

    return [satir(basliklar), "| " + " | ".join("-" * g for g in genislikler) + " |", *[satir(s) for s in satirlar]]


def kulvar_notu(plan: Plan) -> str:
    adlar = [k for k in plan.kulvarlar if k]
    return f" (kulvarlar: {', '.join(adlar)})" if adlar else ""


def baglanti(ders: Ders) -> str:
    return f"[{ders.ad}]({ders.kaynak})" if ders.kaynak else ders.ad


def plan_metni(baslik: str, dersler: list[Ders], plan: Plan, kaynak_dosya: str) -> str:
    sira = topolojik_sira(dersler)
    kimlikten = {d.kimlik: d for d in dersler}
    ilk_gun = plan.haftalar[0].baslangic
    zorunlu_son = zorunlu_bitis_haftasi(plan, dersler)
    secmeli_saat = toplam_saat(dersler) - toplam_saat(dersler, secmeliler_dahil=False)

    satirlar = [
        f"# {baslik}",
        "",
        f"> Bu dosya `plan_yaz.py` ile `{kaynak_dosya}` verisinden üretildi; elle düzenleme, yeniden üret.",
        f"> Haftalık bütçe {saat_metni(plan.haftalik_saat)} saat · aynı anda en fazla {plan.paralel} ders"
        f"{kulvar_notu(plan)} · başlangıç {tarih_metni(ilk_gun)}.",
        "> İlerlemeyi kutuları işaretleyerek izle ve `coding-interview-university/sifirdan/ilerleme.py` ile say.",
        "",
        "## Özet",
        "",
        f"- Zorunlu: {saat_metni(toplam_saat(dersler, secmeliler_dahil=False))} saat,"
        f" {zorunlu_son}. haftada biter ({tarih_metni(plan.haftalar[zorunlu_son - 1].baslangic)} haftası).",
        f"- Seçmeli: {saat_metni(secmeli_saat)} saat; zorunlulardan sonra başlar,"
        f" plan toplam {plan.hafta_sayisi} hafta sürer.",
        "- Saatler tahmindir; iki hafta üst üste geride kalırsan haftalık saati değil kapsamı küçült.",
        "",
        "## Sıra ve takvim",
        "",
    ]
    kulvarli = any(plan.kulvarlar)
    tablo = []
    # Tabloyu başlama haftasına göre sırala: okuyucu takvimi yukarıdan aşağı izler.
    for numara, ders in enumerate(sorted(sira, key=lambda d: plan.ilk_hafta[d.kimlik]), start=1):
        onkosul = ", ".join(ders.onkosullar) or "-"
        tur = " (seçmeli)" if ders.secmeli else ""
        hucreler = [str(numara), f"`{ders.kimlik}`{tur}", saat_metni(ders.saat), onkosul]
        if kulvarli:
            hucreler.append(ders.kulvar or "-")
        hucreler.append(f"{plan.ilk_hafta[ders.kimlik]}-{plan.son_hafta[ders.kimlik]}")
        tablo.append(hucreler)
    basliklar = ["#", "Ders", "Saat", "Önkoşullar", *(["Kulvar"] if kulvarli else []), "Hafta"]
    satirlar += md_tablo(basliklar, tablo)

    satirlar += ["", "## Aylara göre", ""]
    aylik: dict[tuple[int, int], dict[str, float]] = defaultdict(lambda: defaultdict(float))
    ay_haftalari: dict[tuple[int, int], list[int]] = defaultdict(list)
    for hafta in plan.haftalar:
        anahtar = (hafta.baslangic.year, hafta.baslangic.month)
        ay_haftalari[anahtar].append(hafta.no)
        for kimlik, saat in hafta.dagilim.items():
            aylik[anahtar][kimlik] += saat
    ay_tablosu = []
    for sira_no, (anahtar, dagilim) in enumerate(aylik.items(), start=1):
        haftalar = ay_haftalari[anahtar]
        odak = ", ".join(f"{kimlik} ({saat_metni(saat)})" for kimlik, saat in dagilim.items())
        ay_tablosu.append(
            [str(sira_no), f"{AYLAR[anahtar[1] - 1]} {anahtar[0]}", f"{haftalar[0]}-{haftalar[-1]}", odak]
        )
    satirlar += md_tablo(["Ay", "Takvim", "Hafta", "Odak (saat)"], ay_tablosu)

    satirlar += ["", "## Dersler", ""]
    for ders in sira:
        ek = f" — {ders.aciklama}" if ders.aciklama else ""
        satirlar.append(f"- `{ders.kimlik}`: {baglanti(ders)}{ek}")

    satirlar += ["", "## Haftalık kontrol listesi"]
    for hafta in plan.haftalar:
        satirlar += ["", f"### {hafta.no}. hafta · {tarih_metni(hafta.baslangic)}", ""]
        for kimlik, saat in hafta.dagilim.items():
            biter = " (biter)" if plan.son_hafta[kimlik] == hafta.no else ""
            satirlar.append(f"- [ ] {kimlikten[kimlik].ad} — {saat_metni(saat)} saat{biter}")
    return "\n".join(satirlar) + "\n"


def karsilastirma_metni(dersler: list[Ders], saatler: list[float], paralel: int) -> str:
    sira = topolojik_sira(dersler)
    satirlar = []
    for saat in saatler:
        plan = haftalik_plan(sira, saat, paralel)
        hafta = zorunlu_bitis_haftasi(plan, sira)
        satirlar.append([saat_metni(saat), str(hafta), saat_metni(hafta / 4.345), str(plan.hafta_sayisi)])
    return "\n".join(md_tablo(["Saat/hafta", "Zorunlu biter (hafta)", "Ay", "Seçmeliyle (hafta)"], satirlar)) + "\n"


def main(argv: list[str] | None = None) -> int:
    ayristirici = argparse.ArgumentParser(description="Müfredat JSON'undan haftalık çalışma planı üretir.")
    ayristirici.add_argument("mufredat", type=Path)
    ayristirici.add_argument("--saat", type=float, default=15, help="haftalık çalışma saati")
    ayristirici.add_argument("--paralel", type=int, default=2, help="aynı anda en fazla kaç ders")
    ayristirici.add_argument("--baslangic", type=date.fromisoformat, default=date(2027, 1, 4))
    ayristirici.add_argument("--cikti", type=Path, help="Markdown dosyası (verilmezse ekrana)")
    ayristirici.add_argument("--karsilastir", help="virgüllü haftalık saatler, ör. 10,15,20")
    secenekler = ayristirici.parse_args(argv)

    baslik, dersler = yukle(secenekler.mufredat)
    if secenekler.karsilastir:
        saatler = [float(s) for s in secenekler.karsilastir.split(",")]
        print(karsilastirma_metni(dersler, saatler, secenekler.paralel), end="")
        return 0
    plan = haftalik_plan(topolojik_sira(dersler), secenekler.saat, secenekler.paralel, baslangic=secenekler.baslangic)
    metin = plan_metni(baslik, dersler, plan, secenekler.mufredat.name)
    if secenekler.cikti:
        secenekler.cikti.write_text(metin, encoding="utf-8")
        print(f"{secenekler.cikti} yazıldı: {plan.hafta_sayisi} hafta")
    else:
        print(metin, end="")
    return 0


if __name__ == "__main__":
    sys.exit(main())

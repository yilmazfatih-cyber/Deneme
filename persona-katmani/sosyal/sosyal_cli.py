#!/usr/bin/env python3
"""Persona Katmanı · Kaynak C (sosyal medya) komut satırı.

Kullanım (depo kökünden):
  python3 -I persona-katmani/sosyal/sosyal_cli.py cek PLATFORM KIRACI [--baslangic G] [--bitis G] [--kuru] [--kampanya ID]
        PLATFORM: meta (Facebook+Instagram) | tiktok | x. --kuru: ağ yok, tohumlu sahte 60 günlük veri.
  python3 -I persona-katmani/sosyal/sosyal_cli.py csv-ice PLATFORM KIRACI dosya.csv [--kampanya ID] [--tarih G]
  python3 -I persona-katmani/sosyal/sosyal_cli.py reklam-oncul KIRACI [--surum S]          # C1
  python3 -I persona-katmani/sosyal/sosyal_cli.py kalibrasyon KIRACI                       # C2
  python3 -I persona-katmani/sosyal/sosyal_cli.py kor-tahmin-ekle KOSU_ID KAMPANYA_ID '<json>'
  python3 -I persona-katmani/sosyal/sosyal_cli.py sosyal-sinyal KIRACI [--cikti dosya.json] # C3
  python3 -I persona-katmani/sosyal/sosyal_cli.py disa-aktar-sim [KIRACI] [--hedef yol]
  python3 -I persona-katmani/sosyal/sosyal_cli.py ozet [KIRACI]
DB: PK_DB ortam değişkeni (varsayılan persona-katmani/db/persona.sqlite). Tokenlar yalnız ortam değişkeninden okunur.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import date, timedelta
from pathlib import Path

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    __package__ = "sosyal"  # noqa: A001

from sosyal import csv_ice, ogren  # noqa: E402
from sosyal.baglayici import Baglayici, BaglayiciHatasi  # noqa: E402
from sosyal.meta import MetaBaglayici  # noqa: E402
from sosyal.ortak import baglan, denetim, kaydet_duygu, kaydet_hesap, kaydet_icerik, kaydet_konu_hacmi, kaydet_metrikler, kiraci_hazirla  # noqa: E402
from sosyal.tiktok import TikTokBaglayici  # noqa: E402
from sosyal.x import XBaglayici  # noqa: E402

BAGLAYICILAR = {"meta": MetaBaglayici, "tiktok": TikTokBaglayici, "x": XBaglayici}
VARSAYILAN_GUN = 60


def baglayici_al(platform: str, kuru: bool, kiraci: str = "demo") -> Baglayici:
    if platform not in BAGLAYICILAR:
        raise SystemExit(f"platform: {' | '.join(BAGLAYICILAR)}")
    return BAGLAYICILAR[platform](kuru=kuru, kiraci=kiraci)


def cek(platform: str, kiraci: str, baslangic: str | None = None, bitis: str | None = None, kuru: bool = False,
        kampanya: str | None = None, sessiz: bool = False) -> dict:
    """Hesap, içerik, metrik, duygu özeti ve konu hacmini çekip yazar. Kuru modda reklamlar kiracının gerçek kampanyasına bağlanır."""
    bitis = bitis or date.today().isoformat()
    baslangic = baslangic or (date.fromisoformat(bitis) - timedelta(days=VARSAYILAN_GUN - 1)).isoformat()
    try:
        b = baglayici_al(platform, kuru, kiraci)
    except BaglayiciHatasi as e:
        raise SystemExit(str(e))
    c = baglan()
    kiraci_hazirla(c, kiraci)
    if kuru and not kampanya:
        r = c.execute("SELECT id FROM kampanya WHERE kiraci_id=? AND gercek_mi=1 ORDER BY id LIMIT 1", (kiraci,)).fetchone()
        kampanya = r[0] if r else None
    sayac = {"hesap": 0, "icerik": 0, "metrik": 0, "duygu": 0, "konu_hacmi": 0}
    try:
        for h in b.hesaplar():
            kaydet_hesap(c, kiraci, h, date.today().isoformat())
            sayac["hesap"] += 1
        icerikler = b.icerikler(baslangic, bitis)
        for ic in icerikler:
            if kampanya and ic.tur == "reklam" and not ic.kampanya_id:
                ic.kampanya_id = kampanya
            kaydet_icerik(c, kiraci, ic)
            sayac["icerik"] += 1
            sayac["metrik"] += kaydet_metrikler(c, b.metrikler(ic.id, baslangic, bitis))
            sayac["duygu"] += kaydet_duygu(c, b.yorum_ozeti(ic.id))
        for konu in sorted({ic.konu for ic in icerikler if ic.konu}):
            sayac["konu_hacmi"] += kaydet_konu_hacmi(c, b.konu_hacmi(konu, baslangic, bitis))
    except BaglayiciHatasi as e:
        c.rollback()
        denetim(c, "yukle", f"sosyal:{platform}:{kiraci}", {"hata": str(e)[:300], "kuru": kuru})
        c.commit()
        c.close()
        raise SystemExit(f"çekim başarısız: {e}")
    denetim(c, "yukle", f"sosyal:{platform}:{kiraci}", {**sayac, "baslangic": baslangic, "bitis": bitis, "kuru": kuru, "kampanya": kampanya})
    c.commit()
    c.close()
    if not sessiz:
        print(f"{platform}{' (kuru)' if kuru else ''} → {kiraci} [{baslangic} … {bitis}]: "
              + ", ".join(f"{k} {v}" for k, v in sayac.items()))
    return sayac


def csv_yukle(platform: str, kiraci: str, dosya: str, kampanya: str | None = None, tarih: str | None = None, sessiz: bool = False) -> dict:
    icerikler, metrikler, rapor = csv_ice.dosya_oku(platform, dosya, varsayilan_tarih=tarih, kampanya_id=kampanya)
    c = baglan()
    kiraci_hazirla(c, kiraci)
    for ic in icerikler:
        kaydet_icerik(c, kiraci, ic)
    kaydet_metrikler(c, metrikler)
    denetim(c, "yukle", f"sosyal:csv:{platform}:{kiraci}", {**rapor, "dosya": Path(dosya).name})
    c.commit()
    c.close()
    if not sessiz:
        print(f"{Path(dosya).name}: {rapor['icerik']} içerik, {rapor['satir']} metrik satırı, {rapor['atlanan']} satır atlandı; "
              f"tanınan: {', '.join(rapor['taninan'])}" + (f"; yok sayılan: {', '.join(rapor['yok_sayilan'])}" if rapor["yok_sayilan"] else ""))
    return rapor


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(prog="sosyal_cli", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    alt = ap.add_subparsers(dest="komut", required=True)
    a = alt.add_parser("cek")
    a.add_argument("platform"); a.add_argument("kiraci")
    a.add_argument("--baslangic"); a.add_argument("--bitis"); a.add_argument("--kuru", action="store_true"); a.add_argument("--kampanya")
    a = alt.add_parser("csv-ice")
    a.add_argument("platform"); a.add_argument("kiraci"); a.add_argument("dosya"); a.add_argument("--kampanya"); a.add_argument("--tarih")
    a = alt.add_parser("reklam-oncul"); a.add_argument("kiraci"); a.add_argument("--surum")
    a = alt.add_parser("kalibrasyon"); a.add_argument("kiraci")
    a = alt.add_parser("kor-tahmin-ekle"); a.add_argument("kosu_id"); a.add_argument("kampanya_id"); a.add_argument("tahmin"); a.add_argument("--karar-turu")
    a = alt.add_parser("sosyal-sinyal"); a.add_argument("kiraci"); a.add_argument("--surum"); a.add_argument("--cikti")
    a = alt.add_parser("disa-aktar-sim"); a.add_argument("kiraci", nargs="?"); a.add_argument("--hedef")
    a = alt.add_parser("ozet"); a.add_argument("kiraci", nargs="?")
    g = ap.parse_args(argv)

    if g.komut == "cek":
        cek(g.platform, g.kiraci, g.baslangic, g.bitis, g.kuru, g.kampanya)
    elif g.komut == "csv-ice":
        csv_yukle(g.platform, g.kiraci, g.dosya, g.kampanya, g.tarih)
    elif g.komut == "reklam-oncul":
        ogren.reklam_oncul(baglan(), g.kiraci, g.surum)
    elif g.komut == "kalibrasyon":
        ogren.kalibrasyon(baglan(), g.kiraci)
    elif g.komut == "kor-tahmin-ekle":
        ogren.kor_tahmin_ekle(baglan(), g.kosu_id, g.kampanya_id, g.tahmin, g.karar_turu)
    elif g.komut == "sosyal-sinyal":
        sonuc = ogren.sosyal_sinyal(baglan(), g.kiraci, g.surum, sessiz=bool(g.cikti))
        if g.cikti:
            Path(g.cikti).write_text(json.dumps(sonuc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            print(f"{g.cikti} yazıldı ({len(sonuc['konular'])} konu)")
    elif g.komut == "disa-aktar-sim":
        ogren.disa_aktar_sim(baglan(), g.kiraci, Path(g.hedef) if g.hedef else None)
    elif g.komut == "ozet":
        c = baglan()
        ogren.ozet(c, g.kiraci)
        denetim(c, "rapor", "sosyal:ozet", {"kiraci": g.kiraci})
        c.commit()


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Persona Katmanı · Kaynak C kamu verisi (ADR-010). Kaydırma botu yoktur; yalnız resmî API ve toplu veri.

Kullanım (depo kökünden):
  python3 -I persona-katmani/sosyal/kamu/kamu_cli.py sorgu-yukle KIRACI dosya.json        # marka, rakip, kategori sorguları
  python3 -I persona-katmani/sosyal/kamu/kamu_cli.py adlib KIRACI [--ulkeler DE,NL,AT] [--gun 120] [--kuru]
  python3 -I persona-katmani/sosyal/kamu/kamu_cli.py adlib-elle KIRACI dosya.csv          # Türkiye: Reklam Kütüphanesi sitesinde gözlenenler
  python3 -I persona-katmani/sosyal/kamu/kamu_cli.py x-sayim KIRACI [--gun 7] [--butce-usd 1] [--kuru]
  python3 -I persona-katmani/sosyal/kamu/kamu_cli.py x-ornek KIRACI [--n 100] [--butce-usd 5] [--kategoriler] [--kuru]
  python3 -I persona-katmani/sosyal/kamu/kamu_cli.py ilgi KIRACI | duygu KIRACI | yaratici KIRACI
  python3 -I persona-katmani/sosyal/kamu/kamu_cli.py disa-aktar-sim KIRACI [--hedef yol]
  python3 -I persona-katmani/sosyal/kamu/kamu_cli.py hepsi KIRACI --kuru                  # demo: tüm zincir sahte veriyle
Tokenlar: META_ADLIB_TOKEN (veya META_ACCESS_TOKEN), X_BEARER_TOKEN. DB: PK_DB.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import date, timedelta
from pathlib import Path

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from sosyal.baglayici import BaglayiciHatasi  # noqa: E402
from sosyal.kamu import meta_adlib, ogren_kamu  # noqa: E402
from sosyal.kamu.x_kamu import Butce, ButceAsildi, XKamu  # noqa: E402
from sosyal.ortak import KonuHacmi, baglan, denetim, kaydet_konu_hacmi, kiraci_hazirla  # noqa: E402


def sorgu_yukle(c, kiraci: str, dosya: str) -> int:
    d = json.loads(Path(dosya).read_text(encoding="utf-8"))
    satirlar = [("marka", "marka", d["marka"])] if d.get("marka") else []
    satirlar += [(f"rakip:{ad}", "rakip", q) for ad, q in (d.get("rakipler") or {}).items()]
    satirlar += [(f"kategori:{ad}", "kategori", q) for ad, q in (d.get("kategoriler") or {}).items()]
    kiraci_hazirla(c, kiraci)
    for etiket, tur, q in satirlar:
        c.execute("""INSERT INTO kamu_sorgu(id,kiraci_id,etiket,tur,sorgu) VALUES (?,?,?,?,?)
                     ON CONFLICT(id) DO UPDATE SET sorgu=excluded.sorgu, tur=excluded.tur, aktif=1""", (f"{kiraci}:{etiket}", kiraci, etiket, tur, q))
    ayar = d.get("reklam_kutuphanesi") or {}
    c.execute("INSERT OR REPLACE INTO kamu_sorgu(id,kiraci_id,etiket,tur,sorgu,aktif) VALUES (?,?,?,?,?,0)",
              (f"{kiraci}:_adlib", kiraci, "_adlib", "ayar", json.dumps(ayar, ensure_ascii=False)))
    return len(satirlar)


def _adlib_ayar(c, kiraci: str) -> dict:
    r = c.execute("SELECT sorgu FROM kamu_sorgu WHERE id=?", (f"{kiraci}:_adlib",)).fetchone()
    return json.loads(r[0]) if r else {}


def adlib(c, kiraci: str, ulkeler: tuple[str, ...] | None, gun: int, kuru: bool) -> int:
    ayar = _adlib_ayar(c, kiraci)
    ulk = ulkeler or tuple(ayar.get("ulkeler") or meta_adlib.VARSAYILAN_ULKELER)
    rk = meta_adlib.ReklamKutuphanesi(kuru=kuru)
    bas = (date.today() - timedelta(days=gun)).isoformat()
    isler = [("marka", ayar.get("marka_arama"))] + [("rakip", q) for q in (ayar.get("rakip_arama") or {}).values()]
    toplam = 0
    for rol, arama in isler:
        if not arama:
            continue
        reklamlar, uyari = rk.ara(rol=rol, arama=arama, ulkeler=ulk, baslangic=bas)
        for u in uyari:
            print("uyarı:", u)
        toplam += meta_adlib.kaydet(c, kiraci, reklamlar)
        print(f"{rol:6s} {arama}: {len(reklamlar)} reklam")
    denetim(c, "yukle", f"kamu:adlib:{kiraci}", {"reklam": toplam, "ulkeler": list(ulk), "kuru": kuru})
    return toplam


def x_sayim(c, kiraci: str, gun: int, butce_usd: float, kuru: bool) -> Butce:
    b = Butce(butce_usd)
    x = XKamu(b, kuru=kuru)
    for sid, etiket, _ in c.execute("SELECT id, etiket, tur FROM kamu_sorgu WHERE kiraci_id=? AND aktif=1", (kiraci,)).fetchall():
        sorgu = c.execute("SELECT sorgu FROM kamu_sorgu WHERE id=?", (sid,)).fetchone()[0]
        try:
            seri = x.sayim(sorgu, gun)
        except ButceAsildi as e:
            print("durdu:", e)
            break
        kaydet_konu_hacmi(c, [KonuHacmi(platform="x", konu=sid, tarih=t, hacim=h, kaynak="kuru" if kuru else "api") for t, h in seri])
        print(f"{etiket:28s} {len(seri)} gün, son gün {seri[-1][1] if seri else 0}")
    denetim(c, "yukle", f"kamu:x-sayim:{kiraci}", {"sayim_istegi": b.sayim, "usd": round(b.harcanan_usd, 4), "kuru": kuru})
    return b


def x_ornek(c, kiraci: str, n: int, butce_usd: float, kategoriler: bool, kuru: bool) -> Butce:
    b = Butce(butce_usd)
    turler = ("marka", "rakip", "kategori") if kategoriler else ("marka", "rakip")
    kayitlar = c.execute(f"SELECT id, etiket, sorgu FROM kamu_sorgu WHERE kiraci_id=? AND aktif=1 AND tur IN ({','.join('?' * len(turler))})",
                         (kiraci, *turler)).fetchall()
    haftalar = range(4) if kuru else range(1)  # kuru modda 4 haftalık geçmiş
    for sid, etiket, sorgu in kayitlar:
        for h in haftalar:
            x = XKamu(b, kuru=kuru, tohum=7 + h, bugun=date.today() - timedelta(days=7 * h))
            try:
                d = x.orneklem(sorgu, n)
            except ButceAsildi as e:
                print("durdu:", e)
                return b
            if not d:
                continue
            c.execute("""INSERT INTO kamu_duygu(sorgu_id,platform,tarih,ornek_n,olumlu,notr,olumsuz,one_cikan_konular,ort_etkilesim,yontem)
                         VALUES (?,?,?,?,?,?,?,?,?,'sozluk') ON CONFLICT(sorgu_id,platform,tarih) DO UPDATE SET ornek_n=excluded.ornek_n,
                         olumlu=excluded.olumlu, notr=excluded.notr, olumsuz=excluded.olumsuz, one_cikan_konular=excluded.one_cikan_konular,
                         ort_etkilesim=excluded.ort_etkilesim""",
                      (sid, "x", d.tarih, d.n, d.olumlu, d.notr, d.olumsuz, json.dumps(d.konular, ensure_ascii=False), d.ort_etkilesim))
        print(f"{etiket:28s} örneklem tamam")
    denetim(c, "yukle", f"kamu:x-ornek:{kiraci}", {"okuma": b.okuma, "usd": round(b.harcanan_usd, 4), "kuru": kuru})
    return b


def _yaz(veri) -> None:
    print(json.dumps(veri, ensure_ascii=False, indent=1))


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="kamu_cli", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    alt = ap.add_subparsers(dest="komut", required=True)
    s = alt.add_parser("sorgu-yukle"); s.add_argument("kiraci"); s.add_argument("dosya")
    s = alt.add_parser("adlib"); s.add_argument("kiraci"); s.add_argument("--ulkeler"); s.add_argument("--gun", type=int, default=120); s.add_argument("--kuru", action="store_true")
    s = alt.add_parser("adlib-elle"); s.add_argument("kiraci"); s.add_argument("dosya")
    s = alt.add_parser("x-sayim"); s.add_argument("kiraci"); s.add_argument("--gun", type=int); s.add_argument("--butce-usd", type=float, default=1.0); s.add_argument("--kuru", action="store_true")
    s = alt.add_parser("x-ornek"); s.add_argument("kiraci"); s.add_argument("--n", type=int, default=100); s.add_argument("--butce-usd", type=float, default=5.0)
    s.add_argument("--kategoriler", action="store_true"); s.add_argument("--kuru", action="store_true")
    for k in ("ilgi", "duygu", "yaratici"):
        s = alt.add_parser(k); s.add_argument("kiraci")
    s = alt.add_parser("disa-aktar-sim"); s.add_argument("kiraci"); s.add_argument("--hedef")
    s = alt.add_parser("hepsi"); s.add_argument("kiraci"); s.add_argument("--kuru", action="store_true", required=True)
    a = ap.parse_args(argv)
    c = baglan()
    try:
        if a.komut == "sorgu-yukle":
            print(f"{sorgu_yukle(c, a.kiraci, a.dosya)} sorgu yüklendi")
        elif a.komut == "adlib":
            adlib(c, a.kiraci, tuple(a.ulkeler.split(",")) if a.ulkeler else None, a.gun, a.kuru)
        elif a.komut == "adlib-elle":
            kayit, hata = meta_adlib.elle_ice(a.dosya)
            kiraci_hazirla(c, a.kiraci)
            meta_adlib.kaydet(c, a.kiraci, kayit)
            denetim(c, "yukle", f"kamu:adlib-elle:{a.kiraci}", {"reklam": len(kayit), "hatali": hata})
            print(f"{len(kayit)} reklam yüklendi, {hata} hatalı satır atlandı")
        elif a.komut == "x-sayim":
            b = x_sayim(c, a.kiraci, a.gun or (60 if a.kuru else 7), a.butce_usd, a.kuru)
            print(f"maliyet tahmini: {b.harcanan_usd:.3f} USD ({b.sayim} sayım isteği)" + (" · kuru: ücret yok" if a.kuru else ""))
        elif a.komut == "x-ornek":
            b = x_ornek(c, a.kiraci, a.n, a.butce_usd, a.kategoriler, a.kuru)
            print(f"maliyet tahmini: {b.harcanan_usd:.3f} USD ({b.okuma} okuma)" + (" · kuru: ücret yok" if a.kuru else ""))
        elif a.komut == "ilgi":
            _yaz(ogren_kamu.ilgi_endeksi(c, a.kiraci))
        elif a.komut == "duygu":
            _yaz(ogren_kamu.marka_duygu(c, a.kiraci))
        elif a.komut == "yaratici":
            _yaz(ogren_kamu.rakip_yaratici(c, a.kiraci))
        elif a.komut == "disa-aktar-sim":
            v = ogren_kamu.disa_aktar_sim(c, a.kiraci, Path(a.hedef) if a.hedef else None)
            print(f"kamu.json yazıldı (kuru veri: {v['kuruVeri']}, güven: {v['guven']})")
        elif a.komut == "hepsi":
            ornek = Path(__file__).with_name("sorgular.ornek.json")
            d = json.loads(ornek.read_text(encoding="utf-8"))
            if d.get("kiraci") != a.kiraci:
                d["kiraci"] = a.kiraci
            gecici = Path(__file__).with_name(".sorgular.tmp.json")
            gecici.write_text(json.dumps(d, ensure_ascii=False), encoding="utf-8")
            print(f"{sorgu_yukle(c, a.kiraci, str(gecici))} sorgu"); gecici.unlink()
            adlib(c, a.kiraci, None, 120, True)
            kayit, _ = meta_adlib.elle_ice(str(Path(__file__).with_name("rakip_reklam_elle.ornek.csv")))
            meta_adlib.kaydet(c, a.kiraci, kayit)
            x_sayim(c, a.kiraci, 60, 1.0, True)
            x_ornek(c, a.kiraci, 100, 5.0, False, True)
            v = ogren_kamu.disa_aktar_sim(c, a.kiraci)
            print(f"kamu.json yazıldı (kuru veri: {v['kuruVeri']})")
        c.commit()
    except (BaglayiciHatasi, ButceAsildi) as e:
        print("hata:", e, file=sys.stderr)
        c.commit()
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())

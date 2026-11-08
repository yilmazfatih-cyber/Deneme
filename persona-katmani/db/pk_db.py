#!/usr/bin/env python3
"""Persona Katmanı veritabanı aracı.

Kullanım (depo kökünden):
  python3 -I persona-katmani/db/pk_db.py kur                       # şemayı kurar (varsayılan: persona-katmani/db/persona.sqlite)
  python3 -I persona-katmani/db/pk_db.py yukle-temel                # parametre, segment, S0/S1 öncülleri, literatür bulguları
  python3 -I persona-katmani/db/pk_db.py ornek                      # demo kiracı: 3 mağaza, 1 site, 2.500 müşteri, 12.000 fiş, kamera sayımları, web olayları
  python3 -I persona-katmani/db/pk_db.py yukle-pos  KIRACI MAGAZA dosya.csv   # sütunlar: musteri_id,magaza_id,tarih,tutar,urun_sayisi,kampanya
  python3 -I persona-katmani/db/pk_db.py yukle-kamera MAGAZA dosya.csv        # sütunlar: bolge_id,bolge_ad,dilim_baslangic,kisi_sayisi,ort_bekleme_sn
  python3 -I persona-katmani/db/pk_db.py kaynak-b KIRACI [MAGAZA]   # fişlerden Kaynak B (bütçe) kestirimi + S1 ile fark raporu
  python3 -I persona-katmani/db/pk_db.py yukle-kosu kosu.json       # persona-sim'den dışa aktarılan koşu (olaylar, KPI, hedefleme raporu)
  python3 -I persona-katmani/db/pk_db.py ozet
Ortam değişkeni PK_DB ile dosya yolu değiştirilebilir. PostgreSQL için schema.sql aynen kullanılır (PRAGMA satırı hariç).
"""
from __future__ import annotations

import csv
import hashlib
import json
import math
import os
import random
import sqlite3
import statistics
import sys
from datetime import datetime, timedelta
from pathlib import Path

KOK = Path(__file__).resolve().parent
PROJE = KOK.parent
DB_YOLU = Path(os.environ.get("PK_DB", KOK / "persona.sqlite"))
SURUM = "2026-11-08"


def baglan() -> sqlite3.Connection:
    c = sqlite3.connect(DB_YOLU)
    c.execute("PRAGMA foreign_keys = ON")
    c.row_factory = sqlite3.Row
    return c


def denetim(c: sqlite3.Connection, eylem: str, nesne: str, ayrinti: dict | None = None) -> None:
    c.execute("INSERT INTO denetim_kaydi(kim, eylem, nesne, ayrinti) VALUES (?,?,?,?)",
              (os.environ.get("USER", "pk_db"), eylem, nesne, json.dumps(ayrinti or {}, ensure_ascii=False)))


# ───────────────────────── kur / temel ─────────────────────────
def kur() -> None:
    c = baglan()
    c.executescript((KOK / "schema.sql").read_text(encoding="utf-8"))
    c.commit()
    n = c.execute("SELECT count(*) FROM sqlite_master WHERE type='table'").fetchone()[0]
    print(f"{DB_YOLU}: {n} tablo hazır")


def yukle_temel() -> None:
    c = baglan()
    meta = json.loads((KOK / "oncul_s0_s1.json").read_text(encoding="utf-8"))
    for ad, p in meta["parametreler"].items():
        tip, merkez, yayilim, mn, mx = p["S0"]
        c.execute("INSERT OR REPLACE INTO parametre(ad, aciklama, olcek, min, max) VALUES (?,?,?,?,?)", (ad, p["aciklama"], p["olcek"], mn, mx))
        c.execute("DELETE FROM oncul WHERE parametre=? AND seviye IN ('S0','S1') AND surum=?", (ad, meta["surum"]))
        c.execute("INSERT INTO oncul(seviye,kapsam_turu,kapsam_id,parametre,dagilim_tipi,merkez,yayilim,min,max,etiket,kaynaklar,surum) VALUES ('S0','dunya',NULL,?,?,?,?,?,?,'yerel',?,?)",
                  (ad, tip, merkez, yayilim, mn, mx, json.dumps([p["kaynak"]], ensure_ascii=False), meta["surum"]))
        m1 = merkez
        etiket = "miras"
        if "S1_carpan" in p:
            m1 = merkez * p["S1_carpan"]; etiket = "kismen_yerel"
        if "S1_toplam" in p:
            m1 = m1 + p["S1_toplam"]; etiket = "kismen_yerel"
        c.execute("INSERT INTO oncul(seviye,kapsam_turu,kapsam_id,parametre,dagilim_tipi,merkez,yayilim,min,max,etiket,kaynaklar,surum) VALUES ('S1','ulke','TR',?,?,?,?,?,?,?,?,?)",
                  (ad, tip, m1, yayilim, mn, mx, etiket, json.dumps([p["kaynak"]], ensure_ascii=False), meta["surum"]))
    for s in meta["segmentler"]:
        c.execute("INSERT OR REPLACE INTO segment(id,ad,yas,gelir,cinsiyet,pay,renk) VALUES (?,?,?,?,?,?,?)",
                  (s["id"], s["ad"], s["yas"], s["gelir"], s["cinsiyet"], s["pay"], s["renk"]))
    # literatür
    n = 0
    sutunlar = ["kayit_id", "alan", "alt_konu", "etki_adi", "etki_tanimi", "yon", "etki_buyuklugu_deger", "etki_buyuklugu_olcusu", "guven_araligi",
                "orneklem_n", "populasyon_ulke", "populasyon_yas", "baglam", "yontem", "moderator_degisken", "moderator_yonu_ve_buyuklugu",
                "bireysel_fark_olcegi", "persona_parametresi", "parametre_dagilimi_onerisi", "kanit_gucu", "yazarlar", "yil", "baslik", "dergi",
                "doi", "url", "kaynak_dogrulama", "notlar"]
    for yol in sorted((PROJE / "data" / "kaynak").glob("*.csv")):
        with yol.open(encoding="utf-8", newline="") as f:
            for r in csv.DictReader(f):
                ulke = (r.get("populasyon_ulke") or "").lower()
                seviye = "S1" if ("türkiye" in ulke or "turkey" in ulke) and not any(k in ulke for k in ("ülke", "countr", "global")) else "S0"
                degerler = [r.get(k) or None for k in sutunlar]
                for i, k in enumerate(sutunlar):
                    if k in ("etki_buyuklugu_deger",) and degerler[i] is not None:
                        try: degerler[i] = float(str(degerler[i]).replace(",", "."))
                        except ValueError: degerler[i] = None
                    if k in ("kanit_gucu", "yil") and degerler[i] is not None:
                        try: degerler[i] = int(float(degerler[i]))
                        except ValueError: degerler[i] = None
                c.execute(f"INSERT OR REPLACE INTO literatur_bulgu(seviye,{','.join(sutunlar)}) VALUES ({','.join(['?']*(len(sutunlar)+1))})", [seviye, *degerler])
                n += 1
    denetim(c, "yukle", "temel", {"literatur_satiri": n})
    c.commit()
    print(f"parametre {len(meta['parametreler'])}, segment {len(meta['segmentler'])}, öncül S0+S1 {2*len(meta['parametreler'])}, literatür {n}")


# ───────────────────────── yükleme ─────────────────────────
def _tarih(s: str) -> str:
    s = s.strip()
    for bicim in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d", "%d.%m.%Y %H:%M", "%d.%m.%Y", "%d/%m/%Y"):
        try: return datetime.strptime(s, bicim).isoformat(timespec="seconds")
        except ValueError: pass
    raise ValueError(f"tarih çözülemedi: {s}")


def _sayi(s: str | None) -> float | None:
    if s is None or s.strip() == "": return None
    return float(s.strip().replace(".", "").replace(",", ".")) if ("," in s and "." in s) else float(s.strip().replace(",", "."))


def yukle_pos(kiraci: str, magaza: str, dosya: str) -> None:
    c = baglan()
    if not c.execute("SELECT 1 FROM magaza WHERE id=? AND kiraci_id=?", (magaza, kiraci)).fetchone():
        c.execute("INSERT OR IGNORE INTO kiraci(id, ad) VALUES (?,?)", (kiraci, kiraci))
        c.execute("INSERT INTO magaza(id, kiraci_id, ad) VALUES (?,?,?)", (magaza, kiraci, magaza))
    n = hata = 0
    with open(dosya, encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            try:
                mid = (r.get("musteri_id") or "").strip() or None
                if mid:
                    c.execute("INSERT OR IGNORE INTO musteri(id, kiraci_id) VALUES (?,?)", (mid, kiraci))
                tutar = _sayi(r.get("tutar"))
                if tutar is None: raise ValueError("tutar yok")
                kamp = (r.get("kampanya") or "").strip().lower() in ("1", "true", "evet", "e")
                kamp_id = None
                if kamp:
                    kamp_id = f"{kiraci}:gercek"
                    c.execute("INSERT OR IGNORE INTO kampanya(id, kiraci_id, ad, gercek_mi) VALUES (?,?,?,1)", (kamp_id, kiraci, "gerçek kampanya günleri"))
                c.execute("INSERT INTO pos_islem(magaza_id, musteri_id, zaman, tutar_tl, urun_sayisi, kampanya_id) VALUES (?,?,?,?,?,?)",
                          ((r.get("magaza_id") or magaza).strip(), mid, _tarih(r["tarih"]), tutar, int(_sayi(r.get("urun_sayisi")) or 0) or None, kamp_id))
                n += 1
            except Exception:
                hata += 1
    denetim(c, "yukle", f"pos:{magaza}", {"satir": n, "hatali": hata, "dosya": os.path.basename(dosya)})
    c.commit()
    print(f"{n} fiş yüklendi, {hata} hatalı satır atlandı")


def yukle_kamera(magaza: str, dosya: str) -> None:
    c = baglan()
    n = 0
    with open(dosya, encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            bid = f"{magaza}:{r['bolge_id'].strip()}"
            c.execute("INSERT OR IGNORE INTO kamera_bolge(id, magaza_id, ad) VALUES (?,?,?)", (bid, magaza, (r.get("bolge_ad") or r["bolge_id"]).strip()))
            c.execute("INSERT OR REPLACE INTO kamera_sayim(bolge_id, dilim_baslangic, kisi_sayisi, ort_bekleme_sn) VALUES (?,?,?,?)",
                      (bid, _tarih(r["dilim_baslangic"]), int(float(r["kisi_sayisi"])), _sayi(r.get("ort_bekleme_sn"))))
            n += 1
    denetim(c, "yukle", f"kamera:{magaza}", {"satir": n})
    c.commit()
    print(f"{n} kamera sayımı yüklendi (yalnız toplu)")


def yukle_kosu(dosya: str) -> None:
    """persona-sim 'Koşuyu dışa aktar' JSON'u: {kosu:{...}, olaylar:[...], kpi:{...}, hedefleme:[...]}"""
    c = baglan()
    d = json.loads(Path(dosya).read_text(encoding="utf-8"))
    k = d["kosu"]
    c.execute("INSERT OR REPLACE INTO simulasyon_kosusu(id,kiraci_id,ortam,magaza_id,site_id,kampanya_id,parametre_kaynagi,seviye,seed,musteri_sayisi,sure_sn,yapilandirma,surum_demeti,bitis) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))",
              (k["id"], k.get("kiraci_id"), k["ortam"], k.get("magaza_id"), k.get("site_id"), k.get("kampanya_id"), k.get("parametre_kaynagi", "A"), k.get("seviye"),
               k["seed"], k["musteri_sayisi"], k["sure_sn"], json.dumps(k.get("yapilandirma", {}), ensure_ascii=False), json.dumps(k.get("surum_demeti", {}), ensure_ascii=False)))
    c.execute("DELETE FROM sim_olay WHERE kosu_id=?", (k["id"],))
    c.executemany("INSERT INTO sim_olay(kosu_id,t,ortam,sim_musteri,segment_id,tur,veri) VALUES (?,?,?,?,?,?,?)",
                  [(k["id"], o["t"], o["ortam"], o["musteriId"], o.get("segmentId"), o["tur"], json.dumps(o.get("veri"), ensure_ascii=False) if o.get("veri") is not None else None) for o in d.get("olaylar", [])])
    c.executemany("INSERT OR REPLACE INTO sim_kpi(kosu_id, ad, deger) VALUES (?,?,?)", [(k["id"], ad, float(v)) for ad, v in d.get("kpi", {}).items() if isinstance(v, (int, float))])
    for h in d.get("hedefleme", []):
        c.execute("INSERT INTO hedefleme_raporu(kosu_id,kampanya_id,segment_id,maruz_kalan,kontrol,tiklama_orani,donusum_maruz,donusum_kontrol,artis_puan,ga_alt,ga_ust,artan_donusum_maliyeti_tl,rahatsizlik_orani,guven,oneri) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                  (k["id"], k.get("kampanya_id"), h["segmentId"], h["maruzKalan"], h["kontrol"], h.get("tiklamaOrani"), h.get("donusumMaruz"), h.get("donusumKontrol"),
                   h.get("artisPuan"), (h.get("artisGuvenAraligi") or [None, None])[0], (h.get("artisGuvenAraligi") or [None, None])[1], h.get("artanDonusumBasinaMaliyetTL"),
                   h.get("rahatsizlikOrani"), h.get("guven", "dusuk"), h.get("oneri", "dene")))
    denetim(c, "kosu", k["id"], {"olay": len(d.get("olaylar", [])), "hedefleme": len(d.get("hedefleme", []))})
    c.commit()
    print(f"koşu {k['id']}: {len(d.get('olaylar', []))} olay, {len(d.get('kpi', {}))} KPI, {len(d.get('hedefleme', []))} hedefleme satırı")


# ───────────────────────── Kaynak B ─────────────────────────
def kaynak_b(kiraci: str, magaza: str | None = None) -> None:
    """Fiş tutarlarından 'butce' için Kaynak B kestirimi (lognormal moment uydurma) ve S1 ile fark raporu. A'dan öncül almaz (ADR-003)."""
    c = baglan()
    sorgu = "SELECT p.tutar_tl FROM pos_islem p JOIN magaza m ON m.id=p.magaza_id WHERE m.kiraci_id=? AND p.iade=0 AND p.tutar_tl>0"
    args: list = [kiraci]
    if magaza: sorgu += " AND p.magaza_id=?"; args.append(magaza)
    tutarlar = [r[0] for r in c.execute(sorgu, args)]
    n = len(tutarlar)
    if n < 10:
        print(f"yetersiz veri: {n} fiş"); return
    logs = [math.log(t) for t in tutarlar]
    mu, sd = statistics.fmean(logs), statistics.pstdev(logs)
    se = sd / math.sqrt(n)
    medyan = math.exp(mu)
    alt80, ust80 = math.exp(mu - 1.2816 * se), math.exp(mu + 1.2816 * se)
    alt95, ust95 = math.exp(mu - 1.96 * se), math.exp(mu + 1.96 * se)
    guven = "yuksek" if n >= 1000 else "orta" if n >= 200 else "dusuk"
    tanimlanma = "tanimli" if n >= 50 else "zayif"
    musteri_sayisi = c.execute(sorgu.replace("SELECT p.tutar_tl", "SELECT count(DISTINCT p.musteri_id)") + " AND p.musteri_id IS NOT NULL", args).fetchone()[0]
    cur = c.execute("INSERT INTO kaynak_b_kestirim(kiraci_id,kapsam_turu,kapsam_id,parametre,medyan,alt_80,ust_80,alt_95,ust_95,n,tanimlanma,guven,yontem,veri_araligi,surum) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (kiraci, "magaza" if magaza else "hepsi", magaza, "butce", medyan, alt80, ust80, alt95, ust95, n, tanimlanma, guven, "moment",
                     json.dumps({"musteri_sayisi": musteri_sayisi}), SURUM))
    b_id = cur.lastrowid
    a = c.execute("SELECT id, merkez, yayilim FROM oncul WHERE seviye='S1' AND parametre='butce' ORDER BY id DESC LIMIT 1").fetchone()
    if a:
        fark = medyan - a["merkez"]
        fark_sd = (mu - math.log(a["merkez"])) / max(1e-9, a["yayilim"])  # log-ölçekte SD birimi
        ga_alt, ga_ust = alt95 - a["merkez"], ust95 - a["merkez"]
        anlam = "anlamli" if (ga_alt > 0 or ga_ust < 0) and abs(fark_sd) > 0.1 else ("esdeger" if abs(fark_sd) <= 0.1 else "belirsiz")
        yorum = f"Türkiye geneli (S1) sepet bütçesi medyanı {a['merkez']:.0f} TL; bu kiracının gerçek fişlerinde {medyan:.0f} TL (n={n}). Fark {fark_sd:+.2f} SD."
        c.execute("INSERT INTO fark_raporu(kiraci_id,a_oncul_id,b_kestirim_id,parametre,fark,fark_sd,ga_alt,ga_ust,anlamlilik,yorum) VALUES (?,?,?,?,?,?,?,?,?,?)",
                  (kiraci, a["id"], b_id, "butce", fark, fark_sd, ga_alt, ga_ust, anlam, yorum))
        print(yorum, "→", anlam)
    denetim(c, "rapor", f"kaynak_b:{kiraci}:{magaza or 'hepsi'}", {"n": n})
    c.commit()
    print(f"Kaynak B: butce medyan {medyan:.0f} TL [%95: {alt95:.0f}–{ust95:.0f}], log-sd {sd:.2f}, n={n}, güven {guven}")


# ───────────────────────── örnek veri ─────────────────────────
def ornek(seed: int = 11) -> None:
    rnd = random.Random(seed)
    c = baglan()
    kiraci = "demo"
    c.execute("INSERT OR IGNORE INTO kiraci(id, ad, sektor) VALUES (?,?,?)", (kiraci, "Demo Perakende A.Ş.", "karma"))
    magazalar = [("demo-ist-avm", "İstanbul AVM", "İstanbul", "avm", 1.25), ("demo-ank-cadde", "Ankara Cadde", "Ankara", "cadde", 1.0), ("demo-izm-semt", "İzmir Semt", "İzmir", "semt", 0.8)]
    for mid, ad, sehir, tur, _ in magazalar:
        c.execute("INSERT OR IGNORE INTO magaza(id, kiraci_id, ad, sehir, konum_turu) VALUES (?,?,?,?,?)", (mid, kiraci, ad, sehir, tur))
    c.execute("INSERT OR IGNORE INTO site(id, kiraci_id, ad, tur, url) VALUES (?,?,?,?,?)", ("demo-web", kiraci, "demo.example", "web", "https://demo.example"))
    c.execute("INSERT OR IGNORE INTO kampanya(id,kiraci_id,ad,kanal,yaratici,indirim_orani,butce_tl,hedef_segmentler,kontrol_orani,gercek_mi) VALUES (?,?,?,?,?,?,?,?,?,1)",
              ("demo-kasim", kiraci, "Kasım indirimi (gerçek)", "sosyal", "indirim", 0.2, 150000, '"hepsi"', 0.1))
    segmentler = [r[0] for r in c.execute("SELECT id FROM segment")]
    musteriler = []
    for i in range(2500):
        mid = hashlib.sha256(f"demo-musteri-{i}".encode()).hexdigest()[:16]
        musteriler.append(mid)
        c.execute("INSERT OR IGNORE INTO musteri(id, kiraci_id, riza_durumu) VALUES (?,?,'var')", (mid, kiraci))
    baslangic = datetime(2026, 9, 1)
    kampanya_gunleri = {(datetime(2026, 11, 1) + timedelta(days=d)).date() for d in range(0, 10)}
    fis = 0
    for mid, _, _, _, carpan in magazalar:
        for _ in range(4000):
            gun = baslangic + timedelta(days=rnd.randrange(0, 75), hours=rnd.randrange(9, 22), minutes=rnd.randrange(0, 60))
            kamp = gun.date() in kampanya_gunleri
            tutar = math.exp(rnd.gauss(math.log(620 * carpan) + (0.18 if kamp else 0), 0.75))
            musteri = rnd.choice(musteriler) if rnd.random() < 0.7 else None
            c.execute("INSERT INTO pos_islem(magaza_id, musteri_id, zaman, tutar_tl, urun_sayisi, odeme_tipi, taksit_sayisi, kampanya_id) VALUES (?,?,?,?,?,?,?,?)",
                      (mid, musteri, gun.isoformat(timespec="seconds"), round(tutar, 2), max(1, int(tutar / 85) + rnd.randrange(0, 3)),
                       rnd.choice(["kart", "kart", "nakit", "mobil"]), rnd.choice([1, 1, 1, 3, 6]) if tutar > 1500 else 1, "demo-kasim" if kamp else None))
            fis += 1
        bolgeler = [("giris", "Giriş", 4), ("koridor_a", "Koridor A", 7), ("koridor_b", "Koridor B", 6), ("promosyon", "Promosyon adası", 5), ("kasa", "Kasa önü", 3)]
        for bid, ad, yogunluk in bolgeler:
            c.execute("INSERT OR IGNORE INTO kamera_bolge(id, magaza_id, ad) VALUES (?,?,?)", (f"{mid}:{bid}", mid, ad))
            for g in range(14):
                for dilim in range(9 * 4, 22 * 4):
                    saat = dilim / 4
                    yog = yogunluk * carpan * (1.6 if 17 <= saat <= 20 else 1.0) * (1.3 if g % 7 in (5, 6) else 1.0)
                    t0 = (baslangic + timedelta(days=60 + g, minutes=dilim * 15)).isoformat(timespec="seconds")
                    c.execute("INSERT OR REPLACE INTO kamera_sayim(bolge_id, dilim_baslangic, kisi_sayisi, ort_bekleme_sn) VALUES (?,?,?,?)",
                              (f"{mid}:{bid}", t0, max(0, int(rnd.gauss(yog, yog ** 0.5))), round(rnd.uniform(20, 120) if bid != "kasa" else rnd.uniform(60, 300), 1)))
    # web olayları: 1.500 oturum huni
    asamalar = ["acilis", "liste", "urun", "sepet", "odeme"]
    for s in range(1500):
        oturum = hashlib.sha256(f"oturum-{s}".encode()).hexdigest()[:12]
        musteri = rnd.choice(musteriler) if rnd.random() < 0.4 else None
        t = baslangic + timedelta(days=rnd.randrange(0, 75), minutes=rnd.randrange(0, 1440))
        for i, a in enumerate(asamalar):
            c.execute("INSERT INTO web_olay(site_id, oturum_id, musteri_id, zaman, tur, asama) VALUES (?,?,?,?,?,?)", ("demo-web", oturum, musteri, t.isoformat(timespec="seconds"), "sayfa", a))
            t += timedelta(seconds=rnd.randrange(10, 180))
            if rnd.random() < [0.35, 0.3, 0.45, 0.35, 0.25][i]:
                c.execute("INSERT INTO web_olay(site_id, oturum_id, musteri_id, zaman, tur, asama, veri) VALUES (?,?,?,?,?,?,?)", ("demo-web", oturum, musteri, t.isoformat(timespec="seconds"), "terk", a, json.dumps({"neden": "surtunme" if a == "odeme" else "ilgi"})))
                break
        else:
            c.execute("INSERT INTO web_olay(site_id, oturum_id, musteri_id, zaman, tur, asama, veri) VALUES (?,?,?,?,?,?,?)", ("demo-web", oturum, musteri, t.isoformat(timespec="seconds"), "satin_al", "odeme", json.dumps({"tutar": round(math.exp(rnd.gauss(math.log(540), 0.7)), 2)})))
    denetim(c, "yukle", "ornek", {"fis": fis})
    c.commit()
    print(f"demo kiracı: {len(magazalar)} mağaza, {len(musteriler)} müşteri, {fis} fiş, kamera sayımları, 1500 web oturumu")


def ozet() -> None:
    c = baglan()
    for t in [r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")]:
        n = c.execute(f"SELECT count(*) FROM {t}").fetchone()[0]
        print(f"{t:22s} {n:>8}")
    print("\nMağaza başına fiş ve medyan tutar:")
    for r in c.execute("SELECT m.ad, count(*) n, round(avg(tutar_tl)) ort FROM pos_islem p JOIN magaza m ON m.id=p.magaza_id GROUP BY m.ad"):
        print(f"  {r['ad']:16s} n={r['n']:>6} ort={r['ort']:>7} TL")


def main(argv: list[str]) -> None:
    if len(argv) < 2 or argv[1] in ("-h", "--help"):
        print(__doc__); return
    k = argv[1]
    if k == "kur": kur()
    elif k == "yukle-temel": yukle_temel()
    elif k == "ornek": ornek()
    elif k == "yukle-pos": yukle_pos(argv[2], argv[3], argv[4])
    elif k == "yukle-kamera": yukle_kamera(argv[2], argv[3])
    elif k == "kaynak-b": kaynak_b(argv[2], argv[3] if len(argv) > 3 else None)
    elif k == "yukle-kosu": yukle_kosu(argv[2])
    elif k == "ozet": ozet()
    else: print(f"bilinmeyen komut: {k}\n{__doc__}"); sys.exit(2)


if __name__ == "__main__":
    main(sys.argv)

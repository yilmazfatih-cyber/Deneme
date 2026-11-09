"""Kaynak C öğrenme komutları: C1 reklam öncülleri, C2 kalibrasyon (Brier), C3 sosyal sinyal ve simülasyona dışa aktarım.

Kurallar (08 §3): çarpan = exp(w · ln(oran/taban)), w = n/(n+20.000); taban kiracının aynı platformdaki bantlarının gösterim
ağırlıklı ortalaması (platformlar arası ölçek farkı sızmaz); kırpma C1 0.5–2.0, C3 0.7–1.3; aykırı (ham oran kırpma dışı) öncüle girmez.
"""
from __future__ import annotations

import hashlib
import json
import math
import sqlite3
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from .ortak import DEPO, YAS_BANTLARI, YARATICI_TURLERI, denetim, kiraci_hazirla

SHRINK_K = 20000
DUSUK_GOSTERIM = 10000
C1_ALT, C1_UST = 0.5, 2.0
C3_ALT, C3_UST = 0.7, 1.3
VIDEO_BICIMLERI = ("video", "reels", "story")
C1_PARAMETRELERI = ("dikkat_esigi", "tau_reklam_tolerans")
SIM_DOSYASI = DEPO / "persona-sim" / "public" / "ogrenilen" / "reklam.json"


# ───────────────────────── yardımcılar ─────────────────────────
def bugun() -> str:
    return date.today().isoformat()


def wilson(k: float, n: float, z: float = 1.96) -> tuple[float | None, float | None]:
    """Oran için Wilson %95 güven aralığı."""
    if n <= 0:
        return None, None
    p = k / n
    payda = 1 + z * z / n
    merkez = (p + z * z / (2 * n)) / payda
    yari = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / payda
    return max(0.0, merkez - yari), min(1.0, merkez + yari)


def guven_seviyesi(n: float) -> str:
    return "dusuk" if n < DUSUK_GOSTERIM else "orta" if n < 100000 else "yuksek"


def carpan(log_oran: float | None, n: float, alt: float = C1_ALT, ust: float = C1_UST) -> tuple[float, bool]:
    """Shrinkage + log ölçekte kırpma. Döner: (çarpan, aykırı mı)."""
    if log_oran is None or not math.isfinite(log_oran):
        return 1.0, False
    w = n / (n + SHRINK_K)
    lr = max(math.log(alt), min(math.log(ust), w * log_oran))
    return math.exp(lr), not (math.log(alt) <= log_oran <= math.log(ust))


def _oran(k: float, n: float) -> float | None:
    return k / n if n > 0 else None


def _log_oran(k: float, n: float, k0: float, n0: float) -> float | None:
    """ln((k/n)/(k0/n0)); sıfır sayımlara +0.5 süreklilik düzeltmesi."""
    if n <= 0 or n0 <= 0 or k0 <= 0:
        return None
    return math.log(((k + 0.5) / (n + 1)) / ((k0 + 0.5) / (n0 + 1)))


def _agirlikli(parcalar: list[tuple[float | None, float]]) -> float | None:
    p = [(v, w) for v, w in parcalar if v is not None and w > 0]
    if not p:
        return None
    return sum(v * w for v, w in p) / sum(w for _, w in p)


class Toplam:
    """Gösterim, tıklama, video ve dönüşüm sayılarının toplamı."""

    ALANLAR = ("g", "t", "g_nv", "t_nv", "g_v", "v3", "v3_t", "vt", "g_e", "e", "t_d", "d")

    def __init__(self):
        for a in self.ALANLAR:
            setattr(self, a, 0.0)

    def ekle(self, r) -> None:
        for a in self.ALANLAR:
            setattr(self, a, getattr(self, a) + (r[a] or 0))

    def oranlar(self) -> dict:
        lo, hi = wilson(self.t, self.g)
        return dict(tiklama_orani=_oran(self.t, self.g), dikkat_orani=_oran(self.v3, self.g_v), tamamlama_orani=_oran(self.vt, self.v3_t),
                    etkilesim_orani=_oran(self.e, self.g_e), donusum_orani=_oran(self.d, self.t_d), ga_alt=lo, ga_ust=hi)


def _ogrenim_yaz(c, kiraci, platform, yas, yaratici, bicim, top: Toplam, parametre, crp, guven, surum):
    o = top.oranlar()
    c.execute("""INSERT INTO sosyal_ogrenim(kiraci_id, platform, yas_bandi, yaratici_turu, bicim, gosterim, tiklama_orani, dikkat_orani,
                 tamamlama_orani, etkilesim_orani, donusum_orani, ga_alt, ga_ust, parametre, carpan, guven, surum)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
              (kiraci, platform, yas, yaratici, bicim, int(top.g), o["tiklama_orani"], o["dikkat_orani"], o["tamamlama_orani"],
               o["etkilesim_orani"], o["donusum_orani"], o["ga_alt"], o["ga_ust"], parametre, round(crp, 4), guven, surum))


def _parametre_var(c, ad: str) -> None:
    if not c.execute("SELECT 1 FROM parametre WHERE ad=?", (ad,)).fetchone():
        raise SystemExit(f"parametre '{ad}' yok. Önce: python3 -I persona-katmani/db/pk_db.py yukle-temel")


# ───────────────────────── C1 ─────────────────────────
_C1_SORGU = f"""
SELECT h.platform, m.yas_bandi, COALESCE(i.yaratici_turu,'duygusal') yaratici, COALESCE(i.bicim,'gorsel') bicim, i.id icerik,
  SUM(m.gosterim) g, SUM(m.tiklama) t,
  SUM(CASE WHEN i.bicim IN {VIDEO_BICIMLERI} THEN 0 ELSE m.gosterim END) g_nv,
  SUM(CASE WHEN i.bicim IN {VIDEO_BICIMLERI} THEN 0 ELSE m.tiklama END) t_nv,
  SUM(CASE WHEN i.bicim IN {VIDEO_BICIMLERI} AND m.video_3sn IS NOT NULL THEN m.gosterim ELSE 0 END) g_v,
  SUM(CASE WHEN i.bicim IN {VIDEO_BICIMLERI} THEN COALESCE(m.video_3sn,0) ELSE 0 END) v3,
  SUM(CASE WHEN i.bicim IN {VIDEO_BICIMLERI} AND m.video_tam IS NOT NULL THEN COALESCE(m.video_3sn,0) ELSE 0 END) v3_t,
  SUM(CASE WHEN i.bicim IN {VIDEO_BICIMLERI} THEN COALESCE(m.video_tam,0) ELSE 0 END) vt,
  SUM(CASE WHEN m.etkilesim IS NOT NULL THEN m.gosterim ELSE 0 END) g_e, SUM(COALESCE(m.etkilesim,0)) e,
  SUM(CASE WHEN m.donusum IS NOT NULL THEN m.tiklama ELSE 0 END) t_d, SUM(COALESCE(m.donusum,0)) d
FROM sosyal_metrik m JOIN sosyal_icerik i ON i.id=m.icerik_id JOIN sosyal_hesap h ON h.id=i.hesap_id
WHERE h.kiraci_id=? AND i.tur='reklam' AND m.yas_bandi IN {YAS_BANTLARI}
GROUP BY 1,2,3,4,5"""


def reklam_oncul(c: sqlite3.Connection, kiraci: str, surum: str | None = None, sessiz: bool = False) -> dict:
    """C1: yaş bandı × platform × yaratıcı × biçim oranları → sosyal_ogrenim + oncul (S1, TR, segment = yaş bandı)."""
    surum = surum or bugun()
    for p in C1_PARAMETRELERI:
        _parametre_var(c, p)
    satirlar = c.execute(_C1_SORGU, (kiraci,)).fetchall()
    if not satirlar:
        raise SystemExit(f"{kiraci}: yaş bandı kırılımlı reklam metriği yok. Önce 'cek' veya 'csv-ice'.")
    neg = {r["icerik_id"]: r["neg"] for r in c.execute(
        "SELECT icerik_id, SUM(yorum_sayisi*olumsuz)/SUM(yorum_sayisi) neg FROM sosyal_duygu_ozeti GROUP BY icerik_id HAVING SUM(yorum_sayisi)>0")}

    hucre: dict[tuple, Toplam] = defaultdict(Toplam)
    bant: dict[tuple, Toplam] = defaultdict(Toplam)
    plat: dict[str, Toplam] = defaultdict(Toplam)
    yrt: dict[str, Toplam] = defaultdict(Toplam)
    tabaka: dict[tuple, Toplam] = defaultdict(Toplam)  # yaratıcı standardizasyonu: platform × bant × video mu
    yrt_tabaka: dict[tuple, Toplam] = defaultdict(Toplam)
    neg_b: dict[tuple, list[float]] = defaultdict(lambda: [0.0, 0.0])
    neg_p: dict[str, list[float]] = defaultdict(lambda: [0.0, 0.0])
    for r in satirlar:
        p, b, y, bc = r["platform"], r["yas_bandi"], r["yaratici"], r["bicim"]
        for hedef in (hucre[(p, b, y, bc)], bant[(p, b)], plat[p], yrt[y]):
            hedef.ekle(r)
        v = bc in VIDEO_BICIMLERI
        tabaka[(p, b, v)].ekle(r)
        yrt_tabaka[(y, p, b, v)].ekle(r)
        if r["icerik"] in neg:
            for hedef in (neg_b[(p, b)], neg_p[p]):
                hedef[0] += neg[r["icerik"]] * r["g"]
                hedef[1] += r["g"]

    c.execute(f"DELETE FROM sosyal_ogrenim WHERE kiraci_id=? AND surum=? AND parametre IN {C1_PARAMETRELERI}", (kiraci, surum))
    aykiri: list[str] = []
    # 1) ince hücreler (kanıt): dikkat ölçüsü = video ise 3 sn oranı, görsel ise CTR; taban aynı platformun havuzu
    for (p, b, y, bc), h in sorted(hucre.items()):
        P = plat[p]
        lr = _log_oran(h.v3, h.g_v, P.v3, P.g_v) if bc in VIDEO_BICIMLERI else _log_oran(h.t_nv, h.g_nv, P.t_nv, P.g_nv)
        crp, _ = carpan(lr, h.g)
        _ogrenim_yaz(c, kiraci, p, b, y, bc, h, "dikkat_esigi", crp, guven_seviyesi(h.g), surum)
    # 2) platform × bant özetleri
    ham: dict[tuple, dict] = {}
    for (p, b), h in sorted(bant.items()):
        P = plat[p]
        lr_d = _agirlikli([(_log_oran(h.v3, h.g_v, P.v3, P.g_v), h.g_v), (_log_oran(h.t_nv, h.g_nv, P.t_nv, P.g_nv), h.g_nv)])
        lr_t = _log_oran(h.vt, h.v3_t, P.vt, P.v3_t)
        nb, npf = neg_b.get((p, b)), neg_p.get(p)
        lr_n = None
        if nb and npf and nb[1] > 0 and npf[1] > 0:
            ob, op = nb[0] / nb[1], npf[0] / npf[1]
            lr_n = math.log((1 - ob) / (1 - op)) if ob < 1 and op < 1 else None
        lr_tau = (0.7 * lr_t + 0.3 * lr_n) if (lr_t is not None and lr_n is not None) else (lr_t if lr_t is not None else lr_n)
        ham[(p, b)] = {"dikkat_esigi": lr_d, "tau_reklam_tolerans": lr_tau}
        for par, lr in ham[(p, b)].items():
            crp, ayk = carpan(lr, h.g)
            if ayk:
                aykiri.append(f"{p}/{b}/{par}")
            _ogrenim_yaz(c, kiraci, p, b, None, None, h, par, crp, guven_seviyesi(h.g), surum)
    # 3) tüm platformlar ('hepsi'): platform içi log oranların gösterim ağırlıklı ortalaması → öncül
    sonuc_bant: dict[str, dict] = {}
    platformlar = sorted(plat)
    for b in YAS_BANTLARI:
        hb = Toplam()
        for p in platformlar:
            if (p, b) in bant:
                for a in Toplam.ALANLAR:
                    setattr(hb, a, getattr(hb, a) + getattr(bant[(p, b)], a))
        if hb.g <= 0:
            continue
        sonuc_bant[b] = {"gosterim": int(hb.g), "guven": guven_seviyesi(hb.g), "aykiri": []}
        for par in C1_PARAMETRELERI:
            lr = _agirlikli([(ham[(p, b)][par], bant[(p, b)].g) for p in platformlar if (p, b) in ham])
            crp, ayk = carpan(lr, hb.g)
            if ayk:
                sonuc_bant[b]["aykiri"].append(par)
                aykiri.append(f"hepsi/{b}/{par}")
            sonuc_bant[b][par] = round(crp, 4)
            _ogrenim_yaz(c, kiraci, "hepsi", b, None, None, hb, par, crp, guven_seviyesi(hb.g), surum)
    # 4) yaratıcı türü: dolaylı standardizasyon (gözlenen tıklama / tabaka CTR'larıyla beklenen)
    sonuc_yrt: dict[str, dict] = {}
    for y, h in sorted(yrt.items()):
        beklenen = sum(t.g * (tabaka[k[1:]].t / tabaka[k[1:]].g) for k, t in yrt_tabaka.items() if k[0] == y and tabaka[k[1:]].g > 0)
        lr = math.log((h.t + 0.5) / (beklenen + 0.5)) if beklenen > 0 else None
        crp, ayk = carpan(lr, h.g)
        if ayk:
            aykiri.append(f"yaratici/{y}")
        sonuc_yrt[y] = {"tiklamaCarpani": round(crp, 4), "gosterim": int(h.g), "guven": guven_seviyesi(h.g)}
        _ogrenim_yaz(c, kiraci, "hepsi", "hepsi", y, None, h, "dikkat_esigi", crp, guven_seviyesi(h.g), surum)
    # 5) oncul: S1 · ülke TR · segment (yaş bandı eşleşen) · kismen_yerel
    kaynaklar = json.dumps([f"sosyal:{p}" for p in platformlar], ensure_ascii=False)
    oncul_n = 0
    for b, s in sonuc_bant.items():
        segmentler = [r[0] for r in c.execute("SELECT id FROM segment WHERE yas=?", (b,))]
        for par in C1_PARAMETRELERI:
            if par in s["aykiri"]:
                continue  # aykırı öncüle girmez (08 §3)
            taban = c.execute("""SELECT * FROM oncul WHERE seviye='S1' AND kapsam_turu='ulke' AND kapsam_id='TR' AND segment_id IS NULL
                                 AND parametre=? AND COALESCE(kaynaklar,'') NOT LIKE '%sosyal:%' ORDER BY surum DESC, id DESC LIMIT 1""", (par,)).fetchone()
            if not taban:
                continue
            s0 = c.execute("SELECT id, merkez FROM oncul WHERE seviye='S0' AND parametre=? ORDER BY surum DESC, id DESC LIMIT 1", (par,)).fetchone()
            merkez = taban["merkez"] * s[par]
            if taban["min"] is not None:
                merkez = max(taban["min"], merkez)
            if taban["max"] is not None:
                merkez = min(taban["max"], merkez)
            for seg in segmentler:
                c.execute("""DELETE FROM oncul WHERE seviye='S1' AND kapsam_turu='ulke' AND kapsam_id='TR' AND segment_id=? AND parametre=?
                             AND surum=? AND kaynaklar LIKE '%sosyal:%'""", (seg, par, surum))
                c.execute("""INSERT INTO oncul(seviye,kapsam_turu,kapsam_id,segment_id,parametre,dagilim_tipi,merkez,yayilim,min,max,etiket,kaynaklar,surum)
                             VALUES ('S1','ulke','TR',?,?,?,?,?,?,?,'kismen_yerel',?,?)""",
                          (seg, par, taban["dagilim_tipi"], round(merkez, 5), taban["yayilim"], taban["min"], taban["max"], kaynaklar, surum))
                oncul_n += 1
                if s0 and s0["merkez"] and not (0.5 <= merkez / s0["merkez"] <= 2.0):  # A–C uyuşmazlığı (08 §3)
                    c.execute("""INSERT INTO fark_raporu(kiraci_id,a_oncul_id,parametre,fark,anlamlilik,yorum) VALUES (?,?,?,?,'belirsiz',?)""",
                              (kiraci, s0["id"], par, merkez - s0["merkez"], f"A–C uyuşmazlığı: {seg} sosyal öncülü S0'ın 2 katı dışında"))
    denetim(c, "rapor", f"sosyal:c1:{kiraci}", {"surum": surum, "hucre": len(hucre), "oncul": oncul_n, "aykiri": aykiri, "platformlar": platformlar})
    c.commit()
    if not sessiz:
        print(f"C1 · {kiraci} · sürüm {surum} · platformlar: {', '.join(platformlar)}")
        print(f"  {'bant':6s} {'gösterim':>10s} {'dikkat_esigi':>13s} {'tau_tolerans':>13s}  güven")
        for b, s in sonuc_bant.items():
            print(f"  {b:6s} {s['gosterim']:>10,d} {s['dikkat_esigi']:>13.3f} {s['tau_reklam_tolerans']:>13.3f}  {s['guven']}"
                  + (f"  aykırı: {','.join(s['aykiri'])}" if s["aykiri"] else ""))
        print("  yaratıcı türü tıklama çarpanı (tabaka standardize): " + ", ".join(f"{y} {v['tiklamaCarpani']:.3f}" for y, v in sonuc_yrt.items()))
        print(f"  sosyal_ogrenim satırı: {len(hucre) + 2 * len(bant) + 2 * len(sonuc_bant) + len(sonuc_yrt)}, oncul satırı: {oncul_n}")
    return {"surum": surum, "yasBandi": sonuc_bant, "yaratici": sonuc_yrt, "aykiri": aykiri, "oncul": oncul_n}


# ───────────────────────── C2 ─────────────────────────
def _kampanya_toplam(c, kampanya_id: str) -> dict:
    """Kampanyanın sosyal toplamları. İçerik başına 'hepsi/hepsi' satırı varsa o; yoksa yaş bandı satırları (çift sayım yok)."""
    top = {"gosterim": 0, "tiklama": 0, "donusum": 0, "donusum_var": False, "platformlar": set()}
    for ic in c.execute("""SELECT i.id, h.platform FROM sosyal_icerik i JOIN sosyal_hesap h ON h.id=i.hesap_id WHERE i.kampanya_id=?""", (kampanya_id,)).fetchall():
        hepsi = c.execute("SELECT count(*) FROM sosyal_metrik WHERE icerik_id=? AND yas_bandi='hepsi' AND cinsiyet='hepsi'", (ic["id"],)).fetchone()[0]
        kosul = "yas_bandi='hepsi' AND cinsiyet='hepsi'" if hepsi else f"yas_bandi IN {YAS_BANTLARI}"
        r = c.execute(f"SELECT SUM(gosterim), SUM(tiklama), SUM(donusum), COUNT(donusum) FROM sosyal_metrik WHERE icerik_id=? AND {kosul}", (ic["id"],)).fetchone()
        if r[0]:
            top["gosterim"] += r[0]
            top["tiklama"] += r[1] or 0
            top["donusum"] += r[2] or 0
            top["donusum_var"] |= bool(r[3])
            top["platformlar"].add(ic["platform"])
    return top


def brier(p: float, gerceklesti: int) -> float:
    return (p - gerceklesti) ** 2


def kor_tahmin_ekle(c: sqlite3.Connection, kosu_id: str, kampanya_id: str, tahmin_json: str, karar_turu: str | None = None) -> int:
    """Tahmini mühürler: hash = sha256(tahmin + zaman). Koşu yoksa yer tutucu koşu açılır."""
    t = json.loads(tahmin_json)
    p = float(t["olasilik"])
    if not 0 <= p <= 1:
        raise SystemExit("olasilik 0–1 arasında olmalı")
    if t.get("metrik") not in ("ctr", "donusum_orani"):
        raise SystemExit("metrik: ctr | donusum_orani")
    float(t["esik"])
    k = c.execute("SELECT kiraci_id FROM kampanya WHERE id=?", (kampanya_id,)).fetchone()
    if not k:
        raise SystemExit(f"kampanya yok: {kampanya_id}")
    t["kampanya_id"] = kampanya_id  # kor_tahmin'de kampanya sütunu yok (NOTLAR); tahmine gömülür
    if not c.execute("SELECT 1 FROM simulasyon_kosusu WHERE id=?", (kosu_id,)).fetchone():
        c.execute("""INSERT INTO simulasyon_kosusu(id,kiraci_id,ortam,kampanya_id,parametre_kaynagi,seed,musteri_sayisi,sure_sn,yapilandirma,surum_demeti)
                     VALUES (?,?,'eticaret',?,'A',0,0,0,'{}',?)""",
                  (kosu_id, k["kiraci_id"], kampanya_id, json.dumps({"not": "kor-tahmin-ekle yer tutucusu"}, ensure_ascii=False)))
    metin = json.dumps(t, ensure_ascii=False, sort_keys=True)
    zaman = datetime.now(timezone.utc).isoformat(timespec="seconds")
    muhur = hashlib.sha256((metin + zaman).encode("utf-8")).hexdigest()
    cur = c.execute("INSERT INTO kor_tahmin(kosu_id, karar_turu, tahmin, muhur_zamani, muhur_hash) VALUES (?,?,?,?,?)",
                    (kosu_id, karar_turu or t.get("karar_turu", "mesaj_iterasyonu"), metin, zaman, muhur))
    denetim(c, "kosu", f"kor_tahmin:{cur.lastrowid}", {"kosu": kosu_id, "kampanya": kampanya_id, "muhur_hash": muhur})
    c.commit()
    print(f"kör tahmin #{cur.lastrowid} mühürlendi: {muhur[:16]}… ({zaman})")
    return cur.lastrowid


def kalibrasyon(c: sqlite3.Connection, kiraci: str, sessiz: bool = False) -> dict:
    """C2: boş gercek_sonuc'ları sosyal toplamdan doldurur, Brier hesaplar; kiracı özeti (ortalama Brier, isabet, n)."""
    doldurulan = 0
    for r in c.execute("""SELECT kt.id, kt.tahmin, s.kampanya_id FROM kor_tahmin kt JOIN simulasyon_kosusu s ON s.id=kt.kosu_id
                          WHERE kt.gercek_sonuc IS NULL""").fetchall():
        t = json.loads(r["tahmin"])
        kamp = t.get("kampanya_id") or r["kampanya_id"]
        if not kamp or not c.execute("SELECT 1 FROM kampanya WHERE id=? AND kiraci_id=?", (kamp, kiraci)).fetchone():
            continue
        top = _kampanya_toplam(c, kamp)
        if top["gosterim"] <= 0 or (t["metrik"] == "donusum_orani" and not top["donusum_var"]):
            continue
        deger = (top["donusum"] if t["metrik"] == "donusum_orani" else top["tiklama"]) / top["gosterim"]
        gerceklesti = int(deger >= float(t["esik"]))
        b = brier(float(t["olasilik"]), gerceklesti)
        sonuc = {"metrik": t["metrik"], "deger": round(deger, 6), "esik": t["esik"], "gerceklesti": gerceklesti, "gosterim": top["gosterim"],
                 "tiklama": top["tiklama"], "donusum": top["donusum"], "kaynak": "sosyal", "platformlar": sorted(top["platformlar"])}
        c.execute("UPDATE kor_tahmin SET gercek_sonuc=?, gercek_zamani=?, brier=? WHERE id=?",
                  (json.dumps(sonuc, ensure_ascii=False), datetime.now(timezone.utc).isoformat(timespec="seconds"), b, r["id"]))
        doldurulan += 1
    ozet = {"n": 0, "ortalama_brier": None, "isabet": None, "karar_turu": {}}
    rows = []
    for r in c.execute("""SELECT kt.karar_turu, kt.tahmin, kt.gercek_sonuc, kt.brier FROM kor_tahmin kt JOIN simulasyon_kosusu s ON s.id=kt.kosu_id
                          WHERE kt.brier IS NOT NULL""").fetchall():
        t = json.loads(r["tahmin"])
        kamp = t.get("kampanya_id")
        if kamp and not c.execute("SELECT 1 FROM kampanya WHERE id=? AND kiraci_id=?", (kamp, kiraci)).fetchone():
            continue
        g = json.loads(r["gercek_sonuc"])["gerceklesti"]
        rows.append((r["karar_turu"], r["brier"], int((float(t["olasilik"]) >= 0.5) == bool(g))))
    if rows:
        ozet = {"n": len(rows), "ortalama_brier": round(sum(x[1] for x in rows) / len(rows), 4),
                "isabet": round(sum(x[2] for x in rows) / len(rows), 4), "karar_turu": {}}
        for kt in sorted({x[0] for x in rows}):
            alt = [x for x in rows if x[0] == kt]
            ozet["karar_turu"][kt] = {"n": len(alt), "ortalama_brier": round(sum(x[1] for x in alt) / len(alt), 4)}
    ozet["doldurulan"] = doldurulan
    denetim(c, "rapor", f"sosyal:c2:{kiraci}", ozet)
    c.commit()
    if not sessiz:
        print(f"C2 · {kiraci}: {doldurulan} tahmin dolduruldu; n={ozet['n']}, ortalama Brier={ozet['ortalama_brier']}, isabet={ozet['isabet']}")
    return ozet


# ───────────────────────── C3 ─────────────────────────
def _haftalik(gunluk: dict[str, int], son: date, hafta: int = 8) -> list[float | None]:
    """Son tarihten geriye haftalık toplamlar (eski → yeni); eksik gün varsa 7 güne ölçeklenir."""
    out = []
    for i in range(hafta - 1, -1, -1):
        gunler = [(son - timedelta(days=7 * i + j)).isoformat() for j in range(7)]
        var = [gunluk[g] for g in gunler if g in gunluk]
        out.append(sum(var) * 7 / len(var) if len(var) >= 4 else None)
    return out


def _egim(seri: list[float]) -> float | None:
    """En küçük kareler eğimi / ortalama → haftalık göreli değişim."""
    if len(seri) < 2 or not sum(seri):
        return None
    x = list(range(len(seri)))
    mx, my = sum(x) / len(x), sum(seri) / len(seri)
    b = sum((a - mx) * (v - my) for a, v in zip(x, seri)) / sum((a - mx) ** 2 for a in x)
    return b / my


def sosyal_sinyal(c: sqlite3.Connection, kiraci: str, surum: str | None = None, sessiz: bool = False) -> dict:
    """C3: duygu dengesi + konu hacmi eğimi → w_sosyal_kanit zayıf çarpanı (0.7–1.3, güven düşük) ve konu ilgi endeksi."""
    surum = surum or bugun()
    _parametre_var(c, "w_sosyal_kanit")
    icerik = c.execute("""SELECT i.id, i.konu, h.platform, COALESCE(SUM(m.gosterim),0) g FROM sosyal_icerik i JOIN sosyal_hesap h ON h.id=i.hesap_id
                          LEFT JOIN sosyal_metrik m ON m.icerik_id=i.id AND ((m.yas_bandi='hepsi' AND m.cinsiyet='hepsi') OR m.yas_bandi IN {})
                          WHERE h.kiraci_id=? GROUP BY i.id""".format(YAS_BANTLARI), (kiraci,)).fetchall()
    if not icerik:
        raise SystemExit(f"{kiraci}: sosyal içerik yok.")
    duygu = {r["icerik_id"]: r for r in c.execute("""SELECT icerik_id, SUM(yorum_sayisi) n, SUM(yorum_sayisi*olumlu) pos, SUM(yorum_sayisi*olumsuz) neg
                                                     FROM sosyal_duygu_ozeti GROUP BY icerik_id""")}
    konular = sorted({r["konu"] for r in icerik if r["konu"]})
    ilgi: dict[str, dict] = {}
    for k in konular:
        gunluk: dict[str, int] = defaultdict(int)
        platformlar = set()
        for r in c.execute("SELECT platform, tarih, hacim FROM sosyal_konu_hacmi WHERE konu=?", (k,)):
            gunluk[r["tarih"]] += r["hacim"]
            platformlar.add(r["platform"])
        kayit: dict = {"ilgi_endeksi": None, "egim_haftalik": None, "hacim_son4hafta": None, "platformlar": sorted(platformlar)}
        if gunluk:
            seri = _haftalik(gunluk, date.fromisoformat(max(gunluk)))
            son4 = [v for v in seri[4:] if v is not None]
            once4 = [v for v in seri[:4] if v is not None]
            kayit["egim_haftalik"] = round(_egim(son4), 4) if len(son4) >= 2 and _egim(son4) is not None else None
            kayit["hacim_son4hafta"] = int(sum(son4))
            if son4 and once4 and sum(once4) > 0:
                kayit["ilgi_endeksi"] = round(100 * (sum(son4) / len(son4)) / (sum(once4) / len(once4)), 1)
        ns = [duygu[r["id"]] for r in icerik if r["konu"] == k and r["id"] in duygu]
        n = sum(d["n"] for d in ns)
        kayit["yorum_sayisi"] = int(n)
        kayit["duygu_dengesi"] = round((sum(d["pos"] for d in ns) - sum(d["neg"] for d in ns)) / n, 4) if n else None
        ilgi[k] = kayit

    c.execute("DELETE FROM sosyal_ogrenim WHERE kiraci_id=? AND surum=? AND parametre='w_sosyal_kanit'", (kiraci, surum))
    platform_sonuc: dict[str, dict] = {}
    gruplar = defaultdict(list)
    for r in icerik:
        gruplar[r["platform"]].append(r)
    gruplar["hepsi"] = list(icerik)
    for p, ics in sorted(gruplar.items()):
        ns = [duygu[r["id"]] for r in ics if r["id"] in duygu]
        n = sum(d["n"] for d in ns)
        denge = (sum(d["pos"] for d in ns) - sum(d["neg"] for d in ns)) / n if n else 0.0
        egimler = [ilgi[k]["egim_haftalik"] for k in {r["konu"] for r in ics if r["konu"]} if ilgi.get(k, {}).get("egim_haftalik") is not None]
        egim = sum(egimler) / len(egimler) if egimler else 0.0
        w = n / (n + 200)  # yorum sayısıyla shrinkage
        crp = 1 + w * 0.3 * denge * (1 + 0.25 * max(-1.0, min(1.0, egim)))  # işaret dengeden gelir; eğim yalnız büyüklüğü oynatır
        crp = max(C3_ALT, min(C3_UST, crp))
        top = Toplam()
        top.g = sum(r["g"] for r in ics)
        c.execute("""INSERT INTO sosyal_ogrenim(kiraci_id, platform, yas_bandi, gosterim, parametre, carpan, guven, surum)
                     VALUES (?,?,?,?,?,?,?,?)""", (kiraci, p, "hepsi", int(top.g), "w_sosyal_kanit", round(crp, 4), "dusuk", surum))
        platform_sonuc[p] = {"yorum_sayisi": int(n), "duygu_dengesi": round(denge, 4), "konu_egimi": round(egim, 4), "w_sosyal_kanit": round(crp, 4)}
    cikti = {"surum": surum, "kiraci": kiraci, "guven": "dusuk", "konular": ilgi, "platformlar": platform_sonuc}
    denetim(c, "rapor", f"sosyal:c3:{kiraci}", {"surum": surum, "konu": len(ilgi), "w_sosyal_kanit": platform_sonuc.get("hepsi", {}).get("w_sosyal_kanit")})
    c.commit()
    if not sessiz:
        print(json.dumps(cikti, ensure_ascii=False, indent=2))
    return cikti


# ───────────────────────── Simülasyona dışa aktarım ─────────────────────────
def disa_aktar_sim(c: sqlite3.Connection, kiraci: str | None = None, hedef: Path | None = None, sessiz: bool = False) -> dict:
    """C1 çarpanlarını persona-sim/public/ogrenilen/reklam.json'a yazar (persona-sim main.ts `Ogrenilen` arayüzü)."""
    hedef = Path(hedef or SIM_DOSYASI)
    q = "SELECT kiraci_id, surum FROM sosyal_ogrenim WHERE parametre IN ('dikkat_esigi','tau_reklam_tolerans')"
    a: list = []
    if kiraci:
        q += " AND kiraci_id=?"
        a.append(kiraci)
    son = c.execute(q + " ORDER BY surum DESC, id DESC LIMIT 1", a).fetchone()
    if not son:
        raise SystemExit("C1 sonucu yok. Önce: reklam-oncul KIRACI")
    kiraci, surum = son["kiraci_id"], son["surum"]
    rows = c.execute("""SELECT * FROM sosyal_ogrenim WHERE kiraci_id=? AND surum=? AND platform='hepsi'
                        AND parametre IN ('dikkat_esigi','tau_reklam_tolerans')""", (kiraci, surum)).fetchall()
    yas: dict[str, dict] = {}
    ayrinti: dict[str, dict] = {}
    yaratici: dict[str, dict] = {}
    for r in rows:
        if r["yas_bandi"] in YAS_BANTLARI and r["yaratici_turu"] is None:
            yas.setdefault(r["yas_bandi"], {})[r["parametre"]] = round(r["carpan"], 3)
            ayrinti[r["yas_bandi"]] = {"gosterim": r["gosterim"], "guven": r["guven"]}
        elif r["yas_bandi"] == "hepsi" and r["yaratici_turu"] in YARATICI_TURLERI:
            yaratici[r["yaratici_turu"]] = {"tiklamaCarpani": round(r["carpan"], 3)}
            ayrinti[f"yaratici:{r['yaratici_turu']}"] = {"gosterim": r["gosterim"], "guven": r["guven"]}
    bant_guven = [ayrinti[b]["guven"] for b in yas]
    genel = ("yuksek" if bant_guven and all(g == "yuksek" for g in bant_guven) and len(bant_guven) == len(YAS_BANTLARI)
             else "orta" if sum(g != "dusuk" for g in bant_guven) >= 3 else "dusuk")
    platformlar = sorted({r[0] for r in c.execute("SELECT DISTINCT platform FROM sosyal_ogrenim WHERE kiraci_id=? AND surum=? AND platform!='hepsi'", (kiraci, surum))})
    kuru = bool(c.execute("""SELECT 1 FROM sosyal_icerik i JOIN sosyal_hesap h ON h.id=i.hesap_id
                             WHERE h.kiraci_id=? AND i.id LIKE '%:kuru-%' LIMIT 1""", (kiraci,)).fetchone())
    veri = {"surum": surum, "kaynak": "sosyal", "platformlar": platformlar, "kuruVeri": kuru,
            "yasBandi": {b: yas[b] for b in YAS_BANTLARI if b in yas},
            "yaratici": {y: yaratici[y] for y in YARATICI_TURLERI if y in yaratici},
            "guven": genel, "ayrinti": ayrinti,
            "aciklama": "Çarpanlar S1 medyanına uygulanır (1 = fark yok). Yalnız toplu sosyal reklam verisi; kişi yok (ADR-009)."}
    hedef.parent.mkdir(parents=True, exist_ok=True)
    hedef.write_text(json.dumps(veri, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    denetim(c, "disa_aktar", str(hedef.relative_to(DEPO)) if hedef.is_relative_to(DEPO) else hedef.name, {"surum": surum, "guven": genel})
    c.commit()
    if not sessiz:
        print(f"{hedef} yazıldı · sürüm {surum} · güven {genel} · {len(veri['yasBandi'])} bant, {len(veri['yaratici'])} yaratıcı türü"
              + (" · UYARI: kuru (sahte) veri içeriyor" if kuru else ""))
    return veri


def ozet(c: sqlite3.Connection, kiraci: str | None = None) -> None:
    """Kaynak C tablolarının özeti."""
    for t in ("sosyal_hesap", "sosyal_icerik", "sosyal_metrik", "sosyal_duygu_ozeti", "sosyal_konu_hacmi", "sosyal_ogrenim"):
        print(f"{t:22s} {c.execute(f'SELECT count(*) FROM {t}').fetchone()[0]:>8}")
    a = (kiraci,) if kiraci else ()
    print("\nKiracı × platform (gösterim, tıklama, CTR):")
    for r in c.execute(f"""SELECT h.kiraci_id, h.platform, count(DISTINCT i.id) ic, SUM(m.gosterim) g, SUM(m.tiklama) t
                           FROM sosyal_metrik m JOIN sosyal_icerik i ON i.id=m.icerik_id JOIN sosyal_hesap h ON h.id=i.hesap_id
                           WHERE (m.yas_bandi IN {YAS_BANTLARI} OR (m.yas_bandi='hepsi' AND m.cinsiyet='hepsi')) {"AND h.kiraci_id=?" if kiraci else ""}
                           GROUP BY 1,2 ORDER BY 1,2""", a):
        print(f"  {r['kiraci_id']:10s} {r['platform']:10s} içerik {r['ic']:>3}  gösterim {r['g'] or 0:>10,d}  CTR {((r['t'] or 0) / r['g'] if r['g'] else 0):.4f}")
    son = c.execute("SELECT kiraci_id, surum, count(*) n FROM sosyal_ogrenim GROUP BY 1,2 ORDER BY surum DESC LIMIT 3").fetchall()
    for r in son:
        print(f"  öğrenim: {r['kiraci_id']} sürüm {r['surum']}: {r['n']} satır")
    kt = c.execute("SELECT count(*), count(brier), avg(brier) FROM kor_tahmin").fetchone()
    print(f"  kör tahmin: {kt[0]} (sonuçlanan {kt[1]}, ortalama Brier {kt[2] if kt[2] is None else round(kt[2], 4)})")


__all__ = ["reklam_oncul", "kalibrasyon", "kor_tahmin_ekle", "sosyal_sinyal", "disa_aktar_sim", "ozet", "wilson", "carpan", "brier",
           "kiraci_hazirla"]

"""Veri komutları (docs/ARAYUZ.md eklenti biçimi): topla, db-ozet, gecikme-olc, sinyal-yukle."""

from __future__ import annotations

import json
import logging
import sqlite3
import sys
from datetime import date
from pathlib import Path

from moda_radar.sema import DefileTanimi

KOK = Path(__file__).resolve().parents[2]
DEFILE_DOSYASI = KOK / "content" / "defileler.json"
SINYAL_KLASORU = KOK / "content" / "sinyaller"
VARSAYILAN_DB = Path("veri/moda.db")
# Ağ (URLError/HTTPError ⊂ OSError), robots yasağı (RuntimeError), ayrıştırma/şema (ValueError), SQLite
AG_HATALARI = (OSError, RuntimeError, ValueError, sqlite3.Error)


def guncel_sezon(t: date | None = None) -> str:
    """En son tamamlanan hazır giyim haftasının sezonu: Ağu–Ara → SS(yıl+1), Şub–Tem → FW(yıl), Ocak → SS(yıl)."""
    t = t or date.today()
    if t.month >= 8:
        return f"SS{(t.year + 1) % 100:02d}"
    if t.month >= 2:
        return f"FW{t.year % 100:02d}"
    return f"SS{t.year % 100:02d}"


def ekle(alt) -> list[str]:
    p = alt.add_parser("topla", help="Podyum ya da perakende kaynağını tarar (yalnız URL + etiket saklanır)")
    p.add_argument("--sezon", default="guncel", help="SS27 | FW26 | guncel")
    p.add_argument("--kaynak", choices=("podyum", "perakende"), required=True)
    p.add_argument("--segment", help="perakende: luks | premium | orta | deger")
    p.add_argument("--kategori", help="perakende: ör. kadin-ust")
    p.add_argument("--marka", help="podyum: yalnız bu marka")
    p.add_argument("--sinir", type=int, help="en fazla bu kadar defile/hedef")
    p.add_argument("--gorsel-siniri", type=int, help="defile başına en fazla bu kadar look")
    p.add_argument("--db", type=Path, default=VARSAYILAN_DB)
    p.add_argument("--kuru", action="store_true", help="ağa çıkma; yalnız planı yazdır")

    p = alt.add_parser("db-ozet", help="Veritabanı özeti (Markdown ya da --json)")
    p.add_argument("--db", type=Path, default=VARSAYILAN_DB)
    p.add_argument("--json", action="store_true")

    p = alt.add_parser("gecikme-olc", help="Podyum→raf gecikmesini ölçer ve özetler")
    p.add_argument("--segment", required=True)
    p.add_argument("--kategori", required=True)
    p.add_argument("--esik", type=float, default=0.02)
    p.add_argument("--db", type=Path, default=VARSAYILAN_DB)

    p = alt.add_parser("sinyal-yukle", help="content/sinyaller/*.json → DB")
    p.add_argument("--klasor", type=Path, default=SINYAL_KLASORU)
    p.add_argument("--ornekler", action="store_true", help="'ornek': true dosyaları da yükle")
    p.add_argument("--db", type=Path, default=VARSAYILAN_DB)
    return ["topla", "db-ozet", "gecikme-olc", "sinyal-yukle"]


def calistir(args) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    return {
        "topla": _topla,
        "db-ozet": _db_ozet,
        "gecikme-olc": _gecikme_olc,
        "sinyal-yukle": _sinyal_yukle,
    }[args.komut](args)


def defileleri_oku(sezon: str, marka: str | None = None, yol: Path = DEFILE_DOSYASI) -> list[DefileTanimi]:
    veri = json.loads(yol.read_text("utf-8"))
    tum = [DefileTanimi.model_validate(d) for d in veri["defileler"]]
    return [d for d in tum if d.sezon == sezon and (marka is None or d.marka.lower() == marka.lower())]


def _depo(yol: Path):
    from moda_radar.veri.depo import Depo

    return Depo(yol)


def _topla(args) -> int:
    sezon = guncel_sezon() if args.sezon == "guncel" else args.sezon
    if args.kaynak == "podyum":
        return _topla_podyum(args, sezon)
    return _topla_perakende(args)


def _topla_podyum(args, sezon: str) -> int:
    from moda_radar.veri import podyum_vogue

    defileler = defileleri_oku(sezon, args.marka)[: args.sinir]
    if not defileler:
        print(f"{sezon} için content/defileler.json'da defile yok", file=sys.stderr)
        return 1
    if args.kuru:
        print(f"# Plan: podyum {sezon} — {len(defileler)} defile (ağ yok)")
        for d in defileler:
            hedef = podyum_vogue.defile_url(d) if d.kaynak == "vogue" else f"(toplayıcı yok: {d.kaynak})"
            print(f"- {d.marka} [{d.sehir}] {hedef}")
        return 0
    from moda_radar.veri.ag import Tarayici

    tarayici, basarili, hatali = Tarayici(), 0, 0
    with _depo(args.db) as depo:
        for d in defileler:
            try:
                s = podyum_vogue.defile_tara(depo, d, tarayici, gorsel_siniri=args.gorsel_siniri)
            except AG_HATALARI as e:  # bir defile düşerse ötekiler sürer; yazımlar transaction içinde
                hatali += 1
                print(f"HATA {d.marka}: {e}", file=sys.stderr)
                continue
            print(json.dumps(s, ensure_ascii=False))
            basarili += "atlandi" not in s and s.get("bulunan", 0) > 0
    print(f"podyum {sezon}: {basarili} defile görsel verdi, {hatali} hata, {tarayici.istek_sayisi} istek")
    return 0 if basarili > 0 else 1


def _topla_perakende(args) -> int:
    from moda_radar.veri import perakende

    hedefler = perakende.hedefler(perakende.kaynaklari_oku(), args.segment, args.kategori)[: args.sinir]
    if not hedefler:
        print("eşleşen perakende hedefi yok", file=sys.stderr)
        return 1
    if args.kuru:
        print(f"# Plan: perakende — {len(hedefler)} hedef (ağ yok)")
        for h in hedefler:
            dog = "doğrulandı" if h.dogrulandi else "DOĞRULANMADI"
            print(f"- {h.segment}/{h.marka}/{h.kategori} {'[js] ' if h.js else ''}{h.url} ({dog})")
        return 0
    from moda_radar.veri.ag import Tarayici

    tarayici, basarili, hatali, urun = Tarayici(), 0, 0, 0
    with _depo(args.db) as depo:
        for h in hedefler:
            ad = f"{h.segment}/{h.marka}/{h.kategori}"
            try:
                s = perakende.kaynak_tara(depo, h, tarayici)
            # Hedef başına yalıtım: Playwright'ın kendi Error sınıfı dahil hiçbir hata sonraki hedefleri durdurmaz.
            except Exception as e:  # noqa: BLE001
                hatali += 1
                print(json.dumps({"hedef": ad, "bulunan": 0, "hata": kisa_hata(e)}, ensure_ascii=False))
                continue
            print(json.dumps(s, ensure_ascii=False))
            basarili += s["bulunan"] > 0
            urun += s["bulunan"]
    print(
        f"perakende: {len(hedefler)} hedef, {urun} ürün, {hatali} hata"
        f" · {basarili} hedef ürün verdi, {tarayici.istek_sayisi} istek"
    )
    return 0 if basarili > 0 else 1


def kisa_hata(e: BaseException, sinir: int = 200) -> str:
    """Günlük için tek satırlık hata: 'Error: Page.goto: net::ERR_HTTP2_PROTOCOL_ERROR at https://...'."""
    ilk = (str(e).strip().splitlines() or [""])[0]
    metin = f"{type(e).__name__}: {ilk}" if ilk else type(e).__name__
    return metin if len(metin) <= sinir else metin[: sinir - 1] + "…"


def ozet_markdown(o: dict) -> str:
    satirlar = [
        "# Moda Radar veritabanı özeti",
        "",
        f"Oluşturma: {date.today().isoformat()} · şema sürümü {o['sema_surumu']}",
        "",
        "| Tablo | Satır |",
        "| --- | ---: |",
    ]
    satirlar += [f"| {t} | {n} |" for t, n in o["satir"].items()]
    for baslik, anahtar in (("Sezon dağılımı", "sezon"), ("Segment dağılımı", "segment")):
        satirlar += ["", f"## {baslik}", ""]
        for tablo, dag in o[anahtar].items():
            ic = ", ".join(f"{k}: {v}" for k, v in dag.items()) or "—"
            satirlar.append(f"- **{tablo}**: {ic}")
    return "\n".join(satirlar) + "\n"


def _db_ozet(args) -> int:
    with _depo(args.db) as depo:
        o = depo.ozet()
    print(
        json.dumps(o, ensure_ascii=False, indent=2) if args.json else ozet_markdown(o),
        end="" if not args.json else "\n",
    )
    return 0


def _gecikme_olc(args) -> int:
    from moda_radar.veri import gecikme_olc

    with _depo(args.db) as depo:
        satirlar = gecikme_olc.olc(depo, args.segment, args.kategori, esik=args.esik)
        oz = gecikme_olc.ozet_gecikme(depo, args.segment, args.kategori)
    print(f"{len(satirlar)} ölçüm yazıldı")
    print(json.dumps(oz, ensure_ascii=False))
    return 0


def _sinyal_yukle(args) -> int:
    from moda_radar.veri import sinyal

    try:
        kayitlar = sinyal.yukle(args.klasor, ornekleri_dahil_et=args.ornekler)
    except sinyal.SinyalDosyasiHatasi as e:
        print(f"HATA: {e}", file=sys.stderr)
        return 1
    with _depo(args.db) as depo:
        n = sinyal.depoya_yaz(depo, kayitlar)
    print(f"{n} sinyal yüklendi ({args.klasor})")
    return 0

"""``tahmin`` ve ``geriye-test`` komutları (docs/ARAYUZ.md komut eklentisi)."""

from __future__ import annotations

import importlib
import json
from datetime import date
from pathlib import Path

from moda_radar.sema import GozlemKaydi, SegmentDosyasi, SinyalKaydi
from moda_radar.tahmin import geriye_test as gt
from moda_radar.tahmin import model as md
from moda_radar.tahmin import sentetik
from moda_radar.tahmin import sezon as sz

SEGMENT_DOSYASI = Path("content/segmentler.json")


def ekle(alt) -> list[str]:
    t = alt.add_parser("tahmin", help="Nitelik × segment olasılık tablosu (olasılık + ufuk + eşik)")
    t.add_argument("--sezon", required=True, help="Podyum sezonu, ör. SS27")
    t.add_argument("--ulke", default="TR")
    t.add_argument("--segment", default="hepsi", help="Segment kodu ya da 'hepsi'")
    t.add_argument("--kategori", default="kadin-ust")
    t.add_argument("--eksen", default=None, help="Yalnız bu nitelik ekseni (ör. renk)")
    t.add_argument("--esik", type=float, default=md.ESIK_RAF_PAYI, help="Raf payı eşiği (varsayılan 0,04)")
    t.add_argument("--db", default="veri/moda.db")
    t.add_argument("--sinyaller", default="content/sinyaller")
    t.add_argument("--gozlemler", default="content/gozlemler", help="DB yoksa okunacak raf gözlemi klasörü")
    t.add_argument("--segmentler", default=str(SEGMENT_DOSYASI))
    t.add_argument("--cikti", default="docs/sezonlar", help="JSON çıktı kökü: <cikti>/<SEZON>/tahmin-<segment>.json")
    t.add_argument("--json", action="store_true", help="Tabloyu değil JSON'u yazdır")

    g = alt.add_parser("geriye-test", help="Zaman kilitli geçmiş sezon tahmini ve karne")
    g.add_argument("--tahmin", required=True, help="Tahmin edilen podyum sezonu, ör. SS25")
    g.add_argument("--veri-kadar", required=True, type=date.fromisoformat, help="Zaman kilidi, ör. 2024-09-30")
    g.add_argument("--ulke", default="TR")
    g.add_argument("--segment", default="orta")
    g.add_argument("--kategori", default="kadin-ust")
    g.add_argument("--eksen", default=None)
    g.add_argument("--esik", type=float, default=md.ESIK_RAF_PAYI)
    g.add_argument("--sentetik", action="store_true", help="Gerçek veri yerine sentetik veri (karnede açıkça yazılır)")
    g.add_argument("--tohum", type=int, default=7)
    g.add_argument("--db", default="veri/moda.db")
    g.add_argument("--sinyaller", default="content/sinyaller")
    g.add_argument("--gozlemler", default="content/gozlemler", help="DB yoksa okunacak raf gözlemi klasörü")
    g.add_argument("--segmentler", default=str(SEGMENT_DOSYASI))
    g.add_argument("--karne", default=None, help="Karne yolu (varsayılan docs/karne/<surum>[-sentetik].md)")
    g.add_argument("--json", action="store_true")
    return ["tahmin", "geriye-test"]


# --- veri kaynakları ---


def _istege_bagli(modul: str):
    try:
        return importlib.import_module(modul)
    except ImportError:
        return None


def sinyal_dosyalari_oku(klasor: str | Path) -> list[SinyalKaydi]:
    """``content/sinyaller/*.json`` (``{"sezon", "sinyaller": [...]}``); ``ornek: true`` dosyalar atlanır."""
    klasor = Path(klasor)
    kayitlar: list[SinyalKaydi] = []
    if not klasor.is_dir():
        return kayitlar
    for dosya in sorted(klasor.glob("*.json")):
        veri = json.loads(dosya.read_text(encoding="utf-8"))
        if not isinstance(veri, dict) or veri.get("ornek"):
            continue
        for k in veri.get("sinyaller", []):
            k = dict(k)
            k.setdefault("sezon", veri.get("sezon"))
            kayitlar.append(SinyalKaydi.model_validate(k))
    return kayitlar


def gozlem_dosyalari_oku(klasor: str | Path, ulke: str | None = None) -> list[GozlemKaydi]:
    """``content/gozlemler/*.json`` (``{"ulke", "gozlemler": [...]}``); ``ornek: true`` dosyalar atlanır."""
    klasor = Path(klasor)
    kayitlar: list[GozlemKaydi] = []
    if not klasor.is_dir():
        return kayitlar
    for dosya in sorted(klasor.glob("*.json")):
        veri = json.loads(dosya.read_text(encoding="utf-8"))
        if not isinstance(veri, dict) or veri.get("ornek"):
            continue
        for k in veri.get("gozlemler", []):
            k = dict(k)
            k.setdefault("ulke", veri.get("ulke", "TR"))
            g = GozlemKaydi.model_validate(k)
            if ulke is None or g.ulke == ulke:
                kayitlar.append(g)
    return kayitlar


def veri_yukle(
    db: str, sinyal_klasoru: str, ulke: str, kategori: str, gozlem_klasoru: str | None = None
) -> tuple[list[SinyalKaydi], list[GozlemKaydi]]:
    """Önce ``moda_radar.veri.depo`` (DB varsa); sinyal yoksa ``content/sinyaller``, gözlem yoksa ``content/gozlemler``."""
    sinyaller: list[SinyalKaydi] = []
    gozlemler: list[GozlemKaydi] = []
    depo_mod = _istege_bagli("moda_radar.veri.depo")
    if depo_mod is not None and Path(db).exists():
        depo = depo_mod.Depo(Path(db))
        sinyaller.extend(depo.sinyaller())
        gozlemler.extend(depo.gozlemler(ulke=ulke, segment=None, kategori=kategori))
    if not sinyaller:
        sinyal_mod = _istege_bagli("moda_radar.veri.sinyal")
        if sinyal_mod is not None and hasattr(sinyal_mod, "yukle") and Path(sinyal_klasoru).is_dir():
            sinyaller.extend(sinyal_mod.yukle(Path(sinyal_klasoru)))
        else:
            sinyaller.extend(sinyal_dosyalari_oku(sinyal_klasoru))
    if not gozlemler and gozlem_klasoru:
        gozlemler.extend(g for g in gozlem_dosyalari_oku(gozlem_klasoru, ulke) if g.kategori == kategori)
    return sinyaller, gozlemler


def segmentleri_oku(yol: str | Path) -> SegmentDosyasi:
    return SegmentDosyasi.model_validate(json.loads(Path(yol).read_text(encoding="utf-8")))


# --- çıktı ---


def _y(x: float) -> str:
    return f"{x:.2f}".replace(".", ",")


def tablo(tahminler) -> str:
    satirlar = [
        f"{'eksen':<14} {'değer':<16} {'olasılık':>8}  {'eşik':>5}  {'ufuk':<5} {'yön':<9} {'gecikme':<14} {'kaynak':>6}"
    ]
    for t in tahminler:
        satirlar.append(
            f"{t.nitelik_ekseni:<14} {t.nitelik_degeri:<16} {_y(t.olasilik):>8}  {_y(t.esik_raf_payi):>5}  "
            f"{t.ufuk_sezon:<5} {t.yon.value:<9} {_y(t.gecikme_sezon) + ' ' + t.gecikme_kaynagi:<14} {t.kaynak_sayisi:>6}"
        )
    return "\n".join(satirlar)


def _tahmin(args) -> int:
    sz.ayristir(args.sezon)
    segmentler = segmentleri_oku(args.segmentler)
    kodlar = [s.kod for s in segmentler.segmentler] if args.segment == "hepsi" else [args.segment]
    sinyaller, gozlemler = veri_yukle(args.db, args.sinyaller, args.ulke, args.kategori, args.gozlemler)
    if not any(s.sezon == args.sezon for s in sinyaller):
        print(f"{args.sezon} için podyum sinyali bulunamadı ({args.db} / {args.sinyaller}).")
    tum = {}
    for kod in kodlar:
        tahminler = md.toplu_tahmin(
            args.sezon,
            args.ulke,
            kod,
            args.kategori,
            sinyaller,
            gozlemler,
            segmentler,
            eksen=args.eksen,
            esik_raf_payi=args.esik,
        )
        tum[kod] = [t.model_dump(mode="json") for t in tahminler]
        yol = Path(args.cikti) / args.sezon / f"tahmin-{kod}.json"
        yol.parent.mkdir(parents=True, exist_ok=True)
        yol.write_text(json.dumps(tum[kod], ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        if not args.json:
            print(f"\n## {args.sezon} · {args.ulke} · {kod} · {args.kategori}  →  {yol}")
            print("Olasılık: ufuk sezonunda segment rafında payın eşiği aşma olasılığı.")
            print(tablo(tahminler) if tahminler else "(tahmin yok)")
    if args.json:
        print(json.dumps(tum, ensure_ascii=False, indent=2))
    return 0


def _geriye_test(args) -> int:
    segmentler = segmentleri_oku(args.segmentler)
    if args.sentetik:
        tanim = next(s for s in segmentler.segmentler if s.kod == args.segment)
        bas = sz.ekle(args.tahmin, -6)
        sezonlar = [sz.ekle(bas, i) for i in range(8)]
        sinyaller, gozlemler = sentetik.uret(
            sezonlar=sezonlar,
            segment=args.segment,
            gecikme_sezon=float(tanim.gecikme_onsel["mod"]),
            kategori=args.kategori,
            ulke=args.ulke,
            esik=args.esik,
            tohum=args.tohum,
        )
    else:
        sinyaller, gozlemler = veri_yukle(args.db, args.sinyaller, args.ulke, args.kategori, args.gozlemler)
    sonuc = gt.calistir(
        args.tahmin,
        args.veri_kadar,
        sinyaller,
        gozlemler,
        segmentler,
        args.segment,
        args.kategori,
        ulke=args.ulke,
        eksen=args.eksen,
        esik_raf_payi=args.esik,
        sentetik=args.sentetik,
    )
    if args.json:
        print(json.dumps(sonuc, ensure_ascii=False, indent=2))
    else:
        g = sonuc["gecikme"]
        print(f"Geriye test {args.tahmin} (veri {args.veri_kadar} tarihine kadar) · {args.segment} · {args.kategori}")
        if args.sentetik:
            print("UYARI: sentetik veri; gerçek isabet değildir.")
        print(f"Gecikme: {g['sezon']} sezon ({g['kaynak']}, n={g['n']}); ufuk {sonuc['ufuk_sezon']}")
        for ad, o in sonuc["olcutler"].items():
            print(f"  {gt.TABAN_ADLARI[ad]:<28} Brier {o['brier']:.3f}  ilk-10 {o['ilk_n_isabet']:.2f}")
        print(f"Rapor üretilebilir: {'evet' if sonuc['rapor_uretilebilir'] else 'hayır'}")
    if sonuc["n_tahmin"]:
        yol = gt.karne_yaz(sonuc, args.karne)
        if not args.json:
            print(f"Karne: {yol}")
    return 0 if sonuc["rapor_uretilebilir"] else 2


def calistir(args) -> int:
    if args.komut == "tahmin":
        return _tahmin(args)
    if args.komut == "geriye-test":
        return _geriye_test(args)
    raise ValueError(f"bilinmeyen komut: {args.komut}")

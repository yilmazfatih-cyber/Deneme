"""Renk komutları: `esle` (hex → TCX adayları) ve `renk` (DB'deki parça renklerinden sezon paleti)."""

from __future__ import annotations

import importlib
import json
import sqlite3
from pathlib import Path

from moda_radar.renk import palet, pantone, rapor, uzay
from moda_radar.sema import HEX_DESENI, SEZON_DESENI, Lab, PaletSatiri, RenkKaydi

KOK = Path(__file__).resolve().parents[2]
VARSAYILAN_DB = Path("veri/moda.db")
SEZONLAR = KOK / "docs" / "sezonlar"


def ekle(alt) -> list[str]:
    e = alt.add_parser("esle", help="Hex rengini en yakın iki Pantone TCX adayına eşler (ΔE2000)")
    e.add_argument("--hex", required=True, help='ör. "#DA321C"')
    e.add_argument("--json", action="store_true", help="JSON çıktı")

    r = alt.add_parser("renk", help="Sezon paletini çıkarır, Pantone TCX eşler")
    r.add_argument("--sezon", required=True, help="ör. SS27")
    r.add_argument("--db", type=Path, default=VARSAYILAN_DB, help="SQLite veritabanı (varsayılan veri/moda.db)")
    r.add_argument("--onceki", help="Karşılaştırılacak önceki sezon, ör. FW26")
    r.add_argument("--esik", type=float, default=6.0, help="Kümeleme ΔE2000 eşiği (varsayılan 6)")
    r.add_argument("--cikti", type=Path, default=SEZONLAR, help="Çıktı kökü (varsayılan docs/sezonlar)")
    r.add_argument("--json", action="store_true", help="Paleti ayrıca stdout'a JSON yazar")
    return ["esle", "renk"]


def calistir(args) -> int:
    if args.komut == "esle":
        return _esle(args)
    if args.komut == "renk":
        return _renk(args)
    raise ValueError(f"bilinmeyen komut: {args.komut}")


# --- esle ---


def _esle(args) -> int:
    hex_ = args.hex.strip()
    if not hex_.startswith("#"):
        hex_ = "#" + hex_
    if not HEX_DESENI.match(hex_):
        print(f"Geçersiz hex: {args.hex!r}. Biçim: #RRGGBB")
        return 2
    lab = uzay.hex_to_lab(hex_)
    bir, iki = pantone.esle(hex_)
    ail = pantone.aile(lab)
    if args.json:
        cikti = {
            "hex": hex_.upper(),
            "lab": lab.model_dump(),
            "aile": ail,
            "adaylar": [{**e.model_dump(), "guven": e.guven} for e in (bir, iki)],
        }
        print(json.dumps(cikti, ensure_ascii=False, indent=2))
        return 0
    print(f"{hex_.upper()}  Lab {lab.L:.1f} / {lab.a:.1f} / {lab.b:.1f}  aile: {ail}")
    for sira, e in enumerate((bir, iki), 1):
        ad = f"  (Pantone adı: {e.ad})" if e.ad else ""
        print(f"  {sira}. {e.kod}  {e.hex}  ΔE2000 {e.delta_e:.2f}  [{e.guven}]{ad}")
    return 0


# --- renk ---


class VeriYok(Exception):
    """Kullanıcıya açık mesajla bildirilen veri eksikliği."""


def _satirdan(kayit) -> tuple[Lab, float, str] | None:
    """RenkKaydi, dict ya da benzeri nesneden (Lab, pay, marka)."""
    if isinstance(kayit, RenkKaydi):
        return kayit.lab, kayit.pay, kayit.kaynak.marka or ""
    if isinstance(kayit, (tuple, list)) and len(kayit) == 3 and isinstance(kayit[0], Lab):
        return kayit[0], float(kayit[1]), str(kayit[2] or "")
    d = kayit if isinstance(kayit, dict) else getattr(kayit, "__dict__", {})
    pay = d.get("pay")
    if pay is None:
        return None
    kaynak = d.get("kaynak")
    marka = d.get("marka") or (kaynak.get("marka") if isinstance(kaynak, dict) else None)
    if all(k in d for k in ("L", "a", "b")):
        lab = uzay.lab_olustur(d["L"], d["a"], d["b"])
    elif all(k in d for k in ("lab_L", "lab_a", "lab_b")):  # moda_radar.veri.depo şeması
        lab = uzay.lab_olustur(d["lab_L"], d["lab_a"], d["lab_b"])
    elif isinstance(d.get("lab"), (str, dict)):
        lab = Lab.model_validate_json(d["lab"]) if isinstance(d["lab"], str) else Lab.model_validate(d["lab"])
    elif d.get("hex"):
        lab = uzay.hex_to_lab(d["hex"])
    else:
        return None
    return lab, float(pay), str(marka or "")


def _sqlite_oku(bag: sqlite3.Connection, sezon: str) -> list[tuple[Lab, float, str]]:
    """Depo'da hazır okuyucu yoksa `parca_renk` tablosunu sütun adlarına bakarak okur
    (moda_radar.veri.depo şeması: sezon, marka, pay, lab_L, lab_a, lab_b, hex)."""
    tablolar = {r[0] for r in bag.execute("SELECT name FROM sqlite_master WHERE type IN ('table','view')")}
    if "parca_renk" not in tablolar:
        raise VeriYok("veritabanında 'parca_renk' tablosu yok")
    sutunlar = [r[1] for r in bag.execute("PRAGMA table_info(parca_renk)")]
    if "sezon" not in sutunlar or "pay" not in sutunlar:
        raise VeriYok(f"'parca_renk' şeması tanınmadı (sezon/pay sütunu yok): {sutunlar}")
    imlec = bag.execute("SELECT * FROM parca_renk WHERE sezon = ?", (sezon,))
    adlar = [c[0] for c in imlec.description]
    sonuc = [_satirdan(dict(zip(adlar, r, strict=True))) for r in imlec.fetchall()]
    return [s for s in sonuc if s is not None]


def parca_renklerini_oku(db: Path, sezon: str) -> list[tuple[Lab, float, str]]:
    """DB'deki sezonun parça renkleri. Veri modülü, DB ya da kayıt yoksa VeriYok."""
    try:
        depo_mod = importlib.import_module("moda_radar.veri.depo")
    except ModuleNotFoundError as h:
        raise VeriYok("veri modülü yok (moda_radar.veri.depo bulunamadı); önce veri katmanı kurulmalı") from h
    if not Path(db).exists():
        raise VeriYok(f"veritabanı yok: {db}. Önce 'python -m moda_radar topla --sezon {sezon} ...' çalıştırın.")
    depo = depo_mod.Depo(Path(db))
    try:
        sonuc = None
        for ad in ("parca_renkleri", "parca_renk_kayitlari"):
            yontem = getattr(depo, ad, None)
            if callable(yontem):
                sonuc = [s for s in (_satirdan(k) for k in yontem(sezon=sezon)) if s is not None]
                break
        if sonuc is None:
            bag = getattr(depo, "baglanti", None)
            if isinstance(bag, sqlite3.Connection):
                sonuc = _sqlite_oku(bag, sezon)
            else:
                with sqlite3.connect(f"file:{db}?mode=ro", uri=True) as bag:
                    sonuc = _sqlite_oku(bag, sezon)
    finally:
        kapat = getattr(depo, "kapat", None)
        if callable(kapat):
            kapat()
    if not sonuc:
        raise VeriYok(f"{db}: {sezon} sezonu için parca_renk kaydı yok (veritabanı boş ya da sezon taranmamış)")
    return sonuc


def _onceki_palet(args) -> list[PaletSatiri] | None:
    if not args.onceki:
        return None
    dosya = Path(args.cikti) / args.onceki / "palet.json"
    if dosya.exists():
        veri = json.loads(dosya.read_text(encoding="utf-8"))
        return [PaletSatiri.model_validate(s) for s in veri["satirlar"]]
    renkler = parca_renklerini_oku(args.db, args.onceki)
    return palet.sezon_paleti(renkler, None, args.onceki, esik_de=args.esik)


def _renk(args) -> int:
    if not SEZON_DESENI.match(args.sezon) or (args.onceki and not SEZON_DESENI.match(args.onceki)):
        print("Sezon SS27 veya FW27 biçiminde olmalı.")
        return 2
    try:
        renkler = parca_renklerini_oku(args.db, args.sezon)
        onceki = _onceki_palet(args)
    except VeriYok as h:
        print(f"Palet üretilemedi: {h}")
        return 1
    satirlar = palet.sezon_paleti(renkler, onceki, args.sezon, esik_de=args.esik)
    klasor = Path(args.cikti) / args.sezon
    klasor.mkdir(parents=True, exist_ok=True)
    baslik = f"# {args.sezon} sezon paleti\n\nParça rengi sayısı: {len(renkler)} · küme eşiği ΔE2000 < {args.esik:g}"
    if args.onceki:
        baslik += f" · karşılaştırma: {args.onceki}"
    (klasor / "palet.md").write_text(baslik + "\n\n" + rapor.palet_markdown(satirlar), encoding="utf-8")
    json_veri = {
        "sezon": args.sezon,
        "onceki": args.onceki,
        "esik_de": args.esik,
        "parca_rengi_sayisi": len(renkler),
        "satirlar": [s.model_dump(mode="json") for s in satirlar],
    }
    (klasor / "palet.json").write_text(json.dumps(json_veri, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if args.json:
        print(json.dumps(json_veri, ensure_ascii=False, indent=2))
    else:
        print(f"{len(satirlar)} renk kümesi → {klasor / 'palet.md'}, {klasor / 'palet.json'}")
    return 0

"""Görsel komutları (docs/ARAYUZ.md eklenti biçimi): `etiketle`, `etiket-uyum`.

`etiketle --sezon SS27 [--db] [--siniri 50] [--denetim]`: `gorsel` tablosundaki URL'leri kibar tarayıcıyla
(robots.txt, ≤ 1 istek/sn) yeniden indirir, bellekte etiketler, `parca_nitelik`'e yazar. `--denetim` ile zaten
etiketlenmiş görsellerden %5 örneklem denetim modeliyle ikinci kez etiketlenir (`denetim=1`).
`etiket-uyum --sezon SS27`: denetim çiftlerinden eksen başına κ tablosu; `docs/sezonlar/<SEZON>/etiket-uyum.md`.
"""

from __future__ import annotations

import logging
import math
import sqlite3
import sys
from datetime import date
from pathlib import Path

from moda_radar.gorsel.istem import ETIKET_EKSENLERI
from moda_radar.sema import SEZON_DESENI, Kaynak, KaynakTuru, NitelikKaydi

KOK = Path(__file__).resolve().parents[2]
VARSAYILAN_DB = Path("veri/moda.db")
SEZONLAR = KOK / "docs" / "sezonlar"
_NITELIK_ALANLARI = ETIKET_EKSENLERI  # parca_nitelik sütunları = NitelikKaydi eksenleri


def ekle(alt) -> list[str]:
    p = alt.add_parser("etiketle", help="DB'deki defile görsellerini yeniden indirip nitelik etiketler")
    p.add_argument("--sezon", required=True)
    p.add_argument("--db", type=Path, default=VARSAYILAN_DB)
    p.add_argument("--siniri", type=int, default=50, help="en fazla bu kadar görsel (varsayılan 50)")
    p.add_argument("--denetim", action="store_true", help="%%5 örneklemi denetim modeliyle ikinci kez etiketle")
    p.add_argument("--oran", type=float, default=0.05, help="denetim örneklem oranı")

    p = alt.add_parser("etiket-uyum", help="Toplu ve denetim etiketleri arasında eksen başına Cohen κ")
    p.add_argument("--sezon", required=True)
    p.add_argument("--db", type=Path, default=VARSAYILAN_DB)
    p.add_argument("--klasor", type=Path, default=SEZONLAR, help="raporun yazılacağı docs/sezonlar klasörü")
    from moda_radar.gorsel import oturum

    return ["etiketle", "etiket-uyum", *oturum.ekle(alt)]


def calistir(args) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    if args.komut in ("etiket-bekleyen", "etiket-yukle"):
        from moda_radar.gorsel import oturum

        if getattr(args, "sezon", None) and not SEZON_DESENI.match(args.sezon):
            print(f"sezon SS27/FW27 biçiminde olmalı: {args.sezon!r}", file=sys.stderr)
            return 2
        return oturum.calistir(args)
    if not SEZON_DESENI.match(args.sezon):
        print(f"sezon SS27/FW27 biçiminde olmalı: {args.sezon!r}", file=sys.stderr)
        return 2
    return {"etiketle": _etiketle, "etiket-uyum": _etiket_uyum}[args.komut](args)


# --- seçim ---


def etiketlenecek_gorseller(depo, sezon: str, *, denetim: bool, siniri: int, oran: float = 0.05) -> list[dict]:
    """Toplu: henüz toplu etiketi olmayan görseller. Denetim: toplu etiketi olup denetim etiketi olmayanlardan
    tekrarlanabilir örneklem (oran, tohum 7)."""
    from moda_radar.gorsel.uyum import denetim_ornekle

    def var_mi(d: int) -> str:
        return f"EXISTS (SELECT 1 FROM parca_nitelik n WHERE n.gorsel_id = g.id AND n.denetim = {d})"

    kosul = f"{var_mi(0)} AND NOT {var_mi(1)}" if denetim else f"NOT {var_mi(0)}"
    satirlar = [
        dict(r)
        for r in depo.baglanti.execute(
            "SELECT g.id, g.url, g.tarama_tarihi, d.sezon, d.marka FROM gorsel g JOIN defile d ON d.id = g.defile_id "
            f"WHERE d.sezon = ? AND {kosul} ORDER BY d.marka, g.sira",
            (sezon,),
        )
    ]
    if denetim:
        satirlar = denetim_ornekle(satirlar, oran=oran)
    return satirlar[:siniri]


def _etiketle(args) -> int:
    from moda_radar.gorsel.etiketle import Etiketleyici, anahtar_var
    from moda_radar.veri.ag import Tarayici
    from moda_radar.veri.depo import Depo

    if not anahtar_var():
        print("nitelik etiketleme kapalı: ANTHROPIC_API_KEY yok", file=sys.stderr)
        return 1
    etiketleyici = Etiketleyici(denetim=args.denetim)
    if etiketleyici.istemci is None:
        print("anthropic paketi yok: pip install 'moda-radar[gorsel]'", file=sys.stderr)
        return 1
    tarayici = Tarayici()
    yazilan = basarili = hatali = 0
    with Depo(args.db) as depo:
        gorseller = etiketlenecek_gorseller(depo, args.sezon, denetim=args.denetim, siniri=args.siniri, oran=args.oran)
        for g in gorseller:
            try:
                bayt = tarayici.getir(g["url"], kabul="image/*")
            except (OSError, RuntimeError) as e:  # ağ hatası ya da robots yasağı
                hatali += 1
                print(f"HATA {g['url']}: {e}", file=sys.stderr)
                continue
            kaynak = Kaynak(
                tur=KaynakTuru.PODYUM,
                url=g["url"],
                tarama_tarihi=date.fromisoformat(g["tarama_tarihi"]),
                sezon=g["sezon"],
                marka=g["marka"],
            )
            sonuc = etiketleyici.etiketle_ayrintili(bayt, kaynak, parca_onek=g["id"], gorsel_id=g["id"])
            del bayt  # ADR-002
            if sonuc.hata:
                hatali += 1
                continue
            yazilan += depo.ekle_parca_nitelik(sonuc.kayitlar, gorsel_id=g["id"])
            basarili += 1
    tur = "denetim" if args.denetim else "toplu"
    print(
        f"etiketle {args.sezon} ({tur}, {etiketleyici.model}): {basarili}/{len(gorseller)} görsel, "
        f"{yazilan} parça kaydı, {hatali} hata, {etiketleyici.uyari_sayisi} sözlük dışı değer, "
        f"{tarayici.istek_sayisi} istek"
    )
    return 0 if hatali == 0 or basarili > 0 else 1


# --- uyum ---


def _satir_kaydi(r: sqlite3.Row) -> NitelikKaydi:
    return NitelikKaydi(
        kaynak=Kaynak(
            tur=r["kaynak_tur"],
            url=r["kaynak_url"],
            tarama_tarihi=date.fromisoformat(r["tarama_tarihi"]),
            sezon=r["sezon"],
            segment=r["segment"],
            marka=r["marka"],
        ),
        parca_id=r["parca_id"],
        etiketleyen_model=r["etiketleyen_model"],
        denetim=bool(r["denetim"]),
        **{a: r[a] for a in _NITELIK_ALANLARI},
    )


def denetim_kayitlari(depo, sezon: str) -> tuple[list[NitelikKaydi], list[NitelikKaydi]]:
    """(toplu, denetim) podyum kayıtları."""
    sonuc: tuple[list, list] = ([], [])
    for r in depo.baglanti.execute(
        "SELECT * FROM parca_nitelik WHERE sezon = ? AND kaynak_tur = 'podyum' ORDER BY kaynak_url, parca_id", (sezon,)
    ):
        sonuc[1 if r["denetim"] else 0].append(_satir_kaydi(r))
    return sonuc


def uyum_markdown(sezon: str, kappalar: dict[str, float], cift_sayisi: int, modeller: tuple[str, str]) -> str:
    from moda_radar.gorsel.uyum import HEDEF_KAPPA

    satirlar = [
        f"# {sezon} etiket uyumu",
        "",
        (
            f"Oluşturma: {date.today().isoformat()} · toplu: `{modeller[0]}` · denetim: `{modeller[1]}` · "
            f"{cift_sayisi} parça çifti · hedef κ ≥ {HEDEF_KAPPA:.2f} (ADR-004)"
        ),
        "",
        "| Eksen | Cohen κ | Durum |",
        "| --- | ---: | --- |",
    ]
    for eksen, k in kappalar.items():
        if math.isnan(k):
            satirlar.append(f"| {eksen} | — | veri yok |")
        else:
            durum = "tamam" if k >= HEDEF_KAPPA else "düşük: önce sözlüğü daralt, sonra istemi düzelt"
            satirlar.append(f"| {eksen} | {k:.2f} | {durum} |")
    if not kappalar:
        satirlar.append("| — | — | denetim çifti yok (`etiketle --denetim` çalıştırın) |")
    return "\n".join(satirlar) + "\n"


def _etiket_uyum(args) -> int:
    from moda_radar.gorsel.uyum import ciftler, eksen_uyumu
    from moda_radar.veri.depo import Depo

    with Depo(args.db) as depo:
        toplu, denetim = denetim_kayitlari(depo, args.sezon)
    eslesen = ciftler(toplu, denetim)
    kappalar = eksen_uyumu(toplu, denetim)

    def modeller(ks: list[NitelikKaydi]) -> str:
        return ", ".join(sorted({k.etiketleyen_model for k in ks})) or "—"

    md = uyum_markdown(
        args.sezon, kappalar, len(eslesen), (modeller([a for a, _ in eslesen]), modeller([b for _, b in eslesen]))
    )
    print(md, end="")
    hedef = args.klasor / args.sezon / "etiket-uyum.md"
    hedef.parent.mkdir(parents=True, exist_ok=True)
    hedef.write_text(md, "utf-8")
    print(f"yazıldı: {hedef}")
    return 0 if eslesen else 1

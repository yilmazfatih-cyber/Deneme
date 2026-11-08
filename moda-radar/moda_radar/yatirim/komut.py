"""Komutlar: `sor` (tek ürün için yatırım kartı) ve `yatirim` (sezon × segment için kart listesi + çıkış uyarısı)."""

from __future__ import annotations

import argparse
import difflib
import json
import sys
from datetime import date
from pathlib import Path

from moda_radar.sema import SEZON_DESENI, SegmentTanimi, TahminKaydi
from moda_radar.yatirim import ayar, boyutlar, cikis_uyarisi, kart, kaynaklar, segment_profili

EKSENLER = ("renk", "siluet", "kumas_gorunumu", "desen", "detay")
VARSAYILAN_SINYAL = ayar.ICERIK / "sinyaller"
VARSAYILAN_DB = ayar.KOK / "veri" / "moda.db"
VARSAYILAN_CIKTI = ayar.KOK / "docs" / "sezonlar"


class GirdiHatasi(ValueError):
    pass


def _tarih(s: str) -> date:
    return date.fromisoformat(s)


def ekle(alt) -> list[str]:
    s = alt.add_parser("sor", help="Tek ürün için yatırım kartı (beş boyut ayrı)")
    s.add_argument("--segment", required=True)
    s.add_argument("--kategori", required=True)
    s.add_argument("--renk", required=True, help="'#2E5A88' ya da '19-4052 TCX'")
    s.add_argument("--desen", required=True)
    s.add_argument("--siluet", required=True)
    s.add_argument("--kumas", required=True, help="kumaş görünümü (taksonomi)")
    s.add_argument("--detay", default="yok")
    s.add_argument("--hedef-fiyat", type=float)
    s.add_argument("--maliyet", type=float, help="adet maliyeti TL")
    s.add_argument("--rakip", type=int, help="bu ürünü rafında taşıyan rakip sayısı")
    s.add_argument("--sezon", help="hedef satış sezonu; yoksa sipariş penceresi en yakın sezon")
    s.add_argument("--ulke", default="TR")
    s.add_argument("--db", type=Path, default=VARSAYILAN_DB)
    s.add_argument("--sinyaller", type=Path, default=VARSAYILAN_SINYAL)
    s.add_argument("--bugun", type=_tarih, help="YYYY-AA-GG; zamanlama için bugünün tarihi")
    s.add_argument("--json", action="store_true")

    y = alt.add_parser("yatirim", help="Sezon × segment yatırım kartları ve çıkış uyarısı")
    y.add_argument("--sezon", required=True)
    y.add_argument("--segment", default="hepsi")
    y.add_argument("--kategori", required=True)
    y.add_argument("--ilk", type=int, default=20)
    y.add_argument("--ulke", default="TR")
    y.add_argument("--db", type=Path, default=VARSAYILAN_DB)
    y.add_argument("--sinyaller", type=Path, default=VARSAYILAN_SINYAL)
    y.add_argument("--cikti", type=Path, default=VARSAYILAN_CIKTI)
    y.add_argument("--bugun", type=_tarih)
    return ["sor", "yatirim"]


def calistir(args) -> int:
    try:
        if args.komut == "sor":
            return sor(args)
        if args.komut == "yatirim":
            return yatirim(args)
    except (GirdiHatasi, kaynaklar.RenkHatasi) as h:
        print(f"Hata: {h}", file=sys.stderr)
        return 2
    raise ValueError(args.komut)


# --- Girdi denetimi --------------------------------------------------------------------------------------------


def _yakin(deger: str, secenekler: list[str]) -> str:
    yakin = difflib.get_close_matches(deger, secenekler, n=3, cutoff=0.5)
    return f"En yakın: {', '.join(yakin)}." if yakin else f"Geçerli değerler: {', '.join(secenekler)}."


def taksonomi_denetle(eksen: str, deger: str) -> str:
    secenekler = ayar.taksonomi().eksenler[eksen]
    if deger not in secenekler:
        raise GirdiHatasi(f"'{deger}' {eksen} sözlüğünde yok. {_yakin(deger, secenekler)}")
    return deger


def segment_denetle(kod: str) -> SegmentTanimi:
    kodlar = [s.kod for s in ayar.segment_dosyasi().segmentler]
    if kod not in kodlar:
        raise GirdiHatasi(f"'{kod}' segment değil. {_yakin(kod, kodlar)}")
    return ayar.segment(kod)


def sezon_denetle(sezon: str) -> str:
    sezon = sezon.upper()
    if not SEZON_DESENI.match(sezon):
        raise GirdiHatasi(f"Sezon '{sezon}' tanınmadı; SS27 ya da FW27 biçiminde verin.")
    return sezon


# --- sor -------------------------------------------------------------------------------------------------------


def urun_karti(
    sezon: str,
    ulke: str,
    segment: SegmentTanimi,
    urun: dict,
    sinyaller: list,
    gozlemler: list,
    esikler: dict,
    notlar: list[str],
    *,
    hedef_fiyat: float | None = None,
    maliyet_adet: float | None = None,
    rakip: int | None = None,
    bugun: date | None = None,
    onbellek: dict | None = None,
) -> tuple:
    """Eksen tahminleri → birleşik ivme → kart. (kart, ayrıntı, eksen tahminleri) döner."""
    onbellek = onbellek if onbellek is not None else {}
    tahminler: dict[str, TahminKaydi] = {}
    for eksen in EKSENLER:
        deger = urun["renk_tcx"] if eksen == "renk" else urun[eksen]
        anahtar = (eksen, deger)
        if anahtar not in onbellek:
            onbellek[anahtar] = kaynaklar.eksen_tahmini(
                sezon, ulke, segment, urun["kategori"], eksen, deger, sinyaller, gozlemler, esikler
            )
        t, not_ = onbellek[anahtar]
        tahminler[eksen] = t
        if not_ and not_ not in notlar:
            notlar.append(not_)
    birlesik, durum = kaynaklar.birlestir(tahminler, esikler)
    try:
        maliyet = ayar.maliyet(urun["kategori"])
    except (OSError, ValueError) as h:
        raise GirdiHatasi(f"Maliyet dosyası okunamadı: {h}") from h
    try:
        k, a = kart.uret_paket(
            birlesik,
            {**urun, "sezon": sezon},
            segment,
            maliyet=maliyet,
            hedef_fiyat=hedef_fiyat,
            maliyet_adet=maliyet_adet,
            rakip_sayisi=rakip,
            bugun=bugun,
            esikler=esikler,
            sinyal_durumu=durum,
            eksen_tahminleri=tahminler,
            notlar=notlar,
        )
    except ValueError as h:
        raise GirdiHatasi(str(h)) from h
    return k, a, tahminler


def sor(args) -> int:
    segment = segment_denetle(args.segment)
    kategori = taksonomi_denetle("kategori", args.kategori)
    urun = {
        "kategori": kategori,
        "siluet": taksonomi_denetle("siluet", args.siluet),
        "kumas_gorunumu": taksonomi_denetle("kumas_gorunumu", args.kumas),
        "desen": taksonomi_denetle("desen", args.desen),
        "detay": taksonomi_denetle("detay", args.detay),
    }
    renk = kaynaklar.renk_coz(args.renk)
    notlar = list(renk.pop("notlar"))
    urun |= {k: renk[k] for k in ("renk_tcx", "renk_hex", "renk_ad")}
    bugun = args.bugun or date.today()
    sezon = sezon_denetle(args.sezon) if args.sezon else boyutlar.siradaki_sezon(bugun)
    if args.rakip is not None and args.rakip < 0:
        raise GirdiHatasi("Rakip sayısı negatif olamaz.")
    esikler = ayar.esikler()
    sinyaller, gozlemler, vnotlar = kaynaklar.veri_yukle(args.db, args.sinyaller, args.ulke, segment.kod, kategori)
    notlar += vnotlar
    k, a, _ = urun_karti(
        sezon,
        args.ulke,
        segment,
        urun,
        sinyaller,
        gozlemler,
        esikler,
        notlar,
        hedef_fiyat=args.hedef_fiyat,
        maliyet_adet=args.maliyet,
        rakip=args.rakip,
        bugun=bugun,
    )
    if args.json:
        print(json.dumps({"kart": k.model_dump(mode="json"), "ayrinti": a}, ensure_ascii=False, indent=2))
    else:
        print(kart.markdown(k, a))
    return 0


# --- yatirim ---------------------------------------------------------------------------------------------------


def _renk_hex(kod: str) -> tuple[str, str]:
    try:
        r = kaynaklar.renk_coz(kod)
    except kaynaklar.RenkHatasi:
        return "", ""
    return r["renk_hex"], r["renk_ad"]


def _ozet_tablosu(kartlar: list) -> list[str]:
    satirlar = [
        "| # | Ürün | İvme · yön | Uyum | Zamanlama | Marj | Stok riski | Karar |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for i, (k, _) in enumerate(kartlar, 1):
        b = k.boyutlar
        satirlar.append(
            f"| {i} | {kart.baslik(k)} | {kart._s(b.trend_ivmesi)} · {kart.kural.YON_ADI[b.trend_yonu.value]} | "
            f"{kart._s(b.segment_uyumu)} | {kart.kural.ZAMAN_ADI[b.zamanlama]} | {kart._y(b.marj_yuzde)} | "
            f"{kart.kural.RISK_ADI[b.stok_riski]} | **{k.karar.value}** |"
        )
    return satirlar


def yatirim(args) -> int:
    sezon = sezon_denetle(args.sezon)
    kategori = taksonomi_denetle("kategori", args.kategori)
    kodlar = [s.kod for s in ayar.segment_dosyasi().segmentler] if args.segment == "hepsi" else [args.segment]
    segmentler = [segment_denetle(k) for k in kodlar]
    bugun = args.bugun or date.today()
    esikler = ayar.esikler()
    sinyaller, gozlemler, vnotlar = kaynaklar.veri_yukle(args.db, args.sinyaller, args.ulke, None, kategori)
    klasor = args.cikti / sezon
    klasor.mkdir(parents=True, exist_ok=True)

    for segment in segmentler:
        notlar = list(vnotlar)
        onbellek: dict = {}
        # Renk adayları: sinyallerdeki TCX kodları, tahmin olasılığına (eşitlikte podyum payına) göre ilk N.
        renk_pay: dict[str, float] = {}
        for s in sinyaller:
            if s.nitelik_ekseni == "renk":
                renk_pay[s.nitelik_degeri] = max(renk_pay.get(s.nitelik_degeri, 0), s.podyum_payi)
        adaylar = []
        for kod, pay in renk_pay.items():
            t, n = kaynaklar.eksen_tahmini(
                sezon, args.ulke, segment, kategori, "renk", kod, sinyaller, gozlemler, esikler
            )
            onbellek[("renk", kod)] = (t, n)
            adaylar.append((t.olasilik, pay, kod))
        adaylar.sort(key=lambda x: (-x[0], -x[1], x[2]))

        tipik = {e: segment_profili.tipik(segment.kod, e)[0] for e in ("siluet", "kumas_gorunumu", "desen")}
        kartlar = []
        for _, _, kod in adaylar[: args.ilk]:
            hex_, ad = _renk_hex(kod)
            urun = {"kategori": kategori, **tipik, "detay": "yok", "renk_tcx": kod, "renk_hex": hex_, "renk_ad": ad}
            k, a, _ = urun_karti(
                sezon, args.ulke, segment, urun, sinyaller, gozlemler, esikler, notlar, bugun=bugun, onbellek=onbellek
            )
            kartlar.append((k, a))

        # Çıkış uyarısı: sinyali olan tüm nitelik değerleri için bu segmentteki tahmin.
        degerler = sorted({(s.nitelik_ekseni, s.nitelik_degeri) for s in sinyaller})
        tahminler = []
        for eksen, deger in degerler:
            if (eksen, deger) not in onbellek:
                onbellek[(eksen, deger)] = kaynaklar.eksen_tahmini(
                    sezon, args.ulke, segment, kategori, eksen, deger, sinyaller, gozlemler, esikler
                )
            tahminler.append(onbellek[(eksen, deger)][0])
        cikis = cikis_uyarisi.listele(tahminler, esikler)

        md = [
            f"# Yatırım kartları — {sezon} · {segment.ad} (`{segment.kod}`) · {kart.g(kategori)}",
            "",
            f"> {kart.UYARI}",
            "",
            (
                f"Üretim tarihi {bugun.isoformat()} · kural {esikler['surum']} · ilk {args.ilk} renk × segmentin tipik "
                f"siluet / kumaş / desen değeri ({', '.join(kart.g(v) for v in tipik.values())}; uzman önseli)."
            ),
            "",
        ]
        if not kartlar:
            md += ["Renk sinyali bulunamadı; kart üretilmedi.", ""]
        else:
            md += ["## Özet (beş boyut ayrı; tek skor yok)", "", *_ozet_tablosu(kartlar), "", "## Kartlar", ""]
            for k, a in kartlar:
                md += ["#" + kart.markdown(k, a), "---", ""]
        md += ["## Çıkış uyarısı", ""]
        if cikis:
            md += [
                "| Eksen | Değer | Olasılık | Ufuk | İndirim zamanı | Öneri |",
                "| --- | --- | --- | --- | --- | --- |",
            ]
            md += [
                f"| {c['nitelik_ekseni']} | {kart.g(c['nitelik_degeri'])} | {kart._s(c['olasilik'])} | "
                f"{c['ufuk_sezon']} | {c['indirim_zamani']} | {c['oneri']} |"
                for c in cikis
            ]
        else:
            md.append("Yönü çıkış olan nitelik yok.")
        if notlar:
            md += ["", "**Notlar**", "", *[f"- {n}" for n in notlar]]
        md += ["", f"> {kart.UYARI}", ""]

        ad = f"yatirim-{segment.kod}"
        (klasor / f"{ad}.md").write_text("\n".join(md), "utf-8")
        (klasor / f"{ad}.json").write_text(
            json.dumps(
                {
                    "sezon": sezon,
                    "segment": segment.kod,
                    "kategori": kategori,
                    "uyari": kart.UYARI,
                    "kartlar": [{"kart": k.model_dump(mode="json"), "ayrinti": a} for k, a in kartlar],
                    "cikis_uyarisi": cikis,
                    "notlar": notlar,
                },
                ensure_ascii=False,
                indent=2,
            ),
            "utf-8",
        )
        print(f"{segment.kod}: {len(kartlar)} kart, {len(cikis)} çıkış uyarısı → {klasor / ad}.md")
    return 0


def main(argv: list[str] | None = None) -> int:  # yalnız doğrudan çalıştırma ve test için
    p = argparse.ArgumentParser(prog="moda_radar.yatirim")
    alt = p.add_subparsers(dest="komut", required=True)
    ekle(alt)
    return calistir(p.parse_args(argv))

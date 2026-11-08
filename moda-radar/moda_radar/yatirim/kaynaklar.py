"""Diğer modüllere isteğe bağlı köprü: renk (renk-bilimci), tahmin (trend-modelci), veri (veri-mühendisi).

Modül yoksa yatırım katmanı çalışmaya devam eder ve karta not düşer. Testler `modul()` fonksiyonunu
değiştirerek modüllerin yokluğunu taklit eder.
"""

from __future__ import annotations

import importlib
import json
import re
from pathlib import Path
from types import ModuleType

from pydantic import ValidationError

from moda_radar.sema import HEX_DESENI, GozlemKaydi, SegmentTanimi, SinyalKaydi, TahminKaydi, Yon
from moda_radar.yatirim import ayar, boyutlar

TCX_GEVSEK = re.compile(r"^(\d{2})-(\d{4})(?:\s*TCX)?$", re.IGNORECASE)


def modul(ad: str) -> ModuleType | None:
    """`moda_radar.<ad>` içe aktarılabiliyorsa modül, değilse None."""
    try:
        return importlib.import_module(f"moda_radar.{ad}")
    except ImportError:
        return None


# --- Renk ------------------------------------------------------------------------------------------------------


class RenkHatasi(ValueError):
    pass


def renk_coz(girdi: str) -> dict:
    """'#2E5A88' ya da '19-4052 TCX' → {renk_tcx, renk_hex, renk_ad, delta_e, guven, notlar}."""
    girdi = girdi.strip()
    pantone = modul("renk.pantone")
    notlar: list[str] = []
    if HEX_DESENI.match(girdi):
        hex_ = girdi.upper()
        if pantone is None:
            notlar.append("Renk modülü yok; TCX eşlemesi yapılmadı, renk hex olarak kullanıldı.")
            return {"renk_tcx": hex_, "renk_hex": hex_, "renk_ad": "", "notlar": notlar}
        birinci, ikinci = pantone.esle(hex_)
        notlar.append(
            f"Renk {hex_} → {birinci.kod} (ΔE {birinci.delta_e:.1f}, {birinci.guven}); ikinci aday {ikinci.kod}."
        )
        return {
            "renk_tcx": birinci.kod,
            "renk_hex": hex_,
            "renk_ad": birinci.ad or "",
            "delta_e": birinci.delta_e,
            "guven": birinci.guven,
            "notlar": notlar,
        }
    m = TCX_GEVSEK.match(girdi)
    if not m:
        raise RenkHatasi(f"Renk tanınmadı: '{girdi}'. '#RRGGBB' ya da '19-4052 TCX' biçiminde verin.")
    kod = f"{m.group(1)}-{m.group(2)} TCX"
    if pantone is not None and hasattr(pantone, "kod_ile"):
        es = pantone.kod_ile(kod)
        if es is not None:
            return {"renk_tcx": es.kod, "renk_hex": es.hex, "renk_ad": es.ad or "", "notlar": notlar}
        notlar.append(f"{kod} Pantone tablosunda bulunamadı.")
        return {"renk_tcx": kod, "renk_hex": "", "renk_ad": "", "notlar": notlar}
    satir = ayar.pantone_tablosu().get(kod)
    notlar.append("Renk modülü yok; renk kod olarak kabul edildi.")
    if satir is None:
        notlar.append(f"{kod} content/pantone/tcx.json'da yok; renk ailesi bilinmiyor.")
        return {"renk_tcx": kod, "renk_hex": "", "renk_ad": "", "notlar": notlar}
    return {"renk_tcx": kod, "renk_hex": satir["hex"].upper(), "renk_ad": satir.get("ad", ""), "notlar": notlar}


# --- Veri ------------------------------------------------------------------------------------------------------


def sinyal_klasoru_oku(klasor: Path) -> list[SinyalKaydi]:
    """`content/sinyaller/*.json` doğrudan: {"sezon": "SS27", "sinyaller": [...]}; `ornek: true` dosyalar atlanır."""
    kayitlar: list[SinyalKaydi] = []
    if not klasor.is_dir():
        return kayitlar
    for yol in sorted(klasor.glob("*.json")):
        veri = json.loads(yol.read_text("utf-8"))
        if veri.get("ornek"):
            continue
        for s in veri.get("sinyaller", []):
            kayitlar.append(SinyalKaydi.model_validate({"sezon": veri.get("sezon"), **s}))
    return kayitlar


def veri_yukle(
    db: Path | None, klasor: Path, ulke: str, segment: str | None, kategori: str | None
) -> tuple[list[SinyalKaydi], list[GozlemKaydi], list[str]]:
    """Önce DB (veri.depo.Depo), yoksa veri.sinyal.yukle, yoksa klasör doğrudan."""
    notlar: list[str] = []
    depo = modul("veri.depo")
    if db is not None and db.exists() and depo is not None:
        d = depo.Depo(db)
        return list(d.sinyaller()), list(d.gozlemler(ulke=ulke, segment=segment, kategori=kategori)), notlar
    if db is not None and db.exists():
        notlar.append("Veri modülü yok; veritabanı okunamadı, content/sinyaller kullanıldı.")
    sinyal = modul("veri.sinyal")
    try:
        sinyaller = list(sinyal.yukle(klasor)) if sinyal is not None else sinyal_klasoru_oku(klasor)
    except (OSError, ValueError, ValidationError) as h:
        notlar.append(f"Sinyal dosyaları okunamadı: {h.__class__.__name__}.")
        sinyaller = []
    if not sinyaller:
        notlar.append("Sinyal kaydı bulunamadı.")
    return sinyaller, [], notlar


# --- Tahmin ----------------------------------------------------------------------------------------------------


def podyum_sezonu_onsel(hedef_sezon: str, segment: SegmentTanimi) -> str:
    """Hedef raf sezonundan segment gecikme önseli kadar geri: sinyal yokken varsayılan podyum sezonu."""
    return boyutlar.sezon_ekle(hedef_sezon, -round(segment.gecikme_onsel["mod"]))


def yedek_tahmin(
    sezon: str, ulke: str, segment: SegmentTanimi, kategori: str, eksen: str, deger: str, esikler: dict, neden: str
) -> TahminKaydi:
    """Tahmin modülü yokken: olasılık 0,5, kaynak 0, yön düz (ilke 1: bilgi yok = 0,5). `sezon` hedef raf sezonudur."""
    return TahminKaydi(
        sezon=podyum_sezonu_onsel(sezon, segment),
        ulke=ulke,
        segment=segment.kod,
        kategori=kategori,
        nitelik_ekseni=eksen,
        nitelik_degeri=deger,
        olasilik=0.5,
        esik_raf_payi=esikler["varsayilan_esik_raf_payi"],
        ufuk_sezon=sezon,
        yon=Yon.DUZ,
        gecikme_sezon=segment.gecikme_onsel["mod"],
        gecikme_kaynagi="onsel",
        kaynak_sayisi=0,
        model_surumu="tahmin-yok",
        gerekce=neden,
    )


def eksen_tahmini(
    sezon: str,
    ulke: str,
    segment: SegmentTanimi,
    kategori: str,
    eksen: str,
    deger: str,
    sinyaller: list[SinyalKaydi],
    gozlemler: list[GozlemKaydi],
    esikler: dict,
) -> tuple[TahminKaydi, str | None]:
    """Hedef raf sezonu `sezon` için bir eksen değerinin tahmini; modül yoksa ya da hata verirse yedek ve not.

    `tahmin_et`'in `sezon`u PODYUM sezonudur (ufuk = podyum + gecikme). Bu değerin sinyali olan podyum sezonları
    denenir; ufku hedef sezona en yakın olan (eşitlikte en yeni podyum) seçilir. Sinyal yoksa podyum sezonu
    segment gecikme önselinden türetilir.
    """
    model = modul("tahmin.model")
    if model is None:
        return yedek_tahmin(sezon, ulke, segment, kategori, eksen, deger, esikler, "tahmin modülü yok"), (
            "Tahmin modülü yok; olasılıklar 0,5 alındı."
        )
    adaylar = sorted(
        {s.sezon for s in sinyaller if s.nitelik_ekseni == eksen and s.nitelik_degeri == deger},
        key=boyutlar.sezon_sirasi,
    )
    if not adaylar:  # sinyal yok: önsel podyum sezonu ve komşuları (tahmin modülü ufku takvime oturtur)
        onsel = podyum_sezonu_onsel(sezon, segment)
        adaylar = [boyutlar.sezon_ekle(onsel, n) for n in (-1, 0, 1)]
    hedef = boyutlar.sezon_sirasi(sezon)
    try:
        sonuclar = [
            TahminKaydi.model_validate(
                model.tahmin_et(
                    p, ulke, segment.kod, kategori, eksen, deger, sinyaller, gozlemler, ayar.segment_dosyasi()
                )
            )
            for p in adaylar
        ]
    except Exception as h:  # noqa: BLE001 — tahmin hatası kartı durdurmaz, kartta görünür
        neden = f"tahmin modülü hata verdi ({h.__class__.__name__})"
        return yedek_tahmin(sezon, ulke, segment, kategori, eksen, deger, esikler, neden), f"{eksen}: {neden}."
    secilen = min(
        sonuclar,
        key=lambda t: (abs(boyutlar.sezon_sirasi(t.ufuk_sezon) - hedef), -boyutlar.sezon_sirasi(t.sezon)),
    )
    return secilen, None


def _s(x: float) -> str:
    return f"{x:.2f}".replace(".", ",")


def birlestir(tahminler: dict[str, TahminKaydi], esikler: dict) -> tuple[TahminKaydi, str]:
    """Eksen tahminlerinden ürün düzeyi ivme: ağırlıklı ortalama. Sinyal durumunu da döner.

    Bu tek skor değildir: yalnız "trend ivmesi" boyutunun girdisidir; diğer dört boyut ayrı kalır (ilke 6).
    Yön ağırlıklı oyla seçilir; ağırlığı `cikis_baskin_agirlik` ve üstü olan bir eksen çıkıştaysa yön çıkıştır.
    """
    w = {e: a for e, a in esikler["eksen_agirliklari"].items() if a > 0 and e in tahminler}
    toplam = sum(w.values())
    olasilik = sum(a * tahminler[e].olasilik for e, a in w.items()) / toplam
    oylar: dict[Yon, float] = {}
    for e, a in w.items():
        oylar[tahminler[e].yon] = oylar.get(tahminler[e].yon, 0) + a
    ana = tahminler.get("renk") or next(iter(tahminler.values()))
    yon = max(oylar, key=lambda y: (oylar[y], y == ana.yon))
    # Ağır eksen (renk, siluet) çıkıştaysa ürün çıkıştadır: stok o eksende kalır.
    if any(tahminler[e].yon == Yon.CIKIS and a >= esikler["cikis_baskin_agirlik"] for e, a in w.items()):
        yon = Yon.CIKIS

    kaynakli = [e for e in w if tahminler[e].kaynak_sayisi > 0]
    if not kaynakli:
        durum = "yok"
    else:
        olas = [tahminler[e].olasilik for e in kaynakli]
        yukselen = sum(a for e, a in w.items() if tahminler[e].yon in (Yon.GIRIS, Yon.YUKSELIS))
        cikan = sum(a for e, a in w.items() if tahminler[e].yon == Yon.CIKIS)
        metin = " ".join(tahminler[e].gerekce.lower() for e in kaynakli)
        celiskili = (
            max(olas) - min(olas) >= esikler["celiski_olasilik_farki"]
            or (yukselen >= 0.25 and cikan >= 0.25)
            or "talep yok" in metin
            or "çelişk" in metin
        )
        durum = "celiskili" if celiskili else "tutarli"

    surumler = sorted({t.model_surumu for t in tahminler.values()})
    ozet = " · ".join(f"{e} {_s(tahminler[e].olasilik)}" for e in w)
    birlesik = TahminKaydi(
        sezon=ana.sezon,
        ulke=ana.ulke,
        segment=ana.segment,
        kategori=ana.kategori,
        nitelik_ekseni="urun",
        nitelik_degeri="kombinasyon",
        olasilik=round(olasilik, 3),
        esik_raf_payi=ana.esik_raf_payi,
        ufuk_sezon=ana.ufuk_sezon,
        yon=yon,
        gecikme_sezon=ana.gecikme_sezon,
        gecikme_kaynagi=ana.gecikme_kaynagi,
        kaynak_sayisi=sum(t.kaynak_sayisi for t in tahminler.values()),
        model_surumu="+".join(surumler),
        gerekce=f"Eksen ağırlıklı olasılık: {ozet}."[:400],
    )
    return birlesik, durum

"""Ürün bazlı yatırım kartı. Beş boyut ayrı tablo satırlarında; tek skor yoktur (ilke 6).
Her kartın en altında "Yatırım tavsiyesi değildir; karar satın almacınındır." (ilke 8).
"""

from __future__ import annotations

from datetime import date

from moda_radar.sema import SegmentTanimi, TahminKaydi, YatirimKarti
from moda_radar.yatirim import ayar, boyutlar, kural

UYARI = "Yatırım tavsiyesi değildir; karar satın almacınındır."

GORUNEN = {
    "kadin-ust": "Kadın üst",
    "kadin-alt": "Kadın alt",
    "kadin-elbise": "Kadın elbise",
    "kadin-dis": "Kadın dış giyim",
    "erkek-ust": "Erkek üst",
    "erkek-alt": "Erkek alt",
    "erkek-dis": "Erkek dış giyim",
    "aksesuar": "Aksesuar",
    "duz": "düz",
    "a-kesim": "A kesim",
    "yapili-omuz": "yapılı omuz",
    "beli-vurgulu": "beli vurgulu",
    "tul": "tül",
    "suet": "süet",
    "cizgili": "çizgili",
    "cicekli": "çiçekli",
    "hayvan": "hayvan deseni",
    "yok": "detaysız",
    "firfir": "fırfır",
    "buzgu": "büzgü",
    "nakis": "nakış",
    "dugme-on": "önden düğmeli",
    "fermuar-gorunur": "görünür fermuar",
    "cep-kapakli": "kapaklı cep",
    "yirtmac": "yırtmaç",
    "bilinmiyor": "bilinmiyor",
}
EKSEN_ADI = {"renk": "Renk", "siluet": "Siluet", "kumas_gorunumu": "Kumaş görünümü", "desen": "Desen", "detay": "Detay"}
URUN_ANAHTARLARI = (
    "kategori",
    "siluet",
    "kumas_gorunumu",
    "desen",
    "detay",
    "renk_tcx",
    "renk_hex",
    "renk_ad",
    "sezon",
)


def g(deger: str) -> str:
    return GORUNEN.get(deger, deger)


def _s(x: float) -> str:
    return f"{x:.2f}".replace(".", ",")


def _y(x: float) -> str:
    return f"%{x:.1f}".replace(".", ",")


def _tl(x: float) -> str:
    return f"{x:,.0f}".replace(",", ".") + " TL"


def uret_paket(
    tahmin: TahminKaydi,
    urun: dict,
    segment: SegmentTanimi,
    *,
    maliyet: dict | None = None,
    hedef_fiyat: float | None = None,
    maliyet_adet: float | None = None,
    rakip_sayisi: int | None = None,
    bugun: date | None = None,
    esikler: dict | None = None,
    sinyal_durumu: kural.SinyalDurumu = "tutarli",
    eksen_tahminleri: dict[str, TahminKaydi] | None = None,
    notlar: list[str] | None = None,
) -> tuple[YatirimKarti, dict]:
    """Kart ve kartın Markdown'ı için ayrıntı (açıklamalar, eksen olasılıkları, notlar)."""
    e = esikler or ayar.esikler()
    b, ayrinti = boyutlar.hesapla_ayrintili(
        tahmin, urun, segment, maliyet, hedef_fiyat, maliyet_adet, rakip_sayisi, bugun, e
    )
    karar, gerekce = kural.karar_ver(b, e, segment.kod, sinyal_durumu)
    sinyal = kural.degistirecek_sinyal(b, karar, e, segment.kod, sinyal_durumu)
    kart = YatirimKarti(
        sezon=urun.get("sezon", tahmin.sezon),
        ulke=tahmin.ulke,
        segment=segment.kod,
        urun={k: str(urun[k]) for k in URUN_ANAHTARLARI if urun.get(k) not in (None, "")},
        boyutlar=b,
        karar=karar,
        gerekce=gerekce,
        degistirecek_sinyal=sinyal,
        kaynak_sayisi=tahmin.kaynak_sayisi,
        model_surumu=f"{tahmin.model_surumu} · {e['surum']}",
        uyari=UYARI,
    )
    ayrinti |= {
        "segment_adi": segment.ad,
        "sinyal_durumu": sinyal_durumu,
        "eksen_agirliklari": e["eksen_agirliklari"],
        "eksen_tahminleri": [t.model_dump(mode="json") for t in (eksen_tahminleri or {}).values()],
        "notlar": list(notlar or []),
    }
    return kart, ayrinti


def uret(tahmin: TahminKaydi, urun: dict, segment: SegmentTanimi, **kw) -> YatirimKarti:
    return uret_paket(tahmin, urun, segment, **kw)[0]


def baslik(kart: YatirimKarti) -> str:
    u = kart.urun
    parcalar = [g(u["kategori"]), g(u["siluet"]), g(u["kumas_gorunumu"]), g(u["desen"])]
    if u.get("detay") and u["detay"] != "yok":
        parcalar.append(g(u["detay"]))
    renk = u["renk_tcx"] + (f" ({u['renk_ad']})" if u.get("renk_ad") else "")
    return " · ".join([*parcalar, renk])


def markdown(kart: YatirimKarti, ayrinti: dict | None = None) -> str:
    a = ayrinti or {}
    b = kart.boyutlar
    agir = a.get("eksen_agirliklari", {})
    ivme_dayanak = "eksen ağırlıklı olasılık" + (
        " (" + " · ".join(f"{EKSEN_ADI.get(k, k).lower()} {_s(v)}" for k, v in agir.items() if v > 0) + ")"
        if agir
        else ""
    )
    marj_deger = _y(b.marj_yuzde) + (f" (hedef %{a['marj_hedef']:g})" if "marj_hedef" in a else "")
    marj_dayanak = (
        f"fiyat {_tl(a['hedef_fiyat'])} ({a['hedef_fiyat_kaynagi']}); maliyet {_tl(a['maliyet'])} ({a['maliyet_kaynagi']})"
        if "hedef_fiyat" in a
        else ""
    )
    satirlar = [
        f"# {baslik(kart)}",
        "",
        f"**Segment:** {a.get('segment_adi', kart.segment)} (`{kart.segment}`) · **Sezon:** {kart.sezon} · "
        f"**Ülke:** {kart.ulke}" + (f" · **Renk hex:** {kart.urun['renk_hex']}" if kart.urun.get("renk_hex") else ""),
        "",
        "| Boyut | Değer | Dayanak |",
        "| --- | --- | --- |",
        f"| Trend ivmesi | {_s(b.trend_ivmesi)} · {kural.YON_ADI[b.trend_yonu.value]} | {ivme_dayanak} |",
        f"| Segment uyumu | {_s(b.segment_uyumu)} | {a.get('uyum_aciklama', '')} |",
        f"| Zamanlama | {kural.ZAMAN_ADI[b.zamanlama]} | {a.get('zamanlama_aciklama', '')} |",
        f"| Maliyet ve marj | {marj_deger} | {marj_dayanak} |",
        f"| Stok riski | {kural.RISK_ADI[b.stok_riski]} | {a.get('stok_aciklama', '')} |",
        "",
    ]
    eksenler = a.get("eksen_tahminleri") or []
    if eksenler:
        satirlar += [
            "**Eksen olasılıkları**",
            "",
            "| Eksen | Değer | Olasılık | Yön | Ufuk | Eşik raf payı | Kaynak | Gerekçe |",
            "| --- | --- | --- | --- | --- | --- | --- | --- |",
        ]
        for t in eksenler:
            satirlar.append(
                f"| {EKSEN_ADI.get(t['nitelik_ekseni'], t['nitelik_ekseni'])} | {g(t['nitelik_degeri'])} | "
                f"{_s(t['olasilik'])} | {kural.YON_ADI.get(t['yon'], t['yon'])} | {t['ufuk_sezon']} | "
                f"%{t['esik_raf_payi'] * 100:g} | {t['kaynak_sayisi']} | {t['gerekce'].replace('|', '/')} |"
            )
        satirlar.append("")
    satirlar += [
        f"**Karar: {kart.karar.value}**",
        "",
        f"**Gerekçe:** {kart.gerekce}",
        "",
        f"**Bu kararı değiştirecek sinyal:** {kart.degistirecek_sinyal}",
        "",
        f"**Kaynak sayısı:** {kart.kaynak_sayisi} · **Model sürümü:** {kart.model_surumu}",
        "",
    ]
    if a.get("notlar"):
        satirlar += ["**Notlar**", "", *[f"- {n}" for n in a["notlar"]], ""]
    satirlar.append(f"> {kart.uyari}")
    return "\n".join(satirlar) + "\n"

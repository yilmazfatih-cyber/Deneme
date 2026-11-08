"""Zaman kilitli geriye test ve karne (docs/PLAN.md bölüm 9, ilke 5).

Zaman kilidi: ``veri_kadar`` tarihinden sonra yayımlanan sinyal (``kaynak_tarihi``) ve ilk kez görülen raf
gözlemi (``ilk_gorulme``) dışarıda kalır; kalan gözlemlerin ``son_gorulme`` değeri ``veri_kadar``a kırpılır.
``moda_radar.veri.zaman_kilidi`` ile kilitlenmiş bir depo (``sinyaller()`` / ``gozlemler()`` yöntemli nesne) da
verilebilir; kilit yine uygulanır (idempotent). Gerçekleşme kilitsiz gözlemlerden okunur.

Tabanlar:
- (a) önceki raf payı aynen: kilit anında bilinen son raf payı sürer, ``p = kırp(0,5 · raf/eşik)``; kayıt yoksa 0,05.
- (b) Pantone sezon raporu: veri hattı henüz yok; karşılaştırmaya girmez, karnede "veri yok" yazılır.
- (c) yalnız podyum payı: payın sıra yüzdeliği olasılık, sıralama paya göre.

Gerçekleşme: hedef (ufuk) raf sezonu penceresiyle en az ``ASGARI_ORTUSME_GUN`` gün örtüşen ve raf payı ≥ eşik olan
gözlem. Örtüşme şartı, önceki sezondan sarkan birkaç haftalık kalıntının hedef sezona sayılmasını önler.

Geçme: her taban için model Brier'i daha düşük **ve** ilk-n isabeti en az taban kadar. Biri geçilmezse
``rapor_uretilebilir = False``.
"""

from __future__ import annotations

from datetime import date
from pathlib import Path

from moda_radar.sema import GozlemKaydi, SegmentDosyasi, SinyalKaydi
from moda_radar.tahmin import kalibrasyon as kb
from moda_radar.tahmin import model as md
from moda_radar.tahmin import sezon as sz

ASGARI_ORTUSME_GUN = 60
TABANLAR = ("taban_a", "taban_c")
TABAN_ADLARI = {
    "model": "Model",
    "taban_a": "(a) Önceki raf payı aynen",
    "taban_c": "(c) Yalnız podyum payı",
}


def _liste(kaynak, yontem: str, **kw) -> list:
    if hasattr(kaynak, yontem) and callable(getattr(kaynak, yontem)):
        return list(getattr(kaynak, yontem)(**kw))
    return list(kaynak)


def kilitle(sinyaller, gozlemler, veri_kadar: date) -> tuple[list[SinyalKaydi], list[GozlemKaydi]]:
    """Zaman kilidi: ``veri_kadar`` sonrasını görmeyen kopyalar."""
    s = [k for k in sinyaller if k.kaynak_tarihi <= veri_kadar]
    g = [
        k if k.son_gorulme <= veri_kadar else k.model_copy(update={"son_gorulme": veri_kadar})
        for k in gozlemler
        if k.ilk_gorulme <= veri_kadar
    ]
    return s, g


def _kirp(p: float) -> float:
    return min(max(p, md.ALT_SINIR), md.UST_SINIR)


def gerceklesen_kume(gozlemler, ulke, segment, kategori, ufuk: str, esik: float, eksen: str | None = None) -> set:
    """Ufuk raf sezonunda (≥ ``ASGARI_ORTUSME_GUN`` gün) segmentte raf payı ≥ eşik olan (eksen, değer) çiftleri."""
    bas, bit = sz.raf_penceresi(ufuk)
    pencere = (bit - bas).days + 1
    asgari = min(ASGARI_ORTUSME_GUN, pencere)
    return {
        (g.nitelik_ekseni, g.nitelik_degeri)
        for g in gozlemler
        if g.ulke == ulke
        and g.segment == segment
        and g.kategori == kategori
        and (eksen is None or g.nitelik_ekseni == eksen)
        and g.raf_payi is not None
        and g.raf_payi >= esik
        and (min(g.son_gorulme, bit) - max(g.ilk_gorulme, bas)).days + 1 >= asgari
    }


def _olcutler(olasiliklar, sonuclar, siralama, gercek, ilk_n, esit) -> dict:
    return {
        "brier": round(kb.brier(olasiliklar, sonuclar), 4),
        "ilk_n_isabet": round(kb.ilk_n_isabet(siralama, gercek, ilk_n, esit), 4),
        "dogruluk": round(sum((p >= 0.5) == bool(y) for p, y in zip(olasiliklar, sonuclar)) / len(sonuclar), 4),
        "kovalar": kb.kalibrasyon_kovalari(olasiliklar, sonuclar, k=5),
    }


def calistir(
    tahmin_sezonu: str,
    veri_kadar: date,
    sinyaller,
    gozlemler,
    segmentler: SegmentDosyasi,
    segment: str,
    kategori: str,
    *,
    ulke: str = "TR",
    eksen: str | None = None,
    esik_raf_payi: float = md.ESIK_RAF_PAYI,
    model_surumu: str = "v0",
    ilk_n: int = 10,
    esit=None,
    gercek_gozlemler=None,
    sentetik: bool = False,
) -> dict:
    """Zaman kilitli geriye test; ölçütler, taban karşılaştırması ve ``rapor_uretilebilir`` döner."""
    esit = esit or (lambda a, b: a == b)
    tum_sinyaller = _liste(sinyaller, "sinyaller")
    tum_gozlemler = _liste(gozlemler, "gozlemler")
    gercek_kaynak = tum_gozlemler if gercek_gozlemler is None else _liste(gercek_gozlemler, "gozlemler")
    k_sinyal, k_gozlem = kilitle(tum_sinyaller, tum_gozlemler, veri_kadar)

    gecikme = md.segment_gecikmesi(k_sinyal, k_gozlem, segmentler, segment, kategori)
    tahminler = md.toplu_tahmin(
        tahmin_sezonu,
        ulke,
        segment,
        kategori,
        k_sinyal,
        k_gozlem,
        segmentler,
        model_surumu,
        eksen=eksen,
        esik_raf_payi=esik_raf_payi,
    )
    ufuk = sz.ufuk_sezonu(tahmin_sezonu, gecikme[0])
    gercek = gerceklesen_kume(gercek_kaynak, ulke, segment, kategori, ufuk, esik_raf_payi, eksen)

    sonuc: dict = {
        "model_surumu": model_surumu,
        "tahmin_sezonu": tahmin_sezonu,
        "veri_kadar": veri_kadar.isoformat(),
        "ulke": ulke,
        "segment": segment,
        "kategori": kategori,
        "eksen": eksen,
        "esik_raf_payi": esik_raf_payi,
        "ufuk_sezon": ufuk,
        "raf_donemi": sz.raf_donemi(tahmin_sezonu, gecikme[0]),
        "gecikme": {"sezon": gecikme[0], "kaynak": gecikme[1], **gecikme[2]},
        "sentetik": sentetik,
        "kilitli_kayit": {"sinyal": len(k_sinyal), "gozlem": len(k_gozlem)},
        "n_tahmin": len(tahminler),
        "n_gerceklesen": 0,
        "olcutler": {},
        "taban_b": "veri yok: Pantone sezon raporu hattı henüz kurulmadı; karşılaştırmaya girmedi",
        "gecti": {},
        "rapor_uretilebilir": False,
        "tahminler": [],
    }
    if not tahminler:
        sonuc["neden"] = "kilit tarihine kadar bu sezon için sinyal yok"
        return sonuc

    anahtar = [(t.nitelik_ekseni, t.nitelik_degeri) for t in tahminler]
    y = [a in gercek for a in anahtar]
    sonuc["n_gerceklesen"] = sum(y)

    # (a) önceki raf payı aynen
    son_raf: dict[tuple[str, str], tuple] = {}
    for g in k_gozlem:
        if g.ulke != ulke or g.segment != segment or g.kategori != kategori or g.raf_payi is None:
            continue
        a = (g.nitelik_ekseni, g.nitelik_degeri)
        if a not in son_raf or g.son_gorulme > son_raf[a][0]:
            son_raf[a] = (g.son_gorulme, g.raf_payi)
    p_a = [_kirp(0.5 * son_raf[a][1] / esik_raf_payi) if a in son_raf else md.ALT_SINIR for a in anahtar]

    # (c) yalnız podyum payı
    pay = {}
    for a in anahtar:
        b = md.birlesik_sinyal(
            [s for s in k_sinyal if s.sezon == tahmin_sezonu and (s.nitelik_ekseni, s.nitelik_degeri) == a]
        )
        pay[a] = b["pay"]
    sirali_pay = sorted(pay.values())
    n = len(anahtar)
    p_c = [_kirp((sirali_pay.index(pay[a]) + 0.5) / n) for a in anahtar]

    p_model = [t.olasilik for t in tahminler]
    yontemler = {"model": p_model, "taban_a": p_a, "taban_c": p_c}
    for ad, ps in yontemler.items():
        sira = [a for _, a in sorted(zip(ps, anahtar), key=lambda x: -x[0])]
        sonuc["olcutler"][ad] = _olcutler(ps, y, sira, gercek, ilk_n, esit)

    m = sonuc["olcutler"]["model"]
    for t in TABANLAR:
        tb = sonuc["olcutler"][t]
        sonuc["gecti"][t] = bool(m["brier"] < tb["brier"] and m["ilk_n_isabet"] >= tb["ilk_n_isabet"])
    sonuc["rapor_uretilebilir"] = all(sonuc["gecti"].values()) and sum(y) > 0
    sonuc["tahminler"] = [
        {"eksen": t.nitelik_ekseni, "deger": t.nitelik_degeri, "olasilik": t.olasilik, "yon": t.yon.value, "gercek": g}
        for t, g in zip(tahminler, y)
    ]
    return sonuc


def _sayi(x) -> str:
    if x is None:
        return "—"
    return f"{x:.3f}".replace(".", ",")


def karne_yaz(sonuc, yol: str | Path | None = None, ek: str | None = None) -> Path:
    """Bir ya da birden çok geriye test sonucunu Markdown karneye yazar.

    Varsayılan yol ``docs/karne/<surum>.md``; sentetik sonuçta ``docs/karne/<surum>-sentetik.md``.
    ``ek``: sona eklenecek Markdown (ör. tohum sağlamlığı tablosu). İlke 5: rapor üretimi için en az iki geçmiş sezonun tümünde tabanlar geçilmiş olmalı.
    """
    sonuclar = sonuc if isinstance(sonuc, list) else [sonuc]
    if not sonuclar:
        raise ValueError("karne için en az bir sonuç gerekir")
    surum = sonuclar[0]["model_surumu"]
    sentetik = any(s.get("sentetik") for s in sonuclar)
    if yol is None:
        yol = Path("docs/karne") / f"{surum}{'-sentetik' if sentetik else ''}.md"
    yol = Path(yol)
    genel = len(sonuclar) >= 2 and all(s["rapor_uretilebilir"] for s in sonuclar)

    s_ = []
    s_.append(f"# Karne: model {surum}{' (sentetik veri)' if sentetik else ''}\n")
    if sentetik:
        s_.append(
            "> **Bu karne GERÇEK VERİ DEĞİLDİR.** `moda_radar/tahmin/sentetik.py` ile üretilmiş, gecikmesi ve yayılma "
            "eğrisi bilinen sentetik veriyle yöntemin mekaniği sınanmıştır. Gerçek isabet hakkında bilgi vermez; "
            "ileri tahmin raporu bu karneye dayanamaz.\n"
        )
    s_.append(f"- Model sürümü: `{surum}`")
    s_.append(f"- Geriye test edilen sezon sayısı: {len(sonuclar)}")
    karar = "evet" if genel else "hayır"
    s_.append(f"- **Rapor üretilebilir (ilke 5): {karar}**")
    if not genel:
        if len(sonuclar) < 2:
            s_.append("  - Neden: en az iki geçmiş sezon gerekir.")
        for s in sonuclar:
            if not s["rapor_uretilebilir"]:
                s_.append(f"  - Neden: {s['tahmin_sezonu']} sezonunda en az bir taban geçilemedi.")
    s_.append("")
    s_.append(
        "| Sezon | Veri kadar | Segment | Ufuk | Gecikme | n tahmin | n gerçek | Brier model | Brier (a) "
        "| Brier (c) | İlk-10 model | İlk-10 (a) | İlk-10 (c) | Geçti |"
    )
    s_.append("| --- | --- | --- | --- | --- | --: | --: | --: | --: | --: | --: | --: | --: | --- |")
    for s in sonuclar:
        o = s["olcutler"]
        g = s["gecikme"]
        satir = [
            s["tahmin_sezonu"],
            s["veri_kadar"],
            s["segment"],
            s["ufuk_sezon"],
            f"{_sayi(g['sezon'])} ({g['kaynak']}, n={g['n']})",
            str(s["n_tahmin"]),
            str(s["n_gerceklesen"]),
        ]
        for olcut in ("brier", "ilk_n_isabet"):
            for ad in ("model", "taban_a", "taban_c"):
                satir.append(_sayi(o.get(ad, {}).get(olcut)))
        satir.append("evet" if s["rapor_uretilebilir"] else "hayır")
        s_.append("| " + " | ".join(satir) + " |")
    s_.append("")
    s_.append("Taban (b) Pantone sezon raporu: veri hattı henüz yok; karşılaştırmaya girmedi.")
    s_.append("")
    for s in sonuclar:
        s_.append(f"## {s['tahmin_sezonu']} · {s['segment']} · {s['kategori']}\n")
        g = s["gecikme"]
        s_.append(
            f"- Gecikme: {_sayi(g['sezon'])} sezon, kaynak **{g['kaynak']}**; n={g['n']}, medyan {_sayi(g['medyan'])}, "
            f"çeyrekler {_sayi(g['q1'])}–{_sayi(g['q3'])}, önsel modu {_sayi(g['onsel_mod'])}."
        )
        s_.append(f"- Beklenen raf dönemi: {s['raf_donemi']}; eşik: raf payı ≥ {_sayi(s['esik_raf_payi'])}.")
        s_.append(
            f"- Kilit altında okunan kayıt: {s['kilitli_kayit']['sinyal']} sinyal, {s['kilitli_kayit']['gozlem']} gözlem."
        )
        if not s["olcutler"]:
            s_.append(f"- Ölçüt yok: {s.get('neden', 'tahmin üretilemedi')}.\n")
            continue
        s_.append("")
        s_.append("| Yöntem | Brier | İlk-10 isabet | Doğruluk (p ≥ 0,5) |")
        s_.append("| --- | --: | --: | --: |")
        for ad, o in s["olcutler"].items():
            s_.append(
                f"| {TABAN_ADLARI[ad]} | {_sayi(o['brier'])} | {_sayi(o['ilk_n_isabet'])} | {_sayi(o['dogruluk'])} |"
            )
        s_.append("")
        s_.append("Kalibrasyon (model):\n")
        s_.append("| Kova | n | Ortalama olasılık | Gerçekleşme oranı |")
        s_.append("| --- | --: | --: | --: |")
        for k in s["olcutler"]["model"]["kovalar"]:
            s_.append(
                f"| {_sayi(k['alt'])}–{_sayi(k['ust'])} | {k['n']} | {_sayi(k['ort_olasilik'])} | {_sayi(k['gercek_oran'])} |"
            )
        s_.append("")
    if ek:
        s_.append(ek.rstrip() + "\n")
    yol.parent.mkdir(parents=True, exist_ok=True)
    yol.write_text("\n".join(s_).rstrip() + "\n", encoding="utf-8")
    return yol

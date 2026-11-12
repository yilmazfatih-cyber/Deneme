"""Herhangi bir CSV'nin (Mixpanel/Hotjar dışa aktarımı ya da başka) sınırlı uzunlukta Türkçe özeti.

Model dosyayı değil bu özeti okur: sütun türleri, zaman serisi eğilimi, kategori payları, 0-10 ölçeklerde NPS,
açık uçlu metinlerde sık kelimeler. Çıktı satır sayısı `limit` ile sınırlıdır.
"""

from __future__ import annotations

import datetime as dt
import re
import statistics
from collections import Counter, OrderedDict, defaultdict
from typing import Dict, List, Optional, Sequence, Tuple

from . import bicim, csvoku, metin

_KIMLIK_ADLARI = re.compile(
    r"^(#|id|no|number|numara|sıra|response id|yanıt id|user id|hotjar user id|hotjar kullanıcı id|user|kullanıcı|"
    r"kayıt url|recording url|recording|kayıt)$",
    re.I,
)


# --- filtre ---------------------------------------------------------------------------------------

_FILTRE = re.compile(r"^(.+?)\s*(<=|>=|!=|=|<|>|~)\s*(.*)$")


def filtre_coz(ifade: str) -> Tuple[str, str, str]:
    eslesme = _FILTRE.match(ifade.strip())
    if not eslesme:
        raise ValueError(f"Filtre 'sütun<=6', 'Cihaz=mobile' ya da 'URL~/odeme' biçiminde olmalı: {ifade!r}")
    return eslesme.group(1).strip(), eslesme.group(2), eslesme.group(3).strip().strip("'\"")


def satir_filtrele(basliklar: Sequence[str], satirlar: List[List[str]], filtreler: Sequence[str]) -> List[List[str]]:
    for ifade in filtreler or []:
        ad, op, deger = filtre_coz(ifade)
        degerler = csvoku.sutun(basliklar, satirlar, ad)
        hedef_sayi = csvoku.sayiya(deger)
        kalan = []
        for satir, hucre in zip(satirlar, degerler):
            if _karsilastir(hucre, op, deger, hedef_sayi):
                kalan.append(satir)
        satirlar = kalan
    return satirlar


def _karsilastir(hucre: str, op: str, deger: str, hedef_sayi: Optional[float]) -> bool:
    if op == "~":
        return metin.kucuk(deger) in metin.kucuk(hucre)
    sayi = csvoku.sayiya(hucre)
    if hedef_sayi is not None and sayi is not None:
        a, b = sayi, hedef_sayi
    else:
        a, b = metin.kucuk(hucre.strip()), metin.kucuk(deger)
    try:
        return {"=": a == b, "!=": a != b, "<": a < b, ">": a > b, "<=": a <= b, ">=": a >= b}[op]
    except TypeError:
        return False


# --- yardımcılar ----------------------------------------------------------------------------------


def _kimlik_mi(ad: str, degerler: Sequence[str], tur: Dict) -> bool:
    """Sıra no / yanıt kimliği gibi bilgi taşımayan sütunlar: adından ya da artan benzersiz tamsayı olmasından."""
    if _KIMLIK_ADLARI.match(ad.strip()):
        return True
    if tur["tur"] != "sayi" or not tur.get("tamsayi"):
        return False
    sayilar = [csvoku.sayiya(d) for d in degerler if d.strip()]
    if len(sayilar) <= 20 or len(set(sayilar)) != len(sayilar):
        return False
    return sayilar == sorted(sayilar) or sayilar == sorted(sayilar, reverse=True)


def seri_hesapla(tarihler: List[Optional[dt.date]], degerler: List[Optional[float]]) -> Optional[Dict]:
    """Tarih -> toplam serisi; son dönem / önceki dönem (günlükte 7'şer gün, diğerlerinde 1 dönem) ve kıvılcım."""
    toplam: Dict[dt.date, float] = defaultdict(float)
    for t, v in zip(tarihler, degerler):
        if t is not None and v is not None:
            toplam[t] += v
    if len(toplam) < 2:
        return None
    gunler = sorted(toplam)
    farklar = [(b - a).days for a, b in zip(gunler, gunler[1:])]
    adim = statistics.median(farklar) if farklar else 1
    k = 7 if adim <= 1 and len(gunler) >= 14 else 1
    son = sum(toplam[g] for g in gunler[-k:])
    onceki = sum(toplam[g] for g in gunler[-2 * k : -k])
    birim = "7 gün" if k == 7 else {1: "gün", 7: "hafta"}.get(int(adim), "dönem")
    seri = [toplam[g] for g in gunler]
    if len(seri) > 30:
        parca = len(seri) / 30
        seri = [sum(seri[int(i * parca) : int((i + 1) * parca)]) for i in range(30)]
    return {
        "bas": gunler[0],
        "bit": gunler[-1],
        "son": son,
        "onceki": onceki,
        "birim": birim,
        "kivilcim": bicim.kivilcim(seri),
    }


def _seri_metni(s: Dict) -> str:
    return (
        f"{s['bas'].isoformat()} → {s['bit'].isoformat()} · son {s['birim']}: {bicim.sayi(s['son'])} "
        f"(önceki {bicim.sayi(s['onceki'])}, {bicim.degisim(s['son'], s['onceki'])}) · {s['kivilcim']}"
    )


def _olcek_ozeti(sayilar: List[float], olcek: str) -> str:
    sayac = Counter(int(s) for s in sayilar)
    if olcek == "0-10":
        n = metin.nps(sayilar)
        dagilim = " ".join(f"{p}:{sayac.get(p, 0)}" for p in range(11))
        return (
            f"NPS {bicim.sayi(n['nps'])} (n={bicim.sayi(n['n'])}; destekçi {bicim.yuzde(n['destekci'])}, "
            f"nötr {bicim.yuzde(n['notr'])}, kötüleyen {bicim.yuzde(n['kotuleyen'])}) · dağılım {dagilim}"
        )
    ort = statistics.mean(sayilar)
    dagilim = " ".join(f"{p}:{sayac.get(p, 0)}" for p in range(1, 6))
    return f"ort. {bicim.sayi(ort, 2)} / 5 (n={bicim.sayi(len(sayilar))}) · dağılım {dagilim}"


def _grup_tablosu(
    grup_ad: str, gruplar: List[str], sayilar: List[Optional[float]], olcek: Optional[str], limit: int
) -> str:
    kume: Dict[str, List[float]] = defaultdict(list)
    for g, s in zip(gruplar, sayilar):
        if s is not None:
            kume[g.strip() or "(boş)"].append(s)
    satirlar = []
    for g, liste in sorted(kume.items(), key=lambda kv: -len(kv[1]))[:limit]:
        if olcek == "0-10":
            deger = bicim.sayi(metin.nps(liste)["nps"])
        else:
            deger = bicim.sayi(statistics.mean(liste), 2)
        satirlar.append([bicim.kisalt(g, 30), bicim.sayi(len(liste)), deger])
    baslik = "NPS" if olcek == "0-10" else "ortalama"
    return bicim.tablo([grup_ad, "n", baslik], satirlar)


# --- özel biçimler -----------------------------------------------------------------------------------


def devam_satirlarini_birlestir(basliklar: Sequence[str], satirlar: List[List[str]]) -> List[List[str]]:
    """Eski Hotjar dışa aktarımlarında çoklu seçim alt satırlara yazılır, kimlik yalnız ilk satırdadır.

    İlk sütun kimlik gibiyse ve boş kimlikli satırlar varsa bunlar üstteki yanıta ' | ' ile eklenir.
    """
    if not satirlar or not _KIMLIK_ADLARI.match(basliklar[0].strip()):
        return satirlar
    if not any(not s[0].strip() and any(h.strip() for h in s[1:]) for s in satirlar):
        return satirlar
    sonuc: List[List[str]] = []
    for s in satirlar:
        if s[0].strip() or not sonuc:
            sonuc.append(list(s))
            continue
        onceki = sonuc[-1]
        for i, h in enumerate(s):
            h = h.strip()
            if h and h not in onceki[i].split(" | "):
                onceki[i] = f"{onceki[i]} | {h}" if onceki[i].strip() else h
    return sonuc


def isi_haritasi_mi(basliklar: Sequence[str]) -> bool:
    kucuk = [b.lower() for b in basliklar]
    return any("css selector" in b for b in kucuk) and any("click" in b for b in kucuk)


def isi_haritasi_ozeti(basliklar: Sequence[str], satirlar: List[List[str]], ad: str, limit: int) -> str:
    kucuk = [b.lower() for b in basliklar]
    i_el = next(i for i, b in enumerate(kucuk) if "css selector" in b)
    i_tik = next(i for i, b in enumerate(kucuk) if "click" in b and "%" not in b)
    i_gor = next((i for i, b in enumerate(kucuk) if "visible" in b), None)
    kayitlar = []
    for s in satirlar:
        tik = csvoku.sayiya(s[i_tik]) or 0
        kayitlar.append((tik, s[i_el], s[i_gor] if i_gor is not None else ""))
    toplam = sum(k[0] for k in kayitlar) or 1
    kayitlar.sort(key=lambda k: -k[0])
    gorunmeyen = sum(k[0] for k in kayitlar if str(k[2]).strip().lower() in ("no", "false", "hayır", "0"))
    tablo = [[bicim.kisalt(el, 70), bicim.sayi(t), bicim.yuzde(t / toplam), g] for t, el, g in kayitlar[:limit]]
    return "\n".join(
        [
            f"Isı haritası (tıklama) · {ad} · {bicim.sayi(len(kayitlar))} öğe · {bicim.sayi(toplam)} tıklama · "
            f"görüntüde olmayan öğelere tıklama {bicim.yuzde(gorunmeyen / toplam)}",
            bicim.tablo(["öğe (CSS seçici)", "tıklama", "pay", "görünür"], tablo, hizala="lrrl"),
        ]
    )


def _coklu_secim_mi(degerler: Sequence[str]) -> bool:
    dolu = [d for d in degerler if d.strip()]
    return bool(dolu) and sum(1 for d in dolu if " | " in d) >= 0.15 * len(dolu)


# --- ana özet -------------------------------------------------------------------------------------


def csv_ozet(
    basliklar: Sequence[str],
    satirlar: List[List[str]],
    ad: str = "",
    limit: int = 8,
    grup: Optional[str] = None,
) -> str:
    if isi_haritasi_mi(basliklar):
        return isi_haritasi_ozeti(basliklar, satirlar, ad, max(limit, 12))
    cikti: List[str] = [f"Dosya: {ad} · {bicim.sayi(len(satirlar))} satır · {len(basliklar)} sütun"]
    if not satirlar:
        return cikti[0] + "\n(veri yok)"

    tarih_basliklari = [b for b in basliklar if csvoku.tarih_bicimi([b])]
    if len(tarih_basliklari) >= 3:
        return "\n".join(cikti + [_genis_seri(basliklar, satirlar, tarih_basliklari, limit)])

    turler: OrderedDict[str, Dict] = OrderedDict()
    for b in basliklar:
        turler[b] = csvoku.sutun_turu(csvoku.sutun(basliklar, satirlar, b))

    tarih_sutunu = next((b for b, t in turler.items() if t["tur"] == "tarih"), None)
    tarihler = (
        [csvoku.tarihe(h, turler[tarih_sutunu]["bicim"]) for h in csvoku.sutun(basliklar, satirlar, tarih_sutunu)]
        if tarih_sutunu
        else None
    )
    if tarih_sutunu:
        gecerli = [t for t in tarihler if t]
        if gecerli:
            cikti.append(f"Zaman: `{tarih_sutunu}` {min(gecerli).isoformat()} → {max(gecerli).isoformat()}")

    grup_degerleri = csvoku.sutun(basliklar, satirlar, grup) if grup else None
    gosterilen = 0
    atlanan: List[str] = []
    for b, tur in turler.items():
        degerler = csvoku.sutun(basliklar, satirlar, b)
        if tur["tur"] == "bos" or _kimlik_mi(b, degerler, tur) or b == tarih_sutunu:
            continue
        if gosterilen >= 25:
            atlanan.append(b)
            continue
        gosterilen += 1
        baslik = f"- `{bicim.kisalt(b, 70)}` ({tur['tur']}, dolu {bicim.sayi(tur['dolu'])})"
        if tur["tur"] == "sayi":
            sayilar = [csvoku.sayiya(d) for d in degerler]
            gecerli = [s for s in sayilar if s is not None]
            if tur.get("olcek"):
                cikti.append(f"{baslik}: {_olcek_ozeti(gecerli, tur['olcek'])}")
            else:
                cikti.append(
                    f"{baslik}: toplam {bicim.sayi(sum(gecerli), 2 if not tur['tamsayi'] else 0)}, "
                    f"ort. {bicim.sayi(statistics.mean(gecerli), 2)}, "
                    f"medyan {bicim.sayi(statistics.median(gecerli), 2)}, "
                    f"{bicim.sayi(min(gecerli), 2)}–{bicim.sayi(max(gecerli), 2)}"
                )
                if tarihler:
                    seri = seri_hesapla(tarihler, sayilar)
                    if seri:
                        cikti.append(f"  eğilim: {_seri_metni(seri)}")
            if grup_degerleri and b != grup:
                cikti.append(_grup_tablosu(grup, grup_degerleri, sayilar, tur.get("olcek"), limit))
        elif tur["tur"] == "kategori" and _coklu_secim_mi(degerler):
            dolu = [d for d in degerler if d.strip()]
            sayac = Counter(x.strip() for d in dolu for x in d.split(" | ") if x.strip())
            ust = ", ".join(
                f"{bicim.kisalt(metin.maskele(k), 40)} {bicim.yuzde(v / len(dolu), 0)}"
                for k, v in sayac.most_common(limit)
            )
            cikti.append(f"{baslik}: çoklu seçim, yanıtlayanların payı · {ust}")
        elif tur["tur"] == "kategori":
            sayac = Counter(d.strip() for d in degerler if d.strip())
            toplam = sum(sayac.values())
            ust = ", ".join(
                f"{bicim.kisalt(metin.maskele(k), 40)} {bicim.yuzde(v / toplam, 0)}"
                for k, v in sayac.most_common(limit)
            )
            kalan = len(sayac) - min(limit, len(sayac))
            cikti.append(f"{baslik}: {tur['benzersiz']} değer · {ust}" + (f" (+{kalan} değer)" if kalan > 0 else ""))
        elif tur["tur"] == "url":
            sayac = Counter(csvoku.url_yolu(d) for d in degerler if d.strip())
            toplam = sum(sayac.values())
            ust = ", ".join(f"{bicim.kisalt(k, 50)} {bicim.yuzde(v / toplam, 0)}" for k, v in sayac.most_common(limit))
            cikti.append(f"{baslik}: {ust}")
        elif tur["tur"] == "metin":
            tekil, ikili = metin.sik_kelimeler([d for d in degerler if d.strip()], n=limit + 4)
            cikti.append(
                f"{baslik}: ort. {bicim.sayi(tur['ort_kelime'], 1)} kelime · sık: "
                + ", ".join(f"{k}({s})" for k, s in tekil[: limit + 4])
                + (" · öbek: " + ", ".join(f"{k}({s})" for k, s in ikili[:limit]) if ikili else "")
            )
        else:
            cikti.append(baslik)
    if atlanan:
        cikti.append(f"(+{len(atlanan)} sütun gösterilmedi: {', '.join(bicim.kisalt(a, 25) for a in atlanan[:10])})")
    return "\n".join(cikti)


def _genis_seri(basliklar: Sequence[str], satirlar: List[List[str]], tarih_basliklari: List[str], limit: int) -> str:
    """Tarihlerin sütun olduğu (geniş) dışa aktarımlar: her satır bir seri."""
    bicim_ = csvoku.tarih_bicimi(tarih_basliklari)
    tarih_sira = sorted((csvoku.tarihe(b, bicim_), b) for b in tarih_basliklari if csvoku.tarihe(b, bicim_))
    etiket_sutunlari = [b for b in basliklar if b not in tarih_basliklari]
    seriler = []
    for satir in satirlar:
        kayit = dict(zip(basliklar, satir))
        etiket = " · ".join(kayit[e] for e in etiket_sutunlari if kayit.get(e, "").strip()) or "(etiketsiz)"
        tarihler = [t for t, _ in tarih_sira]
        degerler = [csvoku.sayiya(kayit.get(b, "")) or 0.0 for _, b in tarih_sira]
        seriler.append((sum(degerler), etiket, tarihler, degerler))
    seriler.sort(key=lambda s: -s[0])
    tablo_satirlari = []
    for toplam, etiket, tarihler, degerler in seriler[:limit]:
        seri = seri_hesapla(tarihler, degerler)
        degisim = bicim.degisim(seri["son"], seri["onceki"]) if seri else bicim.BOS
        tablo_satirlari.append(
            [bicim.kisalt(etiket, 40), bicim.sayi(toplam), degisim, seri["kivilcim"] if seri else ""]
        )
    ilk, son = tarih_sira[0][0], tarih_sira[-1][0]
    alt = f"(+{len(seriler) - limit} seri daha)" if len(seriler) > limit else ""
    return "\n".join(
        [
            f"Geniş zaman serisi: {len(tarih_sira)} tarih sütunu ({ilk.isoformat()} → {son.isoformat()}), "
            f"{len(seriler)} seri",
            bicim.tablo(["seri", "toplam", "son dönem Δ", "eğilim"], tablo_satirlari),
            alt,
        ]
    ).strip()

"""Ağ katmanının etkileşimli sayfası.

`veri/ag/analiz/*.json` ve `dosya_kaynak/ag/*.json` içeriğini tek bir veri nesnesine indirger, ağaçların yerleşimini (kök merkezde, her
derinlik bir halka) hesaplar ve `ag/sayfa/` altındaki şablon parçalarını birleştirerek kendi kendine yeten bir HTML dosyası yazar.
Dosya tarayıcıda doğrudan açılır; sunucu gerekmez. Yatırım tavsiyesi değildir."""

from __future__ import annotations

import csv
import json
import math
from pathlib import Path
from typing import Any

from .rapor import AYLAR, GRUP_AD, MEVSIM_AD, OZELLIK_AD, SEKTOR_AD, SERI_AD

GRUP_SIRA = ["bist30", "bist100_30", "yildiz_diger", "ana_pazar", "alt_pazar"]
SABLON = Path(__file__).parent / "sayfa"
BETIKLER = ("cekirdek.js", "agac.js", "yayilim.js", "zaman.js", "yatirimci.js", "bildirim.js", "fonlar.js", "kurallar.js", "baslat.js")
AY_UZUN = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"]


def _yuvarla(v: Any, hane: int = 4) -> Any:
    """Sayfa verisini küçültür: ondalıklar `hane` anlamlı basamağa iner, NaN ve sonsuz `null` olur."""
    if isinstance(v, bool):
        return v
    if isinstance(v, float):
        if math.isnan(v) or math.isinf(v):
            return None
        return float(f"{v:.{hane}g}")
    if isinstance(v, dict):
        return {str(k): _yuvarla(x, hane) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [_yuvarla(x, hane) for x in v]
    return v


def radyal_yerlesim(ebeveyn: dict[str, str | None], us: float = 0.62) -> dict[str, tuple[float, float]]:
    """Ağacı halkalara dizer: kök merkezde, her alt ağaca yaprak sayısıyla orantılı bir açı dilimi, yarıçap = derinlik^us
    (us < 1: kalabalık iç halkalara daha çok yer kalır).
    Ebeveyni olmayan (ya da ebeveyni listede bulunmayan) birden çok düğüm varsa hepsi sanal bir köke bağlanır. Çıktı [-1, 1] karesine sığar."""
    cocuk: dict[str | None, list[str]] = {}
    for d, e in ebeveyn.items():
        cocuk.setdefault(e if e in ebeveyn else None, []).append(d)
    kokler = cocuk.get(None, [])
    if not kokler:
        return {}
    # Yaprak sayısı (aşağıdan yukarı): önce kökten dışa sıra çıkarılır, sonra tersinden toplanır
    sira: list[str] = []
    yigin = list(kokler)
    while yigin:
        d = yigin.pop()
        sira.append(d)
        yigin.extend(cocuk.get(d, []))
    yaprak: dict[str, int] = {}
    for d in reversed(sira):
        c = cocuk.get(d, [])
        yaprak[d] = sum(yaprak[x] for x in c) if c else 1
    konum: dict[str, tuple[float, float]] = {}
    sanal = len(kokler) > 1
    is_listesi: list[tuple[str, float, float, int]] = []
    toplam = sum(yaprak[k] for k in kokler)
    a = 0.0
    for k in sorted(kokler, key=lambda x: -yaprak[x]):
        pay = 2 * math.pi * yaprak[k] / toplam
        is_listesi.append((k, a, a + pay, 1 if sanal else 0))
        a += pay
    en_derin = 1.0
    while is_listesi:
        d, a0, a1, derinlik = is_listesi.pop()
        aci = (a0 + a1) / 2
        r = derinlik**us
        konum[d] = (r * math.cos(aci), r * math.sin(aci))
        en_derin = max(en_derin, r)
        c = sorted(cocuk.get(d, []), key=lambda x: -yaprak[x])
        if not c:
            continue
        # Büyük alt ağaçlar dilimin ortasına, küçükler kenarlara: dallar birbirine girmez
        dizi: list[str] = []
        for i, x in enumerate(c):
            if i % 2 == 0:
                dizi.append(x)
            else:
                dizi.insert(0, x)
        # Açı payı yaprak sayısının 0,8'inci kuvvetiyle: tek yapraklı çocuklar büyük dalların yanında ezilmez
        t = sum(yaprak[x] ** 0.8 for x in dizi)
        b = a0
        for x in dizi:
            pay = (a1 - a0) * yaprak[x] ** 0.8 / t
            is_listesi.append((x, b, b + pay, derinlik + 1))
            b += pay
    return {d: (round(x / en_derin, 4), round(y / en_derin, 4)) for d, (x, y) in konum.items()}


def _oku(yol: Path) -> Any:
    try:
        return json.loads(yol.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def _adlar(klasor: Path) -> dict[str, str]:
    """Şirket adları (TradingView taraması)."""
    yol = klasor / "tv_tarama.csv"
    if not yol.exists():
        return {}
    with yol.open(encoding="utf-8") as f:
        return {(r.get("name") or r.get("sembol") or "").split(":")[-1]: (r.get("description") or "").strip() for r in csv.DictReader(f)}


def _agac(A: dict, Z: dict, adlar: dict[str, str]) -> dict:
    dugum = A.get("dugumler", [])
    if not dugum:
        return {}
    sira = {d["hisse"]: i for i, d in enumerate(dugum)}
    sektorler = sorted({d["sektor"] for d in dugum})
    ham = radyal_yerlesim({d["hisse"]: d.get("ebeveyn") for d in dugum})
    tema = radyal_yerlesim({d["hisse"]: d.get("tema_ebeveyn") for d in dugum})
    satir = []
    for d in dugum:
        h = d["hisse"]
        x, y = ham.get(h, (0, 0))
        tx, ty = tema.get(h, (0, 0))
        satir.append([
            h, sektorler.index(d["sektor"]), GRUP_SIRA.index(d["grup"]) if d["grup"] in GRUP_SIRA else 3, round((d.get("pd") or 0) / 1e9, 2),
            x, y, tx, ty, sira.get(d.get("ebeveyn"), -1), sira.get(d.get("tema_ebeveyn"), -1),
            round(d.get("kucuk_yuk") or 0, 2), round(d.get("beta") or 0, 2), adlar.get(h, ""),
        ])  # fmt: skip
    kenar = lambda L: [[sira[e["a"]], sira[e["b"]], round(e["kor"], 3)] for e in L if e["a"] in sira and e["b"] in sira]  # noqa: E731
    yillar = {
        y: {"kok": v.get("kok"), "ham": v.get("ort_kor_ham"), "artik": v.get("ort_kor_artik"), "ayni": v.get("kenar_ayni_sektor_orani"), "hisse": v.get("hisse"),
            "merkez": v.get("en_merkezi", [])[:5]}
        for y, v in (Z.get("yil") or {}).items()
    }  # fmt: skip
    return {
        "dugum": satir, "sektor": sektorler, "kenar": kenar(A.get("kenarlar", [])), "tkenar": kenar((A.get("tema_agaci") or {}).get("kenarlar", [])),
        "kok": A.get("kok"), "tkok": (A.get("tema_agaci") or {}).get("kok"),
        "ozet": {k: A.get(k) for k in ("gun", "hisse", "donem", "ort_kor_ham", "ort_kor_piyasa_artik", "ort_kor_artik", "ort_kor_ayni_sektor_artik",
                                        "ort_kor_farkli_sektor_artik", "kenar_ayni_sektor_orani", "rastgele_ayni_sektor_orani", "kume_safligi")},
        "tema_ayni": (A.get("tema_agaci") or {}).get("kenar_ayni_sektor_orani"),
        "baglar": [[b["a"], b["b"], b["kor"], b.get("a_ad", ""), b.get("b_ad", ""), bool(b.get("ayni_sektor"))] for b in A.get("en_guclu_baglar", [])[:40]],
        "butunluk": [[s["sektor"], s["hisse"], s["ic_kor"], s.get("ham_ic_kor")] for s in A.get("sektor_butunlugu", [])],
        "dallar": [{"dal": d["dal"], "hisse": d["hisse"], "sektor": d.get("baskin_sektor"), "pay": d.get("baskin_pay")} for d in A.get("dallar", [])[:8]],
        "yil": yillar, "kalicilik": Z.get("kalicilik", []), "kayan": sorted((Z.get("kayan_kor_60g") or {}).items()), "mevsim": Z.get("mevsim", {}),
    }  # fmt: skip


def _yayilim(K: dict, O: dict) -> dict:
    ku = K.get("kuresel") or {}
    seriler = list((ku.get("seriler") or {}).keys())
    sektorler = sorted({r["sektor"] for r in ku.get("sektor", [])})
    turler = ["bosluk", "devam", "esanli"]
    hucre = [
        [seriler.index(r["seri"]), sektorler.index(r["sektor"]), turler.index(r["tur"]), r.get("kor"), r.get("t"), r.get("beta"), int(bool(r.get("anlamli"))),
         int(bool(r.get("tutarli")))]
        for r in ku.get("sektor", []) if r.get("seri") in seriler and r.get("tur") in turler
    ]  # fmt: skip
    og = O.get("oncu_grup") or {}
    return {
        "gun": ku.get("gun"), "seriler": seriler, "sektorler": sektorler, "turler": turler, "bist30": ku.get("bist30", {}), "kucuk": ku.get("bist100_disi", {}),
        "hucre": hucre, "sektor_test": ku.get("sektor_test", {}),
        "oncu_grup": [[e["oncu"], e["takipci"], e.get("kor"), e.get("t"), int(bool(e.get("anlamli"))), int(bool(e.get("tutarli")))] for e in og.get("kenarlar", [])],
        "oncu_sektor": {"test": (O.get("oncu_sektor") or {}).get("test"), "anlamli": (O.get("oncu_sektor") or {}).get("anlamli_sayi"),
                        "kenar": [[e["oncu"], e["takipci"], e.get("kor"), e.get("t")] for e in (O.get("oncu_sektor") or {}).get("kenarlar", []) if e.get("anlamli")]},
        "gecikme": (O.get("gecikme") or {}).get("grup", {}), "en_gecikmeli": (O.get("gecikme") or {}).get("en_gecikmeli", []),
        "kucuk_faktor": (O.get("gecikme") or {}).get("kucuk_faktor", {}),
        "saatlik": {"liderlik": (O.get("oncu_saatlik") or {}).get("liderlik", {}), "saat_cifti": (O.get("oncu_saatlik") or {}).get("saat_cifti")},
    }  # fmt: skip


def _zaman(K: dict) -> dict:
    sp = K.get("saat_profili") or {}
    il = K.get("ilgi_grup") or {}
    ils = K.get("ilgi_sektor") or {}
    rot = K.get("rotasyon") or {}
    return {
        "saat": {"dilim": sp.get("dilimler", []), "grup": sp.get("grup", {}), "yil": sp.get("yil", {}), "hacim": sp.get("hacim_payi", {})},
        "takvim": K.get("saat_takvim", {}),
        "mevsim": {ad: {"ay": [v["aylar"].get(str(m)) for m in range(1, 13)], "ort": v.get("tum_ort"), "yil": v.get("yil_sayisi")} for ad, v in (K.get("mevsimsellik") or {}).items()},
        "varlik": K.get("varlik", {}),
        "rotasyon": {"yil": rot.get("yil", {}), "kalicilik": rot.get("kalicilik", {}), "yildan_yila": rot.get("yildan_yila", {})},
        "ilgi": {"grup_yil": il.get("yillik_pay", {}), "grup_getiri_sonra": il.get("getiri_sonra_ilgi"), "sektor_yil": ils.get("yillik_pay", {}),
                 "sektor_degisim": ils.get("pay_degisimi_ilk_son", {}), "getiri_sonra_ilgi": ils.get("getiri_sonra_ilgi"), "ilgi_sonra_getiri": ils.get("ilgi_sonra_getiri"),
                 "en_ters": ils.get("en_ters", [])[:6]},
        "akis": K.get("isaretli_akis", {}), "maden_saat": K.get("maden_saat", {}),
    }  # fmt: skip


def _yatirimci(Y: dict) -> dict:
    ha = dict(Y.get("halka_arz") or {})
    liste = ha.pop("liste", [])
    ha["liste"] = [[r.get("hisse"), r.get("ilk_gun"), r.get("tavan_dizisi"), r.get("dizi_getirisi"), r.get("sonra_20g"), r.get("sonra_60g"), r.get("bugune"), r.get("sektor")] for r in liste]
    return {"faktor": Y.get("faktor", {}), "kisa": Y.get("kisa_vade", {}), "fm": Y.get("fm", {}), "tavan": Y.get("tavan", {}), "taban_alimi": Y.get("taban_alimi", {}), "halka_arz": ha}


def _fon(Y: dict, arastirma: Path | None) -> dict:
    f = dict(Y.get("fon") or {})
    olaylar = f.pop("olaylar", [])
    f["olaylar"] = [[o.get("fon_sirketi"), o.get("hisse"), o.get("gun"), o.get("yon"), o.get("oran_sonra"), o.get("once_20g"), o.get("sonra_20g"), o.get("sonra_60g")] for o in olaylar]
    t = Y.get("tasfiye") or {}
    cikti: dict[str, Any] = {
        "olay": f,
        "tasfiye": {"hisseler": t.get("hisseler", []),
                    "donem": {ad: {k: v.get(k) for k in ("donem", "kume", "kiyas", "kume_ort", "kume_medyan", "kiyas_ort", "kiyas_medyan", "gunluk_fark_t", "tavan_taban_gun")}
                              for ad, v in (t.get("donem") or {}).items()}},
    }  # fmt: skip
    if arastirma and Path(arastirma).exists():
        st = _oku(Path(arastirma) / "fon_stratejileri.json")
        dv = _oku(Path(arastirma) / "yatirimci_davranisi.json")
        cikti["strateji"] = [
            {"ad": s.get("ad"), "tur": s.get("tur"), "olcut": s.get("karar_olcutleri", []), "oruntu": s.get("oruntu"), "kanit": s.get("kanit"), "guven": s.get("guven"),
             "fon": [{"kod": x.get("kod"), "ad": x.get("ad"), "beyan": x.get("strateji_beyani"), "poz": x.get("bilinen_agir_pozisyonlar", []), "getiri": x.get("getiri_notu")}
                     for x in s.get("one_cikan_fonlar", [])[:3]]}
            for s in st.get("sirketler", []) if "tera" not in str(s.get("ad", "")).lower()
        ]  # fmt: skip
        cikti["genel"] = [{"soru": g.get("soru"), "yanit": g.get("yanit"), "guven": g.get("guven")} for g in st.get("genel", [])]
        cikti["strateji_not"] = st.get("not", "")
        cikti["bulgu"] = [{"baslik": b.get("baslik"), "tip": b.get("yatirimci_tipi"), "ozet": b.get("ozet"), "kanit": b.get("kanit_gucu"), "kunye": b.get("kunye")} for b in dv.get("bulgular", [])]
        cikti["istatistik"] = [{"olcu": i.get("olcu"), "deger": i.get("deger"), "tarih": i.get("tarih"), "guven": i.get("guven")} for i in dv.get("istatistikler", []) if (i.get("guven") or 0) >= 0.6]
    return cikti


def sayfa_verisi(cikti: str | Path, arastirma: str | Path | None = None) -> dict:
    """Analiz çıktılarından sayfanın tek veri nesnesi. `cikti` = `veri/ag/analiz`; şirket adları bir üst klasördeki `tv_tarama.csv`'den okunur."""
    cikti = Path(cikti)
    A, Z, O, K, Y, S, OZ = (_oku(cikti / f"{ad}.json") for ad in ("agac", "zaman", "oncu", "akis", "yatirimci", "strateji", "ozet"))
    ek = {ad: _oku(cikti / f"{ad}.json") for ad in ("kap", "yabanci", "sektor_mevsim") if (cikti / f"{ad}.json").exists()}
    if isinstance(al := (ek.get("kap") or {}).get("fon"), dict):
        al.pop("olaylar", None)  # tek tek bildirimler sayfada kullanılmaz
    veri = {
        "uretim": OZ.get("zaman"), "veri": OZ.get("veri", {}),
        "ad": {"grup": GRUP_AD, "grup_sira": GRUP_SIRA, "ozellik": OZELLIK_AD, "sektor": SEKTOR_AD, "seri": SERI_AD, "ay": AYLAR, "ay_uzun": AY_UZUN, "mevsim": MEVSIM_AD},
        "agac": _agac(A, Z, _adlar(cikti.parent)), "yayilim": _yayilim(K, O), "zaman": _zaman(K), "yatirimci": _yatirimci(Y),
        "fon": _fon(Y, Path(arastirma) if arastirma else None), "kural": S, "ek": ek,
    }  # fmt: skip
    return _yuvarla(veri)


def sayfa_yaz(cikti: str | Path, html_yolu: str | Path, arastirma: str | Path | None = None) -> Path:
    """Şablon parçalarını ve veriyi birleştirip tek dosyalık sayfayı yazar."""
    veri = sayfa_verisi(cikti, arastirma)
    govde = (SABLON / "govde.html").read_text(encoding="utf-8")
    stil = (SABLON / "stil.css").read_text(encoding="utf-8")
    betik = "\n".join((SABLON / ad).read_text(encoding="utf-8") for ad in BETIKLER)
    # Veri bir <script type="application/json"> içinde durur; "</" dizisi kaçırılır ki betik etiketi erken kapanmasın
    veri_metni = json.dumps(veri, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    html = govde.replace("/*__STIL__*/", stil).replace("/*__VERI__*/", veri_metni).replace("/*__BETIK__*/", betik)
    yol = Path(html_yolu)
    yol.parent.mkdir(parents=True, exist_ok=True)
    yol.write_text(html, encoding="utf-8")
    return yol

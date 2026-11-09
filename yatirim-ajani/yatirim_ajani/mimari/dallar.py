"""Dallanma ağacı: haneler + piyasa bağlamı + portföy → yol (dallar) → eylem (yaprak).

Her dal bir koşul (bağlam → bool) ve insan okuyabilir bir açıklama taşır. Gezinti derinlik önceliklidir: koşulu
doğru olan İLK çocuğa inilir; yaprağa varınca eylem döner. Ağaç kod içinde tanımlıdır ama `agac_json` ile dışa
aktarılır (görselleştirme ve budama için).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Literal

from .haneler import KapHane

Karar = Literal["AL", "SAT", "IZLE", "ISLEM_YOK"]


@dataclass
class Eylem:
    karar: Karar
    strateji: str  # strateji kodu (istatistik kapısı ve raporlama için)
    gerekce: str
    pencere: Literal["sonraki_saat", "gun_sonu", "ertesi_acilis"] = "sonraki_saat"
    limit_tolerans: float = 0.01  # AL: ref×(1+tol); SAT: ref×(1-tol)
    kovalama_tavani: float = 0.05  # AL limiti haber öncesi fiyatın en fazla bu kadar üstü
    boyut: float = 1.0  # ATR tabanlı payın çarpanı
    zarar_kes: float = -0.05
    kar_al: float | None = 0.10
    ufuk_gun: int = 5
    sat_orani: float = 0.5  # SAT: elde tutulanın oranı


@dataclass
class Baglam:
    hane: KapHane
    onceki: dict | None  # haber öncesi son dosya satırı
    son: dict | None  # şimdiye kadarki son dosya satırı
    tepki: dict  # {"getiri", "tavan", "hacim_kat", "satir"} haber sonrası
    portfoy: dict  # {"nakit", "toplam", "pozisyonlar": {hisse: {"adet", "maliyet"}}, "gunluk_getiri", "zirveden"}
    istatistik: dict = field(default_factory=dict)  # {strateji: {"t": .., "ort": .., "n": ..}}

    def f(self, ad: str, varsayilan: Any = None) -> Any:
        for kaynak in (self.son, self.onceki):
            if kaynak and kaynak.get(ad) is not None:
                return kaynak[ad]
        return varsayilan

    @property
    def elde(self) -> int:
        return int(self.portfoy.get("pozisyonlar", {}).get(self.hane.hisse, {}).get("adet", 0))


@dataclass
class Dal:
    ad: str
    aciklama: str
    kosul: Callable[[Baglam], bool]
    cocuklar: list[Dal] = field(default_factory=list)
    eylem: Eylem | None = None


def degerlendir(kok: Dal, b: Baglam) -> tuple[list[str], Eylem]:
    yol: list[str] = []
    dugum = kok
    while True:
        yol.append(dugum.ad)
        if dugum.eylem is not None and not dugum.cocuklar:
            return yol, dugum.eylem
        for c in dugum.cocuklar:
            if c.kosul(b):
                dugum = c
                break
        else:
            return yol, Eylem("IZLE", "eslesme_yok", f"'{dugum.ad}' altında koşulu sağlayan dal yok")


def agac_json(d: Dal) -> dict:
    out: dict = {"ad": d.ad, "aciklama": d.aciklama}
    if d.eylem:
        e = d.eylem
        out["eylem"] = {"karar": e.karar, "strateji": e.strateji, "gerekce": e.gerekce, "pencere": e.pencere, "boyut": e.boyut,
                        "zarar_kes": e.zarar_kes, "kar_al": e.kar_al, "ufuk_gun": e.ufuk_gun}  # fmt: skip
    if d.cocuklar:
        out["cocuklar"] = [agac_json(c) for c in d.cocuklar]
    return out


def agac_metni(d: Dal, girinti: str = "") -> str:
    satir = f"{girinti}{d.ad} — {d.aciklama}"
    if d.eylem:
        e = d.eylem
        satir += f"  ⇒ {e.karar} [{e.strateji}]" + (f" boyut×{e.boyut}, stop {e.zarar_kes:+.0%}, hedef {e.kar_al:+.0%}, {e.ufuk_gun}g, {e.pencere}" if e.karar == "AL" and e.kar_al else "")
    return "\n".join([satir] + [agac_metni(c, girinti + "   ") for c in d.cocuklar])


# --- koşul yardımcıları ------------------------------------------------------------------------
HARIC = {"TERA", "TEHOL", "TRHOL"}
BUYUME = {"yatirim", "is_iliskisi", "ihale", "yeni_is"}


def _pd(b: Baglam) -> float | None:
    return b.hane.pd_orani


def _rejim_destek(b: Baglam) -> bool:
    x = b.f("xu100_ma200_uzaklik")
    m = b.f("ma50_uzaklik")
    return bool((x is not None and x > 0) or (m is not None and m > 0))


def _kacti(b: Baglam) -> bool:
    g = b.tepki.get("getiri")
    return bool(b.tepki.get("tavan") or (g is not None and g >= 0.06))


def _hacim_teyit(b: Baglam) -> bool:
    k = b.tepki.get("hacim_kat")
    g = b.tepki.get("getiri")
    return bool(k is not None and k >= 1.5 and g is not None and g > 0)


def _yon(b: Baglam) -> str:
    return b.hane.etkin_yon()


def olay_agaci() -> Dal:
    al = lambda **k: Eylem("AL", **k)  # noqa: E731
    return Dal("KÖK", "Yeni KAP hanesi geldi", lambda b: True, [
        Dal("Okuma güvensiz", "hane güveni < 0,5", lambda b: b.hane.guven < 0.5,
            eylem=Eylem("IZLE", "veri_kapisi", "Hane güveni düşük; ajan bildirimi yeniden okusun")),
        Dal("Hariç hisse", "Tera hisseleri (kullanıcı kuralı)", lambda b: b.hane.hisse in HARIC,
            eylem=Eylem("ISLEM_YOK", "haric", "Kullanıcı kuralı: Tera hisseleri analiz edilmez")),
        Dal("Dosya yok", "hissenin dosya satırı yok", lambda b: b.son is None and b.onceki is None,
            eylem=Eylem("IZLE", "veri_kapisi", "Hisse dosyası yok; önce dosya-veri + dosya-kur")),
        Dal("Büyüme haberi", "tür ∈ {yatırım, iş ilişkisi, ihale, yeni iş}", lambda b: b.hane.tur in BUYUME, [
            Dal("Büyüklük ölçülemedi", "tutar ya da piyasa değeri yok", lambda b: _pd(b) is None,
                eylem=Eylem("IZLE", "olay_buyume", "Tutar/piyasa değeri yok; büyüklük ölçülemedi")),
            Dal("Önemsiz", "tutar < piyasa değerinin %0,25'i", lambda b: abs(_pd(b)) < 0.0025,
                eylem=Eylem("ISLEM_YOK", "olay_buyume", "Tutar piyasa değerine göre çok küçük; fiyatı oynatması beklenmez")),
            Dal("Fiyat kaçtı", "haber sonrası ≥ +%6 ya da tavan", _kacti,
                eylem=Eylem("IZLE", "olay_buyume", "Fiyat haberi fiyatladı; kovalamıyoruz, ertesi gün ilk saat yeniden bak")),
            Dal("Büyük", "tutar ≥ PD'nin %3'ü", lambda b: abs(_pd(b)) >= 0.03, [
                Dal("Rejim destekli", "XU100 MA200 üstü ya da hisse MA50 üstü", _rejim_destek,
                    eylem=al(strateji="olay_buyume_buyuk", gerekce="Büyük büyüme haberi + destekleyici rejim", boyut=1.0, zarar_kes=-0.05, kar_al=0.10, ufuk_gun=5)),
                Dal("Rejim zayıf", "aksi", lambda b: True,
                    eylem=al(strateji="olay_buyume_buyuk", gerekce="Büyük haber ama zayıf rejim: yarım boyut, kısa ufuk", boyut=0.5, zarar_kes=-0.04, kar_al=0.08, ufuk_gun=3)),
            ]),
            Dal("Orta", "PD'nin %1–3'ü", lambda b: abs(_pd(b)) >= 0.01, [
                Dal("Hacim teyidi", "haber sonrası hacim ≥ 1,5× ve fiyat artıda", _hacim_teyit,
                    eylem=al(strateji="olay_buyume_orta", gerekce="Orta büyüklükte haber, hacimle teyit edildi", boyut=0.5, zarar_kes=-0.03, kar_al=0.06, ufuk_gun=3)),
                Dal("Teyit yok", "aksi", lambda b: True, eylem=Eylem("IZLE", "olay_buyume_orta", "Orta büyüklükte haber; hacim teyidi bekleniyor")),
            ]),
            Dal("Küçük", "PD'nin %0,25–1'i", lambda b: True, eylem=Eylem("IZLE", "olay_buyume_kucuk", "Küçük haber; tek başına işlem sebebi değil")),
        ]),
        Dal("Satın alma/birleşme", "tür = birleşme/devralma (şirket alan taraf)", lambda b: b.hane.tur == "birlesme_devralma", [
            Dal("Büyük ve teyitli", "bedel ≥ PD'nin %3'ü, haber sonrası hacim ≥ 1,5× ve fiyat artıda", lambda b: (_pd(b) or 0) >= 0.03 and _hacim_teyit(b),
                eylem=al(strateji="satin_alma", gerekce="Büyük satın alım piyasa tarafından olumlu karşılandı (hacim + fiyat teyidi)", boyut=0.5, zarar_kes=-0.04, kar_al=0.08, ufuk_gun=5)),
            Dal("Teyitsiz", "aksi", lambda b: True,
                eylem=Eylem("IZLE", "satin_alma", "Alan şirketin getirisi ortalamada sıfıra yakın; fiyat/hacim teyidi beklenir")),
        ]),
        Dal("Bedelsiz", "tür = bedelsiz sermaye artırımı", lambda b: b.hane.tur == "bedelsiz", [
            Dal("Yüksek oran", "oran ≥ %100", lambda b: (b.hane.oran or 0) >= 1.0,
                eylem=al(strateji="bedelsiz_beklenti", gerekce="Yüksek oranlı bedelsiz: BIST'te yaygın beklenti alımı; hak kullanım öncesi çık",
                         pencere="gun_sonu", boyut=0.5, zarar_kes=-0.07, kar_al=0.15, ufuk_gun=20)),
            Dal("Düşük oran", "aksi", lambda b: True, eylem=Eylem("IZLE", "bedelsiz_beklenti", "Bedelsiz oranı düşük")),
        ]),
        Dal("Temettü", "tür = kâr payı", lambda b: b.hane.tur == "temettu", [
            Dal("Yüksek verim", "pay başı brüt / fiyat ≥ %5", lambda b: (b.hane.temettu_verimi or 0) >= 0.05,
                eylem=al(strateji="temettu_yakalama", gerekce="Yüksek temettü verimi; hak kullanım gününe kadar tut", pencere="gun_sonu",
                         boyut=0.5, zarar_kes=-0.05, kar_al=None, ufuk_gun=10)),
            Dal("Düşük verim", "aksi", lambda b: True, eylem=Eylem("IZLE", "temettu_yakalama", "Temettü verimi düşük")),
        ]),
        Dal("Geri alım", "tür = pay geri alımı", lambda b: b.hane.tur == "geri_alim", [
            Dal("Anlamlı tutar", "tutar ≥ PD'nin %1'i", lambda b: (_pd(b) or 0) >= 0.01,
                eylem=al(strateji="geri_alim", gerekce="Anlamlı geri alım programı: alım desteği", pencere="gun_sonu", boyut=0.5, zarar_kes=-0.05, kar_al=0.08, ufuk_gun=20)),
            Dal("Sembolik", "aksi", lambda b: True, eylem=Eylem("IZLE", "geri_alim", "Geri alım tutarı küçük")),
        ]),
        Dal("Arz baskısı", "tür ∈ {pay satışı, bedelli}", lambda b: b.hane.tur in ("pay_satisi", "bedelli"), [
            Dal("Elde var", "portföyde pozisyon var", lambda b: b.elde > 0,
                eylem=Eylem("SAT", "arz_baskisi", "Ortak satışı / bedelli: arz baskısı; pozisyonun yarısını azalt", pencere="sonraki_saat", sat_orani=0.5)),
            Dal("Elde yok", "aksi", lambda b: True, eylem=Eylem("ISLEM_YOK", "arz_baskisi", "Arz baskısı haberi; alım yapılmaz")),
        ]),
        Dal("Risk haberi", "tür = dava/ceza", lambda b: b.hane.tur == "dava_ceza", [
            Dal("Büyük ve elde var", "tutar ≥ özkaynağın %2'si ve pozisyon var", lambda b: (b.hane.ozkaynak_orani or 0) >= 0.02 and b.elde > 0,
                eylem=Eylem("SAT", "risk_haberi", "Özkaynağa göre büyük ceza/dava: pozisyonun yarısını azalt", sat_orani=0.5)),
            Dal("Diğer", "aksi", lambda b: True, eylem=Eylem("IZLE", "risk_haberi", "Risk haberi izlenir")),
        ]),
        Dal("Derecelendirme", "tür = kredi notu", lambda b: b.hane.tur == "derecelendirme", [
            Dal("Düşürme, elde var", "yön olumsuz ve pozisyon var", lambda b: _yon(b) == "olumsuz" and b.elde > 0,
                eylem=Eylem("SAT", "derecelendirme", "Not düşürüldü; pozisyonun yarısını azalt", sat_orani=0.5)),
            Dal("Diğer", "aksi", lambda b: True, eylem=Eylem("IZLE", "derecelendirme", "Not değişimi tek başına alım sebebi değil")),
        ]),
        Dal("Bilanço", "tür = finansal rapor", lambda b: b.hane.tur == "finansal_rapor", [
            Dal("Olumlu sürpriz", "net kâr beklentiyi ≥ %20 aştı", lambda b: (b.hane.kar_surprizi or 0) >= 0.20,
                eylem=al(strateji="pead", gerekce="Kâr sürprizi: BIST'te kâr açıklaması sonrası sürüklenme kanıtı güçlü", pencere="gun_sonu",
                         boyut=0.5, zarar_kes=-0.05, kar_al=0.10, ufuk_gun=20)),
            Dal("Olumsuz sürpriz, elde var", "beklentinin ≥ %20 altı ve pozisyon var", lambda b: (b.hane.kar_surprizi or 0) <= -0.20 and b.elde > 0,
                eylem=Eylem("SAT", "pead", "Olumsuz kâr sürprizi; pozisyonun yarısını azalt", sat_orani=0.5)),
            Dal("Sürpriz yok/bilinmiyor", "aksi", lambda b: True, eylem=Eylem("IZLE", "pead", "Beklenti bilinmiyor ya da sapma küçük")),
        ]),
        Dal("Diğer", "kalan türler", lambda b: True, eylem=Eylem("IZLE", "diger", "Tür için kural yok; izlenir")),
    ])  # fmt: skip

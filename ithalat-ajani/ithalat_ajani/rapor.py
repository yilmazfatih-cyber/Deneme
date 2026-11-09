"""Markdown rapor: uygun ürünler, doğrulanacaklar, eşiğe yakınlar, maliyet dökümleri ve varsayımlar."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass, field
from datetime import datetime

from .ayarlar import Ayarlar
from .bicim import sayi, tl, usd, yuzde
from .degerlendir import Okunamayan, Sonuc
from .kur import Kur
from .tarife import Tarife

AYLAR = ("Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık")


def tarih_metni(an: datetime) -> str:
    return f"{an.day} {AYLAR[an.month - 1]} {an.year} {an:%H:%M}"


def _hucre(metin: str) -> str:
    return metin.replace("|", "/").replace("\n", " ").strip()


@dataclass
class RaporGirdisi:
    an: datetime
    kur: Kur
    sonuclar: list[Sonuc]
    okunamayan: list[Okunamayan] = field(default_factory=list)
    kategoriler: list[str] = field(default_factory=list)
    notu: str = ""
    onceki: dict[str, sqlite3.Row | None] = field(default_factory=dict)  # url → önceki ölçüm


FIYAT_DUSUSU_ESIGI = 0.03  # önceki ölçüme göre en az %3 ucuzlayan ilan "fiyatı düşen" sayılır


def _durum_listesi(g: RaporGirdisi, *durumlar: str) -> list[Sonuc]:
    return [s for s in g.sonuclar if s.durum in durumlar]


def fiyat_dususu(g: RaporGirdisi, s: Sonuc) -> tuple[float, float] | None:
    """(önceki fiyat $, düşüş oranı); önceki ölçüm yoksa ya da düşüş eşiğin altındaysa None."""
    eski = g.onceki.get(s.aday.url)
    if eski is None or not eski["fiyat_usd"]:
        return None
    once = float(eski["fiyat_usd"])
    oran = 1 - s.aday.fiyat_usd / once
    return (once, oran) if oran >= FIYAT_DUSUSU_ESIGI else None


def indirimdekiler(g: RaporGirdisi) -> list[Sonuc]:
    """Alibaba'da kampanyadaki ya da önceki taramaya göre ucuzlamış ilanlar; süreli fırsatlar önce."""
    liste = [s for s in g.sonuclar if not s.aday.taklit_riski and (s.aday.indirim or fiyat_dususu(g, s))]
    return sorted(liste, key=lambda s: (not s.sureli_firsat, s.sira_anahtari))


def _yenilik(g: RaporGirdisi, s: Sonuc) -> str:
    eski = g.onceki.get(s.aday.url)
    parcalar = ["yeni" if eski is None else f"önce kat {sayi(eski['kat'], 2)} ({eski['an'][:10]})"]
    if s.indirim_orani is not None:
        parcalar.append(f"Alibaba indirimi {yuzde(s.indirim_orani)}")
    dusus = fiyat_dususu(g, s)
    if dusus:
        parcalar.append(f"{yuzde(dusus[1])} ucuzladı")
    return " · ".join(parcalar)


def _tr_hucre(s: Sonuc) -> str:
    ek = f", {s.tr.indirimde_adet} indirimde" if s.tr.indirimde_adet else ""
    return f"{tl(s.tr.medyan)} ({s.tr.adet} ilan{ek})"


def _tablo(g: RaporGirdisi, liste: list[Sonuc]) -> list[str]:
    satirlar = [
        "| # | Ürün | Alibaba (MOQ) | Birim maliyet | Türkiye medyan | Kat | Vergi | Kargo payı | Kâr/adet* | Durum |",
        "|---|------|---------------|---------------|----------------|-----|-------|------------|-----------|-------|",
    ]
    for i, s in enumerate(liste, start=1):
        a = s.aday
        satirlar.append(
            f"| {i} | [{_hucre(a.urun)}]({a.url}) — {_hucre(s.kategori.ad)} | {usd(a.fiyat_usd)} ({sayi(a.moq)}) "
            f"| {tl(s.dokum.birim_maliyet_tl)} | {_tr_hucre(s)} | **{sayi(s.kat, 2)}** "
            f"| {yuzde(s.dokum.vergi_yuku)} | {yuzde(s.dokum.kargo_payi)} | {tl(s.satis.birim_kar_tl)} | {_yenilik(g, s)} |"
        )
    return satirlar


def _dokum_satirlari(s: Sonuc, ayarlar: Ayarlar) -> list[str]:
    d, a, k, sat = s.dokum, s.aday, s.kategori, s.satis
    kademeler = ", ".join(f"≥{sayi(x.min_adet)}: {usd(x.fiyat_usd)}" for x in a.kademeler) or "verilmedi"
    agirlik = {"ilan": "ilandan", "tahmin": "tahmin", "kategori": "kategori ortalaması"}[a.agirlik_kaynagi]
    satirlar = [
        f"- **Alibaba:** [{_hucre(a.baslik or a.urun)}]({a.url})"
        + (f" — {_hucre(a.tedarikci).rstrip('.')}" if a.tedarikci else "")
        + f". Fiyat {usd(a.fiyat_usd)}, MOQ {sayi(a.moq)}, kademeler: {kademeler}."
        f" Birim ağırlık {sayi(a.agirlik_kg, 3)} kg ({agirlik}).",
        f"- **Türkiye:** medyan {tl(s.tr.medyan)} ({tl(s.tr.en_dusuk)}–{tl(s.tr.en_yuksek)}, {s.tr.adet} ilan)."
        + (f" {_hucre(a.tr_not)}" if a.tr_not else ""),
    ]
    for ilan in a.tr_ilanlar:
        etiket = _hucre(f"{ilan.kaynak}: {ilan.baslik}".strip(": ")) or "ilan"
        fiyat = tl(ilan.fiyat_tl) + (f" (normal {tl(ilan.liste_fiyat_tl)})" if ilan.indirimde else "")
        satirlar.append(f"  - [{etiket}]({ilan.url}) — {fiyat}" if ilan.url else f"  - {etiket} — {fiyat}")
    if a.indirim:
        ind = a.indirim
        satirlar.append(
            f"- **Alibaba indirimi:** {usd(ind.liste_fiyat_usd)} → {usd(a.fiyat_usd)} ({yuzde(ind.oran(a.fiyat_usd))})"
            + (f", bitiş {ind.bitis}" if ind.bitis else ", bitişi bilinmiyor")
            + (f" — {_hucre(ind.aciklama)}" if ind.aciklama else "")
            + (f". İndirim bitince kat {sayi(s.indirimsiz_kat, 2)}." if s.indirimsiz_kat is not None else ".")
        )
    gtip = f"GTİP {a.gtip}" if a.gtip else f"GTİP {'/'.join(k.gtip)} (kategori)"
    satirlar += [
        f"- **Birim maliyet ({gtip}, GV {yuzde(k.gv, None)}, İGV {yuzde(k.igv, None)}{' tahmini' if k.tahmini else ''}):**"
        f" mal {tl(d.mal_tl)} + ödeme {tl(d.odeme_tl)} + kargo {tl(d.kargo_tl)} ({sayi(d.ucretli_kg, 3)} kg)"
        f" + sigorta {tl(d.sigorta_tl)} + GV {tl(d.gv_tl)} + İGV {tl(d.igv_tl)}"
        + (f" + EMY {tl(d.emy_tl)}" if d.emy_tl else "")
        + f" + sabit pay {tl(d.sabit_pay_tl)} = **{tl(d.birim_maliyet_tl)}** (KDV hariç)."
        f" İthalat KDV'si {tl(d.ithalat_kdv_tl)} ödenir, satışta indirilir.",
        f"- **Pazaryerinde (tahmini):** satış {tl(sat.satis_net_tl)} (KDV hariç) − komisyon {tl(sat.komisyon_tl)}"
        f" − sipariş gideri {tl(sat.siparis_gideri_tl)} − iade {tl(sat.iade_tl)} − maliyet {tl(d.birim_maliyet_tl)}"
        f" = **{tl(sat.birim_kar_tl)}/adet** (marj {yuzde(sat.kar_marji)}).",
    ]
    if s.avantajlar:
        satirlar.append(f"- **Avantaj:** {'; '.join(s.avantajlar)}.")
    if s.dogrula:
        satirlar += ["- **Doğrulanacak:**", *(f"  - {x}" for x in s.dogrula)]
    if s.notlar:
        satirlar += ["- **Not:**", *(f"  - {x}" for x in s.notlar)]
    if a.gerekce:
        satirlar.append(f"- **Neden aday:** {_hucre(a.gerekce)}")
    if a.riskler:
        satirlar.append(f"- **Riskler:** {'; '.join(_hucre(r) for r in a.riskler)}")
    return satirlar


def rapor_yaz(g: RaporGirdisi, ayarlar: Ayarlar, tarife: Tarife) -> str:
    e, kg, gm, sa = ayarlar.esikler, ayarlar.kargo, ayarlar.gumruk, ayarlar.satis
    uygun = _durum_listesi(g, "UYGUN")
    dogrula = _durum_listesi(g, "UYGUN-DOGRULA")
    yakin = _durum_listesi(g, "YAKIN")
    elenen = _durum_listesi(g, "ELENDI")
    kategori_adlari = ", ".join(tarife.kategoriler[k].ad for k in g.kategoriler if k in tarife.kategoriler)

    m = [
        f"# İthalat taraması — {tarih_metni(g.an)}",
        "",
        f"1 USD = {sayi(g.kur.usd_tl, 2)} TL ({g.kur.aciklama()}) · kargo {usd(kg.usd_kg)}/kg (+{yuzde(kg.ambalaj_payi, None)} ambalaj)"
        f" · hedef: Türkiye fiyatı ≥ {sayi(e.hedef_kat, 1)} × birim maliyet (ikisi de KDV hariç)",
        "",
        f"**{len(g.sonuclar)} aday** değerlendirildi: **{len(uygun)} uygun**, {len(dogrula)} doğrulanacak,"
        f" {len(yakin)} eşiğe yakın, {len(elenen)} elendi"
        + (f", {len(g.okunamayan)} okunamadı" if g.okunamayan else "")
        + "."
        + (f" Kategoriler: {kategori_adlari}." if kategori_adlari else ""),
    ]
    if g.notu:
        m += ["", g.notu]

    if uygun:
        m += ["", "## Uygun ürünler", "", *_tablo(g, uygun)]
    else:
        m += ["", "## Uygun ürünler", "", "Bu taramada tüm koşulları sağlayan ürün çıkmadı."]
    if dogrula:
        m += ["", "## Kat tutuyor, doğrulanmalı", "", *_tablo(g, dogrula)]
    if yakin:
        m += ["", f"## Eşiğe yakın ({sayi(e.yakin_kat, 1)}–{sayi(e.hedef_kat, 1)} kat)", "", *_tablo(g, yakin)]
    if uygun or dogrula or yakin:
        m += ["", "\\* Kâr/adet: Trendyol komisyonu, kargo ve iade düşülmüş tahmin; gelir vergisi ve reklam hariç."]

    indirimli = indirimdekiler(g)
    if indirimli:
        m += [
            "",
            "## İndirimdekiler ve fiyatı düşenler",
            "",
            "Alibaba'da kampanyadaki ilanlar ve önceki taramaya göre ucuzlayanlar. \"Süreli fırsat\": eşiği yalnız"
            " indirimle geçiyor, indirim bitmeden sipariş gerekir.",
            "",
            "| Ürün | İndirim | Bitiş | Fiyat | Kat şimdi | İndirimsiz / önceki kat | Durum |",
            "|------|---------|-------|-------|-----------|-------------------------|-------|",
        ]
        for s in indirimli:
            a, dusus = s.aday, fiyat_dususu(g, s)
            if a.indirim:
                ne = f"Alibaba {yuzde(s.indirim_orani)}" + (f" ({_hucre(a.indirim.aciklama)})" if a.indirim.aciklama else "")
                fiyat = f"{usd(a.indirim.liste_fiyat_usd)} → {usd(a.fiyat_usd)}"
                bitis = a.indirim.bitis or "bilinmiyor"
                karsilastir = f"{sayi(s.indirimsiz_kat, 2)} (indirimsiz)"
            else:
                ne = f"önceki taramaya göre {yuzde(dusus[1])} ucuz"
                fiyat = f"{usd(dusus[0])} → {usd(a.fiyat_usd)}"
                bitis = "—"
                eski = g.onceki[a.url]
                karsilastir = f"{sayi(eski['kat'], 2)} ({eski['an'][:10]})"
            durum = s.durum + (" · süreli fırsat" if s.sureli_firsat else "")
            m.append(
                f"| [{_hucre(a.urun)}]({a.url}) | {ne} | {bitis} | {fiyat} | **{sayi(s.kat, 2)}** | {karsilastir} | {durum} |"
            )

    ayrinti = uygun + dogrula + yakin
    if ayrinti:
        m += ["", "## Ayrıntılar"]
        for i, s in enumerate(ayrinti, start=1):
            m += ["", f"### {i}. {s.aday.urun} — kat {sayi(s.kat, 2)} ({s.durum})", "", *_dokum_satirlari(s, ayarlar)]

    if elenen:
        m += ["", "## Elenenler", ""]
        for s in elenen:
            neden = "; ".join(x for x in s.dogrula if "taklit" in x) or f"kat {sayi(s.kat, 2)}"
            m.append(
                f"- [{_hucre(s.aday.urun)}]({s.aday.url}): {neden} — maliyet {tl(s.dokum.birim_maliyet_tl)},"
                f" Türkiye {tl(s.tr.medyan)}, vergi {yuzde(s.dokum.vergi_yuku)}, kargo payı {yuzde(s.dokum.kargo_payi)}"
            )
    if g.okunamayan:
        m += ["", "## Okunamayan adaylar", ""]
        m += [f"- {o.urun}: {o.neden}" for o in g.okunamayan]

    m += [
        "",
        "## Varsayımlar",
        "",
        f"- Gümrük kıymeti (CIF) = mal + kargo + sigorta ({yuzde(gm.sigorta_orani, None)}). GV ve İGV CIF üzerinden;"
        f" KDV ithalatta ödenir, satışta indirilir. Vergi tablosu sürümü {tarife.surum}; oranlar 12 haneli GTİP'e"
        " göre değişebilir, siparişten önce gümrük müşavirine doğrulatın.",
        f"- Sevkiyat başına sabit masraf {tl(gm.sevkiyat_sabit_tl)} (müşavir, beyanname, ardiye, yurt içi teslim),"
        f" {usd(gm.sevkiyat_mal_bedeli_usd)} mal bedeline göre dağıtıldı. Ödeme komisyonu ve kur farkı"
        f" {yuzde(gm.odeme_orani, None)}.",
        f"- Pazaryeri: komisyon {yuzde(sa.pazaryeri_komisyon, None)} (KDV dahil fiyattan), sipariş başı"
        f" {tl(sa.siparis_gideri_tl)} kargo ve hizmet bedeli, iade oranı {yuzde(sa.iade_orani, None)}.",
        "- Türkiye fiyatı benzer ilanların medyanıdır. Markalı ürünle karşılaştırma yapılmaz;"
        " markalı ya da taklit ürün aday olamaz.",
        "- Posta/hızlı kargo rejimi (%60 tek vergi) kişisel kullanım içindir. Satış için normal ithalat"
        " ve vergi numarası gerekir; bu hesap ticari ithalata göredir.",
    ]
    return "\n".join(m) + "\n"


def ozet_metni(g: RaporGirdisi, ayarlar: Ayarlar, en_fazla: int = 5) -> str:
    """Bildirim ve Issue için kısa özet."""
    uygunlar = _durum_listesi(g, "UYGUN", "UYGUN-DOGRULA")
    satirlar = [
        f"İthalat taraması {tarih_metni(g.an)}: {len(g.sonuclar)} aday, {len(uygunlar)} tanesi"
        f" {sayi(ayarlar.esikler.hedef_kat, 1)} katı tutuyor (1 USD = {sayi(g.kur.usd_tl, 2)} TL)."
    ]
    for s in uygunlar[:en_fazla]:
        etiket = "" if s.durum == "UYGUN" else " (doğrula)"
        satirlar.append(
            f"- {s.aday.urun}: {usd(s.aday.fiyat_usd)} → maliyet {tl(s.dokum.birim_maliyet_tl)},"
            f" Türkiye {tl(s.tr.medyan)}, kat {sayi(s.kat, 2)}{etiket}"
        )
    if not uygunlar:
        en_iyi = max(g.sonuclar, key=lambda s: s.kat, default=None)
        if en_iyi:
            satirlar.append(f"En yakın: {en_iyi.aday.urun}, kat {sayi(en_iyi.kat, 2)}.")
    indirimli = indirimdekiler(g)
    if indirimli:
        parcalar = []
        for s in indirimli[:3]:
            ne = f"Alibaba {yuzde(s.indirim_orani)}" if s.aday.indirim else f"{yuzde(fiyat_dususu(g, s)[1])} ucuzladı"
            bitis = f", bitiş {s.aday.indirim.bitis}" if s.aday.indirim and s.aday.indirim.bitis else ""
            parcalar.append(f"{s.aday.urun} ({ne}{bitis}, kat {sayi(s.kat, 2)}{', süreli fırsat' if s.sureli_firsat else ''})")
        satirlar.append(f"İndirimde/fiyatı düşen {len(indirimli)} ürün: " + "; ".join(parcalar) + ".")
    return "\n".join(satirlar)

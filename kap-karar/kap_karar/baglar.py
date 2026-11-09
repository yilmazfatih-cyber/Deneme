"""Olaylar arası bağ kuralları.

İki kaynak:
1. Elle verilen bağlar (olayın `bagli` alanı) — en güvenilir, ağırlık 0.9.
2. Otomatik kurallar — tür çiftleri ve zaman penceresine göre; ortak etiket / aynı hisse.
"""

from __future__ import annotations

from datetime import date
from itertools import product

from .sema import Bag, Olay

# (kaynak_tur, hedef_tur, en_fazla_gun, iliski, aciklama, agirlik)
# kaynak önce olur, hedef sonra; "ardıl" için tarih sırası zorunlu.
TUR_KURALLARI: list[tuple[str, str, int, str, str, float]] = [
    ("enflasyon_verisi", "tcmb_faiz_karari", 45, "girdi", "Enflasyon verisi bir sonraki PPK kararının ana girdisidir", 0.8),
    ("tcmb_enflasyon_raporu", "tcmb_faiz_karari", 60, "girdi", "Enflasyon Raporu tahmin patikası PPK adımlarını çerçeveler", 0.6),
    ("buyume_verisi", "tcmb_faiz_karari", 45, "girdi", "Zayıf/güçlü büyüme PPK'nın indirim alanını değiştirir", 0.4),
    ("kur_hareketi", "tcmb_faiz_karari", 30, "girdi", "Kur/rezerv baskısı PPK kararını sıkılaştırır", 0.6),
    ("fed_karari", "tcmb_faiz_karari", 45, "girdi", "Fed'in yönü TCMB'nin dış alanını belirler", 0.4),
    ("jeopolitik_sok", "tcmb_faiz_karari", 45, "girdi", "Petrol/kur şoku PPK'yı temkinli yapar", 0.5),
    ("jeopolitik_sok", "kur_hareketi", 14, "tetikler", "Jeopolitik şok kur ve rezerv hareketini tetikler", 0.7),
    ("jeopolitik_sok", "enerji_fiyat_duzenlemesi", 60, "tetikler", "Petrol şoku yönetilen enerji fiyatlarına zam olarak yansır", 0.5),
    ("jeopolitik_sok", "enflasyon_verisi", 60, "girdi", "Enerji şoku aylık TÜFE'ye 1–2 ay gecikmeyle yansır", 0.5),
    ("jeopolitik_sok", "kredi_notu_ulke", 90, "girdi", "Dış şok not görünümünü etkiler (Fitch Nis 2026)", 0.4),
    ("tcmb_faiz_karari", "kredi_notu_ulke", 90, "girdi", "Para politikası duruşu not kararının gerekçesidir", 0.4),
    ("tcmb_faiz_karari", "finansal_rapor", 100, "girdi", "Faiz patikası banka marjlarını ve finansman giderini belirler", 0.3),
    ("enflasyon_verisi", "maliye_butce_ovp", 45, "girdi", "Enflasyon verisi ücret/maaş zammının ve OVP hedeflerinin referansıdır", 0.5),
    ("tcmb_enflasyon_raporu", "maliye_butce_ovp", 90, "girdi", "TCMB tahmini Ocak maaş zamlarının çıpasıdır", 0.4),
    ("maliye_butce_ovp", "enflasyon_verisi", 60, "girdi", "Vergi/ÖTV ve yönetilen fiyat kararları TÜFE'ye yansır", 0.5),
    ("enerji_fiyat_duzenlemesi", "enflasyon_verisi", 45, "girdi", "Elektrik/doğalgaz zammı TÜFE'ye doğrudan girer", 0.7),
    ("siyasi_belirsizlik", "kur_hareketi", 14, "tetikler", "Siyasi şok kur ve rezervleri vurur", 0.7),
    ("siyasi_belirsizlik", "tcmb_faiz_karari", 30, "girdi", "Siyasi şok sonrası TCMB sıkılaştırır/bekler", 0.5),
    ("piyasa_guven_sorusturma", "endeks_saglayici_karari", 60, "tetikler", "Piyasa güven krizi endeks sağlayıcı kararını tetikler", 0.7),
    ("piyasa_guven_sorusturma", "piyasa_guven_sorusturma", 120, "ardil", "Soruşturmanın aşamaları", 0.8),
    ("piyasa_guven_sorusturma", "tcmb_faiz_karari", 45, "zayiflatir", "Güven krizi faiz indiriminin olumlu etkisini bastırır", 0.5),
    ("endeks_saglayici_karari", "kur_hareketi", 21, "tetikler", "Pasif çıkış rezerv ve kura yansır", 0.4),
    ("fed_karari", "kur_hareketi", 14, "girdi", "Fed kararı dolar endeksi üzerinden TL'ye yansır", 0.4),
    ("yeni_sozlesme", "finansal_rapor", 120, "girdi", "Büyük sözleşme sonraki çeyrek gelirine yansır", 0.5),
    ("ihale", "yeni_sozlesme", 180, "ardil", "İhale kazanımı sözleşme imzasına dönüşür", 0.7),
    ("finansal_rapor", "temettu", 120, "girdi", "Yıllık kâr temettü kararının kaynağıdır", 0.5),
    ("ortaklik_yapisi", "birlesme_devralma", 180, "ardil", "Pay devri kontrol değişimine / çağrıya dönüşür", 0.6),
    ("ortaklik_yapisi", "ortaklik_yapisi", 240, "ardil", "Kontrol mücadelesinin adımları", 0.6),
    ("ortaklik_yapisi", "yonetim_degisikligi", 120, "tetikler", "Yeni ortak yönetimi değiştirir", 0.5),
    ("finansal_rapor", "halka_arz", 60, "girdi", "Güçlü bilanço ikincil halka arz zamanlamasını destekler", 0.4),
    ("kredi_derecelendirme_sirket", "halka_arz", 90, "girdi", "Not artışı arz talebini destekler", 0.4),
    ("bedelli_sermaye_artirimi", "finansal_rapor", 120, "girdi", "Bedelli fonu bilançoda borç azalışı olarak görünür", 0.4),
    ("tesvik_belgesi", "bedelli_sermaye_artirimi", 180, "tetikler", "Büyük yatırım finansmanı bedelliyle gelebilir", 0.4),
    ("dava_yaptirim", "finansal_rapor", 120, "girdi", "Karşılık/ceza bilançoya yansır", 0.4),
    ("jeopolitik_sok", "finansal_rapor", 120, "girdi", "Şok çeyrek sonuçlarına (havacılık, rafineri, savunma) yansır", 0.3),
]

# Makro olayın şirket olayına sektör üzerinden bağı: (makro_tur, etkilenen sektörler, iliski)
SEKTOR_KANALI: dict[str, tuple[set[str], str]] = {
    "tcmb_faiz_karari": ({"banka", "kamu_banka", "gyo", "insaat", "dayanikli_tuketim", "otomotiv", "perakende"}, "girdi"),
    "jeopolitik_sok": ({"savunma", "havacilik", "havalimani", "rafineri_petrokimya", "kimya", "banka", "kamu_banka"}, "tetikler"),
    "enerji_fiyat_duzenlemesi": ({"cimento", "demir_celik", "cam", "kimya", "enerji_uretim", "enerji_dagitim"}, "girdi"),
    "kredi_notu_ulke": ({"banka", "kamu_banka", "holding"}, "girdi"),
    "fed_karari": ({"banka", "kamu_banka", "holding"}, "girdi"),
    "maliye_butce_ovp": ({"perakende", "gida", "otomotiv", "icecek_tutun"}, "girdi"),
    "piyasa_guven_sorusturma": ({"araci_kurum", "holding", "banka"}, "zayiflatir"),
    "endeks_saglayici_karari": ({"banka", "kamu_banka", "holding", "havacilik"}, "tetikler"),
}


def _gun(a: str, b: str) -> int:
    return (date.fromisoformat(b) - date.fromisoformat(a)).days


def otomatik_baglar(olaylar: list[Olay]) -> list[Bag]:
    """Tüm olay çiftlerini kurallara göre tarar. O(n²) ama n birkaç bin olduğunda sorun değil."""
    baglar: dict[tuple[str, str, str], Bag] = {}
    kural_haritasi: dict[tuple[str, str], list[tuple[int, str, str, float]]] = {}
    for k, h, g, i, a, w in TUR_KURALLARI:
        kural_haritasi.setdefault((k, h), []).append((g, i, a, w))

    sirali = sorted(olaylar, key=lambda o: o.tarih)
    for a, b in product(sirali, sirali):
        if a.kod == b.kod:
            continue
        gun = _gun(a.tarih, b.tarih)
        if gun < 0:
            continue
        # 1) tür kuralları
        for g, iliski, aciklama, w in kural_haritasi.get((a.tur, b.tur), []):
            if gun <= g and (iliski != "ardil" or gun > 0 or a.kod < b.kod):
                if a.hisse and b.hisse and a.hisse != b.hisse:
                    continue  # şirket→şirket bağları aynı hissede kalır
                anahtar = (a.kod, b.kod, iliski)
                yakinlik = 1 - gun / (g + 1)
                baglar[anahtar] = Bag(a.kod, b.kod, iliski, aciklama, round(w * (0.5 + 0.5 * yakinlik), 2))  # type: ignore[arg-type]
        # 2) makro → şirket, sektör kanalı
        if a.kapsam in ("yerel_makro", "kuresel") and b.kapsam == "sirket" and b.sektor and a.tur in SEKTOR_KANALI:
            sektorler, iliski = SEKTOR_KANALI[a.tur]
            if b.sektor in sektorler and gun <= 30:
                anahtar = (a.kod, b.kod, iliski)
                if anahtar not in baglar:
                    baglar[anahtar] = Bag(a.kod, b.kod, iliski, f"{a.tur} → {b.sektor} sektörü kanalı", round(0.3 * (1 - gun / 31) + 0.1, 2))  # type: ignore[arg-type]
        # 3) aynı hisse, ardışık şirket olayları
        if a.hisse and a.hisse == b.hisse and 0 < gun <= 60 and (a.kod, b.kod, "ardil") not in baglar:
            baglar[(a.kod, b.kod, "ardil")] = Bag(a.kod, b.kod, "ardil", f"{a.hisse} için ardışık olay", round(0.3 * (1 - gun / 61) + 0.1, 2))
        # 4) ortak etiket, yakın tarih
        ortak = set(a.etiketler) & set(b.etiketler) - {"makro", "sirket", "kap"}
        if ortak and gun <= 21 and (a.kod, b.kod, "ayni_tema") not in baglar and (a.kod, b.kod, "ardil") not in baglar:
            baglar[(a.kod, b.kod, "ayni_tema")] = Bag(a.kod, b.kod, "ayni_tema", "Ortak etiket: " + ", ".join(sorted(ortak)), round(0.2 + 0.05 * len(ortak), 2))
    return list(baglar.values())


def elle_baglar(olaylar: list[Olay]) -> list[Bag]:
    kodlar = {o.kod for o in olaylar}
    sonuc: list[Bag] = []
    for o in olaylar:
        for b in o.bagli:
            hedef = b.get("kod")
            if not hedef or hedef not in kodlar:
                continue
            sonuc.append(Bag(o.kod, hedef, b.get("iliski", "tetikler"), b.get("aciklama", ""), float(b.get("agirlik", 0.9)), otomatik=False))  # type: ignore[arg-type]
    return sonuc

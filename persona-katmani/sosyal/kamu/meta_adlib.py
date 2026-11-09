"""Meta Reklam Kütüphanesi API (ads_archive) bağdaştırıcısı.

Sınır (ADR-010): ticari reklamlar API'de yalnız AB ülkeleri ve BK için döner; Türkiye'de yalnız siyasi/toplumsal konulu reklamlar.
Bu yüzden varsayılan ülkeler diaspora pazarlarıdır; Türkiye için `elle_ice` (analistin sitede gözlediği reklamlar) kullanılır.
Token: META_ADLIB_TOKEN (yoksa META_ACCESS_TOKEN); Meta kimlik doğrulaması tamamlanmış bir hesap gerekir.
"""
from __future__ import annotations

import csv
import hashlib
import json
import random
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

from sosyal.baglayici import BaglayiciHatasi, http_json, ortam
from sosyal.ortak import metin_ozeti, yas_bandi, yaratici_turu

GRAPH_SURUM = "v21.0"  # doğrulanmalı: güncel Graph API sürümü
UC = f"https://graph.facebook.com/{GRAPH_SURUM}/ads_archive"
VARSAYILAN_ULKELER = ("DE", "NL", "AT", "BE", "FR")
AB_BK = {"AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT",
         "RO", "SK", "SI", "ES", "SE", "GB"}
ALANLAR = ("id,page_id,page_name,ad_creation_time,ad_delivery_start_time,ad_delivery_stop_time,ad_creative_bodies,"
           "ad_creative_link_titles,publisher_platforms,languages,eu_total_reach,age_country_gender_reach_breakdown")


@dataclass
class RakipReklam:
    id: str
    kaynak: str
    reklamveren: str
    rol: str
    reklamveren_id: str | None = None
    ulkeler: list[str] = field(default_factory=list)
    platformlar: list[str] = field(default_factory=list)
    baslangic: str | None = None
    bitis: str | None = None
    aktif_gun: int | None = None
    yaratici_turu: str | None = None
    bicim: str | None = None
    metin_ozeti: str | None = None
    ab_erisim: int | None = None
    yas_erisim: dict[str, float] | None = None


def aktif_gun(baslangic: str | None, bitis: str | None, bugun: date | None = None) -> int | None:
    if not baslangic:
        return None
    b = datetime.fromisoformat(baslangic[:10]).date()
    s = datetime.fromisoformat(bitis[:10]).date() if bitis else (bugun or date.today())
    return max(1, (s - b).days + 1)


def yas_erisim_ozetle(kirilim: list | None) -> dict[str, float] | None:
    """age_country_gender_reach_breakdown → {yaş bandı: oran}. Cinsiyet ve ülke toplanır."""
    if not kirilim:
        return None
    toplam: dict[str, float] = {}
    for ulke in kirilim:
        for k in ulke.get("age_gender_breakdowns", []) or []:
            bant = yas_bandi(k.get("age_range"))
            if not bant:
                continue
            n = sum(float(k.get(c) or 0) for c in ("male", "female", "unknown"))
            toplam[bant] = toplam.get(bant, 0) + n
    s = sum(toplam.values())
    return {b: round(v / s, 4) for b, v in sorted(toplam.items())} if s > 0 else None


def normalize(ham: dict, rol: str, ulkeler: list[str], bugun: date | None = None) -> RakipReklam:
    metin = " ".join((ham.get("ad_creative_bodies") or []) + (ham.get("ad_creative_link_titles") or []))
    bas, bit = ham.get("ad_delivery_start_time"), ham.get("ad_delivery_stop_time")
    return RakipReklam(
        id=f"meta_adlib:{ham['id']}", kaynak="meta_adlib", reklamveren=ham.get("page_name") or "?", reklamveren_id=ham.get("page_id"),
        rol=rol, ulkeler=ulkeler, platformlar=[p.lower() for p in ham.get("publisher_platforms") or []],
        baslangic=bas[:10] if bas else None, bitis=bit[:10] if bit else None, aktif_gun=aktif_gun(bas, bit, bugun),
        yaratici_turu=yaratici_turu(metin) if metin else None, metin_ozeti=metin_ozeti(metin, 80),
        ab_erisim=int(ham["eu_total_reach"]) if ham.get("eu_total_reach") is not None else None,
        yas_erisim=yas_erisim_ozetle(ham.get("age_country_gender_reach_breakdown")),
    )


class ReklamKutuphanesi:
    def __init__(self, kuru: bool = False, tohum: int = 7):
        self.kuru, self.tohum = kuru, tohum

    def ara(self, *, rol: str, arama: str | None = None, sayfa_idleri: list[str] | None = None, ulkeler: tuple[str, ...] = VARSAYILAN_ULKELER,
            baslangic: str | None = None, azami: int = 500) -> tuple[list[RakipReklam], list[str]]:
        """Döner: (reklamlar, uyarılar)."""
        uyari: list[str] = []
        disarida = [u for u in ulkeler if u not in AB_BK]
        if disarida:
            uyari.append(f"{','.join(disarida)}: ticari reklamlar API'de dönmez, yalnız siyasi/toplumsal reklamlar (doğrulanmalı). Türkiye için 'adlib-elle' kullanın.")
        if self.kuru:
            return self._kuru(rol=rol, ad=arama or (sayfa_idleri or ["?"])[0], ulkeler=list(ulkeler)), uyari
        token = ortam("META_ADLIB_TOKEN", zorunlu=False) or ortam("META_ACCESS_TOKEN")
        params: dict = {"access_token": token, "ad_type": "ALL", "ad_active_status": "ALL", "ad_reached_countries": json.dumps(list(ulkeler)),
                        "fields": ALANLAR, "limit": 100}
        if arama:
            params["search_terms"] = arama
        if sayfa_idleri:
            params["search_page_ids"] = ",".join(sayfa_idleri)
        if baslangic:
            params["ad_delivery_date_min"] = baslangic
        sonuc: list[RakipReklam] = []
        url, p = UC, params
        while url and len(sonuc) < azami:
            yanit = http_json(url, params=p, sirlar=[token])
            for ham in yanit.get("data", []):
                sonuc.append(normalize(ham, rol, list(ulkeler)))
            url = (yanit.get("paging") or {}).get("next")
            p = None  # 'next' bağlantısı parametreleri (token dahil) taşır
        return sonuc[:azami], uyari

    def _kuru(self, *, rol: str, ad: str, ulkeler: list[str]) -> list[RakipReklam]:
        """Tohumlu sahte reklamlar: uzun yaşama yaratıcı türe bağlı (sosyal kanıt ve bilgi daha uzun), AB yaş erişimi."""
        rnd = random.Random(f"{self.tohum}:{ad}:{rol}")
        omur = {"indirim": 9, "kitlik": 6, "sosyal_kanit": 24, "bilgi": 20, "duygusal": 14}
        pay = {"indirim": 0.34, "kitlik": 0.14, "sosyal_kanit": 0.16, "bilgi": 0.16, "duygusal": 0.20}
        ornek = {"indirim": "Tüm ürünlerde %30 indirim, kampanya bu hafta", "kitlik": "Son 2 gün! Stoklar tükenmeden",
                 "sosyal_kanit": "Binlerce kişi bunu seçti, en çok satan ürünümüz", "bilgi": "Nasıl seçilir? Özellikleri karşılaştırın",
                 "duygusal": "Ailenle geçen her an için"}
        bugun = date(2026, 11, 9)
        cikti = []
        for i in range(rnd.randint(18, 40)):
            tur = rnd.choices(list(pay), weights=list(pay.values()))[0]
            bas = bugun - timedelta(days=rnd.randint(1, 120))
            gun = max(1, int(rnd.expovariate(1 / omur[tur])))
            bit = bas + timedelta(days=gun)
            bit_s = None if bit >= bugun else bit.isoformat()
            yas = {b: rnd.random() * w for b, w in zip(("18-24", "25-34", "35-44", "45-54", "55+"), (0.8, 1.4, 1.2, 0.8, 0.5))}
            s = sum(yas.values())
            cikti.append(RakipReklam(
                id=f"meta_adlib:kuru-{hashlib.sha1(f'{ad}{i}{self.tohum}'.encode()).hexdigest()[:12]}", kaynak="meta_adlib", reklamveren=ad,
                reklamveren_id=f"kuru-{abs(hash(ad)) % 10**8}", rol=rol, ulkeler=ulkeler, platformlar=rnd.sample(["facebook", "instagram"], rnd.randint(1, 2)),
                baslangic=bas.isoformat(), bitis=bit_s, aktif_gun=aktif_gun(bas.isoformat(), bit_s, bugun), yaratici_turu=tur,
                metin_ozeti=ornek[tur], ab_erisim=rnd.randint(2_000, 400_000), yas_erisim={b: round(v / s, 4) for b, v in yas.items()}))
        return cikti


ELLE_SUTUNLAR = ("reklamveren", "rol", "baslangic", "bitis", "metin", "platformlar", "ulke", "bicim")


def elle_ice(dosya: str) -> tuple[list[RakipReklam], int]:
    """Analistin Reklam Kütüphanesi sitesinde gözlediği reklamlar. Sütunlar: ELLE_SUTUNLAR (platformlar ';' ile). Döner: (kayıtlar, hatalı)."""
    kayit, hata = [], 0
    with open(dosya, encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            try:
                rv = (r.get("reklamveren") or "").strip()
                if not rv:
                    raise ValueError("reklamveren yok")
                rol = (r.get("rol") or "rakip").strip().lower()
                if rol not in ("marka", "rakip", "diger"):
                    raise ValueError("rol")
                bas, bit = (r.get("baslangic") or "").strip() or None, (r.get("bitis") or "").strip() or None
                metin = (r.get("metin") or "").strip()
                kimlik = hashlib.sha1(f"{rv}|{bas}|{metin}".encode()).hexdigest()[:16]
                kayit.append(RakipReklam(
                    id=f"elle:{kimlik}", kaynak="elle", reklamveren=rv, rol=rol, ulkeler=[(r.get("ulke") or "TR").strip().upper()],
                    platformlar=[p.strip().lower() for p in (r.get("platformlar") or "").split(";") if p.strip()], baslangic=bas, bitis=bit,
                    aktif_gun=aktif_gun(bas, bit), yaratici_turu=yaratici_turu(metin) if metin else None, bicim=(r.get("bicim") or "").strip() or None,
                    metin_ozeti=metin_ozeti(metin, 80)))
            except (ValueError, KeyError):
                hata += 1
    return kayit, hata


def kaydet(c, kiraci: str, reklamlar: list[RakipReklam]) -> int:
    for r in reklamlar:
        c.execute("""INSERT INTO rakip_reklam(id,kiraci_id,kaynak,reklamveren,reklamveren_id,rol,ulkeler,platformlar,baslangic,bitis,aktif_gun,
                     yaratici_turu,bicim,metin_ozeti,ab_erisim,yas_erisim) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                     ON CONFLICT(id) DO UPDATE SET bitis=excluded.bitis, aktif_gun=excluded.aktif_gun, ab_erisim=excluded.ab_erisim,
                     yas_erisim=excluded.yas_erisim, cekim=datetime('now')""",
                  (r.id, kiraci, r.kaynak, r.reklamveren, r.reklamveren_id, r.rol, json.dumps(r.ulkeler), json.dumps(r.platformlar), r.baslangic,
                   r.bitis, r.aktif_gun, r.yaratici_turu, r.bicim, r.metin_ozeti, r.ab_erisim,
                   json.dumps(r.yas_erisim) if r.yas_erisim else None))
    return len(reklamlar)


__all__ = ["ReklamKutuphanesi", "RakipReklam", "elle_ice", "kaydet", "normalize", "yas_erisim_ozetle", "aktif_gun", "BaglayiciHatasi"]

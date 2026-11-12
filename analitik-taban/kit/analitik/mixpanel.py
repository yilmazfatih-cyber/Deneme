"""Mixpanel REST istemcisi: Query API, Raw Export, Lexicon Schemas.

Belgeler (2026-11): docs.mixpanel.com/reference — özet ve kaynaklar docs/API-NOTLARI.md'de.
- Kimlik: service account (Basic kullanıcı:secret + project_id) önerilir; proje secret'ı 2027-03-03'te kalkıyor.
- Query API saatte 60 sorgu / aynı anda 5; Free planda yok. Export her planda; saatte 60, saniyede 3.
- /segmentation ve /funnels bakım modunda (2026-07); filtresiz kırılımlar için /events/properties kullanılır.
"""

from __future__ import annotations

import base64
import datetime as dt
import json
import os
import re
from typing import Any, Dict, Iterator, List, Optional, Sequence

from .ayarlar import Ayarlar
from .istemci import ApiHatasi, GercekTasima, HttpHatasi, Onbellek, temizle, url_kur

BOLGELER = {
    "us": ("https://mixpanel.com", "https://data.mixpanel.com"),
    "eu": ("https://eu.mixpanel.com", "https://data-eu.mixpanel.com"),
    "in": ("https://in.mixpanel.com", "https://data-in.mixpanel.com"),
}

Seri = Dict[str, float]  # tarih -> değer


# --- ifade yardımcıları ---------------------------------------------------------------------------


def ozellik_ifadesi(ad: str) -> str:
    """'$os' -> properties["$os"]; zaten ifade ise dokunmaz."""
    ad = ad.strip()
    if re.match(r"^(properties|user|event)\[", ad):
        return ad
    return f"properties[{json.dumps(ad, ensure_ascii=False)}]"


def _sayi_mi(metin: str) -> Optional[str]:
    if re.fullmatch(r"-?\d+", metin):
        return str(int(metin))
    if re.fullmatch(r"-?\d+\.\d+", metin):
        return str(float(metin))
    return None


_FILTRE = re.compile(r"^\s*(.+?)\s*(!=|>=|<=|=|>|<|~)\s*(.*?)\s*$")


def filtre_ifadesi(filtreler: Optional[Sequence[str]] = None, where: Optional[str] = None) -> Optional[str]:
    """--filtre 'k=v' listesini Mixpanel ifadesine çevirir ('and' ile birleşir).

    = != > < >= <= ve ~ (içerir). Sayı gibi görünen değerlerde = ve != hem sayı hem metin karşılaştırır
    (Mixpanel'de tür uyuşmazlığı eşitliği yanlış yapar).
    """
    parcalar: List[str] = []
    for ifade in filtreler or []:
        eslesme = _FILTRE.match(ifade)
        if not eslesme:
            raise ValueError(f"Filtre 'ozellik=deger' biçiminde olmalı: {ifade!r}")
        ad, op, deger = eslesme.groups()
        deger = deger.strip().strip("'\"")
        prop = ozellik_ifadesi(ad)
        metin = json.dumps(deger, ensure_ascii=False)
        sayi = _sayi_mi(deger)
        if op == "~":
            parcalar.append(f"{metin} in {prop}")
        elif deger.lower() in ("true", "false") and op in ("=", "!="):
            parcalar.append(f"{prop} {'==' if op == '=' else '!='} {deger.lower()}")
        elif sayi is not None and op == "=":
            parcalar.append(f"({prop} == {sayi} or {prop} == {metin})")
        elif sayi is not None and op == "!=":
            parcalar.append(f"({prop} != {sayi} and {prop} != {metin})")
        elif sayi is not None:
            parcalar.append(f"{prop} {op} {sayi}")
        else:
            parcalar.append(f"{prop} {'==' if op == '=' else op} {metin}")
    if where and where.strip():
        parcalar.append(f"({where.strip()})")
    return " and ".join(parcalar) or None


def degerler(yanit: Any) -> Dict[str, Seri]:
    """{data: {values: {ad: {tarih: n}}}} -> {ad: {tarih: n}} (eksik tarihler yoktur, 0 sayılır)."""
    if not isinstance(yanit, dict):
        return {}
    return {
        str(k): {str(t): float(v or 0) for t, v in (s or {}).items()}
        for k, s in ((yanit.get("data") or {}).get("values") or {}).items()
    }


# --- istemci --------------------------------------------------------------------------------------


class Mixpanel:
    def __init__(self, ayar: Ayarlar, tasima=None, taze: bool = False):
        self.ayar = ayar
        mp = ayar["mixpanel"]
        bolge = str(mp.get("bolge") or "us").lower()
        if bolge not in BOLGELER:
            raise ApiHatasi(f"Bilinmeyen Mixpanel bölgesi {bolge!r}; us, eu ya da in olmalı (yerel/ayarlar.json).")
        web, veri = BOLGELER[bolge]
        self.sorgu_taban = os.environ.get("MIXPANEL_QUERY_BASE") or f"{web}/api/query"
        self.uygulama_taban = os.environ.get("MIXPANEL_APP_BASE") or f"{web}/api/app"
        self.disa_aktar_taban = os.environ.get("MIXPANEL_EXPORT_BASE") or f"{veri}/api/2.0/export"
        if tasima is None:
            if ayar.demo:
                from .demo import DemoTasima

                tasima = DemoTasima()
            else:
                tasima = GercekTasima()
        self.tasima = tasima
        self.onbellek = Onbellek(None if (taze or ayar.demo) else ayar.dizin / "onbellek")
        self.proje_id = mp.get("proje_id") or ayar.gizli("MIXPANEL_PROJECT_ID")
        self.calisma_alani = mp.get("workspace_id")
        self.bugun = ayar.bugun()
        self.service_account = bool(ayar.gizli("MIXPANEL_SA_USER") and ayar.gizli("MIXPANEL_SA_SECRET"))
        self.sorgu_sayisi = 0

    # -- kimlik ve hata --

    def _basliklar(self) -> Dict[str, str]:
        if self.ayar.demo:
            return {}
        kullanici, sifre = self.ayar.gizli("MIXPANEL_SA_USER"), self.ayar.gizli("MIXPANEL_SA_SECRET")
        if not (kullanici and sifre):
            eski = self.ayar.gizli("MIXPANEL_API_SECRET")
            if not eski:
                raise ApiHatasi(
                    "Mixpanel kimlik bilgisi yok. yerel/.env içine MIXPANEL_SA_USER ve MIXPANEL_SA_SECRET yazın "
                    "(Organization Settings → Service Accounts). API erişimi yoksa ayarlar.json'da "
                    "mixpanel.kaynak'ı 'mcp' ya da 'csv' yapın."
                )
            kullanici, sifre = eski, ""
        if not self.proje_id and kullanici and sifre:
            raise ApiHatasi(
                "Mixpanel proje ID yok: yerel/ayarlar.json → mixpanel.proje_id (Project Settings → Overview)."
            )
        jeton = base64.b64encode(f"{kullanici}:{sifre}".encode()).decode()
        return {"Authorization": f"Basic {jeton}"}

    def _hata(self, hata: HttpHatasi) -> ApiHatasi:
        ayrinti = temizle(hata.govde, 220)
        try:
            govde = json.loads(hata.govde)
            if isinstance(govde, dict) and govde.get("error"):
                ayrinti = temizle(govde["error"], 220)
        except (ValueError, TypeError):
            pass
        k = hata.kod
        if k == 400:
            return ApiHatasi(
                f"Mixpanel isteği reddetti (400): {ayrinti}. Olay/özellik adını `mp.py ara` ile, filtreyi `--filtre` "
                "biçimiyle kontrol edin."
            )
        if k == 401:
            return ApiHatasi(
                "Mixpanel kimlik doğrulaması başarısız (401): yerel/.env'deki service account kullanıcı/secret'ı ve "
                "hesabın bu projeye ekli olduğunu kontrol edin."
            )
        if k in (402, 403):
            return ApiHatasi(
                f"Mixpanel erişimi yok ({k}): {ayrinti}. Olası nedenler: service account rolü yetersiz; Query API "
                "planınızda yok (Free planda kapalı); veri görünümü/sınıflandırma izni. Çözüm: rolü yükseltin ya da "
                "ayarlar.json'da mixpanel.kaynak'ı 'mcp' veya 'csv' yapın."
            )
        if k == 404:
            return ApiHatasi(f"Mixpanel kaynağı bulunamadı (404): ID'yi ve bölgeyi (us/eu/in) kontrol edin. {ayrinti}")
        if k == 429:
            return ApiHatasi(
                "Mixpanel sorgu limiti doldu (429; Query API saatte 60, aynı anda 5). Önbellekteki sorgular yine "
                "çalışır; biraz bekleyin ya da --boyutlar ile daha az kırılım isteyin."
            )
        if k >= 500:
            return ApiHatasi(f"Mixpanel geçici hata ({k}); birkaç dakika sonra tekrar deneyin.")
        return ApiHatasi(f"Mixpanel HTTP {k}: {ayrinti}")

    def _ttl(self, bit: Optional[dt.date]) -> float:
        if bit is None:
            return 6 * 3600
        return 7 * 86400 if bit <= self.bugun - dt.timedelta(days=3) else 3600

    def _sorgu(self, yol: str, params: Dict[str, Any], bit: Optional[dt.date] = None) -> Any:
        params = {**params, "project_id": self.proje_id, "workspace_id": self.calisma_alani}
        url = url_kur(self.sorgu_taban + yol, params)
        anahtar = Onbellek.anahtar("mixpanel", url)
        onbellekte = self.onbellek.al(anahtar, self._ttl(bit))
        if onbellekte is not None:
            return onbellekte
        try:
            self.sorgu_sayisi += 1
            yanit = self.tasima.json_iste("GET", url, self._basliklar())
        except HttpHatasi as hata:
            raise self._hata(hata) from None
        if isinstance(yanit, dict) and yanit.get("error") and not yanit.get("data") and not yanit.get("series"):
            raise ApiHatasi(f"Mixpanel hata döndü: {temizle(yanit['error'], 220)}")
        self.onbellek.koy(anahtar, yanit)
        return yanit

    # -- keşif --

    def olay_adlari(self, limit: int = 255) -> List[str]:
        """Son 31 günün en sık olayları."""
        yanit = self._sorgu("/events/names", {"type": "general", "limit": limit})
        return [str(o) for o in (yanit or [])]

    def ozellik_isimleri(self, olay: str, limit: int = 30) -> Dict[str, int]:
        yanit = self._sorgu("/events/properties/top", {"event": olay, "limit": limit})
        return {str(k): int((v or {}).get("count") or 0) for k, v in (yanit or {}).items()}

    def ozellik_degerleri(self, olay: str, ozellik: str, limit: int = 50) -> List[str]:
        yanit = self._sorgu("/events/properties/values", {"event": olay, "name": ozellik, "limit": limit})
        return [str(v) for v in (yanit or [])]

    def semalar(self) -> List[Dict]:
        """Lexicon şemaları (yalnız service account). Açıklama ve özellik listesi için."""
        url = f"{self.uygulama_taban}/projects/{self.proje_id}/schemas"
        anahtar = Onbellek.anahtar("mixpanel", url)
        onbellekte = self.onbellek.al(anahtar, 6 * 3600)
        if onbellekte is not None:
            return onbellekte
        try:
            yanit = self.tasima.json_iste("GET", url, self._basliklar())
        except HttpHatasi as hata:
            raise self._hata(hata) from None
        sonuc = (yanit or {}).get("results") or []
        self.onbellek.koy(anahtar, sonuc)
        return sonuc

    # -- sayılar --

    def olay_serisi(self, olaylar: Sequence[str], tip: str, birim: str, bas: dt.date, bit: dt.date) -> Dict[str, Seri]:
        """Birden çok olayın zaman serisi tek sorguda (/events). birim: day | week | month."""
        yanit = self._sorgu(
            "/events",
            {
                "event": list(olaylar),
                "type": tip,
                "unit": birim,
                "from_date": bas.isoformat(),
                "to_date": bit.isoformat(),
            },
            bit,
        )
        sonuc = degerler(yanit)
        for olay in olaylar:
            sonuc.setdefault(olay, {})
        return sonuc

    def toplam_serisi(
        self, olay: str, tip: str, bas: dt.date, bit: dt.date, birim: str = "day", where: Optional[str] = None
    ) -> Seri:
        if not where:
            return self.olay_serisi([olay], tip, birim, bas, bit)[olay]
        yanit = self._sorgu(
            "/segmentation",
            {
                "event": olay,
                "type": tip,
                "unit": birim,
                "from_date": bas.isoformat(),
                "to_date": bit.isoformat(),
                "where": where,
            },
            bit,
        )
        return next(iter(degerler(yanit).values()), {})

    def kirilim(
        self,
        olay: str,
        ozellik: str,
        bas: dt.date,
        bit: dt.date,
        tip: str = "general",
        birim: str = "day",
        where: Optional[str] = None,
        limit: int = 60,
    ) -> Dict[str, Seri]:
        """Bir olayın bir özelliğe göre segment serileri: {değer: {tarih: n}}.

        Filtre yoksa /events/properties (bakım modunda değil), varsa /segmentation kullanılır.
        """
        ortak = {
            "event": olay,
            "type": tip,
            "unit": birim,
            "from_date": bas.isoformat(),
            "to_date": bit.isoformat(),
            "limit": limit,
        }
        if where:
            yanit = self._sorgu("/segmentation", {**ortak, "on": ozellik_ifadesi(ozellik), "where": where}, bit)
        else:
            yanit = self._sorgu("/events/properties", {**ortak, "name": ozellik}, bit)
        return degerler(yanit)

    # -- raporlar --

    def huni_listesi(self) -> List[Dict]:
        return list(self._sorgu("/funnels/list", {}) or [])

    def huni(
        self,
        huni_id: int,
        bas: dt.date,
        bit: dt.date,
        on: Optional[str] = None,
        where: Optional[str] = None,
        limit: int = 20,
    ) -> Any:
        """Kayıtlı huni; tüm aralık tek kova olsun diye interval = gün sayısı (tekil sayımlar doğru kalır)."""
        params: Dict[str, Any] = {
            "funnel_id": huni_id,
            "from_date": bas.isoformat(),
            "to_date": bit.isoformat(),
            "interval": (bit - bas).days + 1,
        }
        if on:
            params.update(on=ozellik_ifadesi(on), limit=limit)
        if where:
            params["where"] = where
        return self._sorgu("/funnels", params, bit)

    def tutunma(
        self,
        dogum: str,
        donus: Optional[str],
        bas: dt.date,
        bit: dt.date,
        birim: str = "day",
        sayi: int = 8,
        on: Optional[str] = None,
        where: Optional[str] = None,
        limit: int = 10,
    ) -> Any:
        params: Dict[str, Any] = {
            "from_date": bas.isoformat(),
            "to_date": bit.isoformat(),
            "retention_type": "birth",
            "born_event": dogum,
            "event": donus,
            "unit": birim,
            "interval_count": sayi,
            "born_where": where,
        }
        if on:
            params.update(on=ozellik_ifadesi(on), limit=limit)
        return self._sorgu("/retention", params, bit)

    def kayitli_rapor(self, bookmark_id: int) -> Any:
        return self._sorgu("/insights", {"bookmark_id": bookmark_id})

    # -- ham olaylar --

    def olay_akisi(
        self,
        olaylar: Sequence[str],
        bas: dt.date,
        bit: dt.date,
        where: Optional[str] = None,
        azami: int = 2_000_000,
    ) -> Iterator[Dict]:
        """Raw Export: yalnız istenen olaylar, satır satır; $insert_id ile tekilleştirilir.

        Not: 2023 sonrası projelerde from/to tarihleri UTC'dir; çağıran taraf aralığı bir gün geniş ister.
        """
        params = {
            "from_date": bas.isoformat(),
            "to_date": bit.isoformat(),
            "event": list(olaylar),
            "where": where,
            "project_id": self.proje_id,
        }
        url = url_kur(self.disa_aktar_taban, params)
        goruldu = set()
        sayi = 0
        try:
            for satir in self.tasima.satir_iste(url, self._basliklar()):
                try:
                    olay = json.loads(satir)
                except json.JSONDecodeError:
                    continue
                if "event" not in olay:
                    if olay.get("error"):
                        raise ApiHatasi(f"Mixpanel export hatası: {temizle(olay['error'], 200)}")
                    continue
                p = olay.get("properties") or {}
                if p.get("$insert_id"):
                    imza = hash((olay["event"], p.get("distinct_id"), p.get("time"), p["$insert_id"]))
                    if imza in goruldu:
                        continue
                    goruldu.add(imza)
                sayi += 1
                if sayi > azami:
                    raise ApiHatasi(
                        f"{azami:,} olaydan fazla geldi; aralığı daraltın ya da kayıtlı huni kullanın (mp.py huni)."
                    )
                yield olay
        except HttpHatasi as hata:
            raise self._hata(hata) from None

    # -- bağlantı denetimi --

    def kontrol(self) -> List[str]:
        satirlar = []
        olaylar = self.olay_adlari(limit=5)
        satirlar.append(f"Query API: çalışıyor ({len(olaylar)} örnek olay: {', '.join(olaylar[:3])})")
        if self.service_account and not self.ayar.demo:
            try:
                semalar = self.semalar()
                satirlar.append(f"Lexicon: {len(semalar)} şema okunabildi")
            except ApiHatasi as hata:
                satirlar.append(f"Lexicon: okunamadı ({hata}) — sözlük yine Query API'den kurulur")
        elif not self.ayar.demo:
            satirlar.append("Uyarı: proje secret'ı ile bağlanıldı; 2027-03-03'te kalkıyor, service account'a geçin.")
        return satirlar

#!/usr/bin/env python3
"""Canlı Çeviri: App Store Connect'te haftalık üyelik aboneliğini (kullanım kotalı) kurar.

Ne yapar (sırayla; her adımda önce var mı diye bakar, varsa DEĞİŞTİRMEZ):
  1. Abonelik grubu ve grubun tr / en-US adları
  2. Abonelik (ürün kimliği, 1 hafta, düzey 1, aile paylaşımı kapalı) ve tr / en-US adı + açıklaması
  3. Kullanılabilirlik: tüm bölgeler, yeni bölgeler de dahil
  4. Fiyat: ABD'de 4,99 USD; öteki bölgelerde Apple'ın eş değer (equalization) fiyat noktaları

Güvenlik kuralları:
  - `--uygula` verilmezse KURU ÇALIŞMA: yalnız GET yapılır; neyin var olduğu ve neyin oluşturulacağı yazılır.
  - Hiçbir şey silinmez; betikte DELETE çağrısı yoktur. Var olan kayıtlar değiştirilmez. Tek istisna: içinde hiç
    bölge olmayan (boş) kullanılabilirlik kaydı doldurulur, çünkü o hâliyle fiyat atanamaz.
  - Anahtar ve belirteç hiçbir çıktıya yazılmaz.
  - "Ücretli Uygulamalar" anlaşması, banka ve vergi API ile yapılamaz; betik yalnız özetinde hatırlatır.

Kullanım (anahtar ortam değişkenlerinden okunur: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8):
    python3 canli-ceviri/scripts/abonelik-kur.py              # kuru çalışma
    python3 canli-ceviri/scripts/abonelik-kur.py --uygula     # gerçekten oluşturur
    python3 canli-ceviri/scripts/abonelik-kur.py --uygula --eski-yol
        # Yerelleştirme ve kullanılabilirlik için Apple'ın kullanımdan kaldırdığı (ama hâlâ açık tuttuğu) eski uç
        # noktaları kullanır. Yalnız sürümlü yeni yol beklenmedik biçimde çalışmazsa denenir.

Gerekenler: pip install 'PyJWT[crypto]' requests   (sabit sürümler iş akışı dosyasında)

Uç noktalar Apple'ın belgelerinden alındı (App Store Connect API 4.4.1):
  https://developer.apple.com/documentation/appstoreconnectapi
Yerelleştirmeler 4.4.1'den beri bir "sürüm"e (subscriptionGroupVersions / subscriptionVersions) bağlanır;
kullanılabilirlik 4.4'ten beri plan türüyle (subscriptionPlanAvailabilities, UPFRONT = peşin) tanımlanır.
"""

import argparse
import os
import sys
import time
from decimal import Decimal, InvalidOperation
from urllib.parse import unquote, urlsplit

try:
    import jwt
    import requests
except ImportError:  # pragma: no cover - yalnız eksik kurulumda
    print("Eksik paket. Kurmak için: pip install 'PyJWT[crypto]' requests")
    sys.exit(2)

API_KOKU = "https://api.appstoreconnect.apple.com"

# --- Kurulacak ürün (uygulama StoreKit 2 ile tam bu kimliği arar: Sabitler.swift → abonelikUrunu) ---
PAKET_KIMLIGI = "com.yilmazfatih.canliceviri"
GRUP_ADI = "Canlı Çeviri Üyelik"
GRUP_YERELLESTIRMELERI = {
    "tr": {"name": "Canlı Çeviri Üyelik"},
    "en-US": {"name": "Live Translate Membership"},
}
URUN_KIMLIGI = "canliceviri.haftalik"
ABONELIK_ADI = "Haftalık üyelik"
ABONELIK_SURESI = "ONE_WEEK"
GRUP_DUZEYI = 1
AILE_PAYLASIMI = False
ABONELIK_YERELLESTIRMELERI = {
    "tr": {"name": "Haftalık üyelik", "description": "Haftalık çeviri kotası"},
    "en-US": {"name": "Weekly membership", "description": "Weekly translation quota"},
}
TABAN_BOLGE = "USA"
TABAN_FIYAT = Decimal("4.99")
PLAN_TURU = "UPFRONT"  # peşin ödeme; MONTHLY yalnız 12 ay taahhütlü aylık ödeme planıdır

# Apple'ın yardım sayfasındaki sınırlar (görünen ad 2–30, açıklama en çok 45, başvuru adı en çok 64 karakter).
AD_EN_AZ, AD_EN_COK, ACIKLAMA_EN_COK, BASVURU_ADI_EN_COK = 2, 30, 45, 64

# --- İstemci ayarları ---
BELIRTEC_OMRU = 15 * 60  # saniye; Apple en çok 20 dakikaya izin verir
BELIRTEC_YENILE = 10 * 60  # bu kadar eskiyen belirteç yenilenir
ZAMAN_ASIMI = (10, 60)
SAYFA_BOYU = 200
SAYFA_SINIRI = 500
OKUMA_DENEMESI = 3
HIZ_SINIRI_DENEMESI = 6
HIZ_SINIRI_BEKLEME = (30, 60, 120, 120, 120)
FIYAT_HATA_SINIRI = 5

VARDI = "vardı"
OLUSTURULDU = "oluşturuldu"
OLUSTURULACAK = "oluşturulacak (kuru çalışma)"
BASARISIZ = "başarısız"
ATLANDI = "atlandı (dokunulmadı)"
YAPILMADI = "yapılmadı"

ADIMLAR = (
    ("grup", "Abonelik grubu"),
    ("grup_yerel", "Grup yerelleştirmeleri"),
    ("abonelik", "Abonelik"),
    ("abonelik_yerel", "Abonelik yerelleştirmeleri"),
    ("kullanilabilirlik", "Kullanılabilirlik"),
    ("fiyat", "Fiyat"),
)

ANLASMA_HATIRLATMASI = (
    "Uygulamada fiyatın görünmesi için App Store Connect → İş bölümünde Ücretli Uygulamalar anlaşması, "
    "banka ve vergi 'Etkin' olmalı."
)

# Yerelleştirme uç noktaları: yeni (sürümlü) yol ve kullanımdan kaldırılmış eski yol.
GRUP_YEREL_UCLARI = {
    "ust_turu": "subscriptionGroups",
    "surum_listesi": "/v1/subscriptionGroups/{id}/versions",
    "surum_olustur": "/v1/subscriptionGroupVersions",
    "surum_turu": "subscriptionGroupVersions",
    "surum_iliskisi": "subscriptionGroup",
    "yerel_listesi": "/v1/subscriptionGroupVersions/{id}/localizations",
    "yerel_olustur": "/v2/subscriptionGroupLocalizations",
    "yerel_turu": "subscriptionGroupLocalizations",
    "eski_listesi": "/v1/subscriptionGroups/{id}/subscriptionGroupLocalizations",
    "eski_olustur": "/v1/subscriptionGroupLocalizations",
    "eski_iliskisi": "subscriptionGroup",
}
ABONELIK_YEREL_UCLARI = {
    "ust_turu": "subscriptions",
    "surum_listesi": "/v1/subscriptions/{id}/versions",
    "surum_olustur": "/v1/subscriptionVersions",
    "surum_turu": "subscriptionVersions",
    "surum_iliskisi": "subscription",
    "yerel_listesi": "/v1/subscriptionVersions/{id}/localizations",
    "yerel_olustur": "/v2/subscriptionLocalizations",
    "yerel_turu": "subscriptionLocalizations",
    "eski_listesi": "/v1/subscriptions/{id}/subscriptionLocalizations",
    "eski_olustur": "/v1/subscriptionLocalizations",
    "eski_iliskisi": "subscription",
}
TASLAK = "PREPARE_FOR_SUBMISSION"

_GIZLI = []  # çıktıda görünürse *** ile değiştirilecek değerler (anahtar, kimlikler, belirteç)


def gizle(metin):
    metin = str(metin)
    for deger in _GIZLI:
        if deger:
            metin = metin.replace(deger, "***")
    return metin


def gizli_ekle(*degerler):
    for deger in degerler:
        if deger and len(deger) >= 6 and deger not in _GIZLI:
            _GIZLI.append(deger)


def yaz(metin=""):
    print(gizle(metin), flush=True)


def eylem_iletisi(tur, baslik, ileti):
    """GitHub Actions'ta ::error / ::warning / ::notice satırı; başka yerde düz satır yazar."""
    ileti = gizle(ileti)
    if os.environ.get("GITHUB_ACTIONS") == "true":
        veri = ileti.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
        ozellik = baslik.replace("%", "%25").replace(":", "%3A").replace(",", "%2C")
        print(f"::{tur} title={ozellik}::{veri}", flush=True)
    else:
        etiket = {"error": "HATA", "warning": "UYARI", "notice": "BİLGİ"}[tur]
        print(f"{etiket} — {baslik}: {ileti}", flush=True)


class Durdur(Exception):
    """Betiğin Türkçe bir iletiyle durması gereken durum."""


class ApiHatasi(Exception):
    """Apple'dan 2xx dışı yanıt."""

    def __init__(self, durum, yontem, yol, hatalar, ham):
        super().__init__(f"HTTP {durum} {yontem} {yol}")
        self.durum = durum
        self.yontem = yontem
        self.yol = yol
        self.hatalar = hatalar
        self.ham = ham

    def kodlar(self):
        return [str(h.get("code", "")) for h in self.hatalar]

    def yazdir(self):
        yaz(f"  Apple yanıtı: HTTP {self.durum} — {self.yontem} {self.yol}")
        if not self.hatalar:
            yaz(f"    (hata ayrıntısı yok) {self.ham[:300]}")
        for hata in self.hatalar:
            yaz(f"    code:   {hata.get('code')}")
            yaz(f"    title:  {hata.get('title')}")
            yaz(f"    detail: {hata.get('detail')}")
            kaynak = hata.get("source")
            if isinstance(kaynak, dict) and kaynak:
                yaz(f"    source: {kaynak.get('pointer') or kaynak.get('parameter')}")

    def aciklama(self):
        if self.durum == 401:
            return (
                "Apple kimliği doğrulamadı. ASC_KEY_ID, ASC_ISSUER_ID ve ASC_KEY_P8 aynı anahtara ait olmalı; "
                "anahtar iptal edilmişse yenisini üretip gizli değerleri güncelleyin."
            )
        if self.durum == 403:
            return (
                "Apple bu işleme izin vermedi. Anahtarın rolü Admin ya da App Manager olmalı; hesapta onay "
                "bekleyen bir anlaşma (App Store Connect → İş) varsa önce o kabul edilmeli."
            )
        if self.durum == 404:
            return "Apple bu kaynağı bulamadı (uç nokta bu hesapta açık olmayabilir ya da kayıt silinmiş)."
        if self.durum == 409:
            return (
                "Apple bu kaydı şu hâliyle kabul etmedi (çakışma): aynı ad ya da ürün kimliği daha önce "
                "kullanılmış, kayıt şu an düzenlenemez durumda ya da bir alan kurallara uymuyor olabilir. "
                "Yukarıdaki 'code' ve 'detail' satırları nedeni söyler."
            )
        if self.durum == 422:
            return "Apple gönderilen veriyi geçersiz buldu. Yukarıdaki 'detail' satırı hangi alan olduğunu söyler."
        if self.durum == 429:
            return "Apple'ın saatlik istek sınırı doldu. Bir saat sonra yeniden başlatın; betik kaldığı yerden sürer."
        if self.durum >= 500:
            return (
                "Apple tarafında geçici bir hata var. Birkaç dakika sonra yeniden başlatın; betik var olanı atlayıp "
                "kaldığı yerden sürer."
            )
        return "Apple isteği reddetti. Yukarıdaki 'code' ve 'detail' satırları nedeni söyler."


class Istemci:
    """App Store Connect API istemcisi: ES256 belirteç, 429'da bekleme, sayfalama, kuru çalışma kilidi."""

    def __init__(self, oturum, anahtar_kimligi, veren_kimligi, ozel_anahtar, uygula, kok=API_KOKU, bekle=time.sleep):
        self.oturum = oturum
        self.uygula = uygula
        self.kok = kok.rstrip("/")
        self.bekle = bekle
        self._anahtar_kimligi = anahtar_kimligi
        self._veren_kimligi = veren_kimligi
        self._ozel_anahtar = ozel_anahtar
        self._belirtec_degeri = None
        self._belirtec_zamani = 0
        self.okuma_sayisi = 0
        self.yazma_sayisi = 0

    def _belirtec(self):
        simdi = int(time.time())
        if self._belirtec_degeri is None or simdi - self._belirtec_zamani >= BELIRTEC_YENILE:
            try:
                belirtec = jwt.encode(
                    {
                        "iss": self._veren_kimligi,
                        "iat": simdi,
                        "exp": simdi + BELIRTEC_OMRU,
                        "aud": "appstoreconnect-v1",
                    },
                    self._ozel_anahtar,
                    algorithm="ES256",
                    headers={"kid": self._anahtar_kimligi, "typ": "JWT"},
                )
            except Exception as hata:  # noqa: BLE001 - ileti anahtarı içermesin diye yalnız tür adı yazılır
                raise Durdur(
                    f"ASC_KEY_P8 ile belirteç imzalanamadı ({type(hata).__name__}). Gizli değer, .p8 dosyasının "
                    "'-----BEGIN PRIVATE KEY-----' satırından '-----END PRIVATE KEY-----' satırına dek tamamı olmalı."
                ) from None
            if isinstance(belirtec, bytes):
                belirtec = belirtec.decode("ascii")
            gizli_ekle(belirtec)
            self._belirtec_degeri = belirtec
            self._belirtec_zamani = simdi
        return self._belirtec_degeri

    def _yol_ozeti(self, url):
        parca = urlsplit(url)
        return parca.path + (f"?{unquote(parca.query)}" if parca.query else "")

    def istek(self, yontem, yol, params=None, govde=None, yok_sayilan=()):
        """Tek istek. 2xx'te JSON'u (gövde yoksa None), `yok_sayilan` durum kodlarında None döndürür."""
        if yontem not in ("GET", "POST", "PATCH"):
            raise Durdur(f"İç hata: izin verilmeyen yöntem ({yontem}). İstek gönderilmedi.")
        url = yol if "://" in yol else self.kok + yol
        if not (url == self.kok or url.startswith(self.kok + "/")):
            raise Durdur("Apple'ın yanıtındaki bağlantı beklenmeyen bir sunucuyu gösteriyor; istek gönderilmedi.")
        ozet = self._yol_ozeti(url)
        if yontem != "GET" and not self.uygula:
            raise Durdur(f"İç hata: kuru çalışmada yazma isteği denendi ({yontem} {ozet}). İstek gönderilmedi.")
        deneme = 0
        while True:
            deneme += 1
            basliklar = {"Authorization": f"Bearer {self._belirtec()}", "Accept": "application/json"}
            if yontem == "GET":
                self.okuma_sayisi += 1
            else:
                self.yazma_sayisi += 1
            try:
                yanit = self.oturum.request(
                    yontem,
                    url,
                    params=params,
                    json=govde,
                    headers=basliklar,
                    timeout=ZAMAN_ASIMI,
                    allow_redirects=False,  # belirteç başka adrese taşınmasın
                )
            except requests.RequestException as hata:
                if yontem == "GET" and deneme < OKUMA_DENEMESI:
                    yaz(f"  Ağ hatası ({type(hata).__name__}); {5 * deneme} sn sonra yeniden denenecek.")
                    self.bekle(5 * deneme)
                    continue
                raise Durdur(
                    f"Apple'a ulaşılamadı ({type(hata).__name__}): {yontem} {ozet}. İşi yeniden başlatın; "
                    "betik var olanı atlayıp kaldığı yerden sürer."
                ) from None
            durum = yanit.status_code
            if durum == 429 and deneme < HIZ_SINIRI_DENEMESI:
                sure = HIZ_SINIRI_BEKLEME[min(deneme, len(HIZ_SINIRI_BEKLEME)) - 1]
                try:
                    sure = max(1, min(300, int(yanit.headers.get("Retry-After", ""))))
                except (TypeError, ValueError):
                    pass
                yaz(f"  Apple hız sınırı (429): {sure} sn beklenip yeniden denenecek ({deneme}. deneme).")
                self.bekle(sure)
                continue
            if durum >= 500 and yontem == "GET" and deneme < OKUMA_DENEMESI:
                yaz(f"  Apple geçici hata verdi (HTTP {durum}); {5 * deneme} sn sonra yeniden denenecek.")
                self.bekle(5 * deneme)
                continue
            if 200 <= durum < 300:
                if durum == 204 or not yanit.content:
                    return None
                try:
                    return yanit.json()
                except ValueError:
                    raise Durdur(f"Apple'ın yanıtı JSON değil: {yontem} {ozet} (HTTP {durum}).") from None
            if durum in yok_sayilan:
                return None
            hatalar = []
            try:
                belge = yanit.json()
                if isinstance(belge, dict) and isinstance(belge.get("errors"), list):
                    hatalar = [h for h in belge["errors"] if isinstance(h, dict)]
            except ValueError:
                pass
            raise ApiHatasi(durum, yontem, ozet, hatalar, yanit.text or "")

    def sayfala(self, yol, params=None):
        """Bir listeyi `links.next` bitene dek izler; (data, included) döndürür."""
        ogeler, ekler, gorulen = [], [], set()
        url, parametreler = yol, dict(params or {})
        parametreler.setdefault("limit", SAYFA_BOYU)
        for _ in range(SAYFA_SINIRI):
            belge = self.istek("GET", url, params=parametreler) or {}
            veri = belge.get("data")
            if not isinstance(veri, list):
                raise Durdur(f"Apple'ın yanıtı beklenen biçimde değil (liste yok): GET {self._yol_ozeti(url)}")
            ogeler.extend(veri)
            ekler.extend(belge.get("included") or [])
            sonraki = (belge.get("links") or {}).get("next")
            if not sonraki:
                return ogeler, ekler
            if sonraki in gorulen:
                raise Durdur("Apple'ın sayfalama bağlantısı kendini yineliyor; güvenli tarafta kalıp duruldu.")
            gorulen.add(sonraki)
            url, parametreler = sonraki, None  # sonraki bağlantı kendi sorgusunu (cursor, limit) taşır
        raise Durdur("Beklenenden çok sayfa geldi; güvenli tarafta kalıp duruldu.")


# --- İstek gövdeleri (Apple'ın *CreateRequest şemalarına göre) ---


def baglanti(tur, kimlik):
    return {"data": {"type": tur, "id": kimlik}}


def grup_govdesi(uygulama_kimligi):
    return {
        "data": {
            "type": "subscriptionGroups",
            "attributes": {"referenceName": GRUP_ADI},
            "relationships": {"app": baglanti("apps", uygulama_kimligi)},
        }
    }


def abonelik_govdesi(grup_kimligi):
    return {
        "data": {
            "type": "subscriptions",
            "attributes": {
                "name": ABONELIK_ADI,
                "productId": URUN_KIMLIGI,
                "subscriptionPeriod": ABONELIK_SURESI,
                "groupLevel": GRUP_DUZEYI,
                "familySharable": AILE_PAYLASIMI,
            },
            "relationships": {"group": baglanti("subscriptionGroups", grup_kimligi)},
        }
    }


def surum_govdesi(uclar, ust_kimligi):
    return {
        "data": {
            "type": uclar["surum_turu"],
            "relationships": {uclar["surum_iliskisi"]: baglanti(uclar["ust_turu"], ust_kimligi)},
        }
    }


def yerel_govdesi(uclar, dil, alanlar, surum_kimligi=None, ust_kimligi=None):
    """Yeni yolda sürüme (`version`), eski yolda doğrudan üst kayda bağlanır."""
    if surum_kimligi is not None:
        iliskiler = {"version": baglanti(uclar["surum_turu"], surum_kimligi)}
    else:
        iliskiler = {uclar["eski_iliskisi"]: baglanti(uclar["ust_turu"], ust_kimligi)}
    return {
        "data": {
            "type": uclar["yerel_turu"],
            "attributes": {"locale": dil, **alanlar},
            "relationships": iliskiler,
        }
    }


def bolge_listesi(bolgeler):
    return {"data": [{"type": "territories", "id": kod} for kod in bolgeler]}


def plan_kullanilabilirlik_govdesi(abonelik_kimligi, bolgeler):
    return {
        "data": {
            "type": "subscriptionPlanAvailabilities",
            "attributes": {"planType": PLAN_TURU, "availableInNewTerritories": True},
            "relationships": {
                "subscription": baglanti("subscriptions", abonelik_kimligi),
                "availableTerritories": bolge_listesi(bolgeler),
            },
        }
    }


def plan_doldurma_govdesi(kayit_kimligi, bolgeler):
    return {
        "data": {
            "type": "subscriptionPlanAvailabilities",
            "id": kayit_kimligi,
            "attributes": {"availableInNewTerritories": True},
            "relationships": {"availableTerritories": bolge_listesi(bolgeler)},
        }
    }


def eski_kullanilabilirlik_govdesi(abonelik_kimligi, bolgeler):
    return {
        "data": {
            "type": "subscriptionAvailabilities",
            "attributes": {"availableInNewTerritories": True},
            "relationships": {
                "subscription": baglanti("subscriptions", abonelik_kimligi),
                "availableTerritories": bolge_listesi(bolgeler),
            },
        }
    }


def fiyat_govdesi(abonelik_kimligi, fiyat_noktasi_kimligi, plan_turu_yaz=True):
    ozellikler = {"startDate": None}  # null = hemen geçerli
    if plan_turu_yaz:
        ozellikler["planType"] = PLAN_TURU
    return {
        "data": {
            "type": "subscriptionPrices",
            "attributes": ozellikler,
            "relationships": {
                "subscription": baglanti("subscriptions", abonelik_kimligi),
                "subscriptionPricePoint": baglanti("subscriptionPricePoints", fiyat_noktasi_kimligi),
            },
        }
    }


def ozellik(kayit, ad, varsayilan=None):
    return (kayit.get("attributes") or {}).get(ad, varsayilan)


def iliski_kimligi(kayit, ad):
    veri = ((kayit.get("relationships") or {}).get(ad) or {}).get("data")
    return veri.get("id") if isinstance(veri, dict) else None


def ondalik(metin):
    try:
        return Decimal(str(metin))
    except (InvalidOperation, ValueError):
        return None


def metinleri_denetle():
    """Gönderilecek metinlerin Apple sınırlarına uyduğunu istek atmadan önce doğrular."""
    sorunlar = []
    if len(GRUP_ADI) > BASVURU_ADI_EN_COK or len(ABONELIK_ADI) > BASVURU_ADI_EN_COK:
        sorunlar.append(f"başvuru adı {BASVURU_ADI_EN_COK} karakteri aşıyor")
    for kume in (GRUP_YERELLESTIRMELERI, ABONELIK_YERELLESTIRMELERI):
        for dil, alanlar in kume.items():
            ad = alanlar["name"]
            if not AD_EN_AZ <= len(ad) <= AD_EN_COK:
                sorunlar.append(f"{dil} adı {AD_EN_AZ}–{AD_EN_COK} karakter olmalı: '{ad}' ({len(ad)})")
            aciklama = alanlar.get("description", "")
            if len(aciklama) > ACIKLAMA_EN_COK:
                sorunlar.append(f"{dil} açıklaması {ACIKLAMA_EN_COK} karakteri aşıyor: '{aciklama}'")
    if sorunlar:
        raise Durdur("Betikteki metinler Apple sınırlarına uymuyor: " + "; ".join(sorunlar))


class Kurulum:
    def __init__(self, istemci, uygula, eski_yol=False):
        self.ist = istemci
        self.uygula = uygula
        self.eski_yol = eski_yol
        self.rapor = {anahtar: [YAPILMADI, ""] for anahtar, _ in ADIMLAR}
        self.uyarilar = []
        self.etkin_adim = None
        self.abonelik_durumu = None
        self.abonelik_kimligi = None
        self.son_hata = None

    # --- yardımcılar ---

    def adim(self, anahtar):
        self.etkin_adim = anahtar
        yaz("")
        yaz(f"== {dict(ADIMLAR)[anahtar]} ==")

    def sonuc(self, anahtar, durum, ayrinti=""):
        self.rapor[anahtar] = [durum, ayrinti]
        yaz(f"  → {durum}" + (f": {ayrinti}" if ayrinti else ""))

    def uyar(self, ileti):
        self.uyarilar.append(ileti)
        yaz(f"  UYARI: {ileti}")

    # --- adımlar ---

    def uygulamayi_bul(self):
        yaz(f"Uygulama aranıyor: {PAKET_KIMLIGI}")
        uygulamalar, _ = self.ist.sayfala("/v1/apps", {"filter[bundleId]": PAKET_KIMLIGI, "fields[apps]": "bundleId"})
        eslesen = [u for u in uygulamalar if ozellik(u, "bundleId") == PAKET_KIMLIGI]
        if not eslesen:
            raise Durdur(
                f"App Store Connect'te paket kimliği '{PAKET_KIMLIGI}' olan uygulama bulunamadı. Uygulama kaydı "
                "bu hesapta mı ve API anahtarı aynı takıma mı ait, denetleyin."
            )
        yaz(f"  Uygulama bulundu (Apple kimliği {eslesen[0]['id']}).")
        return eslesen[0]["id"]

    def grubu_ve_aboneligi_bul(self, uygulama_kimligi):
        """Uygulamanın tüm gruplarına bakar; ürün kimliği başka bir grupta olsa da bulunur."""
        gruplar, _ = self.ist.sayfala(f"/v1/apps/{uygulama_kimligi}/subscriptionGroups")
        hedef_grup, abonelik, abonelik_grubu = None, None, None
        for grup in gruplar:
            if ozellik(grup, "referenceName") == GRUP_ADI and hedef_grup is None:
                hedef_grup = grup
            abonelikler, _ = self.ist.sayfala(
                f"/v1/subscriptionGroups/{grup['id']}/subscriptions", {"filter[productId]": URUN_KIMLIGI}
            )
            for aday in abonelikler:
                if ozellik(aday, "productId") == URUN_KIMLIGI and abonelik is None:
                    abonelik, abonelik_grubu = aday, grup
        return hedef_grup, abonelik, abonelik_grubu

    def grubu_kur(self, uygulama_kimligi, hedef_grup, abonelik_grubu):
        self.adim("grup")
        if abonelik_grubu is not None and (hedef_grup is None or abonelik_grubu["id"] != hedef_grup["id"]):
            ad = ozellik(abonelik_grubu, "referenceName")
            self.uyar(
                f"'{URUN_KIMLIGI}' ürünü '{ad}' adlı başka bir grupta duruyor; o grup kullanılacak, yeni grup "
                "açılmayacak (uygulama yalnız ürün kimliğine bakar)."
            )
            self.sonuc("grup", VARDI, f"'{ad}' (beklenen ad: '{GRUP_ADI}')")
            return abonelik_grubu["id"]
        if hedef_grup is not None:
            self.sonuc("grup", VARDI, f"'{GRUP_ADI}'")
            return hedef_grup["id"]
        if not self.uygula:
            self.sonuc("grup", OLUSTURULACAK, f"'{GRUP_ADI}'")
            return None
        yanit = self.ist.istek("POST", "/v1/subscriptionGroups", govde=grup_govdesi(uygulama_kimligi))
        self.sonuc("grup", OLUSTURULDU, f"'{GRUP_ADI}'")
        return yanit["data"]["id"]

    def yerellestirmeleri_kur(self, anahtar, uclar, ust_kimligi, istenen):
        self.adim(anahtar)
        diller = ", ".join(istenen)
        if ust_kimligi is None:
            self.sonuc(anahtar, OLUSTURULACAK, diller)
            return
        surum_kimligi, surum_gerek, surum_durumu = None, False, None
        if self.eski_yol:
            mevcutlar, _ = self.ist.sayfala(uclar["eski_listesi"].format(id=ust_kimligi))
        else:
            surumler, _ = self.ist.sayfala(uclar["surum_listesi"].format(id=ust_kimligi))
            mevcutlar = []
            if surumler:
                taslaklar = [s for s in surumler if ozellik(s, "state") == TASLAK]
                guncel = max(taslaklar or surumler, key=lambda s: ozellik(s, "version") or 0)
                surum_durumu = ozellik(guncel, "state")
                if taslaklar:
                    surum_kimligi = guncel["id"]
                mevcutlar, _ = self.ist.sayfala(uclar["yerel_listesi"].format(id=guncel["id"]))
            else:
                surum_gerek = True
        var_olan = {ozellik(y, "locale"): y for y in mevcutlar}
        parcalar, eksikler = [], []
        for dil, alanlar in istenen.items():
            if dil not in var_olan:
                eksikler.append(dil)
                continue
            parcalar.append(f"{dil}: {VARDI}")
            farkli = [ad for ad, deger in alanlar.items() if ozellik(var_olan[dil], ad) != deger]
            if farkli:
                self.uyar(
                    f"{dict(ADIMLAR)[anahtar]} — {dil}: var olan {', '.join(farkli)} farklı "
                    f"(var olan ad: '{ozellik(var_olan[dil], 'name')}'); değiştirilmedi."
                )
        if not eksikler:
            self.sonuc(anahtar, VARDI, "; ".join(parcalar))
            return
        if not self.eski_yol and surum_kimligi is None and not surum_gerek:
            # Sürüm var ama taslak değil (incelemede ya da onaylı). Yeni sürüm açmak yeni bir inceleme turu demek;
            # var olanı değiştirmemek için dokunulmaz.
            self.uyar(
                f"{dict(ADIMLAR)[anahtar]}: eksik dil var ({', '.join(eksikler)}) ama düzenlenebilir taslak sürüm "
                f"yok (güncel sürümün durumu: {surum_durumu}). Eksik dil App Store Connect'ten elle eklenmeli."
            )
            parcalar.extend(f"{dil}: eksik" for dil in eksikler)
            self.sonuc(anahtar, ATLANDI, "; ".join(parcalar))
            return
        if not self.uygula:
            parcalar.extend(f"{dil}: oluşturulacak" for dil in eksikler)
            ek = " (önce taslak sürüm açılacak)" if surum_gerek else ""
            self.sonuc(anahtar, OLUSTURULACAK, "; ".join(parcalar) + ek)
            return
        if surum_gerek:
            yanit = self.ist.istek("POST", uclar["surum_olustur"], govde=surum_govdesi(uclar, ust_kimligi))
            surum_kimligi = yanit["data"]["id"]
            yaz("  Taslak sürüm açıldı.")
        for dil in eksikler:
            if self.eski_yol:
                govde = yerel_govdesi(uclar, dil, istenen[dil], ust_kimligi=ust_kimligi)
                self.ist.istek("POST", uclar["eski_olustur"], govde=govde)
            else:
                govde = yerel_govdesi(uclar, dil, istenen[dil], surum_kimligi=surum_kimligi)
                self.ist.istek("POST", uclar["yerel_olustur"], govde=govde)
            parcalar.append(f"{dil}: {OLUSTURULDU}")
            # Yarıda kesilirse özet doğru kalsın diye her dilden sonra güncellenir.
            self.rapor[anahtar] = [OLUSTURULDU, "; ".join(parcalar)]
        self.sonuc(anahtar, OLUSTURULDU, "; ".join(parcalar))

    def aboneligi_kur(self, grup_kimligi, abonelik):
        self.adim("abonelik")
        tanim = f"'{URUN_KIMLIGI}' (1 hafta)"
        if abonelik is not None:
            self.abonelik_durumu = ozellik(abonelik, "state")
            beklenen = {
                "name": ABONELIK_ADI,
                "subscriptionPeriod": ABONELIK_SURESI,
                "groupLevel": GRUP_DUZEYI,
                "familySharable": AILE_PAYLASIMI,
            }
            for ad, deger in beklenen.items():
                if ozellik(abonelik, ad) != deger:
                    var_olan = ozellik(abonelik, ad)
                    self.uyar(f"Abonelik — {ad}: var olan '{var_olan}', beklenen '{deger}'; değiştirilmedi.")
            self.sonuc("abonelik", VARDI, tanim)
            return abonelik["id"]
        if not self.uygula or grup_kimligi is None:
            self.sonuc("abonelik", OLUSTURULACAK, tanim)
            return None
        yanit = self.ist.istek("POST", "/v1/subscriptions", govde=abonelik_govdesi(grup_kimligi))
        self.abonelik_durumu = ozellik(yanit["data"], "state")
        self.sonuc("abonelik", OLUSTURULDU, tanim)
        return yanit["data"]["id"]

    def tum_bolgeler(self):
        bolgeler, _ = self.ist.sayfala("/v1/territories")
        kodlar = sorted(b["id"] for b in bolgeler)
        if TABAN_BOLGE not in kodlar:
            raise Durdur(f"Apple'ın bölge listesinde {TABAN_BOLGE} yok; liste beklenen biçimde değil, duruldu.")
        return kodlar

    def kullanilabilirligi_kur(self, abonelik_kimligi, bolgeler):
        """Fiyat atanabilecek bölge kümesini döndürür (kayıt yoksa ve kuru çalışmaysa tüm bölgeler)."""
        self.adim("kullanilabilirlik")
        hepsi = f"tüm bölgeler ({len(bolgeler)}), yeni bölgeler dahil"
        if abonelik_kimligi is None:
            self.sonuc("kullanilabilirlik", OLUSTURULACAK, hepsi)
            return set(bolgeler)
        kayit = None
        if self.eski_yol:
            belge = self.ist.istek(
                "GET", f"/v1/subscriptions/{abonelik_kimligi}/subscriptionAvailability", yok_sayilan=(404,)
            )
            kayit = (belge or {}).get("data")
            liste_yolu = "/v1/subscriptionAvailabilities/{id}/availableTerritories"
        else:
            kayitlar, _ = self.ist.sayfala(f"/v1/subscriptions/{abonelik_kimligi}/planAvailabilities")
            for aday in kayitlar:
                if ozellik(aday, "planType") == PLAN_TURU and kayit is None:
                    kayit = aday
            liste_yolu = "/v1/subscriptionPlanAvailabilities/{id}/availableTerritories"
        acik = set()
        if kayit is not None:
            acik_bolgeler, _ = self.ist.sayfala(liste_yolu.format(id=kayit["id"]))
            acik = {b["id"] for b in acik_bolgeler}
        if kayit is not None and acik:
            yeni_acik = ozellik(kayit, "availableInNewTerritories") is True
            yeni_bolgeler = "evet" if yeni_acik else "hayır"
            eksik = sorted(set(bolgeler) - acik)
            if eksik or not yeni_acik:
                self.uyar(
                    f"Kullanılabilirlik var ama beklenenden farklı: {len(acik)}/{len(bolgeler)} bölge açık, "
                    f"yeni bölgelerde kullanılabilir: {yeni_bolgeler}; değiştirilmedi."
                )
            ayrinti = f"{len(acik)}/{len(bolgeler)} bölge, yeni bölgelerde kullanılabilir: {yeni_bolgeler}"
            self.sonuc("kullanilabilirlik", VARDI, ayrinti)
            return acik
        bos_kayit = kayit is not None
        if not self.uygula:
            ek = " (var olan boş kayıt doldurulacak)" if bos_kayit else ""
            self.sonuc("kullanilabilirlik", OLUSTURULACAK, hepsi + ek)
            return set(bolgeler)
        if self.eski_yol:
            govde = eski_kullanilabilirlik_govdesi(abonelik_kimligi, bolgeler)
            self.ist.istek("POST", "/v1/subscriptionAvailabilities", govde=govde)
        elif bos_kayit:
            govde = plan_doldurma_govdesi(kayit["id"], bolgeler)
            self.ist.istek("PATCH", f"/v1/subscriptionPlanAvailabilities/{kayit['id']}", govde=govde)
        else:
            govde = plan_kullanilabilirlik_govdesi(abonelik_kimligi, bolgeler)
            self.ist.istek("POST", "/v1/subscriptionPlanAvailabilities", govde=govde)
        self.sonuc("kullanilabilirlik", OLUSTURULDU, hepsi + (" (boş kayıt dolduruldu)" if bos_kayit else ""))
        return set(bolgeler)

    def fiyati_kur(self, abonelik_kimligi, bolgeler, acik_bolgeler):
        self.adim("fiyat")
        hedef_tanim = f"ABD {TABAN_FIYAT} USD + öteki bölgelerde Apple'ın eş değer fiyatı"
        if abonelik_kimligi is None:
            self.sonuc("fiyat", OLUSTURULACAK, f"{len(bolgeler)} bölge: {hedef_tanim}")
            return
        fiyatlar, ekler = self.ist.sayfala(
            f"/v1/subscriptions/{abonelik_kimligi}/prices", {"include": "territory,subscriptionPricePoint"}
        )
        nokta_fiyati = {
            e["id"]: ozellik(e, "customerPrice") for e in ekler if e.get("type") == "subscriptionPricePoints"
        }
        fiyatli = {}
        # Bir bölgede hem yürürlükteki (startDate boş) hem ileri tarihli fiyat olabilir; raporda yürürlükteki
        # gösterilsin diye o öne alınır.
        for fiyat in sorted(fiyatlar, key=lambda f: ozellik(f, "startDate") is not None):
            bolge = iliski_kimligi(fiyat, "territory")
            if bolge is None:
                raise Durdur(
                    "Var olan fiyatların hangi bölgeye ait olduğu Apple'ın yanıtından okunamadı. Var olan fiyatın "
                    "üstüne yazmamak için hiçbir fiyat atanmadı."
                )
            fiyatli.setdefault(bolge, nokta_fiyati.get(iliski_kimligi(fiyat, "subscriptionPricePoint")))
        taban_notu = ""
        if TABAN_BOLGE in fiyatli:
            taban_notu = f"; ABD fiyatı: {fiyatli[TABAN_BOLGE]} USD"
            if ondalik(fiyatli[TABAN_BOLGE]) != TABAN_FIYAT:
                self.uyar(
                    f"ABD'de var olan fiyat {fiyatli[TABAN_BOLGE]} USD; beklenen {TABAN_FIYAT} USD. Var olan fiyata "
                    "dokunulmadı; değiştirmek için App Store Connect'i kullanın."
                )
        hedefler = [TABAN_BOLGE] if TABAN_BOLGE in acik_bolgeler else []
        hedefler += sorted(b for b in acik_bolgeler if b != TABAN_BOLGE)
        eksikler = [b for b in hedefler if b not in fiyatli]
        var_sayisi = len(hedefler) - len(eksikler)
        if not eksikler:
            self.sonuc("fiyat", VARDI, f"{var_sayisi} bölgede fiyat var{taban_notu}")
            return

        noktalar, _ = self.ist.sayfala(
            f"/v1/subscriptions/{abonelik_kimligi}/pricePoints",
            {"filter[territory]": TABAN_BOLGE, "include": "territory"},
        )
        taban_noktasi = None
        for nokta in noktalar:
            bolge = iliski_kimligi(nokta, "territory")
            if bolge in (None, TABAN_BOLGE) and ondalik(ozellik(nokta, "customerPrice")) == TABAN_FIYAT:
                taban_noktasi = nokta["id"]
                break
        if taban_noktasi is None:
            raise Durdur(
                f"ABD için müşteri fiyatı {TABAN_FIYAT} USD olan fiyat noktası bulunamadı ({len(noktalar)} nokta "
                "incelendi). Hiçbir fiyat atanmadı."
            )
        es_degerler, _ = self.ist.sayfala(
            f"/v1/subscriptionPricePoints/{taban_noktasi}/equalizations", {"include": "territory"}
        )
        bolge_noktasi = {TABAN_BOLGE: taban_noktasi}
        for nokta in es_degerler:
            bolge = iliski_kimligi(nokta, "territory")
            if bolge is not None:
                bolge_noktasi.setdefault(bolge, nokta["id"])
        noktasiz = [b for b in eksikler if b not in bolge_noktasi]
        atanacak = [b for b in eksikler if b in bolge_noktasi]
        if noktasiz:
            self.uyar(
                f"{len(noktasiz)} bölge için Apple eş değer fiyat noktası vermedi; bu bölgelere fiyat atanamadı: "
                + ", ".join(noktasiz[:20])
                + (" …" if len(noktasiz) > 20 else "")
            )
        if not self.uygula:
            ayrinti = f"{len(atanacak)} bölgeye atanacak ({hedef_tanim}); {var_sayisi} bölgede zaten var{taban_notu}"
            if noktasiz:
                ayrinti += f"; {len(noktasiz)} bölge için fiyat noktası yok"
            self.sonuc("fiyat", OLUSTURULACAK, ayrinti)
            return
        tamam, basarisiz, denenmeyen = 0, [], []
        for sira, bolge in enumerate(atanacak):
            govde = fiyat_govdesi(abonelik_kimligi, bolge_noktasi[bolge], plan_turu_yaz=not self.eski_yol)
            try:
                self.ist.istek("POST", "/v1/subscriptionPrices", govde=govde)
                tamam += 1
                if tamam % 25 == 0:
                    yaz(f"  … {tamam}/{len(atanacak)} bölgeye fiyat atandı")
            except ApiHatasi as hata:
                yaz(f"  {bolge} bölgesine fiyat atanamadı.")
                hata.yazdir()
                basarisiz.append(bolge)
                self.son_hata = hata
                if bolge == TABAN_BOLGE or len(basarisiz) >= FIYAT_HATA_SINIRI or hata.durum in (401, 403, 429):
                    denenmeyen = atanacak[sira + 1 :]
                    break
            ayrinti = f"{tamam} bölgede oluşturuldu; {var_sayisi} bölgede zaten vardı{taban_notu}"
            self.rapor["fiyat"] = [OLUSTURULDU, ayrinti]
        ayrinti = f"{tamam} bölgede oluşturuldu; {var_sayisi} bölgede zaten vardı{taban_notu}"
        if basarisiz or noktasiz:
            if basarisiz:
                ayrinti += f"; {len(basarisiz)} bölgede başarısız ({', '.join(basarisiz)})"
            if denenmeyen:
                ayrinti += f"; {len(denenmeyen)} bölge denenmedi"
            if noktasiz:
                ayrinti += f"; {len(noktasiz)} bölge için fiyat noktası yok"
            self.sonuc("fiyat", BASARISIZ, ayrinti)
            return
        self.sonuc("fiyat", OLUSTURULDU, ayrinti)

    def durumu_oku(self, abonelik_kimligi):
        if abonelik_kimligi is None:
            return
        belge = self.ist.istek("GET", f"/v1/subscriptions/{abonelik_kimligi}")
        self.abonelik_durumu = ozellik((belge or {}).get("data") or {}, "state", self.abonelik_durumu)

    def calistir(self):
        metinleri_denetle()
        uygulama_kimligi = self.uygulamayi_bul()
        self.etkin_adim = "grup"
        hedef_grup, abonelik, abonelik_grubu = self.grubu_ve_aboneligi_bul(uygulama_kimligi)
        grup_kimligi = self.grubu_kur(uygulama_kimligi, hedef_grup, abonelik_grubu)
        self.yerellestirmeleri_kur("grup_yerel", GRUP_YEREL_UCLARI, grup_kimligi, GRUP_YERELLESTIRMELERI)
        self.abonelik_kimligi = self.aboneligi_kur(grup_kimligi, abonelik)
        self.yerellestirmeleri_kur(
            "abonelik_yerel", ABONELIK_YEREL_UCLARI, self.abonelik_kimligi, ABONELIK_YERELLESTIRMELERI
        )
        self.etkin_adim = "kullanilabilirlik"
        bolgeler = self.tum_bolgeler()
        acik_bolgeler = self.kullanilabilirligi_kur(self.abonelik_kimligi, bolgeler)
        self.fiyati_kur(self.abonelik_kimligi, bolgeler, acik_bolgeler)
        self.etkin_adim = None
        try:
            self.durumu_oku(self.abonelik_kimligi)
        except ApiHatasi as hata:  # kurulum bitti; yalnız son durum okunamadı
            hata.yazdir()
            self.uyar("Aboneliğin son durumu (state) okunamadı; yukarıdaki adımların sonucu geçerlidir.")


DURUM_ACIKLAMALARI = {
    "MISSING_METADATA": (
        "eksik bilgi var. Yukarıdaki adımlar tamamsa eksik olan inceleme ekran görüntüsü olabilir "
        "(App Store Connect → Abonelikler → bu abonelik → Review Information); bu betik onu yüklemez"
    ),
    "READY_TO_SUBMIT": "incelemeye gönderilmeye hazır",
    "WAITING_FOR_REVIEW": "inceleme bekliyor",
    "IN_REVIEW": "incelemede",
    "DEVELOPER_ACTION_NEEDED": "sizden işlem bekleniyor (App Store Connect'teki iletiye bakın)",
    "PENDING_BINARY_APPROVAL": "uygulama sürümünün onayını bekliyor",
    "APPROVED": "onaylı",
    "DEVELOPER_REMOVED_FROM_SALE": "satıştan kaldırılmış",
    "REMOVED_FROM_SALE": "Apple tarafından satıştan kaldırılmış",
    "REJECTED": "reddedilmiş",
}


def ozet_yaz(kurulum, uygula, hata_iletisi):
    durum = kurulum.abonelik_durumu
    if durum:
        durum_satiri = f"`{durum}` — {DURUM_ACIKLAMALARI.get(durum, 'Apple bu değeri belgelemiyor')}"
    else:
        durum_satiri = "— (abonelik henüz yok)"
    satirlar = [
        "## Canlı Çeviri → abonelik kurulumu",
        "",
        f"- Kip: {'UYGULA' if uygula else 'KURU ÇALIŞMA (hiçbir şey değiştirilmedi)'}",
        f"- Ürün kimliği: `{URUN_KIMLIGI}`",
        "",
        "| Adım | Sonuç | Ayrıntı |",
        "| --- | --- | --- |",
    ]
    for anahtar, ad in ADIMLAR:
        sonuc, ayrinti = kurulum.rapor[anahtar]
        satirlar.append(f"| {ad} | {sonuc} | {ayrinti.replace('|', '/')} |")
    satirlar += ["", f"- Aboneliğin durumu (`state`): {durum_satiri}"]
    satirlar.append(f"- Apple'a gönderilen istek: {kurulum.ist.okuma_sayisi} okuma, {kurulum.ist.yazma_sayisi} yazma")
    if kurulum.uyarilar:
        satirlar += ["", "### Uyarılar", ""] + [f"- {u}" for u in kurulum.uyarilar]
    if hata_iletisi:
        satirlar += ["", "### Hata", "", hata_iletisi]
    satirlar += ["", "### Sizin yapacaklarınız", "", f"- {ANLASMA_HATIRLATMASI}"]
    satirlar.append(
        "- İlk abonelik, uygulamanın yeni bir sürümüyle birlikte App Store Connect'ten incelemeye gönderilir; "
        "bu betik incelemeye göndermez."
    )
    if not uygula and not hata_iletisi:
        satirlar.append(
            "- Bu bir kuru çalışmaydı. Gerçekten oluşturmak için işi 'uygula' kutusunu işaretleyip yeniden başlatın."
        )
    metin = gizle("\n".join(satirlar))
    yaz("")
    yaz(metin)
    ozet_dosyasi = os.environ.get("GITHUB_STEP_SUMMARY")
    if ozet_dosyasi:
        try:
            with open(ozet_dosyasi, "a", encoding="utf-8") as dosya:
                dosya.write(metin + "\n")
        except OSError as hata:
            yaz(f"(İş özeti dosyasına yazılamadı: {type(hata).__name__})")


def anahtari_oku(ortam):
    eksik = [ad for ad in ("ASC_KEY_ID", "ASC_ISSUER_ID", "ASC_KEY_P8") if not (ortam.get(ad) or "").strip()]
    if eksik:
        raise Durdur("Şu ortam değişkenleri boş: " + ", ".join(eksik) + ". Değerler GitHub gizli değerlerinden gelir.")
    anahtar_kimligi = ortam["ASC_KEY_ID"].strip()
    veren_kimligi = ortam["ASC_ISSUER_ID"].strip()
    ozel_anahtar = ortam["ASC_KEY_P8"].strip().replace("\r\n", "\n").replace("\r", "\n")
    if "\n" not in ozel_anahtar and "\\n" in ozel_anahtar:
        ozel_anahtar = ozel_anahtar.replace("\\n", "\n")  # tek satır olarak yapıştırılmış anahtar
    if "BEGIN PRIVATE KEY" not in ozel_anahtar:
        raise Durdur("ASC_KEY_P8 bir .p8 dosyasının içeriğine benzemiyor ('-----BEGIN PRIVATE KEY-----' satırı yok).")
    gizli_ekle(anahtar_kimligi, veren_kimligi, ozel_anahtar)
    gizli_ekle(*[satir for satir in ozel_anahtar.split("\n") if len(satir) >= 16 and "PRIVATE KEY" not in satir])
    return anahtar_kimligi, veren_kimligi, ozel_anahtar + "\n"


def ana(argv=None, oturum=None, ortam=None, kok=API_KOKU, bekle=time.sleep):
    ayristirici = argparse.ArgumentParser(description="App Store Connect'te haftalık aboneliği kurar (idempotent).")
    ayristirici.add_argument("--uygula", action="store_true", help="Gerçekten oluştur (verilmezse kuru çalışma)")
    ayristirici.add_argument(
        "--eski-yol",
        action="store_true",
        help="Yerelleştirme ve kullanılabilirlik için kullanımdan kaldırılmış eski uç noktaları kullan",
    )
    secenekler = ayristirici.parse_args(argv)
    ortam = os.environ if ortam is None else ortam

    yaz("KİP: " + ("UYGULA — eksik olanlar oluşturulacak." if secenekler.uygula else "KURU ÇALIŞMA — yalnız okunur."))
    if secenekler.eski_yol:
        yaz("Eski uç noktalar kullanılıyor (--eski-yol).")
    try:
        anahtar_kimligi, veren_kimligi, ozel_anahtar = anahtari_oku(ortam)
    except Durdur as hata:
        eylem_iletisi("error", "Anahtar okunamadı", str(hata))
        return 2
    if oturum is None:
        oturum = requests.Session()
        oturum.headers["User-Agent"] = "abonelik-kur/1"
    istemci = Istemci(oturum, anahtar_kimligi, veren_kimligi, ozel_anahtar, secenekler.uygula, kok=kok, bekle=bekle)
    kurulum = Kurulum(istemci, secenekler.uygula, eski_yol=secenekler.eski_yol)

    hata_iletisi = None
    try:
        kurulum.calistir()
    except ApiHatasi as hata:
        adim = dict(ADIMLAR).get(kurulum.etkin_adim, "Hazırlık")
        yaz("")
        hata.yazdir()
        if kurulum.etkin_adim:
            kurulum.rapor[kurulum.etkin_adim][0] = BASARISIZ
        kodlar = ", ".join(k for k in hata.kodlar() if k) or "kod yok"
        hata_iletisi = f"{adim} adımında Apple HTTP {hata.durum} döndürdü ({kodlar}). {hata.aciklama()}"
        yeni_yol_adimi = kurulum.etkin_adim in ("grup_yerel", "abonelik_yerel", "kullanilabilirlik")
        if yeni_yol_adimi and not secenekler.eski_yol and hata.durum in (404, 405):
            hata_iletisi += (
                " Bu adım Apple'ın yeni (sürümlü) uç noktalarını kullanıyor; işi 'eski_yol' kutusunu da "
                "işaretleyip yeniden başlatmak sorunu aşabilir."
            )
        if not secenekler.uygula:
            hata_iletisi += " Kuru çalışmaydı; hiçbir şey değiştirilmedi."
        eylem_iletisi("error", f"{adim} başarısız", hata_iletisi)
    except Durdur as hata:
        adim = dict(ADIMLAR).get(kurulum.etkin_adim, "Hazırlık")
        if kurulum.etkin_adim:
            kurulum.rapor[kurulum.etkin_adim][0] = BASARISIZ
        hata_iletisi = f"{adim}: {hata}"
        eylem_iletisi("error", f"{adim} başarısız", str(hata))
    except Exception as hata:  # noqa: BLE001 - yığın izi yerine kısa, gizlenmiş ileti
        adim = dict(ADIMLAR).get(kurulum.etkin_adim, "Hazırlık")
        if kurulum.etkin_adim:
            kurulum.rapor[kurulum.etkin_adim][0] = BASARISIZ
        hata_iletisi = (
            f"{adim}: beklenmeyen hata ({type(hata).__name__}: {gizle(hata)}). Apple'ın yanıtı beklenen biçimde "
            "olmayabilir."
        )
        eylem_iletisi("error", f"{adim} başarısız", hata_iletisi)

    if hata_iletisi is None and kurulum.rapor["fiyat"][0] == BASARISIZ:
        hata_iletisi = "Bazı bölgelere fiyat atanamadı. " + (
            kurulum.son_hata.aciklama() if kurulum.son_hata else "Ayrıntı yukarıdaki uyarılarda."
        )
        eylem_iletisi("error", "Fiyat başarısız", hata_iletisi)
    for uyari in kurulum.uyarilar:
        eylem_iletisi("warning", "Abonelik kurulumu", uyari)
    ozet_yaz(kurulum, secenekler.uygula, hata_iletisi)
    return 1 if hata_iletisi else 0


if __name__ == "__main__":
    sys.exit(ana())

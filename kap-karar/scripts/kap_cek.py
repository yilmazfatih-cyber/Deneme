"""KAP bildirimlerini çeker ve kap-karar veri biçimine dönüştürür.

KAP sitesine erişimi olan bir bilgisayarda çalıştırın (bulut ortamı engelliyse sizin bilgisayarınız):

    cd kap-karar
    python3 scripts/kap_cek.py --baslangic 2025-11-01 --bitis 2026-11-08          # ham + dönüştürülmüş JSON yazar
    python3 -m kap_karar ekle --json veri/kap_bildirimleri_2025-11-01_2026-11-08.json

Ham yanıtlar veri/ham/ altına kaydedilir; KAP'ın API'si değişirse --ham-dosya ile elle indirilen JSON da verilebilir.
İki uç nokta denenir (KAP zaman zaman değiştirir):
  1. POST https://www.kap.org.tr/tr/api/memberDisclosureQuery   (tarih aralığı sorgusu)
  2. GET  https://www.kap.org.tr/tr/api/disclosures              (son bildirimler)
Hiçbiri çalışmazsa tarayıcıda https://www.kap.org.tr/tr/bildirim-sorgu sayfasından aralığı seçip
"Dışa aktar" ile aldığınız JSON/CSV'yi --ham-dosya ile verin.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
import time
import urllib.error
import urllib.request
from datetime import date, timedelta
from pathlib import Path

KOK = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(KOK))

from kap_karar.agaclar import AGACLAR  # noqa: E402
from kap_karar.sinif import parametre_cikar, tur_bul  # noqa: E402

BASLIKLAR = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) kap-karar/0.1",
    "Accept": "application/json, text/plain, */*",
    "Content-Type": "application/json",
    "Origin": "https://www.kap.org.tr",
    "Referer": "https://www.kap.org.tr/tr/bildirim-sorgu",
}

# KAP "disclosureClass" / konu → ağaç türü. Eşleşmeyen başlıklar metinden sınıflandırılır.
KONU_ESLEME = {
    "kar payı": "temettu", "kâr payı": "temettu", "temettü": "temettu",
    "bedelsiz": "bedelsiz_sermaye_artirimi", "bedelli": "bedelli_sermaye_artirimi", "sermaye artırımı": "bedelli_sermaye_artirimi",
    "geri alı": "pay_geri_alim", "birleşme": "birlesme_devralma", "pay alım teklifi": "birlesme_devralma", "çağrı": "birlesme_devralma",
    "yeni iş ilişkisi": "yeni_sozlesme", "sözleşme": "yeni_sozlesme", "ihale": "ihale",
    "finansal rapor": "finansal_rapor", "faaliyet raporu": "finansal_rapor",
    "kredi derecelendirme": "kredi_derecelendirme_sirket", "pay alım satım": "ortaklik_yapisi", "ortaklık yapısı": "ortaklik_yapisi",
    "borçlanma arac": "borclanma_araci", "kira sertifikası": "borclanma_araci", "izahname": "halka_arz", "halka arz": "halka_arz",
    "yönetim kurulu": "yonetim_degisikligi", "üst düzey yönetici": "yonetim_degisikligi", "genel müdür": "yonetim_degisikligi",
    "dava": "dava_yaptirim", "idari para cezası": "dava_yaptirim", "maddi duran varlık": "varlik_islemi", "finansal duran varlık": "varlik_islemi",
    "bağlı ortaklık": "varlik_islemi", "iştirak": "varlik_islemi", "teşvik": "tesvik_belgesi",
}
ATLA = ("genel kurul", "bağımsız denetim", "sorumluluk beyanı", "kurumsal yönetim", "sürdürülebilirlik", "ücretlendirme", "bilgilendirme politikası")


def _istek(url: str, veri: dict | None = None) -> object:
    gov = json.dumps(veri).encode() if veri is not None else None
    istek = urllib.request.Request(url, data=gov, headers=BASLIKLAR, method="POST" if veri is not None else "GET")
    with urllib.request.urlopen(istek, timeout=60) as y:
        return json.loads(y.read().decode("utf-8"))


def kap_sorgu(baslangic: date, bitis: date) -> list[dict]:
    """Tarih aralığını 7 günlük dilimlerle sorgular (KAP tek sorguda sınırlı kayıt döndürür)."""
    sonuc: list[dict] = []
    gun = baslangic
    while gun <= bitis:
        son = min(gun + timedelta(days=6), bitis)
        govde = {
            "fromDate": gun.isoformat(), "toDate": son.isoformat(), "year": "", "prd": "", "term": "", "ruleType": "",
            "bdkReview": "", "disclosureClass": "", "index": "", "market": "", "isLate": "", "subjectList": [],
            "mkkMemberOidList": [], "inactiveMkkMemberOidList": [], "bdkMemberOidList": [], "mainSector": "",
            "sector": "", "subSector": "", "memberType": "IGS", "fromSrc": "N", "srcCategory": "", "discIndex": [],
        }
        for deneme in range(3):
            try:
                veri = _istek("https://www.kap.org.tr/tr/api/memberDisclosureQuery", govde)
                break
            except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError) as e:
                print(f"  {gun}–{son}: hata ({e}); yeniden deneniyor", file=sys.stderr)
                time.sleep(2 * (deneme + 1))
        else:
            raise SystemExit("memberDisclosureQuery çalışmadı. Tarayıcıdan dışa aktarıp --ham-dosya ile verin.")
        kayitlar = veri if isinstance(veri, list) else veri.get("data", veri.get("content", []))
        print(f"  {gun}–{son}: {len(kayitlar)} bildirim", file=sys.stderr)
        sonuc.extend(kayitlar)
        gun = son + timedelta(days=1)
        time.sleep(0.8)
    return sonuc


def kap_son() -> list[dict]:
    veri = _istek("https://www.kap.org.tr/tr/api/disclosures")
    return [k.get("basic", k) for k in veri] if isinstance(veri, list) else []


def ham_oku(yol: Path) -> list[dict]:
    metin = yol.read_text(encoding="utf-8-sig")
    if yol.suffix.lower() == ".csv":
        return list(csv.DictReader(metin.splitlines(), delimiter=";" if ";" in metin.splitlines()[0] else ","))
    veri = json.loads(metin)
    return veri if isinstance(veri, list) else veri.get("data", veri.get("olaylar", []))


def _al(k: dict, *anahtarlar: str) -> str:
    for a in anahtarlar:
        v = k.get(a)
        if v:
            return str(v)
    return ""


def _tarih(s: str) -> str:
    s = s.strip()
    for bicim in ("%d.%m.%Y %H:%M:%S", "%d.%m.%Y %H:%M", "%d.%m.%Y", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return time.strftime("%Y-%m-%d", time.strptime(s[: len(bicim) + 2], bicim))
        except ValueError:
            continue
    return s[:10]


def donustur(kayitlar: list[dict]) -> list[dict]:
    olaylar: list[dict] = []
    for k in kayitlar:
        baslik = _al(k, "title", "baslik", "Başlık", "disclosureClass", "Konu")
        konu = _al(k, "ruleTypeTerm", "subject", "konu", "Konu", "disclosureClass").lower()
        ozet = _al(k, "summary", "ozet", "Özet", "relatedStocks")
        hisse = _al(k, "stockCodes", "relatedStocks", "hisse", "Hisse Kodu").split(",")[0].strip().upper() or None
        sirket = _al(k, "kapTitle", "companyName", "Şirket", "sirket")
        indeks = _al(k, "disclosureIndex", "index", "id", "Bildirim No")
        tarih = _tarih(_al(k, "publishDate", "date", "tarih", "Tarih"))
        metin = f"{baslik}. {konu}. {ozet}"
        kucuk = metin.lower()
        if any(a in kucuk for a in ATLA):
            continue
        tur = next((t for anahtar, t in KONU_ESLEME.items() if anahtar in kucuk), None)
        if tur is None:
            adaylar = tur_bul(metin)
            sirket_turleri = [a for a in adaylar if AGACLAR[a[0]]["kapsam"] == "sirket"]
            if not sirket_turleri:
                continue  # özel ağacı olmayan bildirim
            tur = sirket_turleri[0][0]
        parametreler, _ = parametre_cikar(tur, metin)
        olaylar.append({
            "kod": f"KAP-{indeks or tarih + '-' + (hisse or 'X')}", "tarih": tarih, "kaynak": "kap", "kapsam": "sirket", "tur": tur,
            "hisse": hisse, "sektor": None, "baslik": f"{sirket or hisse or ''}: {baslik}"[:200], "ozet": ozet[:1500], "yon": "notr",
            "parametreler": {a: v for a, v in parametreler.items() if v is not None}, "etiketler": ["kap", konu[:40]] if konu else ["kap"],
            "kaynaklar": [f"https://www.kap.org.tr/tr/Bildirim/{indeks}"] if indeks.isdigit() else [], "guven": 0.6,
        })
    return olaylar


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--baslangic", default=(date.today() - timedelta(days=365)).isoformat())
    ap.add_argument("--bitis", default=date.today().isoformat())
    ap.add_argument("--ham-dosya", help="KAP'tan elle indirilen JSON/CSV; ağ kullanılmaz")
    ap.add_argument("--son", action="store_true", help="yalnız son bildirimler uç noktası")
    ap.add_argument("--cikti", help="dönüştürülmüş JSON yolu (varsayılan veri/kap_bildirimleri_<aralık>.json)")
    a = ap.parse_args()

    ham_dizin = KOK / "veri" / "ham"
    ham_dizin.mkdir(parents=True, exist_ok=True)
    if a.ham_dosya:
        kayitlar = ham_oku(Path(a.ham_dosya))
    elif a.son:
        kayitlar = kap_son()
    else:
        kayitlar = kap_sorgu(date.fromisoformat(a.baslangic), date.fromisoformat(a.bitis))
        (ham_dizin / f"kap_{a.baslangic}_{a.bitis}.json").write_text(json.dumps(kayitlar, ensure_ascii=False), encoding="utf-8")
    olaylar = donustur(kayitlar)
    cikti = Path(a.cikti) if a.cikti else KOK / "veri" / f"kap_bildirimleri_{a.baslangic}_{a.bitis}.json"
    cikti.write_text(json.dumps({"not": f"KAP bildirimleri {a.baslangic}–{a.bitis}; scripts/kap_cek.py ile çekildi.", "olaylar": olaylar}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(kayitlar)} ham bildirim → {len(olaylar)} ağaçlı olay → {cikti}")
    print(f"Yüklemek için: python3 -m kap_karar ekle --json {cikti}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

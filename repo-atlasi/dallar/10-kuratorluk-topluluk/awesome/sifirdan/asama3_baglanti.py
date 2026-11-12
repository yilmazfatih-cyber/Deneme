"""Aşama 3 — Eşzamanlı bağlantı denetleyicisi.

Büyük listelerin en büyük düşmanı "bağlantı çürümesi"dir (link rot): bugün
çalışan adres yarın 404 verir, alan adı satılır, depo taşınır. awesome_bot
(free-programming-books), hecat url_check (awesome-selfhosted) ve
scripts/check_readme.py (project-based-learning) bu işi yapar.

Burada öğrendiklerin:
1. HEAD isteği (gövdesiz, ucuz) -> sunucu desteklemiyorsa GET'e düşmek.
2. Yönlendirmeleri ELLE izlemek: 301/308 "kalıcı taşındı" (listeyi güncelle),
   302/303/307 "geçici" (dokunma) ayrımını ancak böyle görürsün.
3. Zaman aşımı, yeniden deneme (429 / 503) ve sınıflandırma.
4. ThreadPoolExecutor ile eşzamanlılık + alan adı başına semafor ("kibar" tarayıcı:
   aynı sunucuya aynı anda en fazla N istek).
5. Ardışık hata sayacı: tek seferlik bir aksaklık yüzünden girdi silinmez; ancak
   art arda E kez ölü görünen adres "kaldırma adayı" olur (project-based-learning
   .github/link-rot-state.json fikri).

Not: http.client doğrudan bağlanır, ortam değişkenindeki vekil sunucuyu
(HTTPS_PROXY) KULLANMAZ. Kurumsal ağda gerçek adresleri denetlemek için urllib'in
ProxyHandler'ı ya da CONNECT tüneli gerekir (README'de "gerçek ölçek" bölümü).
"""

from __future__ import annotations

import http.client
import socket
import ssl
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass
from urllib.parse import urljoin, urlsplit

KULLANICI_AJANI = "liste-araclari/1.0 (+egitim amacli baglanti denetleyicisi)"

# Sınıflar: TAMAM ve YONLENDI sağlıklıdır; TASINDI düzeltme ister; diğerleri sorun.
SAGLIKLI = {"TAMAM", "YONLENDI"}
KALICI = {301, 308}
GECICI = {302, 303, 307}


@dataclass
class Sonuc:
    url: str
    sinif: str  # TAMAM, YONLENDI, TASINDI, OLU, ENGELLI, SUNUCU_HATASI, ZAMAN_ASIMI, BAGLANTI_HATASI, GECERSIZ
    durum: int | None  # son HTTP durum kodu
    son_url: str  # yönlendirmelerden sonra varılan adres
    deneme: int  # kaç istek atıldı
    aciklama: str = ""


def _istek(url: str, yontem: str, zaman_asimi: float) -> tuple[int, dict[str, str]]:
    """Tek bir HTTP isteği atar; (durum, başlıklar) döner. Yönlendirme izlemez."""
    p = urlsplit(url)
    sinif = http.client.HTTPSConnection if p.scheme == "https" else http.client.HTTPConnection
    baglanti = sinif(p.hostname, p.port, timeout=zaman_asimi)
    yol = (p.path or "/") + (f"?{p.query}" if p.query else "")
    try:
        baglanti.request(yontem, yol, headers={"User-Agent": KULLANICI_AJANI, "Accept": "*/*"})
        yanit = baglanti.getresponse()
        if yontem == "GET":
            yanit.read(64 * 1024)  # gövdenin tamamını indirme; ilk 64 KB yeter
        return yanit.status, {k.lower(): v for k, v in yanit.getheaders()}
    finally:
        baglanti.close()


def _bekleme_suresi(basliklar: dict[str, str], varsayilan: float, ust_sinir: float = 10.0) -> float:
    """Retry-After başlığına saygı duy (saniye cinsinden), ama sonsuza kadar bekleme."""
    try:
        return min(float(basliklar.get("retry-after", varsayilan)), ust_sinir)
    except ValueError:
        return varsayilan


def tek_kontrol(
    url: str,
    zaman_asimi: float = 5.0,
    en_fazla_yonlendirme: int = 5,
    yeniden_deneme: int = 1,
    bekleme: float = 0.5,
) -> Sonuc:
    """Bir adresi denetler ve sınıflandırır."""
    if urlsplit(url).scheme not in ("http", "https"):
        return Sonuc(url, "GECERSIZ", None, url, 0, "yalnızca http/https denetlenir")

    adres, ilk_yonlendirme, deneme, yonlendirme = url, None, 0, 0
    kalan_deneme = yeniden_deneme
    yontem = "HEAD"
    while True:
        deneme += 1
        try:
            durum, basliklar = _istek(adres, yontem, zaman_asimi)
        except (TimeoutError, socket.timeout):
            if kalan_deneme > 0:
                kalan_deneme -= 1
                continue
            return Sonuc(url, "ZAMAN_ASIMI", None, adres, deneme, f"{zaman_asimi} sn içinde yanıt yok")
        except (ConnectionError, socket.gaierror, ssl.SSLError, OSError) as hata:
            return Sonuc(url, "BAGLANTI_HATASI", None, adres, deneme, type(hata).__name__)

        if yontem == "HEAD" and durum in (403, 405, 501):
            yontem = "GET"  # bazı sunucular HEAD'i reddeder; bir de GET dene
            continue
        if 300 <= durum < 400 and "location" in basliklar:
            if ilk_yonlendirme is None:
                ilk_yonlendirme = durum
            yonlendirme += 1
            if yonlendirme > en_fazla_yonlendirme:
                return Sonuc(url, "BAGLANTI_HATASI", durum, adres, deneme, "çok fazla yönlendirme (döngü?)")
            adres = urljoin(adres, basliklar["location"])
            yontem = "HEAD"
            continue
        if durum in (429, 503) and kalan_deneme > 0:
            kalan_deneme -= 1
            time.sleep(_bekleme_suresi(basliklar, bekleme))
            continue
        return _siniflandir(url, adres, durum, ilk_yonlendirme, deneme)


def _siniflandir(url: str, son_url: str, durum: int, ilk_yonlendirme: int | None, deneme: int) -> Sonuc:
    if 200 <= durum < 300:
        if ilk_yonlendirme in KALICI:
            return Sonuc(url, "TASINDI", durum, son_url, deneme, f"listede yeni adresi kullan: {son_url}")
        if ilk_yonlendirme in GECICI:
            return Sonuc(url, "YONLENDI", durum, son_url, deneme, "geçici yönlendirme; dokunma")
        return Sonuc(url, "TAMAM", durum, son_url, deneme)
    if durum in (404, 410):
        return Sonuc(url, "OLU", durum, son_url, deneme, "sayfa yok")
    if durum in (401, 403, 429):
        return Sonuc(url, "ENGELLI", durum, son_url, deneme, "sunucu otomatik denetimi reddediyor; elle bak")
    if durum >= 500:
        return Sonuc(url, "SUNUCU_HATASI", durum, son_url, deneme)
    return Sonuc(url, "BAGLANTI_HATASI", durum, son_url, deneme, "beklenmeyen durum kodu")


class AlanSinirlayici:
    """Alan adı başına eşzamanlı istek sınırı (aynı sunucuyu boğmamak için)."""

    def __init__(self, alan_basina: int) -> None:
        self.alan_basina = alan_basina
        self._semaforlar: dict[str, threading.Semaphore] = {}
        self._kilit = threading.Lock()

    def semafor(self, url: str) -> threading.Semaphore:
        alan = (urlsplit(url).hostname or "").lower()
        with self._kilit:
            if alan not in self._semaforlar:
                self._semaforlar[alan] = threading.Semaphore(self.alan_basina)
            return self._semaforlar[alan]


def hepsini_kontrol_et(urller: list[str], eszamanli: int = 8, alan_basina: int = 2, **ayar) -> list[Sonuc]:
    """Adresleri paralel denetler. Aynı adres bir kez denetlenir; sonuç sırası girdi sırasıdır."""
    tekiller = list(dict.fromkeys(urller))
    sinirlayici = AlanSinirlayici(alan_basina)

    def is_parcacigi(url: str) -> Sonuc:
        with sinirlayici.semafor(url):
            return tek_kontrol(url, **ayar)

    with ThreadPoolExecutor(max_workers=eszamanli) as havuz:
        sonuclar = dict(zip(tekiller, havuz.map(is_parcacigi, tekiller)))
    return [sonuclar[u] for u in urller]


# --- Ardışık hata durumu (haftalık tarama için) -----------------------------


def durum_guncelle(eski: dict, sonuclar: list[Sonuc], bugun: str) -> dict:
    """Her adres için ardışık hata sayısını tutar. JSON'a yazılabilir sözlük döner.

    ENGELLI sayılmaz (sunucu bizi reddediyor, sayfa ölü olmayabilir). TASINDI
    sağlıklı sayılır ama yeni adres kaydedilir.
    """
    yeni = {}
    for s in sonuclar:
        kayit = dict(eski.get(s.url, {"ardisik_hata": 0, "ilk_hata": None}))
        if s.sinif in SAGLIKLI or s.sinif == "TASINDI":
            kayit.update(ardisik_hata=0, ilk_hata=None)
        elif s.sinif != "ENGELLI":
            kayit["ardisik_hata"] = kayit.get("ardisik_hata", 0) + 1
            kayit["ilk_hata"] = kayit.get("ilk_hata") or bugun
        kayit.update(son_sinif=s.sinif, son_kontrol=bugun, yeni_adres=s.son_url if s.sinif == "TASINDI" else None)
        yeni[s.url] = kayit
    return yeni


def kaldirma_adaylari(durum: dict, esik: int = 2) -> list[str]:
    """Art arda en az `esik` kez ölü/erişilemez görünen adresler."""
    return sorted(url for url, kayit in durum.items() if kayit.get("ardisik_hata", 0) >= esik)


def sozluge(sonuc: Sonuc) -> dict:
    return asdict(sonuc)

"""belgeye-soru-uygulamasi doğrulaması: uygulama denetimi + gerçek yz ve API süreçleriyle uçtan uca test.

Kullanım:  python havuz/tarifler/belgeye-soru-uygulamasi/dogrula.py <proje-klasörü>   (önce uygula.py)
Adımlar:  1) uygulama: npm run check (yeni uç, sayfa, kural testleri dahil) ve web derlemesi
          2) yz: örnek belgeleri dizinle, sunucuyu SAHTE sağlayıcı + geçici anahtarla boş kapıda başlat;
             anahtarsız isteğin 401 aldığını doğrula
          3) API: derlenmiş web'i sunan sunucuyu YZ_URL/YZ_API_KEY ile başlat; HTTP ile kayıt → soru
          4) Playwright (telefon 390 ve 360): kayıt → Sor → yanıt + kaynak, belgede yok, çevrimdışı; axe
          5) yz kapatılınca API'nin anlaşılır hata döndürdüğü
Anahtar her koşuda üretilir, yalnız süreç ortamında yaşar. Sunucular her durumda kapanır.
Genişletme: yeni bir uçtan uca senaryo → uygulama/e2e/sor/<ad>.tarif.ts; HTTP düzeyi denetim → `api_dene`.
"""

from __future__ import annotations

import os
import secrets
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from tarifcik.betik import bu_tarif, hedef_al
from tarifcik.komut import Gunluk, calistir_ve_ozetle
from tarifcik.kurulum import temeli_denetle, venv_ortami, venv_python
from tarifcik.sunucu import Surec, bos_kapi, http_istek

CHROMIUM_ADAYLARI = ("/opt/pw-browsers/chromium",)
SORU = "Ürünü kaç gün içinde iade edebilirim?"


def chromium() -> str | None:
    yol = os.environ.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE")
    return yol or next((aday for aday in CHROMIUM_ADAYLARI if Path(aday).exists()), None)


def yz_hazirla(gunluk: Gunluk, proje: Path, veri: Path) -> None:
    yz = proje / "yz"
    gunluk.calistir(
        "yz: örnek belgeleri dizinle",
        [str(venv_python(yz)), "-m", "yz", "indeksle", str(proje / "belgeler"), "--dizin",
         str(veri / "dizin"), "--sifirla"],
        yz,
        venv_ortami(yz, {"YZ_VERI_DIZINI": str(veri)}),
    )  # fmt: skip


def api_dene(gunluk: Gunluk, web: str, yz_url: str, anahtar: str) -> None:
    with gunluk.adim("yz: anahtarsız istek 401, anahtarlı istek yanıt verir"):
        durum, _, _ = http_istek("POST", f"{yz_url}/api/sor", {"soru": SORU})
        if durum != 401:
            raise AssertionError(f"yz anahtarsız isteğe {durum} döndü (401 beklenirdi)")
        durum, _, _ = http_istek("POST", f"{yz_url}/api/sor", {"soru": SORU},
                                 {"Authorization": f"Bearer {anahtar}"})  # fmt: skip
        if durum != 200:
            raise AssertionError(f"yz anahtarlı isteğe {durum} döndü")
    with gunluk.adim("API: oturumsuz 401; kayıt (belirteç kipi) → soru → yanıt + kaynak"):
        durum, _, _ = http_istek("POST", f"{web}/api/sor", {"question": SORU})
        if durum != 401:
            raise AssertionError(f"oturumsuz soru {durum} döndü (401 beklenirdi)")
        kayit = {"email": f"sor-{secrets.token_hex(4)}@ornek.com", "password": "mavi-deniz-kenari-42",
                 "name": "Ayşe"}  # fmt: skip
        durum, _, govde = http_istek("POST", f"{web}/api/auth/register", kayit, {"X-Auth-Mode": "token"})
        if durum != 201:
            raise AssertionError(f"kayıt başarısız: {durum} {govde}")
        yetki = {"Authorization": f"Bearer {govde['token']}"}
        durum, _, yanit = http_istek("POST", f"{web}/api/sor", {"question": SORU}, yetki)
        print(f"  yanıt: {yanit}")
        if durum != 200 or "14 gün" not in yanit["answer"] or not yanit["sources"]:
            raise AssertionError(f"soru yanıtı beklenen gibi değil: {durum} {yanit}")


def tarayici_testleri(gunluk: Gunluk, uygulama: Path, web: str) -> None:
    yol = chromium()
    if yol is None:
        gunluk.atla("Playwright (telefon 390/360)", "Chromium yok: PLAYWRIGHT_CHROMIUM_EXECUTABLE verin")
        return
    ortam = dict(os.environ, SOR_WEB_URL=web, PLAYWRIGHT_CHROMIUM_EXECUTABLE=yol)
    komut = ["npx", "playwright", "test", "--config", "e2e/sor/playwright.config.ts", "--trace", "off"]
    gunluk.calistir("Playwright: e2e/sor (telefon 390 + 360, axe)", komut, uygulama, ortam, 900)


def uctan_uca(gunluk: Gunluk, proje: Path) -> None:
    uygulama, yz = proje / "uygulama", proje / "yz"
    calisma = proje / ".tarif-dogrula"
    anahtar = secrets.token_urlsafe(32)
    yz_kapi, api_kapi = bos_kapi(), bos_kapi()
    yz_url, web = f"http://127.0.0.1:{yz_kapi}", f"http://127.0.0.1:{api_kapi}"
    yz_hazirla(gunluk, proje, calisma / "yz")
    yz_ortam = venv_ortami(yz, {"YZ_VERI_DIZINI": str(calisma / "yz"), "YZ_SUNUCU_ANAHTARI": anahtar})
    yz_komut = [str(venv_python(yz)), "-m", "yz", "sun", "--saglayici", "sahte", "--kapi", str(yz_kapi)]
    api_ortam = dict(os.environ, NODE_ENV="test", PORT=str(api_kapi), HOST="127.0.0.1",
                     DATABASE_PATH=str(calisma / "api.db"), APP_URL=web, WEB_DIST="../web/dist",
                     YZ_URL=yz_url, YZ_API_KEY=anahtar)  # fmt: skip
    api_komut = ["node", "--disable-warning=ExperimentalWarning", "src/index.ts"]
    with Surec("yz sunucusu", yz_komut, yz, yz_ortam, calisma / "yz.log") as yz_sunucu:
        with gunluk.adim("yz sunucusu: başlat (sahte sağlayıcı, anahtarlı)"):
            yz_sunucu.saglik_bekle(f"{yz_url}/saglik", sure_sn=120)
        with Surec("API (web'i de sunar)", api_komut, uygulama / "api", api_ortam,
                   calisma / "api.log") as api:  # fmt: skip
            with gunluk.adim("API: başlat ve /api/health"):
                api.saglik_bekle(f"{web}/api/health", sure_sn=120)
            api_dene(gunluk, web, yz_url, anahtar)
            tarayici_testleri(gunluk, uygulama, web)
            yz_sunucu.kapat()
            with gunluk.adim("yz kapalıyken API anlaşılır hata döndürür (500, suçlamayan ileti)"):
                kayit = {"email": f"sor-{secrets.token_hex(4)}@ornek.com",
                         "password": "mavi-deniz-kenari-42", "name": "Ayşe"}  # fmt: skip
                _, _, govde = http_istek("POST", f"{web}/api/auth/register", kayit, {"X-Auth-Mode": "token"})
                yetki = {"Authorization": f"Bearer {govde['token']}"}
                durum, _, hata = http_istek("POST", f"{web}/api/sor", {"question": SORU}, yetki)
                if durum != 500 or "ulaşılamıyor" not in hata["error"]["message"]:
                    raise AssertionError(f"yz kapalıyken beklenmeyen yanıt: {durum} {hata}")


def main(argv: list[str]) -> int:
    tarif = bu_tarif(__file__)
    proje = hedef_al(argv, yeni=False)
    gunluk = Gunluk(f"{tarif.ad} · doğrula → {proje}")
    return calistir_ve_ozetle(
        gunluk,
        [
            lambda: temeli_denetle(gunluk, proje / "uygulama"),
            lambda: gunluk.calistir("uygulama: web derlemesi", ["npm", "run", "build"], proje / "uygulama"),
            lambda: uctan_uca(gunluk, proje),
        ],
    )


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

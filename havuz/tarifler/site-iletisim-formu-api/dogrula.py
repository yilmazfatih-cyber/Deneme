"""site-iletisim-formu-api doğrulaması: iki temelin denetimi + iki gerçek sunucuyla uçtan uca form gönderimi.

Kullanım:  python havuz/tarifler/site-iletisim-formu-api/dogrula.py <proje-klasörü>   (önce uygula.py)
Adımlar:  1) uygulama ve site kendi denetimleri (npm run check)
          2) API boş kapıda (CONTACT_TO + CONTACT_ORIGINS = sitenin kökeni, hız sınırı AÇIK); site
             PUBLIC_FORM_ENDPOINT ile derlenir ve kendi statik sunucusuyla başka bir kapıda sunulur
          3) Playwright: JS açık/kapalı gönderim ve bal küpü (tests/tarif)
          4) API posta kutusu (mail_outbox): yalnız gerçek iki ileti var, bot iletisi yok
          5) kötüye kullanım: CORS ön isteği, yabancı köken 403, JSON bal küpü, IP hız sınırı 429
Hız sınırı bütçesi (IP başına saatte 5): Playwright 2 + bal küpü 1 → 2 ileti daha geçer, sonraki 429.
Genişletme: yeni bir kötüye kullanım denetimi → `kotuye_kullanim` içine; bütçeyi yukarıda güncelleyin.
"""

from __future__ import annotations

import os
import sqlite3
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from tarifcik.betik import bu_tarif, hedef_al
from tarifcik.komut import Gunluk, calistir_ve_ozetle
from tarifcik.kurulum import temeli_denetle
from tarifcik.sunucu import Surec, bos_kapi, http_istek

ALICI = "merhaba@sedir.example"
CHROMIUM_ADAYLARI = ("/opt/pw-browsers/chromium",)
GECERLI = {"name": "Deneme", "email": "deneme@ornek.com", "message": "Hız sınırı denemesi iletisi."}


def chromium() -> str | None:
    yol = os.environ.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE")
    return yol or next((aday for aday in CHROMIUM_ADAYLARI if Path(aday).exists()), None)


def posta_kutusu(veritabani: Path, bekle: int = 0) -> list[tuple[str, str, str]]:
    """mail_outbox satırları (alıcı, konu, metin); `bekle` > 0 ise en az o kadar satırı ~10 sn bekler."""
    son = time.monotonic() + 10
    while True:
        with sqlite3.connect(f"file:{veritabani}?mode=ro", uri=True) as baglanti:
            satirlar = baglanti.execute(
                "SELECT to_address, subject, text_body FROM mail_outbox ORDER BY id"
            ).fetchall()
        if len(satirlar) >= bekle or time.monotonic() > son:
            return [(str(a), str(b), str(c)) for a, b, c in satirlar]
        time.sleep(0.3)


def posta_denetle(gunluk: Gunluk, veritabani: Path) -> None:
    with gunluk.adim("posta kutusu: iki gerçek ileti var, bot iletisi yok"):
        satirlar = posta_kutusu(veritabani, bekle=2)
        for alici, konu, metin in satirlar:
            print(f"  → {alici} | {konu} | {metin.splitlines()[-3][:60]!r}")
        metinler = "\n".join(metin for _, _, metin in satirlar)
        if len(satirlar) != 2 or {a for a, _, _ in satirlar} != {ALICI}:
            raise AssertionError(f"posta kutusunda 2 ileti bekleniyordu: {satirlar}")
        if "(JS açık)" not in metinler or "JavaScript kapalı" not in metinler or "bot@" in metinler:
            raise AssertionError("iletilerin içeriği beklenen gibi değil")


def kotuye_kullanim(gunluk: Gunluk, api: str, site: str, veritabani: Path) -> None:
    uc = f"{api}/api/iletisim"
    with gunluk.adim("CORS ön isteği: site kökenine izin, yabancı kökene başlık yok"):
        istek = {
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        }
        durum, basliklar, _ = http_istek("OPTIONS", uc, None, {"Origin": site, **istek})
        if durum != 204 or basliklar.get("access-control-allow-origin") != site:
            raise AssertionError(f"site kökeninin ön isteği reddedildi: {durum} {basliklar}")
        _, basliklar, _ = http_istek(
            "OPTIONS", uc, None, {"Origin": "https://kotu.example", **istek}
        )
        if "access-control-allow-origin" in basliklar:
            raise AssertionError("yabancı kökene CORS izni verildi")
    with gunluk.adim("yabancı kökenden gönderim 403; JSON bal küpü 200 ama e-posta yok"):
        durum, _, _ = http_istek("POST", uc, GECERLI, {"Origin": "https://kotu.example"})
        if durum != 403:
            raise AssertionError(f"yabancı köken {durum} aldı (403 beklenirdi)")
        durum, _, govde = http_istek("POST", uc, {**GECERLI, "_gotcha": "spam"}, {"Origin": site})
        time.sleep(1)
        if durum != 200 or govde != {"ok": True} or len(posta_kutusu(veritabani)) != 2:
            raise AssertionError(f"bal küpü beklenen gibi değil: {durum} {govde}")
    with gunluk.adim("IP hız sınırı: 2 ileti daha geçer, sonraki 429 + Retry-After"):
        durumlar = []
        for _ in range(3):
            durum, basliklar, _ = http_istek("POST", uc, GECERLI, {"Origin": site})
            durumlar.append(durum)
        if durumlar != [200, 200, 429] or int(basliklar.get("retry-after", "0")) <= 0:
            raise AssertionError(f"hız sınırı beklenen gibi değil: {durumlar} {basliklar}")
        if len(posta_kutusu(veritabani, bekle=4)) != 4:
            raise AssertionError("hız sınırına takılmayan iletiler posta kutusunda değil")


def uctan_uca(gunluk: Gunluk, proje: Path) -> None:
    site_klasoru, uygulama = proje / "site", proje / "uygulama"
    calisma = proje / ".tarif-dogrula"
    calisma.mkdir(exist_ok=True)
    api_kapi, site_kapi = bos_kapi(), bos_kapi()
    api, site = f"http://127.0.0.1:{api_kapi}", f"http://127.0.0.1:{site_kapi}"
    veritabani = calisma / "api.db"
    api_ortam = dict(os.environ, NODE_ENV="test", PORT=str(api_kapi), HOST="127.0.0.1",
                     DATABASE_PATH=str(veritabani), APP_URL=api, CONTACT_TO=ALICI,
                     CONTACT_ORIGINS=site, RATE_LIMIT="on")  # fmt: skip
    api_komut = ["node", "--disable-warning=ExperimentalWarning", "src/index.ts"]
    with Surec("API", api_komut, uygulama / "api", api_ortam, calisma / "api.log") as api_surec:
        with gunluk.adim("API: başlat ve /api/health"):
            api_surec.saglik_bekle(f"{api}/api/health", sure_sn=120)
        derleme_ortami = dict(os.environ, PUBLIC_FORM_ENDPOINT=f"{api}/api/iletisim")
        gunluk.calistir("site: PUBLIC_FORM_ENDPOINT ile derle", ["npm", "run", "build"], site_klasoru,
                        derleme_ortami, 600)  # fmt: skip
        site_komut = ["node", "scripts/serve.ts", "--port", str(site_kapi)]
        with Surec(
            "site (statik)", site_komut, site_klasoru, None, calisma / "site.log"
        ) as site_surec:
            with gunluk.adim("site: statik sunucu"):
                site_surec.saglik_bekle(f"{site}/iletisim/", sure_sn=60)
            yol = chromium()
            if yol is None:
                gunluk.atla(
                    "Playwright (tests/tarif)", "Chromium yok: PLAYWRIGHT_CHROMIUM_EXECUTABLE verin"
                )
                return
            ortam = dict(os.environ, SITE_URL=site, API_URL=api, PLAYWRIGHT_CHROMIUM_EXECUTABLE=yol)
            gunluk.calistir("Playwright: JS açık/kapalı gönderim, bal küpü",
                            ["npx", "playwright", "test", "--config", "tests/tarif/playwright.config.ts"],
                            site_klasoru, ortam, 600)  # fmt: skip
            posta_denetle(gunluk, veritabani)
            kotuye_kullanim(gunluk, api, site, veritabani)


def main(argv: list[str]) -> int:
    tarif = bu_tarif(__file__)
    proje = hedef_al(argv, yeni=False)
    gunluk = Gunluk(f"{tarif.ad} · doğrula → {proje}")
    return calistir_ve_ozetle(
        gunluk,
        [
            lambda: temeli_denetle(gunluk, proje / "uygulama"),
            lambda: temeli_denetle(gunluk, proje / "site"),
            lambda: uctan_uca(gunluk, proje),
        ],
    )


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

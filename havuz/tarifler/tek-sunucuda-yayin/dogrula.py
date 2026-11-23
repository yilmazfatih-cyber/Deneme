"""tek-sunucuda-yayin doğrulaması: bu ortamda YAPILABİLENİN hepsi; yapılamayan "denenmedi" diye kaydedilir.

Kullanım:  python havuz/tarifler/tek-sunucuda-yayin/dogrula.py <proje-klasörü>   (önce uygula.py)
Yapılan:   uygulama denetimi (yedek saklama + geri yükleme testleri dahil) · web derlemesi · systemd biriminin
           ExecStart'ıyla AYNI komut ve yayin/uygulama.env.ornek ayarlarıyla üretim kipinde başlatma · sağlık,
           güvenlik başlıkları, önbellek · çalışırken yedek → veri değişir → SIGTERM ile düzgün kapanış → geri
           yükleme → yeniden başlatma → veri yedekteki hâlde · saglik.sh (sağlıklı / yeniden başlatma yolu) ·
           site-yayinla.sh iki kez (sürüm + `current` bağlantısı) · `systemd-analyze verify` · `bash -n`.
Denenmeyen: systemd'nin birimleri gerçekten çalıştırması, Caddy (kurulu değilse), guncelle.sh'nin uçtan ucu.
Genişletme: yeni bir yayın dosyası → `yayin_dosyalari` içinde denetimi; çalıştırılabilen her şeyi çalıştırın.
"""

from __future__ import annotations

import os
import secrets
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from tarifcik.betik import bu_tarif, hedef_al
from tarifcik.komut import Gunluk, calistir_ve_ozetle
from tarifcik.kurulum import temeli_denetle
from tarifcik.sunucu import Surec, bos_kapi, http_istek

SIFRE = "mavi-deniz-kenari-42"
NODE_KOMUTU = ["--disable-warning=ExperimentalWarning", "src/index.ts"]


def ortam_dosyasi(yol: Path) -> dict[str, str]:
    """systemd EnvironmentFile biçimini okur: KEY=değer satırları, # yorum, çevreleyen tırnaklar atılır."""
    ayar: dict[str, str] = {}
    for satir in yol.read_text(encoding="utf-8").splitlines():
        satir = satir.strip()
        if not satir or satir.startswith("#") or "=" not in satir:
            continue
        ad, _, deger = satir.partition("=")
        if len(deger) >= 2 and deger[0] == deger[-1] and deger[0] in "\"'":
            deger = deger[1:-1]
        ayar[ad.strip()] = deger
    return ayar


def kayit(web: str, eposta: str) -> int:
    govde = {"email": eposta, "password": SIFRE, "name": "Deneme"}
    return http_istek("POST", f"{web}/api/auth/register", govde, {"X-Auth-Mode": "token"})[0]


def giris(web: str, eposta: str) -> int:
    return http_istek("POST", f"{web}/api/auth/login", {"email": eposta, "password": SIFRE})[0]


def uretim(gunluk: Gunluk, proje: Path, calisma: Path) -> None:
    api = proje / "uygulama" / "api"
    kapi = bos_kapi()
    web = f"http://127.0.0.1:{kapi}"
    ayar = ortam_dosyasi(proje / "yayin" / "uygulama.env.ornek")
    ayar.update(PORT=str(kapi), DATABASE_PATH=str(calisma / "veri" / "uygulama.db"), APP_URL=web,
                WEB_DIST=str(proje / "uygulama" / "web" / "dist"), MAIL_PROVIDER="console")  # fmt: skip
    ortam = dict(os.environ, **ayar)
    node = shutil.which("node") or "node"
    a, b = f"a-{secrets.token_hex(3)}@ornek.com", f"b-{secrets.token_hex(3)}@ornek.com"
    with Surec(
        "uygulama (üretim kipi)", [node, *NODE_KOMUTU], api, ortam, calisma / "api-1.log"
    ) as sunucu:
        with gunluk.adim("üretim kipi: ortam dosyasıyla başlar, /api/health"):
            sunucu.saglik_bekle(f"{web}/api/health", sure_sn=120)
        with gunluk.adim("web aynı kökenden: CSP, HSTS, /assets önbelleği; kullanıcı A"):
            durum, basliklar, sayfa = http_istek("GET", f"{web}/")
            if durum != 200 or "script-src 'self'" not in basliklar.get(
                "content-security-policy", ""
            ):
                raise AssertionError(f"web sunulmuyor ya da CSP yok: {durum} {basliklar}")
            if "strict-transport-security" not in basliklar:
                raise AssertionError("üretim kipinde HSTS başlığı yok")
            varlik = next(
                p
                for p in str(sayfa).split('"')
                if p.startswith("/assets/") or p.startswith("./assets/")
            )
            _, basliklar, _ = http_istek("GET", f"{web}/{varlik.lstrip('./')}")
            if "immutable" not in basliklar.get("cache-control", ""):
                raise AssertionError(f"/assets önbellek başlığı beklenmedik: {basliklar}")
            if kayit(web, a) != 201:
                raise AssertionError("kullanıcı A kaydedilemedi")
        gunluk.calistir("yedek: sunucu çalışırken (--klasor --sakla 14)",
                        [node, "--disable-warning=ExperimentalWarning", "scripts/backup.ts", "--klasor",
                         str(calisma / "yedek"), "--sakla", "14"], api, ortam)  # fmt: skip
        with gunluk.adim("yedekten sonra veri değişir (kullanıcı B)"):
            if kayit(web, b) != 201:
                raise AssertionError("kullanıcı B kaydedilemedi")
        saglik_betigi(gunluk, proje, web, calisma)
        with gunluk.adim("SIGTERM ile düzgün kapanış (çıkış kodu 0, 'kapandı')"):
            kod = sunucu.kapat()
            if kod != 0 or "kapandı" not in (calisma / "api-1.log").read_text(encoding="utf-8"):
                raise AssertionError(
                    f"düzgün kapanmadı (kod {kod}); günlük: {calisma / 'api-1.log'}"
                )
    yedek = next((calisma / "yedek").glob("uygulama-*.db"))
    gunluk.calistir("geri yükleme: npm run restore karşılığı (--onayla)",
                    [node, "--disable-warning=ExperimentalWarning", "scripts/restore.ts", str(yedek), "--onayla"],
                    api, ortam)  # fmt: skip
    ikinci = Surec(
        "uygulama (geri yüklenmiş)", [node, *NODE_KOMUTU], api, ortam, calisma / "api-2.log"
    )
    with ikinci, gunluk.adim("geri yükleme tatbikatı: A giriş yapar, B yok (veri yedekteki hâlde)"):
        ikinci.saglik_bekle(f"{web}/api/health", sure_sn=120)
        durumlar = (giris(web, a), giris(web, b))
        if durumlar != (200, 401):
            raise AssertionError(f"geri yükleme beklenen hâli vermedi: A,B = {durumlar}")


def saglik_betigi(gunluk: Gunluk, proje: Path, web: str, calisma: Path) -> None:
    betik = str(proje / "yayin" / "saglik.sh")
    with gunluk.adim("saglik.sh: sağlıklıyken 0; yanıt yoksa yeniden başlatma komutu çalışır"):
        tamam = subprocess.run(["bash", betik], env=dict(os.environ, SAGLIK_URL=f"{web}/api/health"),
                               check=False, timeout=60)  # fmt: skip
        isaret = calisma / "yeniden-baslatildi"
        bozuk = dict(os.environ, SAGLIK_URL=f"http://127.0.0.1:{bos_kapi()}/api/health", SAGLIK_BEKLEME="0",
                     SAGLIK_YENIDEN_BASLAT=f"touch {isaret}")  # fmt: skip
        hata = subprocess.run(["bash", betik], env=bozuk, check=False, timeout=60)
        if (tamam.returncode, hata.returncode, isaret.exists()) != (0, 1, True):
            raise AssertionError(
                f"saglik.sh beklenmedik: {tamam.returncode}, {hata.returncode}, {isaret.exists()}"
            )


def site_yayini(gunluk: Gunluk, proje: Path, calisma: Path) -> None:
    hedef = calisma / "site"
    ortam = dict(os.environ, SITE_URL="https://ornek.com", SITE_HEDEF=str(hedef), ATLA_NPM_CI="1")
    for sira in (1, 2):
        gunluk.calistir(
            f"site-yayinla.sh ({sira}. sürüm)", ["bash", "yayin/site-yayinla.sh"], proje, ortam, 600
        )
    with gunluk.adim("site: current en yeni sürümü gösterir, sayfalar yerinde"):
        surumler = sorted(p.name for p in (hedef / "surumler").iterdir())
        hedefi = (hedef / "current").resolve()
        if len(surumler) != 2 or hedefi.name != surumler[-1]:
            raise AssertionError(f"sürümler/bağlantı beklenmedik: {surumler} → {hedefi}")
        for sayfa in ("index.html", "404.html", "iletisim/index.html"):
            if not (hedef / "current" / sayfa).is_file():
                raise AssertionError(f"yayında {sayfa} yok")


def yayin_dosyalari(gunluk: Gunluk, proje: Path) -> None:
    for betik in ("saglik.sh", "site-yayinla.sh", "guncelle.sh"):
        gunluk.calistir(f"bash -n {betik}", ["bash", "-n", f"yayin/{betik}"], proje)
    if shutil.which("shellcheck"):
        gunluk.calistir("shellcheck", ["shellcheck", "yayin/saglik.sh", "yayin/site-yayinla.sh",
                                       "yayin/guncelle.sh"], proje)  # fmt: skip
    else:
        gunluk.atla("shellcheck", "ortamda shellcheck yok")
    analiz = shutil.which("systemd-analyze")
    if analiz is None:
        gunluk.atla("systemd-analyze verify", "ortamda systemd-analyze yok")
    else:
        baslik = "systemd-analyze verify (5 birim; node yolu bu makineninkiyle)"
        with gunluk.adim(baslik), tempfile.TemporaryDirectory() as gecici:
            node = shutil.which("node") or "/usr/bin/node"
            for birim in (proje / "yayin" / "systemd").iterdir():
                metin = birim.read_text(encoding="utf-8").replace("/usr/bin/node", node)
                (Path(gecici) / birim.name).write_text(metin, encoding="utf-8")
            birimler = sorted(str(p) for p in Path(gecici).iterdir())
            sonuc = subprocess.run([analiz, "verify", *birimler], capture_output=True, text=True,
                                   check=False, timeout=120)  # fmt: skip
            if sonuc.returncode != 0 or sonuc.stderr.strip():
                raise AssertionError(f"systemd-analyze uyarı/hata verdi:\n{sonuc.stderr}")
    if shutil.which("caddy"):
        gunluk.calistir("caddy validate", ["caddy", "validate", "--config", "yayin/caddy/Caddyfile",
                                           "--adapter", "caddyfile"], proje)  # fmt: skip
    else:
        gunluk.atla("caddy validate", "ortamda Caddy yok; Caddyfile DENENMEDİ")
    gunluk.atla("systemd birimlerini gerçekten çalıştırma", "ortamda systemd (PID 1) yok")
    gunluk.atla(
        "guncelle.sh uçtan uca", "systemd ve uzak git deposu yok; yalnız bash -n denetlendi"
    )


def main(argv: list[str]) -> int:
    tarif = bu_tarif(__file__)
    proje = hedef_al(argv, yeni=False)
    calisma = proje / ".tarif-dogrula"
    calisma.mkdir(exist_ok=True)
    gunluk = Gunluk(f"{tarif.ad} · doğrula → {proje}")
    return calistir_ve_ozetle(
        gunluk,
        [
            lambda: temeli_denetle(gunluk, proje / "uygulama"),
            lambda: gunluk.calistir(
                "uygulama: web derlemesi", ["npm", "run", "build"], proje / "uygulama"
            ),
            lambda: uretim(gunluk, proje, calisma),
            lambda: site_yayini(gunluk, proje, calisma),
            lambda: yayin_dosyalari(gunluk, proje),
        ],
    )


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

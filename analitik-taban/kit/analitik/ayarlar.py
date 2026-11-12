"""Yollar, yerel/ayarlar.json, yerel/.env ve proje saat dilimine göre 'bugün'.

Şirkete özel her şey `yerel/` altındadır (git'e girmez). Gizli bilgiler yalnız `yerel/.env` ya da ortam
değişkenlerindedir; betikler onları okur ama hiçbir çıktıya yazmaz.
"""

from __future__ import annotations

import copy
import datetime as dt
import json
import os
import re
from pathlib import Path
from typing import Any, Dict, Optional

KIT = Path(__file__).resolve().parent.parent
KOK = KIT.parent

VARSAYILAN: Dict[str, Any] = {
    "proje_adi": "",
    "demo": False,
    "utc_ofset_saat": 3,
    "mixpanel": {"kaynak": "api", "bolge": "us", "proje_id": None},
    "hotjar": {"kaynak": "csv", "site_id": None},
    "boyutlar": ["$os", "$app_version_string", "mp_country_code", "utm_source"],
    "kpiler": [],
    "huniler": {},
    "deney": {
        "maruz_olay": "$experiment_started",
        "deney_ozelligi": "Experiment name",
        "grup_ozelligi": "Variant name",
    },
    "esikler": {"degisim": 0.10, "z": 3.0},
    "veri_sakla_adet": 200,
}


class AyarHatasi(Exception):
    """Kullanıcıya gösterilecek Türkçe ayar hatası."""


def yerel_dizin() -> Path:
    return Path(os.environ.get("ANALITIK_YEREL") or (KOK / "yerel"))


def _derin_birlestir(taban: Dict[str, Any], ust: Dict[str, Any]) -> Dict[str, Any]:
    sonuc = dict(taban)
    for anahtar, deger in ust.items():
        if anahtar.startswith("_"):
            continue
        if isinstance(deger, dict) and isinstance(sonuc.get(anahtar), dict):
            sonuc[anahtar] = _derin_birlestir(sonuc[anahtar], deger)
        else:
            sonuc[anahtar] = deger
    return sonuc


def env_oku(yol: Path) -> Dict[str, str]:
    """KEY=VALUE satırları; # yorum, boş satır ve tırnaklar desteklenir."""
    sonuc: Dict[str, str] = {}
    if not yol.exists():
        return sonuc
    for satir in yol.read_text(encoding="utf-8-sig").splitlines():
        satir = satir.strip()
        if not satir or satir.startswith("#") or "=" not in satir:
            continue
        anahtar, deger = satir.split("=", 1)
        anahtar = anahtar.strip()
        if anahtar.startswith("export "):
            anahtar = anahtar[len("export ") :].strip()
        if not anahtar:
            continue
        deger = deger.strip()
        if len(deger) >= 2 and deger[0] == deger[-1] and deger[0] in "'\"":
            deger = deger[1:-1]
        else:
            deger = re.sub(r"\s+#.*$", "", deger)
        sonuc[anahtar] = deger
    return sonuc


class Ayarlar:
    def __init__(self, veri: Dict[str, Any], gizli: Dict[str, str], dizin: Path):
        self.veri = veri
        self._gizli = gizli
        self.dizin = dizin

    def __getitem__(self, anahtar: str) -> Any:
        return self.veri[anahtar]

    def get(self, anahtar: str, varsayilan: Any = None) -> Any:
        return self.veri.get(anahtar, varsayilan)

    def gizli(self, anahtar: str) -> Optional[str]:
        """Önce ortam değişkeni, sonra yerel/.env. Boş değer yok sayılır."""
        deger = os.environ.get(anahtar) or self._gizli.get(anahtar)
        return deger.strip() if deger and deger.strip() else None

    @property
    def demo(self) -> bool:
        return bool(self.veri.get("demo")) or os.environ.get("ANALITIK_DEMO") == "1"

    @property
    def ofset(self) -> float:
        return float(self.veri.get("utc_ofset_saat", 3))

    def bugun(self) -> dt.date:
        """Proje saat dilimindeki bugün. ANALITIK_BUGUN=YYYY-AA-GG ile sabitlenebilir (test, demo)."""
        sabit = os.environ.get("ANALITIK_BUGUN")
        if sabit:
            return dt.date.fromisoformat(sabit)
        if self.demo:
            from .demo import DEMO_BUGUN

            return DEMO_BUGUN
        return (dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=self.ofset)).date()

    def alt_dizin(self, ad: str) -> Path:
        yol = self.dizin / ad
        yol.mkdir(parents=True, exist_ok=True)
        return yol


AG_DEGISKENLERI = (
    "HTTPS_PROXY",
    "HTTP_PROXY",
    "NO_PROXY",
    "https_proxy",
    "http_proxy",
    "no_proxy",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
)


def yukle(dizin: Optional[Path] = None) -> Ayarlar:
    dizin = dizin or yerel_dizin()
    veri = copy.deepcopy(VARSAYILAN)
    dosya = dizin / "ayarlar.json"
    if dosya.exists():
        try:
            veri = _derin_birlestir(copy.deepcopy(VARSAYILAN), json.loads(dosya.read_text(encoding="utf-8-sig")))
        except json.JSONDecodeError as hata:
            raise AyarHatasi(f"yerel/ayarlar.json okunamadı (satır {hata.lineno}): {hata.msg}") from hata
    gizli = env_oku(dizin / ".env")
    # Proxy ve kurumsal sertifika .env'de verildiyse ağ katmanı görsün (ortamda zaten varsa dokunma).
    for anahtar in AG_DEGISKENLERI:
        if gizli.get(anahtar) and not os.environ.get(anahtar):
            os.environ[anahtar] = gizli[anahtar]
    return Ayarlar(veri, gizli, dizin)


def ham_kaydet(ayar: Ayarlar, ad: str, veri: Any) -> Path:
    """Ham API yanıtını yerel/veri/ altına yazar; en eski dosyaları sınırın üstünde siler."""
    klasor = ayar.alt_dizin("veri")
    zaman = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    guvenli = re.sub(r"[^0-9A-Za-z_.-]+", "-", ad).strip("-")[:60] or "veri"
    yol = klasor / f"{zaman}-{guvenli}.json"
    sira = 1
    while yol.exists():
        sira += 1
        yol = klasor / f"{zaman}-{guvenli}-{sira}.json"
    yol.write_text(json.dumps(veri, ensure_ascii=False), encoding="utf-8")
    dosyalar = sorted(klasor.glob("*.json"))
    fazla = len(dosyalar) - int(ayar.get("veri_sakla_adet", 200))
    for eski in dosyalar[: max(0, fazla)]:
        try:
            eski.unlink()
        except OSError:
            pass
    return yol


def goreli(yol: Path) -> str:
    """Çıktıda kısa yol göstermek için çalışma alanına göre göreli yol."""
    try:
        return str(Path(yol).resolve().relative_to(KOK))
    except ValueError:
        return str(yol)

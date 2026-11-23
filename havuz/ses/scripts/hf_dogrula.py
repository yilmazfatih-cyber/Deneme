"""Model kataloğunu Hugging Face API'sine karşı doğrular; sonucu katalog/hf_dogrulama.json'a yazar.

Kullanım (ağ gerekir; temel klasöründen):
    .venv/bin/python scripts/hf_dogrula.py                       denetle + katalog/hf_dogrulama.json
    .venv/bin/python scripts/hf_dogrula.py --oneri Systran/faster-whisper-medium
    .venv/bin/python scripts/hf_dogrula.py --oneri rhasspy/piper-voices --klasor tr/tr_TR/dfki/medium
Her kayıt için: sabit sürüm var mı, dosya boyları ve sha256'lar (LFS'te API'den, küçük dosyada
indirip hesaplayarak), lisans (Whisper: model kartı etiketi; Piper: sesin MODEL_CARD dosyasındaki
"License:" satırı), deponun güncel sürümü, geri çekilen seslerin gerçekten kalktığı.
`--oneri`: yeni bir model için modeller.yaml'a yapıştırılacak taslak (lisansı SİZ doldurursunuz).
Genişletme: yeni bir denetim → `kaydi_denetle`'ye bir koşul ve ileti.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import urllib.request
from datetime import date
from pathlib import Path
from typing import Any
from urllib.parse import quote

KOK = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(KOK))

from ses.katalog import KatalogModeli, katalogu_oku  # noqa: E402

API = "https://huggingface.co/api/models/"
LISANS_URL = {"CC-BY-NC-SA-4.0": "by-nc-sa/4.0", "CC-BY-4.0": "by/4.0", "CC0": "CC0", "MIT": "mit"}


def _getir(url: str) -> bytes:
    istek = urllib.request.Request(url, headers={"User-Agent": "havuz-ses/0.1"})  # noqa: S310
    with urllib.request.urlopen(istek, timeout=60) as yanit:  # noqa: S310
        veri: bytes = yanit.read()
    return veri


def _json(url: str) -> Any:
    return json.loads(_getir(url))


def _dosya(hf: str, surum: str, yol: str) -> bytes:
    return _getir(f"https://huggingface.co/{hf}/resolve/{surum}/{quote(yol)}")


def kaydi_denetle(model: KatalogModeli) -> dict[str, Any]:
    """Bir katalog kaydını API ile karşılaştırır; sorunlar `sorunlar` listesindedir."""
    bilgi = _json(f"{API}{model.hf}/revision/{model.surum}?blobs=true")
    kardes = {s["rfilename"]: s for s in bilgi.get("siblings", [])}
    sorunlar: list[str] = []
    dosyalar = []
    for dosya in model.dosyalar:
        ham = kardes.get(dosya.yol)
        if ham is None:
            sorunlar.append(f"{dosya.yol} bu sürümde yok")
            continue
        lfs = ham.get("lfs") or {}
        if lfs.get("sha256"):
            ozet = lfs["sha256"]
        else:
            ozet = hashlib.sha256(_dosya(model.hf, model.surum, dosya.yol)).hexdigest()
        if ham.get("size") != dosya.boyut:
            sorunlar.append(f"{dosya.yol}: boyut {ham.get('size')} (katalogda {dosya.boyut})")
        if ozet != dosya.sha256:
            sorunlar.append(f"{dosya.yol}: sha256 {ozet} (katalogda {dosya.sha256})")
        dosyalar.append({"yol": dosya.yol, "boyut": ham.get("size"), "sha256": ozet, "lfs": bool(lfs)})
    kart_lisansi = (bilgi.get("cardData") or {}).get("license")
    kart = next((d for d in model.dosyalar if d.ad == "MODEL_CARD"), None)
    veri_lisansi = None
    if kart is not None:
        metin = _dosya(model.hf, model.surum, kart.yol).decode("utf-8", "replace")
        eslesme = re.search(r"License:\s*(\S+)", metin)
        veri_lisansi = eslesme.group(1) if eslesme else None
        beklenen = LISANS_URL.get(model.lisans, model.lisans)
        if veri_lisansi is None or beklenen not in veri_lisansi:
            sorunlar.append(f"MODEL_CARD lisansı '{veri_lisansi}', katalogda '{model.lisans}'")
    elif str(kart_lisansi).lower() != model.lisans.lower():
        sorunlar.append(f"model kartı lisansı '{kart_lisansi}', katalogda '{model.lisans}'")
    guncel = _json(f"{API}{model.hf}").get("sha")
    return {
        "ad": model.ad, "hf": model.hf, "surum": model.surum, "surum_tarihi": bilgi.get("lastModified"),
        "depo_lisans_etiketi": kart_lisansi, "model_karti_veri_lisansi": veri_lisansi,
        "guncel_surum": guncel, "dosyalar": dosyalar, "sorunlar": sorunlar,
    }  # fmt: skip


def geri_cekilenleri_denetle(hf: str, adlar: list[str]) -> dict[str, bool]:
    """Geri çekilen seslerin deponun güncel sürümünde gerçekten bulunmadığını denetler."""
    dosyalar = [s["rfilename"] for s in _json(f"{API}{hf}").get("siblings", [])]
    return {ad: not any(ad.split("-")[1] in yol for yol in dosyalar) for ad in adlar}


def oneri(hf: str, klasor: str) -> str:
    """Yeni kayıt için YAML taslağı (güncel sürüm, dosyalar, sha256)."""
    bilgi = _json(f"{API}{hf}?blobs=true")
    satirlar = [f"  - ad: DOLDURUN\n    tur: DOLDURUN  # stt ya da tts\n    hf: {hf}\n    surum: {bilgi['sha']}",
                "    dosyalar:"]  # fmt: skip
    for s in bilgi.get("siblings", []):
        yol = s["rfilename"]
        if not yol.startswith(klasor) or "/samples/" in yol or yol in (".gitattributes", "README.md"):
            continue
        ozet = (s.get("lfs") or {}).get("sha256") or hashlib.sha256(_dosya(hf, bilgi["sha"], yol)).hexdigest()
        satirlar.append(f"      - yol: {yol}\n        boyut: {s['size']}\n        sha256: {ozet}")
    lisans = (bilgi.get("cardData") or {}).get("license")
    satirlar.append(f"    lisans: DOLDURUN  # depo etiketi: {lisans}; Piper'da MODEL_CARD'ı okuyun\n"
                    "    ticari: DOLDURUN  # evet / hayir / belirsiz\n    lisans_kaynagi: DOLDURUN\n"
                    "    atif: DOLDURUN")  # fmt: skip
    return "\n".join(satirlar)


def main() -> int:
    ayristirici = argparse.ArgumentParser(description="Model kataloğunu HF API'siyle doğrular.")
    ayristirici.add_argument("--oneri", metavar="DEPO", help="yeni kayıt için YAML taslağı yaz")
    ayristirici.add_argument("--klasor", default="", help="--oneri ile: depodaki alt klasör")
    ayristirici.add_argument("--yazma", action="store_true", help="hf_dogrulama.json'u yazma")
    secenek = ayristirici.parse_args()
    if secenek.oneri:
        print(oneri(secenek.oneri, secenek.klasor))
        return 0
    katalog = katalogu_oku()
    sonuclar = [kaydi_denetle(m) for m in katalog.modeller]
    geri = {}
    for hf in sorted({g.kaynak.split()[0] for g in katalog.geri_cekilenler}):
        geri.update(geri_cekilenleri_denetle(hf, [g.ad for g in katalog.geri_cekilenler]))
    rapor = {"tarih": date.today().isoformat(), "modeller": sonuclar, "geri_cekilenler_depoda_yok": geri}
    for sonuc in sonuclar:
        durum = "TAMAM" if not sonuc["sorunlar"] else "SORUN: " + "; ".join(sonuc["sorunlar"])
        yeni = "" if sonuc["guncel_surum"] == sonuc["surum"] else f" (depoda daha yeni sürüm var: {sonuc['guncel_surum'][:10]})"
        print(f"{sonuc['ad']:<22} {durum}{yeni}")
    for ad, yok in geri.items():
        print(f"{ad:<22} geri çekilmiş: {'evet, depoda yok' if yok else 'HAYIR, depoda hâlâ var'}")
    if not secenek.yazma:
        hedef = KOK / "katalog" / "hf_dogrulama.json"
        hedef.write_text(json.dumps(rapor, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Yazıldı: {hedef.relative_to(KOK)}")
    return 0 if all(not s["sorunlar"] for s in sonuclar) and all(geri.values()) else 1


if __name__ == "__main__":
    raise SystemExit(main())

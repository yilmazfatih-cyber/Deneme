"""Açık kaynaklardan gerçek veri indirme ve tek bir veritabanına dönüştürme.

Kaynaklar (hepsi ticari olmayan araştırma lisanslı, bkz. docs/veritabani.md):
- Muharaf (Zenodo/HF aamijar/muharaf-public): 24.495 Arapça el yazısı satırı, çoğunluk rik'a, çevriyazılı. CC BY-NC-SA.
- OpenITI arabic_print_data (GitHub): Osmanlıca matbu nesih sayfaları + ALTO XML satır çevriyazıları.
- OpenITI MAKHZAN (Zenodo): Osmanlıca nesih el yazması sayfaları (235 parça, ~3.570 satır) + ALTO/PAGE. CC BY-NC-SA.
- Wikimedia Commons "Documents of the Ottoman Empire": Osmanlı resmî yazışmaları (rik'a, divani); çevriyazısız,
  etiketleme kuyruğu için ham sayfa.

Ortak çıktı: `veri/gercek/<kaynak>/manifest.jsonl` (+ goruntuler/), ve hepsini birleştiren `veri/veritabani.jsonl`.
"""

from __future__ import annotations

import io
import json
import re
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from .alfabe import normallestir

UA = "OsmanlicaHTR/0.1 (acik kaynak arastirma; github.com/yilmazfatih-cyber/Deneme)"
MUHARAF_HF = "https://huggingface.co/datasets/aamijar/muharaf-public/resolve/main/data/"
MUHARAF_PARCALAR = ["test-00000-of-00001", "validation-00000-of-00001", "train-00000-of-00003", "train-00001-of-00003", "train-00002-of-00003"]
MAKHZAN_ZIP = "https://zenodo.org/api/records/16410106/files/OpenITI-Makhzan_Data_2025-1-1.zip/content"
MAKHZAN_META = "https://zenodo.org/api/records/16410106/files/OpenITI-Makhzan_Metadata_2025-1-1.tsv/content"
OPENITI_GIT = "https://github.com/OpenITI/arabic_print_data"


def _indir(url: str, hedef: Path, gunluk=print) -> Path:
    hedef.parent.mkdir(parents=True, exist_ok=True)
    if hedef.exists() and hedef.stat().st_size > 0:
        return hedef
    gunluk(f"indiriliyor: {url} → {hedef}")
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=120) as r, hedef.open("wb") as f:
        while True:
            b = r.read(1 << 20)
            if not b:
                break
            f.write(b)
    return hedef


def _manifest_yaz(yol: Path, kayitlar: list[dict]):
    yol.parent.mkdir(parents=True, exist_ok=True)
    with yol.open("w", encoding="utf-8") as f:
        for k in kayitlar:
            f.write(json.dumps(k, ensure_ascii=False) + "\n")


# ---------------------------------------------------------------- Muharaf
def muharaf_donustur(kaynak: Path, cikti: Path, en_fazla: int | None = None, gunluk=print) -> Path:
    """HF parquet dosyalarını png + manifest'e çevirir (indirilmemişse indirir)."""
    import pyarrow.parquet as pq

    gdir = cikti / "goruntuler"
    gdir.mkdir(parents=True, exist_ok=True)
    kayitlar = []
    for parca in MUHARAF_PARCALAR:
        p = _indir(MUHARAF_HF + parca + ".parquet", kaynak / f"{parca}.parquet", gunluk)
        bolum = parca.split("-")[0]
        t = pq.read_table(p)
        for i in range(t.num_rows):
            if en_fazla and len(kayitlar) >= en_fazla:
                break
            r = t.slice(i, 1).to_pylist()[0]
            metin = normallestir(r["text"])
            if not metin:
                continue
            ad = f"{parca}_{i:05d}.png"
            if not (gdir / ad).exists():
                Image.open(io.BytesIO(r["image"]["bytes"])).convert("L").save(gdir / ad)
            kayitlar.append({"dosya": f"goruntuler/{ad}", "metin": metin, "kaynak": "muharaf", "bolum": bolum, "dil": "ar", "yazi": "rika", "tur": "elyazisi", "lisans": "CC BY-NC-SA 4.0"})
        gunluk(f"muharaf {parca}: toplam {len(kayitlar)} satır")
    m = cikti / "manifest.jsonl"
    _manifest_yaz(m, kayitlar)
    return m


# ---------------------------------------------------------------- ALTO (OpenITI, MAKHZAN)
def _alto_satirlar(xml_yolu: Path):
    kok = ET.parse(xml_yolu).getroot()
    ns = {"a": re.sub(r"\{(.*)\}.*", r"\1", kok.tag)}
    for tl in kok.iter(f"{{{ns['a']}}}TextLine"):
        metin = " ".join((s.get("CONTENT") or "") for s in tl.iter(f"{{{ns['a']}}}String")).strip()
        poly = tl.find("a:Shape/a:Polygon", ns)
        pts = None
        if poly is not None and poly.get("POINTS"):
            sayilar = [int(float(x)) for x in re.split(r"[ ,]+", poly.get("POINTS").strip()) if x]
            pts = list(zip(sayilar[0::2], sayilar[1::2]))
        try:
            kutu = (int(float(tl.get("HPOS"))), int(float(tl.get("VPOS"))), int(float(tl.get("HPOS"))) + int(float(tl.get("WIDTH"))), int(float(tl.get("VPOS"))) + int(float(tl.get("HEIGHT"))))
        except (TypeError, ValueError):
            kutu = None
        if pts and len(pts) >= 3:
            xs, ys = zip(*pts)
            kutu = (min(xs), min(ys), max(xs), max(ys))
        if kutu and metin:
            yield metin, kutu, pts


def _poligon_kirp(img: Image.Image, kutu, pts, pay: int = 4) -> Image.Image:
    x0, y0, x1, y1 = kutu
    x0, y0 = max(0, x0 - pay), max(0, y0 - pay)
    x1, y1 = min(img.width, x1 + pay), min(img.height, y1 + pay)
    kirp = img.crop((x0, y0, x1, y1)).convert("L")
    if pts:
        maske = Image.new("L", kirp.size, 0)
        ImageDraw.Draw(maske).polygon([(x - x0, y - y0) for x, y in pts], fill=255)
        maske = maske.filter(__import__("PIL.ImageFilter", fromlist=["MaxFilter"]).MaxFilter(2 * pay + 1))
        beyaz = Image.new("L", kirp.size, 255)
        kirp = Image.composite(kirp, beyaz, maske)
    return kirp


def alto_klasor_donustur(klasor: Path, cikti: Path, kaynak_adi: str, meta: dict, goruntu_bul=None, gunluk=print, en_fazla: int | None = None) -> Path:
    """Bir klasördeki ALTO XML + sayfa görüntülerinden satır kırpımları ve manifest üretir."""
    gdir = cikti / "goruntuler"
    gdir.mkdir(parents=True, exist_ok=True)
    kayitlar = []
    xmller = sorted(klasor.rglob("*.xml"))
    for xi, xml in enumerate(xmller):
        if en_fazla and len(kayitlar) >= en_fazla:
            break
        png = goruntu_bul(xml) if goruntu_bul else next((xml.with_suffix(s) for s in (".png", ".jpg", ".jpeg", ".tif", ".tiff") if xml.with_suffix(s).exists()), None)
        if png is None or not png.exists():
            continue
        try:
            img = Image.open(png)
            img.load()
        except Exception:  # noqa: BLE001
            continue
        sayfa_ad = re.sub(r"[^\w\-]+", "_", xml.stem)[:80]
        for j, (metin, kutu, pts) in enumerate(_alto_satirlar(xml)):
            m = normallestir(metin)
            if len(m) < 2:
                continue
            ad = f"{sayfa_ad}_s{j:03d}.png"
            if not (gdir / ad).exists():
                kirp = _poligon_kirp(img, kutu, pts)
                if kirp.width < 16 or kirp.height < 8:
                    continue
                kirp.save(gdir / ad)
            kayitlar.append({"dosya": f"goruntuler/{ad}", "metin": m, "kaynak": kaynak_adi, "sayfa": str(xml.relative_to(klasor)), **meta})
        if xi % 50 == 0:
            gunluk(f"{kaynak_adi}: {xi + 1}/{len(xmller)} sayfa, {len(kayitlar)} satır")
    mf = cikti / "manifest.jsonl"
    _manifest_yaz(mf, kayitlar)
    gunluk(f"{kaynak_adi}: {len(kayitlar)} satır → {mf}")
    return mf


def openiti_osmanli_donustur(kaynak: Path, cikti: Path, gunluk=print, en_fazla: int | None = None) -> Path:
    """OpenITI arabic_print_data içindeki ottoman_* yazı tiplerini satırlara çevirir (klonlanmamışsa klonlar)."""
    repo = kaynak / "arabic_print_data"
    if not (repo / "typefaces").exists():
        import subprocess

        gunluk(f"klonlanıyor: {OPENITI_GIT}")
        subprocess.run(["git", "clone", "--depth", "1", OPENITI_GIT, str(repo)], check=True)
    kayitlar_toplam = []
    for tf in sorted((repo / "typefaces").glob("ottoman*")):
        m = alto_klasor_donustur(tf, cikti / tf.name, "openiti_matbu", {"dil": "ota", "yazi": "nesih", "tur": "matbu", "lisans": "OpenITI (araştırma)", "yazitipi": tf.name}, gunluk=gunluk, en_fazla=en_fazla)
        for s in m.read_text(encoding="utf-8").splitlines():
            k = json.loads(s)
            k["dosya"] = f"{tf.name}/{k['dosya']}"
            kayitlar_toplam.append(k)
    mf = cikti / "manifest.jsonl"
    _manifest_yaz(mf, kayitlar_toplam)
    gunluk(f"openiti_matbu toplam {len(kayitlar_toplam)} satır → {mf}")
    return mf


def makhzan_osmanli_donustur(kaynak: Path, cikti: Path, gunluk=print) -> Path:
    """MAKHZAN zip'inden yalnızca Osmanlıca parçaları çıkarıp satırlara çevirir."""
    import csv

    meta = _indir(MAKHZAN_META, kaynak / "makhzan_meta.tsv", gunluk)
    zipp = _indir(MAKHZAN_ZIP, kaynak / "makhzan" / "data.zip", gunluk)
    satirlar = list(csv.DictReader(meta.open(encoding="utf-8"), delimiter="\t"))
    osmanli = {r["Doc Part ID"]: r for r in satirlar if r["Language"].startswith("Ottoman")}
    osmanli_doc = {r["Doc ID"] for r in osmanli.values()}
    hedef = kaynak / "makhzan" / "osmanli"
    hedef.mkdir(parents=True, exist_ok=True)
    # Dış zip: Doc<ID>.zip dosyaları; iç zip: Doc<ID>/<docid>_<partid>.png + .xml (ALTO v4) + METS.xml
    with zipfile.ZipFile(zipp) as z:
        for ad in z.namelist():
            m = re.match(r"Doc(\d+)\.zip$", ad)
            if not m or m.group(1) not in osmanli_doc:
                continue
            if (hedef / f"Doc{m.group(1)}").exists():
                continue
            with zipfile.ZipFile(io.BytesIO(z.read(ad))) as ic:
                ic.extractall(hedef)
            gunluk(f"makhzan Doc{m.group(1)} çıkarıldı")
    for mets in hedef.rglob("METS.xml"):
        mets.unlink()
    return alto_klasor_donustur(hedef, cikti, "makhzan_elyazisi", {"dil": "ota", "yazi": "nesih", "tur": "elyazisi", "lisans": "CC BY-NC-SA 4.0"}, gunluk=gunluk)


# ---------------------------------------------------------------- Wikimedia Commons
def _commons_api(params: dict, deneme: int = 4):
    url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({**params, "format": "json"})
    for i in range(deneme):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception:  # noqa: BLE001
            time.sleep(2 + 2 * i)
    return {}


def commons_dosyalari(kategori: str, derinlik: int = 1, gorulen: set | None = None) -> list[str]:
    gorulen = gorulen if gorulen is not None else set()
    if kategori in gorulen:
        return []
    gorulen.add(kategori)
    if re.search(r" by (century|decade|year)$", kategori):
        return []
    dosyalar, devam = [], {}
    while True:
        time.sleep(0.4)
        j = _commons_api({"action": "query", "list": "categorymembers", "cmtitle": kategori, "cmlimit": 500, **devam})
        for m in j.get("query", {}).get("categorymembers", []):
            if m["ns"] == 6:
                dosyalar.append(m["title"])
            elif m["ns"] == 14 and derinlik > 0:
                dosyalar += commons_dosyalari(m["title"], derinlik - 1, gorulen)
        if "continue" in j:
            devam = {"cmcontinue": j["continue"]["cmcontinue"]}
        else:
            break
    return dosyalar


def commons_indir(kategori: str, cikti: Path, en_fazla: int = 400, derinlik: int = 2, genislik: int = 2200, gunluk=print) -> Path:
    """Kategorideki (ve alt kategorilerdeki) görüntüleri indirir; meta.jsonl yazar. PDF/DjVu atlanır."""
    cikti.mkdir(parents=True, exist_ok=True)
    meta_yol = cikti / "meta.jsonl"
    mevcut = {json.loads(s)["baslik"] for s in meta_yol.read_text(encoding="utf-8").splitlines()} if meta_yol.exists() else set()
    basliklar = [b for b in dict.fromkeys(commons_dosyalari(kategori, derinlik)) if b not in mevcut]
    gunluk(f"{kategori}: {len(basliklar)} yeni dosya adayı")
    n = 0
    with meta_yol.open("a", encoding="utf-8") as mf:
        for i in range(0, len(basliklar), 20):
            if n >= en_fazla:
                break
            grup = basliklar[i : i + 20]
            j = _commons_api({"action": "query", "prop": "imageinfo", "titles": "|".join(grup), "iiprop": "url|mime|size|extmetadata", "iiurlwidth": genislik})
            for sayfa in j.get("query", {}).get("pages", {}).values():
                if n >= en_fazla:
                    break
                ii = (sayfa.get("imageinfo") or [{}])[0]
                mime = ii.get("mime", "")
                if not mime.startswith("image/") or mime in ("image/vnd.djvu", "image/svg+xml"):
                    continue
                em = ii.get("extmetadata", {})
                url = ii.get("thumburl") if ii.get("width", 0) > genislik else ii.get("url")
                if not url:
                    continue
                ad = re.sub(r"[^\w\-]+", "_", sayfa["title"][5:])[:100]
                uz = ".jpg" if "jpeg" in mime else ".png" if "png" in mime else ".tif"
                if ii.get("thumburl") and ii.get("width", 0) > genislik:
                    uz = ".jpg" if not url.lower().endswith(".png") else ".png"
                hedef = cikti / (ad + uz)
                try:
                    _indir(url, hedef, gunluk=lambda *_: None)
                except Exception as e:  # noqa: BLE001
                    gunluk(f"atlandı {sayfa['title']}: {e}")
                    continue
                kayit = {"baslik": sayfa["title"], "dosya": hedef.name, "kaynak": "commons", "sayfa_url": f"https://commons.wikimedia.org/wiki/{urllib.parse.quote(sayfa['title'].replace(' ', '_'))}", "lisans": (em.get("LicenseShortName") or {}).get("value", ""), "aciklama": re.sub(r"<[^>]+>", "", (em.get("ImageDescription") or {}).get("value", ""))[:300], "tarih": (em.get("DateTimeOriginal") or {}).get("value", "")[:40], "mime": mime, "boyut": [ii.get("width"), ii.get("height")]}
                mf.write(json.dumps(kayit, ensure_ascii=False) + "\n")
                n += 1
                if n % 25 == 0:
                    gunluk(f"commons: {n} görüntü indi")
            time.sleep(0.5)
    gunluk(f"commons: {n} yeni görüntü → {cikti}")
    return meta_yol


# ---------------------------------------------------------------- Birleştirme
def birlestir(gercek_kok: Path, cikti: Path, gunluk=print) -> Path:
    """Tüm manifestleri tek `veritabani.jsonl` dosyasında toplar (yollar bu dosyaya göreli) ve özet yazar."""
    kayitlar = []
    for m in sorted(gercek_kok.glob("*/manifest.jsonl")):
        for s in m.read_text(encoding="utf-8").splitlines():
            if not s.strip():
                continue
            k = json.loads(s)
            k["dosya"] = str((m.parent / k["dosya"]).resolve().relative_to(cikti.parent.resolve()))
            kayitlar.append(k)
    _manifest_yaz(cikti, kayitlar)
    import collections

    ozet = collections.Counter((k["kaynak"], k.get("dil"), k.get("yazi"), k.get("tur")) for k in kayitlar)
    satir = ["| kaynak | dil | yazı | tür | satır | karakter |", "|---|---|---|---|---|---|"]
    for (kay, dil, yazi, tur), n in sorted(ozet.items()):
        ch = sum(len(k["metin"]) for k in kayitlar if k["kaynak"] == kay)
        satir.append(f"| {kay} | {dil} | {yazi} | {tur} | {n} | {ch} |")
    (cikti.with_suffix(".md")).write_text("\n".join(satir) + "\n", encoding="utf-8")
    gunluk("\n".join(satir))
    gunluk(f"toplam {len(kayitlar)} satır → {cikti}")
    return cikti

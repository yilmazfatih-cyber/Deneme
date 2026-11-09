"""Commons üst verisinden belge adaylarını puanlar, küçük önizlemeleri indirip kontak sayfaları üretir.

Kullanım:
  python scripts/commons_sec.py --meta veri/ham/commons/meta.json --cikti veri/ham/commons/secim --en-fazla 220
Çıktı: secim/aday.jsonl (puan sırasıyla), secim/kucuk/<n>.jpg, secim/kontak_<k>.jpg (numaralı ızgara)
Sonra elenecek numaralar `--ele 3,17,42` ile verilip `secim.jsonl` yazılır (kuyruk_hazirla girdisi).
"""

from __future__ import annotations

import argparse
import json
import re
import time
import urllib.error
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

UA = "OsmanlicaHTR/0.1 (acik kaynak arastirma; github.com/yilmazfatih-cyber/Deneme)"
ELYAZMASI_KITAP = re.compile(r"Mecmua|Bestiary|Zubdat|Zübdet|Iskender|Sindb|Şahn|Selimname|Wellcome|Subhat|Metali|Tercüme|Cream of Histories|Walters|Cihannüm|Cihannuma|Kitab-ı|Qazwini", re.I)
OLUMSUZ = re.compile(r"\b(map|harita|sword|yatagan|shield|kalkan|carreau|céramique|ceramic|tile|coin|sikke|medal|photo|portrait|family|suffrage|naturalization|congress|Ruhland|Maine|Arizona|Kearney|screenshot|stamp|pul|banknote|bond|share|stock|flag|bayrak|seal|mühür|tughra|tuğra|mosque|cami|church|kilise|painting|miniature|minyatür|Louvre|museum|Encrier|inkwell)\b", re.I)
OLUMLU = [
    (6, re.compile(r"Documents of the Ottoman Empire|Official documents|Vital records|Hatt-i humayun|Ottoman Turkish-language documents", re.I)),
    (5, re.compile(r"mektup|letter|arzuhal|petition|tezkere|tezkire|telgraf|telegram|vesika|belge|document|yazışma|correspondence|ilmühaber|senet|senedi|tapu|nüfus|pasaport|passport|rapor|report|dilekçe|mazbata|irade|buyruldu|hüccet|vakfiye|defter|Документ|Дефтер|писмо|заповед|разрешение|изграждане|строеж|тапия|удостоверение|молба", re.I)),
    (3, re.compile(r"ferman|firman|berat|ahidname|hatt", re.I)),
    (2, re.compile(r"Ottoman|Osmanl", re.I)),
    (1, re.compile(r"handwrit|el yazısı|manuscript|yazma", re.I)),
]


def indir(url: str, deneme: int = 5) -> bytes:
    for i in range(deneme):
        time.sleep(1.5)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=90) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(float(e.headers.get("Retry-After") or 0) or 30 * (i + 1))
                continue
            raise
    raise RuntimeError("indirilemedi: " + url)


def puanla(baslik: str, m: dict) -> int:
    metin = " ".join([baslik, m.get("aciklama", ""), " ".join(m.get("kategoriler", [])), " ".join(m.get("kaynak_kat", []))])
    if ELYAZMASI_KITAP.search(metin):
        return -5
    p = 0
    for agirlik, rx in OLUMLU:
        if rx.search(metin):
            p += agirlik
    if OLUMSUZ.search(baslik):
        p -= 6
    if (m.get("mime") or "") not in ("image/jpeg", "image/png", "image/tiff"):
        p -= 20
    w, h = m.get("w") or 0, m.get("h") or 0
    if w < 600 or h < 600:
        p -= 4
    if w * h > 60_000_000:
        p -= 1
    return p


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--meta", action="append", required=True)
    ap.add_argument("--cikti", default="veri/ham/commons/secim")
    ap.add_argument("--en-fazla", type=int, default=220)
    ap.add_argument("--ele", default="", help="Kontak sayfasında elenen numaralar (virgülle)")
    ap.add_argument("--yalniz-sec", action="store_true", help="Önizleme indirmeden yalnızca secim.jsonl yaz")
    a = ap.parse_args()
    meta = {}
    for m in a.meta:
        meta.update(json.loads(Path(m).read_text(encoding="utf-8")))
    cikti = Path(a.cikti)
    (cikti / "kucuk").mkdir(parents=True, exist_ok=True)
    adaylar = sorted(((puanla(t, m), t, m) for t, m in meta.items()), key=lambda x: -x[0])
    adaylar = [(p, t, m) for p, t, m in adaylar if p >= 2][: a.en_fazla]
    with (cikti / "aday.jsonl").open("w", encoding="utf-8") as f:
        for i, (p, t, m) in enumerate(adaylar):
            f.write(json.dumps({"n": i, "puan": p, "baslik": t, **{k: m.get(k) for k in ("mime", "w", "h", "url", "thumb", "lisans", "aciklama", "tarih", "kaynak_kat")}}, ensure_ascii=False) + "\n")
    print(f"{len(adaylar)} aday (puan ≥ 2) → {cikti / 'aday.jsonl'}")
    ele = {int(x) for x in a.ele.split(",") if x.strip()}
    if a.yalniz_sec or ele:
        with (cikti / "secim.jsonl").open("w", encoding="utf-8") as f:
            for i, (p, t, m) in enumerate(adaylar):
                if i in ele:
                    continue
                f.write(json.dumps({"n": i, "baslik": t, "url": m.get("thumb") if (m.get("w") or 0) > 2000 else m.get("url"), "ad": t[5:], "kaynak": "commons", "lisans": m.get("lisans", ""), "sayfa_url": "https://commons.wikimedia.org/wiki/" + urllib.request.quote(t.replace(" ", "_")), "aciklama": m.get("aciklama", "")}, ensure_ascii=False) + "\n")
        print(f"seçim: {len(adaylar) - len(ele & set(range(len(adaylar))))} sayfa → {cikti / 'secim.jsonl'}")
        return
    # küçük önizlemeler (genişlik 400) ve kontak sayfaları
    kucukler = []
    for i, (p, t, m) in enumerate(adaylar):
        hedef = cikti / "kucuk" / f"{i:03d}.jpg"
        if not hedef.exists():
            url = (m.get("thumb") or m.get("url") or "")
            # Wikimedia yalnızca önceden üretilmiş genişlikleri hızlı verir: 320, 640, 800, 1024, 1280, 1920, 2560
            url = re.sub(r"/(\d+)px-", "/640px-", url) if "px-" in url else url
            try:
                b = indir(url)
                im = Image.open(__import__("io").BytesIO(b)).convert("RGB")
                im.thumbnail((400, 400))
                im.save(hedef, quality=80)
            except Exception as e:  # noqa: BLE001
                print(f"  önizleme yok {i}: {e}")
                continue
        kucukler.append((i, hedef))
    # 6x5 ızgara
    font = ImageFont.load_default()
    hucre, sutun, satir = 220, 6, 5
    for k in range(0, len(kucukler), sutun * satir):
        grup = kucukler[k : k + sutun * satir]
        sayfa = Image.new("RGB", (sutun * hucre, satir * (hucre + 18)), "white")
        d = ImageDraw.Draw(sayfa)
        for j, (i, yol) in enumerate(grup):
            im = Image.open(yol).convert("RGB")
            im.thumbnail((hucre - 8, hucre - 8))
            x, y = (j % sutun) * hucre + 4, (j // sutun) * (hucre + 18) + 4
            sayfa.paste(im, (x, y))
            d.rectangle((x - 2, y + hucre - 6, x + 40, y + hucre + 10), fill="black")
            d.text((x + 2, y + hucre - 4), str(i), fill="white", font=font)
        sayfa.save(cikti / f"kontak_{k // (sutun * satir) + 1:02d}.jpg", quality=85)
    print(f"{len(kucukler)} önizleme, {((len(kucukler) - 1) // (sutun * satir)) + 1} kontak sayfası → {cikti}")


if __name__ == "__main__":
    main()

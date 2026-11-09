"""Ham sayfa görüntülerini telefon sayfasının kuyruğu için hazırlar.

Her sayfa: satırlara bölünür → satır kırpımları tek bir dikey "sprite" PNG'de üst üste dizilir →
mevcut modelle her satır için A/B/C önerisi hesaplanır → `sayfalar/<id>` belge gövdesi (sprite asset id hariç)
JSON olarak yazılır. Sonra sprite'lar artifact'a asset olarak yüklenir, id'ler belgelere işlenir ve belgeler
ArtifactData ile yazılır (bkz. scripts/kuyruk_yukle.md).

Kullanım:
  python scripts/kuyruk_hazirla.py --liste veri/ham/commons/secim.jsonl --cikti veri/kuyruk_web --model cikti/v3/model.pt --adet 100
Liste satırı: {"yol": "veri/ham/commons/sayfalar/x.jpg", "ad": "...", "kaynak": "commons", "lisans": "...", "sayfa_url": "...", "aciklama": "..."}
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path

from PIL import Image

KOK = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(KOK))

from osmanlica_htr.bolut import sayfa_bolutle  # noqa: E402
from osmanlica_htr.tahmin import Tahminci  # noqa: E402

EN_AZ_SATIR, EN_COK_SATIR = 3, 60
EN_GENIS_SPRITE = 1800


def sayfa_hazirla(yol: Path, tahminci: Tahminci | None, surum: str) -> tuple[Image.Image, dict] | None:
    img = Image.open(yol)
    gri, satirlar, aci = sayfa_bolutle(img, kelime=False)
    if not (EN_AZ_SATIR <= len(satirlar) <= EN_COK_SATIR):
        return None
    kirpimlar = []
    for s in satirlar:
        k = gri.crop(s.kutu.tuple())
        if k.width > EN_GENIS_SPRITE:
            k = k.resize((EN_GENIS_SPRITE, max(1, round(k.height * EN_GENIS_SPRITE / k.width))), Image.LANCZOS)
        kirpimlar.append((k, s.kutu))
    W = max(k.width for k, _ in kirpimlar)
    H = sum(k.height for k, _ in kirpimlar)
    sprite = Image.new("L", (W, H), 255)
    kayitlar, y = [], 0
    for i, (k, kutu) in enumerate(kirpimlar):
        sprite.paste(k, (0, y))
        oneriler = tahminci.secenekler(k, adet=3) if tahminci else []
        kayitlar.append({"sira": i + 1, "y": y, "w": k.width, "h": k.height, "kutu": [kutu.x0, kutu.y0, kutu.x1, kutu.y1], "durum": "bekliyor", "metin": "", "secim": "", "oneriler": [[m, round(p, 3)] for m, p in oneriler], "oneri_surum": surum})
        y += k.height
    return sprite, {"aci": aci, "sprite_w": W, "sprite_h": H, "satir_sayisi": len(kayitlar), "bekleyen": len(kayitlar), "etiketli": 0, "satirlar": kayitlar}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--liste", required=True)
    ap.add_argument("--cikti", default=str(KOK / "veri" / "kuyruk_web"))
    ap.add_argument("--model", default=None)
    ap.add_argument("--adet", type=int, default=100)
    ap.add_argument("--surum", default=None)
    a = ap.parse_args()
    cikti = Path(a.cikti)
    cikti.mkdir(parents=True, exist_ok=True)
    tahminci = Tahminci(Path(a.model)) if a.model else None
    surum = a.surum or (json.loads((KOK / "web" / "model.json").read_text(encoding="utf-8")).get("surum", "?") if (KOK / "web" / "model.json").exists() else "?")
    ozet = cikti / "ozet.jsonl"
    hazir = {json.loads(s)["kaynak_yol"] for s in ozet.read_text(encoding="utf-8").splitlines() if s.strip()} if ozet.exists() else set()
    n = sum(1 for _ in hazir)
    with ozet.open("a", encoding="utf-8") as oz:
        for satir in Path(a.liste).read_text(encoding="utf-8").splitlines():
            if n >= a.adet:
                break
            if not satir.strip():
                continue
            k = json.loads(satir)
            if k["yol"] in hazir:
                continue
            t0 = time.time()
            try:
                sonuc = sayfa_hazirla(Path(k["yol"]), tahminci, surum)
            except Exception as e:  # noqa: BLE001
                print(f"HATA {k['yol']}: {e}")
                continue
            if sonuc is None:
                print(f"atlandı (satır sayısı uygun değil): {k['ad'][:60]}")
                continue
            sprite, govde = sonuc
            kimlik = re.sub(r"[^A-Za-z0-9_-]+", "_", Path(k["yol"]).stem)[:60] or f"s{n}"
            sprite.save(cikti / f"{kimlik}.png", optimize=True)
            govde.update({"ad": k["ad"], "kaynak": k.get("kaynak", ""), "lisans": k.get("lisans", ""), "sayfa_url": k.get("sayfa_url", ""), "aciklama": k.get("aciklama", "")[:300], "zaman": int(time.time() * 1000) + n})
            (cikti / f"{kimlik}.json").write_text(json.dumps(govde, ensure_ascii=False), encoding="utf-8")
            oz.write(json.dumps({"kimlik": kimlik, "kaynak_yol": k["yol"], "satir": govde["satir_sayisi"], "sprite": f"{kimlik}.png"}, ensure_ascii=False) + "\n")
            oz.flush()
            n += 1
            print(f"{n:3d}. {kimlik[:40]:40s} {govde['satir_sayisi']:3d} satır  {sprite.size}  {time.time() - t0:.1f} sn")
    print(f"hazır sayfa: {n} → {cikti}")


if __name__ == "__main__":
    main()

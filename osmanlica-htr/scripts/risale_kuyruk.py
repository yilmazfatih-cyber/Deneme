"""Risale-i Nur el yazmalarından "bilinen metinli" etiketleme kuyruğu hazırlar.

Her belge için: IIIF'ten indirilmiş sayfa görüntüleri → (açılımsa) sağ/sol sayfaya bölme → satır bölme →
satır sprite'ı (gri JPEG) + sayfa belgesi. Her satıra, belgenin bilinen Latin harfli metnindeki tahmini
başlangıç kelimesi (t_bas) ve kelime sayısı (t_len) yazılır; telefon sayfası bunları başlangıç tahmini olarak
kullanır, kullanıcı etiketledikçe gerçek konuma kilitlenir.

Kullanım (yayımlanan kuyruk bu iki komutla üretildi; bkz. docs/risale_kaynak.md):
  python scripts/risale_kuyruk.py --belge risale_22_23 --ad "22. ve 23. Sözler (el yazması, Milli Kütüphane)" \
     --sayfalar veri/ham/risale/sayfa/acrumiyyenahiv --acilim --metin sozler --bas 74493 --son 90719 \
     --kaynak-url https://archive.org/details/acrumiyyenahiv --cikti veri/risale_kuyruk --sira-taban 1 --haric 0000b
  python scripts/risale_kuyruk.py --belge risale_asa --ad "Asâ-yı Mûsâ (el yazması, Milli Kütüphane)" \
     --sayfalar veri/ham/risale/sayfa/asa --metin asa --bas 69 --son 20100 --baslangic-gorsel 2 \
     --kaynak-url https://archive.org/details/omernasuhibilmen2_201910 --cikti veri/risale_kuyruk --sira-taban 2

--bas/--son, el yazmasının ilk ve son metin satırının bilinen metindeki kelime indeksleridir (gözle eşlendi);
aradaki satırlara genişlikleriyle orantılı paylaştırılır. Tahmin yalnız başlangıçtır: telefon sayfası her satırı
bir önceki etiketli satırın bittiği kelimeden başlatır.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image

KOK = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(KOK))

from osmanlica_htr.bolut import sayfa_bolutle  # noqa: E402
from osmanlica_htr.risale import acilimi_bol  # noqa: E402

EN_GENIS = 1400


def satirlari_cikar(sayfa: Image.Image) -> tuple[list[Image.Image], list[list[int]], float]:
    gri, satirlar, aci = sayfa_bolutle(sayfa, kelime=False)
    if not satirlar:
        return [], [], aci
    hs = np.array([s.kutu.h for s in satirlar])
    ws = np.array([s.kutu.w for s in satirlar])
    med_h = float(np.median(hs))
    W = gri.width
    kirpimlar, kutular = [], []
    for s in satirlar:
        # Sayfa numarası, kenar işareti gibi küçük parçaları ele
        if s.kutu.h < 0.45 * med_h or s.kutu.w < 0.12 * W:
            continue
        k = gri.crop(s.kutu.tuple())
        if k.width > EN_GENIS:
            k = k.resize((EN_GENIS, max(1, round(k.height * EN_GENIS / k.width))), Image.LANCZOS)
        kirpimlar.append(k)
        kutular.append([s.kutu.x0, s.kutu.y0, s.kutu.x1, s.kutu.y1])
    return kirpimlar, kutular, aci


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--belge", required=True)
    ap.add_argument("--ad", required=True)
    ap.add_argument("--sayfalar", required=True, help="IIIF ile indirilmiş görüntü klasörü (0000.jpg ... + sayfalar.json)")
    ap.add_argument("--acilim", action="store_true", help="Görüntüler iki sayfalık açılım")
    ap.add_argument("--metin", required=True, help="Metin dosyası kimliği (web/kuyruk/metin/<kimlik>.json)")
    ap.add_argument("--bas", type=int, required=True, help="Belgenin metindeki başlangıç kelimesi")
    ap.add_argument("--son", type=int, required=True, help="Belgenin (tamamı için) metindeki bitiş kelimesi")
    ap.add_argument("--toplam-sayfa", type=int, default=None, help="El yazmasının toplam metin sayfası (yalnız bir kısmı işleniyorsa)")
    ap.add_argument("--kaynak-url", required=True)
    ap.add_argument("--cikti", default="veri/risale_kuyruk")
    ap.add_argument("--sira-taban", type=int, default=1, help="Kuyruk sırası (belgeler arası)")
    ap.add_argument("--en-az-satir", type=int, default=5)
    ap.add_argument("--baslangic-gorsel", type=int, default=0, help="Bu numaradan önceki görüntüleri (kapak, sırt, ithaf) atla")
    ap.add_argument("--bitis-gorsel", type=int, default=None, help="Bu numaradan sonraki görüntüleri atla")
    ap.add_argument("--haric", default="", help="Atlanacak sayfalar, virgülle: 0000b,0017 (açılımda a=sağ, b=sol sayfa)")
    a = ap.parse_args()

    haric = {x.strip() for x in a.haric.split(",") if x.strip()}
    kaynak = Path(a.sayfalar)
    cikti = Path(a.cikti)
    cikti.mkdir(parents=True, exist_ok=True)
    meta = {x["sira"]: x for x in json.loads((kaynak / "sayfalar.json").read_text(encoding="utf-8"))}
    sayfalar = []  # (görüntü no, parça no, kırpımlar, kutular, açı)
    for yol in sorted(kaynak.glob("[0-9][0-9][0-9][0-9].jpg")):
        no = int(yol.stem)
        if no < a.baslangic_gorsel or (a.bitis_gorsel is not None and no > a.bitis_gorsel):
            continue
        img = Image.open(yol)
        parcalar = acilimi_bol(img) if a.acilim else [img]
        for pj, parca in enumerate(parcalar):
            if f"{no:04d}{'ab'[pj] if a.acilim else ''}" in haric:
                continue
            kirpimlar, kutular, aci = satirlari_cikar(parca)
            if len(kirpimlar) < a.en_az_satir:
                continue
            sayfalar.append((no, pj, kirpimlar, kutular, aci))
    if not sayfalar:
        raise SystemExit("hiç metin sayfası bulunamadı")

    # Kelime tahmini: her satıra genişliğiyle orantılı bir ağırlık; ağırlıkların toplamı belgenin metin aralığına
    # (bas..son) eşitlenir, böylece son satırın tahmini sonu tam "son"a düşer.
    tum_satir = sum(len(s[2]) for s in sayfalar)
    toplam_sayfa = a.toplam_sayfa or len(sayfalar)
    genislikler = np.array([k.width for s in sayfalar for k in s[2]], dtype=np.float32)
    tam_genislik = float(np.percentile(genislikler, 80))
    agirliklar = np.minimum(1.15, genislikler / tam_genislik)
    tahmini_toplam_agirlik = float(agirliklar.sum()) * toplam_sayfa / len(sayfalar)
    kelime_birim = (a.son - a.bas) / max(1.0, tahmini_toplam_agirlik)
    kelime_satir = (a.son - a.bas) / max(1.0, tum_satir * toplam_sayfa / len(sayfalar))

    imlec = float(a.bas)
    ozet = []
    for bs, (no, pj, kirpimlar, kutular, aci) in enumerate(sayfalar):
        kimlik = f"{a.belge}_{no:04d}{'ab'[pj] if a.acilim else ''}"
        W = max(k.width for k in kirpimlar)
        H = sum(k.height for k in kirpimlar)
        sprite = Image.new("L", (W, H), 255)
        satirlar, y = [], 0
        for i, (k, kutu) in enumerate(zip(kirpimlar, kutular)):
            sprite.paste(k, (0, y))
            t_len = max(1.0, kelime_birim * min(1.15, k.width / tam_genislik))
            satirlar.append({"sira": i + 1, "y": y, "w": k.width, "h": k.height, "kutu": kutu, "durum": "bekliyor", "metin": "", "secim": "",
                             "t_bas": int(round(imlec)), "t_len": round(t_len, 2)})
            imlec += t_len
            y += k.height
        sprite.save(cikti / f"{kimlik}.jpg", quality=80, optimize=True, progressive=True)
        m = meta.get(no, {})
        govde = {
            "ad": f"{a.ad} · s. {bs + 1}", "kaynak": "risale", "belge": a.belge, "belge_ad": a.ad, "belge_sira": bs,
            "metin_dosya": f"kuyruk/metin/{a.metin}.json", "metin_bas": a.bas, "metin_son": a.son, "yazi": "latin",
            "lisans": "archive.org yüklemesi; yalnız kişisel araştırma", "sayfa_url": f"{a.kaynak_url}/page/n{no}/mode/1up",
            "aciklama": f"IIIF {m.get('dosya', '')} #{no}" + (f" ({'sağ' if pj == 0 else 'sol'} sayfa)" if a.acilim else ""),
            "sprite_yol": f"kuyruk/{kimlik}.jpg", "sprite_w": W, "sprite_h": H, "aci": aci,
            "zaman": int(a.sira_taban * 1e9 + bs), "satir_sayisi": len(satirlar), "bekleyen": len(satirlar), "etiketli": 0, "satirlar": satirlar,
        }
        (cikti / f"{kimlik}.json").write_text(json.dumps(govde, ensure_ascii=False), encoding="utf-8")
        ozet.append({"kimlik": kimlik, "satir": len(satirlar), "t_bas": satirlar[0]["t_bas"]})
    (cikti / f"{a.belge}_ozet.json").write_text(json.dumps({"belge": a.belge, "sayfa": len(ozet), "satir": tum_satir, "kelime_satir": round(kelime_satir, 2),
                                                           "sayfalar": ozet}, ensure_ascii=False, indent=0), encoding="utf-8")
    print(f"{a.belge}: {len(ozet)} sayfa, {tum_satir} satır, satır başına ~{kelime_satir:.1f} kelime, son tahmini kelime {int(imlec)} / {a.son}")


if __name__ == "__main__":
    main()

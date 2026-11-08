"""Sayfa → satır → kelime bölütleme (klasik görüntü işleme, model gerektirmez).

Rik'a el yazısında satırlar eğik, kelimeler birbirine yakın olabilir; bu yüzden
sonuç mükemmel değildir. Etiketleme arayüzünde her kelime için "bu kesim bozuk"
seçeneği ve satırı bütün olarak yazma seçeneği vardır. eScriptorium / Transkribus
çıktısı (PAGE-XML) varsa `pagexml_ice_aktar` ile o kesimler kullanılır.
"""

from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass, field
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps
from scipy import ndimage

EN_BUYUK_KENAR = 2600


@dataclass
class Kutu:
    x0: int
    y0: int
    x1: int
    y1: int

    @property
    def w(self):
        return self.x1 - self.x0

    @property
    def h(self):
        return self.y1 - self.y0

    def tuple(self):
        return (self.x0, self.y0, self.x1, self.y1)


@dataclass
class Satir:
    kimlik: str
    kutu: Kutu
    kelimeler: list[Kutu] = field(default_factory=list)


def sauvola(gri: np.ndarray, pencere: int = 31, k: float = 0.2) -> np.ndarray:
    """Yerel eşikleme; True = mürekkep."""
    g = gri.astype(np.float64)
    ort = ndimage.uniform_filter(g, pencere, mode="reflect")
    kare = ndimage.uniform_filter(g * g, pencere, mode="reflect")
    std = np.sqrt(np.clip(kare - ort * ort, 0, None))
    esik = ort * (1 + k * (std / 128.0 - 1))
    return g < esik


def egim_duzelt(gri: np.ndarray, murekkep: np.ndarray, en_fazla: float = 5.0, adim: float = 0.5) -> tuple[np.ndarray, np.ndarray, float]:
    """Yatay izdüşüm varyansını en büyüten açıyla döndür."""
    kucuk = murekkep[:: max(1, murekkep.shape[0] // 600), :: max(1, murekkep.shape[1] // 600)].astype(np.float32)
    en_iyi, en_iyi_aci = -1.0, 0.0
    for aci in np.arange(-en_fazla, en_fazla + 1e-6, adim):
        d = ndimage.rotate(kucuk, aci, reshape=False, order=0)
        v = d.sum(1).var()
        if v > en_iyi:
            en_iyi, en_iyi_aci = v, float(aci)
    if abs(en_iyi_aci) < adim / 2:
        return gri, murekkep, 0.0
    gri_d = ndimage.rotate(gri, en_iyi_aci, reshape=False, order=1, cval=255)
    mur_d = ndimage.rotate(murekkep.astype(np.uint8), en_iyi_aci, reshape=False, order=0).astype(bool)
    return gri_d, mur_d, en_iyi_aci


def _bantlar(profil: np.ndarray, en_kucuk: int, esik_orani: float = 0.08) -> list[tuple[int, int]]:
    esik = profil.max() * esik_orani
    aktif = profil > esik
    bantlar, basla = [], None
    for i, a in enumerate(aktif):
        if a and basla is None:
            basla = i
        elif not a and basla is not None:
            if i - basla >= en_kucuk:
                bantlar.append((basla, i))
            basla = None
    if basla is not None and len(aktif) - basla >= en_kucuk:
        bantlar.append((basla, len(aktif)))
    return bantlar


def satirlari_bul(murekkep: np.ndarray) -> list[Kutu]:
    """Yatay izdüşümle satır bantları. Satır yüksekliği kabaca tahmin edilip yakın bantlar birleştirilir."""
    H, W = murekkep.shape
    profil = ndimage.gaussian_filter1d(murekkep.sum(1).astype(np.float32), sigma=max(2, H / 400))
    bantlar = _bantlar(profil, en_kucuk=max(6, H // 200))
    if not bantlar:
        return []
    yuks = np.median([b - a for a, b in bantlar])
    # Küçük bantları (nokta/uzantı) komşusuyla birleştir
    birlesik: list[list[int]] = []
    for a, b in bantlar:
        if birlesik and (a - birlesik[-1][1] < yuks * 0.35) and ((b - a) < yuks * 0.6 or (birlesik[-1][1] - birlesik[-1][0]) < yuks * 0.6):
            birlesik[-1][1] = b
        else:
            birlesik.append([a, b])
    kutular = []
    for a, b in birlesik:
        pay = int(yuks * 0.25)
        y0, y1 = max(0, a - pay), min(H, b + pay)
        sutun = murekkep[y0:y1].any(0)
        xs = np.where(sutun)[0]
        if len(xs) == 0:
            continue
        kutular.append(Kutu(int(max(0, xs.min() - pay)), int(y0), int(min(W, xs.max() + pay + 1)), int(y1)))
    return kutular


def kelimeleri_bul(mur_satir: np.ndarray, en_az_bosluk_orani: float = 0.16) -> list[Kutu]:
    """Satır içinde dikey izdüşüm boşluklarına göre KABA kelime kutuları (sağdan sola sıralı).

    Boşluk, mürekkep gövdesi yüksekliğinin `en_az_bosluk_orani` katından genişse kelime sınırı sayılır.
    Sentetik ölçümde (6 yazı tipi, 150 satır) satırların yalnızca ~%50'sinde kelime sayısı doğru çıkar;
    rik'ada kelime arası boşluk harf arası boşluktan ayırt edilemez. Bu yüzden varsayılan etiketleme
    birimi satırdır; kelime kutuları için modelin CTC hizalaması kullanılır (`tahmin.kelime_kutulari`).
    """
    H, W = mur_satir.shape
    if W == 0 or not mur_satir.any():
        return []
    ys = np.where(mur_satir.any(1))[0]
    h_govde = max(8, int(ys.max() - ys.min() + 1))
    xs = np.where(mur_satir.any(0))[0]
    kosular: list[list[int]] = [[int(xs[0]), int(xs[0]) + 1]]
    for x in xs[1:]:
        if x == kosular[-1][1]:
            kosular[-1][1] = int(x) + 1
        else:
            kosular.append([int(x), int(x) + 1])
    esik = max(3, h_govde * en_az_bosluk_orani)
    parcalar: list[list[int]] = [list(kosular[0])]
    for i in range(1, len(kosular)):
        if kosular[i][0] - parcalar[-1][1] >= esik:
            parcalar.append(list(kosular[i]))
        else:
            parcalar[-1][1] = kosular[i][1]
    en_dar = max(4, h_govde // 6)
    temiz: list[list[int]] = []
    for p in parcalar:
        if temiz and ((p[1] - p[0] < en_dar) or (temiz[-1][1] - temiz[-1][0] < en_dar)):
            temiz[-1][1] = p[1]
        else:
            temiz.append(p)
    kutular = []
    pay = max(2, h_govde // 10)
    for a, b in temiz:
        ys = np.where(mur_satir[:, a:b].any(1))[0]
        if len(ys) == 0:
            continue
        kutular.append(Kutu(int(max(0, a - pay)), int(max(0, ys.min() - pay)), int(min(W, b + pay)), int(min(H, ys.max() + pay + 1))))
    kutular.sort(key=lambda k: -k.x0)
    return kutular


def sayfa_bolutle(img: Image.Image, kelime: bool = True) -> tuple[Image.Image, list[Satir], float]:
    """Sayfayı satırlara (ve kelimelere) böler. Döndürür: (eğimi düzeltilmiş gri görüntü, satırlar, açı)."""
    g = ImageOps.exif_transpose(img).convert("L")
    olcek = min(1.0, EN_BUYUK_KENAR / max(g.size))
    if olcek < 1.0:
        g = g.resize((int(g.width * olcek), int(g.height * olcek)), Image.LANCZOS)
    gri = np.asarray(g)
    if gri.mean() < 110:
        gri = 255 - gri
    mur = sauvola(gri, pencere=max(15, (min(gri.shape) // 40) | 1))
    # Çok küçük lekeleri at
    etiket, n = ndimage.label(mur)
    if n:
        boyut = ndimage.sum(mur, etiket, range(1, n + 1))
        kucuk = np.isin(etiket, np.where(boyut < 6)[0] + 1)
        mur = mur & ~kucuk
    gri, mur, aci = egim_duzelt(gri, mur)
    satirlar = []
    for i, k in enumerate(satirlari_bul(mur)):
        s = Satir(kimlik=f"s{i + 1:03d}", kutu=k)
        if kelime:
            for kw in kelimeleri_bul(mur[k.y0 : k.y1, k.x0 : k.x1]):
                s.kelimeler.append(Kutu(k.x0 + kw.x0, k.y0 + kw.y0, k.x0 + kw.x1, k.y0 + kw.y1))
        satirlar.append(s)
    return Image.fromarray(gri.astype(np.uint8)), satirlar, aci


def sayfayi_isle(sayfa: Path, cikti_kok: Path, kelime: bool = True) -> dict:
    """Kırpımları `cikti_kok/<sayfa adı>/` altına yazar, `bolut.json` döndürür ve kaydeder."""
    sayfa = Path(sayfa)
    ad = re.sub(r"[^\w\-]+", "_", sayfa.stem)
    kdir = cikti_kok / ad
    kdir.mkdir(parents=True, exist_ok=True)
    img = Image.open(sayfa)
    gri, satirlar, aci = sayfa_bolutle(img, kelime=kelime)
    gri.save(kdir / "sayfa.png")
    kayit = {"sayfa": str(sayfa), "ad": ad, "aci": aci, "boyut": gri.size, "satirlar": []}
    for s in satirlar:
        s_yol = kdir / f"{s.kimlik}.png"
        gri.crop(s.kutu.tuple()).save(s_yol)
        sk = {"kimlik": s.kimlik, "kutu": asdict(s.kutu), "dosya": str(s_yol.relative_to(cikti_kok)), "kelimeler": []}
        for j, k in enumerate(s.kelimeler):
            kid = f"{s.kimlik}_k{j + 1:02d}"
            k_yol = kdir / f"{kid}.png"
            gri.crop(k.tuple()).save(k_yol)
            sk["kelimeler"].append({"kimlik": kid, "kutu": asdict(k), "dosya": str(k_yol.relative_to(cikti_kok))})
        kayit["satirlar"].append(sk)
    (kdir / "bolut.json").write_text(json.dumps(kayit, ensure_ascii=False, indent=1), encoding="utf-8")
    return kayit


def kuyruga_ekle(kayit: dict, kuyruk: Path, cikti_kok: Path, duzey: str = "kelime") -> int:
    """Etiketleme kuyruğuna (JSONL) öğe ekler. duzey: kelime | satir."""
    kuyruk.parent.mkdir(parents=True, exist_ok=True)
    mevcut = set()
    if kuyruk.exists():
        for satir in kuyruk.read_text(encoding="utf-8").splitlines():
            if satir.strip():
                mevcut.add(json.loads(satir)["kimlik"])
    n = 0
    with kuyruk.open("a", encoding="utf-8") as f:
        for s in kayit["satirlar"]:
            ogeler = s["kelimeler"] if duzey == "kelime" and s["kelimeler"] else [s]
            for o in ogeler:
                kimlik = f"{kayit['ad']}/{o['kimlik']}"
                if kimlik in mevcut:
                    continue
                f.write(
                    json.dumps(
                        {
                            "kimlik": kimlik,
                            "sayfa": kayit["ad"],
                            "satir": s["kimlik"],
                            "dosya": o["dosya"],
                            "satir_dosya": s["dosya"],
                            "kutu": o["kutu"],
                            "satir_kutu": s["kutu"],
                            "tur": "kelime" if o is not s else "satir",
                        },
                        ensure_ascii=False,
                    )
                    + "\n"
                )
                n += 1
    return n


def pagexml_ice_aktar(xml_yolu: Path, sayfa_goruntu: Path, cikti_kok: Path) -> dict:
    """eScriptorium / Transkribus PAGE-XML satır poligonlarından satır kırpımları üretir (kelime bölme bizde)."""
    import xml.etree.ElementTree as ET

    ns = {"p": re.sub(r"\{(.*)\}.*", r"\1", ET.parse(xml_yolu).getroot().tag)}
    kok = ET.parse(xml_yolu).getroot()
    img = ImageOps.exif_transpose(Image.open(sayfa_goruntu)).convert("L")
    gri = np.asarray(img)
    mur = sauvola(gri)
    ad = re.sub(r"[^\w\-]+", "_", Path(sayfa_goruntu).stem)
    kdir = cikti_kok / ad
    kdir.mkdir(parents=True, exist_ok=True)
    img.save(kdir / "sayfa.png")
    kayit = {"sayfa": str(sayfa_goruntu), "ad": ad, "aci": 0.0, "boyut": img.size, "satirlar": []}
    i = 0
    for tl in kok.iter(f"{{{ns['p']}}}TextLine"):
        coords = tl.find(f"p:Coords", ns)
        if coords is None:
            continue
        pts = [tuple(map(int, p.split(","))) for p in coords.get("points", "").split()]
        if len(pts) < 3:
            continue
        xs, ys = zip(*pts)
        k = Kutu(max(0, min(xs)), max(0, min(ys)), min(img.width, max(xs)), min(img.height, max(ys)))
        i += 1
        kimlik = f"s{i:03d}"
        s_yol = kdir / f"{kimlik}.png"
        img.crop(k.tuple()).save(s_yol)
        metin_el = tl.find("p:TextEquiv/p:Unicode", ns)
        sk = {"kimlik": kimlik, "kutu": asdict(k), "dosya": str(s_yol.relative_to(cikti_kok)), "kelimeler": [], "metin": (metin_el.text or "").strip() if metin_el is not None else ""}
        for j, kw in enumerate(kelimeleri_bul(mur[k.y0 : k.y1, k.x0 : k.x1])):
            kk = Kutu(k.x0 + kw.x0, k.y0 + kw.y0, k.x0 + kw.x1, k.y0 + kw.y1)
            kid = f"{kimlik}_k{j + 1:02d}"
            k_yol = kdir / f"{kid}.png"
            img.crop(kk.tuple()).save(k_yol)
            sk["kelimeler"].append({"kimlik": kid, "kutu": asdict(kk), "dosya": str(k_yol.relative_to(cikti_kok))})
        kayit["satirlar"].append(sk)
    (kdir / "bolut.json").write_text(json.dumps(kayit, ensure_ascii=False, indent=1), encoding="utf-8")
    return kayit

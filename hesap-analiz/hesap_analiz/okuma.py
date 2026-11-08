"""Ekstre okuma: Excel/CSV dosyalarını banka şablonuyla standart tabloya çevirir.

Standart tablo sütunları:
  tarih (datetime), aciklama (str), tutar (float, + gelen / - giden),
  yon ("gelen"|"giden"), kaynak (dosya adı), banka, hesap_turu ("hesap"|"kart"),
  bakiye (float|NaN), satir_id (str)
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from pathlib import Path

import pandas as pd
import yaml

from .metin import sade

STANDART_SUTUNLAR = [
    "tarih", "aciklama", "tutar", "yon", "kaynak", "banka", "hesap_turu", "bakiye", "satir_id",
]


@dataclass
class BankaSablonu:
    ad: str
    tur: str
    oncelik: int
    tanima: list[str]
    sutunlar: dict[str, list[str]]
    isaret_ters: bool = False
    dosya: str = ""

    @classmethod
    def yukle(cls, yol: Path) -> "BankaSablonu":
        with open(yol, encoding="utf-8") as f:
            veri = yaml.safe_load(f) or {}
        return cls(
            ad=veri.get("ad", yol.stem),
            tur=veri.get("tur", "hesap"),
            oncelik=int(veri.get("oncelik", 0)),
            tanima=[str(t) for t in veri.get("tanima", []) or []],
            sutunlar={k: [str(a) for a in v] for k, v in (veri.get("sutunlar") or {}).items()},
            isaret_ters=bool(veri.get("isaret_ters", False)),
            dosya=str(yol),
        )


def sablonlari_yukle(klasor: Path) -> list[BankaSablonu]:
    sablonlar = [BankaSablonu.yukle(p) for p in sorted(klasor.glob("*.yaml"))]
    if not sablonlar:
        raise FileNotFoundError(f"{klasor} altında banka şablonu (.yaml) bulunamadı")
    return sablonlar


@dataclass
class OkumaSonucu:
    tablo: pd.DataFrame
    dosya: str
    banka: str
    satir_sayisi: int
    uyarilar: list[str] = field(default_factory=list)


# ---------- ham okuma ----------

def _ham_oku(yol: Path) -> list[pd.DataFrame]:
    """Dosyadaki her sayfayı başlıksız ham tablo olarak döndürür."""
    uzanti = yol.suffix.lower()
    if uzanti in {".xlsx", ".xlsm", ".xls"}:
        sayfalar = pd.read_excel(yol, sheet_name=None, header=None, dtype=object)
        return [s for s in sayfalar.values() if not s.dropna(how="all").empty]
    if uzanti in {".csv", ".txt"}:
        for sep in (";", ",", "\t"):
            try:
                t = pd.read_csv(yol, sep=sep, header=None, dtype=object, encoding="utf-8-sig",
                                engine="python")
                if t.shape[1] > 1:
                    return [t]
            except Exception:  # noqa: BLE001
                continue
        raise ValueError(f"{yol.name}: CSV ayırıcısı çözülemedi")
    raise ValueError(f"{yol.name}: desteklenmeyen uzantı {uzanti}")


def _baslik_satirini_bul(ham: pd.DataFrame, sablon: BankaSablonu, en_fazla: int = 40) -> int | None:
    """Tarih ve açıklama sütun adlarının birlikte geçtiği ilk satırı bulur."""
    tarih_adlari = {sade(a) for a in sablon.sutunlar.get("tarih", [])}
    aciklama_adlari = {sade(a) for a in sablon.sutunlar.get("aciklama", [])}
    for i in range(min(en_fazla, len(ham))):
        hucreler = {sade(str(h)) for h in ham.iloc[i].tolist() if pd.notna(h)}
        if hucreler & tarih_adlari and hucreler & aciklama_adlari:
            return i
    return None


def _sutun_esle(basliklar: list[str], adaylar: list[str]) -> str | None:
    sade_basliklar = {sade(b): b for b in basliklar}
    for aday in adaylar:
        s = sade(aday)
        if s in sade_basliklar:
            return sade_basliklar[s]
    # Kısmi eşleşme (ör. "İşlem Tarihi (Valör)")
    for aday in adaylar:
        s = sade(aday)
        for sb, orijinal in sade_basliklar.items():
            if s and s in sb:
                return orijinal
    return None


def sablon_sec(ham_sayfalar: list[pd.DataFrame], dosya_adi: str,
               sablonlar: list[BankaSablonu]) -> tuple[BankaSablonu, int, int] | None:
    """Dosyaya en uygun şablonu, sayfa indeksini ve başlık satırını seçer."""
    ust_metin = sade(dosya_adi)
    for s in ham_sayfalar[:3]:
        ust_metin += " " + sade(" ".join(str(h) for h in s.head(15).values.ravel() if pd.notna(h)))

    adaylar: list[tuple[int, int, BankaSablonu, int, int]] = []
    for sablon in sablonlar:
        tanima_puani = sum(1 for t in sablon.tanima if sade(t) in ust_metin)
        for si, sayfa in enumerate(ham_sayfalar):
            bs = _baslik_satirini_bul(sayfa, sablon)
            if bs is None:
                continue
            adaylar.append((tanima_puani, sablon.oncelik, sablon, si, bs))
    if not adaylar:
        return None
    adaylar.sort(key=lambda a: (a[0], a[1]), reverse=True)
    _, _, sablon, si, bs = adaylar[0]
    return sablon, si, bs


# ---------- dönüştürme ----------

def _sayiya(deger) -> float:
    """'1.234,56', '1,234.56', '-250', '(250,00)', '250,00 TL' biçimlerini çözer."""
    if deger is None or (isinstance(deger, float) and pd.isna(deger)):
        return float("nan")
    if isinstance(deger, (int, float)):
        return float(deger)
    m = str(deger).strip()
    if not m:
        return float("nan")
    negatif = False
    if m.startswith("(") and m.endswith(")"):
        negatif, m = True, m[1:-1]
    m = re.sub(r"[^\d,.\-+]", "", m)
    if not m or m in {"-", "+"}:
        return float("nan")
    if "," in m and "." in m:
        if m.rfind(",") > m.rfind("."):
            m = m.replace(".", "").replace(",", ".")
        else:
            m = m.replace(",", "")
    elif "," in m:
        parcalar = m.split(",")
        if len(parcalar[-1]) == 3 and len(parcalar) > 1 and len(parcalar[0]) <= 3:
            # 1,234 → binlik ayırıcı olma ihtimali; Türkçe ekstrede nadir, ondalık say
            m = m.replace(",", ".")
        else:
            m = m.replace(",", ".")
    elif m.count(".") > 1:
        m = m.replace(".", "")
    try:
        s = float(m)
    except ValueError:
        return float("nan")
    return -s if negatif else s


def _tarihe(seri: pd.Series) -> pd.Series:
    t = pd.to_datetime(seri, errors="coerce", dayfirst=True)
    if t.isna().mean() > 0.5:
        t2 = pd.to_datetime(seri, errors="coerce", dayfirst=False)
        if t2.notna().sum() > t.notna().sum():
            t = t2
    return t.dt.normalize()


def _satir_id(satir: pd.Series) -> str:
    ham = f"{satir['tarih']}|{satir['aciklama']}|{satir['tutar']:.2f}|{satir['kaynak']}"
    return hashlib.sha1(ham.encode("utf-8")).hexdigest()[:12]


def dosya_oku(yol: Path, sablonlar: list[BankaSablonu]) -> OkumaSonucu:
    ham_sayfalar = _ham_oku(yol)
    secim = sablon_sec(ham_sayfalar, yol.name, sablonlar)
    if secim is None:
        raise ValueError(
            f"{yol.name}: hiçbir banka şablonu uymadı. bankalar/ altına bu dosyanın "
            "sütun adlarıyla yeni bir .yaml ekleyin."
        )
    sablon, si, bs = secim
    ham = ham_sayfalar[si]
    basliklar = [str(h).strip() if pd.notna(h) else f"_bos{i}" for i, h in enumerate(ham.iloc[bs])]
    veri = ham.iloc[bs + 1:].copy()
    veri.columns = basliklar
    veri = veri.dropna(how="all")

    uyarilar: list[str] = []
    s = sablon.sutunlar
    tarih_s = _sutun_esle(basliklar, s.get("tarih", []))
    aciklama_s = _sutun_esle(basliklar, s.get("aciklama", []))
    tutar_s = _sutun_esle(basliklar, s.get("tutar", []))
    borc_s = _sutun_esle(basliklar, s.get("borc", []))
    alacak_s = _sutun_esle(basliklar, s.get("alacak", []))
    bakiye_s = _sutun_esle(basliklar, s.get("bakiye", []))

    if tarih_s is None or aciklama_s is None:
        raise ValueError(f"{yol.name}: tarih/açıklama sütunu bulunamadı")

    cikti = pd.DataFrame()
    cikti["tarih"] = _tarihe(veri[tarih_s])
    cikti["aciklama"] = veri[aciklama_s].astype(str).str.strip().replace({"nan": ""})

    isaret_cevir = sablon.isaret_ters
    tutar = None
    if tutar_s is not None:
        tutar = veri[tutar_s].map(_sayiya)
        if tutar.isna().all() and (borc_s is not None or alacak_s is not None):
            tutar = None
    if tutar is None:
        if borc_s is None and alacak_s is None:
            raise ValueError(f"{yol.name}: tutar ya da borç/alacak sütunu bulunamadı")
        borc = veri[borc_s].map(_sayiya).fillna(0).abs() if borc_s else 0
        alacak = veri[alacak_s].map(_sayiya).fillna(0).abs() if alacak_s else 0
        # Borç/alacak sütunları yönü zaten taşır; işaret çevirmeye gerek kalmaz
        tutar = alacak - borc
        isaret_cevir = False
    cikti["tutar"] = tutar
    if isaret_cevir:
        cikti["tutar"] = -cikti["tutar"]

    cikti["bakiye"] = veri[bakiye_s].map(_sayiya) if bakiye_s else float("nan")
    cikti["kaynak"] = yol.name
    cikti["banka"] = sablon.ad
    cikti["hesap_turu"] = sablon.tur

    gecersiz = cikti["tarih"].isna() | cikti["tutar"].isna()
    if gecersiz.any():
        uyarilar.append(f"{int(gecersiz.sum())} satır tarih/tutar çözülemediği için atlandı")
    cikti = cikti[~gecersiz].copy()
    cikti = cikti[cikti["tutar"] != 0]
    cikti["yon"] = cikti["tutar"].map(lambda t: "gelen" if t > 0 else "giden")
    cikti["satir_id"] = cikti.apply(_satir_id, axis=1)
    cikti = cikti[STANDART_SUTUNLAR].reset_index(drop=True)
    return OkumaSonucu(cikti, yol.name, sablon.ad, len(cikti), uyarilar)


def klasor_oku(klasor: Path, sablon_klasoru: Path) -> tuple[pd.DataFrame, list[OkumaSonucu]]:
    sablonlar = sablonlari_yukle(sablon_klasoru)
    dosyalar = sorted(
        p for p in klasor.iterdir()
        if p.suffix.lower() in {".xlsx", ".xlsm", ".xls", ".csv", ".txt"} and not p.name.startswith("~$")
    )
    if not dosyalar:
        raise FileNotFoundError(f"{klasor} içinde ekstre dosyası yok (.xlsx / .csv)")
    sonuclar = [dosya_oku(p, sablonlar) for p in dosyalar]
    tablo = pd.concat([s.tablo for s in sonuclar], ignore_index=True)
    # Aynı dosyanın iki kez konması ya da örtüşen dönem dökümleri için tekrar ayıkla
    tablo = tablo.drop_duplicates(subset=["tarih", "aciklama", "tutar", "banka"]).reset_index(drop=True)
    tablo = tablo.sort_values("tarih").reset_index(drop=True)
    return tablo, sonuclar

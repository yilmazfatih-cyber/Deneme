"""Karşı taraf (kişi / kurum) anlamlandırma.

Akış:
  1. Açıklamadan ham karşı taraf adı çıkarılır (gürültü atılır).
  2. Benzer yazımlar bulanık eşlemeyle tek kanonik ada bağlanır.
  3. kisiler.csv'deki kullanıcı onayları her şeyin üstüne yazar.
     Yeni görülen adlar dosyaya "bekliyor" olarak eklenir; kullanıcı düzeltir.
"""

from __future__ import annotations

import re
from pathlib import Path

import pandas as pd
from rapidfuzz import fuzz, process

from .metin import anlamli_kelimeler, buyuk, sade

KISILER_SUTUNLAR = ["ham_ad", "kanonik_ad", "tur", "onay", "ornek_aciklama"]

# "GÖNDEREN: AHMET YILMAZ", "ALICI AD: ...", "AYŞE KAYA - KİRA" gibi kalıplar
_ETIKETLI = re.compile(
    r"(?:GONDEREN|ALICI|ALAN|AD SOYAD|UNVAN|KARSI TARAF|KIME|KIMDEN)\s*[:\-]?\s*([A-Z][A-Z ]{3,60}?)(?=\s+(?:[A-Z]+\s*:|TR\d|\d)|$)"
)

KURUM_IPUCLARI = {"AS", "LTD", "STI", "TIC", "SAN", "SIRKETI", "LIMITED", "ANONIM", "HOLDING",
                  "MARKET", "MAGAZA", "MAGAZACILIK", "GIDA", "TEKSTIL", "INSAAT", "ENERJI",
                  "ILETISIM", "TELEKOM", "BANKASI", "SIGORTA", "BELEDIYE", "BELEDIYESI",
                  "UNIVERSITESI", "HASTANESI", "ECZANESI", "RESTORAN", "CAFE", "KAFE"}

TRANSFER_IPUCLARI = {"EFT", "FAST", "HAVALE", "TRANSFER", "VIRMAN", "GONDEREN", "ALICI"}


def _ad_cikar_ham(aciklama: str) -> str:
    s = sade(aciklama)
    m = _ETIKETLI.search(s)
    if m:
        kelimeler = [k for k in m.group(1).split() if k.isalpha() and len(k) > 1]
        if kelimeler:
            return " ".join(kelimeler[:4])
    kelimeler = anlamli_kelimeler(aciklama)
    if not kelimeler:
        return ""
    # Ad soyad genelde ilk 2-4 kelime; kurum adında da ilk 3 kelime yeterli ayırt eder
    return " ".join(kelimeler[:3])


def _tur_tahmin(ham_ad: str, aciklama: str, kurum_ipucu: bool = False) -> str:
    """kurum_ipucu: satır bir kart ekstresinden geliyorsa ya da bir kategori kuralı
    (fatura, market, abonelik...) ona uyduysa karşı taraf kurumdur."""
    if kurum_ipucu:
        return "kurum"
    s = sade(aciklama)
    kelimeler = set(s.split())
    if kelimeler & KURUM_IPUCLARI:
        return "kurum"
    if "POS" in kelimeler or "HARCAMA" in kelimeler:
        return "kurum"
    if kelimeler & TRANSFER_IPUCLARI and 2 <= len(ham_ad.split()) <= 4:
        return "kisi"
    # Transfer ipucu yoksa ve iki kelimelik "AD SOYAD" görünümündeyse kişi say
    if len(ham_ad.split()) in (2, 3) and all(len(k) >= 3 for k in ham_ad.split()):
        return "kisi"
    return "kurum"


def _bulanik_birlestir(adlar: list[str], esik: int = 88) -> dict[str, str]:
    """Benzer ham adları en sık görülen/uzun olanına bağlar."""
    esleme: dict[str, str] = {}
    kanonikler: list[str] = []
    for ad in adlar:
        if not ad:
            esleme[ad] = ""
            continue
        if ad in esleme:
            continue
        if kanonikler:
            aday = process.extractOne(ad, kanonikler, scorer=fuzz.token_set_ratio, score_cutoff=esik)
            if aday:
                esleme[ad] = aday[0]
                continue
        kanonikler.append(ad)
        esleme[ad] = ad
    return esleme


def _kisileri_yukle(yol: Path) -> pd.DataFrame:
    if yol.exists():
        k = pd.read_csv(yol, dtype=str, encoding="utf-8-sig").fillna("")
        for s in KISILER_SUTUNLAR:
            if s not in k.columns:
                k[s] = ""
        return k[KISILER_SUTUNLAR]
    return pd.DataFrame(columns=KISILER_SUTUNLAR)


def karsi_taraflari_bul(tablo: pd.DataFrame, kisiler_yolu: Path,
                        kurum_ipucu: pd.Series | None = None) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Tabloya karsi_taraf, karsi_taraf_turu, karsi_taraf_onay sütunlarını ekler.

    kurum_ipucu: satır bazında bool; True ise karşı taraf kurum sayılır.
    Dönüş: (zenginleşmiş tablo, güncel kisiler tablosu)
    """
    tablo = tablo.copy()
    tablo["ham_ad"] = tablo["aciklama"].map(_ad_cikar_ham)
    if kurum_ipucu is None:
        kurum_ipucu = pd.Series(False, index=tablo.index)
    # Bir ham ad herhangi bir satırda kurum ipucu aldıysa her yerde kurumdur
    kurum_adlar = set(tablo.loc[kurum_ipucu.values, "ham_ad"]) - {""}

    # Sıklığa göre sırala ki kanonik ad en sık görülen yazım olsun
    sayim = tablo["ham_ad"].value_counts()
    sirali = [a for a in sayim.index if a]
    otomatik = _bulanik_birlestir(sirali)

    kisiler = _kisileri_yukle(kisiler_yolu)
    kullanici = {r.ham_ad: r for r in kisiler.itertuples(index=False) if r.ham_ad}

    kanonik_list, tur_list, onay_list = [], [], []
    yeni_kayitlar: list[dict] = []
    gorulen_yeni: set[str] = set()
    ornekler = tablo.groupby("ham_ad")["aciklama"].first().to_dict()

    for ham, aciklama in zip(tablo["ham_ad"], tablo["aciklama"]):
        ipucu = ham in kurum_adlar
        if not ham:
            kanonik_list.append("")
            tur_list.append("")
            onay_list.append("")
            continue
        if ham in kullanici and kullanici[ham].onay.strip().lower() in {"evet", "e", "ok", "tamam"}:
            k = kullanici[ham]
            kanonik_list.append(buyuk(k.kanonik_ad or ham))
            tur_list.append(k.tur or "kisi")
            onay_list.append("onaylı")
            continue
        kanonik = otomatik.get(ham, ham)
        # Kanonik ad kullanıcı tarafından onaylanmışsa onun adını ve türünü miras al
        if kanonik in kullanici and kullanici[kanonik].onay.strip().lower() in {"evet", "e", "ok", "tamam"}:
            k = kullanici[kanonik]
            kanonik_list.append(buyuk(k.kanonik_ad or kanonik))
            tur_list.append(k.tur or "kisi")
            onay_list.append("türetilmiş")
        else:
            kanonik_list.append(kanonik)
            tur_list.append(_tur_tahmin(ham, aciklama, ipucu))
            onay_list.append("bekliyor")
        if ham not in kullanici and ham not in gorulen_yeni:
            gorulen_yeni.add(ham)
            yeni_kayitlar.append({
                "ham_ad": ham,
                "kanonik_ad": kanonik,
                "tur": _tur_tahmin(ham, aciklama, ipucu),
                "onay": "bekliyor",
                "ornek_aciklama": str(ornekler.get(ham, ""))[:120],
            })

    tablo["karsi_taraf"] = kanonik_list
    tablo["karsi_taraf_turu"] = tur_list
    tablo["karsi_taraf_onay"] = onay_list

    if yeni_kayitlar:
        kisiler = pd.concat([kisiler, pd.DataFrame(yeni_kayitlar)], ignore_index=True)
    kisiler = kisiler.drop_duplicates(subset=["ham_ad"], keep="first")
    # Kişiler üstte: kullanıcının asıl düzelteceği satırlar bunlar
    kisiler = kisiler.sort_values(["tur", "onay", "ham_ad"], ascending=[True, True, True]).reset_index(drop=True)
    kisiler.to_csv(kisiler_yolu, index=False, encoding="utf-8-sig")
    return tablo, kisiler

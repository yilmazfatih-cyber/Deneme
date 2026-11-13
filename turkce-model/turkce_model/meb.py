"""MEB soru verisi: TurkishMMLU (Hugging Face) ve Açık Öğretim Lisesi (AÖL) soru kitapçıkları (yerel PDF).

İki kaynak aynı ``Soru`` biçimine dönüştürülür:

* **TurkishMMLU** (Yüksel vd., EMNLP 2024 Findings): MEB'in EBA platformundaki lise sorularından derlenmiş
  beş seçenekli sorular. ``mmlu_indir`` Hugging Face'teki herkese açık alt kümeyi sabit bir sürümden indirir
  (9 ders × (5 dev + 100 test) = 945 kayıt; dev ile test'te iki kez geçen bir soru atılınca 944 soru).
* **AÖL soru kitapçıkları**: ``pdf_ayristir`` bilgisayardaki bir kitapçığı okur; soruları, seçenekleri ve
  kitapçığın sonundaki cevap anahtarını eşleştirir. Şekil/tablo gerektiren ya da PDF'ten düzgün
  çıkarılamayan sorular nedeni kaydedilerek elenir.

Hukuki not: ``odsgm.meb.gov.tr`` ve ``www.meb.gov.tr`` robots.txt dosyaları yapay zekâ tarayıcılarını (GPTBot,
ClaudeBot, ChatGPT-User, Google-Extended, CCBot…) yasaklar; ``cdn.eba.gov.tr`` bütün botları yasaklar.
Bu yüzden bu modülde MEB ya da EBA sitelerinden indirme yapan hiçbir kod yoktur ve eklenmemelidir:
kitapçıkları tarayıcınla elle indirip bir klasöre koy, modül yalnızca yerel PDF dosyalarını okur.
Kitapçıkların her hakkı MEB'e aittir: çıkarılan soruları yalnızca kişisel araştırmada kullan; depoya
koyma, paylaşma.
"""

from __future__ import annotations

import bisect
import difflib
import json
import re
import statistics
import time
import zlib
from collections import Counter, defaultdict
from collections.abc import Callable, Iterable
from dataclasses import asdict, dataclass, field, fields
from itertools import pairwise
from pathlib import Path, PurePosixPath
from typing import NamedTuple
from urllib.parse import quote

from .metin import baslik, buyuk, kucuk, normallestir

__all__ = [
    "HARFLER",
    "VARSAYILAN_HARIC_DERSLER",
    "Soru",
    "bol",
    "cevap_metni",
    "istem",
    "mmlu_indir",
    "pdf_ayristir",
    "pdf_dosyalari",
    "pdf_klasoru_ayristir",
    "soru_metni",
    "soru_oku",
    "soru_yaz",
]

HARFLER = "ABCDE"
BOLUMLER = ("egitim", "dogrulama", "test")
KAYNAK_MMLU = "turkishmmlu"
KAYNAK_PDF = "meb-pdf"


@dataclass
class Soru:
    """Çoktan seçmeli tek soru. ``cevap`` doğru seçeneğin sırasıdır (0 = A)."""

    # kararlı, benzersiz: "mmlu:Biology:test:17", "pdf:<dosya>:<ders_kodu>:<ders_kisa>:<no>"; <dosya> klasör
    # ayrıştırmasında alt klasörü de içerir ("pdf:2025/1-oturum:111:din-kul-ve-ahl-bil-1:3")
    kimlik: str
    kaynak: str  # "turkishmmlu" | "meb-pdf"
    ders: str  # gösterim ve istem için Türkçe ders adı: "Biyoloji", "Din Kültürü ve Ahlak Bilgisi - 1"
    # Soru kökü. Satır sonu yalnızca öncül listelerinde ("I. …\nII. …", "• …\n• …"), birden çok soruya ait
    # ortak yönerge/parçadan sonra ve seçeneklerin hemen üstündeki tablo başlığından ("Neden / Sonuç") önce.
    soru: str
    secenekler: list[str]  # "A) " öneki olmadan
    cevap: int
    bolum: str = ""  # "egitim" | "dogrulama" | "test"; ``bol`` doldurur
    ek: dict = field(default_factory=dict)  # üst veri: sayfa, ders_kodu, dosya…


_ALANLAR = frozenset(f.name for f in fields(Soru))


# --------------------------------------------------------------------------------------------
# JSONL ve istem biçimi
# --------------------------------------------------------------------------------------------


def soru_yaz(sorular: Iterable[Soru], yol: Path) -> int:
    """Soruları JSONL olarak yazar (önce geçici dosyaya, sonra yerine taşır); yazılan soru sayısını verir."""
    yol = Path(yol)
    yol.parent.mkdir(parents=True, exist_ok=True)
    gecici = yol.with_name(yol.name + ".yaziliyor")
    n = 0
    with gecici.open("w", encoding="utf-8") as f:
        for s in sorular:
            f.write(json.dumps(asdict(s), ensure_ascii=False) + "\n")
            n += 1
    gecici.replace(yol)
    return n


def soru_oku(yol: Path) -> list[Soru]:
    """``soru_yaz`` ile yazılmış JSONL dosyasını okur (bilinmeyen alanlar yok sayılır)."""
    yol = Path(yol)
    sorular: list[Soru] = []
    with yol.open(encoding="utf-8") as f:
        for no, satir in enumerate(f, 1):
            if not satir.strip():
                continue
            try:
                kayit = json.loads(satir)
            except json.JSONDecodeError as e:
                raise ValueError(f"{yol}:{no}: geçersiz JSON satırı ({e})") from e
            sorular.append(Soru(**{k: v for k, v in kayit.items() if k in _ALANLAR}))
    return sorular


def istem(s: Soru) -> str:
    """Cevapsız istem: ``"Ders: …\\nSoru: …\\nA) …\\nB) …\\nC) …\\nD) …[\\nE) …]\\nCevap:"``."""
    if not 2 <= len(s.secenekler) <= len(HARFLER):
        raise ValueError(
            f"{s.kimlik}: seçenek sayısı 2 ile {len(HARFLER)} arasında olmalı ({len(s.secenekler)})"
        )
    satirlar = [f"Ders: {s.ders}", f"Soru: {s.soru}"]
    satirlar += [f"{HARFLER[i]}) {secenek}" for i, secenek in enumerate(s.secenekler)]
    satirlar.append("Cevap:")
    return "\n".join(satirlar)


def cevap_metni(s: Soru, i: int) -> str:
    """``i``. seçeneğin istemden sonraki devamı: ``" C) metin"`` (baştaki boşluk dahil)."""
    return f" {HARFLER[i]}) {s.secenekler[i]}"


def soru_metni(s: Soru) -> str:
    """İstem + doğru cevap: eğitimde modelin gördüğü tam metin."""
    return istem(s) + cevap_metni(s, s.cevap)


# --------------------------------------------------------------------------------------------
# Metin yardımcıları
# --------------------------------------------------------------------------------------------

_BOSLUKLAR = re.compile(r"[^\S\n]+")  # satır sonu dışındaki boşluklar
# Denetim karakterleri (satır sonu ve sekme hariç). InDesign'ın "buraya kadar girinti" işareti PDF'te \x07
# olarak kalır ("• \x07Zarla çevrili").
_KONTROL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")
# Boşluk doldurma çizgisi: PDF'te "- - - -", TurkishMMLU'da "----". Tek biçime ("----") indirilir.
_DOLDURMA = re.compile(r"(?<![\w-])-(?: -){2,}(?![\w-])")
# Öncül: "I. …", "II) …", "(III) …" ya da madde işaretli "• …" — soru kökünde yalnızca bunların önünde
# satır sonu kalır.
_ROMEN = r"(?:I{1,3}|IV|VI{0,3}|IX|X)"
_ROMEN_DEGERI = {"I": 1, "II": 2, "III": 3, "IV": 4, "V": 5, "VI": 6, "VII": 7, "VIII": 8, "IX": 9, "X": 10}
_MADDE_ISARETLERI = "•●▪■◦‣"
_ONCUL = re.compile(rf"^(?:\(?{_ROMEN}\s?[.)]|[{_MADDE_ISARETLERI}])\s")
_ROMEN_ONCUL = re.compile(rf"^({_ROMEN})\s?[.)]\s")  # "I. …", "II) …"
_PARANTEZLI_ONCUL = re.compile(rf"^\(({_ROMEN})\)\s")  # "(III) …"
_PARANTEZLI_ISARET = re.compile(rf"\({_ROMEN}\)")  # metnin herhangi bir yerinde "(III)"
_MADDE = re.compile(rf"^[{_MADDE_ISARETLERI}]\s")


def _tek_satir(metin: str) -> str:
    """normallestir + bütün boşlukları (satır sonları dahil) tek boşluğa indirir."""
    return _DOLDURMA.sub("----", re.sub(r"\s+", " ", normallestir(_KONTROL.sub("", metin))).strip())


def _duzle(metin: str) -> str:
    """normallestir + boşluk toparlama. Satır sonu yalnızca numaralı öncüllerin (I., II., …) önünde ve öncül
    listesinden sonra büyük harfle başlayan satırda ("Buna göre…") korunur; geri kalanı dizgi kırılımıdır."""
    sonuc = ""
    oncul_listesi = False
    for satir in normallestir(_KONTROL.sub("", metin)).split("\n"):
        satir = _BOSLUKLAR.sub(" ", satir).strip()
        if not satir:
            continue
        oncul = bool(_ONCUL.match(satir))
        yeni_satir = bool(sonuc) and (oncul or (oncul_listesi and satir[:1].isupper()))
        sonuc = f"{sonuc}\n{satir}" if yeni_satir else f"{sonuc} {satir}".strip()
        if oncul:
            oncul_listesi = True
        elif yeni_satir:
            oncul_listesi = False
    return _DOLDURMA.sub("----", sonuc)


def _tekrar_anahtari(metin: str) -> str:
    """Kesin karşılaştırma anahtarı: Türkçe küçük harf, boşluksuz; işaretler (+ - = < > ^ ° % parantez)
    korunur.

    ``normallestir`` tırnak ve tire biçimlerini zaten birleştirir. "x + 2 = 5" ile "x - 2 = 5" farklıdır.
    """
    return re.sub(r"\s+", "", kucuk(normallestir(metin)))


def _bolme_anahtari(metin: str) -> str:
    """Kaba anahtar: Türkçe küçük harf, yalnızca harf/rakamlar, ayraçsız.

    Aynı kökün farklı dizilmiş kopyaları ("sosyo-ekonomik" / satır sonunda birleşmiş "sosyoekonomik", farklı
    boşluk ya da tırnak) aynı anahtarı alır; bölme ve değerlendirme sızıntısı denetimi bunu kullanır.
    """
    return "".join(re.findall(r"\w+", kucuk(normallestir(metin))))


def _soru_anahtari(s: Soru) -> str:
    """Tekrar ayıklama anahtarı: kök + sıralı seçenekler (seçenek sırası farklı kitapçıklar da eşleşir)."""
    return "\n".join([_tekrar_anahtari(s.soru), *sorted(_tekrar_anahtari(x) for x in s.secenekler)])


# --------------------------------------------------------------------------------------------
# Eğitim / doğrulama / test ayrımı
# --------------------------------------------------------------------------------------------


def bol(
    sorular: list[Soru], oranlar: tuple[float, float, float] = (0.8, 0.1, 0.1), tohum: str = ""
) -> list[Soru]:
    """Soruları kararlı biçimde eğitim / doğrulama / test bölümlerine ayırır.

    Bölüm, ``tohum`` + soru kökünün kaba anahtarının (yalnız harf/rakam, ayraçsız) CRC32'sine göre seçilir:
    aynı soru her çalıştırmada, hangi dosyadan gelirse ve satırları nasıl kırılmış olursa olsun aynı bölüme
    düşer; kökü aynı sorular (ör. iki kitapçıkta tekrar eden soru) birbirinden ayrılmaz. Kök + seçenekleri
    aynı olan tekrarlar atılır (ilki kalır); bu karşılaştırma işaretleri korur, yalnız işaretle ayrılan
    sorular ("x + 2 = 5" / "x - 2 = 5") tekrar sayılmaz. ``bolum`` alanını doldurur ve tekrarsız listeyi
    döndürür.
    """
    if len(oranlar) != 3 or any(o < 0 for o in oranlar) or sum(oranlar) <= 0:
        raise ValueError(f"oranlar üç negatif olmayan sayı olmalı: {oranlar}")
    toplam = float(sum(oranlar))
    sinir1 = oranlar[0] / toplam
    sinir2 = (oranlar[0] + oranlar[1]) / toplam
    gorulen: set[str] = set()
    sonuc: list[Soru] = []
    for s in sorular:
        anahtar = _soru_anahtari(s)
        if anahtar in gorulen:
            continue
        gorulen.add(anahtar)
        h = zlib.crc32((tohum + _bolme_anahtari(s.soru)).encode("utf-8")) / 2**32
        s.bolum = BOLUMLER[0] if h < sinir1 else BOLUMLER[1] if h < sinir2 else BOLUMLER[2]
        sonuc.append(s)
    return sonuc


# --------------------------------------------------------------------------------------------
# TurkishMMLU (Hugging Face)
# --------------------------------------------------------------------------------------------

# Veri kümesinin sabitlenmiş sürümü (Hugging Face commit'i, 2025-02-09): kaynak değişse ya da yeniden
# sıralansa da kimlikler ve sayılar aynı kalır. Bu sürümde 945 kaydın hepsi geçerlidir; Chemistry dev:1 ile
# test:11 aynı sorudur (ikincisi atılır).
MMLU_SURUM = "fcbe5bb19af2714186fdd5752671e0748efa0024"
MMLU_URL = (
    "https://huggingface.co/datasets/AYueksel/TurkishMMLU/resolve/"
    + MMLU_SURUM
    + "/{bolum}/TurkishMMLU_{ders}.json"
)
MMLU_DERSLERI = {
    "Biology": "Biyoloji",
    "Chemistry": "Kimya",
    "Geography": "Coğrafya",
    "History": "Tarih",
    "Mathematics": "Matematik",
    "Philosophy": "Felsefe",
    "Physics": "Fizik",
    "Religion and Ethics": "Din Kültürü ve Ahlak Bilgisi",
    "Turkish Language and Literature": "Türk Dili ve Edebiyatı",
}
# "turkishmmlu_sub.json" kullanılmaz: test bölümünün kopyasıdır.
MMLU_BOLUMLERI = ("dev", "test")
KULLANICI_AJANI = "turkce-model/0.1 (kisisel arastirma betigi)"
_DENEME = 3


def mmlu_indir(hedef: Path, yaz: Callable[[str], object] = print) -> list[Soru]:
    """TurkishMMLU'nun herkese açık alt kümesini (``MMLU_SURUM`` sürümü, 945 kayıt) indirir, ``hedef`` JSONL
    dosyasına yazar.

    Kimlik ``mmlu:<Ders_adı>:<dev|test>:<sıra>`` biçimindedir (sıra dosyadaki 0 tabanlı konum, ders adındaki
    boşluklar ``_`` olur). ``ek`` alanında ``ders_en`` ve ``bolum_kaynak`` (``dev``/``test``) bulunur;
    ``bolum`` boş kalır, ``bol`` doldurur. Kök + seçenekleri aynı olan tekrarlar atılır (ilki kalır), yoksa
    değerlendirmede iki kez sayılırlar. Okunamayan kayıt varsa ya da hiç soru çıkmazsa hiçbir şey yazılmaz,
    ``RuntimeError`` atılır: değerlendirme kümesi sessizce küçülmemelidir.
    """
    import requests

    yaz(f"TurkishMMLU indiriliyor ({len(MMLU_DERSLERI) * len(MMLU_BOLUMLERI)} dosya, huggingface.co)…")
    sorular: list[Soru] = []
    bozuk: list[str] = []
    gorulen: set[str] = set()
    tekrar = 0
    for ders_en, ders in MMLU_DERSLERI.items():
        for kaynak_bolum in MMLU_BOLUMLERI:
            url = MMLU_URL.format(bolum=kaynak_bolum, ders=quote(ders_en))
            veri = _json_indir(requests, url, f"{ders_en} / {kaynak_bolum}")
            for sira, kayit in enumerate(veri):
                s = _mmlu_sorusu(kayit, ders_en, ders, kaynak_bolum, sira)
                if s is None:
                    bozuk.append(f"{ders_en}/{kaynak_bolum}:{sira}")
                    continue
                anahtar = _soru_anahtari(s)
                if anahtar in gorulen:
                    tekrar += 1
                    continue
                gorulen.add(anahtar)
                sorular.append(s)
    if bozuk or not sorular:
        ornek = ", ".join(bozuk[:5]) + (" …" if len(bozuk) > 5 else "")
        raise RuntimeError(
            f"TurkishMMLU beklenen biçimde değil: {len(bozuk)} kayıt okunamadı"
            + (f" ({ornek})" if bozuk else "")
            + f", {len(sorular)} soru çıktı. Sürüm: {MMLU_SURUM}. {hedef} yazılmadı."
        )
    n = soru_yaz(sorular, hedef)
    yaz(f"TurkishMMLU: {n} soru → {hedef}" + (f" ({tekrar} tekrar atıldı)" if tekrar else ""))
    return sorular


def _bekleme_suresi(hata: Exception, deneme: int) -> float:
    """Yeniden denemeden önce beklenecek süre (sn): 429 yanıtındaki ``Retry-After`` (en çok 60) ya da 2, 4…"""
    yanit = getattr(hata, "response", None)
    deger = getattr(yanit, "headers", {}).get("Retry-After") if yanit is not None else None
    try:
        return min(max(float(deger), 0.0), 60.0) if deger is not None else 2.0 * (deneme + 1)
    except (TypeError, ValueError):  # tarih biçimli Retry-After
        return 2.0 * (deneme + 1)


def _json_indir(requests, url: str, ad: str) -> list:
    """JSON listesi indirir; bağlantı hatası, zaman aşımı, 429 ve 5xx yanıtlarda birkaç kez yeniden dener.

    JSON çözümleme ağ denemelerinin dışındadır: 200 dönüp JSON olmayan yanıt (HTML hata sayfası, araya giren
    giriş sayfası) yeniden denenmez ve bağlantı hatası diye bildirilmez. (requests ≥ 2.27'de
    ``JSONDecodeError`` hem ``RequestException`` hem ``ValueError`` alt sınıfıdır.)
    """
    son_hata: Exception | None = None
    for deneme in range(_DENEME):
        try:
            yanit = requests.get(url, timeout=(15, 120), headers={"User-Agent": KULLANICI_AJANI})
            yanit.raise_for_status()
        except requests.RequestException as e:
            son_hata = e
            durum = getattr(getattr(e, "response", None), "status_code", None)
            if durum is not None and durum < 500 and durum != 429:  # 404 vb.: yeniden denemek işe yaramaz
                break
            if deneme + 1 < _DENEME:
                time.sleep(_bekleme_suresi(e, deneme))
            continue
        try:
            veri = yanit.json()
        except ValueError as e:
            raise RuntimeError(f"TurkishMMLU dosyası okunamadı ({ad}): geçerli JSON değil ({e}).") from e
        if not isinstance(veri, list):
            raise RuntimeError(
                f"TurkishMMLU dosyasının biçimi beklenmedik ({ad}): soru listesi bekleniyordu."
            )
        return veri
    raise RuntimeError(
        f"TurkishMMLU indirilemedi ({ad}): {son_hata}. İnternet bağlantını ve huggingface.co erişimini "
        "denetleyip yeniden dene."
    ) from son_hata


def _mmlu_cevabi(cevap: object, secenek_sayisi: int) -> int | None:
    """``"C"`` (harf) ya da ``2`` (0 tabanlı sıra) → sıra; geçersizse ``None``."""
    if isinstance(cevap, int) and not isinstance(cevap, bool):
        return cevap if 0 <= cevap < secenek_sayisi else None
    harf = str(cevap or "").strip().upper()
    return HARFLER.index(harf) if len(harf) == 1 and harf in HARFLER[:secenek_sayisi] else None


def _mmlu_sorusu(kayit: object, ders_en: str, ders: str, kaynak_bolum: str, sira: int) -> Soru | None:
    if not isinstance(kayit, dict):
        return None
    soru = _duzle(str(kayit.get("question") or ""))
    secenekler = [_tek_satir(str(c)) for c in kayit.get("choices") or []]
    if not soru or not 2 <= len(secenekler) <= len(HARFLER) or not all(secenekler):
        return None
    cevap = _mmlu_cevabi(kayit.get("answer"), len(secenekler))
    if cevap is None:
        return None
    return Soru(
        kimlik=f"mmlu:{ders_en.replace(' ', '_')}:{kaynak_bolum}:{sira}",
        kaynak=KAYNAK_MMLU,
        ders=ders,
        soru=soru,
        secenekler=secenekler,
        cevap=cevap,
        ek={"ders_en": ders_en, "bolum_kaynak": kaynak_bolum},
    )


# --------------------------------------------------------------------------------------------
# AÖL kitapçığı (yerel PDF)
# --------------------------------------------------------------------------------------------

# Atlanacak derslerin adlarında geçen parçalar (Türkçe büyük harf). Yabancı dil soruları Türkçe modele
# yaramaz; Osmanlı Türkçesi soruları Arap harfli metin içerir.
VARSAYILAN_HARIC_DERSLER: tuple[str, ...] = (
    "İNGİLİZCE",
    "ALMANCA",
    "FRANSIZCA",
    "ARAPÇA",
    "RUSÇA",
    "İTALYANCA",
    "İSPANYOLCA",
    "ÇİNCE",
    "JAPONCA",
    "KORECE",
    "FARSÇA",
    "OSMANLI TÜRKÇESİ",
)

# Elenme nedenleri
YABANCI_DIL = "yabanci_dil"  # VARSAYILAN_HARIC_DERSLER'deki bir ders
HARIC_DERS = "haric_ders"  # kullanıcının eklediği başka bir hariç ders
CEVAP_YOK = "cevap_yok"  # cevap anahtarında yok ya da iptal (harf dışı / iki harfli cevap)
GORSEL_GEREKLI = "gorsel_gerekli"  # kök şekil, tablo, grafik… gerektiriyor
SECENEK_EKSIK = "secenek_eksik"  # seçenek sayısı kitapçıktaki olağan sayıdan farklı
BOZUK_DUZEN = (
    "bozuk_duzen"  # PDF düzeni metne düzgün dönüşmemiş (şekil etiketleri, kesirler, şifreli yazı tipi)
)

_KENAR_BANDI = 0.12  # sayfa yüksekliğinin üst/alt bu kadarlık kısmında başlık ve sayfa numarası aranır
_PARAGRAF_ARALIGI = 0.25  # satır yüksekliğinin bu katından büyük dikey boşluk yeni paragraf sayılır
_UST_SIMGE_ORANI = 0.85  # gövde yazısından bu oranda küçük üst simgeler "^(…)" olarak yazılır
_KUCUK_YAZI_ORANI = 0.8  # gövde yazısından bu oranda küçük AYRI satır: kopmuş alt/üst simge ya da etiket
_HUCRE_ARALIGI = 6.0  # aynı satırdaki iki parça arasında bundan geniş boşluk (pt): tablo hücresi
# Seçenekler başladıktan sonra aynı sütunda satır yüksekliğinin bu katından uzak satır soruya ait değildir.
# Gerçek kitapçıkta seçenek satırları arasındaki en büyük boşluk ~4 kattır (şekilli sorularda); kitapçık
# sonu uyarısı 34 kat aşağıdadır.
_KAPANMA_ARALIGI = 3.0
# En uzun seçenek ortancanın bu katından uzunsa (ve en az şu kadar harfse) seçeneğe başka metin taşmıştır.
_UZUN_SECENEK_ORANI = 4.0
_UZUN_SECENEK_EN_AZ = 40

_DERS_BASLIGI = re.compile(r"^\((\d{3})\)\s*(.*)$")  # "(111) DİN KÜL. VE AHL. BİL. - 1"
# Birden çok soruya ait yönerge (küçük harfe çevrilmiş metinde): "4 - 5. soruları aşağıdaki parçaya göre
# cevaplayınız.", "1 - 9. sorularda boş bırakılan yere…", "6, 7 ve 8. sorular…". 1. grup ilk, 2. grup son
# soru numarasıdır.
_GRUP_YONERGESI = re.compile(r"^(\d{1,2})\s*\.?(?:\s*(?:-|,|ve|ile)\s*(\d{1,2})\s*\.?)+\s*soru")
# Kitapçığın sonundaki uyarı (büyük harfe çevrilmiş metinde): soruya ait değildir.
_SINAV_SONU = re.compile(r"^(?:(?:TEST|SINAV|OTURUM)\s+BİTTİ\b.*|CEVAPLARINIZI\s+KONTROL\s+EDİNİZ\.?)$")
# Arap harfli yazı (Osmanlı Türkçesi, ayet metinleri): sağdan sola yazı PDF'ten görsel sırayla, ters çıkar.
_ARAP_YAZISI = re.compile("[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufefc]")
_KALIN_YAZI_TIPI = re.compile(r"bold|black|heavy", re.IGNORECASE)
_SEVIYE = re.compile(r"-\s*\d{1,2}$")  # başlığın sonu: kısa çizgi + düzey numarası
_SORU_BASI = re.compile(r"^(\d{1,2})\.(?:\s+(.*))?$")  # "1.  Aşağıdaki…"
_TEK_HANELI_SORU = re.compile(r"^[1-9]\.(?:\s|$)")
_SECENEK = re.compile(r"(?:(?<=\s)|^)([A-E])\)\s*")
_SECENEK_ISARETI = re.compile(r"[A-E]\)")
_ISARET = re.compile(r"^\(?(?:[A-Ea-e]|I{1,3}|IV|VI{0,3}|IX|X|\d{1,2})[.)]$")  # tek başına madde işareti
_KONUSMA_CIZGISI = re.compile(r"^[-–—]\s")
_CEVAP_SATIRI = re.compile(r"^(\d{1,2})\s*[.)]\s*(\S.*)$")  # anahtar: "1.  C"
_CEVAP_ANAHTARI = re.compile(r"CEVAP\s+ANAHTAR")
# Harfleri Unicode'a yanlış eşlenen MathMagic denklem yazı tipleri (ör. π → "r", ⇌ → "D"). Yalnızca
# MMTimes* (=, +, - gibi sıradan karakterler) güvenilirdir.
_SIFRELI_YAZI_TIPI = re.compile(r"^MM(?!Times)")
_ASCII = str.maketrans("çğıöşüâîû", "cgiosuaiu")


@dataclass
class _Parca:
    """PDF'teki tek metin satırı (pymupdf "line")."""

    sayfa: int  # 1'den başlar
    x0: float
    y0: float
    x1: float
    y1: float
    metin: str
    boyut: float  # baskın yazı boyutu (pt)
    egik: bool = False  # döndürülmüş metin: şekil etiketi
    sifreli: bool = False  # harf eşlemesi güvenilmez denklem yazı tipi
    kucuk: bool = False  # gövde yazısından belirgin biçimde küçük
    kalin: bool = False  # harflerinin çoğu kalın yazı tipinde (MEB kitapçıklarında soru cümlesi kalındır)

    @property
    def yc(self) -> float:
        return (self.y0 + self.y1) / 2

    @property
    def h(self) -> float:
        return max(self.y1 - self.y0, 1.0)


@dataclass
class _Satir:
    """Bir sütunda aynı yükseklikteki parçalar (soldan sağa): okuma sırasının birimi."""

    sayfa: int
    sutun: int
    parcalar: list[_Parca]
    metin: str
    hucreli: bool = False  # geniş boşluklarla ayrılmış tablo hücreleri içeriyor

    @property
    def x0(self) -> float:
        return min(p.x0 for p in self.parcalar)

    @property
    def y0(self) -> float:
        return min(p.y0 for p in self.parcalar)

    @property
    def y1(self) -> float:
        return max(p.y1 for p in self.parcalar)

    @property
    def h(self) -> float:
        return max(p.h for p in self.parcalar)

    @property
    def kalin(self) -> bool:
        kalin = sum(len(p.metin) for p in self.parcalar if p.kalin)
        return 2 * kalin > sum(len(p.metin) for p in self.parcalar)


class _GovdeSatiri(NamedTuple):
    """Soru kökünün (ya da ortak metnin) bir satırı."""

    metin: str
    yeni_paragraf: bool  # üstündeki satırdan dikey boşlukla ayrılmış
    kalin: bool = False
    hucreli: bool = False  # tablo hücreleri ("Birleştirici İlke / Ayırıcı İlke")


@dataclass
class _OrtakMetin:
    """Birden çok soruya ait yönerge ve parça ("4 - 5. soruları aşağıdaki parçaya göre cevaplayınız.")."""

    ilk: int
    son: int
    govde: list[_GovdeSatiri] = field(default_factory=list)
    satirlar: list[_Satir] = field(default_factory=list)


@dataclass
class _HamSoru:
    no: int
    sayfa: int
    govde: list[_GovdeSatiri] = field(default_factory=list)
    secenekler: list[list[str]] = field(default_factory=list)
    # Sorunun alanındaki satırlar (şekil ve düzen denetimi için). Metni soruya girmeyen kopuk satırlar da
    # (seçeneklerden çok aşağıdaki yazı) buradadır.
    satirlar: list[_Satir] = field(default_factory=list)
    ortak: _OrtakMetin | None = None


@dataclass
class _Bolum:
    """Kitapçıkta bir dersin soruları (ya da cevap anahtarındaki karşılığı)."""

    kod: str
    baslik: str  # normalleştirilmiş başlık: "DİN KÜL. VE AHL. BİL. - 1"
    sayfa: int
    sorular: list[_HamSoru] = field(default_factory=list)
    cevaplar: dict[int, int | None] = field(default_factory=dict)


# ---- metin çıkarma ------------------------------------------------------------------------------

_UST_SIMGE_TEMIZ = re.compile(r"\s+")  # ince boşluklar (U+2009, U+202F …) dahil


def _span_metni(spanlar: list[dict], govde_boyutu: float) -> str:
    """Satırın span'larını birleştirir; gerçek üst simgeleri (küçük ve yükseltilmiş) ``^(…)`` ile yazar.

    MEB kitapçıklarında üs ve iyon yükleri ayrı span'lardır ("10" + "-" + "4"); düz birleştirme "10-4"
    gibi anlamı bozan metin üretir. Ardışık üst simge span'ları tek gruptur: "10^(-4)", "Ca^(2+)", "cm^(2)".
    """
    metin = ""
    ust = ""
    for s in spanlar:
        t = s["text"]
        if s["flags"] & 1 and t.strip() and s["size"] < _UST_SIMGE_ORANI * govde_boyutu:
            ust += t
            continue
        if ust:
            metin += f"^({_UST_SIMGE_TEMIZ.sub('', ust)})"
            ust = ""
        metin += t
    if ust:
        metin += f"^({_UST_SIMGE_TEMIZ.sub('', ust)})"
    return metin


def _parca_metni(ham: str) -> str:
    m = _KONTROL.sub("", ham.replace("\t", " ")).rstrip()
    if m.endswith("\xad"):  # satır sonundaki yumuşak tire hecelemedir; normal tireye çevrilir
        m = m[:-1] + "-"
    return re.sub(r" {2,}", " ", m.replace("\xad", "")).strip()


def _kalin_mi(span: dict) -> bool:
    """Span kalın yazı tipinde mi? (pymupdf bayrağı 16 ya da yazı tipi adında "Bold" / "Black" / "Heavy")"""
    return bool(span["flags"] & 16 or _KALIN_YAZI_TIPI.search(span["font"]))


def _sayfa_parcalari(sozluk: dict, no: int, govde_boyutu: float) -> list[_Parca]:
    """pymupdf ``get_text("dict")`` çıktısından sayfanın metin satırları."""
    sonuc: list[_Parca] = []
    for blok in sozluk["blocks"]:
        for satir in blok.get("lines", ()):
            dolu = [s for s in satir["spans"] if s["text"].strip()]
            if not dolu:
                continue
            metin = _parca_metni(_span_metni(satir["spans"], govde_boyutu))
            if not metin:
                continue
            baskin = max(dolu, key=lambda s: len(s["text"].strip()))
            kalin = sum(len(s["text"].strip()) for s in dolu if _kalin_mi(s))
            x0, y0, x1, y1 = satir["bbox"]
            sonuc.append(
                _Parca(
                    sayfa=no,
                    x0=x0,
                    y0=y0,
                    x1=x1,
                    y1=y1,
                    metin=metin,
                    boyut=baskin["size"],
                    egik=abs(satir["dir"][1]) > 0.2,  # ~12°'den fazla dönük
                    sifreli=any(_SIFRELI_YAZI_TIPI.match(s["font"]) for s in dolu),
                    kucuk=baskin["size"] < _KUCUK_YAZI_ORANI * govde_boyutu,
                    kalin=2 * kalin > sum(len(s["text"].strip()) for s in dolu),
                )
            )
    return sonuc


def _govde_boyutu(sozlukler: Iterable[dict]) -> float:
    """Belgedeki en yaygın yazı boyutu (karakter ağırlıklı)."""
    sayac: Counter[float] = Counter()
    for sozluk in sozlukler:
        for blok in sozluk["blocks"]:
            for satir in blok.get("lines", ()):
                for s in satir["spans"]:
                    sayac[round(s["size"], 1)] += len(s["text"].strip())
    return sayac.most_common(1)[0][0] if sayac else 10.0


# ---- sayfa düzeni -------------------------------------------------------------------------------


def _kenar_anahtari(p: _Parca, yukseklik: float) -> tuple | None:
    """Üst/alt kenar bandındaki satırın konum + metin imzası (rakamlar tek simgeye indirgenir).

    İçerik olduğu belli satırlar (ders başlığı, seçenek, tek başına soru numarası ya da madde işareti, ortak
    soru yönergesi) imza almaz: bant sütun başlarının ilk satırlarını da kapsar ve kısa bir kitapçıkta iki
    sayfanın aynı yerinde "A) Su" ya da "(111) …" durabilir. "1. OTURUM" soru başına benzediği için soru
    başları dışlanmaz; onları sayfa sayısına göre eşik ayıklar.
    """
    if p.y1 <= _KENAR_BANDI * yukseklik:
        bant = "ust"
    elif p.y0 >= (1 - _KENAR_BANDI) * yukseklik:
        bant = "alt"
    else:
        return None
    t = normallestir(p.metin)
    if _DERS_BASLIGI.match(t) or _SECENEK.match(t) or _ISARET.match(t) or _GRUP_YONERGESI.match(kucuk(t)):
        return None
    return bant, round(p.y0), round(p.y1), re.sub(r"\d+", "#", p.metin)


def _tekrarlayan_kenarlar(sayfalar: dict[int, list[_Parca]], yukseklikler: dict[int, float]) -> set[tuple]:
    """Sayfa başlığı ("1. OTURUM") ve sayfa numarası gibi her sayfada aynı yerde duran satırlar.

    İçerikle değil KONUMLA ayıklanır: üst/alt bantta aynı y aralığında, rakamları dışında aynı metinle
    sayfaların en az dörtte birinde (en az iki sayfada) ve en sık görülen kenar satırının sayfalarının en az
    %40'ında görünen satırlar; en sık kenar satırı en çok 4 sayfadaysa (kısa belge) onun sayfalarının
    hepsinde.
    Gerçek sayfa başlığı soru sayfalarının hepsindedir; aynı yere denk gelen içerik satırları ("1. Aşağıdaki…"
    sütun başında) birkaç sayfada kalır, şekillerdeki sayılar da her sayfada aynı yerde durmaz.
    """
    sayac: Counter[tuple] = Counter()
    for no, parcalar in sayfalar.items():
        sayac.update({k for p in parcalar if (k := _kenar_anahtari(p, yukseklikler[no])) is not None})
    if not sayac:
        return set()
    dolu = sum(1 for p in sayfalar.values() if p)
    en_cok = max(sayac.values())
    esik = max(2.0, 0.25 * dolu, 0.4 * en_cok, en_cok if en_cok <= 4 else 0.0)
    return {k for k, n in sayac.items() if n >= esik}


def _sutun_sinirlari(parcalar: list[_Parca], genislik: float) -> list[float]:
    """Sütunlar arası boşlukların (oluk) orta x değerleri; tek sütunlu düzende boş liste.

    Bütün sayfalardaki satırların yatay olarak kapladığı alan sayılır; (neredeyse) hiçbir satırın geçmediği,
    en az 4 pt genişliğindeki dikey şeritler oluktur. Tek sayfa yerine belgenin tamamına bakıldığı için
    yalnızca şekil etiketleri bulunan seyrek bir sütundaki iç boşluklar oluk sanılmaz.
    """
    n = int(genislik) + 2
    fark = [0] * (n + 1)
    for p in parcalar:
        a = min(max(int(p.x0), 0), n - 1)
        b = min(max(int(p.x1), a), n - 1)
        fark[a] += 1
        fark[b + 1] -= 1
    kaplama: list[int] = []
    toplam = 0
    for d in fark[:n]:
        toplam += d
        kaplama.append(toplam)
    esik = int(0.003 * len(parcalar))  # sütunlar arasına taşan birkaç satır oluğu kapatmasın
    dolu = [x for x, k in enumerate(kaplama) if k > esik]
    if not dolu:
        return []
    sol, sag = dolu[0], dolu[-1]
    sinirlar: list[float] = []
    x = sol
    while x <= sag:
        if kaplama[x] > esik:
            x += 1
            continue
        bas = x
        while x <= sag and kaplama[x] <= esik:
            x += 1
        if x - bas >= 4:
            sinirlar.append((bas + x - 1) / 2)
    # Çok dar "sütun" çıkaran sınırları at (ör. kenara yakın seyrek bir şerit).
    en_dar = 0.1 * (sag - sol)
    temiz: list[float] = []
    for s in sinirlar:
        if s - (temiz[-1] if temiz else sol) >= en_dar and sag - s >= en_dar:
            temiz.append(s)
    return temiz


def _satir_kur(sayfa: int, sutun: int, parcalar: list[_Parca]) -> _Satir:
    """Satırın parçalarını soldan sağa birleştirir.

    Bitişik parçalar (alt/üst simge) boşluksuz, normal aralıklılar boşlukla birleşir. Aralarında geniş boşluk
    olan parçalar tablo hücreleridir ("A)  Sevgi  Nefret" → "A) Sevgi / Nefret"); seçenek ya da madde
    işaretinin ("A)", "I.", "10.") yanındaki boşluk ise hücre ayracı sayılmaz.
    """
    parcalar.sort(key=lambda p: p.x0)
    metin = ""
    hucreli = False
    onceki: _Parca | None = None
    for p in parcalar:
        if onceki is not None:
            aralik = p.x0 - onceki.x1
            if (
                aralik > _HUCRE_ARALIGI
                and not _ISARET.match(onceki.metin)
                and not _SECENEK.match(p.metin)
                and not _KONUSMA_CIZGISI.match(p.metin)  # tiyatro metni: "SALİH  - Doğru evladım."
            ):
                metin += " / "
                hucreli = True
            elif aralik > 1.0:
                metin += " "
        metin += p.metin
        onceki = p
    return _Satir(sayfa, sutun, parcalar, normallestir(metin), hucreli)


def _satirlara_ayir(parcalar: list[_Parca], sinirlar: list[float]) -> list[_Satir]:
    """Okuma sırası: sayfa → sütun (soldan sağa) → yukarıdan aşağı satır; aynı satırdakiler soldan sağa.

    Dikey merkezleri satır yüksekliğinin yarısından yakın parçalar aynı satırdır (2×2 dizilmiş seçenekler,
    kesirlerin pay/payda parçaları).
    """
    gruplar: dict[tuple[int, int], list[_Parca]] = defaultdict(list)
    for p in parcalar:
        gruplar[(p.sayfa, bisect.bisect_right(sinirlar, p.x0))].append(p)
    satirlar: list[_Satir] = []
    for sayfa, sutun in sorted(gruplar):
        mevcut: list[_Parca] = []
        for p in sorted(gruplar[(sayfa, sutun)], key=lambda p: (p.yc, p.x0)):
            if mevcut and abs(p.yc - mevcut[0].yc) <= 0.5 * min(p.h, mevcut[0].h):
                mevcut.append(p)
                continue
            if mevcut:
                satirlar.append(_satir_kur(sayfa, sutun, mevcut))
            mevcut = [p]
        if mevcut:
            satirlar.append(_satir_kur(sayfa, sutun, mevcut))
    return satirlar


# ---- ders başlıkları ----------------------------------------------------------------------------

_KISALTMALAR = (
    (re.compile(r"\bDİN KÜL\.\s*(?:VE\s+)?AHL\.\s*BİL\.?"), "DİN KÜLTÜRÜ VE AHLAK BİLGİSİ"),
    (re.compile(r"\bDİNİ BİL\.?(?=\s|$)"), "DİNİ BİLGİLER"),
    (re.compile(r"\bKÜL\."), "KÜLTÜRÜ"),
    (re.compile(r"\bAHL\."), "AHLAK"),
    (re.compile(r"\bBİL\."), "BİLGİSİ"),
    (re.compile(r"\bHAY\."), "HAYATI"),
    (re.compile(r"\bSEÇ\."), "SEÇMELİ"),
    (re.compile(r"\bEDB\."), "EDEBİYATI"),
    (re.compile(r"\bTAR\."), "TARİHİ"),
    (re.compile(r"\bMED\."), "MEDENİYETİ"),
)


def _buyuk_harfli(s: str) -> bool:
    return any(c.isalpha() for c in s) and buyuk(s) == s


def _kisaltma_ac(ad: str) -> str:
    ad = buyuk(ad)
    for desen, acik in _KISALTMALAR:
        ad = desen.sub(acik, ad)
    return re.sub(r"\s+", " ", ad).strip()


def _seviye_ayir(ders_basligi: str) -> tuple[str, str]:
    m = re.match(r"^(.*?)\s*-\s*(\d{1,2})$", ders_basligi)
    return (m.group(1), m.group(2)) if m else (ders_basligi, "")


def _ders_adi(ders_basligi: str) -> str:
    """ "DİN KÜL. VE AHL. BİL. - 1" → "Din Kültürü ve Ahlak Bilgisi - 1"."""
    ad, seviye = _seviye_ayir(ders_basligi)
    ad = baslik(_kisaltma_ac(ad))
    return f"{ad} - {seviye}" if seviye else ad


def _ad_anahtari(ders_basligi: str) -> str:
    return " ".join(re.findall(r"\w+", _kisaltma_ac(ders_basligi)))


def _kisa_ad(ders_basligi: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", kucuk(ders_basligi).translate(_ASCII)).strip("-")


def _ders_basligi(satirlar: list[_Satir], i: int) -> tuple[str, str, int] | None:
    """``satirlar[i]`` bir ders başlığıysa ``(kod, başlık, kullanılan satır sayısı)``.

    Başlık "(kod) AD - düzey" biçimindedir ve büyük harfle yazılır; sığmazsa sonraki satıra taşar
    ("(532) SEÇMELİ" + "PEYGAMBERİMİZİN HAYATI - 2"). Düzey numarasına ulaşana kadar en çok iki satır eklenir.
    """
    s = satirlar[i]
    m = _DERS_BASLIGI.match(s.metin)
    if not m:
        return None
    ad = m.group(2).strip()
    if ad and not _buyuk_harfli(ad):
        return None
    n = 1
    while not _SEVIYE.search(ad) and n < 3 and i + n < len(satirlar):
        t = satirlar[i + n]
        if (t.sayfa, t.sutun) != (s.sayfa, s.sutun) or not _buyuk_harfli(t.metin):
            break
        if _SORU_BASI.match(t.metin) or _DERS_BASLIGI.match(t.metin) or _CEVAP_SATIRI.match(t.metin):
            break
        ad = f"{ad} {t.metin}".strip()
        n += 1
    if not ad:
        return None
    return m.group(1), re.sub(r"\s+", " ", ad), n


# ---- sorular ------------------------------------------------------------------------------------


def _soru_x_konumlari(satirlar: list[_Satir]) -> dict[int, float]:
    """Her sütunda soru numaralarının (tek haneli) tipik sol kenarı.

    Soru numarası sütunun en solundadır; kökün ve seçeneklerin devam satırları içeriden başlar. Bir devam
    satırı rakamla başlasa da ("2. ayetler)") numara konumunda olmadığı için soru başı sayılmaz.
    """
    xs: dict[int, list[float]] = defaultdict(list)
    for s in satirlar:
        if _TEK_HANELI_SORU.match(s.metin):
            xs[s.sutun].append(s.x0)
    return {k: statistics.median(v) for k, v in xs.items()}


def _secenege_bol(metin: str, siradaki: int) -> list[tuple[int | None, str]]:
    """Satırı seçenek işaretlerinden ("A)", "B)" …) böler; yalnızca sıradaki harf kabul edilir.

    İlk öğenin harfi ``None``dır: işaretten önceki metin (kökün ya da önceki seçeneğin devamı).
    "C) Akarsu vadisi D) Delta ovası" gibi tek satırda birden çok seçenek de ayrılır.
    """
    parcalar: list[tuple[int | None, str]] = []
    harf: int | None = None
    bas = 0
    for m in _SECENEK.finditer(metin):
        if siradaki < len(HARFLER) and m.group(1) == HARFLER[siradaki]:
            parcalar.append((harf, metin[bas : m.start()]))
            harf, bas = siradaki, m.end()
            siradaki += 1
    parcalar.append((harf, metin[bas:]))
    return parcalar


def _govde_satiri(satir: _Satir, metin: str, yeni_paragraf: bool) -> _GovdeSatiri:
    # Satırın seçenekten önceki parçası ("…hangisidir? A) Sevgi / Nefret") hücre ayracı taşımıyorsa tablo
    # satırı sayılmaz.
    return _GovdeSatiri(metin, yeni_paragraf, satir.kalin, satir.hucreli and " / " in metin)


def _satir_ekle(soru: _HamSoru, satir: _Satir, metin: str, yeni_paragraf: bool) -> None:
    soru.satirlar.append(satir)
    for harf, parca in _secenege_bol(metin, len(soru.secenekler)):
        parca = parca.strip()
        if harf is not None:
            soru.secenekler.append([parca] if parca else [])
        elif not parca:
            continue
        elif soru.secenekler:
            soru.secenekler[-1].append(parca)
        else:
            soru.govde.append(_govde_satiri(satir, parca, yeni_paragraf))
        yeni_paragraf = False


def _secenek_basi_mi(metin: str, soru: _HamSoru) -> bool:
    """Satır sorunun SIRADAKİ seçeneğinin işaretiyle mi başlıyor? (A ve B okunmuşsa "C) …")"""
    m = _SECENEK.match(metin)
    n = len(soru.secenekler)
    return m is not None and n < len(HARFLER) and m.group(1) == HARFLER[n]


def _soru_basi_mi(satir: _Satir, no: int, onceki: _HamSoru | None, soru_x: dict[int, float]) -> bool:
    """``onceki``: bölümde başlamış son soru (metni kesilmiş olsa da numara sırası ondan sürer)."""
    beklenen = onceki.no + 1 if onceki else 1
    if not beklenen <= no <= beklenen + 2:
        return False
    sol = soru_x.get(satir.sutun)
    if sol is not None and satir.x0 > sol + 4.0:
        return False  # numara konumunda değil: kökün/seçeneğin devam satırı
    if no > beklenen:  # bir soru başı okunamamışsa numara atlanabilir, ama önceki soru tamamlanmış olmalı
        return onceki is not None and len(onceki.secenekler) >= 2
    return True


def _grup_yonergesi(satir: _Satir, onceki: _HamSoru | None) -> _OrtakMetin | None:
    """Satır sıradaki sorulara ait ortak yönergeyse ("4 - 5. soruları …") boş bir ``_OrtakMetin``.

    Yönerge, önceki soru tamamlandıktan sonra (ya da dersin başında) gelir ve sıradaki soru numarasıyla
    başlar.
    """
    m = _GRUP_YONERGESI.match(kucuk(satir.metin))
    if not m or (onceki is not None and len(onceki.secenekler) < 2):
        return None
    ilk, son = int(m.group(1)), int(m.group(2))
    beklenen = onceki.no + 1 if onceki else 1
    return _OrtakMetin(ilk, son) if ilk == beklenen and ilk < son <= ilk + 20 else None


def _sorulari_topla(satirlar: list[_Satir], soru_x: dict[int, float]) -> list[_Bolum]:
    """Satırları ders başlığı → soru numarası → seçenek durum makinesiyle bölümlere ayırır.

    Bir satır şu durumlarda sorunun metnine girmez:

    * Kitapçık sonu uyarısı ("TEST BİTTİ. CEVAPLARINIZI KONTROL EDİNİZ."): soru orada biter.
    * Birden çok soruya ait yönerge ve ardından gelen parça ("4 - 5. soruları aşağıdaki parçaya göre
      cevaplayınız."): önceki sorunun son seçeneğine eklenmez; ``_OrtakMetin`` olarak numarası aralıktaki
      sorulara bağlanır.
    * Seçenekler başladıktan sonra aynı sütunda, satır yüksekliğinin ``_KAPANMA_ARALIGI`` katından aşağıda
      gelen satır (ör. sayfa sonundaki uyarı ya da ayıklanamamış sayfa numarası): sütunun geri kalanı metne
      girmez ama şekil/düzen denetimi için sorunun satırlarında kalır. Soru sonraki sütunda (sütun değiştiren
      soru) ya da sıradaki seçenek işaretiyle ("C) …") sürer.
    """
    bolumler: list[_Bolum] = []
    bolum: _Bolum | None = None
    soru: _HamSoru | None = None  # metni yazılan soru
    son_soru: _HamSoru | None = None  # bölümde başlamış son soru (numara sırası için)
    ortak: _OrtakMetin | None = None
    ortak_topla = False  # yönergeden sonra, ilk soru başına kadar satırlar ortak metne yazılır
    kapali_sutun: tuple[int, int] | None = None  # metni kesilmiş sorunun o anki sütunu
    onceki: _Satir | None = None
    i = 0
    while i < len(satirlar):
        s = satirlar[i]
        baslik_ = _ders_basligi(satirlar, i)
        if baslik_:
            kod, ad, n = baslik_
            bolum = _Bolum(kod, ad, s.sayfa)
            bolumler.append(bolum)
            soru = son_soru = ortak = kapali_sutun = onceki = None
            ortak_topla = False
            i += n
            continue
        i += 1
        if bolum is None:
            continue  # ilk ders başlığından önceki metin
        sutun = (s.sayfa, s.sutun)
        yeni_paragraf = (
            onceki is not None
            and (onceki.sayfa, onceki.sutun) == sutun
            and s.y0 - onceki.y1 > _PARAGRAF_ARALIGI * s.h
        )
        onceki = s
        if _buyuk_harfli(s.metin) and _SINAV_SONU.match(s.metin):
            soru, ortak_topla = None, False
            continue
        yeni_ortak = _grup_yonergesi(s, son_soru)
        if yeni_ortak is not None:
            ortak, ortak_topla, soru, kapali_sutun = yeni_ortak, True, None, None
            ortak.govde.append(_govde_satiri(s, s.metin, True))
            ortak.satirlar.append(s)
            continue
        m = _SORU_BASI.match(s.metin)
        if m and _soru_basi_mi(s, int(m.group(1)), son_soru, soru_x):
            soru = son_soru = _HamSoru(no=int(m.group(1)), sayfa=s.sayfa)
            if ortak is not None and ortak.ilk <= soru.no <= ortak.son:
                soru.ortak = ortak
            ortak_topla, kapali_sutun = False, None
            bolum.sorular.append(soru)
            _satir_ekle(soru, s, m.group(2) or "", True)
            continue
        if ortak_topla and ortak is not None:
            ortak.govde.append(_govde_satiri(s, s.metin, yeni_paragraf))
            ortak.satirlar.append(s)
            continue
        if soru is None:
            continue
        if kapali_sutun is not None:
            if sutun == kapali_sutun and not _secenek_basi_mi(s.metin, soru):
                soru.satirlar.append(s)  # metne girmez; şekil/düzen denetiminde sayılır
                continue
            kapali_sutun = None
        son = soru.satirlar[-1]
        if (
            soru.secenekler
            and (son.sayfa, son.sutun) == sutun
            and s.y0 - son.y1 > _KAPANMA_ARALIGI * max(son.h, s.h)
            and not _secenek_basi_mi(s.metin, soru)
        ):
            kapali_sutun = sutun
            soru.satirlar.append(s)
            continue
        _satir_ekle(soru, s, s.metin, yeni_paragraf)
    return bolumler


# ---- cevap anahtarı -----------------------------------------------------------------------------


def _cevap_indeksi(metin: str) -> int | None:
    """Tek harfli cevap → sıra; "İPTAL", iki harf ya da başka bir şey → ``None`` (soru iptal)."""
    harf = buyuk(metin).strip().rstrip(".")
    return HARFLER.index(harf) if len(harf) == 1 and harf in HARFLER else None


def _anahtari_topla(satirlar: list[_Satir]) -> list[_Bolum]:
    anahtarlar: list[_Bolum] = []
    mevcut: _Bolum | None = None
    i = 0
    while i < len(satirlar):
        baslik_ = _ders_basligi(satirlar, i)
        if baslik_:
            kod, ad, n = baslik_
            mevcut = _Bolum(kod, ad, satirlar[i].sayfa)
            anahtarlar.append(mevcut)
            i += n
            continue
        m = _CEVAP_SATIRI.match(satirlar[i].metin)
        if m and mevcut is not None:
            mevcut.cevaplar.setdefault(int(m.group(1)), _cevap_indeksi(m.group(2)))
        i += 1
    return anahtarlar


def _anahtarla_eslestir(bolumler: list[_Bolum], anahtarlar: list[_Bolum]) -> dict[int, _Bolum]:
    """Soru bölümlerini cevap anahtarı bölümleriyle eşleştirir: ``id(bölüm) → anahtar``.

    Önce ders kodu kullanılır. Kod birden çok derste ortaksa (ör. (181) İngilizce / Almanca / Fransızca) ad
    benzerliğine (kısaltmalar açılmış adların difflib oranı) göre en iyi eşler sırayla seçilir.
    """
    kodla: dict[str, list[_Bolum]] = defaultdict(list)
    for a in anahtarlar:
        kodla[a.kod].append(a)
    adaylar: list[tuple[float, int, int, _Bolum, _Bolum]] = []
    for i, b in enumerate(bolumler):
        for j, a in enumerate(kodla.get(b.kod, ())):
            oran = difflib.SequenceMatcher(None, _ad_anahtari(b.baslik), _ad_anahtari(a.baslik)).ratio()
            adaylar.append((oran, -i, -j, b, a))
    adaylar.sort(key=lambda t: t[:3], reverse=True)
    eslesme: dict[int, _Bolum] = {}
    kullanilan: set[int] = set()
    for _, _, _, b, a in adaylar:
        if id(b) not in eslesme and id(a) not in kullanilan:
            eslesme[id(b)] = a
            kullanilan.add(id(a))
    return eslesme


# ---- soru metni ve eleme ------------------------------------------------------------------------


_Bilesikler = dict[str, set[str]]  # birleşik sözcüğün ilk yarısı → ikinci yarıları ("kütle" → {"çekim"})
_BILESIK = re.compile(r"(?<![\w-])([^\W\d_]{2,})-([^\W\d_]{2,})(?![\w-])")


def _bilesikleri_topla(satirlar: Iterable[_Satir]) -> _Bilesikler:
    """Belgede satır İÇİNDE kısa çizgiyle yazılmış birleşik sözcükler ("Kütle-çekim", "iyon-dipol").

    Satır sonunda bölünmüş aynı sözcük ("kütle-" + "çekim") heceleme sanılıp birleştirilmesin diye
    ``_satir_birlestir``e verilir. Satır sonundaki tire (ardında harf yok) burada sayılmaz.
    """
    bilesikler: _Bilesikler = defaultdict(set)
    for s in satirlar:
        for a, b in _BILESIK.findall(s.metin):
            bilesikler[kucuk(a)].add(kucuk(b))
    return dict(bilesikler)


def _bilesik_mi(ilk: str, sonraki: str, bilesikler: _Bilesikler | None) -> bool:
    if not bilesikler or kucuk(ilk) not in bilesikler:
        return False
    w = kucuk(re.match(r"[^\W\d_]*", sonraki).group())
    if len(w) < 3:
        return False
    return any(len(b) >= 3 and (w.startswith(b) or b.startswith(w)) for b in bilesikler[kucuk(ilk)])


def _satir_birlestir(onceki: str, sonraki: str, bilesikler: _Bilesikler | None = None) -> str:
    """İki satırı birleştirir; satır sonu hecelemesini geri alır.

    "bahsedil-" + "mektedir" → "bahsedilmektedir" (sonraki satır küçük harfle başlıyorsa). Gerçek kısa
    çizgiler korunur: "Türk-" + "İslam" → "Türk-İslam", "Kur'an-" + "ı Kerim" → "Kur'an-ı Kerim",
    "x-" + "y" → "x-y"; belgede satır içinde tireyle geçen birleşik sözcükler de (``bilesikler``, ör.
    "Kütle-çekim") "kütle-" + "çekim" → "kütle-çekim" olur. Boşluklu tire ("… -" ya da "- - - -") boşlukla
    birleşir.
    """
    if not onceki:
        return sonraki
    if onceki.endswith("-") and not onceki.endswith(" -") and len(onceki) >= 2:
        kelime = re.search(r"(\w+)-$", onceki)
        if (
            kelime
            and len(kelime.group(1)) >= 2
            and kelime.group(1)[-1].isalpha()
            and sonraki[:1].isalpha()
            and sonraki[:1].islower()
            and not re.match(r"[ıiuü](?:\s|$)", sonraki)  # Farsça tamlama eki: "Kur'an-ı", "Al-i"
            and not _bilesik_mi(kelime.group(1), sonraki, bilesikler)
        ):
            return onceki[:-1] + sonraki
        return onceki + sonraki
    return onceki + " " + sonraki


def _oncul_satirlari(govde: list[_GovdeSatiri]) -> set[int]:
    """Kökte öncül listesini oluşturan satırların sırası.

    * Romen rakamlı öncüller ("I. …", "II) …") I'den başlayıp birer artan, en az iki satırlık dizi olmalı:
      satır başına denk gelen "II. Abdülhamit" ya da "I. Dünya Savaşı" öncül değildir.
    * Parantezli işaretler ("(III) …") yalnızca kökteki bütün parantezli işaretler satır başındaysa öncüldür;
      cümle numaraları metnin içinde akıyorsa ("… gidebilirsiniz. (III) Isparta'da …") satır başına denk gelen
      işaret dizgi kırılımıdır, ancak üstündeki paragraf boşluğuyla ayrılmışsa öncül sayılır.
    * Madde işaretli satırlar ("• …") her zaman öncüldür.
    """
    secili: set[int] = set()
    dizi: list[int] = []
    beklenen = 0
    for i, g in enumerate(govde):
        m = _ROMEN_ONCUL.match(g.metin)
        if not m:
            continue
        deger = _ROMEN_DEGERI[m.group(1)]
        if deger == 1:
            if len(dizi) >= 2:
                secili.update(dizi)
            dizi, beklenen = [i], 2
        elif dizi and deger == beklenen:
            dizi.append(i)
            beklenen += 1
    if len(dizi) >= 2:
        secili.update(dizi)

    parantezli = [i for i, g in enumerate(govde) if _PARANTEZLI_ONCUL.match(g.metin)]
    toplam = sum(len(_PARANTEZLI_ISARET.findall(g.metin)) for g in govde)
    if len(parantezli) >= 2 and len(parantezli) == toplam:
        secili.update(parantezli)
    else:
        secili.update(i for i in parantezli if i > 0 and govde[i].yeni_paragraf)

    secili.update(i for i, g in enumerate(govde) if _MADDE.match(g.metin))
    return secili


def _govde_metni(
    govde: list[_GovdeSatiri], bilesikler: _Bilesikler | None = None, tablo_secenekli: bool = False
) -> str:
    """Kök satırlarını birleştirir; geri kalan her şey tek boşlukla birleşir, şunlar yeni satırda başlar:

    * öncüller (``_oncul_satirlari``: "I. …", "(II) …", "• …");
    * öncül listesinden sonraki paragraf: dikey boşlukla ayrılmış ya da normal yazıdan kalına geçen satır
      (MEB kitapçıklarında soru cümlesi kalındır: "IV. coğrafya" + "bilim dallarından hangileriyle…");
    * seçenekler tablo satırıysa ("A) Sevgi / Nefret", ``tablo_secenekli``) hemen üstlerindeki tablo başlığı
      ("Birleştirici İlke / Ayırıcı İlke").
    """
    oncul_satirlari = _oncul_satirlari(govde)
    sonuc = ""
    oncul_listesi = False
    onceki_kalin = False
    for i, g in enumerate(govde):
        oncul = i in oncul_satirlari
        yeni_satir = bool(sonuc) and (
            oncul
            or (oncul_listesi and (g.yeni_paragraf or (g.kalin and not onceki_kalin)))
            or (tablo_secenekli and g.hucreli and i == len(govde) - 1)
        )
        sonuc = f"{sonuc}\n{g.metin}" if yeni_satir else _satir_birlestir(sonuc, g.metin, bilesikler)
        if oncul:
            oncul_listesi = True
        elif yeni_satir:
            oncul_listesi = False
        onceki_kalin = g.kalin
    return "\n".join(t for t in (_tek_satir(s) for s in sonuc.split("\n")) if t)


def _secenek_metni(parcalar: list[str], bilesikler: _Bilesikler | None = None) -> str:
    sonuc = ""
    for p in parcalar:
        sonuc = _satir_birlestir(sonuc, p, bilesikler)
    return _tek_satir(sonuc)


# Şekil, tablo vb. gerektiren kökler. Desenler Türkçe küçük harfe çevrilmiş kökte aranır (Romen rakamları
# da küçülür: "Şekil II" → "şekil ıı").
_GORSEL_KELIMELER = re.compile(
    r"\b(?:grafi[kğ]\w*|görsel\w*|resim(?:de|deki|ler|lerde|lerdeki|den)?\b|diyagram\w*|fotoğraf\w*|"
    r"kroki\w*|histogram\w*|karikatür\w*)"
)
# "Şema" ve "çizelge" görsel olmayan anlamda da geçer ("akış şemasında … sembolle gösterimi", mantıkta
# "çözümleyici çizelge" yöntemi): yalnızca gösterilen bir şeyi anlatan kalıplarda görsel sayılır.
_SEMA_CIZELGE = re.compile(
    r"\b(?:aşağıdaki|yukarıdaki|yandaki|verilen)\s+(?:[^\s.?!]+\s+){0,2}(?:şema|çizelge)\w*"
    r"|\b(?:şema|çizelge)\w*\s+(?:[^\s.?!]+\s+){0,3}?"
    r"(?:verilmiştir|gösterilmiştir|verilmektedir|gösterilmektedir|görülmektedir|sunulmuştur)"
    r"|\b(?:şema|çizelge)(?:daki|dakiler\w*|ya göre|ye göre)\b"
    r"|\b(?:şema|çizelge)(?:da|de)\s+(?:verilen|gösterilen|görülen|belirtilen|numaral\w*|işaretlen\w*)"
    r"|(?:^|[.?!:;]\s+|\n)(?:şema|çizelge)\w*"  # cümle başında: "Şemada X ile gösterilen…"
)
# Görsel anlamı taşımayan kalıplar aramadan önce silinir.
_GORSEL_DEGIL = re.compile(r"periyodik tablo\w*|görsel sanat\w*|resim sanat\w*|çözümleyici çizelge\w*")
# Tablo: tekil biçimler ("tabloda", "tablodaki", "doğruluk tablosu"). "Ressamların tabloları" gibi resim
# anlamı, kökte resim sanatıyla ilgili bir kelime geçiyorsa sayılmaz.
_TABLO = re.compile(r"\btablo(?:da|daki|dan|ya|yu|su|sunda|sundaki|suna)?\b")
_RESIM_SANATI = re.compile(r"\b(?:ressam\w*|tuval\w*|sergi\w*|müze\w*|yağlı boya)")
# Harita her zaman görsel değildir ("1/500 000 ölçekli bir haritada 4 cm…"): yalnızca aynı cümlede bir şeyin
# gösterildiği / işaretlendiği harita.
_HARITA = re.compile(
    r"\bharitadaki\b|\b(?:aşağıdaki|yukarıdaki|verilen)\s+harita\w*|"
    r"\bharita\w*[^.?!]{0,80}?\b(?:gösteril|işaret|numara|harf|taral|taran|görül|belirtil)\w*"
)
# Altı çizili / koyu / eğik yazılmış sözcükleri soran sorular: biçim düz metne geçmez.
_BICIM_GEREKLI = re.compile(
    r"\baltı\s+çiz(?:ili|ilmiş|ilen)\b|\b(?:koyu|eğik|yatık|italik)\s+(?:yazıl\w*|renkle\w*|harfle\w*|basıl\w*)"
)
# "Şekil" hem "figür" hem "biçim" demektir: "en berrak şekilde", "olacak şekilde", "şekil bakımından" figür
# değildir. Figür anlamı yalnızca şu kalıplarda aranır:
_SEKIL = re.compile(
    r"\bşekil(?:deki|lerdeki|lerde|ler|leri|lere|lerden|den)\b"  # "şekildeki", "şekillerde"
    r"|\bşekil\s*-?\s*(?:[ıivx]+|\d+)\b"  # "Şekil II", "şekil 1"
    r"|\b(?:aşağıdaki|yukarıdaki|yandaki|verilen)\s+şekil(?:de|e|i)?\b"
    r"|\bşekil(?:de|e)?\s+(?:verilen|gösterilen|görülen|belirtilen|işaretlen\w*|numaral\w*|çizilen|yer alan)"
    r"|(?:^|[.?!:;]\s+|\n)şekil(?:de|e)?\b"  # cümle başında: "Şekilde K noktası…"
    r"|\bşekle göre\b"
)


def _gorsel_gerekli(kok: str) -> bool:
    """Kök bir şekil, tablo, grafik, harita… ya da altı çizili/koyu yazılmış söz gerektiriyor mu?"""
    k = _GORSEL_DEGIL.sub(" ", kucuk(kok))
    if any(d.search(k) for d in (_GORSEL_KELIMELER, _SEMA_CIZELGE, _HARITA, _SEKIL, _BICIM_GEREKLI)):
        return True
    return bool(_TABLO.search(k)) and not _RESIM_SANATI.search(k)


_Kutu = tuple[float, float, float, float]


def _kesisir(a: _Kutu, b: _Kutu) -> bool:
    return a[0] < b[2] and a[2] > b[0] and a[1] < b[3] and a[3] > b[1]


def _satir_gruplari(ham: _HamSoru) -> list[list[_Satir]]:
    """Sorunun satırları ve (varsa) bağlı olduğu ortak yönerge/parçanın satırları, ayrı ayrı."""
    return [ham.satirlar] + ([ham.ortak.satirlar] if ham.ortak is not None else [])


def _sekil_var(ham: _HamSoru, cizimler: dict[int, list[_Kutu]], resimler: dict[int, list[_Kutu]]) -> bool:
    """Sorunun kapladığı alanda şekil var mı? (Kökte "şekil" geçmese de: "…modeller verilmiştir.")

    Alan, sorunun (ve bağlı olduğu ortak parçanın) her sayfa/sütundaki satırlarını içine alan dikdörtgendir.
    Bir resim (raster) ya da en az 4 dolu vektör çizim (kutu, eğri, ok) şekil sayılır. İnce çizgiler (alt
    çizgi, ayraç) sayılmaz: düz metin sorularında da bulunurlar; yalnızca metin içeren sorularda en çok 2 dolu
    çizim (ör. alıntı çerçevesi) görülür.
    """
    toplam = 0
    for satir_grubu in _satir_gruplari(ham):
        gruplar: dict[tuple[int, int], list[_Satir]] = defaultdict(list)
        for s in satir_grubu:
            gruplar[(s.sayfa, s.sutun)].append(s)
        for (sayfa, _), satirlar in gruplar.items():
            x0 = min(s.x0 for s in satirlar) - 3.0
            x1 = max(p.x1 for s in satirlar for p in s.parcalar) + 3.0
            y0, y1 = min(s.y0 for s in satirlar), max(s.y1 for s in satirlar)
            alan = (x0, y0, x1, y1)
            if any(_kesisir(k, alan) for k in resimler.get(sayfa, ())):
                return True
            toplam += sum(1 for k in cizimler.get(sayfa, ()) if _kesisir(k, alan))
    return toplam >= 4


def _bozuk_mu(ham: _HamSoru, secenekler: list[str]) -> bool:
    """PDF düzeni metne düzgün dönüşmemiş mi? (Şekilden bağımsız, düzenin kendisine bakar.)

    * Boş seçenek: seçenek bir resimdir ya da metni başka yere dağılmıştır.
    * Bir seçenek ötekilerden çok uzun (ortancanın 4 katından uzun ve en az 40 harf): seçeneğe soruya ait
      olmayan metin (başka bir ders, ortak parça) eklenmiştir.
    * Döndürülmüş metin: grafik ekseni ya da şekil etiketi.
    * Şifreli denklem yazı tipi: MathMagic yazı tiplerinde harfler yanlış karaktere eşlenir (π → "r").
    * Gövde yazısından çok küçük AYRI satır: satırından kopmuş alt/üst simge ("SO4" + "2-") ya da etiket.
    * En az iki "kırıntı" (en çok 2 karakterlik ayrı satır; soru numarası ya da madde işareti sayılmaz):
      şekil etiketleri, tablo hücreleri ya da alt alta yazılmış kesirlerin pay/paydası ("A) 2" + "1"). Düz
      metin sorularında böyle satır olmaz.
    * Yalnızca rakamdan oluşan bir seçenek ve yanında tek rakam kırıntısı: kesrin bir parçası kopmuş.
    * Hücreleri alt satıra taşan tablo: satır satır okununca iki sütunun metni birbirine karışır.
      (Tek satırlık hücreler sorun değildir: "A) Sevgi / Nefret".)
    """
    if any(not s for s in secenekler):
        return True
    uzunluklar = [len(s) for s in secenekler]
    en_uzun = max(uzunluklar)
    if en_uzun >= _UZUN_SECENEK_EN_AZ and en_uzun > _UZUN_SECENEK_ORANI * statistics.median(uzunluklar):
        return True
    for satir_grubu in _satir_gruplari(ham):
        for a, b in pairwise(satir_grubu):
            if (
                a.hucreli
                and (a.sayfa, a.sutun) == (b.sayfa, b.sutun)
                and not _SECENEK.match(b.metin)
                and b.y0 - a.y1 <= _PARAGRAF_ARALIGI * b.h
            ):
                return True
    kirinti = sayisal_kirinti = 0
    for satir_grubu in _satir_gruplari(ham):
        for satir in satir_grubu:
            for p in satir.parcalar:
                if p.egik or p.sifreli or p.kucuk:
                    return True
                t = p.metin.replace(" ", "")
                if len(t) <= 2 and not (_SECENEK_ISARETI.fullmatch(t) or _ISARET.match(t)):
                    kirinti += 1
                    sayisal_kirinti += t.isdigit()
    if kirinti >= 2:
        return True
    return sayisal_kirinti >= 1 and any(re.fullmatch(r"[-+]?\d+", s) for s in secenekler)


def _haric_eslesmesi(bolum: _Bolum, haric_dersler: Iterable[str]) -> str | None:
    """``haric_dersler``den bölüme uyan ilk öğe: ders kodu ("111", "(111)") ya da kısaltmalı başlıkta veya
    kısaltmaları açılmış adda geçen parça ("DİN KÜL.", "DİN KÜLTÜRÜ", "din kültürü ve ahlak")."""
    adlar = (buyuk(bolum.baslik), _kisaltma_ac(bolum.baslik))
    for h in haric_dersler:
        aranan = re.sub(r"\s+", " ", buyuk(normallestir(h or ""))).strip()
        if not aranan:
            continue
        if aranan.strip("()") == bolum.kod or any(aranan in ad for ad in adlar):
            return h
    return None


# ---- ayrıştırma ---------------------------------------------------------------------------------


@dataclass
class _Belge:
    parcalar: dict[int, list[_Parca]]
    boyutlar: dict[int, tuple[float, float]]  # sayfa → (genişlik, yükseklik)
    cizimler: dict[int, list[_Kutu]]  # dolu vektör çizimler (ince çizgiler hariç)
    resimler: dict[int, list[_Kutu]]
    sayfa_sayisi: int


def _sayfa_cizimleri(sayfa) -> list[_Kutu]:
    """Sayfadaki vektör çizimlerin kutuları. İnce çizgiler (sütun ayracı, alt çizgi, boşluk çizgisi) ve
    sayfanın yarısından büyük zeminler şekil sayılmaz."""
    alan = sayfa.rect.width * sayfa.rect.height
    kutular: list[_Kutu] = []
    for yol in sayfa.get_drawings():
        r = yol["rect"]
        if r.width >= 1.5 and r.height >= 1.5 and r.width * r.height < 0.5 * alan:
            kutular.append((r.x0, r.y0, r.x1, r.y1))
    return kutular


def _sayfa_resimleri(sayfa) -> list[_Kutu]:
    kutular: list[_Kutu] = []
    for bilgi in sayfa.get_image_info():
        x0, y0, x1, y1 = bilgi["bbox"]
        if (x1 - x0) * (y1 - y0) >= 20.0:  # piksel boyutundaki süsler sayılmaz
            kutular.append((x0, y0, x1, y1))
    return kutular


def _pymupdf():
    """pymupdf modülü; kurulu değilse anlaşılır bir ``RuntimeError``."""
    try:
        import pymupdf
    except ImportError as e:
        raise RuntimeError("PDF okumak için pymupdf gerekli: pip install -e \".[pdf]\"") from e
    return pymupdf


def _belgeyi_oku(pdf: Path) -> _Belge:
    pymupdf = _pymupdf()
    try:
        belge = pymupdf.open(pdf)
    except Exception as e:  # pymupdf bozuk dosyada kendi hata türlerini atar
        raise ValueError(f"PDF açılamadı: {pdf} ({e})") from e
    with belge:
        if not belge.is_pdf:  # pymupdf HTML, resim, metin… dosyalarını da açar
            raise ValueError(f"PDF değil: {pdf} (uzantısı .pdf ama içeriği başka bir biçimde)")
        if belge.needs_pass and not belge.authenticate(""):
            raise ValueError(f"PDF parola korumalı, açılamadı: {pdf}")
        bayrak = pymupdf.TEXT_PRESERVE_WHITESPACE | pymupdf.TEXT_MEDIABOX_CLIP  # bitişik harfler (ﬁ) açılır
        sozlukler = {no: sayfa.get_text("dict", flags=bayrak) for no, sayfa in enumerate(belge, 1)}
        boyutlar = {no: (sayfa.rect.width, sayfa.rect.height) for no, sayfa in enumerate(belge, 1)}
        cizimler = {no: _sayfa_cizimleri(sayfa) for no, sayfa in enumerate(belge, 1)}
        resimler = {no: _sayfa_resimleri(sayfa) for no, sayfa in enumerate(belge, 1)}
        sayfa_sayisi = belge.page_count
    govde = _govde_boyutu(sozlukler.values())
    parcalar = {no: _sayfa_parcalari(s, no, govde) for no, s in sozlukler.items()}
    return _Belge(parcalar, boyutlar, cizimler, resimler, sayfa_sayisi)


def _anahtar_sayfasi_mi(parcalar: list[_Parca], yukseklik: float) -> bool:
    """Cevap anahtarı sayfası: üst kısmında "CEVAP ANAHTARI" başlığı olan sayfa."""
    ust = " ".join(p.metin for p in parcalar if p.y0 < 0.2 * yukseklik)
    return bool(_CEVAP_ANAHTARI.search(buyuk(ust)))


def _anahtar_govdesi(parcalar: list[_Parca]) -> list[_Parca]:
    """Anahtar sayfasının sayfa başlığı ("… CEVAP ANAHTARI") dışındaki satırları.

    Ortalanmış başlık satırları sütun aralıklarının üstünden geçer ve sütun bulmayı bozar; ilk ders başlığı ya
    da cevap satırının üstünde kalan her şey başlık sayılır.
    """
    govde = [
        p for p in parcalar if _DERS_BASLIGI.match(normallestir(p.metin)) or _CEVAP_SATIRI.match(p.metin)
    ]
    if not govde:
        return []
    ust = min(p.y0 for p in govde) - 1.0
    return [p for p in parcalar if p.y0 >= ust]


def _ayristir(pdf: Path) -> tuple[list[_Bolum], list[_Bolum], _Belge, dict]:
    """Kitapçığı soru bölümlerine ve cevap anahtarı bölümlerine ayırır (eleme yapmadan)."""
    belge = _belgeyi_oku(pdf)
    parcalar, boyutlar = belge.parcalar, belge.boyutlar
    yukseklikler = {no: h for no, (_, h) in boyutlar.items()}
    genislik = max((w for w, _ in boyutlar.values()), default=0.0)

    anahtar_sayfalari = [no for no, p in parcalar.items() if p and _anahtar_sayfasi_mi(p, yukseklikler[no])]
    adaylar = {no: p for no, p in parcalar.items() if p and no not in anahtar_sayfalari}

    # Sayfa başlığı ve numarası konumla ayıklanır. Bunları taşıyan sayfalar soru sayfasıdır; kapak (ders
    # dizini + adaylara açıklamalar) ve arka kapak bu yüzden soru olarak okunmaz.
    kenarlar = _tekrarlayan_kenarlar(adaylar, yukseklikler)
    soru_parcalari: list[_Parca] = []
    soru_sayfalari: list[int] = []
    for no, ps in sorted(adaylar.items()):
        imzalar = [_kenar_anahtari(p, yukseklikler[no]) for p in ps]
        if kenarlar and not any(k in kenarlar for k in imzalar):
            continue
        soru_sayfalari.append(no)
        soru_parcalari += [p for p, k in zip(ps, imzalar, strict=True) if k not in kenarlar]

    satirlar = _satirlara_ayir(soru_parcalari, _sutun_sinirlari(soru_parcalari, genislik))
    bolumler = _sorulari_topla(satirlar, _soru_x_konumlari(satirlar))

    anahtar_parcalari = [p for no in anahtar_sayfalari for p in _anahtar_govdesi(parcalar[no])]
    anahtar_satirlari = _satirlara_ayir(anahtar_parcalari, _sutun_sinirlari(anahtar_parcalari, genislik))
    anahtarlar = _anahtari_topla(anahtar_satirlari)
    bilgi = {"soru_sayfalari": soru_sayfalari, "anahtar_sayfalari": anahtar_sayfalari, "satirlar": satirlar}
    return bolumler, anahtarlar, belge, bilgi


def _olagan_secenek(sorular: list[_HamSoru], genel: int) -> int:
    """Dersin olağan seçenek sayısı: dersin (en az 3) sorusunun yarısından çoğunda görülen sayı, yoksa
    kitapçığın genel değeri. Dört seçenekli bir kitapçıktaki beş seçenekli ders böylece bütünüyle elenmez."""
    sayac = Counter(len(s.secenekler) for s in sorular if len(s.secenekler) >= 2)
    toplam = sum(sayac.values())
    if toplam >= 3:
        n, adet = sayac.most_common(1)[0]
        if 2 * adet > toplam:
            return n
    return genel


def _kimlik_adi(dosya_adi: str) -> str:
    """Kimlikteki dosya parçası: uzantısız (göreli) yol, ":" → "_" ("2025/1-oturum.pdf" → "2025/1-oturum")."""
    return PurePosixPath(dosya_adi).with_suffix("").as_posix().replace(":", "_")


def pdf_ayristir(
    pdf: Path,
    haric_dersler: Iterable[str] = VARSAYILAN_HARIC_DERSLER,
    yaz: Callable[[str], object] = print,
    dosya_adi: str | None = None,
) -> tuple[list[Soru], dict]:
    """Bir AÖL soru kitapçığını (sonunda cevap anahtarı olan PDF) ayrıştırır.

    Döndürür: (tutulan sorular, rapor). Rapor: ``dosya``, ``ders_sayisi``, ``bulunan``, ``tutulan``,
    ``elenen`` (neden → sayı), ``dersler`` (ders → ``{"kod", "bulunan", "tutulan"}``) ve tanı alanları
    (``anahtarsiz_dersler``, ``sorusuz_anahtarlar``, ``farkli_sayili_dersler``…).

    ``haric_dersler``: atlanacak dersler; ders kodu ("111") ya da başlıkta veya kısaltmaları açılmış adda
    geçen parça ("İNGİLİZCE", "Din Kültürü"). ``dosya_adi``: kimlikte, ``ek["dosya"]``da ve raporda görünen ad
    (varsayılan: dosyanın adı); ``pdf_klasoru_ayristir`` klasöre göre göreli yolu verir, böylece farklı
    klasörlerdeki aynı adlı kitapçıkların kimlikleri çakışmaz.

    Birden çok soruya ait yönerge ve parça ("4 - 5. soruları aşağıdaki parçaya göre cevaplayınız.") o
    soruların her birinin kökünün başına eklenir (ayrı satırda).

    Elenme nedenleri: ``yabanci_dil`` / ``haric_ders`` (``haric_dersler``deki dersler), ``cevap_yok``
    (anahtarda yok ya da iptal), ``gorsel_gerekli`` (kök şekil/tablo/grafik/harita ya da altı çizili söz
    istiyor ya da sorunun alanında şekil var), ``secenek_eksik`` (seçenek sayısı dersin ya da kitapçığın
    olağan sayısından farklı), ``bozuk_duzen`` (şekil etiketleri, kopuk kesirler, şifreli yazı tipi, taşan
    tablo hücreleri, seçeneğe taşmış metin, Arap harfli yazı).
    """
    pdf = Path(pdf)
    ad = dosya_adi or pdf.name
    kimlik_adi = _kimlik_adi(ad)
    haric = tuple(haric_dersler)
    varsayilan_haric = {buyuk(h) for h in VARSAYILAN_HARIC_DERSLER}
    bolumler, anahtarlar, belge, bilgi = _ayristir(pdf)
    bilesikler = _bilesikleri_topla(bilgi["satirlar"])

    # Hiçbir sorusunda seçenek bulunmayan bölümler gerçek ders değildir (ör. dizin satırları); yok sayılır.
    bolumler = [b for b in bolumler if any(len(s.secenekler) >= 2 for s in b.sorular)]
    eslesme = _anahtarla_eslestir(bolumler, anahtarlar)
    secenek_sayilari = Counter(
        len(s.secenekler) for b in bolumler for s in b.sorular if len(s.secenekler) >= 2
    )
    genel_secenek = secenek_sayilari.most_common(1)[0][0] if secenek_sayilari else 4

    tutulan: list[Soru] = []
    elenen: Counter[str] = Counter()
    dersler: dict[str, dict] = {}
    kisa_adlar: Counter[tuple[str, str]] = Counter()
    for b in bolumler:
        ders = _ders_adi(b.baslik)
        haric_ad = _haric_eslesmesi(b, haric)
        anahtar = eslesme.get(id(b))
        olagan_secenek = _olagan_secenek(b.sorular, genel_secenek)
        kisa = _kisa_ad(b.baslik)
        kisa_adlar[(b.kod, kisa)] += 1
        if kisa_adlar[(b.kod, kisa)] > 1:  # aynı ders kitapçıkta iki kez geçerse kimlikler çakışmasın
            kisa = f"{kisa}-{kisa_adlar[(b.kod, kisa)]}"
        ozet = {"kod": b.kod, "bulunan": len(b.sorular), "tutulan": 0}
        dersler[ders if ders not in dersler else f"{ders} ({b.kod})"] = ozet
        for ham in b.sorular:
            secenekler = [_secenek_metni(p, bilesikler) for p in ham.secenekler]
            tablo_secenekli = bool(secenekler) and all(" / " in s for s in secenekler)
            kendi_govdesi = _govde_metni(ham.govde, bilesikler, tablo_secenekli)
            govde = kendi_govdesi
            if ham.ortak is not None:
                govde = "\n".join(t for t in (_govde_metni(ham.ortak.govde, bilesikler), govde) if t)
            cevap = anahtar.cevaplar.get(ham.no) if anahtar else None
            if haric_ad:
                neden = YABANCI_DIL if buyuk(haric_ad) in varsayilan_haric else HARIC_DERS
            elif cevap is None:
                neden = CEVAP_YOK
            elif _gorsel_gerekli(govde) or _sekil_var(ham, belge.cizimler, belge.resimler):
                neden = GORSEL_GEREKLI
            elif len(secenekler) != olagan_secenek or cevap >= len(secenekler):
                neden = SECENEK_EKSIK
            elif (
                not kendi_govdesi
                or _ARAP_YAZISI.search(govde + "".join(secenekler))
                or _bozuk_mu(ham, secenekler)
            ):
                neden = BOZUK_DUZEN
            else:
                neden = None
            if neden:
                elenen[neden] += 1
                continue
            ozet["tutulan"] += 1
            tutulan.append(
                Soru(
                    kimlik=f"pdf:{kimlik_adi}:{b.kod}:{kisa}:{ham.no}",
                    kaynak=KAYNAK_PDF,
                    ders=ders,
                    soru=govde,
                    secenekler=secenekler,
                    cevap=cevap,
                    ek={
                        "dosya": ad,
                        "sayfa": ham.sayfa,
                        "ders_kodu": b.kod,
                        "ders_basligi": b.baslik,
                        "soru_no": ham.no,
                    },
                )
            )

    soru_sayilari = Counter(len(b.sorular) for b in bolumler)
    olagan_soru = soru_sayilari.most_common(1)[0][0] if soru_sayilari else 0
    eslesen_anahtarlar = {id(a) for a in eslesme.values()}
    rapor = {
        "dosya": ad,
        "sayfa_sayisi": belge.sayfa_sayisi,
        "soru_sayfasi": len(bilgi["soru_sayfalari"]),
        "anahtar_sayfasi": len(bilgi["anahtar_sayfalari"]),
        "ders_sayisi": len(bolumler),
        "anahtar_ders_sayisi": len(anahtarlar),
        "bulunan": sum(len(b.sorular) for b in bolumler),
        "tutulan": len(tutulan),
        "elenen": dict(sorted(elenen.items())),
        "dersler": dersler,
        "anahtarsiz_dersler": [f"({b.kod}) {b.baslik}" for b in bolumler if id(b) not in eslesme],
        # Anahtarda olup soruları bulunamayan dersler: başlığı ya da 1. sorusu okunamamış olabilir.
        "sorusuz_anahtarlar": [
            f"({a.kod}) {a.baslik}" for a in anahtarlar if id(a) not in eslesen_anahtarlar
        ],
        "farkli_sayili_dersler": {
            f"({b.kod}) {b.baslik}": len(b.sorular) for b in bolumler if len(b.sorular) != olagan_soru
        },
    }
    yaz(_rapor_satiri(rapor))
    if belge.sayfa_sayisi and not any(belge.parcalar.values()):
        yaz(f"  Uyarı: {ad} içinde hiç metin yok; taranmış (resim) bir PDF olabilir, önce OCR gerekir.")
    elif not anahtarlar:
        yaz(f"  Uyarı: {ad} içinde cevap anahtarı bulunamadı; bütün sorular cevapsız sayıldı.")
    elif rapor["anahtarsiz_dersler"]:
        yaz(f"  Uyarı: cevap anahtarında bulunamayan dersler: {', '.join(rapor['anahtarsiz_dersler'])}")
    if rapor["sorusuz_anahtarlar"]:
        yaz(
            "  Uyarı: cevap anahtarında olup soruları bulunamayan dersler: "
            + ", ".join(rapor["sorusuz_anahtarlar"])
        )
    if rapor["farkli_sayili_dersler"]:
        farkli = ", ".join(f"{d}: {n}" for d, n in rapor["farkli_sayili_dersler"].items())
        yaz(f"  Uyarı: soru sayısı olağan ({olagan_soru}) değerden farklı dersler: {farkli}")
    return tutulan, rapor


def _rapor_satiri(rapor: dict) -> str:
    elenen = ", ".join(f"{k} {v}" for k, v in rapor["elenen"].items()) or "yok"
    return (
        f"{rapor['dosya']}: {rapor['ders_sayisi']} ders, {rapor['bulunan']} soru bulundu, "
        f"{rapor['tutulan']} tutuldu (elenen: {elenen})"
    )


def pdf_dosyalari(klasor: Path) -> list[Path]:
    """``klasor`` altındaki (alt klasörler dahil) PDF dosyaları, sıralı. Uzantı büyük/küçük harf duyarsız
    (".pdf", ".PDF"); klasör yoksa boş liste."""
    klasor = Path(klasor)
    if not klasor.is_dir():
        return []
    return sorted(p for p in klasor.rglob("*") if p.is_file() and p.suffix.lower() == ".pdf")


def pdf_klasoru_ayristir(
    klasor: Path,
    hedef: Path,
    yaz: Callable[[str], object] = print,
    haric_dersler: Iterable[str] = VARSAYILAN_HARIC_DERSLER,
    haric_kokler: Iterable[str] = (),
) -> dict:
    """``klasor`` altındaki bütün PDF'leri (alt klasörler dahil, sıralı) ayrıştırıp ``hedef`` JSONL'e yazar.

    Aynı soru birden çok kitapçıkta geçebilir (ör. farklı kitapçık türleri): normalleştirilmiş kök +
    seçeneklere göre tekrarlar atılır, ilki kalır. Kimlik ve ``ek["dosya"]`` klasöre göre göreli yolu taşır
    (alt klasörlerdeki aynı adlı kitapçıklar çakışmaz). ``haric_dersler`` ``pdf_ayristir``e geçer.
    ``haric_kokler``: kökü bunlardan biriyle aynı olan sorular yazılmaz (ör. TurkishMMLU kökleri:
    değerlendirme sorusu eğitime sızmasın); sayısı raporda ``haric_kok``.

    Okunamayan dosyalar atlanır ve raporda belirtilir. Klasörde PDF yoksa (``FileNotFoundError``), pymupdf
    kurulu değilse ya da hiçbir PDF okunamadıysa (``RuntimeError``) ``hedef``e dokunulmaz: önceki çıktı boş
    bir dosyayla ezilmez.
    """
    klasor, hedef = Path(klasor), Path(hedef)
    if not klasor.is_dir():
        raise FileNotFoundError(f"Klasör bulunamadı: {klasor}")
    dosyalar = pdf_dosyalari(klasor)
    if not dosyalar:
        raise FileNotFoundError(
            f"{klasor} içinde PDF bulunamadı. Kitapçıkları tarayıcınla indirip bu klasöre koy."
        )
    _pymupdf()  # kurulu değilse her dosya için ayrı ayrı "okunamadı" demek yerine hemen dur
    haric = tuple(haric_dersler)
    haric_anahtarlar = {k for k in map(_bolme_anahtari, haric_kokler) if k}
    tum: list[Soru] = []
    gorulen: set[str] = set()
    rapor: dict = {
        "dosya_sayisi": len(dosyalar),
        "dosyalar": {},
        "bulunan": 0,
        "tutulan": 0,
        "tekrar": 0,
        "haric_kok": 0,
    }
    elenen: Counter[str] = Counter()
    hatali = 0
    for pdf in dosyalar:
        ad = pdf.relative_to(klasor).as_posix()
        try:
            sorular, r = pdf_ayristir(pdf, haric, yaz=lambda m: yaz("  " + m), dosya_adi=ad)
        except Exception as e:  # noqa: BLE001 — bozuk ya da kitapçık olmayan PDF: diğerleri yine işlensin
            hatali += 1
            rapor["dosyalar"][ad] = {"hata": f"{type(e).__name__}: {e}"}
            yaz(f"  {ad}: okunamadı ({type(e).__name__}: {e})")
            continue
        rapor["dosyalar"][ad] = r
        rapor["bulunan"] += r["bulunan"]
        rapor["tutulan"] += r["tutulan"]
        elenen.update(r["elenen"])
        for s in sorular:
            if _bolme_anahtari(s.soru) in haric_anahtarlar:
                rapor["haric_kok"] += 1
                continue
            anahtar = _soru_anahtari(s)
            if anahtar in gorulen:
                rapor["tekrar"] += 1
                continue
            gorulen.add(anahtar)
            tum.append(s)
    if hatali == len(dosyalar):
        raise RuntimeError(f"{klasor} içindeki {hatali} PDF'in hiçbiri okunamadı; {hedef} yazılmadı.")
    cift = [k for k, n in Counter(s.kimlik for s in tum).items() if n > 1]
    if cift:  # kimlik dosya yolu + ders + numaradan kurulur; çakışma bir hata demektir
        raise RuntimeError(f"Aynı kimlikli farklı sorular: {', '.join(cift[:3])}; {hedef} yazılmadı.")
    rapor["elenen"] = dict(sorted(elenen.items()))
    rapor["hatali_dosya"] = hatali
    rapor["yazilan"] = soru_yaz(tum, hedef)
    elenen_metni = ", ".join(f"{k} {v}" for k, v in rapor["elenen"].items()) or "yok"
    haric_metni = f", {rapor['haric_kok']} değerlendirme sorusuyla aynı" if rapor["haric_kok"] else ""
    yaz(
        f"{len(dosyalar)} PDF ({hatali} okunamadı): {rapor['bulunan']} soru bulundu, "
        f"{rapor['tutulan']} tutuldu (elenen: {elenen_metni}); {rapor['tekrar']} tekrar atıldı"
        f"{haric_metni} → "
        f"{rapor['yazilan']} soru: {hedef}"
    )
    return rapor

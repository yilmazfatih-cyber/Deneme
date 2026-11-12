"""Ayarlar: ``ayarlar.toml`` okuma, ``--ayar a.b=c`` geçersiz kılmaları ve doğrulama.

Gömme (embedding) kararları kullanıcınındır: ``[gomme]`` bölümündeki her alan ``"KARAR_VER"`` olarak gelir
ve eğitim, tüm kararlar verilmeden başlamaz. Açıklamalar: ``GOMME_KARARLARI.md``.
"""

from __future__ import annotations

import hashlib
import json
import math
import sys
from dataclasses import asdict, dataclass, field, fields, replace
from pathlib import Path
from typing import Any

if sys.version_info >= (3, 11):
    import tomllib
else:  # pragma: no cover
    import tomli as tomllib

from .tokenizer import TokenizerAyarlari

KARAR_VER = "KARAR_VER"

KONUMLAR = ("rope", "ogrenilen", "sinus", "alibi", "yok")
GOMME_NORMLARI = ("yok", "layernorm", "rmsnorm")
MODEL_NORMLARI = ("rmsnorm", "layernorm")
MLP_TURLERI = ("swiglu", "gelu")
HASSASIYETLER = ("otomatik", "fp32", "bf16", "fp16")
KAYIP_TURLERI = ("tum", "cevap")

# Her gömme kararı: (alan, kısa açıklama, olası değerler)
GOMME_KARARLARI: list[tuple[str, str, str]] = [
    ("boyut", "Gömme boyutu (d_model): her token'ın vektör uzunluğu; modelin genişliği", "64'ün katı: 128, 256, 384, 512, 768 …"),
    ("konum", "Konum bilgisi nasıl verilecek", '"rope" | "ogrenilen" | "sinus" | "alibi" | "yok"'),
    ("cikis_baglama", "Giriş gömme tablosu çıkış katmanında da kullanılsın mı (weight tying)", "true | false"),
    ("faktor_boyutu", "ALBERT tarzı ayrıştırılmış gömme: tablo boyutu (0 = kapalı)", "0 ya da boyut'tan küçük bir sayı: 64, 128 …"),
    ("kategori_gommesi", "Token kategorisi vektörü eklensin mi (kök / ek / harf / noktalama …)", "true | false"),
    ("bicim_paylasimi", "Ses değişimli biçimler aynı satırı paylaşsın mı (lar/ler, kitap/kitab)", "true | false"),
    ("olcek", "Gömmeler √boyut ile çarpılsın mı (ilk Transformer makalesi)", "true | false"),
    ("norm", "Gömmeden hemen sonra normalleştirme", '"yok" | "layernorm" | "rmsnorm"'),
    ("baslatma_std", "Gömme tablosunun başlangıç standart sapması", '0.02 gibi bir sayı ya da "otomatik" (= 1/√boyut)'),
    ("dropout", "Gömme çıkışına dropout oranı", "0.0 – 0.3"),
]


class AyarHatasi(ValueError):
    """Kullanıcıya gösterilecek, Türkçe açıklamalı ayar hatası."""


@dataclass
class GommeAyarlari:
    boyut: Any = KARAR_VER
    konum: Any = KARAR_VER
    cikis_baglama: Any = KARAR_VER
    faktor_boyutu: Any = KARAR_VER
    kategori_gommesi: Any = KARAR_VER
    bicim_paylasimi: Any = KARAR_VER
    olcek: Any = KARAR_VER
    norm: Any = KARAR_VER
    baslatma_std: Any = KARAR_VER
    dropout: Any = KARAR_VER

    def eksikler(self) -> list[str]:
        return [f.name for f in fields(self) if getattr(self, f.name) == KARAR_VER]

    def std(self) -> float:
        if self.baslatma_std == "otomatik":
            return float(self.boyut) ** -0.5
        return float(self.baslatma_std)

    def ozet(self) -> str:
        """Dosya adına uygun, on kararın hepsini taşıyan özet: ``g384-rope-bagli-kat-s0.02-d0.1``."""
        if self.eksikler():
            return "gomme-eksik"
        parcalar = [f"g{self.boyut}", self.konum, "bagli" if self.cikis_baglama else "ayri"]
        if self.faktor_boyutu:
            parcalar.append(f"f{self.faktor_boyutu}")
        if self.kategori_gommesi:
            parcalar.append("kat")
        if self.bicim_paylasimi:
            parcalar.append("bicim")
        if self.olcek:
            parcalar.append("olcek")
        if self.norm != "yok":
            parcalar.append(self.norm)
        parcalar.append("soto" if self.baslatma_std == "otomatik" else f"s{float(self.baslatma_std):g}")
        parcalar.append(f"d{float(self.dropout):g}")
        return "-".join(parcalar)


@dataclass
class ModelAyarlari:
    katman: int = 6
    bas_boyutu: int = 64
    """Her dikkat başının boyutu; baş sayısı = gömme boyutu / bas_boyutu."""
    baglam: int = 512
    mlp: str = "swiglu"
    norm: str = "rmsnorm"
    dropout: float = 0.1

    def bas_sayisi(self, boyut: int) -> int:
        return boyut // self.bas_boyutu


@dataclass
class EgitimAyarlari:
    donem: float = 10.0
    """Verinin üzerinden kaç kez geçileceği (epoch). Adım sayısı veriden hesaplanır."""
    en_fazla_adim: int = 0
    """0 değilse ``donem``den önce bu adımda durur."""
    yigin: int = 32
    birikim: int = 1
    ogrenme_orani: float = 6e-4
    min_oran: float = 0.1
    """Kosinüs düşüşünün sonunda öğrenme oranı = ogrenme_orani × min_oran."""
    isinma_adimi: int = 200
    agirlik_azaltma: float = 0.1
    gradyan_kirpma: float = 1.0
    degerlendirme_her: int = 250
    degerlendirme_yigini: int = 20
    erken_durdurma: int = 8
    """Doğrulama kaybı bu kadar değerlendirme boyunca iyileşmezse durur (0 = kapalı)."""
    hassasiyet: str = "otomatik"
    """"otomatik" | "fp32" | "bf16" | "fp16" — otomatik: CUDA'da bf16 (destek yoksa fp16), diğerlerinde fp32."""
    derle: bool = False
    """torch.compile (yalnız CUDA'da anlamlı; ilk adım yavaştır)."""
    tohum: int = 1337
    kayip: str = "tum"
    """Yalnız MEB aşaması: "tum" (soru + cevabın tamamı) | "cevap" (yalnız cevap token'ları)."""
    tdk_karisim: float = 0.25
    """Yalnız MEB aşaması: yığınların bu oranı TDK derleminden gelir (unutmayı azaltır)."""


@dataclass
class Yollar:
    veri: str = "veri"
    ciktilar: str = "ciktilar"


@dataclass
class Ayarlar:
    gomme: GommeAyarlari = field(default_factory=GommeAyarlari)
    model: ModelAyarlari = field(default_factory=ModelAyarlari)
    tokenizer: TokenizerAyarlari = field(default_factory=TokenizerAyarlari)
    tdk: EgitimAyarlari = field(default_factory=EgitimAyarlari)
    meb: EgitimAyarlari = field(
        default_factory=lambda: EgitimAyarlari(
            donem=4.0, yigin=16, ogrenme_orani=2e-4, isinma_adimi=50, degerlendirme_her=100, erken_durdurma=6
        )
    )
    yollar: Yollar = field(default_factory=Yollar)
    deney: str = ""
    """Boşsa gömme kararlarından ve katman sayısından türetilir (``g384-rope-bagli-k6``)."""
    kok: Path = field(default_factory=Path.cwd)
    """Göreli yolların çözüldüğü klasör (ayarlar dosyasının bulunduğu klasör)."""

    # ---------------------------------------------------------------------------------------
    @property
    def veri_klasoru(self) -> Path:
        return (self.kok / self.yollar.veri).resolve()

    @property
    def cikti_klasoru(self) -> Path:
        return (self.kok / self.yollar.ciktilar).resolve()

    @property
    def deney_adi(self) -> str:
        """Boşsa kararlardan türetilir: on gömme kararı + katman + diğer model ayarlarının kısa özeti.

        Bir kararı değiştirmek yeni bir klasör açar; böylece eski deney ezilmez.
        """
        return self.deney or f"{self.gomme.ozet()}-k{self.model.katman}-m{ayar_imzasi(asdict(self.model))[:4]}"

    @property
    def deney_klasoru(self) -> Path:
        return self.cikti_klasoru / "deneyler" / self.deney_adi

    def sozluk(self) -> dict:
        d = asdict(self)
        d["kok"] = str(self.kok)
        return d


# --------------------------------------------------------------------------------------------
# Okuma ve geçersiz kılma
# --------------------------------------------------------------------------------------------

_BOLUMLER = {
    "gomme": GommeAyarlari,
    "model": ModelAyarlari,
    "tokenizer": TokenizerAyarlari,
    "yollar": Yollar,
}


def _deger_coz(ham: str) -> Any:
    """``--ayar`` değerini TOML olarak yorumlar; olmazsa düz metin kabul eder (``rope`` → "rope")."""
    try:
        return tomllib.loads(f"x = {ham}")["x"]
    except tomllib.TOMLDecodeError:
        return ham


def _bolum_uygula(nesne: Any, veriler: dict, yol: str) -> Any:
    gecerli = {f.name: f for f in fields(nesne)}
    degisim = {}
    for anahtar, deger in veriler.items():
        if anahtar not in gecerli:
            raise AyarHatasi(f"Bilinmeyen ayar: {yol}.{anahtar}. Geçerli alanlar: {', '.join(gecerli)}")
        degisim[anahtar] = deger
    return replace(nesne, **degisim)


def ayarlari_yukle(yol: Path | None = None, gecersiz_kilma: list[str] | None = None) -> Ayarlar:
    ayarlar = Ayarlar()
    ham: dict = {}
    if yol is not None:
        yol = Path(yol)
        if not yol.exists():
            raise AyarHatasi(f"Ayar dosyası bulunamadı: {yol}")
        ham = tomllib.loads(yol.read_text(encoding="utf-8"))
        ayarlar.kok = yol.resolve().parent
    for k in gecersiz_kilma or []:
        if "=" not in k:
            raise AyarHatasi(f"--ayar biçimi 'bolum.alan=deger' olmalı: {k!r}")
        anahtar, deger = k.split("=", 1)
        parcalar = anahtar.strip().split(".")
        hedef = ham
        for p in parcalar[:-1]:
            hedef = hedef.setdefault(p, {})
            if not isinstance(hedef, dict):
                raise AyarHatasi(f"--ayar {anahtar}: {p} bir bölüm değil")
        hedef[parcalar[-1]] = _deger_coz(deger.strip())

    for ad, sinif in _BOLUMLER.items():
        if ad in ham:
            setattr(ayarlar, ad, _bolum_uygula(getattr(ayarlar, ad) if hasattr(ayarlar, ad) else sinif(), ham.pop(ad), ad))
    egitim = ham.pop("egitim", {})
    for asama in ("tdk", "meb"):
        if asama in egitim:
            setattr(ayarlar, asama, _bolum_uygula(getattr(ayarlar, asama), egitim.pop(asama), f"egitim.{asama}"))
    if egitim:
        raise AyarHatasi(f"Bilinmeyen eğitim bölümü: {', '.join(egitim)} (geçerli: egitim.tdk, egitim.meb)")
    if "deney" in ham:
        ayarlar.deney = str(ham.pop("deney"))
    if ham:
        raise AyarHatasi(f"Bilinmeyen ayar bölümü: {', '.join(ham)}")
    return ayarlar


# --------------------------------------------------------------------------------------------
# Doğrulama
# --------------------------------------------------------------------------------------------


def eksik_karar_mesaji(eksikler: list[str]) -> str:
    satirlar = [
        "Gömme kararları henüz verilmedi. Bu kararlar sana bırakıldı; ayarlar.toml dosyasının [gomme] bölümünü",
        "doldur (ya da deneme için --ayar gomme.<alan>=<değer> kullan). Ayrıntılar: GOMME_KARARLARI.md",
        "",
    ]
    for ad, aciklama, secenek in GOMME_KARARLARI:
        if ad in eksikler:
            satirlar.append(f"  • gomme.{ad}: {aciklama}\n      seçenekler: {secenek}")
    return "\n".join(satirlar)


def _bool(ad: str, deger: Any) -> bool:
    if isinstance(deger, bool):
        return deger
    raise AyarHatasi(f"gomme.{ad} true ya da false olmalı (şu an: {deger!r})")


def _pozitif_tamsayi(x: Any) -> bool:
    return isinstance(x, int) and not isinstance(x, bool) and x > 0


def _sayi(x: Any) -> bool:
    return isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(float(x))


def modeli_dogrula(m: ModelAyarlari) -> list[str]:
    hatalar: list[str] = []
    for ad in ("katman", "bas_boyutu", "baglam"):
        if not _pozitif_tamsayi(getattr(m, ad)):
            hatalar.append(f"model.{ad} pozitif bir tam sayı olmalı (şu an: {getattr(m, ad)!r})")
    if m.mlp not in MLP_TURLERI:
        hatalar.append(f"model.mlp şunlardan biri olmalı: {', '.join(MLP_TURLERI)} (şu an: {m.mlp!r})")
    if m.norm not in MODEL_NORMLARI:
        hatalar.append(f"model.norm şunlardan biri olmalı: {', '.join(MODEL_NORMLARI)} (şu an: {m.norm!r})")
    if not _sayi(m.dropout) or not 0 <= float(m.dropout) < 1:
        hatalar.append(f"model.dropout 0 ile 1 arasında olmalı (şu an: {m.dropout!r})")
    return hatalar


def gommeyi_dogrula(g: GommeAyarlari, m: ModelAyarlari) -> GommeAyarlari:
    """Tüm kararlar verilmiş ve tutarlı mı (model ayarları dahil)? Değilse açıklamalı ``AyarHatasi``."""
    eksikler = g.eksikler()
    if eksikler:
        raise AyarHatasi(eksik_karar_mesaji(eksikler))
    hatalar: list[str] = modeli_dogrula(m)
    bas_gecerli = _pozitif_tamsayi(m.bas_boyutu)
    if not _pozitif_tamsayi(g.boyut):
        hatalar.append(f"gomme.boyut pozitif bir tam sayı olmalı (şu an: {g.boyut!r})")
    elif bas_gecerli and g.boyut % m.bas_boyutu:
        alt = g.boyut - g.boyut % m.bas_boyutu
        oneriler = f"{alt} ya da {alt + m.bas_boyutu}" if alt else f"{m.bas_boyutu}"
        hatalar.append(
            f"gomme.boyut ({g.boyut}) model.bas_boyutu ({m.bas_boyutu}) değerinin katı olmalı; örn. {oneriler}"
        )
    if g.konum not in KONUMLAR:
        hatalar.append(f"gomme.konum şunlardan biri olmalı: {', '.join(KONUMLAR)} (şu an: {g.konum!r})")
    if g.konum == "rope" and bas_gecerli and m.bas_boyutu % 2:
        hatalar.append("RoPE çift bas_boyutu ister (model.bas_boyutu)")
    if g.norm not in GOMME_NORMLARI:
        hatalar.append(f"gomme.norm şunlardan biri olmalı: {', '.join(GOMME_NORMLARI)} (şu an: {g.norm!r})")
    for ad in ("cikis_baglama", "kategori_gommesi", "bicim_paylasimi", "olcek"):
        try:
            _bool(ad, getattr(g, ad))
        except AyarHatasi as e:
            hatalar.append(str(e))
    f = g.faktor_boyutu
    if not isinstance(f, int) or isinstance(f, bool) or f < 0:
        hatalar.append(f"gomme.faktor_boyutu 0 ya da pozitif tam sayı olmalı (şu an: {f!r})")
    elif isinstance(g.boyut, int) and f and f >= g.boyut:
        hatalar.append(f"gomme.faktor_boyutu ({f}) gomme.boyut'tan ({g.boyut}) küçük olmalı; 0 yazarsan kapanır")
    s = g.baslatma_std
    if s != "otomatik" and (not _sayi(s) or not 0 < float(s) < 1):
        hatalar.append(f'gomme.baslatma_std 0 ile 1 arasında bir sayı ya da "otomatik" olmalı (şu an: {s!r})')
    d = g.dropout
    if not _sayi(d) or not 0 <= float(d) < 0.9:
        hatalar.append(f"gomme.dropout 0 ile 0.9 arasında olmalı (şu an: {d!r})")
    if g.bicim_paylasimi is True and g.cikis_baglama is True:
        hatalar.append(
            "bicim_paylasimi ve cikis_baglama birlikte açık olamaz: paylaşımda 'lar' ile 'ler' aynı satırı kullanır; "
            "çıkış da bu tabloyu kullanırsa model hangisini yazacağını (ünlü uyumu) ayırt edemez. Birini kapat."
        )
    if hatalar:
        raise AyarHatasi("Gömme ayarlarında sorun var:\n  • " + "\n  • ".join(hatalar))
    return g


def egitimi_dogrula(ea: EgitimAyarlari, asama: str) -> EgitimAyarlari:
    """``egitim.<aşama>`` ayarlarını denetler; yanlış yazılmış bir hassasiyet sessizce fp16'ya dönmesin."""
    ad = f"egitim.{asama}"
    hatalar: list[str] = []
    for alan in ("yigin", "birikim", "degerlendirme_her", "degerlendirme_yigini"):
        if not _pozitif_tamsayi(getattr(ea, alan)):
            hatalar.append(f"{ad}.{alan} pozitif bir tam sayı olmalı (şu an: {getattr(ea, alan)!r})")
    for alan in ("en_fazla_adim", "isinma_adimi", "erken_durdurma"):
        x = getattr(ea, alan)
        if not (isinstance(x, int) and not isinstance(x, bool) and x >= 0):
            hatalar.append(f"{ad}.{alan} 0 ya da pozitif tam sayı olmalı (şu an: {x!r})")
    for alan in ("donem", "ogrenme_orani"):
        x = getattr(ea, alan)
        if not _sayi(x) or float(x) <= 0:
            hatalar.append(f"{ad}.{alan} pozitif bir sayı olmalı (şu an: {x!r})")
    for alan, ust in (("min_oran", 1.0), ("tdk_karisim", 1.0)):
        x = getattr(ea, alan)
        if not _sayi(x) or not 0 <= float(x) < ust + (1e-9 if alan == "min_oran" else 0):
            hatalar.append(f"{ad}.{alan} 0 ile {ust:g} arasında olmalı (şu an: {x!r})")
    for alan in ("agirlik_azaltma", "gradyan_kirpma"):
        x = getattr(ea, alan)
        if not _sayi(x) or float(x) < 0:
            hatalar.append(f"{ad}.{alan} 0 ya da pozitif bir sayı olmalı (şu an: {x!r})")
    if ea.hassasiyet not in HASSASIYETLER:
        hatalar.append(f"{ad}.hassasiyet şunlardan biri olmalı: {', '.join(HASSASIYETLER)} (şu an: {ea.hassasiyet!r})")
    if ea.kayip not in KAYIP_TURLERI:
        hatalar.append(f"{ad}.kayip şunlardan biri olmalı: {', '.join(KAYIP_TURLERI)} (şu an: {ea.kayip!r})")
    if not isinstance(ea.derle, bool):
        hatalar.append(f"{ad}.derle true ya da false olmalı (şu an: {ea.derle!r})")
    if hatalar:
        raise AyarHatasi("Eğitim ayarlarında sorun var:\n  • " + "\n  • ".join(hatalar))
    return ea


def gomme_uyarilari(g: GommeAyarlari) -> list[str]:
    """Hata olmayan ama sonucu etkileyen etkileşimler (kararı yine sen verirsin). Geçersiz ayarlarda boş döner;
    hatayı ``gommeyi_dogrula`` açıklar."""
    if g.eksikler():
        return []
    try:
        gommeyi_dogrula(g, ModelAyarlari())
    except AyarHatasi:
        return []
    uyari: list[str] = []
    std = g.std()
    if g.konum == "sinus" and not g.olcek:
        uyari.append(
            f"Sinüs konum vektörlerinin bileşenlerinin RMS'i ~0,71, token gömmeleri ~{std:g}: başlangıçta konum sinyali "
            f"token sinyalinden ~{1 / (std * math.sqrt(2)):.0f} kat güçlü. İlk Transformer bu yüzden gömmeleri √boyut ile "
            "çarpar (olcek=true)."
        )
    if g.olcek and g.norm != "yok":
        if g.konum in ("rope", "alibi", "yok") and not g.kategori_gommesi:
            uyari.append(
                "olcek=true iken gömme normu açık ve aradaki toplama yok: norm vektörü yeniden ölçeklediği için "
                "√boyut çarpanı neredeyse etkisiz kalır."
            )
        else:
            uyari.append(
                "olcek=true ve gömme normu birlikte: norm genel ölçeği siler, ama √boyut çarpanı token vektörünün "
                "konum/kategori vektörüne oranını belirlemeye devam eder."
            )
    if g.konum in ("ogrenilen", "sinus"):
        uyari.append(f"konum={g.konum}: model.baglam eğitimden sonra büyütülemez (konum tablosu bu uzunlukta sabittir).")
    if g.olcek and g.cikis_baglama and g.norm == "yok":
        uyari.append(
            "olcek=true + cikis_baglama=true: giriş √boyut ile büyür, çıkış aynı tabloyu ölçeksiz kullanır; "
            "baslatma_std seçimini buna göre yap (ör. \"otomatik\")."
        )
    if float(g.dropout) > 0.2:
        uyari.append(f"Gömme dropout'u ({g.dropout}) yüksek; küçük veride faydalı olabilir ama öğrenmeyi yavaşlatır.")
    return uyari


def ayar_imzasi(veri: dict) -> str:
    return hashlib.sha256(json.dumps(veri, sort_keys=True, default=str).encode()).hexdigest()[:12]

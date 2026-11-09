"""Etiketleme istemi ve çıktı şeması. Şema taksonomiden üretilir: her eksen `enum` ile kapalıdır, böylece model
sözlük dışı değer üretemez (yapılandırılmış çıktı, `output_config.format`). Değerler taksonomi anahtarlarıyla birebir.
"""

from __future__ import annotations

import json
from pathlib import Path

KOK = Path(__file__).resolve().parents[2]
TAKSONOMI_DOSYASI = KOK / "content" / "taksonomi.json"

# NitelikKaydi alanlarıyla aynı sıra; taksonomide olup burada olmayan eksen şemaya girmez.
ETIKET_EKSENLERI = (
    "parca_konumu",
    "kategori",
    "siluet",
    "boy",
    "yaka",
    "kol",
    "kumas_gorunumu",
    "desen",
    "detay",
    "doku",
    "kapanma",
    "renk_sayisi",
)

_EKSEN_ACIKLAMA = {
    "parca_konumu": "Parçanın vücuttaki yeri: ust, alt, dis (ceket/mont/kaban), tam (elbise/tulum), aksesuar.",
    "kategori": "Ürün kategorisi; kadın/erkek ayrımı giysinin kesiminden, kişiden değil.",
    "siluet": "Parçanın genel formu.",
    "boy": "Parçanın bittiği yer.",
    "yaka": "Yaka tipi; yakası olmayan parça (etek, pantolon) için bilinmiyor.",
    "kol": "Kol tipi; kolu olmayan parça (etek, pantolon) için bilinmiyor.",
    "kumas_gorunumu": "Kumaşın görünüşü (lif analizi değil, görünüm).",
    "desen": "Yüzey deseni.",
    "detay": "En belirgin tek tasarım detayı; yoksa yok.",
    "doku": "Yüzey dokusu.",
    "kapanma": "Görünür kapanma; görünmüyorsa bilinmiyor.",
    "renk_sayisi": "Parçadaki belirgin renk sayısı: tek, iki, cok.",
}


def taksonomi_oku(yol: Path = TAKSONOMI_DOSYASI) -> dict:
    return json.loads(yol.read_text("utf-8"))


def eksenler(taksonomi: dict) -> dict[str, list[str]]:
    """Taksonomi dosyası (`{"eksenler": {...}}`) ya da doğrudan eksen sözlüğü → etiketlenen eksenler."""
    tum = taksonomi.get("eksenler", taksonomi)
    return {e: list(tum[e]) for e in ETIKET_EKSENLERI if e in tum}


def arac_semasi(taksonomi: dict) -> dict:
    """Yapılandırılmış çıktı için JSON şeması: `{"parcalar": [ {eksen: enum, ...}, ... ]}`.

    Aynı şema `output_config={"format": {"type": "json_schema", "schema": ...}}` ile ya da `strict: true` bir aracın
    `input_schema`'sı olarak kullanılabilir. Her nesne `additionalProperties: false` ve bütün eksenler zorunlu.
    """
    ex = eksenler(taksonomi)
    parca = {
        "type": "object",
        "properties": {
            e: {"type": "string", "enum": d, "description": _EKSEN_ACIKLAMA.get(e, "")} for e, d in ex.items()
        },
        "required": list(ex),
        "additionalProperties": False,
    }
    return {
        "type": "object",
        "properties": {
            "parcalar": {
                "type": "array",
                "description": "Karede görünen her giysi parçası ayrı nesne; görünür parça yoksa boş liste.",
                "items": parca,
            }
        },
        "required": ["parcalar"],
        "additionalProperties": False,
    }


def sistem_istemi(taksonomi: dict) -> str:
    """Sistem istemi. Kişi değil yalnız giysi tarif edilir; sözlük satır satır verilir."""
    ex = eksenler(taksonomi)
    sozluk = "\n".join(f"- {e}: {', '.join(d)}" for e, d in ex.items())
    return (
        "Sen bir moda ürün etiketleyicisisin. Görevin bir defile fotoğrafındaki GİYSİLERİ kapalı bir sözlükle "
        "etiketlemek.\n\n"
        "Kurallar:\n"
        "1. Yalnız giysi ve aksesuarı etiketle. Kişiyi tarif etme: yüz, ten, saç, beden, yaş, cinsiyet, kimlik, "
        "duygu ya da poz hakkında hiçbir şey çıkarma ve yazma.\n"
        "2. Karede birden çok parça varsa (üst, alt, dış giyim, elbise/tulum, aksesuar) her parça ayrı nesne olur. "
        "Elbise ve tulum tek parçadır: parca_konumu = tam. Çanta, ayakkabı, şapka, kemer gibi öğeler aksesuar.\n"
        "3. Arka plandaki diğer kişileri ve seyircileri yok say; yalnız öndeki ana look'u etiketle.\n"
        "4. Her eksende yalnız aşağıdaki sözlük değerlerinden birini seç. Emin değilsen ya da eksen o parçaya "
        "uymuyorsa (ör. pantolonda yaka) 'bilinmiyor' seç; tahmin uydurma.\n"
        "5. kategori kadın/erkek ayrımını giysinin kesimine ve koleksiyon bağlamına göre yap, kişiye göre değil; "
        "emin değilsen bilinmiyor.\n"
        "6. kumas_gorunumu görünüşe göredir: parlak akışkan yüzey ipeksi ya da saten, örgü triko, vb.\n\n"
        f"Sözlük (eksen: değerler):\n{sozluk}\n\n"
        'Çıktı yalnız şemaya uyan JSON: {"parcalar": [...]}. Görünür giysi yoksa parcalar boş liste.'
    )


KULLANICI_METNI = "Bu defile karesindeki giysi parçalarını sözlükle etiketle."

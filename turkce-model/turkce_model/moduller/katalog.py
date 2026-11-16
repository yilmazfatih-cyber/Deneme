"""DeepSeek'in yayımladığı küçük (kişisel bilgisayarda çalışabilen) açık modellerin kataloğu.

Parametre sayıları, dosya boyutları ve lisanslar Hugging Face API'sinden alınmıştır (deepseek-ai, 2026-11-16);
API'nin parametre sayısı bildirmediği depolarda sayı dosya boyutundan yaklaşık hesaplanmıştır.
Boyut, ağırlık dosyalarının toplamıdır (çoğu fp16/bf16); nicemlenmiş (GGUF) sürümler bunun yarısı kadar olabilir.

``durum``:

* ``"modul"``   — bu projede bir role bağlanabilir (``ayarlar.toml`` → ``[moduller.<rol>] model = …``).
* ``"katalog"`` — yalnız bilgi: neden bağlanmadığı ``aciklama``da yazılıdır.
"""

from __future__ import annotations

from dataclasses import dataclass

ROLLER = {
    "ocr": "Görüntü → metin (taranmış kitapçık, soru fotoğrafı)",
    "metin": "Metin modeli (aynı sorularda kıyas satırı)",
    "gorsel": "Görüntü anlama / üretme",
    "kod": "Kod yazma",
    "matematik": "Matematik ve ispat",
    "hizlandirma": "Başka bir modele takılan hızlandırma modülü",
    "uzman": "Büyük bir modelin göreve özel uzman ayarı",
}


@dataclass(frozen=True)
class ModulBilgisi:
    ad: str
    """Hugging Face deposu (``deepseek-ai/<ad>``)."""
    rol: str
    parametre: float
    """Milyar parametre (Hugging Face'in bildirdiği toplam)."""
    boyut_gb: float
    lisans: str
    yayin: str
    durum: str
    aciklama: str
    ollama: str = ""
    """Ollama kütüphanesindeki etiket (varsa). Kurmadan önce ``ollama list`` / kütüphane sayfasıyla doğrula."""

    @property
    def hf(self) -> str:
        return f"deepseek-ai/{self.ad}"


_DSPEC = (
    "DeepSpec taslak modeli (spekülatif çözme): yalnız eğitildiği hedef modelin ({hedef}) üretimini hızlandırır. "
    "Hedef modelin gizli durumlarına bağlıdır; başka bir modele, dolayısıyla bu projenin sıfırdan modeline "
    "takılamaz. Depoda lisans bilgisi yok."
)

KATALOG: tuple[ModulBilgisi, ...] = (
    # ---- OCR -------------------------------------------------------------------------------------
    ModulBilgisi(
        "DeepSeek-OCR", "ocr", 3.34, 6.7, "MIT", "2025-10", "modul",
        "Belge görüntüsünü düz metne ya da Markdown'a çevirir; çok dilli. Ollama kütüphanesinde var; llama.cpp "
        "(ggml-org/DeepSeek-OCR-GGUF, --chat-template deepseek-ocr) ve vLLM resmî olarak destekler. "
        "İstemler: \"Free OCR.\" (düz metin), \"<|grounding|>Convert the document to markdown.\" (düzenli).",
        ollama="deepseek-ocr",
    ),
    ModulBilgisi(
        "DeepSeek-OCR-2", "ocr", 3.39, 6.8, "Apache-2.0", "2026-01", "modul",
        "OCR'ın ikinci sürümü (yeni görsel kodlayıcı, okuma sırası daha iyi). Resmî yol NVIDIA ekran kartı + "
        "transformers ya da vLLM; llama.cpp de destekler. Ollama'nın resmî kütüphanesinde görünmüyor (2026-11): "
        "topluluk GGUF depolarından çekilebilir (ollama run hf.co/<kullanıcı>/<depo>), kararlılığı depoya göre "
        "değişir.",
    ),
    # ---- metin -----------------------------------------------------------------------------------
    ModulBilgisi(
        "DeepSeek-R1-Distill-Qwen-1.5B", "metin", 1.78, 3.6, "MIT", "2025-01", "modul",
        "R1'in akıl yürütmesi Qwen2.5-Math-1.5B'ye damıtılmış. En küçük DeepSeek metin modeli; CPU'da çalışır. "
        "Cevaptan önce <think> ile düşünür. Türkçesi sınırlıdır.",
        ollama="deepseek-r1:1.5b",
    ),
    ModulBilgisi(
        "DeepSeek-R1-Distill-Qwen-7B", "metin", 7.62, 15.2, "MIT", "2025-01", "modul",
        "Aynı damıtmanın 7B sürümü; ~8 GB bellek (nicemlenmiş) ister.",
        ollama="deepseek-r1:7b",
    ),
    ModulBilgisi(
        "DeepSeek-R1-Distill-Llama-8B", "metin", 8.03, 16.1, "MIT", "2025-01", "modul",
        "R1'in Llama-3.1-8B'ye damıtılmış sürümü.",
    ),
    ModulBilgisi(
        "DeepSeek-R1-0528-Qwen3-8B", "metin", 8.19, 16.4, "MIT", "2025-05", "modul",
        "R1-0528'in Qwen3-8B'ye damıtılmış sürümü; küçük DeepSeek metin modellerinin en yenisi.",
        ollama="deepseek-r1:8b",
    ),
    ModulBilgisi(
        "deepseek-llm-7b-chat", "metin", 7.0, 13.8, "DeepSeek lisansı", "2023-11", "katalog",
        "İlk nesil sohbet modeli (İngilizce/Çince). R1 damıtmaları varken bir yararı yok.",
    ),
    # ---- görsel ----------------------------------------------------------------------------------
    ModulBilgisi(
        "Janus-Pro-1B", "gorsel", 2.1, 4.2, "MIT (kod) + DeepSeek model lisansı", "2025-01", "katalog",
        "Görüntü anlama ve üretme. Yerel sunucularda hazır değil (özel kod + ekran kartı ister). Bu projede "
        "görüntüden gereken tek şey metni okumak; onu OCR modülü yapıyor.",
    ),
    ModulBilgisi(
        "Janus-1.3B", "gorsel", 2.09, 4.2, "MIT (kod) + DeepSeek model lisansı", "2024-10", "katalog",
        "Janus-Pro'nun öncülü; aynı nedenle bağlanmadı.",
    ),
    ModulBilgisi(
        "JanusFlow-1.3B", "gorsel", 2.05, 4.1, "MIT (kod) + DeepSeek model lisansı", "2024-11", "katalog",
        "Görüntü üretimi ağırlıklı; dil modeli boru hattında rolü yok.",
    ),
    ModulBilgisi(
        "deepseek-vl2-tiny", "gorsel", 3.37, 6.7, "DeepSeek lisansı", "2024-12", "katalog",
        "Görüntü + metin sohbeti. Özel kod ister; okuma işini OCR modülü daha iyi yapar.",
    ),
    ModulBilgisi(
        "deepseek-vl-1.3b-chat", "gorsel", 1.98, 4.0, "DeepSeek lisansı", "2024-03", "katalog",
        "VL2'nin öncülü; aynı nedenle bağlanmadı.",
    ),
    # ---- kod / matematik -------------------------------------------------------------------------
    ModulBilgisi(
        "deepseek-coder-1.3b-instruct", "kod", 1.35, 5.4, "DeepSeek lisansı", "2023-10", "katalog",
        "Kod yazma modeli. Türkçe dil modeli eğitiminde bir rolü yok.",
    ),
    ModulBilgisi(
        "deepseek-coder-6.7b-instruct", "kod", 6.74, 27.0, "DeepSeek lisansı", "2023-10", "katalog",
        "Kod yazma modeli (büyük sürüm); aynı nedenle bağlanmadı.",
    ),
    ModulBilgisi(
        "deepseek-math-7b-instruct", "matematik", 7.0, 13.8, "DeepSeek lisansı", "2024-02", "katalog",
        "Matematik problemi çözer (İngilizce/Çince). Türkçe soru çözmede sınanmadı; kıyas için R1 damıtmaları "
        "daha uygun.",
    ),
    ModulBilgisi(
        "DeepSeek-Prover-V2-7B", "matematik", 6.91, 13.8, "belirtilmemiş", "2025-04", "katalog",
        "Lean 4 ile biçimsel ispat üretir; bu projeyle ilgisi yok.",
    ),
    # ---- hızlandırma modülleri (DeepSpec) ---------------------------------------------------------
    ModulBilgisi(
        "dspark_qwen3_4b_block7", "hizlandirma", 1.39, 2.8, "belirtilmemiş", "2026-06", "katalog",
        _DSPEC.format(hedef="Qwen3-4B"),
    ),
    ModulBilgisi(
        "dflash_qwen3_4b_block7", "hizlandirma", 1.32, 2.6, "belirtilmemiş", "2026-06", "katalog",
        _DSPEC.format(hedef="Qwen3-4B"),
    ),
    ModulBilgisi(
        "eagle3_qwen3_4b_ttt7", "hizlandirma", 0.93, 1.9, "belirtilmemiş", "2026-06", "katalog",
        _DSPEC.format(hedef="Qwen3-4B"),
    ),
    ModulBilgisi(
        "dspark_qwen3_8b_block7", "hizlandirma", 2.37, 4.7, "belirtilmemiş", "2026-06", "katalog",
        _DSPEC.format(hedef="Qwen3-8B") + " Aynı ailenin Qwen3-14B ve Gemma-4-12B için sürümleri de var.",
    ),
    # ---- uzman ayarları ---------------------------------------------------------------------------
    ModulBilgisi(
        "ESFT-gate-translation-lite", "uzman", 1.06, 2.1, "belirtilmemiş", "2024-07", "katalog",
        "DeepSeek-V2-Lite (15,7 milyar parametre) için göreve özel uzman ayarı (çeviri, özet, hukuk, kod, "
        "matematik, niyet sürümleri var). Tek başına model değildir; V2-Lite ile birlikte çalışır.",
    ),
)

BUYUK_MODELLER = (
    "DeepSeek-V4-Flash (284 milyar parametre, ~160 GB), DeepSeek-V4-Pro (1,6 trilyon) ve DeepSeek-V4.1-Flash "
    "(763 milyar, ~510 GB) kişisel bilgisayarda çalışmaz; kataloğa alınmadı."
)


def modul_bul(ad: str) -> ModulBilgisi | None:
    """Depo adı (``DeepSeek-OCR``), tam ad (``deepseek-ai/DeepSeek-OCR``) ya da Ollama etiketiyle arar.

    Etiketin sürüm eki farklıysa (``deepseek-ocr:3b``) ve taban ad katalogda tek bir modele aitse o döner.
    """
    aranan = ad.strip().lower().removeprefix("deepseek-ai/")
    if not aranan:
        return None
    for m in KATALOG:
        if aranan in (m.ad.lower(), m.ollama.lower()):
            return m
    taban = aranan.split(":")[0]
    adaylar = [m for m in KATALOG if m.ollama and m.ollama.lower().split(":")[0] == taban]
    return adaylar[0] if len(adaylar) == 1 else None


def rolun_modelleri(rol: str) -> list[ModulBilgisi]:
    return [m for m in KATALOG if m.rol == rol and m.durum == "modul"]
